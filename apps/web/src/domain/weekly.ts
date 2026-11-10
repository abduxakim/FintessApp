// Недельная сводка: тренировки, нагрузка, сон, вода, питание, самочувствие.
import type { DayLog, Exercise, Profile, WorkoutSession } from "../data/types";
import { dayId } from "../data/defaults";
import { minutesOf, startOfWeek } from "./format";
import { sessionDoneSets, sessionVolume } from "./strength";
import { groupLoad, type GroupLoad } from "./balance";
import { dayTotals, waterTotal } from "./nutrition";
import { dayReadiness, napMinutes } from "./recovery";
import { sessionPRs } from "./history";

export interface WeekSummary {
  from: number;
  to: number;
  workouts: number;
  sets: number;
  volume: number;
  minutes: number;
  prs: number;
  load: GroupLoad[];
  sleepAvg: number | null;
  sleepDays: number;
  /** Средний отбой в минутах от полуночи (может быть > 1440 — после полуночи). */
  bedAvg: number | null;
  /** Ночей с отбоем после часа ночи. */
  lateNights: number;
  napDays: number;
  napMin: number;
  waterAvg: number | null;
  kcalAvg: number | null;
  proteinAvg: number | null;
  foodDays: number;
  readinessAvg: number | null;
  weightStart: number | null;
  weightEnd: number | null;
}

/**
 * Режим сна за период: средний отбой, поздние отбои, дневной сон.
 * Отбой считается от полудня, чтобы 23:30 и 02:30 усреднялись в 01:00, а не в 13:00.
 */
export function sleepPattern(logs: DayLog[]): Pick<WeekSummary, "bedAvg" | "lateNights" | "napDays" | "napMin"> {
  const beds = logs.filter((d) => d.sleep).map((d) => (minutesOf(d.sleep!.bed) + 720) % 1440);
  const naps = logs.map(napMinutes).filter((m) => m > 0);
  return {
    bedAvg: beds.length ? beds.reduce((a, b) => a + b, 0) / beds.length + 720 : null,
    // 01:00–12:00 → 780–1440 минут от полудня.
    lateNights: beds.filter((m) => m >= 780).length,
    napDays: naps.length,
    napMin: naps.reduce((a, b) => a + b, 0),
  };
}

/** Последний известный вес: из замеров (новые сначала), иначе из профиля. */
export function latestWeight(days: Record<string, DayLog>, profile: Profile): number | null {
  const ids = Object.keys(days).sort().reverse();
  for (const id of ids) {
    const w = days[id].body?.weightKg;
    if (w) return w;
  }
  return profile.weightKg;
}

export function weekSummary(sessions: WorkoutSession[], days: Record<string, DayLog>, profile: Profile, byId: Record<string, Exercise>, weekOffset = 0, now = Date.now()): WeekSummary {
  const from = startOfWeek(now) - weekOffset * 7 * 86400000;
  const to = from + 7 * 86400000;
  const done = sessions.filter((s) => s.status === "done" && !s.deletedAt && s.startedAt >= from && s.startedAt < to);
  const dayIds: string[] = [];
  // Полдень каждого дня: граница дня (05:00) не сдвигает дату.
  for (let t = from + 12 * 3600000; t < to; t += 86400000) dayIds.push(dayId(t));
  const logs = dayIds.map((id) => days[id]).filter((d): d is DayLog => !!d);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sleeps = logs.map((d) => d.sleep?.hours).filter((x): x is number => x != null);
  const waters = logs.map((d) => waterTotal(d)).filter((x) => x > 0);
  const food = logs.filter((d) => d.meals.length);
  const ready = logs.map((d) => dayReadiness(d)?.score).filter((x): x is number => x != null);
  const pattern = sleepPattern(logs);
  const weights = logs.map((d) => d.body?.weightKg).filter((x): x is number => !!x);
  return {
    from,
    to,
    workouts: done.length,
    sets: done.reduce((n, s) => n + sessionDoneSets(s), 0),
    volume: done.reduce((n, s) => n + sessionVolume(s), 0),
    minutes: Math.round(done.reduce((n, s) => n + ((s.endedAt ?? s.startedAt) - s.startedAt), 0) / 60000),
    prs: done.reduce((n, s) => n + sessionPRs(s, sessions, byId).length, 0),
    load: groupLoad(done, byId, profile, to - 1, 7),
    sleepAvg: avg(sleeps),
    sleepDays: sleeps.length,
    ...pattern,
    waterAvg: avg(waters),
    kcalAvg: avg(food.map((d) => dayTotals(d).kcal)),
    proteinAvg: avg(food.map((d) => dayTotals(d).protein)),
    foodDays: food.length,
    readinessAvg: avg(ready),
    weightStart: weights[0] ?? null,
    weightEnd: weights[weights.length - 1] ?? null,
  };
}
