// Сквозная проверка Этапа 1 в Chromium (телефонная ширина).
// Облачное хранилище артефакта подменяется фейком в Node, чтобы проверить синхронизацию и восстановление.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const server = http.createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split("?")[0].split("#")[0]));
  if (!p.startsWith(root) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": extname(p) === ".js" ? "text/javascript" : "text/html; charset=utf-8" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const URL = `http://127.0.0.1:${server.address().port}/local.html`;

// ── Фейковое облако ─────────────────────────────
const cloud = new Map(); // path -> data
const cloudApi = {
  get: (path) => (cloud.has(path) ? JSON.parse(cloud.get(path)) : null),
  set: (path, data) => {
    cloud.set(path, JSON.stringify(data));
    return true;
  },
  query: (col, filters, order, limit) => {
    let docs = [...cloud.entries()]
      .filter(([p]) => p.startsWith(col + "/") && !p.slice(col.length + 1).includes("/"))
      .map(([p, d]) => ({ id: p.slice(col.length + 1), data: JSON.parse(d) }));
    for (const [f, op, v] of filters) docs = docs.filter((d) => (op === ">=" ? d.data[f] >= v : op === ">" ? d.data[f] > v : true));
    if (order) docs.sort((a, b) => (a.data[order[0]] - b.data[order[0]]) * (order[1] === "desc" ? -1 : 1));
    return docs.slice(0, limit ?? 1000);
  },
};

const fakeClaude = () => {
  const mkDoc = (path) => ({
    get: async () => {
      const d = await window.__cloudGet(path);
      return { id: path.split("/").pop(), exists: !!d, data: () => d ?? undefined };
    },
    set: async (data) => void (await window.__cloudSet(path, data)),
    collection: (sub) => mkCol(path + "/" + sub),
  });
  const mkQuery = (col, filters = [], order = null, lim = null) => ({
    where: (f, op, v) => mkQuery(col, [...filters, [f, op, v]], order, lim),
    orderBy: (f, dir) => mkQuery(col, filters, [f, dir ?? "asc"], lim),
    limit: (n) => mkQuery(col, filters, order, n),
    get: async () => {
      const docs = await window.__cloudQuery(col, filters, order, lim);
      return { size: docs.length, docs: docs.map((d) => ({ id: d.id, exists: true, data: () => d.data })) };
    },
  });
  const mkCol = (col) => ({ ...mkQuery(col), doc: (id) => mkDoc(col + "/" + id) });
  window.claude = {
    use: async (name) => {
      if (name === "db") return { doc: mkDoc, collection: mkCol };
      if (name === "user") return { id: async () => "u_test" };
      return null;
    },
  };
};

const browser = await chromium.launch();
const errors = [];
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
};

async function newPage(withCloud) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "ru-RU" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  if (withCloud) {
    await page.exposeFunction("__cloudGet", cloudApi.get);
    await page.exposeFunction("__cloudSet", cloudApi.set);
    await page.exposeFunction("__cloudQuery", cloudApi.query);
    await page.addInitScript(fakeClaude);
  }
  return { ctx, page };
}
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, name + ".png"), fullPage: false });

