import React, { useMemo } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { doneSessions, useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { liftSummaries, type LiftSummary } from "../../domain/lifts";
import { fmtKg, fmtShort } from "../../domain/format";
import { TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";

export function liftLine(l: LiftSummary, tracking: string | undefined): string {
  if (tracking === "time") return `${l.last.best} с`;
  if (l.last.weight) return `${fmtKg(l.last.weight)} кг × ${l.last.reps}`;
  return `${l.last.best} повт.`;
}

function Delta({ l, tracking }: { l: LiftSummary; tracking: string | undefined }) {
  if (l.sessions < 2 || !l.delta) return <span className="xs muted">{l.sessions < 2 ? "первый раз" : "без изменений"}</span>;
  const up = l.delta > 0;
  const unit = tracking === "time" ? " с" : l.last.weight ? " кг" : " повт.";
  return (
    <span className={"pill " + (up ? "good" : "warn")}>
      {up ? "▲" : "▼"} {fmtKg(Math.abs(l.delta))}
      {unit}
    </span>
  );
}

/** Список рабочих весов: последний результат, изменение, совет на следующий раз. */
export function LiftList({ limit }: { limit?: number }) {
  const nav = useNav();
  const sessions = useStore(doneSessions);
  const lifts = useMemo(() => liftSummaries(sessions, EXERCISE_BY_ID).filter((l) => EXERCISE_BY_ID[l.exerciseId]?.category !== "prehab"), [sessions]);
  if (!lifts.length) return <p className="small muted">Здесь появятся рабочие веса после первой тренировки.</p>;
  return (
    <div className="list">
      {lifts.slice(0, limit ?? lifts.length).map((l) => {
        const ex = EXERCISE_BY_ID[l.exerciseId];
        return (
          <button key={l.exerciseId} className="list-item" onClick={() => nav.push({ name: "exercise", id: l.exerciseId })}>
            <div className="grow stack gap-s">
              <div className="row">
                <span className="title grow ellipsis">{ex?.name ?? l.exerciseId}</span>
                <Delta l={l} tracking={ex?.tracking} />
              </div>
              <div className="sub num">
                {liftLine(l, ex?.tracking)} · {fmtShort(l.last.at)}
                {l.bestWeight > l.last.weight ? ` · лучший ${fmtKg(l.bestWeight)} кг` : ""}
              </div>
              {l.next && l.next.kind !== "reps" && <div className="hint-up xs">{l.next.text}</div>}
            </div>
            <Icon name="chev" className="chev" />
          </button>
        );
      })}
    </div>
  );
}

export function LiftsScreen() {
  const nav = useNav();
  return (
    <>
      <TopBar title="Рабочие веса" onBack={nav.back} />
      <div className="screen">
        <p className="small dim">Последний рабочий подход по каждому упражнению, изменение к прошлому разу и что делать дальше. Нажми на упражнение — откроется график.</p>
        <LiftList />
        <p className="xs muted">Совет «пора прибавить» появляется, когда все рабочие подходы дошли до верхней границы повторов. Для упражнений с проблемной зоной вес не подставляется автоматически.</p>
      </div>
    </>
  );
}
