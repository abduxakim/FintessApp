import React, { useMemo } from "react";
import type { Recommendation } from "../../domain/recommend";
import { recommendPrograms } from "../../domain/recommend";
import { EXERCISES, EXERCISE_BY_ID, PROGRAMS } from "../../data/catalog";
import { useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { plural } from "../../domain/format";

export function RecommendationList({ recs, onChoose, onOpen }: { recs: Recommendation[]; onChoose?: (id: string) => void; onOpen?: (id: string) => void }) {
  return (
    <div className="stack">
      {recs.map((r, i) => (
        <div key={r.program.id} className={"card" + (i === 0 ? " accent" : "")}>
          <div className="row">
            <div className="grow stack gap-s">
              {i === 0 && <span className="pill accent" style={{ alignSelf: "flex-start" }}>Рекомендуем</span>}
              <h3 style={{ fontSize: "var(--fs-l)" }}>{r.program.name}</h3>
              <p className="small dim">{r.program.summary}</p>
            </div>
          </div>
          <div className="row wrap xs muted">
            <span>
              {r.program.days.length} {plural(r.program.days.length, ["тренировка", "тренировки", "тренировок"])} в цикле
            </span>
            <span>·</span>
            <span>~{r.program.minutes} мин</span>
          </div>
          {r.reasons.length > 0 && (
            <ul className="stack gap-s small" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {r.reasons.map((t) => (
                <li key={t} className="row" style={{ alignItems: "flex-start" }}>
                  <Icon name="check" size={16} className="chev" />
                  <span>{t}</span>
                </li>
              ))}
              {r.warnings.map((t) => (
                <li key={t} className="row" style={{ alignItems: "flex-start", color: "var(--warn)" }}>
                  <Icon name="alert" size={16} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {onOpen && (
              <button className="btn" onClick={() => onOpen(r.program.id)}>
                Подробнее
              </button>
            )}
            {onChoose && (
              <button className={"btn grow" + (i === 0 ? " primary" : "")} onClick={() => onChoose(r.program.id)}>
                Выбрать
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecommendScreen() {
  const nav = useNav();
  const profile = useStore((s) => s.meta.profile);
  const recs = useMemo(() => recommendPrograms(profile, PROGRAMS, EXERCISE_BY_ID, EXERCISES), [profile]);
  return (
    <>
      <TopBar title="Подбор программы" onBack={nav.back} />
      <div className="screen">
        <p className="dim small">Программы отсортированы по твоему профилю: место, цель, график, уровень и зоны в фокусе.</p>
        <RecommendationList recs={recs} onOpen={(id) => nav.push({ name: "program", id })} />
      </div>
    </>
  );
}
