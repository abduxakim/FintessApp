import React, { useMemo } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { doneSessions, liveSessions, today, useStore } from "../../data/store";
import { dayId } from "../../data/defaults";
import type { ProgramDay } from "../../data/types";
import { useNav } from "../../app/nav";
import { updateDay } from "../../data/store";
import { liftSummaries } from "../../domain/lifts";
import { nextWorkoutHints } from "../../domain/advice";
import { underloaded, type GroupLoad } from "../../domain/balance";
import { pickVariant } from "../../domain/session";
import { zoneCaution } from "../../domain/availability";
import { dueReminders } from "../../domain/reminders";
import { Icon } from "../../ui/icons";

/** Рекомендации на сегодня: веса на следующую тренировку, недогруженные группы, напоминания. */
export function Recommendations({ day, cycle, load }: { day: ProgramDay | null; cycle: number; load: GroupLoad[] }) {
  const nav = useNav();
  const state = useStore((s) => s);
  const sessions = useStore(doneSessions);
  const log = useStore((s) => today(s));
  const lifts = useMemo(() => liftSummaries(sessions, EXERCISE_BY_ID), [sessions]);
  const items = day ? day.items.map((it) => ({ ...it, exerciseId: pickVariant(it, cycle) })) : [];
  const caution = new Set(items.filter((it) => EXERCISE_BY_ID[it.exerciseId] && zoneCaution(EXERCISE_BY_ID[it.exerciseId], state.meta.profile)?.limitsHeavy).map((it) => it.exerciseId));
  const hints = nextWorkoutHints(items, lifts, EXERCISE_BY_ID, caution).slice(0, 4);
  const low = underloaded(load).slice(0, 2);
  const due = dueReminders(state.meta.reminders, log, liveSessions(state));
  if (!hints.length && !low.length && !due.length) return null;
  return (
    <section className="card tight" aria-label="Рекомендации">
      <span className="eyebrow">Рекомендации</span>
      {due.map((d) => (
        <div key={d.kind} className="row small" style={{ alignItems: "flex-start" }}>
          <Icon name={d.kind === "water" ? "info" : d.kind === "workout" ? "dumbbell" : "user"} size={16} className="chev" />
          <span className="grow">{d.text}</span>
          {d.kind === "water" && (
            <button className="btn small" onClick={() => updateDay(dayId(), (x) => ({ ...x, water: [...x.water, { at: Date.now(), ml: 300 }] }))}>
              +300 мл
            </button>
          )}
        </div>
      ))}
      {hints.length > 0 && day && (
        <div className="stack gap-s">
          <span className="small dim">Следующая тренировка «{day.name}» — по прошлым результатам:</span>
          {hints.map((h) => (
            <button key={h.exerciseId} className="row small" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => nav.push({ name: "exercise", id: h.exerciseId })}>
              <span className={h.kind === "increase" ? "hint-up" : "dim"}>{h.kind === "increase" ? "▲" : "•"}</span>
              <span className="grow">
                {EXERCISE_BY_ID[h.exerciseId]?.name}: <b className="num">{h.text}</b>
              </span>
            </button>
          ))}
          {hints.some((h) => h.kind === "increase" && !caution.has(h.exerciseId)) && <span className="xs muted">Новые веса уже подставлены в план тренировки.</span>}
        </div>
      )}
      {low.length > 0 && (
        <p className="small">
          За 7 дней мало нагрузки: {low.map((l) => `${l.group.toLowerCase()} (${l.sets} из ${l.target} подх.)`).join(", ")}. В плане тренировки можно добавить их одним нажатием.
        </p>
      )}
    </section>
  );
}
