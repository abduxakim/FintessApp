import React, { useState } from "react";
import { EXERCISES, EXERCISE_BY_ID, programById } from "../../data/catalog";
import { activeSession, useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { copyProgram, enroll, prepareProgramDay, removeFromProgramDay, resetProgramTweaks, setNextDay } from "../../app/actions";
import { GOALS, LEVELS, LOCATIONS } from "../../data/seed/labels";
import { Confirm, MedicalNote, Note, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { alternatives, isAvailable } from "../../domain/availability";
import { fmtClock } from "../../domain/format";
import { pickVariant, programCycle } from "../../domain/session";
import { effectiveDay, isExtra } from "../../domain/tweaks";
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
  const tweaks = state.meta.programTweaks?.[program.id];
  const day = effectiveDay(program.days[dayIdx] ?? program.days[0], tweaks);
  const hasTweaks = !!tweaks && (Object.values(tweaks.extras ?? {}).some((l) => l.length) || Object.keys(tweaks.overrides ?? {}).length > 0);
  const profile = state.meta.profile;
  const location = profile.locations[0] ?? "gym";
  const active = activeSession(state);
  const hasShoulderZone = profile.problemZones.some((z) => z.zone === "shoulder");
  const cycle = isMine ? programCycle(en, program) : 0;
  const circuit = profile.circuit;

  const start = async () => {
    if (active) {
      toast("Сначала заверши текущую тренировку");
      nav.openWorkout();
      return;
    }
    // И программы, и блоки — через план, который можно поправить перед стартом.
    prepareProgramDay(program, dayIdx);
    nav.push({ name: "preview" });
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
                  const ex = EXERCISE_BY_ID[pickVariant(it, cycle)];
                  if (!ex) return null;
                  const unavailable = !isAvailable(ex, profile, location);
                  const alt = unavailable ? alternatives(ex, EXERCISES, profile, location)[0] : null;
                  const extra = isExtra(tweaks, day.id, it.id);
                  const changed = !!tweaks?.overrides?.[it.id];
                  if (extra)
                    return (
                      <div key={it.id} className="list-item">
                        <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => nav.push({ name: "exercise", id: ex.id })}>
                          <div className="title">{ex.name}</div>
                          <div className="sub num">
                            {itemTarget(it)}
                            {it.restSec > 0 && ` · отдых ${fmtClock(it.restSec)}`}
                          </div>
                          <div className="xs" style={{ color: "var(--accent)" }}>добавлено тобой</div>
                        </button>
                        <button className="icon-btn" aria-label={`Убрать из программы: ${ex.name}`} onClick={() => removeFromProgramDay(program.id, day.id, it.id).then(() => toast("Убрано из программы"))}>
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                    );
                  return (
                    <button key={it.id} className="list-item" onClick={() => nav.push({ name: "exercise", id: ex.id })}>
                      <div className="grow">
                        <div className="title">{ex.name}</div>
                        <div className="sub num">
                          {itemTarget(it)}
                          {it.restSec > 0 && ` · отдых ${fmtClock(it.restSec)}`}
                        </div>
                        {it.note && <div className="sub">{it.note}</div>}
                        {changed && <div className="xs" style={{ color: "var(--accent)" }}>подходы/повторы изменены тобой</div>}
                        {it.variants && it.variants.length > 0 && (
                          <div className="sub">Чередуется: {[it.exerciseId, ...it.variants].map((v) => EXERCISE_BY_ID[v]?.name).join(" → ")}</div>
                        )}
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

        {program.kind === "program" && circuit.enabled && (
          <Note>
            Круг {circuit.stations.map((st) => st.reps).join("-")} добавится {circuit.position === "start" ? "после разминки" : "в конец перед заминкой"}. Настройки — в профиле.
          </Note>
        )}
        {program.days.some((d) => d.items.some((i) => i.variants?.length)) && (
          <p className="xs muted">Вспомогательные упражнения меняются на каждом проходе программы. Базовые остаются, чтобы был виден прогресс.</p>
        )}

        {hasShoulderZone && program.kind === "program" && day.items.some((i) => i.exerciseId === "band_external_rotation") && (
          <Note>В разминке есть активация лопаток и ротаторной манжеты — она учитывает твою проблемную зону.</Note>
        )}

        {hasTweaks && (
          <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => resetProgramTweaks(program.id).then(() => toast("Правки сброшены"))}>
            Сбросить мои правки программы
          </button>
        )}

        <div className="stack">
          {program.kind === "block" ? (
            <button className="btn primary big block" onClick={start}>
              <Icon name="play" size={18} /> К тренировке
            </button>
          ) : isMine ? (
            <>
              <button className="btn primary big block" onClick={start}>
                <Icon name="play" size={18} /> К тренировке «{day.name}»
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
          {program.kind === "program" &&
            (program.owner === "user" ? (
              <button className="btn block" onClick={() => nav.push({ name: "program-edit", id: program.id })}>
                Изменить программу
              </button>
            ) : (
              <button
                className="btn ghost block"
                onClick={async () => {
                  const copy = await copyProgram(program);
                  toast("Создана копия — её можно менять");
                  nav.push({ name: "program-edit", id: copy.id });
                }}
              >
                Скопировать и изменить
              </button>
            ))}
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
