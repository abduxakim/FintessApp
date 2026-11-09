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
      if (name === "downloads") return { save: async ({ filename, data }) => ((window.__downloads ??= []).push({ filename, data: String(data) }), { status: "saved" }) };
      if (name === "sample") {
        // Имитация Claude: заготовленные ответы для фото тренажёра и тренировки по запросу.
        const fn = async () => ({ text: "" });
        fn.json = async (input, opts) => {
          window.__sampleCalls = (window.__sampleCalls ?? 0) + 1;
          if (String(input).includes("калорийность"))
            return { title: "Плов и салат", uncertainty: 0.2, items: [{ name: "Плов", grams: 300, kcal100: 180, p100: 6, f100: 8, c100: 22 }, { name: "Салат из огурцов", grams: 150, kcal100: 40, p100: 1, f100: 3, c100: 3 }] };
          if (opts?.images?.length)
            return {
              machine: "Тренажёр для жима ногами",
              confidence: "high",
              note: "Наклонная платформа и спинка.",
              exercises: [{ id: "leg_press" }, { id: "leg_press_calf_raise" }, { id: "fake_id" }],
              newExercises: [{ name: "Жим ногами одной ногой", primary: ["quads", "glutes"], pattern: "squat", tracking: "weight_reps", technique: "Одна стопа на платформе.", mistakes: ["Отрыв таза"] }],
            };
          return {
            title: "Спина и ноги от Claude",
            rationale: "Сначала база, потом изоляция.",
            items: [
              { id: "cardio_warmup", sets: 1, durationSec: 300, restSec: 0 },
              { id: "pull_up", sets: 4, repsMin: 6, repsMax: 10, restSec: 120 },
              { id: "back_squat", sets: 3, repsMin: 6, repsMax: 8, restSec: 150 },
              { id: "invented", sets: 3 },
            ],
          };
        };
        return fn;
      }
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
/** Кнопки и текст не вылезают за край экрана (то, что пользователь видит как «обрезанные» кнопки). */
const overflow = (page) =>
  page.evaluate(() => {
    const bad = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push("страница шире экрана");
    for (const b of document.querySelectorAll(".btn, .chip")) {
      if (b.closest(".chips.scroll")) continue; // горизонтальная лента — листается пальцем
      const r = b.getBoundingClientRect();
      if (r.width && (b.scrollWidth > b.clientWidth + 2 || r.right > window.innerWidth + 1 || r.left < -1)) bad.push(b.textContent.trim().slice(0, 40));
    }
    return bad;
  });
