import React, { useState } from "react";
import { EXERCISES, EXERCISE_BY_ID, programById } from "../../data/catalog";
import { activeSession, useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { enroll, setNextDay, startProgramDay } from "../../app/actions";
import { GOALS, LEVELS, LOCATIONS } from "../../data/seed/labels";
import { Confirm, MedicalNote, Note, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { alternatives, isAvailable } from "../../domain/availability";
import { fmtClock } from "../../domain/format";
import type { ItemBlock, ProgramItem } from "../../data/types";

const BLOCK_TITLE: Record<ItemBlock, string> = { warmup: "Разминка", main: "Основная часть", cooldown: "Заминка" };

export function itemTarget(it: Pick<ProgramItem, "sets" | "repsMin" | "repsMax" | "durationSec">): string {
  if (it.durationSec) return `${it.sets} × ${it.durationSec} с`;
  const reps = it.repsMin === it.repsMax ? `${it.repsMin}` : `${it.repsMin}–${it.repsMax}`;
  return `${it.sets} × ${reps}`;
}

export function ProgramDetail({ id }: { id: string }) {
  const nav = useNav();
  const state = useStore((s) => s);
  const program = programById(state, id);
  const en = state.meta.enrollment;
  const isMine = en?.programId === id;
  const [dayIdx, setDayIdx] = useState(isMine ? en!.nextDayIndex % (program?.days.length || 1) : 0);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  if (!program) return <TopBar title="Программа не найдена" onBack={nav.back} />;
  const day = program.days[dayIdx] ?? program.days[0];
  const profile = state.meta.profile;
  const location = profile.locations[0] ?? "gym";
  const active = activeSession(state);
  const hasShoulderZone = profile.problemZones.some((z) => z.zone === "shoulder");

  const start = async () => {
    if (active) {
      toast("Сначала заверши текущую тренировку");
      nav.openWorkout();
      return;
    }
    await startProgramDay(program, dayIdx);
    nav.openWorkout();
  };

  const blocks: ItemBlock[] = ["warmup", "main", "cooldown"];

  return (
    <>
      <TopBar title={program.name} onBack={nav.back} />
      <div className="screen">
        <div className="stack">
          {isMine && <span className="pill accent" style={{ alignSelf: "flex-start" }}>Моя программа</span>}
          <p className="dim">{program.description}</p>
          <dl className="kv">
            <dt>Место</dt>
            <dd>{program.locations.map((l) => LOCATIONS[l]).join(", ")}</dd>
            {program.goals.length > 0 && (
              <>
                <dt>Цели</dt>
                <dd>{program.goals.map((g) => GOALS[g].name).join(", ")}</dd>
              </>
            )}
            <dt>Уровень</dt>
            <dd>{program.levels.map((l) => LEVELS[l]).join(", ")}</dd>
            <dt>Время</dt>
            <dd>около {program.minutes} мин</dd>
          </dl>
        </div>

        {program.id === "block_shoulder" && <MedicalNote />}

        {program.days.length > 1 && (
          <div className="chips scroll" role="tablist">
            {program.days.map((d, i) => (
              <button key={d.id} role="tab" aria-selected={i === dayIdx} className={"chip" + (i === dayIdx ? " on" : "")} onClick={() => setDayIdx(i)}>
                {d.name}
                {isMine && i === en!.nextDayIndex % program.days.length && <span className="dot" title="Следующая" />}
              </button>
            ))}
          </div>
        )}
        <p className="small muted">{day.focus}</p>

        {blocks.map((b) => {
          const items = day.items.filter((i) => i.block === b);
          if (!items.length) return null;
          return (
            <section key={b} className="section">
              <div className="section-head">
                <h2>{BLOCK_TITLE[b]}</h2>
              </div>
              <div className="list">
                {items.map((it) => {
                  const ex = EXERCISE_BY_ID[it.exerciseId];
                  if (!ex) return null;
                  const unavailable = !isAvailable(ex, profile, location);
                  const alt = unavailable ? alternatives(ex, EXERCISES, profile, location)[0] : null;
                  return (
                    <button key={it.id} className="list-item" onClick={() => nav.push({ name: "exercise", id: ex.id })}>
                      <div className="grow">
                        <div className="title">{ex.name}</div>
                        <div className="sub num">
                          {itemTarget(it)}
                          {it.restSec > 0 && ` · отдых ${fmtClock(it.restSec)}`}
                        </div>
                        {it.note && <div className="sub">{it.note}</div>}
                        {unavailable && <div className="sub" style={{ color: "var(--warn)" }}>{alt ? `Нет оборудования — заменим на «${alt.name}»` : "Нет оборудования — пропусти или замени"}</div>}
                      </div>
                      <Icon name="chev" className="chev" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {hasShoulderZone && program.kind === "program" && day.items.some((i) => i.exerciseId === "band_external_rotation") && (
          <Note>В разминке есть активация лопаток и ротаторной манжеты — она учитывает твою проблемную зону.</Note>
        )}

        <div className="stack">
          {program.kind === "block" ? (
            <button className="btn primary big block" onClick={start}>
              <Icon name="play" size={18} /> Начать
            </button>
          ) : isMine ? (
            <>
              <button className="btn primary big block" onClick={start}>
                <Icon name="play" size={18} /> Начать «{day.name}»
              </button>
              {dayIdx !== en!.nextDayIndex % program.days.length && (
                <button className="btn block" onClick={() => setNextDay(dayIdx).then(() => toast(`Следующая тренировка: ${day.name}`))}>
                  Сделать следующей
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn primary big block" onClick={() => (en ? setConfirmSwitch(true) : enroll(program.id).then(() => toast("Программа выбрана")))}>
                Сделать моей программой
              </button>
              <button className="btn block" onClick={start}>
                Разовая тренировка «{day.name}»
              </button>
            </>
          )}
        </div>
      </div>
      {confirmSwitch && (
        <Confirm
          title="Сменить программу?"
          text="История тренировок сохранится. Новая программа начнётся с первой тренировки."
          confirmLabel="Сменить"
          onConfirm={() => enroll(program.id).then(() => toast("Программа выбрана"))}
          onClose={() => setConfirmSwitch(false)}
        />
      )}
    </>
  );
}