try {
  const { ctx, page } = await newPage(true);
  await page.goto(URL);

  // ── Онбординг ──
  await page.getByText("Тело и опыт").waitFor();
  await shot(page, "01-onboarding");
  await page.fill("#height", "185");
  await page.fill("#weight", "79");
  await page.locator("#weight").blur();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Спина" }).click();
  await page.getByRole("button", { name: "Грудь" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("radio", { name: "Правая" }).click();
  await page.getByRole("button", { name: "Добавить зону" }).click();
  await page.getByLabel("Описание").fill("щелчки");
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.fill("#benchKg", "70");
  await page.fill("#benchReps", "8");
  await page.locator("#benchReps").blur();
  await page.getByRole("button", { name: "Дальше" }).click();
  const firstRec = await page.locator(".card h3").first().textContent();
  check("рекомендация для профиля", firstRec === "Рельеф: спина и грудь", firstRec);
  await shot(page, "02-recommend");
  await page.getByRole("button", { name: "Выбрать" }).first().click();

  // ── Сегодня ──
  await page.getByText("Сегодня: A").waitFor();
  await shot(page, "03-today");

  // ── Тренировка A ──
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  await page.locator(".workout").waitFor();
  const bench = page.locator("article", { has: page.getByRole("button", { name: "Жим штанги лёжа" }) });
  const w1 = await bench.locator(".set-input").first().inputValue();
  check("стартовый вес жима из профиля", w1 === "70", w1);
  await bench.getByRole("button", { name: "Подход выполнен" }).first().click();
  await page.locator(".timer-bar").waitFor();
  check("таймер отдыха запустился", await page.locator(".timer-value").isVisible());
  await bench.getByRole("button", { name: "Подход выполнен" }).first().click();
  const row = page.locator("article", { has: page.getByRole("button", { name: "Тяга гантели одной рукой" }) });
  await row.locator(".set-input").nth(0).fill("24");
  await row.locator(".set-input").nth(1).fill("10");
  await row.locator(".set-input").nth(2).fill("11");
  await row.getByRole("button", { name: "Подход выполнен" }).first().click();
  await bench.scrollIntoViewIfNeeded();
  await shot(page, "04-workout");

  // Перезагрузка посреди тренировки: всё должно сохраниться.
  await page.reload();
  await page.getByText("Тренировка идёт").waitFor();
  await page.getByRole("button", { name: "Продолжить" }).click();
  const doneAfterReload = await page.locator(".set-row.done").count();
  check("подходы пережили перезагрузку", doneAfterReload === 3, String(doneAfterReload));

  await page.getByRole("button", { name: "Завершить" }).first().click();
  await page.locator(".sheet").getByRole("button", { name: "Завершить" }).click();
  await page.getByText("Тренировка завершена").waitFor();
  await shot(page, "05-summary");
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByText("Сегодня уже потренировался").waitFor();
  check("следующая тренировка — B", (await page.locator(".card.accent h2").first().textContent()).startsWith("B"));

  // ── Повтор A: подсказка «прошлый раз» и рекорд ──
  await page.getByRole("button", { name: "План" }).click();
  await page.getByRole("tab", { name: /^A/ }).click();
  await page.getByRole("button", { name: "Начать «A»" }).click();
  const bench2 = page.locator("article", { has: page.getByRole("button", { name: "Жим штанги лёжа" }) });
  const hint = await bench2.locator(".last-time").textContent();
  check("подсказка прошлого раза", /70×6 · 70×6/.test(hint), hint);
  await bench2.locator(".set-input").first().fill("72,5");
  await bench2.getByRole("button", { name: "Подход выполнен" }).first().click();
  await page.getByRole("button", { name: "Завершить" }).first().click();
  await page.locator(".sheet").getByRole("button", { name: "Завершить" }).click();
  await page.getByText("Новые рекорды").waitFor();
  const prText = await page.locator(".workout .list").first().textContent();
  check("рекорд по весу в жиме", /Жим штанги лёжа/.test(prText) && /72,5/.test(prText), prText);
  await page.getByRole("button", { name: "Готово" }).click();

  // ── Прогресс и библиотека ──
  await page.getByRole("button", { name: "Прогресс" }).click();
  const histCount = await page.locator(".list-item .title.ellipsis").count();
  check("история: 2 тренировки", histCount === 2, String(histCount));
  await shot(page, "06-progress");
  await page.getByRole("button", { name: "Тренировки" }).click();
  await page.getByRole("button", { name: "Упражнения" }).click();
  await page.fill("#lib-search", "подтяг");
  const found = await page.locator(".list-item .title").allTextContents();
  check("поиск в библиотеке", found.some((t) => t.includes("Подтягивания")), found.slice(0, 3).join(", "));
  await page.getByRole("button", { name: /Подтягивания прямым хватом/ }).click();
  await page.getByText("Типичные ошибки").waitFor();
  check("предупреждение о плече в карточке", await page.getByText(/Плечо \(левое\)/).isVisible());
  await shot(page, "07-exercise");

  // Системная «Назад» закрывает экран внутри приложения.
  await page.goBack();
  await page.waitForTimeout(400);
  check("кнопка «Назад» возвращает к списку", await page.locator("#lib-search").isVisible());

  // ── Синхронизация ──
  await page.waitForTimeout(2500);
  const cloudSessions = [...cloud.keys()].filter((k) => k.includes("/sessions/")).length;
  check("в облаке 2 тренировки и профиль", cloudSessions === 2 && cloud.has("data/users/u_test/fitness"), `${cloudSessions} тренировок`);
  await ctx.close();

  // Новое «устройство» без локальных данных: всё должно восстановиться из облака.
  const second = await newPage(true);
  await second.page.goto(URL);
  await second.page.getByRole("button", { name: "Прогресс" }).waitFor({ timeout: 8000 });
  await second.page.getByRole("button", { name: "Прогресс" }).click();
  const restored = await second.page.locator(".list-item .title.ellipsis").count();
  check("восстановление из облака на чистом устройстве", restored === 2, String(restored));
  await second.ctx.close();

  // Без облака приложение работает локально.
  const offline = await newPage(false);
  await offline.page.goto(URL);
  await offline.page.getByText("Тело и опыт").waitFor();
  check("без облака открывается онбординг (локальный режим)", true);
  await offline.ctx.close();
} catch (e) {
  check("сценарий выполнен без исключений", false, e.message.split("\n")[0]);
} finally {
  await browser.close();
  server.close();
}

check("нет ошибок в консоли", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(results.join("\n"));
