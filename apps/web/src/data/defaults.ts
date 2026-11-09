import type { CircuitSettings, DayLog, Profile, Reminders, SavedDish, UserMeta } from "./types";
import { inRange, isFood } from "./validate";
import { DISH, FOOD } from "./limits";
import { EQUIPMENT_PRESETS } from "./seed/labels";

export const SCHEMA_VERSION = 1;

export function defaultCircuit(): CircuitSettings {
  return {
    enabled: false,
    position: "start",
    stations: [
      { exerciseId: "pull_up", reps: 5, weight: null },
      { exerciseId: "push_up", reps: 10, weight: null },
      { exerciseId: "bodyweight_squat", reps: 15, weight: null },
    ],
    targetRounds: null,
    timeCapMin: null,
    configured: false,
  };
}

export function defaultProfile(): Profile {
  return {
    heightCm: null,
    weightKg: null,
    sex: null,
    birthYear: null,
    level: "intermediate",
    goal: "definition",
    focusMuscles: [],
    focusExercises: [],
    locations: ["gym"],
    equipment: { gym: [...EQUIPMENT_PRESETS.gym], home: [...EQUIPMENT_PRESETS.home], outdoor: [...EQUIPMENT_PRESETS.outdoor] },
    daysPerWeek: 2,
    sessionMin: 90,
    preferredTime: "any",
    weakSide: null,
    problemZones: [],
    baselines: {},
    circuit: defaultCircuit(),
    prehabIssue: null,
  };
}

export function defaultMeta(now = Date.now()): UserMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarded: false,
    profile: defaultProfile(),
    goalHistory: [],
    enrollment: null,
    savedDishes: [],
    reminders: defaultReminders(),
    createdAt: now,
    // 0 — профиль ещё не редактировался: любая облачная версия новее.
    updatedAt: 0,
    rev: 0,
    deletedAt: null,
  };
}

/** Дополняет запись из старой версии недостающими полями. */
export function normalizeMeta(m: UserMeta): UserMeta {
  const base = defaultMeta(m.createdAt ?? Date.now());
  return {
    ...base,
    ...m,
    profile: {
      ...base.profile,
      ...m.profile,
      equipment: { ...base.profile.equipment, ...m.profile?.equipment },
      baselines: { ...m.profile?.baselines },
      circuit: { ...base.profile.circuit, ...m.profile?.circuit },
    },
    reminders: cleanReminders(m.reminders),
    savedDishes: cleanDishes(m.savedDishes),
  };
}

export function defaultReminders(): Reminders {
  return { waterEveryMin: 120, activeFrom: "09:00", activeTo: "22:00", workoutGapDays: 4, checkin: true };
}

export function emptyDay(id: string): DayLog {
  return { id, water: [], sleep: null, checkin: null, body: null, meals: [], createdAt: Date.now(), updatedAt: 0, rev: 0, deletedAt: null };
}

/** Локальная дата «YYYY-MM-DD». */
export function dayId(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const time = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
const intOrNull = (v: unknown, min: number, max: number) => (inRange(v, min, max) ? Math.round(v as number) : null);

/** Напоминания из облака или файла: неверные значения заменяются значениями по умолчанию. */
export function cleanReminders(r: unknown): Reminders {
  const d = defaultReminders();
  if (!r || typeof r !== "object") return d;
  const o = r as Record<string, unknown>;
  return {
    waterEveryMin: o.waterEveryMin === null ? null : intOrNull(o.waterEveryMin, 15, 600) ?? d.waterEveryMin,
    activeFrom: time(o.activeFrom, d.activeFrom),
    activeTo: time(o.activeTo, d.activeTo),
    workoutGapDays: o.workoutGapDays === null ? null : intOrNull(o.workoutGapDays, 1, 30) ?? d.workoutGapDays,
    checkin: typeof o.checkin === "boolean" ? o.checkin : d.checkin,
  };
}

/** Сохранённые блюда: только корректные продукты, иначе добавление блюда испортит дневник дня. */
export function cleanDishes(list: unknown): SavedDish[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d): d is SavedDish => !!d && typeof d === "object" && typeof (d as SavedDish).id === "string" && typeof (d as SavedDish).name === "string" && Array.isArray((d as SavedDish).items))
    .map((d) => ({ id: d.id, name: d.name.slice(0, DISH.name), items: d.items.filter(isFood).slice(0, FOOD.itemsPerMeal), uncertainty: inRange(d.uncertainty, 0, 1) ? d.uncertainty : 0.25, uses: typeof d.uses === "number" ? d.uses : 0 }))
    .filter((d) => d.items.length)
    .slice(-DISH.max);
}
