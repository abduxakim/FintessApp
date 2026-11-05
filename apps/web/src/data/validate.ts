// Проверка формы данных, приходящих извне: из облака и из файла импорта.
// Не доверяем структуре — некорректные записи отбрасываются, а не ломают приложение.
import type { ExportFile, Program, UserMeta, WorkoutSession } from "./types";

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

export interface ParsedImport {
  meta: UserMeta | null;
  sessions: WorkoutSession[];
  programs: Program[];
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
  return { meta, sessions, programs, skipped: sessionsRaw.length - sessions.length + programsRaw.length - programs.length };
}
