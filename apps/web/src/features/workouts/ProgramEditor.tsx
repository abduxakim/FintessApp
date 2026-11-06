import React, { useState } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { getState, saveProgram, useStore } from "../../data/store";
import type { ItemBlock, Program, ProgramDay, ProgramItem } from "../../data/types";
import { useNav } from "../../app/nav";
import { deleteProgram, enroll } from "../../app/actions";
import { moveItem } from "../../domain/session";
import { uuidv7 } from "../../domain/ids";
import { fmtClock } from "../../domain/format";
import { Confirm, Segmented, Sheet, Stepper, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { ExercisePickerSheet } from "../profile/forms";
import { itemTarget } from "./ProgramDetail";

const BLOCKS: { value: ItemBlock; label: string }[] = [
  { value: "warmup", label: "Разминка" },
  { value: "main", label: "Основная" },
  { value: "cooldown", label: "Заминка" },
];

async function mutate(id: string, fn: (p: Program) => Program) {
  const cur = getState().programs[id];
  if (!cur || cur.deletedAt) return;
  const next = fn(cur);
  // Краткое описание обновляется само: названия дней по порядку.
  await saveProgram({ ...next, summary: next.days.map((d) => d.name).join(" · "), daysPerWeek: next.days.length });
}

function ItemSheet({ item, onSave, onClose }: { item: ProgramItem; onSave: (i: ProgramItem) => void; onClose: () => void }) {
  const [it, setIt] = useState(item);
  const ex = EXERCISE_BY_ID[it.exerciseId];
  const time = ex?.tracking === "time";
  return (
    <Sheet title={ex?.name ?? "Упражнение"} onClose={onClose}>
      <Stepper label="Подходы" value={it.sets} min={1} max={10} onChange={(v) => setIt({ ...it, sets: v })} />
      {time ? (
        <Stepper label="Секунды" value={it.durationSec ?? 30} min={10} max={600} step={5} onChange={(v) => setIt({ ...it, durationSec: v })} />
      ) : (
        <>
          <Stepper label="Повторы от" value={it.repsMin ?? 8} min={1} max={50} onChange={(v) => setIt({ ...it, repsMin: v, repsMax: Math.max(v, it.repsMax ?? v) })} />
          <Stepper label="Повторы до" value={it.repsMax ?? 12} min={1} max={60} onChange={(v) => setIt({ ...it, repsMax: v, repsMin: Math.min(v, it.repsMin ?? v) })} />
        </>
      )}
      <Stepper label="Отдых" value={it.restSec} min={0} max={300} step={15} fmt={fmtClock} onChange={(v) => setIt({ ...it, restSec: v })} />
      <div className="field">
        <span className="label">Часть тренировки</span>
        <Segmented value={it.block} options={BLOCKS} onChange={(v) => setIt({ ...it, block: v })} />
      </div>
      <div className="field">
        <label htmlFor="item-note">Заметка</label>
        <input id="item-note" className="input" maxLength={140} value={it.note ?? ""} onChange={(e) => setIt({ ...it, note: e.target.value })} />
      </div>
      <button
        className="btn primary"
        onClick={() => {
          onSave(it);
          onClose();
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}

export function ProgramEditor({ id }: { id: string }) {
  const nav = useNav();
  const program = useStore((s) => s.programs[id]);
  const enrolled = useStore((s) => s.meta.enrollment?.programId === id);
  const [dayIdx, setDayIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProgramItem | null>(null);
  const [confirm, setConfirm] = useState<"day" | "program" | null>(null);
  if (!program || program.deletedAt) return <TopBar title="Программа не найдена" onBack={nav.back} />;
  const day = program.days[Math.min(dayIdx, program.days.length - 1)];
  const di = program.days.indexOf(day);
  const setDay = (fn: (d: ProgramDay) => ProgramDay) => mutate(id, (p) => ({ ...p, days: p.days.map((d, i) => (i === di ? fn(d) : d)) }));

  return (
    <>
      <TopBar title="Редактор программы" onBack={nav.back} />
      <div className="screen">
        <div className="field">
          <label htmlFor="prog-name">Название программы</label>
          <input id="prog-name" className="input" defaultValue={program.name} maxLength={60} onBlur={(e) => e.target.value.trim() && mutate(id, (p) => ({ ...p, name: e.target.value.trim() }))} />
        </div>

        <div className="chips scroll" role="tablist">
          {program.days.map((d, i) => (
            <button key={d.id} role="tab" aria-selected={i === di} className={"chip" + (i === di ? " on" : "")} onClick={() => setDayIdx(i)}>
              {d.name}
            </button>
          ))}
          <button
            className="chip"
            onClick={() => {
              void mutate(id, (p) => ({ ...p, days: [...p.days, { id: uuidv7(), name: `День ${p.days.length + 1}`, focus: "", items: [] }] }));
              setDayIdx(program.days.length);
            }}
          >
            <Icon name="plus" size={16} /> День
          </button>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="day-name">Название дня</label>
            <input id="day-name" key={day.id + "n"} className="input" defaultValue={day.name} maxLength={40} onBlur={(e) => e.target.value.trim() && setDay((d) => ({ ...d, name: e.target.value.trim() }))} />
          </div>
          <div className="field">
            <label htmlFor="day-focus">Фокус</label>
            <input id="day-focus" key={day.id + "f"} className="input" defaultValue={day.focus} placeholder="Например: спина + ноги" maxLength={60} onBlur={(e) => setDay((d) => ({ ...d, focus: e.target.value.trim() }))} />
          </div>
        </div>

        <div className="list">
          {day.items.map((it, i) => {
            const ex = EXERCISE_BY_ID[it.exerciseId];
            return (
              <div key={it.id} className="list-item">
                <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => setEditing(it)}>
                  <div className="title">{ex?.name ?? it.exerciseId}</div>
                  <div className="sub num">
                    {itemTarget(it)}
                    {it.restSec ? ` · отдых ${fmtClock(it.restSec)}` : ""}
                    {it.block !== "main" ? ` · ${BLOCKS.find((b) => b.value === it.block)!.label.toLowerCase()}` : ""}
                  </div>
                </button>
                <button className="icon-btn" aria-label={`Выше: ${ex?.name}`} disabled={i === 0} onClick={() => setDay((d) => ({ ...d, items: moveItem(d.items, i, -1) }))}>
                  <Icon name="up" size={18} />
                </button>
                <button className="icon-btn" aria-label={`Ниже: ${ex?.name}`} disabled={i === day.items.length - 1} onClick={() => setDay((d) => ({ ...d, items: moveItem(d.items, i, 1) }))}>
                  <Icon name="down" size={18} />
                </button>
                <button className="icon-btn" aria-label={`Убрать: ${ex?.name}`} onClick={() => setDay((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            );
          })}
          {!day.items.length && <div className="list-item muted">В этом дне пока нет упражнений.</div>}
        </div>
        <button className="btn block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Добавить упражнение
        </button>
        <p className="xs muted">Нажми на упражнение, чтобы изменить подходы, повторы, отдых и часть тренировки. Изменения сохраняются сразу.</p>

        <div className="stack">
          {!enrolled && (
            <button className="btn primary block" onClick={() => enroll(id).then(() => toast("Программа выбрана"))}>
              Сделать моей программой
            </button>
          )}
          <button className="btn block" onClick={() => nav.push({ name: "program", id })}>
            Посмотреть программу
          </button>
          {program.days.length > 1 && (
            <button className="btn ghost block" style={{ color: "var(--bad)" }} onClick={() => setConfirm("day")}>
              Удалить «{day.name}»
            </button>
          )}
          <button className="btn ghost block" style={{ color: "var(--bad)" }} onClick={() => setConfirm("program")}>
            Удалить программу
          </button>
        </div>
      </div>
      {adding && (
        <ExercisePickerSheet
          title="Добавить в день"
          exclude={day.items.map((i) => i.exerciseId)}
          onClose={() => setAdding(false)}
          onPick={(exId) => {
            const ex = EXERCISE_BY_ID[exId];
            const time = ex.tracking === "time";
            const compound = ex.mechanics === "compound";
            const item: ProgramItem = {
              id: uuidv7(),
              exerciseId: exId,
              block: ex.category === "stretch" ? "cooldown" : ex.category === "warmup" || ex.category === "cardio" ? "warmup" : "main",
              sets: time ? 2 : 3,
              ...(time ? { durationSec: 30 } : { repsMin: compound ? 6 : 10, repsMax: compound ? 10 : 15 }),
              restSec: compound ? 120 : 60,
            };
            void setDay((d) => {
              const cd = d.items.findIndex((x) => x.block === "cooldown");
              const items = d.items.slice();
              items.splice(item.block === "cooldown" || cd < 0 ? items.length : cd, 0, item);
              return { ...d, items };
            });
            setAdding(false);
          }}
        />
      )}
      {editing && <ItemSheet item={editing} onClose={() => setEditing(null)} onSave={(it) => setDay((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) }))} />}
      {confirm === "day" && (
        <Confirm
          title={`Удалить «${day.name}»?`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            void mutate(id, (p) => ({ ...p, days: p.days.filter((d) => d.id !== day.id) }));
            setDayIdx(0);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "program" && (
        <Confirm
          title="Удалить программу?"
          text="История тренировок останется."
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteProgram(program).then(() => nav.back())}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
