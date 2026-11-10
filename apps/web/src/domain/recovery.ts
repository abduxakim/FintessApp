// Готовность к тренировке по ежедневному чек-ину и сну. Это эвристика, а не медицинская оценка.
import type { Checkin, DayLog, NapEntry, SessionExercise, SleepEntry, WorkoutSession } from "../data/types";
import { minutesOf } from "./format";

export type ReadinessLevel = "high" | "medium" | "low";

export interface Readiness {
  score: number;
  level: ReadinessLevel;
  title: string;
  advice: string;
  suggest: ("as_planned" | "lighten" | "mobility" | "rest")[];
}

/** Минуты дневного сна за день. */
export const napMinutes = (d: Pick<DayLog, "naps"> | undefined) => (d?.naps ?? []).reduce((n, x) => n + x.min, 0);

/** Готовность по дневнику дня: чек-ин, ночной сон и дневной сон. */
export const dayReadiness = (d: DayLog) => readiness(d.checkin, d.sleep, napMinutes(d));

/**
 * 0–100. Чек-ин (энергия, мышцы, настроение, спокойствие) и сон: длительность и качество.
 * Дневной сон добавляется к ночному, но не больше 2 часов: он лишь частично заменяет ночной.
 */
export function readiness(checkin: Checkin | null, sleep: SleepEntry | null, napMin = 0): Readiness | null {
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
    const total = sleep.hours + Math.min(120, napMin) / 60;
    const h = Math.max(0, Math.min(1, (total - 5) / 2));
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

/**
 * Подсказка к дневному сну. Общая рекомендация гигиены сна, не медицинская:
 * длинный (больше ~45 мин) или поздний (начался после 17:00) дневной сон часто сдвигает ночной отбой.
 */
export function napHint(nap: NapEntry): string | null {
  const start = new Date(nap.at - nap.min * 60000).getHours();
  const late = start >= 17 && start < 23;
  if (!late && nap.min <= 45) return null;
  return `${late ? "Вечерний" : "Длинный"} дневной сон часто мешает уснуть ночью. Обычно советуют спать днём 20–30 минут и не позже 15–16 часов. Если потом долго не спишь — попробуй сократить его.`;
}

/** Часы сна между отбоем и подъёмом («23:30» → «07:10» = 7,7 ч). */
export function sleepHours(bed: string, wake: string): number {
  let d = minutesOf(wake) - minutesOf(bed);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 10) / 10;
}
