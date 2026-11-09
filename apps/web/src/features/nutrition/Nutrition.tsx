import React, { useMemo, useRef, useState } from "react";
import { today, updateDay, updateMeta, useStore } from "../../data/store";
import { dayId } from "../../data/defaults";
import { capability } from "../../data/runtime";
import type { FoodItem, Meal, MealType } from "../../data/types";
import { useNav, useScreenState } from "../../app/nav";
import { buildFoodPrompt, dailyTargets, dayTotals, itemTotals, MEAL_TYPES, mealTotals, mealTypeByTime, parseFoodResult } from "../../domain/nutrition";
import { latestWeight } from "../../domain/weekly";
import { compressImage } from "../../domain/photo";
import { uuidv7 } from "../../domain/ids";
import { fmtTime, parseNum } from "../../domain/format";
import { Confirm, Note, Segmented, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { useTrainingToday } from "../wellness/Wellness";

const r0 = (n: number) => Math.round(n);

function Bar({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="emphasis-row" style={{ gridTemplateColumns: "4.5em minmax(0,1fr) 6.5em" }}>
      <span className="small">{label}</span>
      <span className="emphasis-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="small num" style={{ textAlign: "right" }}>
        {r0(value)}
        {target ? ` / ${target}` : ""} {unit}
      </span>
    </div>
  );
}

/** Сводка дня: ориентиры, съедено с диапазоном. Используется и на «Сегодня». */
export function NutritionSummary({ compact }: { compact?: boolean }) {
  const nav = useNav();
  const state = useStore((s) => s);
  const log = useStore((s) => today(s));
  const training = useTrainingToday();
  const { targets, missing } = dailyTargets(state.meta.profile, latestWeight(state.days, state.meta.profile), training);
  const t = dayTotals(log);
  return (
    <section className="card tight" aria-label="Питание за день">
      <div className="row">
        <span className="eyebrow grow">Питание</span>
        <span className="small num">
          ≈<b>{r0(t.kcal)}</b>
          {targets ? ` / ${targets.kcal}` : ""} ккал
        </span>
      </div>
      {t.kcal > 0 && <p className="xs muted num">диапазон {r0(t.kcalMin)}–{r0(t.kcalMax)} ккал — это оценка</p>}
      <Bar label="Белки" value={t.protein} target={targets?.protein ?? null} unit="г" />
      {!compact && (
        <>
          <Bar label="Жиры" value={t.fat} target={targets?.fat ?? null} unit="г" />
          <Bar label="Углев." value={t.carbs} target={targets?.carbs ?? null} unit="г" />
        </>
      )}
      {missing.length > 0 && (
        <p className="xs muted">
          Чтобы посчитать норму, заполни в профиле: {missing.join(", ")}.{" "}
          <button className="btn small ghost" onClick={() => nav.push({ name: "profile-edit", section: "body" })}>
            Заполнить
          </button>
        </p>
      )}
      {compact && (
        <div className="row">
          <button className="btn small grow" onClick={() => nav.push({ name: "food-add", mode: "photo" })}>
            <Icon name="camera" size={16} /> Фото еды
          </button>
          <button className="btn small grow" onClick={() => nav.push({ name: "food-add", mode: "text" })}>
            Описать
          </button>
        </div>
      )}
    </section>
  );
}

export function NutritionHome() {
  const nav = useNav();
  const state = useStore((s) => s);
  const log = useStore((s) => today(s));
  const training = useTrainingToday();
  const targets = dailyTargets(state.meta.profile, latestWeight(state.days, state.meta.profile), training).targets;
  const meals = [...log.meals].sort((a, b) => a.at - b.at);
  return (
    <>
      <TopBar title="Питание" />
      <div className="screen">
        <NutritionSummary />
        {targets && <p className="xs muted">Норма — ориентир: {targets.basis}; белок по цели. {training ? "Сегодня тренировка — воды больше." : ""}</p>}
        <div className="grid-2">
          <button className="btn primary" onClick={() => nav.push({ name: "food-add", mode: "photo" })}>
            <Icon name="camera" size={18} /> По фото
          </button>
          <button className="btn" onClick={() => nav.push({ name: "food-add", mode: "text" })}>
            Описать словами
          </button>
          <button className="btn" onClick={() => nav.push({ name: "food-add", mode: "saved" })}>
            Сохранённые
          </button>
          <button className="btn" onClick={() => nav.push({ name: "food-add", mode: "manual" })}>
            Вручную
          </button>
        </div>
        <section className="section">
          <div className="section-head">
            <h2>Сегодня</h2>
          </div>
          {meals.length ? (
            <div className="list">
              {meals.map((m) => {
                const t = mealTotals(m);
                return (
                  <button key={m.id} className="list-item" onClick={() => nav.push({ name: "meal", date: log.id, id: m.id })}>
                    <div className="grow">
                      <div className="title">{m.title}</div>
                      <div className="sub num">
                        {MEAL_TYPES[m.type]} · {fmtTime(m.at)} · ≈{r0(t.kcal)} ккал ({r0(t.kcalMin)}–{r0(t.kcalMax)}) · Б {r0(t.protein)} Ж {r0(t.fat)} У {r0(t.carbs)}
                      </div>
                    </div>
                    <Icon name="chev" className="chev" />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="small muted">Пока ничего. Сфотографируй тарелку или опиши, что съел — например, «тарелка плова и салат».</p>
          )}
        </section>
        <Note>Калории и БЖУ по фото и описанию — приблизительная оценка, поэтому показан диапазон. Поправь граммы, если знаешь точнее.</Note>
      </div>
    </>
  );
}

type SampleFn = { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> };

async function saveMeal(meal: Meal): Promise<void> {
  await updateDay(dayId(meal.at), (d) => ({ ...d, meals: [...d.meals.filter((m) => m.id !== meal.id), meal] }));
}

export function FoodAdd({ mode }: { mode: "photo" | "text" | "saved" | "manual" }) {
  const nav = useNav();
  const saved = useStore((s) => s.meta.savedDishes ?? []);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const [text, setText] = useScreenState("text", "");
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: "", grams: "100", kcal: "", p: "", f: "", c: "" });
  const [removeId, setRemoveId] = useState<string | null>(null);

  const finish = async (meal: Meal) => {
    await saveMeal(meal);
    toast("Добавлено");
    nav.backThen(() => nav.push({ name: "meal", date: dayId(meal.at), id: meal.id }));
  };

  const recognize = async () => {
    if (!img && !text.trim()) return setError("Добавь фото или опиши еду.");
    const sample = await capability<SampleFn>("sample");
    if (!sample) return setError("Распознавание работает только в приложении внутри Claude. Можно добавить вручную.");
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const raw = await sample.json(buildFoodPrompt(text, !!img), { images: img ? [img.blob] : undefined, signal: ctl.current.signal, modelTier: "default" });
      const r = parseFoodResult(raw);
      if (!r) return setError("Не получилось распознать еду. Попробуй другое фото или опиши словами.");
      const now = Date.now();
      await finish({ id: uuidv7(now), at: now, type: mealTypeByTime(now), title: r.title, source: img ? "photo" : "text", items: r.items, uncertainty: r.uncertainty });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "cancelled") setError(code === "not_granted" ? "Доступ к Claude не разрешён." : code === "rate_limited" ? "Лимит запросов к Claude исчерпан, попробуй позже." : "Claude сейчас недоступен. Можно добавить вручную.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File) => {
    setError(null);
    try {
      const blob = await compressImage(f);
      setImg({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("Не удалось открыть фото.");
    }
  };

  const addManual = async () => {
    const grams = parseNum(manual.grams) ?? 100;
    const kcal = parseNum(manual.kcal);
    if (!manual.name.trim() || kcal == null) return setError("Укажи название и калории.");
    const k = 100 / Math.max(1, grams);
    const now = Date.now();
    await finish({
      id: uuidv7(now),
      at: now,
      type: mealTypeByTime(now),
      title: manual.name.trim().slice(0, 60),
      source: "manual",
      uncertainty: 0.05,
      items: [{ name: manual.name.trim().slice(0, 80), grams, kcal100: Math.min(950, kcal * k), p100: Math.min(100, (parseNum(manual.p) ?? 0) * k), f100: Math.min(100, (parseNum(manual.f) ?? 0) * k), c100: Math.min(100, (parseNum(manual.c) ?? 0) * k) }],
    });
  };

  const titles = { photo: "Еда по фото", text: "Описать еду", saved: "Сохранённые блюда", manual: "Добавить вручную" };
  return (
    <>
      <TopBar title={titles[mode]} onBack={nav.back} />
      <div className="screen">
        {(mode === "photo" || mode === "text") && (
          <>
            {mode === "photo" && (
              <>
                {[
                  { ref: camRef, id: "food-camera", capture: true },
                  { ref: fileRef, id: "food-file", capture: false },
                ].map((f) => (
                  <input key={f.id} ref={f.ref} id={f.id} type="file" accept="image/*" {...(f.capture ? { capture: "environment" as const } : {})} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void onFile(file); e.target.value = ""; }} />
                ))}
                {img ? <img src={img.url} alt="Фото еды" className="photo-preview" /> : <div className="empty" style={{ alignItems: "center" }}><Icon name="camera" size={28} /><b>Сфотографируй тарелку сверху</b></div>}
                <div className="grid-2">
                  <button className="btn" onClick={() => camRef.current?.click()} disabled={busy}>
                    <Icon name="camera" size={18} /> Камера
                  </button>
                  <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                    <Icon name="upload" size={18} /> Галерея
                  </button>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="food-text">{mode === "photo" ? "Уточнение (необязательно)" : "Что съел"}</label>
              <textarea id="food-text" className="textarea" rows={3} maxLength={400} value={text} placeholder={mode === "photo" ? "Например: курица без кожи, рис ~150 г" : "Например: тарелка плова и салат из огурцов"} onChange={(e) => setText(e.target.value)} />
            </div>
            <button className="btn primary big block" onClick={recognize} disabled={busy || (mode === "photo" ? !img : !text.trim())}>
              <Icon name="spark" size={18} /> Оценить калории
            </button>
            {busy && (
              <div className="card tight">
                <p className="small">Claude оценивает… обычно 10–40 секунд</p>
                <button className="btn" onClick={() => ctl.current?.abort()}>Остановить</button>
              </div>
            )}
            <Note>В Claude уходят только {mode === "photo" ? "фото (уменьшенное, без метаданных) и уточнение" : "это описание"}. Вес и профиль — нет.</Note>
          </>
        )}
        {mode === "saved" &&
          (saved.length ? (
            <div className="list">
              {[...saved].sort((a, b) => b.uses - a.uses).map((d) => {
                const t = mealTotals(d);
                return (
                  <div key={d.id} className="list-item">
                    <div className="grow">
                      <div className="title">{d.name}</div>
                      <div className="sub num">≈{r0(t.kcal)} ккал · Б {r0(t.protein)} Ж {r0(t.fat)} У {r0(t.carbs)}</div>
                    </div>
                    <button
                      className="btn small primary"
                      onClick={async () => {
                        await updateMeta((m) => ({ ...m, savedDishes: (m.savedDishes ?? []).map((x) => (x.id === d.id ? { ...x, uses: x.uses + 1 } : x)) }));
                        const now = Date.now();
                        await finish({ id: uuidv7(now), at: now, type: mealTypeByTime(now), title: d.name, source: "saved", items: d.items.map((i) => ({ ...i })), uncertainty: d.uncertainty });
                      }}
                    >
                      Добавить
                    </button>
                    <button className="icon-btn" aria-label={`Удалить блюдо: ${d.name}`} onClick={() => setRemoveId(d.id)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="small muted">Сохранённых блюд пока нет. Открой любой приём пищи и нажми «Сохранить как блюдо».</p>
          ))}
        {mode === "manual" && (
          <div className="stack gap-l">
            <div className="field">
              <label htmlFor="m-name">Название</label>
              <input id="m-name" className="input" maxLength={80} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            </div>
            <div className="grid-2">
              {([["grams", "Порция, г"], ["kcal", "Ккал в порции"], ["p", "Белки, г"], ["f", "Жиры, г"], ["c", "Углеводы, г"]] as const).map(([k, l]) => (
                <div key={k} className="field">
                  <label htmlFor={`m-${k}`}>{l}</label>
                  <input id={`m-${k}`} className="input num" inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value.replace(/[^\d.,]/g, "") })} />
                </div>
              ))}
            </div>
            <button className="btn primary block" onClick={addManual}>
              Добавить
            </button>
          </div>
        )}
        {error && <Note kind="warn">{error}</Note>}
      </div>
      {removeId && (
        <Confirm
          title={`Удалить «${saved.find((d) => d.id === removeId)?.name ?? "блюдо"}»?`}
          text="Блюдо пропадёт из сохранённых. Уже записанные приёмы пищи останутся."
          confirmLabel="Удалить"
          danger
          onConfirm={() => updateMeta((m) => ({ ...m, savedDishes: (m.savedDishes ?? []).filter((x) => x.id !== removeId) })).then(() => toast("Блюдо удалено"))}
          onClose={() => setRemoveId(null)}
        />
      )}
    </>
  );
}

export function MealEditor({ date, id }: { date: string; id: string }) {
  const nav = useNav();
  const meal = useStore((s) => s.days[date]?.meals.find((m) => m.id === id));
  const [confirm, setConfirm] = useState(false);
  const totals = useMemo(() => (meal ? mealTotals(meal) : null), [meal]);
  if (!meal || !totals) return <TopBar title="Приём пищи не найден" onBack={nav.back} />;
  const upd = (fn: (m: Meal) => Meal) => updateDay(date, (d) => ({ ...d, meals: d.meals.map((m) => (m.id === id ? fn(m) : m)) }));
  const setItem = (i: number, patch: Partial<FoodItem>) => upd((m) => ({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <>
      <TopBar title={meal.title} onBack={nav.back} />
      <div className="screen">
        <div className="card tight">
          <div className="row">
            <span className="big-number num">≈{r0(totals.kcal)}</span>
            <span className="small muted grow">ккал</span>
            <span className="pill">{r0(totals.kcalMin)}–{r0(totals.kcalMax)}</span>
          </div>
          <p className="small num">
            Белки {r0(totals.protein)} г · Жиры {r0(totals.fat)} г · Углеводы {r0(totals.carbs)} г
          </p>
          <p className="xs muted">Оценка ±{Math.round(meal.uncertainty * 100)}%. Поправь граммы — всё пересчитается.</p>
        </div>
        <Segmented id="meal-type" value={meal.type} onChange={(v: MealType) => upd((m) => ({ ...m, type: v }))} options={(Object.keys(MEAL_TYPES) as MealType[]).map((k) => ({ value: k, label: MEAL_TYPES[k] }))} />
        <div className="list">
          {meal.items.map((it, i) => {
            const t = itemTotals(it);
            return (
              <div key={i} className="list-item">
                <div className="grow">
                  <div className="title">{it.name}</div>
                  <div className="sub num">
                    ≈{r0(t.kcal)} ккал · Б {r0(t.protein)} Ж {r0(t.fat)} У {r0(t.carbs)}
                  </div>
                </div>
                <div className="stepper">
                  <button aria-label={`Меньше: ${it.name}`} onClick={() => setItem(i, { grams: Math.max(5, it.grams - (it.grams > 100 ? 25 : 10)) })}>
                    <Icon name="minus" size={16} />
                  </button>
                  <span className="v" style={{ minWidth: "4.5ch" }}>{it.grams} г</span>
                  <button aria-label={`Больше: ${it.name}`} onClick={() => setItem(i, { grams: Math.min(3000, it.grams + (it.grams >= 100 ? 25 : 10)) })}>
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                <button className="icon-btn" aria-label={`Убрать: ${it.name}`} onClick={() => upd((m) => ({ ...m, items: m.items.filter((_, j) => j !== i) }))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="btn block"
          onClick={async () => {
            await updateMeta((m) => ({ ...m, savedDishes: [...(m.savedDishes ?? []).filter((d) => d.name !== meal.title), { id: uuidv7(), name: meal.title, items: meal.items, uncertainty: meal.uncertainty, uses: 0 }].slice(-60) }));
            toast("Блюдо сохранено");
          }}
        >
          Сохранить как блюдо
        </button>
        <button className="btn ghost block" style={{ color: "var(--bad)" }} onClick={() => setConfirm(true)}>
          Удалить приём пищи
        </button>
      </div>
      {confirm && (
        <Confirm
          title="Удалить приём пищи?"
          confirmLabel="Удалить"
          danger
          onConfirm={() => updateDay(date, (d) => ({ ...d, meals: d.meals.filter((m) => m.id !== id) })).then(() => nav.back())}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}

