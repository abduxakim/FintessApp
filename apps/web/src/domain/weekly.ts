// Недельная сводка: тренировки, нагрузка, сон, вода, питание, самочувствие.
import type { DayLog, Exercise, Profile, WorkoutSession } from "../data/types";
import { dayId } from "../data/defaults";
import { startOfWeek } from "./format";
import { sessionDoneSets, sessionVolume } from "./strength";
import { groupLoad, type GroupLoad } from "./balance";
import { dayTotals, waterTotal } from "./nutrition";
import { readiness } from "./recovery";
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
  waterAvg: number | null;
  kcalAvg: number | null;
  proteinAvg: number | null;
  foodDays: number;
  readinessAvg: number | null;
  weightStart: number | null;
  weightEnd: number | null;
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
  for (let t = from + 3600000; t < to; t += 86400000) dayIds.push(dayId(t));
  const logs = dayIds.map((id) => days[id]).filter((d): d is DayLog => !!d);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sleeps = logs.map((d) => d.sleep?.hours).filter((x): x is number => x != null);
  const waters = logs.map((d) => waterTotal(d)).filter((x) => x > 0);
  const food = logs.filter((d) => d.meals.length);
  const ready = logs.map((d) => readiness(d.checkin, d.sleep)?.score).filter((x): x is number => x != null);
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
    waterAvg: avg(waters),
    kcalAvg: avg(food.map((d) => dayTotals(d).kcal)),
    proteinAvg: avg(food.map((d) => dayTotals(d).protein)),
    foodDays: food.length,
    readinessAvg: avg(ready),
    weightStart: weights[0] ?? null,
    weightEnd: weights[weights.length - 1] ?? null,
  };
}
