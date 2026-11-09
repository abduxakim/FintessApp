// Питание: дневные ориентиры, суммы приёмов пищи и разбор ответа Claude.
// Все значения — оценки. Формула Миффлина — Сан Жеора даёт ориентир, а не точную потребность.
import type { DayLog, FoodItem, Goal, Meal, MealType, Profile } from "../data/types";

export interface Targets {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  water: number;
  basis: string;
}

const GOAL_KCAL: Record<Goal, number> = { definition: -0.1, hypertrophy: 0.1, strength: 0.05, endurance: 0 };
const GOAL_PROTEIN: Record<Goal, number> = { definition: 2.0, hypertrophy: 1.8, strength: 1.8, endurance: 1.6 };

export function activityFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 1) return 1.3;
  if (daysPerWeek <= 3) return 1.375;
  if (daysPerWeek <= 5) return 1.55;
  return 1.725;
}

/** Ориентиры на день. null — не хватает данных профиля (что именно — в missing). */
export function dailyTargets(p: Profile, weightKg: number | null, trainingDay: boolean, year = new Date().getFullYear()): { targets: Targets | null; missing: string[] } {
  const missing: string[] = [];
  if (!weightKg) missing.push("вес");
  if (!p.heightCm) missing.push("рост");
  if (!p.birthYear) missing.push("год рождения");
  if (!p.sex) missing.push("пол");
  const water = weightKg ? Math.round((weightKg * 33 + (trainingDay ? 500 : 0)) / 100) * 100 : trainingDay ? 2500 : 2000;
  if (missing.length) return { targets: null, missing };
  const age = year - p.birthYear!;
  const bmr = 10 * weightKg! + 6.25 * p.heightCm! - 5 * age + (p.sex === "male" ? 5 : -161);
  const kcal = Math.round((bmr * activityFactor(p.daysPerWeek) * (1 + GOAL_KCAL[p.goal])) / 10) * 10;
  const protein = Math.round(weightKg! * GOAL_PROTEIN[p.goal]);
  const fat = Math.round(weightKg! * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const goalText = GOAL_KCAL[p.goal] < 0 ? "лёгкий дефицит" : GOAL_KCAL[p.goal] > 0 ? "небольшой профицит" : "поддержание";
  return { targets: { kcal, protein, fat, carbs, water, basis: `Миффлин — Сан Жеор × активность ${activityFactor(p.daysPerWeek)}, ${goalText}` }, missing: [] };
}

export interface Totals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  kcalMin: number;
  kcalMax: number;
}

export function itemTotals(i: FoodItem) {
  const k = i.grams / 100;
  return { kcal: i.kcal100 * k, protein: i.p100 * k, fat: i.f100 * k, carbs: i.c100 * k };
}

export function mealTotals(m: Pick<Meal, "items" | "uncertainty">): Totals {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  for (const i of m.items) {
    const t = itemTotals(i);
    kcal += t.kcal;
    protein += t.protein;
    fat += t.fat;
    carbs += t.carbs;
  }
  const u = Math.max(0, Math.min(0.6, m.uncertainty));
  return { kcal, protein, fat, carbs, kcalMin: kcal * (1 - u), kcalMax: kcal * (1 + u) };
}

export function dayTotals(d: DayLog | undefined): Totals {
  const z: Totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, kcalMin: 0, kcalMax: 0 };
  for (const m of d?.meals ?? []) {
    const t = mealTotals(m);
    z.kcal += t.kcal;
    z.protein += t.protein;
    z.fat += t.fat;
    z.carbs += t.carbs;
    z.kcalMin += t.kcalMin;
    z.kcalMax += t.kcalMax;
  }
  return z;
}

export function waterTotal(d: DayLog | undefined): number {
  return (d?.water ?? []).reduce((n, w) => n + w.ml, 0);
}

export function mealTypeByTime(ms: number): MealType {
  const h = new Date(ms).getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

export const MEAL_TYPES: Record<MealType, string> = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус" };

/** Запрос к Claude: только описание еды и/или фото. Профиль и вес не отправляются. */
export function buildFoodPrompt(text: string, hasPhoto: boolean): string {
  return [
    "Оцени калорийность и БЖУ еды. Отвечай на русском.",
    hasPhoto ? "На фото — еда. Учитывай размер тарелки и порций." : "",
    text.trim() ? `Описание от пользователя: «${text.trim().slice(0, 400)}»` : "",
    "Правила:",
    "- раздели на отдельные продукты или блюда, для каждого оцени массу порции в граммах и значения на 100 г;",
    "- используй типичные значения для таких блюд; если не уверен — увеличь uncertainty;",
    "- uncertainty — неопределённость общей калорийности: 0.1 (уверен) … 0.5 (очень грубая оценка);",
    "- если на фото или в тексте нет еды — пустой items.",
    'Ответь только JSON: {"title": "короткое название приёма пищи", "uncertainty": 0.2, "items": [{"name": "плов", "grams": 300, "kcal100": 180, "p100": 6, "f100": 8, "c100": 22}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Проверка ответа: только правдоподобные числа. Калорийность сверяется с БЖУ (4/9/4 ккал на грамм). */
export function parseFoodResult(raw: unknown): { title: string; uncertainty: number; items: FoodItem[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const items: FoodItem[] = [];
  for (const it of r.items.slice(0, 20)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 80) : "";
    const grams = num(o.grams, 1, 3000);
    const p = num(o.p100, 0, 100);
    const f = num(o.f100, 0, 100);
    const c = num(o.c100, 0, 100);
    let kcal = num(o.kcal100, 0, 950);
    if (!name || grams == null || p == null || f == null || c == null) continue;
    if (p + f + c > 100.5) continue;
    const fromMacros = p * 4 + f * 9 + c * 4;
    // Если калорийность сильно расходится с БЖУ — берём расчёт по БЖУ.
    if (kcal == null || Math.abs(kcal - fromMacros) > Math.max(40, fromMacros * 0.35)) kcal = Math.round(fromMacros);
    items.push({ name, grams: Math.round(grams), kcal100: Math.round(kcal), p100: Math.round(p * 10) / 10, f100: Math.round(f * 10) / 10, c100: Math.round(c * 10) / 10 });
  }
  if (!items.length) return null;
  const u = num(r.uncertainty, 0.05, 0.6) ?? 0.25;
  return { title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 60) : items.map((i) => i.name).join(", ").slice(0, 60), uncertainty: u, items };
}
