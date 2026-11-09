// Рабочие веса по упражнениям: последний результат, лучший, тренд и что делать в следующий раз.
import type { Exercise, SetLog, WorkoutSession } from "../data/types";
import { e1rm, setReps } from "./strength";
import { overloadHint, type OverloadHint } from "./overload";

export interface LiftPoint {
  at: number;
  /** Рабочий вес — самый тяжёлый выполненный подход. */
  weight: number;
  reps: number;
  e1rm: number | null;
  /** Для упражнений без веса — лучший подход по повторам/времени. */
  best: number;
}

export interface LiftSummary {
  exerciseId: string;
  points: LiftPoint[];
  last: LiftPoint;
  bestWeight: number;
  bestE1rm: number | null;
  /** Изменение рабочего веса (или повторов) к предыдущему разу. */
  delta: number;
  next: OverloadHint | null;
  sessions: number;
  lastSets: SetLog[];
}

function pointOf(sets: SetLog[], ex: Exercise | undefined, at: number): LiftPoint | null {
  const done = sets.filter((s) => s.done && s.type === "work");
  if (!done.length) return null;
  if (ex?.tracking === "time") {
    const best = Math.max(...done.map((s) => s.durationSec ?? 0));
    return best ? { at, weight: 0, reps: 0, e1rm: null, best } : null;
  }
  const top = done.reduce((a, b) => ((b.weight ?? 0) > (a.weight ?? 0) || ((b.weight ?? 0) === (a.weight ?? 0) && (setReps(b) ?? 0) > (setReps(a) ?? 0)) ? b : a));
  const reps = setReps(top) ?? 0;
  const ones = done.map((s) => e1rm(s.weight, setReps(s))).filter((x): x is number => x != null);
  return { at, weight: top.weight ?? 0, reps, e1rm: ones.length ? Math.max(...ones) : null, best: Math.max(...done.map((s) => setReps(s) ?? 0)) };
}

export function liftSummaries(sessions: WorkoutSession[], byId: Record<string, Exercise>): LiftSummary[] {
  const map = new Map<string, { points: LiftPoint[]; lastSets: SetLog[]; repsMin: number | null; repsMax: number | null }>();
  const list = sessions.filter((s) => s.status === "done" && !s.deletedAt).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of list) {
    for (const e of s.exercises) {
      const ex = byId[e.exerciseId];
      if (!ex || e.circuit || ex.category === "warmup" || ex.category === "stretch" || ex.category === "mobility" || ex.category === "cardio") continue;
      const p = pointOf(e.sets, ex, s.startedAt);
      if (!p) continue;
      const cur = map.get(e.exerciseId) ?? { points: [], lastSets: [], repsMin: null, repsMax: null };
      cur.points.push(p);
      cur.lastSets = e.sets.filter((x) => x.done && x.type === "work");
      cur.repsMin = e.repsMin;
      cur.repsMax = e.repsMax;
      map.set(e.exerciseId, cur);
    }
  }
  const out: LiftSummary[] = [];
  for (const [exerciseId, v] of map) {
    const ex = byId[exerciseId];
    const last = v.points[v.points.length - 1];
    const prev = v.points[v.points.length - 2];
    const metric = (p: LiftPoint) => (p.weight ? p.weight : p.best);
    out.push({
      exerciseId,
      points: v.points,
      last,
      bestWeight: Math.max(...v.points.map((p) => p.weight)),
      bestE1rm: v.points.some((p) => p.e1rm) ? Math.max(...v.points.map((p) => p.e1rm ?? 0)) : null,
      delta: prev ? metric(last) - metric(prev) : 0,
      next: ex ? overloadHint(ex, v.lastSets, v.repsMin, v.repsMax) : null,
      sessions: v.points.length,
      lastSets: v.lastSets,
    });
  }
  return out.sort((a, b) => b.last.at - a.last.at);
}
