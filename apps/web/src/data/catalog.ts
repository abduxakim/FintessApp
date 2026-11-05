import { EXERCISES, EXERCISE_BY_ID, PROGRESSIONS } from "./seed/exercises";
import { ALL_BUILTIN, BLOCKS, PROGRAMS } from "./seed/programs";
import type { Program } from "./types";
import type { State } from "./store";

export { EXERCISES, EXERCISE_BY_ID, PROGRESSIONS, PROGRAMS, BLOCKS };

const BUILTIN_BY_ID: Record<string, Program> = Object.fromEntries(ALL_BUILTIN.map((p) => [p.id, p]));

export function programById(s: State, id: string | null | undefined): Program | null {
  if (!id) return null;
  return s.programs[id] && !s.programs[id].deletedAt ? s.programs[id] : BUILTIN_BY_ID[id] ?? null;
}

export function allPrograms(s: State): Program[] {
  return [...PROGRAMS, ...Object.values(s.programs).filter((p) => !p.deletedAt && p.kind === "program")];
}

export function progressionFor(exerciseId: string) {
  return PROGRESSIONS.find((p) => p.steps.some((st) => st.exerciseId === exerciseId)) ?? null;
}
