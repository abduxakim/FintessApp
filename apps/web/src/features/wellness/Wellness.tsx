import React, { useState } from "react";
import { BLOCKS, programById } from "../../data/catalog";
import { getState, today, updateDay, useStore } from "../../data/store";
import { dayId } from "../../data/defaults";
import { DAY } from "../../data/limits";
import type { Checkin, NapEntry, SleepEntry } from "../../data/types";
import { useNav } from "../../app/nav";
import { prepareProgramDay } from "../../app/actions";
import { getDraft, setDraft } from "../../app/draft";
import { dayReadiness, lightenSession, napHint, napMinutes, sleepHours, type Readiness } from "../../domain/recovery";
import { waterTarget, waterTotal } from "../../domain/nutrition";
import { latestWeight } from "../../domain/weekly";
import { fmtMinutes, fmtTime, hhmm, minutesOf } from "../../domain/format";
import { Chip, Sheet, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";

export function useTrainingToday(): boolean {
  // Тот же «день», что и у дневника: тренировка в 23:00 и вода в 01:00 до сна — один день.
  return useStore((s) => Object.values(s.sessions).some((x) => !x.deletedAt && x.status !== "abandoned" && dayId(x.startedAt) === dayId()));
}

// ── Вода ─────────────────────────────────────────────
export function WaterCard() {
  const log = useStore((s) => today(s));
  const state = useStore((s) => s);
  const training = useTrainingToday();
  const drunk = waterTotal(log);
  const target = waterTarget(latestWeight(state.days, state.meta.profile), training);
  const pct = Math.min(100, Math.round((drunk / target) * 100));
  const add = (ml: number) => updateDay(dayId(), (d) => ({ ...d, water: [...d.water, { at: Date.now(), ml }] }));
  const undo = () => updateDay(dayId(), (d) => ({ ...d, water: d.water.slice(0, -1) }));
  return (
    <section className="card tight" aria-label="Вода">
      <div className="row">
        <span className="eyebrow grow">Вода</span>
        <span className="small num">
          <b>{(drunk / 1000).toFixed(1).replace(".", ",")}</b> / {(target / 1000).toFixed(1).replace(".", ",")} л
        </span>
      </div>
      <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Вода за день">
        <span style={{ width: `${pct}%`, background: "var(--series-2)" }} />
      </div>
      <div className="row">
        {[200, 300, 500].map((ml) => (
          <button key={ml} className="btn small grow" onClick={() => add(ml)}>
            +{ml}
          </button>
        ))}
        <button className="icon-btn" aria-label="Отменить последнюю запись воды" disabled={!log.water.length} onClick={undo}>
          <Icon name="back" size={18} />
        </button>
      </div>
    </section>
  );
}

// ── Самочувствие и сон ───────────────────────────────
const SCALES: { key: keyof Omit<Checkin, "at">; label: string; low: string; high: string }[] = [
  { key: "energy", label: "Энергия", low: "без сил", high: "бодрость" },
  { key: "soreness", label: "Мышцы", low: "сильно болят", high: "не болят" },
  { key: "mood", label: "Настроение", low: "плохое", high: "отличное" },
  { key: "stress", label: "Стресс", low: "высокий", high: "спокоен" },
];

function Scale({ value, onChange, label, low, high, id }: { value: number; onChange: (v: number) => void; label: string; low: string; high: string; id: string }) {
  return (
    <div className="field">
      <span className="label" id={id}>
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={id}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? "on" : ""} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="row xs muted">
        <span className="grow">1 — {low}</span>
        <span>5 — {high}</span>
      </div>
    </div>
  );
}

