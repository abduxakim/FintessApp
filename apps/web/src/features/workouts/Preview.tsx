import React, { useMemo, useState } from "react";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { activeSession, getState, liveSessions, useStore } from "../../data/store";
import type { SessionExercise } from "../../data/types";
import { useNav } from "../../app/nav";
import { startDraft } from "../../app/actions";
import { setDraftRemember, updateDraft, updateDraftExercise, useDraft } from "../../app/draft";
import { addSet, makeSessionExercise, moveItem, swapExercise } from "../../domain/session";
import { alternatives, isAvailable, zoneCaution } from "../../domain/availability";
import { exerciseForGroup, groupLoad, underloaded } from "../../domain/balance";
import { fmtClock, fmtKg } from "../../domain/format";
import { liftSummaries } from "../../domain/lifts";
import { MUSCLES } from "../../data/seed/labels";
import { emphasisOf } from "../../domain/emphasis";
import { EmphasisCard } from "../../ui/EmphasisCard";
import { Note, Segmented, Sheet, Stepper, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { ExercisePickerSheet } from "../profile/forms";
import { itemTarget } from "./ProgramDetail";

const BLOCK_LABEL = { warmup: "разминка", main: "", cooldown: "заминка" } as const;

function setSets(e: SessionExercise, n: number): SessionExercise {
  const target = Math.max(1, Math.min(10, n));
  let next = { ...e, targetSets: target };
  while (next.sets.length < target) next = addSet(next);
  return { ...next, sets: next.sets.slice(0, target) };
}

export function newItem(exId: string): SessionExercise {
  const ex = EXERCISE_BY_ID[exId];
  const st = getState();
  return makeSessionExercise({
    exercise: ex,
    block: ex.category === "stretch" ? "cooldown" : "main",
    sets: ex.tracking === "time" ? 2 : 3,
    repsMin: ex.tracking === "time" ? null : ex.mechanics === "compound" ? 6 : 10,
    repsMax: ex.tracking === "time" ? null : ex.mechanics === "compound" ? 10 : 15,
    durationSec: ex.tracking === "time" ? 30 : null,
    restSec: ex.mechanics === "compound" ? 120 : 60,
    profile: st.meta.profile,
    sessions: liveSessions(st),
  });
}

export function Preview() {
  const nav = useNav();
  const draft = useDraft();
  const state = useStore((s) => s);
  const [adding, setAdding] = useState(false);
  const [swapFor, setSwapFor] = useState<SessionExercise | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const profile = state.meta.profile;
  const loc = profile.locations[0] ?? "gym";
  const load = useMemo(() => groupLoad(liveSessions(state), EXERCISE_BY_ID, profile), [state, profile]);
  const sessionsMap = state.sessions;
  const lifts = useMemo(() => new Map(liftSummaries(Object.values(sessionsMap).filter((x) => !x.deletedAt), EXERCISE_BY_ID).map((l) => [l.exerciseId, l])), [sessionsMap]);

  if (!draft) {
    return (
      <>
        <TopBar title="Тренировка" onBack={nav.back} />
        <div className="screen">
          <p className="dim">Черновик тренировки не найден. Вернись и выбери тренировку снова.</p>
        </div>
      </>
    );
  }
  const s = draft.session;
  const inDraft = new Set(s.exercises.flatMap((e) => (EXERCISE_BY_ID[e.exerciseId]?.primary ?? []).map((m) => MUSCLES[m].group)));
  const missing = underloaded(load).filter((l) => !inDraft.has(l.group)).slice(0, 3);
  const active = activeSession(state);
  const mainCount = s.exercises.filter((e) => e.block === "main").length;

  const start = async () => {
    if (active) {
      toast("Сначала заверши текущую тренировку");
      nav.openWorkout();
      return;
    }
    if (!s.exercises.length) {
      toast("Добавь хотя бы одно упражнение");
      return;
    }
    await startDraft();
    nav.backThen(() => nav.openWorkout());
  };

  return (
    <>
      <TopBar title="План тренировки" onBack={nav.back} />
      <div className="screen">
        <div className="field">
          <label htmlFor="draft-title">Название</label>
          <input id="draft-title" className="input" value={s.title} maxLength={80} onChange={(e) => updateDraft((x) => ({ ...x, title: e.target.value }))} />
        </div>
        {draft.rationale && (
          <Note>
            {draft.planSource === "claude" ? "Claude: " : ""}
            {draft.rationale}
          </Note>
        )}
        <EmphasisCard e={emphasisOf(s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.targetSets, block: e.block })), EXERCISE_BY_ID)} />
        {draft.usesCarry && <p className="small" style={{ color: "var(--accent)" }}>Добавлено пропущенное с прошлой тренировки — отмечено в списке.</p>}

        {missing.length > 0 && (
          <div className="card tight">
            <div className="small">
              <b>За 7 дней мало нагрузки:</b> {missing.map((m) => `${m.group.toLowerCase()} (${m.sets} подх.)`).join(", ")}
            </div>
            <div className="chips">
              {missing.map((m) => {
                const ex = exerciseForGroup(m.group, EXERCISES, (e) => isAvailable(e, profile, loc), s.exercises.map((e) => e.exerciseId));
                return ex ? (
                  <button
                    key={m.group}
                    className="chip"
                    onClick={() => {
                      const item = newItem(ex.id);
                      updateDraft((x) => {
                        const cd = x.exercises.findIndex((e) => e.block === "cooldown");
                        const list = x.exercises.slice();
                        list.splice(cd < 0 ? list.length : cd, 0, item);
                        return { ...x, exercises: list };
                      });
                      toast(`Добавлено: ${ex.name}`);
                    }}
                  >
                    <Icon name="plus" size={16} /> {ex.name}
                  </button>
                ) : null;
              })}
            </div>
          </div>
        )}

        <div className="list">
          {s.exercises.map((e, i) => {
            const ex = EXERCISE_BY_ID[e.exerciseId];
            if (!ex) return null;
            return (
              <div key={e.id} className="list-item" style={{ alignItems: "flex-start" }}>
                <div className="grow stack gap-s">
                  <button style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => nav.push({ name: "exercise", id: ex.id })}>
                    <span className="title">{e.circuit ? `Круг ${e.circuit.stations.map((x) => x.reps).join("-")}` : ex.name}</span>
                  </button>
                  <button className="sub num" style={{ background: "none", border: 0, padding: 0, textAlign: "left", textDecoration: e.circuit ? "none" : "underline dotted" }} disabled={!!e.circuit} onClick={() => setEditId(e.id)} aria-label={`Изменить подходы и повторы: ${ex.name}`}>
                    {e.circuit
                      ? "сколько успеешь"
                      : `${itemTarget({ sets: e.targetSets, repsMin: e.repsMin ?? undefined, repsMax: e.repsMax ?? undefined, durationSec: e.durationSec ?? undefined })}${e.restSec ? ` · отдых ${fmtClock(e.restSec)}` : ""}`}
                    {BLOCK_LABEL[e.block] ? ` · ${BLOCK_LABEL[e.block]}` : ""}
                  </button>
                  {e.carried && <span className="xs" style={{ color: "var(--accent)" }}>добиваем с прошлой</span>}
                  {(() => {
                    const l = lifts.get(e.exerciseId);
                    if (!l?.next || e.block !== "main") return null;
                    const w = e.sets[0]?.weight;
                    if (l.next.kind === "increase") {
                      if (w === l.next.weight) return <span className="xs hint-up">▲ новый вес {fmtKg(w)} кг (было {fmtKg(l.last.weight)})</span>;
                      const caution = zoneCaution(ex, profile)?.limitsHeavy;
                      return <span className="xs hint-up">{caution ? `можно ${fmtKg(l.next.weight)} кг, если зона не беспокоит — вес не менял` : `совет: ${fmtKg(l.next.weight)} кг`}</span>;
                    }
                    return l.last.weight ? <span className="xs muted">прошлый раз {fmtKg(l.last.weight)} кг × {l.last.reps}</span> : null;
                  })()}
                  {e.swappedFromId && <span className="xs muted">вместо «{EXERCISE_BY_ID[e.swappedFromId]?.name}»</span>}
                  {!e.circuit && (
                    <div className="row">
                      <span className="xs muted">подходы</span>
                      <div className="stepper">
                        <button aria-label="Меньше подходов" onClick={() => updateDraftExercise(e.id, (x) => setSets(x, x.targetSets - 1))}>
                          <Icon name="minus" size={16} />
                        </button>
                        <span className="v">{e.targetSets}</span>
                        <button aria-label="Больше подходов" onClick={() => updateDraftExercise(e.id, (x) => setSets(x, x.targetSets + 1))}>
                          <Icon name="plus" size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="stack gap-s">
                  <div className="row" style={{ gap: 0 }}>
                    <button className="icon-btn" aria-label={`Выше: ${ex.name}`} disabled={i === 0} onClick={() => updateDraft((x) => ({ ...x, exercises: moveItem(x.exercises, i, -1) }))}>
                      <Icon name="up" size={18} />
                    </button>
                    <button className="icon-btn" aria-label={`Ниже: ${ex.name}`} disabled={i === s.exercises.length - 1} onClick={() => updateDraft((x) => ({ ...x, exercises: moveItem(x.exercises, i, 1) }))}>
                      <Icon name="down" size={18} />
                    </button>
                  </div>
                  <div className="row" style={{ gap: 0 }}>
                    {!e.circuit && (
                      <button className="icon-btn" aria-label={`Заменить: ${ex.name}`} onClick={() => setSwapFor(e)}>
                        <Icon name="swap" size={18} />
                      </button>
                    )}
                    <button className="icon-btn" aria-label={`Убрать: ${ex.name}`} onClick={() => updateDraftExercise(e.id, () => null)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!s.exercises.length && <div className="list-item muted">Пока пусто — добавь упражнения.</div>}
        </div>
        <div className="grid-2">
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Добавить упражнение
          </button>
          <button className="btn" onClick={() => nav.push({ name: "photo" })}>
            <Icon name="camera" size={18} /> По фото тренажёра
          </button>
        </div>
        <p className="xs muted">
          {mainCount} {mainCount === 1 ? "упражнение" : "упражнений"} в основной части. Нажми на подходы и повторы упражнения, чтобы их изменить.
        </p>
        {draft.source === "program" && s.programId && state.meta.enrollment?.programId === s.programId && (
          <label className="row small">
            <input id="draft-remember" type="checkbox" checked={!!draft.remember} onChange={(e) => setDraftRemember(e.target.checked)} />
            Запомнить изменения для следующих тренировок этого дня (подходы, повторы, отдых, добавленные упражнения)
          </label>
        )}
        <button className="btn primary big block" onClick={start}>
          <Icon name="play" size={18} /> Начать тренировку
        </button>
      </div>
      {adding && (
        <ExercisePickerSheet
          title="Добавить упражнение"
          exclude={s.exercises.map((e) => e.exerciseId)}
          onClose={() => setAdding(false)}
          onPick={(id) => {
            const item = newItem(id);
            updateDraft((x) => {
              const cd = x.exercises.findIndex((e) => e.block === "cooldown");
              const list = x.exercises.slice();
              list.splice(cd < 0 ? list.length : cd, 0, item);
              return { ...x, exercises: list };
            });
            setAdding(false);
          }}
        />
      )}
      {editId &&
        (() => {
          const e = s.exercises.find((x) => x.id === editId);
          if (!e) return null;
          const time = e.durationSec != null && e.repsMax == null;
          const upd = (patch: Partial<SessionExercise>) => updateDraftExercise(e.id, (x) => ({ ...x, ...patch }));
          return (
            <Sheet title={EXERCISE_BY_ID[e.exerciseId]?.name ?? "Упражнение"} onClose={() => setEditId(null)}>
              <Stepper label="Подходы" value={e.targetSets} min={1} max={10} onChange={(v) => updateDraftExercise(e.id, (x) => setSets(x, v))} />
              {time ? (
                <Stepper label="Секунды" value={e.durationSec ?? 30} min={10} max={600} step={5} onChange={(v) => upd({ durationSec: v })} />
              ) : (
                <>
                  <Stepper label="Повторы от" value={e.repsMin ?? 8} min={1} max={50} onChange={(v) => upd({ repsMin: v, repsMax: Math.max(v, e.repsMax ?? v) })} />
                  <Stepper label="Повторы до" value={e.repsMax ?? 12} min={1} max={60} onChange={(v) => upd({ repsMax: v, repsMin: Math.min(v, e.repsMin ?? v) })} />
                </>
              )}
              <Stepper label="Отдых" value={e.restSec} min={0} max={300} step={15} fmt={fmtClock} onChange={(v) => upd({ restSec: v })} />
              <div className="field">
                <span className="label">Часть тренировки</span>
                <Segmented
                  value={e.block}
                  onChange={(v) => upd({ block: v })}
                  options={[
                    { value: "warmup", label: "Разминка" },
                    { value: "main", label: "Основная" },
                    { value: "cooldown", label: "Заминка" },
                  ]}
                />
              </div>
              <button className="btn primary" onClick={() => setEditId(null)}>
                Готово
              </button>
            </Sheet>
          );
        })()}
      {swapFor && (
        <Sheet title="Заменить на…" onClose={() => setSwapFor(null)}>
          <div className="list">
            {alternatives(EXERCISE_BY_ID[swapFor.exerciseId], EXERCISES, profile, loc)
              .slice(0, 10)
              .map((a) => (
                <button
                  key={a.id}
                  className="list-item"
                  onClick={() => {
                    updateDraftExercise(swapFor.id, (x) => swapExercise(x, a, profile, liveSessions(getState())));
                    setSwapFor(null);
                  }}
                >
                  <span className="grow title">{a.name}</span>
                  <Icon name="swap" size={18} className="chev" />
                </button>
              ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
