import React, { useMemo } from "react";
import { EXERCISE_BY_ID, programById } from "../../data/catalog";
import { activeSession, doneSessions, useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { prepareCustom, prepareProgramDay } from "../../app/actions";
import { groupLoad } from "../../domain/balance";
import { liveSessions } from "../../data/store";
import { BLOCKS } from "../../data/catalog";
import { fmtClock, fmtDay, fmtDuration, fmtShort, fmtTonnage, plural, startOfDay, startOfWeek } from "../../domain/format";
import { sessionDoneSets, sessionVolume } from "../../domain/strength";
import { itemTarget } from "../workouts/ProgramDetail";
import { Icon } from "../../ui/icons";
import { ZONES } from "../../data/seed/labels";
import { pickVariant, programCycle } from "../../domain/session";
import { effectiveDay } from "../../domain/tweaks";
import { ReadinessCard, WaterCard } from "../wellness/Wellness";
import { NutritionSummary } from "../nutrition/Nutrition";
import { Recommendations } from "./Recommendations";
import { emphasisLine, emphasisOf } from "../../domain/emphasis";
import { updateMeta } from "../../data/store";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function Today() {
  const nav = useNav();
  const state = useStore((s) => s);
  const active = activeSession(state);
  const done = useMemo(() => doneSessions(state), [state]);
  const en = state.meta.enrollment;
  const program = programById(state, en?.programId);
  const day = program && en ? effectiveDay(program.days[en.nextDayIndex % program.days.length], state.meta.programTweaks?.[program.id]) : null;
  const now = Date.now();
  const weekStart = startOfWeek(now);
  const weekDone = done.filter((s) => s.startedAt >= weekStart);
  const daysWithWorkout = new Set(weekDone.map((s) => startOfDay(s.startedAt)));
  const last = done[0];
  const lastDays = last ? Math.floor((startOfDay(now) - startOfDay(last.startedAt)) / 86400000) : null;
  const cycle = program ? programCycle(en, program) : 0;
  const mainItems = day?.items.filter((i) => i.block === "main") ?? [];
  const carry = en?.carryOver ?? [];
  const circuit = state.meta.profile.circuit;
  const setCircuit = (patch: Partial<typeof circuit>) => updateMeta((m) => ({ ...m, profile: { ...m.profile, circuit: { ...m.profile.circuit, ...patch, configured: true } } }));
  const zones = state.meta.profile.problemZones;

  const load = useMemo(() => groupLoad(liveSessions(state), EXERCISE_BY_ID, state.meta.profile, now), [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Начать» открывает план дня: можно посмотреть и поправить упражнения перед стартом.
  const start = () => {
    if (!program) return;
    prepareProgramDay(program, en!.nextDayIndex);
    nav.push({ name: "preview" });
  };

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      <div className="stack gap-s">
        <span className="eyebrow">{fmtDay(now)}</span>
        <h1 className="hero-title">
          {active ? "Тренировка идёт" : lastDays === 0 ? "Сегодня уже потренировался" : day ? `Сегодня: ${day.name}` : "Сегодня"}
        </h1>
      </div>

      {active ? (
        <div className="card accent">
          <div className="row">
            <div className="grow">
              <div className="title" style={{ fontWeight: 600 }}>
                {active.title}
              </div>
              <div className="small muted num">
                {fmtClock((now - active.startedAt) / 1000)} · {sessionDoneSets(active)} {plural(sessionDoneSets(active), ["подход", "подхода", "подходов"])} записано
              </div>
            </div>
          </div>
          <button className="btn primary big block" onClick={nav.openWorkout}>
            <Icon name="play" size={18} /> Продолжить
          </button>
        </div>
      ) : program && day ? (
        <div className="card accent">
          <div className="row">
            <div className="grow stack gap-s">
              <span className="eyebrow">Следующая тренировка</span>
              <h2 style={{ fontSize: "var(--fs-xl)" }}>
                {day.name}
                {day.focus ? ` · ${day.focus}` : ""}
              </h2>
              <span className="small muted">
                {program.name} · ~{program.minutes} мин
              </span>
            </div>
          </div>
          {day.items.length > 0 && (
            <p className="small">
              Упор: <b>{emphasisLine(emphasisOf(day.items.map((it) => ({ ...it, exerciseId: pickVariant(it, cycle) })), EXERCISE_BY_ID))}</b>
            </p>
          )}
          {carry.length > 0 && (
            <p className="small" style={{ color: "var(--accent)" }}>
              + добить с прошлой: {carry.map((c) => EXERCISE_BY_ID[c.exerciseId]?.name).join(", ")}
            </p>
          )}
          {circuit.enabled && <p className="small muted">Круг {circuit.stations.map((st) => st.reps).join("-")} — {circuit.position === "start" ? "после разминки" : "в конце"}</p>}
          <ul className="ex-list">
            {mainItems.slice(0, 5).map((it) => (
              <li key={it.id}>
                <span className="ellipsis">{EXERCISE_BY_ID[pickVariant(it, cycle)]?.name}</span>
                <span className="num">{itemTarget(it)}</span>
              </li>
            ))}
            {mainItems.length > 5 && <li className="muted">и ещё {mainItems.length - 5}</li>}
          </ul>
          <div className="row">
            <button className="btn primary big grow" onClick={start}>
              <Icon name="play" size={18} /> К тренировке
            </button>
            <button className="btn big" onClick={() => nav.push({ name: "program", id: program.id })}>
              План
            </button>
          </div>
        </div>
      ) : (
        <div className="empty">
          <b>Выбери программу</b>
          <span className="small">Приложение подберёт её по твоему профилю — цель, место и график.</span>
          <button className="btn primary" onClick={() => { nav.setTab("workouts"); nav.push({ name: "recommend" }); }}>
            Подобрать программу
          </button>
        </div>
      )}

      {!circuit.configured && !active && (
        <div className="card">
          <div className="stack gap-s">
            <span className="eyebrow">Твоя привычка</span>
            <h2 style={{ fontSize: "var(--fs-l)" }}>Добавить круг 5-10-15 в тренировки?</h2>
            <p className="small dim">
              5 подтягиваний, 10 отжиманий, 15 приседаний — сколько кругов успеешь. Станции можно менять: приседания с весом, выпады, разгибания ног, разные отжимания. Приложение запомнит рекорд по кругам.
            </p>
            <p className="small muted">
              Совет: в дни спины и груди лучше ставить круг в конец — иначе подтягивания и отжимания заранее утомят те же мышцы, и рабочие веса в жиме и тягах будут ниже.
            </p>
          </div>
          <div className="grid-2">
            <button className="btn" onClick={() => setCircuit({ enabled: true, position: "start" })}>
              В начале
            </button>
            <button className="btn primary" onClick={() => setCircuit({ enabled: true, position: "end" })}>
              В конце
            </button>
          </div>
          <button className="btn ghost small" onClick={() => setCircuit({ enabled: false })}>
            Не нужно
          </button>
        </div>
      )}

      <Recommendations day={day} cycle={cycle} load={load} />
      <ReadinessCard />
      <div className="grid-2 cards-2">
        <WaterCard />
        <NutritionSummary compact />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Эта неделя</h2>
          <span className="small muted">
            {weekDone.length} {plural(weekDone.length, ["тренировка", "тренировки", "тренировок"])}
          </span>
        </div>
        <div className="week">
          {WEEKDAYS.map((d, i) => {
            const ts = weekStart + i * 86400000;
            const isToday = ts === startOfDay(now);
            const has = daysWithWorkout.has(ts) || [...daysWithWorkout].some((x) => Math.abs(x - ts) < 2 * 3600000);
            return (
              <div key={d} className={"week-day" + (isToday ? " today" : "") + (has ? " done" : "")}>
                <span>{d}</span>
                <span className="mark" />
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Нагрузка за 7 дней</h2>
          <span className="small muted">подходы / ориентир</span>
        </div>
        <div className="chips">
          {load.map((l) => (
            <span key={l.group} className={"pill " + (l.sets >= l.target ? "good" : l.sets >= l.target / 2 ? "" : "warn")}>
              {l.group} <span className="num">{l.sets}/{l.target}</span>
            </span>
          ))}
        </div>
        <p className="xs muted">Считаются все подходы, включая упражнения, добавленные во время тренировки. Недогруженные группы приложение предложит добавить в плане тренировки.</p>
      </section>

      {last && (
        <section className="section">
          <div className="section-head">
            <h2>Прошлая тренировка</h2>
            <span className="small muted">{lastDays === 0 ? "сегодня" : lastDays === 1 ? "вчера" : `${fmtShort(last.startedAt)} · ${lastDays} дн. назад`}</span>
          </div>
          <button className="card tight" style={{ textAlign: "left" }} onClick={() => nav.push({ name: "session", id: last.id })}>
            <div className="title" style={{ fontWeight: 600 }}>
              {last.title}
            </div>
            <div className="stats">
              <div className="stat">
                <span className="v">{fmtDuration((last.endedAt ?? last.startedAt) - last.startedAt)}</span>
                <span className="k">время</span>
              </div>
              <div className="stat">
                <span className="v">{sessionDoneSets(last)}</span>
                <span className="k">подходов</span>
              </div>
              <div className="stat">
                <span className="v">{fmtTonnage(sessionVolume(last))}</span>
                <span className="k">объём</span>
              </div>
            </div>
          </button>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Быстро</h2>
        </div>
        <div className="grid-2">
          <button
            className="btn"
            onClick={() => {
              if (active) return nav.openWorkout();
              prepareCustom();
              nav.push({ name: "preview" });
            }}
          >
            <Icon name="plus" size={18} /> Своя
          </button>
          <button className="btn" onClick={() => nav.push({ name: "ask" })}>
            <Icon name="spark" size={18} /> По запросу
          </button>
          <button
            className="btn"
            onClick={() => {
              if (active) return nav.openWorkout();
              prepareProgramDay(BLOCKS.find((b) => b.id === "block_stretch")!, 0);
              nav.push({ name: "preview" });
            }}
          >
            Растяжка
          </button>
          <button
            className="btn"
            onClick={() => {
              if (active) return nav.openWorkout();
              prepareProgramDay(BLOCKS.find((b) => b.id === "block_mobility")!, 0);
              nav.push({ name: "preview" });
            }}
          >
            Мобильность
          </button>
          <button className="btn" onClick={() => nav.push({ name: "library" })}>
            <Icon name="search" size={18} /> Упражнения
          </button>
        </div>
      </section>

      {zones.length > 0 && (
        <button className="list-item card tight" style={{ flexDirection: "row" }} onClick={() => nav.push({ name: "prehab" })}>
          <Icon name="shield" className="chev" />
          <div className="grow">
            <div className="title">Профилактика: {zones.map((z) => ZONES[z.zone].toLowerCase() + (z.side === "left" ? " (левое)" : z.side === "right" ? " (правое)" : "")).join(", ")}</div>
            <div className="sub">{state.meta.profile.prehabIssue ? "Блок добавлен в разминку тренировок" : "Подборка упражнений — можно добавить в разминку"}</div>
          </div>
          <Icon name="chev" className="chev" />
        </button>
      )}
    </div>
  );
}
