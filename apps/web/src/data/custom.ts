// Свои упражнения: проверка и регистрация в общем каталоге.
// Данные приходят от Claude или из облака, поэтому каждое поле проверяется.
import type { Exercise, MuscleId, Pattern, Tracking } from "./types";
import { EXERCISES, EXERCISE_BY_ID } from "./seed/exercises";
import { MUSCLES } from "./seed/labels";

export const CUSTOM_PATTERNS: Pattern[] = [
  "h_push", "v_push", "h_pull", "v_pull", "chest_fly", "pullover", "lateral_raise", "rear_delt", "biceps", "triceps",
  "squat", "hinge", "lunge", "knee_flexion", "knee_extension", "hip_extension", "calf", "core_anti_ext", "core_flex", "core_anti_rot", "wrist",
];
const TRACKING: Tracking[] = ["weight_reps", "reps", "time"];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const muscles = (v: unknown): MuscleId[] => (Array.isArray(v) ? [...new Set(v.filter((m): m is MuscleId => typeof m === "string" && Object.prototype.hasOwnProperty.call(MUSCLES, m)))].slice(0, 5) : []);

export function sanitizeCustom(raw: unknown, id?: string): Exercise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 60);
  const primary = muscles(r.primary);
  if (!name || !primary.length) return null;
  const exId = id ?? str(r.id, 60);
  if (!/^custom_[a-z0-9-]{4,48}$/.test(exId)) return null;
  const pattern = CUSTOM_PATTERNS.includes(r.pattern as Pattern) ? (r.pattern as Pattern) : "h_push";
  const tracking = TRACKING.includes(r.tracking as Tracking) ? (r.tracking as Tracking) : "weight_reps";
  const mistakes = Array.isArray(r.mistakes) ? r.mistakes.map((m) => str(m, 120)).filter(Boolean).slice(0, 4) : [];
  return {
    id: exId,
    name,
    nameEn: str(r.nameEn, 60),
    category: "strength",
    pattern,
    primary,
    secondary: muscles(r.secondary).filter((m) => !primary.includes(m)),
    equipment: ["machine"],
    locations: ["gym"],
    difficulty: 2,
    mechanics: primary.length > 1 ? "compound" : "isolation",
    unilateral: r.unilateral === true,
    tracking,
    loadStep: 5,
    technique: str(r.technique, 500) || "Описание не указано.",
    load: str(r.load, 300) || undefined,
    mistakes: mistakes.length ? mistakes : ["Слишком большой вес в ущерб технике"],
    review: "check",
  };
}

/** Добавляет свои упражнения в каталог (один раз на id). */
export function registerCustom(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const raw of list.slice(0, 200)) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== "string" || Object.prototype.hasOwnProperty.call(EXERCISE_BY_ID, id)) continue;
    const ex = sanitizeCustom(raw, id);
    if (!ex) continue;
    EXERCISES.push(ex);
    EXERCISE_BY_ID[ex.id] = ex;
  }
}
