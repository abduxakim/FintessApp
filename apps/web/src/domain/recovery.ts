// Готовность к тренировке по ежедневному чек-ину и сну. Это эвристика, а не медицинская оценка.
import type { Checkin, SessionExercise, SleepEntry, WorkoutSession } from "../data/types";

export type ReadinessLevel = "high" | "medium" | "low";

export interface Readiness {
  score: number;
  level: ReadinessLevel;
  title: string;
  advice: string;
  suggest: ("as_planned" | "lighten" | "mobility" | "rest")[];
}

/** 0–100. Чек-ин (энергия, мышцы, настроение, спокойствие) и сон: длительность и качество. */
export function readiness(checkin: Checkin | null, sleep: SleepEntry | null): Readiness | null {
  if (!checkin && !sleep) return null;
  const parts: { v: number; w: number }[] = [];
  if (checkin) {
    parts.push({ v: (checkin.energy - 1) / 4, w: 3 });
    parts.push({ v: (checkin.soreness - 1) / 4, w: 2.5 });
    parts.push({ v: (checkin.mood - 1) / 4, w: 1 });
    parts.push({ v: (checkin.stress - 1) / 4, w: 1.5 });
  }
  if (sleep) {
    // 7–9 часов — полный балл, меньше 5 — ноль.
    const h = Math.max(0, Math.min(1, (sleep.hours - 5) / 2));
    parts.push({ v: h, w: 2 });
    parts.push({ v: (sleep.quality - 1) / 4, w: 1.5 });
  }
  const w = parts.reduce((n, p) => n + p.w, 0);
  const score = Math.round((parts.reduce((n, p) => n + p.v * p.w, 0) / w) * 100);
  if (score >= 70) return { score, level: "high", title: "Готов к тренировке", advice: "Можно тренироваться по плану.", suggest: ["as_planned"] };
  if (score >= 45)
    return {
      score,
      level: "medium",
      title: "Средняя готовность",
      advice: "Лучше облегчить: на подход меньше в основных упражнениях и вес примерно на 10% ниже. Или замени тренировку мобильностью.",
      suggest: ["lighten", "mobility", "as_planned"],
    };
  return {
    score,
    level: "low",
    title: "Низкая готовность",
    advice: "Похоже, организму нужно восстановиться. Перенеси силовую на завтра или сделай лёгкую мобильность. Если плохое самочувствие держится — обратись к врачу.",
    suggest: ["mobility", "rest", "lighten"],
  };
}

/** Облегчённая версия тренировки: −1 подход в основной части (не меньше 2) и −10% веса. */
export function lightenSession(s: WorkoutSession, step = 2.5): WorkoutSession {
  const round = (w: number) => Math.max(0, Math.round((w * 0.9) / step) * step);
  const ex = (e: SessionExercise): SessionExercise => {
    if (e.block !== "main" || e.circuit) return e;
    const target = Math.max(2, e.targetSets - 1);
    return { ...e, targetSets: target, sets: e.sets.slice(0, target).map((x) => ({ ...x, weight: x.weight ? round(x.weight) : x.weight })), notes: e.notes || "Облегчено по самочувствию" };
  };
  return { ...s, title: `${s.title} (облегчённая)`, exercises: s.exercises.map(ex) };
}

/** Часы сна между отбоем и подъёмом («23:30» → «07:10» = 7,7 ч). */
export function sleepHours(bed: string, wake: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  let d = toMin(wake) - toMin(bed);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 10) / 10;
}
