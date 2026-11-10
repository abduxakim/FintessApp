// Единые пределы для ввода и проверки данных. Их используют и поля ввода, и проверка
// данных из облака/файла — иначе запись, сохранённая в интерфейсе, может не пройти проверку.
import type { BodyEntry } from "./types";

export const FOOD = { name: 80, grams: [1, 3000], kcal100: [0, 950], macro100: [0, 100], portionKcal: 5000, itemsPerMeal: 30 } as const;
export const DAY = { water: 200, waterMl: [1, 3000], meals: 40, title: 60, naps: 10, napMin: [5, 360], dayEndHour: [0, 6] } as const;
export const DISH = { max: 60, name: 60 } as const;

export const MEAL_TYPE_IDS = ["breakfast", "lunch", "dinner", "snack"] as const;

export interface BodyField {
  key: keyof BodyEntry;
  label: string;
  unit: "кг" | "см";
  max: number;
}

export const BODY_GENERAL: BodyField[] = [
  { key: "weightKg", label: "Вес", unit: "кг", max: 400 },
  { key: "waistCm", label: "Талия", unit: "см", max: 300 },
  { key: "chestCm", label: "Грудь", unit: "см", max: 300 },
];
export const BODY_PAIRS: BodyField[] = [
  { key: "armL", label: "Рука Л", unit: "см", max: 300 },
  { key: "armR", label: "Рука П", unit: "см", max: 300 },
  { key: "forearmL", label: "Предплечье Л", unit: "см", max: 300 },
  { key: "forearmR", label: "Предплечье П", unit: "см", max: 300 },
  { key: "thighL", label: "Бедро Л", unit: "см", max: 300 },
  { key: "thighR", label: "Бедро П", unit: "см", max: 300 },
];
export const BODY_FIELDS: BodyField[] = [...BODY_GENERAL, ...BODY_PAIRS];

export const clamp = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));
