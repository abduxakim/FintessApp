import React, { useState } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import type { WorkoutSession } from "../../data/types";
import type { NextAction, SessionReview } from "../../domain/review";
import type { SessionPR } from "../../domain/history";
import { fmtDuration, fmtTonnage, plural } from "../../domain/format";
import { sessionDoneSets, sessionVolume } from "../../domain/strength";
import { applyNextAction, rememberSessionChanges } from "../../app/actions";
import { useStore } from "../../data/store";
import { Icon } from "../../ui/icons";
import { fmtRecord, RECORD_LABEL } from "../progress/shared";

const ACTION_TEXT: Record<NextAction, { title: string; sub: (r: SessionReview, day: string | null, next: string | null) => string }> = {
  continue: { title: "Идём дальше по плану", sub: (_r, _d, next) => (next ? `Следующая — «${next}»` : "Следующая тренировка по программе") },
  carry: {
    title: "Добить пропущенное в следующей",
    sub: (r) => r.carry.map((c) => `${EXERCISE_BY_ID[c.exerciseId]?.name} ${c.sets}×`).join(", "),
  },
  repeat: { title: "Повторить этот день", sub: (_r, day) => (day ? `В следующий раз снова «${day}»` : "В следующий раз — тот же день") },
};

/** Сводка по плану: выполнение, группы мышц, пропуски и советы. Используется в итоге и в истории. */
export function ReviewBlock({ review }: { review: SessionReview }) {
  if (!review.fromProgram && !review.exercises.length) return null;
  const pct = Math.round(review.completion * 100);
  const missed = [...review.skipped, ...review.partial];
  return (
    <section className="section">
      <div className="section-head">
        <h2>Сводка</h2>
        {review.fromProgram && <span className={"pill " + (pct >= 85 ? "good" : pct >= 50 ? "warn" : "bad")}>План: {pct}%</span>}
      </div>
      <div className="card tight">
        {review.fromProgram && (
          <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Выполнение плана">
            <span style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
        {review.groups.length > 0 && (
          <div className="chips">
            {review.groups.map((g) => (
              <span key={g.group} className={"pill " + (g.done >= g.planned ? "good" : g.done / g.planned >= 0.5 ? "" : "warn")}>
                {g.group} <span className="num">{g.done}/{g.planned}</span>
              </span>
            ))}
          </div>
        )}
        {missed.length > 0 && (
          <ul className="stack gap-s small" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {missed.map((e) => (
              <li key={e.exerciseId} className="row">
                <span className="grow ellipsis">{EXERCISE_BY_ID[e.exerciseId]?.name}</span>
                <span className="num muted">{e.status === "skipped" ? "пропущено" : `${e.done} из ${e.planned}`}</span>
              </li>
            ))}
          </ul>
        )}
        {review.rounds > 0 && (
          <p className="small">
            Круг 5-10-15: <b className="num">{review.rounds}</b> {plural(review.rounds, ["круг", "круга", "кругов"])}
          </p>
        )}
        {review.advice.map((a) => (
          <p key={a} className="small dim">
            {a}
          </p>
        ))}
      </div>
    </section>
  );
}

export function SummaryView({ session, prs, review, dayName, nextDayName, onDone }: { session: WorkoutSession; prs: SessionPR[]; review: SessionReview; dayName: string | null; nextDayName: string | null; onDone: () => void }) {
  const [choice, setChoice] = useState<NextAction>(review.recommended);
  const [busy, setBusy] = useState(false);
  // Что можно перенести в программу: подходов сделано больше плана или упражнение добавлено по ходу.
  const enrolled = useStore((st) => st.meta.enrollment?.programId === session.programId && session.programId != null);
  const changes = enrolled
    ? session.exercises
        .filter((e) => e.block === "main" && !e.circuit && !e.carried)
        .map((e) => {
          const done = e.sets.filter((x) => x.done).length;
          if (e.plannedItemId && done > e.targetSets) return { id: e.id, exerciseId: e.exerciseId, text: `${done} подходов вместо ${e.targetSets}` };
          if (!e.plannedItemId && done > 0) return { id: e.id, exerciseId: e.exerciseId, text: `добавлено по ходу — ${done} подх.` };
          return null;
        })
        .filter((x): x is { id: string; exerciseId: string; text: string } => !!x)
    : [];
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const dur = (session.endedAt ?? Date.now()) - session.startedAt;
  const sets = sessionDoneSets(session);
  const done = async () => {
    setBusy(true);
    if (review.fromProgram && review.actions.length > 1) await applyNextAction(session, choice, review.carry);
    if (keep.size) await rememberSessionChanges(session, { useDoneSets: true, only: [...keep] });
    onDone();
  };
  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <span className="eyebrow">Тренировка завершена</span>
      <h1 className="hero-title">{session.title}</h1>
      <div className="stats">
        <div className="stat card tight">
          <span className="v">{fmtDuration(dur)}</span>
          <span className="k">время</span>
        </div>
        <div className="stat card tight">
          <span className="v">{sets}</span>
          <span className="k">{plural(sets, ["подход", "подхода", "подходов"])}</span>
        </div>
        <div className="stat card tight">
          <span className="v">{fmtTonnage(sessionVolume(session))}</span>
          <span className="k">объём</span>
        </div>
      </div>

      <ReviewBlock review={review} />

      {review.fromProgram && review.actions.length > 1 && (
        <section className="section">
          <div className="section-head">
            <h2>Что дальше</h2>
          </div>
          <div className="stack gap-s" role="radiogroup" aria-label="Что дальше">
            {review.actions.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={choice === a} className={"option" + (choice === a ? " on" : "")} onClick={() => setChoice(a)}>
                <div className="grow">
                  <div className="title">
                    {ACTION_TEXT[a].title}
                    {a === review.recommended && <span className="pill accent" style={{ marginLeft: 8 }}>совет</span>}
                  </div>
                  <div className="sub">{ACTION_TEXT[a].sub(review, dayName, nextDayName)}</div>
                </div>
                {choice === a && <Icon name="check" />}
              </button>
            ))}
          </div>
        </section>
      )}

      {changes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Запомнить для следующих раз?</h2>
          </div>
          <div className="list">
            {changes.map((c) => (
              <label key={c.id} className="list-item">
                <input
                  type="checkbox"
                  checked={keep.has(c.id)}
                  onChange={() =>
                    setKeep((k) => {
                      const n = new Set(k);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                />
                <div className="grow">
                  <div className="title">{EXERCISE_BY_ID[c.exerciseId]?.name}</div>
                  <div className="sub">{c.text}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="xs muted">Отмеченное сохранится в этом дне программы: следующая такая тренировка будет с этими подходами и упражнениями.</p>
        </section>
      )}

      {prs.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Новые рекорды</h2>
          </div>
          <div className="list">
            {prs.map((pr) => (
              <div key={pr.exerciseId + pr.kind} className="list-item">
                <Icon name="trophy" className="chev" />
                <div className="grow">
                  <div className="title">{EXERCISE_BY_ID[pr.exerciseId]?.name}</div>
                  <div className="sub">
                    {RECORD_LABEL[pr.kind]}: {fmtRecord(pr.kind, pr.previous)} → <b style={{ color: "var(--accent)" }}>{fmtRecord(pr.kind, pr.value)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        sets > 0 && <p className="dim small">Рекордов в этот раз нет — это нормально. Главное — регулярность.</p>
      )}
      <button className="btn primary big block" onClick={done} disabled={busy}>
        Готово
      </button>
    </div>
  );
}
