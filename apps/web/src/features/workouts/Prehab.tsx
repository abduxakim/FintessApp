import React from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { getState, liveSessions, updateMeta, useStore } from "../../data/store";
import { PREHAB, prehabSteps, type PrehabIssue, type PrehabStep } from "../../data/seed/prehab";
import { ZONES } from "../../data/seed/labels";
import { useNav } from "../../app/nav";
import { setDraft } from "../../app/draft";
import { emptySession, makeSessionExercise } from "../../domain/session";
import { MedicalNote, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";

function stepText(s: PrehabStep): string {
  return s.sec ? `${s.sets} × ${s.sec} с` : `${s.sets} × ${s.reps![0] === s.reps![1] ? s.reps![0] : `${s.reps![0]}–${s.reps![1]}`}`;
}

function Group({ title, steps }: { title: string; steps: PrehabStep[] }) {
  const nav = useNav();
  if (!steps.length) return null;
  return (
    <div className="stack gap-s">
      <span className="xs muted">{title}</span>
      <div className="list">
        {steps.map((s) => (
          <button key={s.exerciseId} className="list-item" onClick={() => nav.push({ name: "exercise", id: s.exerciseId })}>
            <span className="grow title">{EXERCISE_BY_ID[s.exerciseId]?.name}</span>
            <span className="small num muted">{stepText(s)}</span>
            <Icon name="chev" className="chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrehabScreen() {
  const nav = useNav();
  const profile = useStore((s) => s.meta.profile);
  const myZones = new Set(profile.problemZones.map((z) => z.zone));
  const list = [...PREHAB].sort((a, b) => Number(myZones.has(b.zone)) - Number(myZones.has(a.zone)));

  const startNow = (i: PrehabIssue) => {
    const st = getState();
    const s = emptySession(`Профилактика: ${ZONES[i.zone].toLowerCase()}`);
    s.exercises = prehabSteps(i)
      .filter((p) => EXERCISE_BY_ID[p.exerciseId])
      .map((p) => makeSessionExercise({ exercise: EXERCISE_BY_ID[p.exerciseId], block: "main", sets: p.sets, repsMin: p.reps?.[0] ?? null, repsMax: p.reps?.[1] ?? null, durationSec: p.sec ?? null, restSec: 30, profile: st.meta.profile, sessions: liveSessions(st) }));
    setDraft({ session: s, usesCarry: false, source: "custom" });
    nav.push({ name: "preview" });
  };

  const toggle = (i: PrehabIssue) =>
    updateMeta((m) => ({ ...m, profile: { ...m.profile, prehabIssue: m.profile.prehabIssue === i.id ? null : i.id } })).then(() =>
      toast(getState().meta.profile.prehabIssue === i.id ? "Будет в разминке каждой программной тренировки" : "Убрано из разминки"),
    );

  return (
    <>
      <TopBar title="Профилактика" onBack={nav.back} />
      <div className="screen">
        <MedicalNote />
        <p className="small dim">Подборки для проблемных зон: подвижность, активация и укрепление стабилизаторов. Блок можно добавить в разминку всех программных тренировок или сделать отдельно.</p>
        {list.map((i) => {
          const on = profile.prehabIssue === i.id;
          return (
            <section key={i.id} className={"card" + (on ? " accent" : "")} aria-label={i.name}>
              <div className="row wrap">
                <span className="pill">{ZONES[i.zone]}</span>
                {myZones.has(i.zone) && <span className="pill accent">твоя зона</span>}
                {i.review === "check" && <span className="pill warn">лучше сверить со специалистом</span>}
              </div>
              <h2 style={{ fontSize: "var(--fs-l)" }}>{i.name}</h2>
              <p className="small dim">{i.about}</p>
              <Group title="Подвижность" steps={i.mobility} />
              <Group title="Активация" steps={i.activation} />
              <Group title="Укрепление" steps={i.strength} />
              <div className="grid-2">
                <button className={"btn" + (on ? "" : " primary")} onClick={() => toggle(i)}>
                  {on ? "Убрать из разминки" : "В разминку тренировок"}
                </button>
                <button className="btn" onClick={() => startNow(i)}>
                  Сделать сейчас
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
