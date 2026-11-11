// Проверка формы данных, приходящих извне: из облака и из файла импорта.
// Не доверяем структуре — некорректные записи отбрасываются, а не ломают приложение.
import type { DayLog, ExportFile, FoodItem, Program, UserMeta, WorkoutSession } from "./types";
import { BODY_FIELDS, DAY, FOOD, MEAL_TYPE_IDS } from "./limits";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || v === undefined || (isNum(v) && v >= 0 && v < 100000);

function isSet(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && typeof v.done === "boolean" && isNumOrNull(v.weight) && isNumOrNull(v.reps) && isNumOrNull(v.repsL) && isNumOrNull(v.repsR) && isNumOrNull(v.durationSec);
}

function isCircuit(v: unknown): boolean {
  return v === undefined || (isObj(v) && Array.isArray(v.stations) && v.stations.length <= 10 && v.stations.every((st) => isObj(st) && isStr(st.exerciseId, 80) && isNum(st.reps)));
}

function isSessionExercise(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.exerciseId, 80) &&
    Array.isArray(v.sets) &&
    v.sets.length <= 100 &&
    v.sets.every(isSet) &&
    (v.notes === undefined || isStr(v.notes, 2000)) &&
    isCircuit(v.circuit)
  );
}

export function isSession(v: unknown): v is WorkoutSession {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.title, 300) &&
    ["active", "done", "abandoned"].includes(v.status as string) &&
    isNum(v.startedAt) &&
    isNum(v.updatedAt) &&
    Array.isArray(v.exercises) &&
    v.exercises.length <= 60 &&
    v.exercises.every(isSessionExercise) &&
    (v.notes === undefined || isStr(v.notes, 4000))
  );
}

export function isProgram(v: unknown): v is Program {
  return (
    isObj(v) &&
    isStr(v.id) &&
    v.owner === "user" &&
    isStr(v.name, 200) &&
    isNum(v.updatedAt) &&
    Array.isArray(v.days) &&
    v.days.length <= 14 &&
    v.days.every((d) => isObj(d) && isStr(d.id) && Array.isArray(d.items) && d.items.length <= 40)
  );
}

export function isMeta(v: unknown): v is UserMeta {
  if (!isObj(v) || !isNum(v.updatedAt) || !isObj(v.profile)) return false;
  const p = v.profile;
  return isObj(p.equipment) && Array.isArray(p.locations) && Array.isArray(p.problemZones) && Array.isArray(p.focusMuscles);
}

export const inRange = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Продукт в приёме пищи — по тем же пределам, что и ввод (`limits.ts`). */
export function isFood(v: unknown): v is FoodItem {
  const m = FOOD.macro100;
  return isObj(v) && isStr(v.name, FOOD.name) && inRange(v.grams, ...FOOD.grams) && inRange(v.kcal100, ...FOOD.kcal100) && inRange(v.p100, ...m) && inRange(v.f100, ...m) && inRange(v.c100, ...m);
}


/**
 * Мягкая проверка дневника из облака или файла: плохие записи внутри дня отбрасываются,
 * а остальной день сохраняется. Так одна ошибка ввода не стирает весь день при синхронизации.
 * null — только если повреждена сама структура (id, метка времени).
 */
export function sanitizeDay(v: unknown): DayLog | null {
  if (!isObj(v) || !isStr(v.id, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(v.id) || !isNum(v.updatedAt)) return null;
  const water = (Array.isArray(v.water) ? v.water : []).filter((w) => isObj(w) && isNum(w.at) && inRange(w.ml, ...DAY.waterMl)).slice(0, DAY.water) as DayLog["water"];
  const sleep = isObj(v.sleep) && isStr(v.sleep.bed, 5) && isStr(v.sleep.wake, 5) && inRange(v.sleep.hours, 0, 24) && inRange(v.sleep.quality, 1, 5) ? (v.sleep as unknown as DayLog["sleep"]) : null;
  const naps = (Array.isArray(v.naps) ? v.naps : []).filter((n) => isObj(n) && isNum(n.at) && inRange(n.min, ...DAY.napMin)).slice(0, DAY.naps) as NonNullable<DayLog["naps"]>;
  const checkin = isObj(v.checkin) && ["energy", "soreness", "mood", "stress"].every((k) => inRange((v.checkin as Record<string, unknown>)[k], 1, 5)) ? (v.checkin as unknown as DayLog["checkin"]) : null;
  const body = isObj(v.body) ? (Object.fromEntries(BODY_FIELDS.filter((f) => inRange((v.body as Record<string, unknown>)[f.key], 0.1, f.max)).map((f) => [f.key, (v.body as Record<string, unknown>)[f.key]])) as DayLog["body"]) : null;
  const meals = (Array.isArray(v.meals) ? v.meals : [])
    .filter((m) => isObj(m) && isStr(m.id) && isNum(m.at) && isStr(m.title, 120) && Array.isArray(m.items))
    .map((m) => ({
      ...(m as Record<string, unknown>),
      type: MEAL_TYPE_IDS.includes((m as Record<string, unknown>).type as never) ? (m as Record<string, unknown>).type : "snack",
      uncertainty: inRange((m as Record<string, unknown>).uncertainty, 0, 1) ? (m as Record<string, unknown>).uncertainty : 0.25,
      items: ((m as Record<string, unknown>).items as unknown[]).filter(isFood).slice(0, FOOD.itemsPerMeal),
    }))
    .filter((m) => (m.items as unknown[]).length)
    .slice(0, DAY.meals) as unknown as DayLog["meals"];
  return {
    id: v.id,
    water,
    sleep,
    ...(naps.length ? { naps } : {}),
    checkin,
    body: body && Object.keys(body).length ? body : null,
    meals,
    rest: v.rest === true,
    createdAt: isNum(v.createdAt) ? v.createdAt : v.updatedAt,
    updatedAt: v.updatedAt,
    rev: isNum(v.rev) ? v.rev : 0,
    deletedAt: null,
  };
}

export interface ParsedImport {
  meta: UserMeta | null;
  sessions: WorkoutSession[];
  programs: Program[];
  days: DayLog[];
  skipped: number;
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function parseImport(text: string): ParsedImport {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("Файл слишком большой");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Это не JSON-файл");
  }
  if (!isObj(raw) || raw.app !== "fitness-app") throw new Error("Это не файл бэкапа этого приложения");
  const file = raw as unknown as ExportFile;
  const sessionsRaw = Array.isArray(file.sessions) ? file.sessions : [];
  const programsRaw = Array.isArray(file.programs) ? file.programs : [];
  const sessions = sessionsRaw.filter(isSession);
  const programs = programsRaw.filter(isProgram);
  const meta = isMeta(file.meta) ? file.meta : null;
  const daysRaw = Array.isArray(file.days) ? file.days : [];
  const days = daysRaw.map(sanitizeDay).filter((d): d is DayLog => !!d);
  return { meta, sessions, programs, days, skipped: sessionsRaw.length - sessions.length + programsRaw.length - programs.length + daysRaw.length - days.length };
}
