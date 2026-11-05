// Черновик тренировки для предпросмотра: собирается из программы, вручную или по запросу,
// редактируется до старта и не попадает в историю, пока не нажата «Начать тренировку».
import { useSyncExternalStore } from "react";
import type { SessionExercise, WorkoutSession } from "../data/types";

export interface Draft {
  session: WorkoutSession;
  usesCarry: boolean;
  source: "program" | "custom" | "plan";
  rationale?: string;
  planSource?: "claude" | "local";
}

let draft: Draft | null = null;
const listeners = new Set<() => void>();

export function getDraft(): Draft | null {
  return draft;
}
export function setDraft(d: Draft | null) {
  draft = d;
  listeners.forEach((l) => l());
}
export function updateDraft(fn: (s: WorkoutSession) => WorkoutSession) {
  if (!draft) return;
  setDraft({ ...draft, session: fn(draft.session) });
}
export function updateDraftExercise(id: string, fn: (e: SessionExercise) => SessionExercise | null) {
  updateDraft((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === id ? fn(e) : e)).filter((e): e is SessionExercise => !!e) }));
}
export function useDraft(): Draft | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
    () => draft,
  );
}
