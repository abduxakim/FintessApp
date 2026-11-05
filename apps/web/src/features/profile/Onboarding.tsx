import React, { useMemo, useState } from "react";
import type { Profile } from "../../data/types";
import { getState, updateMeta } from "../../data/store";
import { EXERCISES, EXERCISE_BY_ID, PROGRAMS } from "../../data/catalog";
import { recommendPrograms } from "../../domain/recommend";
import { enroll } from "../../app/actions";
import { BaselinesSection, BodySection, GoalSection, HealthSection, PlaceSection } from "./forms";
import { RecommendationList } from "../workouts/Recommend";
import { Icon } from "../../ui/icons";

const STEPS = [
  { title: "Тело и опыт", hint: "Пара цифр, чтобы подобрать нагрузку" },
  { title: "Цель и фокус", hint: "Что хочешь получить от тренировок" },
  { title: "Где и когда", hint: "Место, оборудование и график" },
  { title: "Здоровье и баланс", hint: "Проблемные зоны и асимметрия" },
  { title: "Твои результаты", hint: "Для стартовых весов — можно пропустить" },
  { title: "Твоя программа", hint: "Подобрана по ответам — можно выбрать другую" },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(() => getState().meta.profile);
  const set = (patch: Partial<Profile>) => setP((cur) => ({ ...cur, ...patch }));
  const recs = useMemo(() => (step === 5 ? recommendPrograms(p, PROGRAMS, EXERCISE_BY_ID, EXERCISES) : []), [step, p]);

  const finish = async (programId: string | null) => {
    await updateMeta((m) => ({ ...m, onboarded: true, profile: p, goalHistory: m.goalHistory.length ? m.goalHistory : [{ goal: p.goal, at: Date.now() }] }));
    if (programId) await enroll(programId);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app" style={{ paddingBottom: 24 }}>
      <div className="screen">
        <div className="stack" style={{ paddingTop: 12 }}>
          <div className="progress-dots" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={i <= step ? "on" : ""} />
            ))}
          </div>
          {step === 0 && <p className="eyebrow">Добро пожаловать</p>}
          <h1 className="hero-title">{STEPS[step].title}</h1>
          <p className="dim">{STEPS[step].hint}</p>
        </div>
        {step === 0 && <BodySection p={p} set={set} />}
        {step === 1 && <GoalSection p={p} set={set} />}
        {step === 2 && <PlaceSection p={p} set={set} />}
        {step === 3 && <HealthSection p={p} set={set} />}
        {step === 4 && <BaselinesSection p={p} set={set} />}
        {step === 5 && <RecommendationList recs={recs.slice(0, 4)} onChoose={(id) => finish(id)} />}
        <div className="row" style={{ marginTop: 8 }}>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              <Icon name="back" size={18} /> Назад
            </button>
          )}
          <div className="grow" />
          {step < 5 ? (
            <button className="btn primary big" onClick={() => { setStep(step + 1); window.scrollTo(0, 0); }}>
              Дальше
            </button>
          ) : (
            <button className="btn ghost" onClick={() => finish(null)}>
              Выберу позже
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
