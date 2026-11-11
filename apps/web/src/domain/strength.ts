import type { Exercise, SetLog, WorkoutSession } from "../data/types";

/** Оценка разового максимума по формуле Эпли. Для повторов > 12 точность падает — не считаем. */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Рабочий вес под верхнюю границу диапазона повторов, округлённый вниз до шага. */
export function weightForReps(oneRm: number, reps: number, step = 2.5): number {
  const raw = oneRm / (1 + reps / 30);
  return Math.max(step, Math.floor(raw / step) * step);
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Повторы подхода: для односторонних — меньшая из сторон (честная оценка). */
export function setReps(s: SetLog): number | null {
  if (s.repsL != null || s.repsR != null) {
    const sides = [s.repsL, s.repsR].filter((v): v is number => v != null);
    return sides.length ? Math.min(...sides) : null;
  }
  return s.reps;
}

/** Объём подхода, кг. Для односторонних считаются обе стороны. */
export function setVolume(s: SetLog): number {
  if (!s.done || !s.weight) return 0;
  if (s.repsL != null || s.repsR != null) return s.weight * ((s.repsL ?? 0) + (s.repsR ?? 0));
  return s.weight * (s.reps ?? 0);
}

export function sessionVolume(session: WorkoutSession): number {
  let v = 0;
  for (const ex of session.exercises) for (const s of ex.sets) if (s.type === "work") v += setVolume(s);
  return v;
}

/** Выполненные рабочие подходы. Круги кругового блока считаются отдельно (см. sessionRounds). */
export function sessionDoneSets(session: WorkoutSession): number {
  let n = 0;
  for (const ex of session.exercises) if (!ex.circuit) for (const s of ex.sets) if (s.done && s.type === "work") n++;
  return n;
}

export function isDoneSetMeaningful(s: SetLog, exercise: Exercise | undefined): boolean {
  if (!s.done) return false;
  if (exercise?.tracking === "time") return (s.durationSec ?? 0) > 0;
  return (setReps(s) ?? 0) > 0;
}

export function sessionRounds(session: WorkoutSession): number {
  let n = 0;
  for (const ex of session.exercises) if (ex.circuit) n += ex.sets.filter((s) => s.done).length;
  return n;
}
