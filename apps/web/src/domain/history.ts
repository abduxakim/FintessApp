import type { Exercise, SetLog, WorkoutSession } from "../data/types";
import { e1rm, setReps } from "./strength";

export interface Performance {
  sessionId: string;
  at: number;
  sets: SetLog[];
}

function doneSessionsDesc(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.status === "done" && !s.deletedAt).sort((a, b) => b.startedAt - a.startedAt);
}

/** Все выполнения упражнения, от новых к старым. */
export function exerciseHistory(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): Performance[] {
  const out: Performance[] = [];
  for (const s of doneSessionsDesc(sessions)) {
    if (s.id === excludeSessionId) continue;
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((x) => x.done && x.type === "work"));
    if (sets.length) out.push({ sessionId: s.id, at: s.startedAt, sets });
  }
  return out;
}

export function lastPerformance(exerciseId: string, sessions: WorkoutSession[], excludeSessionId?: string): Performance | null {
  return exerciseHistory(exerciseId, sessions, excludeSessionId)[0] ?? null;
}

export type RecordKind = "e1rm" | "weight" | "reps" | "duration";

export interface RecordEntry {
  kind: RecordKind;
  value: number;
  weight: number | null;
  reps: number | null;
  at: number;
  sessionId: string;
}

export type ExerciseRecords = Partial<Record<RecordKind, RecordEntry>>;

function candidates(s: SetLog, tracking: Exercise["tracking"] | undefined): { kind: RecordKind; value: number }[] {
  const reps = setReps(s);
  const out: { kind: RecordKind; value: number }[] = [];
  if (tracking === "time") {
    if (s.durationSec) out.push({ kind: "duration", value: s.durationSec });
    return out;
  }
  if (s.weight && reps) {
    out.push({ kind: "weight", value: s.weight });
    const one = e1rm(s.weight, reps);
    if (one) out.push({ kind: "e1rm", value: one });
  }
  if (reps && (!s.weight || tracking === "reps")) out.push({ kind: "reps", value: reps });
  return out;
}

/** Личные рекорды по всем завершённым тренировкам. */
export function computeRecords(sessions: WorkoutSession[], exerciseById: Record<string, Exercise>, before?: number): Map<string, ExerciseRecords> {
  const map = new Map<string, ExerciseRecords>();
  const list = sessions
    .filter((s) => s.status === "done" && !s.deletedAt && (before == null || s.startedAt < before))
    .sort((a, b) => a.startedAt - b.startedAt);
  for (const session of list) {
    for (const ex of session.exercises) {
      const tracking = exerciseById[ex.exerciseId]?.tracking;
      const rec = map.get(ex.exerciseId) ?? {};
      for (const s of ex.sets) {
        if (!s.done || s.type !== "work") continue;
        for (const c of candidates(s, tracking)) {
          const cur = rec[c.kind];
          if (!cur || c.value > cur.value + 1e-9) {
            rec[c.kind] = { kind: c.kind, value: c.value, weight: s.weight, reps: setReps(s), at: session.startedAt, sessionId: session.id };
          }
        }
      }
      map.set(ex.exerciseId, rec);
    }
  }
  return map;
}

export interface SessionPR {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  previous: number;
}

/** Рекорды, поставленные в этой тренировке (по сравнению со всеми предыдущими). Первое выполнение упражнения рекордом не считается. */
export function sessionPRs(session: WorkoutSession, sessions: WorkoutSession[], exerciseById: Record<string, Exercise>): SessionPR[] {
  const before = computeRecords(sessions.filter((s) => s.id !== session.id), exerciseById, session.startedAt);
  const now = computeRecords([{ ...session, status: "done" }], exerciseById);
  const out: SessionPR[] = [];
  for (const [exerciseId, rec] of now) {
    const prev = before.get(exerciseId);
    if (!prev) continue;
    for (const kind of ["e1rm", "weight", "reps", "duration"] as RecordKind[]) {
      const n = rec[kind];
      const p = prev[kind];
      if (n && p && n.value > p.value + 1e-9) out.push({ exerciseId, kind, value: n.value, previous: p.value });
    }
  }
  // Если вырос e1RM и вес — показываем один, самый понятный (вес).
  return out.filter((pr) => !(pr.kind === "e1rm" && out.some((o) => o.exerciseId === pr.exerciseId && o.kind === "weight")));
}
