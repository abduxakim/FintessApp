import React, { useMemo, useState } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { getState, liveSessions, saveSession, useStore } from "../../data/store";
import type { CircuitStation, SessionExercise, WorkoutSession } from "../../data/types";
import { computeRecords, lastPerformance } from "../../domain/history";
import { fmtClock, fmtShort, parseNum, plural } from "../../domain/format";
import { newSet } from "../../domain/session";
import { STATION_LABEL, STATION_OPTIONS, stationKind } from "../../domain/circuit";
import { Sheet } from "../../ui/kit";
import { Icon } from "../../ui/icons";

async function mutateCircuit(sessionId: string, seId: string, fn: (e: SessionExercise) => SessionExercise) {
  const cur = getState().sessions[sessionId];
  if (!cur || cur.status !== "active") return;
  await saveSession({ ...cur, exercises: cur.exercises.map((e) => (e.id === seId ? fn(e) : e)) });
}

/** Выбор вариации для станции круга. */
export function StationPicker({ station, index, onPick, onClose }: { station: CircuitStation; index: number; onPick: (id: string) => void; onClose: () => void }) {
  const kind = stationKind(EXERCISE_BY_ID[station.exerciseId], index);
  return (
    <Sheet title={`Станция: ${STATION_LABEL[kind].toLowerCase()}`} onClose={onClose}>
      <div className="list">
        {STATION_OPTIONS[kind].map((id) => (
          <button key={id} className="list-item" onClick={() => onPick(id)}>
            <span className="grow title">{EXERCISE_BY_ID[id]?.name}</span>
            {id === station.exerciseId && <Icon name="check" className="chev" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function CircuitCard({ session, se, index, total, now, onMenu, onInfo }: { session: WorkoutSession; se: SessionExercise; index: number; total: number; now: number; onMenu: () => void; onInfo: () => void }) {
  const sessions = useStore(liveSessions);
  const [pick, setPick] = useState<number | null>(null);
  const last = useMemo(() => lastPerformance(se.exerciseId, sessions, session.id), [se.exerciseId, sessions, session.id]);
  const record = useMemo(() => computeRecords(sessions.filter((s) => s.id !== session.id), EXERCISE_BY_ID).get(se.exerciseId)?.rounds, [sessions, se.exerciseId, session.id]);
  const c = se.circuit!;
  const rounds = se.sets.filter((s) => s.done).length;
  const started = c.startedAt ?? null;
  const elapsed = started ? Math.max(0, (now - started) / 1000) : 0;
  const capLeft = c.timeCapMin && started ? c.timeCapMin * 60 - elapsed : null;

  const addRound = () =>
    mutateCircuit(session.id, se.id, (e) => ({
      ...e,
      circuit: { ...e.circuit!, startedAt: e.circuit!.startedAt ?? Date.now() },
      sets: [...e.sets, newSet({ done: true, doneAt: Date.now(), reps: 1 })],
    }));
  const removeRound = () => mutateCircuit(session.id, se.id, (e) => ({ ...e, sets: e.sets.slice(0, -1) }));
  const setStation = (i: number, patch: Partial<CircuitStation>) =>
    mutateCircuit(session.id, se.id, (e) => ({ ...e, circuit: { ...e.circuit!, stations: e.circuit!.stations.map((st, j) => (j === i ? { ...st, ...patch } : st)) } }));

  return (
    <article className={"wex" + (rounds > 0 ? " complete" : "")} aria-label="Круг 5-10-15">
      <div className="wex-head">
        <div className="grow stack gap-s">
          <button className="name" onClick={onInfo}>
            Круг {c.stations.map((s) => s.reps).join("-")}
          </button>
          <span className="small muted">
            {c.targetRounds ? `цель: ${c.targetRounds} ${plural(c.targetRounds, ["круг", "круга", "кругов"])}` : "сколько успеешь в своём темпе"}
            {c.timeCapMin ? ` · лимит ${c.timeCapMin} мин` : ""}
          </span>
        </div>
        <span className="xs muted num" style={{ paddingTop: 12 }}>
          {index + 1}/{total}
        </span>
        <button className="icon-btn" onClick={onMenu} aria-label="Действия: круг">
          <Icon name="more" />
        </button>
      </div>
      <div className="wex-meta">
        {last ? (
          <p className="last-time">
            Прошлый раз, {fmtShort(last.at)}: <b>{last.sets.length} {plural(last.sets.length, ["круг", "круга", "кругов"])}</b>
            {record && record.value > last.sets.length ? ` · рекорд ${record.value}` : ""}
          </p>
        ) : (
          <p className="last-time muted">Первый круг в приложении — отметь, сколько получилось.</p>
        )}
      </div>
      <div className="stations">
        {c.stations.map((st, i) => (
          <div key={i} className="station">
            <input
              className="set-input station-reps"
              inputMode="numeric"
              aria-label={`Повторы, станция ${i + 1}`}
              defaultValue={st.reps}
              onBlur={(e) => {
                const n = parseNum(e.target.value);
                if (n && n <= 100) void setStation(i, { reps: Math.round(n) });
                else e.target.value = String(st.reps);
              }}
            />
            <button className="station-name" onClick={() => setPick(i)}>
              <span className="ellipsis">{EXERCISE_BY_ID[st.exerciseId]?.name ?? st.exerciseId}</span>
              <Icon name="swap" size={16} className="chev" />
            </button>
            <input
              className="set-input station-kg"
              inputMode="decimal"
              placeholder="кг"
              aria-label={`Вес, станция ${i + 1}`}
              defaultValue={st.weight ?? ""}
              onBlur={(e) => void setStation(i, { weight: parseNum(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <div className="rounds">
        <button className="icon-btn filled" onClick={removeRound} disabled={!rounds} aria-label="Убрать круг">
          <Icon name="minus" />
        </button>
        <div className="rounds-value">
          <span className="big-number num">{rounds}</span>
          <span className="xs muted">{plural(rounds, ["круг", "круга", "кругов"])}</span>
        </div>
        <div className="grow stack gap-s" style={{ alignItems: "flex-end" }}>
          {started && (
            <span className={"clock" + (capLeft != null && capLeft <= 0 ? " over" : "")}>
              {capLeft != null ? (capLeft > 0 ? `осталось ${fmtClock(capLeft)}` : "время вышло") : fmtClock(elapsed)}
            </span>
          )}
          <button className="btn primary" onClick={addRound}>
            <Icon name="plus" size={18} /> Круг
          </button>
        </div>
      </div>
      {pick != null && (
        <StationPicker
          station={c.stations[pick]}
          index={pick}
          onClose={() => setPick(null)}
          onPick={(id) => {
            void setStation(pick, { exerciseId: id });
            setPick(null);
          }}
        />
      )}
    </article>
  );
}
