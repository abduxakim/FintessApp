import React, { useMemo } from "react";
import { EXERCISES, EXERCISE_BY_ID, progressionFor } from "../../data/catalog";
import { CATEGORIES, DIFFICULTY, EQUIPMENT, LOCATIONS, MUSCLES, ZONES } from "../../data/seed/labels";
import { doneSessions, useStore } from "../../data/store";
import { useNav, useScreenState } from "../../app/nav";
import { MedicalNote, Note, Segmented, TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { alternatives, zoneCaution } from "../../domain/availability";
import { computeRecords, exerciseHistory } from "../../domain/history";
import { fmtShort } from "../../domain/format";
import { fmtSets, RecordsLine } from "../progress/shared";
import { liftSummaries } from "../../domain/lifts";
import { liftLine } from "../progress/Lifts";
import { LineChart } from "../../ui/LineChart";
import { BodyMap } from "../../ui/BodyMap";

export function videoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} техника выполнения`)}`;
}

export function ExerciseInfo({ id, compact }: { id: string; compact?: boolean }) {
  const nav = useNav();
  const profile = useStore((s) => s.meta.profile);
  const [tab, setTab] = useScreenState<"how" | "muscles">(`tab:${id}`, "how");
  const ex = EXERCISE_BY_ID[id];
  if (!ex) return null;
  const caution = zoneCaution(ex, profile);
  const prog = progressionFor(ex.id);
  const loc = profile.locations[0] ?? "gym";
  const alts = alternatives(ex, EXERCISES, profile, loc).slice(0, 5);
  return (
    <div className="stack gap-l">
      <div className="row wrap">
        <span className="pill">{CATEGORIES[ex.category]}</span>
        <span className="pill">{DIFFICULTY[ex.difficulty]}</span>
        {ex.unilateral && <span className="pill">Одна сторона</span>}
        {ex.review === "check" && <span className="pill warn">Технику стоит проверить с тренером</span>}
      </div>
      <Segmented
        id={"ex-tab-" + ex.id}
        value={tab}
        onChange={setTab}
        options={[
          { value: "how", label: "Как делать" },
          { value: "muscles", label: "Мышцы" },
        ]}
      />
      {caution && (
        <Note kind="warn">
          {ZONES[caution.zone]}
          {caution.side === "left" ? " (левое)" : caution.side === "right" ? " (правое)" : ""}: работай без боли, начни с лёгкого веса{caution.limitsHeavy ? " и не гонись за максимальными весами" : ""}. При боли — замени упражнение аналогом.
        </Note>
      )}
      {ex.unilateral && profile.weakSide && (
        <Note>Начинай с {profile.weakSide === "right" ? "правой" : "левой"} стороны. Сильной делай столько же повторов, не больше.</Note>
      )}
      {tab === "how" && (
        <div className="stack gap-l">
          <a className="btn block" href={videoSearchUrl(ex.name)} target="_blank" rel="noopener noreferrer">
            <Icon name="video" size={18} /> Видео с техникой на YouTube
          </a>
          <section className="section">
            <div className="section-head">
              <h2>Техника</h2>
            </div>
            <p>{ex.technique}</p>
          </section>
          <section className="section">
            <div className="section-head">
              <h2>Типичные ошибки</h2>
            </div>
            <ul className="stack gap-s" style={{ margin: 0, paddingLeft: 18 }}>
              {ex.mistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
          {ex.category === "prehab" && <MedicalNote />}
          {prog && (
            <section className="section">
              <div className="section-head">
                <h2>Прогрессия: {prog.name.toLowerCase()}</h2>
              </div>
              <div className="steps">
                {prog.steps.map((st, i) => (
                  <React.Fragment key={st.exerciseId}>
                    {i > 0 && <Icon name="chev" size={14} className="chev" />}
                    {st.exerciseId === ex.id ? (
                      <span className="step cur" aria-current="true">
                        {EXERCISE_BY_ID[st.exerciseId]?.name}
                      </span>
                    ) : (
                      <button className="step" onClick={() => nav.push({ name: "exercise", id: st.exerciseId })}>
                        {EXERCISE_BY_ID[st.exerciseId]?.name}
                      </button>
                    )}
                  </React.Fragment>
                ))}
              </div>
              {(() => {
                const i = prog.steps.findIndex((s) => s.exerciseId === ex.id);
                const next = prog.steps[i + 1];
                return next ? <p className="small muted">Переход дальше: когда уверенно делаешь {prog.steps[i].criteria}.</p> : null;
              })()}
            </section>
          )}
        </div>
      )}
      {tab === "muscles" && (
        <div className="stack gap-l">
          {ex.primary.length > 0 && (
            <div className="stack gap-s">
              <BodyMap primary={ex.primary} secondary={ex.secondary} />
              <div className="legend">
                <span>
                  <i style={{ background: "var(--accent)" }} />
                  основная нагрузка
                </span>
                <span>
                  <i style={{ background: "var(--map-secondary)" }} />
                  помогают
                </span>
              </div>
            </div>
          )}
          {ex.load && (
            <section className="section">
              <div className="section-head">
                <h2>Куда идёт нагрузка</h2>
              </div>
              <p>{ex.load}</p>
            </section>
          )}
          <dl className="kv">
            {ex.primary.length > 0 && (
              <>
                <dt>Основные</dt>
                <dd>{ex.primary.map((m) => MUSCLES[m].name).join(", ")}</dd>
              </>
            )}
            {ex.secondary.length > 0 && (
              <>
                <dt>Помогают</dt>
                <dd>{ex.secondary.map((m) => MUSCLES[m].name).join(", ")}</dd>
              </>
            )}
            <dt>Нужно</dt>
            <dd>{ex.equipment.length ? ex.equipment.map((e) => EQUIPMENT[e]).join(", ") : "Только свой вес"}</dd>
            <dt>Где</dt>
            <dd>{ex.locations.map((l) => LOCATIONS[l]).join(", ")}</dd>
          </dl>
        </div>
      )}
      {!compact && alts.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Аналоги</h2>
          </div>
          <div className="list">
            {alts.map((a) => (
              <button key={a.id} className="list-item" onClick={() => nav.push({ name: "exercise", id: a.id })}>
                <div className="grow">
                  <div className="title">{a.name}</div>
                  <div className="sub">{a.equipment.length ? a.equipment.map((e) => EQUIPMENT[e]).join(", ") : "Свой вес"}</div>
                </div>
                <Icon name="chev" className="chev" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const nav = useNav();
  const sessions = useStore(doneSessions);
  const ex = EXERCISE_BY_ID[id];
  const history = useMemo(() => exerciseHistory(id, sessions).slice(0, 6), [id, sessions]);
  const records = useMemo(() => computeRecords(sessions, EXERCISE_BY_ID).get(id), [id, sessions]);
  const lift = useMemo(() => liftSummaries(sessions, EXERCISE_BY_ID).find((l) => l.exerciseId === id), [id, sessions]);
  if (!ex) return <TopBar title="Упражнение не найдено" onBack={nav.back} />;
  return (
    <>
      <TopBar title={ex.name} onBack={nav.back} />
      <div className="screen">
        <ExerciseInfo id={id} />
        <section className="section">
          <div className="section-head">
            <h2>Моя история</h2>
          </div>
          {records && <RecordsLine rec={records} tracking={ex.tracking} />}
          {lift && (
            <div className="card tight">
              <div className="row">
                <span className="small grow">
                  Сейчас: <b className="num">{liftLine(lift, ex.tracking)}</b>
                </span>
                <span className="xs muted">{lift.sessions} трен.</span>
              </div>
              {lift.next && <p className="hint-up small">Следующий раз: {lift.next.text}</p>}
              {lift.points.length >= 2 && (
                <LineChart
                  label={`${ex.name}: ${ex.tracking === "time" ? "время" : lift.last.weight ? "рабочий вес" : "повторы"}`}
                  unit={ex.tracking === "time" ? "с" : lift.last.weight ? "кг" : "повт."}
                  series={[{ name: "Рабочий вес", color: "var(--accent)", points: lift.points.map((p) => ({ x: p.at, y: lift.last.weight ? p.weight : p.best })) }]}
                />
              )}
            </div>
          )}
          {history.length ? (
            <div className="list">
              {history.map((h) => (
                <button key={h.sessionId} className="list-item" onClick={() => nav.push({ name: "session", id: h.sessionId })}>
                  <span className="small muted" style={{ width: 56 }}>
                    {fmtShort(h.at)}
                  </span>
                  <span className="grow num small">{fmtSets(h.sets, ex)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="small muted">Пока не выполнял. После первой тренировки здесь появятся подходы и рекорды.</p>
          )}
        </section>
      </div>
    </>
  );
}