export function CheckinSheet({ onClose }: { onClose: () => void }) {
  const log = today(getState());
  const [c, setC] = useState<Omit<Checkin, "at">>(log.checkin ?? { energy: 3, soreness: 3, mood: 3, stress: 3 });
  const [sleep, setSleep] = useState<{ bed: string; wake: string; quality: number }>(log.sleep ?? { bed: "23:30", wake: "07:30", quality: 3 });
  const [withSleep, setWithSleep] = useState(true);
  const save = async () => {
    const s: SleepEntry | null = withSleep ? { ...sleep, hours: sleepHours(sleep.bed, sleep.wake) } : log.sleep;
    await updateDay(dayId(), (d) => ({ ...d, checkin: { ...c, at: Date.now() }, sleep: s }));
    toast("Самочувствие сохранено");
    onClose();
  };
  return (
    <Sheet title="Как ты сегодня?" onClose={onClose}>
      {SCALES.map((sc) => (
        <Scale key={sc.key} id={`ck-${sc.key}`} label={sc.label} low={sc.low} high={sc.high} value={c[sc.key]} onChange={(v) => setC({ ...c, [sc.key]: v })} />
      ))}
      <label className="row small">
        <input type="checkbox" checked={withSleep} onChange={(e) => setWithSleep(e.target.checked)} />
        Записать сон
      </label>
      {withSleep && (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="sleep-bed">Отбой</label>
              <input id="sleep-bed" type="time" className="input num" value={sleep.bed} onChange={(e) => setSleep({ ...sleep, bed: e.target.value || sleep.bed })} />
            </div>
            <div className="field">
              <label htmlFor="sleep-wake">Подъём</label>
              <input id="sleep-wake" type="time" className="input num" value={sleep.wake} onChange={(e) => setSleep({ ...sleep, wake: e.target.value || sleep.wake })} />
            </div>
          </div>
          <p className="xs muted">Сон: {String(sleepHours(sleep.bed, sleep.wake)).replace(".", ",")} ч</p>
          <Scale id="ck-sleep" label="Качество сна" low="плохо" high="отлично" value={sleep.quality} onChange={(v) => setSleep({ ...sleep, quality: v })} />
        </>
      )}
      <button className="btn primary" onClick={save}>
        Сохранить
      </button>
    </Sheet>
  );
}

// ── Дневной сон ──────────────────────────────────────
const NAP_OPTIONS = [20, 30, 45, 60, 90, 120, 180];