const shot = async (page, name) => {
  // На каждом экране, который снимаем, заодно проверяем, что ничего не обрезано по ширине.
  const bad = await overflow(page);
  if (bad.length) check(`экран ${name}: ничего не вылезает за край`, false, bad.join(" | "));
  if (shots) await page.screenshot({ path: join(shots, name + ".png"), fullPage: false });
};

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
  check("вопрос про круг 5-10-15", await page.getByText("Добавить круг 5-10-15 в тренировки?").isVisible());
  await shot(page, "03-today");
  await page.getByRole("button", { name: "В начале" }).click();
  await page.getByText("Добавить круг 5-10-15 в тренировки?").waitFor({ state: "hidden" });

  // «К тренировке» открывает план, а не запускает тренировку сразу.
  await page.getByRole("button", { name: "К тренировке" }).click();
  await page.getByText("План тренировки").waitFor();
  check("план дня открывается до старта", (await page.locator(".workout").count()) === 0);
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await page.locator(".workout").waitFor();
  // Завершить можно в любой момент; без подходов — без сохранения.
  await page.getByRole("button", { name: "Завершить" }).first().click();
  await page.getByText("Завершить без сохранения?").waitFor();
  await page.locator(".sheet").getByRole("button", { name: "Завершить" }).click();
  await page.locator(".workout").waitFor({ state: "hidden" });
  check("пустую тренировку можно завершить", await page.getByText("Сегодня: A").isVisible());

  // ── Тренировка A: в плане добавляем своё упражнение ──
  await page.getByRole("button", { name: "К тренировке" }).click();
  await page.getByText("План тренировки").waitFor();
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  // Длинный список в окне выбора прокручивается.
  const scrolled = await page.locator(".sheet").evaluate((el) => {
    el.scrollTop = 400;
    return el.scrollTop > 0 && el.scrollHeight > el.clientHeight;
  });
  check("окно выбора упражнения прокручивается", scrolled);
  await page.fill("#picker-search", "икр");
  await page.getByRole("button", { name: /Подъёмы на носки стоя/ }).click();
  check("своё упражнение добавлено в план", await page.getByText("Подъёмы на носки стоя").isVisible());
  // Изменить подходы жима и запомнить для следующих тренировок.
  await page.getByRole("button", { name: "Изменить подходы и повторы: Жим штанги лёжа" }).click();
  await page.getByRole("button", { name: "Подходы: больше" }).click();
  await page.locator(".sheet").getByRole("button", { name: "Готово" }).click();
  await page.check("#draft-remember");
  await shot(page, "03b-preview");
  await page.getByRole("button", { name: "Начать тренировку" }).click();
  await page.locator(".workout").waitFor();
  check("добавленное упражнение есть в тренировке", (await page.locator("article[aria-label='Подъёмы на носки стоя']").count()) === 1);
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
  const circuit = page.locator("article[aria-label='Круг 5-10-15']");
  check("круг стоит после разминки", (await circuit.count()) === 1);
  await circuit.getByRole("button", { name: "Круг", exact: true }).click();
  await circuit.getByRole("button", { name: "Круг", exact: true }).click();
  await circuit.scrollIntoViewIfNeeded();
  await shot(page, "04b-circuit");
  await bench.scrollIntoViewIfNeeded();
  await shot(page, "04-workout");

  // Перезагрузка посреди тренировки: всё должно сохраниться.
  await page.reload();
  await page.getByText("Тренировка идёт").waitFor();
  await page.getByRole("button", { name: "Продолжить" }).click();
  const doneAfterReload = await page.locator(".set-row.done").count();
  check("подходы пережили перезагрузку", doneAfterReload === 3, String(doneAfterReload));
  const roundsAfterReload = await page.locator("article[aria-label='Круг 5-10-15'] .big-number").textContent();
  check("круги пережили перезагрузку", roundsAfterReload === "2", roundsAfterReload);

  await page.getByRole("button", { name: "Завершить" }).first().click();
  await page.locator(".sheet").getByRole("button", { name: "Завершить" }).click();
  await page.getByText("Тренировка завершена").waitFor();
  const reviewText = await page.locator(".workout").textContent();
  check("сводка: процент плана и совет повторить день", /План: \d+%/.test(reviewText) && /повторить/i.test(reviewText) && /Круг 5-10-15: 2/.test(reviewText));
  await shot(page, "05-summary");
  await page.getByRole("radio", { name: /Идём дальше по плану/ }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByText("Сегодня уже потренировался").waitFor();
  check("следующая тренировка — B", (await page.locator(".card.accent h2").first().textContent()).startsWith("B"));

  // ── Повтор A: подсказка «прошлый раз» и рекорд ──
  await page.getByRole("button", { name: "План" }).click();
  // Выбранный день сохраняется после захода в упражнение и «Назад».
  await page.getByRole("tab", { name: /^B/ }).click();
  check("упор дня показан", await page.getByRole("region", { name: "Упор дня B" }).isVisible());
  await page.getByRole("region", { name: "Упор дня B" }).scrollIntoViewIfNeeded();
  await shot(page, "13-emphasis");
  await page.getByRole("button", { name: /Тяга верхнего блока/ }).first().click();
  await page.getByText("Типичные ошибки").waitFor();
  await page.goBack();
  await page.waitForTimeout(500);
  check("после «Назад» остался день B", (await page.getByRole("tab", { name: /^B/ }).getAttribute("aria-selected")) === "true");
  await page.getByRole("tab", { name: /^A/ }).click();
  check("изменения запомнены в программе", (await page.getByText("подходы/повторы изменены тобой").count()) === 1 && (await page.getByText("добавлено тобой").count()) === 1);
  check("жим теперь 5 подходов", (await page.getByRole("button", { name: /Жим штанги лёжа/ }).first().textContent()).includes("5 × 6–8"));
  await page.getByRole("button", { name: "К тренировке «A»" }).click();
  await page.getByRole("button", { name: "Начать тренировку" }).click();
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
  const histCount = await page.locator(".history-list .list-item").count();
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

  // ── Карточка упражнения: «Как делать» и «Мышцы» ──
  await page.fill("#lib-search", "жим штанги лёжа");
  await page.getByRole("button", { name: /Жим штанги лёжа/ }).first().click();
  const yt = await page.getByRole("link", { name: /YouTube/ }).getAttribute("href");
  check("ссылка на видео", yt.startsWith("https://www.youtube.com/results?search_query="), yt);
  await shot(page, "11-how");
  await page.getByRole("radio", { name: "Мышцы" }).click();
  check("вкладка мышц", await page.locator(".body-map").isVisible());
  await page.goBack();
  await page.waitForTimeout(400);

  // ── Карта мышц: найти упражнения на икры ──
  await page.fill("#lib-search", "");
  await page.getByRole("button", { name: "Мышцы на схеме" }).click();
  await page.locator(".card").getByRole("button", { name: "Икры", exact: true }).click();
  const calves = await page.locator(".list-item .title").allTextContents();
  check("фильтр по мышце «Икры»", calves.length >= 4 && calves.every((t) => /нос|Икры/i.test(t)), calves.join(", "));
  await page.locator(".card").getByRole("button", { name: "Трапеции", exact: true }).click();
  const multi = await page.locator(".list-item .title").allTextContents();
  check("несколько мышц сразу (икры + трапеции)", multi.length > calves.length && multi.some((t) => /Шраги/.test(t)), String(multi.length));
  check("кнопка «Показать N упр.»", await page.getByRole("button", { name: `Показать ${multi.length} упр.` }).isVisible());

  // ── «Назад» возвращает туда, где был: мышцы, схема и прокрутка на месте ──
  await page.getByRole("button", { name: `Показать ${multi.length} упр.` }).click();
  await page.waitForTimeout(500);
  const yBefore = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: /Шраги с гантелями/ }).click();
  await page.getByText("Типичные ошибки").waitFor();
  await page.getByRole("button", { name: "Назад" }).first().click();
  await page.waitForTimeout(600);
  const keptIn = await page.locator(".list-item .title").allTextContents();
  const yAfter = await page.evaluate(() => window.scrollY);
  check("назад (в приложении): мышцы и схема сохранились", keptIn.length === multi.length && (await page.locator(".body-map").isVisible()), String(keptIn.length));
  check("назад: прокрутка вернулась на место", Math.abs(yAfter - yBefore) < 40, `${yBefore} → ${yAfter}`);
  await page.getByRole("button", { name: /Шраги с гантелями/ }).click();
  await page.getByText("Типичные ошибки").waitFor();
  await page.goBack();
  await page.waitForTimeout(600);
  check("назад (системная кнопка): мышцы сохранились", (await page.locator(".list-item .title").count()) === multi.length);
  // Прогрессия кликабельна: переход к следующей ступени и обратно.
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await page.fill("#lib-search", "отжимания от пола");
  await page.getByRole("button", { name: /Отжимания от пола/ }).first().click();
  await page.locator("button.step", { hasText: "Отжимания с ногами на возвышении" }).click();
  await page.getByRole("heading", { name: "Отжимания с ногами на возвышении" }).waitFor();
  check("прогрессия: переход на другую ступень", true);
  await page.goBack();
  await page.waitForTimeout(500);
  check("прогрессия: назад к исходному упражнению", await page.getByRole("heading", { name: "Отжимания от пола" }).isVisible());
  await page.goBack();
  await page.waitForTimeout(500);
  check("назад: поиск в библиотеке сохранился", (await page.inputValue("#lib-search")) === "отжимания от пола");
  await page.fill("#lib-search", "");
  check("библиотека: ничего не вылезает за край", (await overflow(page)).length === 0, (await overflow(page)).join(" | "));
  await shot(page, "08-muscles");

  // ── Своя программа: спина и ноги в один день ──
  await page.getByRole("button", { name: "Тренировки" }).click();
  await page.getByRole("button", { name: "Создать свою программу" }).click();
  await page.getByText("Редактор программы").waitFor();
  await page.fill("#day-name", "Спина + ноги");
  await page.locator("#day-name").blur();
  for (const q of ["Подтягивания прямым", "Приседания со штангой"]) {
    await page.getByRole("button", { name: "Добавить упражнение" }).click();
    await page.fill("#picker-search", q.split(" ")[0]);
    await page.getByRole("button", { name: new RegExp(q) }).first().click();
  }
  await page.getByRole("button", { name: "Сделать моей программой" }).click();
  await shot(page, "09-editor");
  await page.getByRole("button", { name: "Сегодня" }).click();
  const nextTitle = await page.locator(".card.accent h2").first().textContent();
  check("своя программа стала активной", nextTitle.startsWith("Спина + ноги"), nextTitle);

  // ── Тренировка по запросу (без Claude — в тестах его нет) ──
  await page.getByRole("button", { name: "По запросу" }).click();
  await page.fill("#ask-text", "спина и ноги, 60 минут");
  await page.getByRole("button", { name: "Составить с Claude" }).click();
  await page.getByText("План тренировки").waitFor();
  const askTitle = await page.inputValue("#draft-title");
  check("план по запросу от Claude (проверен)", askTitle === "Спина и ноги от Claude" && !(await page.getByText("invented").count()), askTitle);
  await page.goBack();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Быстро, без Claude" }).click();
  const localTitle = await page.inputValue("#draft-title");
  check("запасной план без Claude", localTitle === "Спина + Ноги", localTitle);

  // ── Фото тренажёра → упражнения в план ──
  await page.getByRole("button", { name: "По фото тренажёра" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAU0lEQVR4nO3PsQ3AIADAMOBqZmaO7hEMVqX4gmTuc8efLR3wqgGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAe0DDtIB5uQ/i7MAAAAASUVORK5CYII=", "base64");
  check(
    "галерея открывается без принудительной камеры",
    (await page.getAttribute("#photo-file", "capture")) === null && (await page.getAttribute("#photo-camera", "capture")) === "environment",
  );
  await page.setInputFiles("#photo-file", { name: "machine.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Распознать" }).click();
  await page.getByText("Тренажёр для жима ногами").waitFor();
  check("фото: только упражнения из каталога + новое с пометкой", (await page.locator("label.list-item").count()) === 3 && (await page.getByText("новое — проверь").isVisible()));
  check("фото: кнопки не обрезаны", (await overflow(page)).length === 0, (await overflow(page)).join(" | "));
  await shot(page, "12-photo");
  check("фото: день программы подобран", (await page.getByRole("button", { name: /День для «Жим ногами»: Спина \+ ноги/ }).count()) === 1);
  await page.getByRole("button", { name: /Добавить в программу/ }).click();
  await page.getByText("добавлено тобой").first().waitFor();
  check("фото: упражнения добавлены в программу", (await page.getByText("добавлено тобой").count()) === 3 && (await page.getByText("Жим ногами одной ногой").count()) === 1);
  // Из программы «Назад» — на экран, откуда пришёл (план тренировки), со всем, что там было.
  await page.goBack();
  await page.waitForTimeout(600);
  check("после фото «Назад» возвращает на прежний экран", await page.getByText("План тренировки").isVisible());
  await shot(page, "10-ask");

  // ── Быстрые блоки на «Сегодня» тоже открывают план ──
  await page.getByRole("button", { name: "Сегодня" }).click();
  await page.getByRole("button", { name: "Мобильность" }).click();
  await page.getByText("План тренировки").waitFor();
  check("«Мобильность» открывает план, а не тренировку", (await page.locator(".workout").count()) === 0 && (await page.getByRole("button", { name: "Начать тренировку" }).isVisible()));
  await page.goBack();
  await page.waitForTimeout(400);

  // ══ Этапы 3–5 ══
  // ── Вода, самочувствие, облегчённая тренировка ──
  await page.getByRole("button", { name: "Сегодня" }).click();
  check("рекомендации на главном", await page.getByRole("region", { name: "Рекомендации" }).isVisible());
  await page.getByRole("region", { name: "Вода" }).getByRole("button", { name: "+300" }).click();
  check("вода: +300 мл", /0,3/.test(await page.getByRole("region", { name: "Вода" }).textContent()));
  await page.getByRole("region", { name: "Самочувствие" }).getByRole("button", { name: "Отметить" }).click();
  for (const g of ["Энергия", "Мышцы", "Настроение", "Стресс"]) await page.getByRole("radiogroup", { name: g }).getByRole("radio", { name: "2" }).click();
  await page.fill("#sleep-bed", "02:00");
  await page.fill("#sleep-wake", "07:30");
  await page.locator(".sheet").getByRole("button", { name: "Сохранить" }).click();
  const readyText = await page.getByRole("region", { name: "Самочувствие" }).textContent();
  check("готовность посчитана и есть совет", /готовность/i.test(readyText) && /Облегчить тренировку|Мобильность/.test(readyText), readyText.slice(0, 80));
  await shot(page, "14-today-wellness");
  await page.getByRole("button", { name: "Облегчить тренировку" }).click();
  await page.getByText("План тренировки").waitFor();
  check("облегчённая тренировка", (await page.inputValue("#draft-title")).includes("облегчённая"));
  check("профилактика ещё не в разминке", (await page.getByText("Скольжения руками по стене").count()) === 0);
  await page.goBack();
  await page.waitForTimeout(400);

  // ── Питание ──
  await page.getByRole("button", { name: "Питание" }).click();
  check("питание: просит заполнить профиль для нормы", await page.getByText(/Чтобы посчитать норму/).isVisible());
  await page.getByRole("button", { name: "Описать словами" }).click();
  await page.fill("#food-text", "тарелка плова и салат");
  await page.getByRole("button", { name: "Оценить калории" }).click();
  await page.getByRole("button", { name: "Больше: Плов" }).waitFor();
  const kcal1 = Number((await page.locator(".big-number").textContent()).replace(/\D/g, ""));
  check("еда: оценка с диапазоном", kcal1 === Math.round(540 + 60) && (await page.getByText(/480–720/).count()) === 1, String(kcal1));
  await page.getByRole("button", { name: "Больше: Плов" }).click();
  const kcal2 = Number((await page.locator(".big-number").textContent()).replace(/\D/g, ""));
  check("еда: граммы меняются — калории пересчитываются", kcal2 === kcal1 + 45, `${kcal1} → ${kcal2}`);
  await shot(page, "15-meal");
  await page.getByRole("button", { name: "Сохранить как блюдо" }).click();
  await page.goBack();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Сохранённые" }).click();
  await page.getByRole("button", { name: "Добавить" }).first().click();
  await page.getByRole("button", { name: "Больше: Плов" }).waitFor();
  await page.goBack();
  await page.waitForTimeout(400);
  check("сохранённое блюдо добавлено вторым приёмом", (await page.getByRole("button", { name: /Плов и салат/ }).count()) === 2);
  // Заполняем профиль — появляется норма.
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: /Тело и опыт/ }).click();
  await page.getByRole("radiogroup").first().waitFor();
  await page.locator("#sex").getByRole("radio", { name: "М" }).click();
  await page.fill("#birthYear", "2000");
  await page.locator("#birthYear").blur();
  await page.getByRole("button", { name: "Сохранить" }).first().click();
  await page.getByRole("button", { name: "Питание" }).click();
  const summary = await page.getByRole("region", { name: "Питание за день" }).textContent();
  check("норма калорий и белка посчитана", /\/ \d{4} ккал/.test(summary) && /\/ 158/.test(summary), summary.slice(0, 90));
  await shot(page, "16-nutrition");

  // ── Замеры, рабочие веса, неделя ──
  await page.getByRole("button", { name: "Прогресс" }).click();
  check("рабочие веса в прогрессе", /Жим штанги лёжа[\s\S]*72,5 кг × 6/.test(await page.locator("main, .app").first().textContent()));
  await page.getByRole("button", { name: "Тело и замеры" }).click();
  await page.fill("#body-weightKg", "79");
  await page.fill("#body-armL", "36,5");
  await page.fill("#body-armR", "35");
  await page.locator("#body-armR").blur();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText(/Разница Л − П/).waitFor();
  check("замеры: разница рук Л − П", /\+1,5 см/.test(await page.getByText(/Разница Л − П/).textContent()));
  await shot(page, "17-body");
  await page.goBack();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Неделя" }).click();
  const weekText = await page.locator(".app").textContent();
  check("неделя: тренировки, сон, вода, питание", /2\s*тренировки/.test(weekText) && /5,5 ч/.test(weekText) && /300 мл/.test(weekText) && /ккал/.test(weekText), weekText.slice(0, 60));
  await shot(page, "18-week");
  await page.goBack();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Жим штанги лёжа/ }).first().click();
  check("график рабочего веса в упражнении", await page.getByRole("img", { name: /Жим штанги лёжа: рабочий вес/ }).isVisible());
  await page.getByRole("img", { name: /Жим штанги лёжа: рабочий вес/ }).scrollIntoViewIfNeeded();
  await page.getByRole("img", { name: /Жим штанги лёжа: рабочий вес/ }).click();
  await shot(page, "19-lift");
  await page.goBack();
  await page.waitForTimeout(400);

  // ── Профилактика в разминку ──
  await page.getByRole("button", { name: "Тренировки" }).click();
  await page.getByRole("button", { name: "Профилактика" }).click();
  await page.getByRole("region", { name: /Щелчки или дискомфорт в плече/ }).getByRole("button", { name: "В разминку тренировок" }).click();
  await shot(page, "20-prehab");
  await page.getByRole("button", { name: "Сегодня" }).click();
  await page.getByRole("button", { name: "К тренировке" }).click();
  await page.getByText("План тренировки").waitFor();
  check("профилактика плеча добавлена в разминку", (await page.getByText("Скольжения руками по стене").count()) === 1);
  await page.goBack();
  await page.waitForTimeout(400);

  // ── Напоминания и CSV ──
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: /Напоминания/ }).click();
  await page.locator("#rem-water").getByRole("radio", { name: "Выкл" }).click();
  await page.goBack();
  await page.waitForTimeout(400);
  check("напоминание о воде выключено", /Напоминания[\s\S]*тренировка после/.test(await page.locator(".app").textContent()) && !/вода раз в/.test(await page.locator(".app").textContent()));
  await page.getByRole("button", { name: /Данные и синхронизация/ }).click();
  await page.getByRole("button", { name: "Тренировки CSV" }).click();
  await page.getByRole("button", { name: "Дневник CSV" }).click();
  await page.waitForTimeout(300);
  const files = await page.evaluate(() => window.__downloads ?? []);
  check("CSV: тренировки и дневник", files.length === 2 && files[0].data.includes("Жим штанги лёжа") && files[1].data.includes("Вода, мл") && files[1].data.includes(";79;"), files.map((f) => f.filename).join(", "));
  await page.goBack();
  await page.waitForTimeout(400);

  // ── Синхронизация ──
  await page.waitForTimeout(2500);
  // Удалённые тренировки хранятся в облаке как «надгробия», чтобы удаление дошло до других устройств.
  const cloudSessions = [...cloud.entries()].filter(([k, v]) => k.includes("/sessions/") && !JSON.parse(v).data.deletedAt).length;
  check("в облаке 2 тренировки и профиль", cloudSessions === 2 && cloud.has("data/users/u_test/fitness"), `${cloudSessions} тренировок`);
  await ctx.close();

  // Новое «устройство» без локальных данных: всё должно восстановиться из облака.
  const second = await newPage(true);
  await second.page.goto(URL);
  await second.page.getByRole("button", { name: "Прогресс" }).waitFor({ timeout: 8000 });
  await second.page.getByRole("button", { name: "Прогресс" }).click();
  const restored = await second.page.locator(".history-list .list-item").count();
  check("восстановление из облака на чистом устройстве", restored === 2, String(restored));
  await second.page.getByRole("button", { name: "Питание" }).click();
  check("дневник (еда) восстановлен из облака", (await second.page.getByRole("button", { name: /Плов и салат/ }).count()) === 2);
  await second.ctx.close();

  // Без облака приложение работает локально.
  const offline = await newPage(false);
  await offline.page.goto(URL);
  await offline.page.getByText("Тело и опыт").waitFor();
  check("без облака открывается онбординг (локальный режим)", true);
  await offline.ctx.close();
} catch (e) {
  // fail-shot: снимок экрана в момент ошибки
  for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await shot(pg, "fail").catch(() => {});
  check("сценарий выполнен без исключений", false, e.message.split("\n").slice(0, 6).join(" "));
} finally {
  await browser.close();
  server.close();
}

check("нет ошибок в консоли", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(results.join("\n"));
