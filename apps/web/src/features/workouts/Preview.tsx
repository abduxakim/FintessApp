import React, { useMemo, useState } from "react";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { activeSession, getState, liveSessions, useStore } from "../../data/store";
import type { SessionExercise } from "../../data/types";
import { useNav } from "../../app/nav";
import { startDraft } from "../../app/actions";
import { updateDraft, updateDraftExercise, useDraft } from "../../app/draft";
import { addSet, makeSessionExercise, moveItem, swapExercise } from "../../domain/session";
import { alternatives, isAvailable } from "../../domain/availability";
import { exerciseForGroup, groupLoad, underloaded } from "../../domain/balance";
import { fmtClock } from "../../domain/format";
import { MUSCLES } from "../../data/seed/labels";
import { Note, Sheet, TopBar, toast } from "../../ui/kit";
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
  const profile = state.meta.profile;
  const loc = profile.locations[0] ?? "gym";
  const load = useMemo(() => groupLoad(liveSessions(state), EXERCISE_BY_ID, profile), [state, profile]);

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
                  <span className="sub num">
                    {e.circuit
                      ? "сколько успеешь"
                      : `${itemTarget({ sets: e.targetSets, repsMin: e.repsMin ?? undefined, repsMax: e.repsMax ?? undefined, durationSec: e.durationSec ?? undefined })}${e.restSec ? ` · отдых ${fmtClock(e.restSec)}` : ""}`}
                    {BLOCK_LABEL[e.block] ? ` · ${BLOCK_LABEL[e.block]}` : ""}
                  </span>
                  {e.carried && <span className="xs" style={{ color: "var(--accent)" }}>добиваем с прошлой</span>}
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
          {mainCount} {mainCount === 1 ? "упражнение" : "упражнений"} в основной части. Изменения касаются только этой тренировки; чтобы поменять программу насовсем — «Изменить программу».
        </p>
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