/** Время пробуждения «ЧЧ:ММ» → метка: сегодня, а если это время ещё не наступило — вчера. */
function wakeAt(t: string, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutesOf(t));
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function NapSheet({ onClose }: { onClose: () => void }) {
  const log = useStore((s) => today(s));
  const n = new Date();
  const [min, setMin] = useState(30);
  const [wake, setWake] = useState(hhmm(n.getHours() * 60 + n.getMinutes()));
  const nap: NapEntry = { at: wakeAt(wake), min };
  const hint = napHint(nap);
  const save = async () => {
    await updateDay(dayId(nap.at), (d) => ({ ...d, naps: [...(d.naps ?? []), nap].sort((a, b) => a.at - b.at).slice(-DAY.naps) }));
    toast(`Дневной сон: ${fmtMinutes(min)}`);
    onClose();
  };
  const remove = (at: number) => updateDay(log.id, (d) => ({ ...d, naps: (d.naps ?? []).filter((x) => x.at !== at) }));
  return (
    <Sheet title="Дневной сон" onClose={onClose}>
      <p className="small dim">Задремал на работе или после еды — отметь примерно. Это помогает понять, почему вечером не спится, и учитывается в готовности.</p>
      <div className="field">
        <span className="label">Сколько спал</span>
        <div className="chips" role="group" aria-label="Сколько спал">
          {NAP_OPTIONS.map((m) => (
            <Chip key={m} on={min === m} onClick={() => setMin(m)}>
              {fmtMinutes(m)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="nap-wake">Проснулся в</label>
        <input id="nap-wake" type="time" className="input num" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} />
      </div>
      {hint && <p className="xs" style={{ color: "var(--warn)" }}>{hint}</p>}
      <button className="btn primary" onClick={save}>
        Записать
      </button>
      {(log.naps ?? []).length > 0 && (
        <div className="list">
          {log.naps!.map((x) => (
            <div key={x.at} className="list-item">
              <span className="grow small num">
                {fmtTime(x.at - x.min * 60000)}–{fmtTime(x.at)} · {fmtMinutes(x.min)}
              </span>
              <button className="icon-btn" aria-label={`Удалить дневной сон ${fmtTime(x.at)}`} onClick={() => remove(x.at)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** «Сон: ночью 5 ч + днём 1 ч 30 мин = 6,5 ч, качество 3/5». */
function sleepLine(sleep: SleepEntry | null, napMin: number): string | null {
  const dec = (h: number) => String(Math.round(h * 10) / 10).replace(".", ",");
  if (!sleep && !napMin) return null;
  if (!sleep) return `Днём спал ${fmtMinutes(napMin)}. Ночной сон не отмечен.`;
  if (!napMin) return `Сон: ${dec(sleep.hours)} ч (${sleep.bed}–${sleep.wake}), качество ${sleep.quality}/5`;
  return `Сон: ночью ${dec(sleep.hours)} ч + днём ${fmtMinutes(napMin)} = ${dec(sleep.hours + napMin / 60)} ч, качество ${sleep.quality}/5`;
}

const LEVEL_PILL = { high: "good", medium: "warn", low: "bad" } as const;

export function ReadinessCard() {
  const nav = useNav();
  const log = useStore((s) => today(s));
  const state = useStore((s) => s);
  const [open, setOpen] = useState(false);
  const [napOpen, setNapOpen] = useState(false);
  const r: Readiness | null = dayReadiness(log);
  const naps = napMinutes(log);
  const line = sleepLine(log.sleep, naps);
  const napBtn = (
    <button className="btn small ghost" onClick={() => setNapOpen(true)}>
      + Дневной сон
    </button>
  );
  const en = state.meta.enrollment;
  const program = programById(state, en?.programId);

  const lighten = () => {
    if (!program || !en) return toast("Сначала выбери программу");
    prepareProgramDay(program, en.nextDayIndex);
    const d = getDraft();
    if (d) setDraft({ ...d, session: lightenSession(d.session) });
    nav.push({ name: "preview" });
  };
  const mobility = () => {
    prepareProgramDay(BLOCKS.find((b) => b.id === "block_mobility")!, 0);
    nav.push({ name: "preview" });
  };

  return (
    <section className="card tight" aria-label="Самочувствие">
      <div className="row">
        <span className="eyebrow grow">Самочувствие</span>
        {r && (
          <span className={"pill " + LEVEL_PILL[r.level]}>
            {r.title} · {r.score}
          </span>
        )}
      </div>
      {log.rest && <p className="small" style={{ color: "var(--accent)" }}>Сегодня день отдыха — напоминание о тренировке не показываю.</p>}
      {r ? (
        <>
          <p className="small dim">{r.advice}</p>
          {line && <p className="xs muted">{line}</p>}
          {r.level !== "high" && (
            <div className="row wrap">
              {r.suggest.includes("lighten") && (
                <button className="btn small" onClick={lighten}>
                  Облегчить тренировку
                </button>
              )}
              {r.suggest.includes("mobility") && (
                <button className="btn small" onClick={mobility}>
                  Мобильность
                </button>
              )}
              {r.suggest.includes("rest") && (
                <button
                  className="btn small ghost"
                  onClick={() => updateDay(dayId(), (d) => ({ ...d, rest: !d.rest })).then(() => toast(today(getState()).rest ? "Сегодня отдых. Следующая тренировка дождётся тебя" : "День отдыха отменён"))}
                >
                  {log.rest ? "Отменить отдых" : "Перенести на завтра"}
                </button>
              )}
            </div>
          )}
          <div className="row wrap">
            <button className="btn small ghost" onClick={() => setOpen(true)}>
              Изменить
            </button>
            {napBtn}
          </div>
        </>
      ) : (
        <>
          <p className="small dim">Отметь сон и самочувствие — подскажу, тренироваться по плану, облегчить или сделать мобильность.</p>
          {line && <p className="xs muted">{line}</p>}
          <div className="row wrap">
            <button className="btn small primary" onClick={() => setOpen(true)}>
              Отметить
            </button>
            {napBtn}
          </div>
        </>
      )}
      {open && <CheckinSheet onClose={() => setOpen(false)} />}
      {napOpen && <NapSheet onClose={() => setNapOpen(false)} />}
    </section>
  );
}
