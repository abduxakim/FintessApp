// Напоминания внутри приложения. У артефакта нет push-уведомлений, поэтому напоминания
// показываются, когда приложение открыто: на экране «Сегодня» и баннером сверху.
import type { DayLog, Reminders, WorkoutSession } from "../data/types";
import { minutesOf, startOfDay } from "./format";

export interface Due {
  kind: "water" | "workout" | "checkin";
  text: string;
}

export function dueReminders(r: Reminders | undefined, todayLog: DayLog | undefined, sessions: WorkoutSession[], now = Date.now()): Due[] {
  if (!r) return [];
  const out: Due[] = [];
  const d = new Date(now);
  const minute = d.getHours() * 60 + d.getMinutes();
  const from = minutesOf(r.activeFrom);
  const to = minutesOf(r.activeTo);
  // Окно может переходить через полночь (например, 10:00–01:00).
  const active = from <= to ? minute >= from && minute <= to : minute >= from || minute <= to;
  if (active && r.waterEveryMin) {
    const last = Math.max(0, ...(todayLog?.water ?? []).map((w) => w.at));
    const since = last ? (now - last) / 60000 : (minute - from + 1440) % 1440;
    if (since >= r.waterEveryMin) out.push({ kind: "water", text: last ? `Воду не отмечал ${Math.floor(since / 60)} ч — выпей стакан` : "Сегодня ещё не отмечал воду" });
  }
  if (active && r.checkin && !todayLog?.checkin && d.getHours() < 14) out.push({ kind: "checkin", text: "Отметь самочувствие — подскажу, как тренироваться сегодня" });
  if (r.workoutGapDays) {
    const last = sessions.filter((s) => s.status === "done" && !s.deletedAt).reduce((m, s) => Math.max(m, s.startedAt), 0);
    // Math.round: при переводе часов между полуночами 23 или 25 часов.
    const days = last ? Math.round((startOfDay(now) - startOfDay(last)) / 86400000) : null;
    if (days != null && days >= r.workoutGapDays && !todayLog?.rest) out.push({ kind: "workout", text: `Тренировки не было ${days} дн. — следующая уже ждёт` });
  }
  return out;
}
