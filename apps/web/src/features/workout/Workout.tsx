import React, { useEffect, useMemo, useRef, useState } from "react";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { activeSession, getState, liveSessions, saveSession, useStore } from "../../data/store";
import type { Exercise, SessionExercise, SetLog, WorkoutSession } from "../../data/types";
import { useNav } from "../../app/nav";
import { abandonWorkout, finishWorkout } from "../../app/actions";
import { addSet, makeSessionExercise, moveItem, suggestedReps, swapExercise } from "../../domain/session";
import { alternatives, zoneCaution } from "../../domain/availability";
import { lastPerformance, sessionPRs, type SessionPR } from "../../domain/history";
import { fmtClock, fmtDuration, fmtShort, fmtTonnage, parseNum, plural } from "../../domain/format";
import { sessionDoneSets, sessionVolume } from "../../domain/strength";
import { ZONES } from "../../data/seed/labels";
import { Confirm, Sheet, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { ExerciseInfo } from "../workouts/ExerciseDetail";
import { ExercisePickerSheet } from "../profile/forms";
import { fmtRecord, fmtSets, RECORD_LABEL } from "../progress/shared";
import { itemTarget } from "../workouts/ProgramDetail";

// ── Изменение активной тренировки ───────────────────────
// Всегда читаем свежую версию из хранилища: обработчики могут сработать до перерисовки.
async function mutate(sessionId: string, fn: (s: WorkoutSession) => WorkoutSession) {
  const cur = getState().sessions[sessionId];
  if (!cur || cur.status !== "active") return;
  await saveSession(fn(cur));
}

function mutateExercise(sessionId: string, seId: string, fn: (e: SessionExercise) => SessionExercise | null) {
  return mutate(sessionId, (s) => ({
    ...s,
    exercises: s.exercises.map((e) => (e.id === seId ? fn(e) : e)).filter((e): e is SessionExercise => !!e),
  }));
}

function mutateSet(sessionId: string, seId: string, setId: string, patch: Partial<SetLog>) {
  return mutateExercise(sessionId, seId, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) }));
}

// ── Таймер отдыха ───────────────────────────────────────
interface Rest {
  endsAt: number;
  total: number;
}
let restState: Rest | null = null;
const restListeners = new Set<() => void>();
function setRest(r: Rest | null) {
  restState = r;
  restListeners.forEach((l) => l());
}
function useRest(): Rest | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    restListeners.add(l);
    return () => {
      restListeners.delete(l);
    };
  }, []);
  return restState;
}

let audio: AudioContext | null = null;
function primeAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}
function beep() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
  if (!audio) return;
  try {
    for (const [t, f] of [
      [0, 880],
      [0.22, 1175],
    ] as const) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t);
      o.stop(audio.currentTime + t + 0.2);
    }
  } catch {
    /* ignore */
  }
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

function RestTimer() {
  const rest = useRest();
  const now = useNow(250);
  const beeped = useRef<number | null>(null);
  if (!rest) return null;
  const left = Math.round((rest.endsAt - now) / 1000);
  if (left <= 0 && beeped.current !== rest.endsAt) {
    beeped.current = rest.endsAt;
    beep();
  }
  const pct = Math.max(0, Math.min(100, (left / rest.total) * 100));
  return (
    <div className="timer-bar" role="timer" aria-live="off">
      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-inner">
        <Icon name="timer" size={20} className="chev" />
        <span className={"timer-value" + (left <= 0 ? " over" : "")}>{left > 0 ? fmtClock(left) : `+${fmtClock(-left)}`}</span>
        <span className="small muted grow">{left > 0 ? "отдых" : "пора работать"}</span>
        <button className="btn small" onClick={() => setRest({ ...rest, endsAt: rest.endsAt - 15000 })} aria-label="Минус 15 секунд">
          −15
        </button>
        <button className="btn small" onClick={() => setRest({ endsAt: rest.endsAt + 15000, total: rest.total + 15 })} aria-label="Плюс 15 секунд">
          +15
        </button>
        <button className="icon-btn" onClick={() => setRest(null)} aria-label="Остановить таймер">
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}

/** Разминка, растяжка и профилактика на повторы — без колонки веса. */
const repsOnly = (ex: Exercise) => ex.tracking === "reps" && ["warmup", "mobility", "stretch", "prehab", "cardio"].includes(ex.category);

// ── Строка подхода ──────────────────────────────────────
const toText = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

function SetRow({ sessionId, se, set, index, ex, lastSets, weakFirst }: { sessionId: string; se: SessionExercise; set: SetLog; index: number; ex: Exercise; lastSets: SetLog[] | null; weakFirst: "left" | "right" }) {
  const [w, setW] = useState(toText(set.weight));
  const [r, setR] = useState(toText(set.reps));
  const [rl, setRl] = useState(toText(set.repsL));
  const [rr, setRr] = useState(toText(set.repsR));
  const [d, setD] = useState(toText(set.durationSec));
  useEffect(() => setW(toText(set.weight)), [set.weight]);
  useEffect(() => setR(toText(set.reps)), [set.reps]);
  useEffect(() => setRl(toText(set.repsL)), [set.repsL]);
  useEffect(() => setRr(toText(set.repsR)), [set.repsR]);
  useEffect(() => setD(toText(set.durationSec)), [set.durationSec]);

  const prev = lastSets?.[Math.min(index, lastSets.length - 1)];
  const sugg = suggestedReps(se, index, lastSets);
  const time = ex.tracking === "time";
  const noWeight = repsOnly(ex);
  const uni = ex.unilateral && !time && !noWeight;
  const clampReps = (n: number | null) => (n == null ? null : Math.min(999, Math.round(n)));
  const clampW = (n: number | null) => (n == null ? null : Math.min(999, Math.round(n * 100) / 100));

  const commit = (patch: Partial<SetLog>) => mutateSet(sessionId, se.id, set.id, patch);

  const toggle = async () => {
    if (set.done) return commit({ done: false, doneAt: null });
    primeAudio();
    const patch: Partial<SetLog> = { done: true, doneAt: Date.now(), weight: clampW(parseNum(w)) };
    if (time) patch.durationSec = clampReps(parseNum(d)) ?? se.durationSec ?? prev?.durationSec ?? null;
    else if (uni) {
      patch.repsL = clampReps(parseNum(rl)) ?? sugg;
      patch.repsR = clampReps(parseNum(rr)) ?? sugg;
    } else patch.reps = clampReps(parseNum(r)) ?? sugg;
    await commit(patch);
    if (se.restSec > 0) setRest({ endsAt: Date.now() + se.restSec * 1000, total: se.restSec });
  };

  const input = (id: string, value: string, setter: (v: string) => void, onBlur: () => void, placeholder: string, label: string, decimal = false) => (
    <input
      id={id}
      className="set-input"
      inputMode={decimal ? "decimal" : "numeric"}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setter(e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "").slice(0, 6))}
      onBlur={onBlur}
      onFocus={(e) => e.target.select()}
    />
  );

  const wPh = prev?.weight != null ? toText(prev.weight) : "кг";
  const cls = "set-row" + (uni ? " uni" : time || noWeight ? " single" : "") + (set.done ? " done" : "");
  const sides =
    weakFirst === "right"
      ? [
          input(`rr-${set.id}`, rr, setRr, () => commit({ repsR: clampReps(parseNum(rr)) }), prev?.repsR != null ? String(prev.repsR) : sugg != null ? String(sugg) : "П", `Подход ${index + 1}, правая`),
          input(`rl-${set.id}`, rl, setRl, () => commit({ repsL: clampReps(parseNum(rl)) }), prev?.repsL != null ? String(prev.repsL) : sugg != null ? String(sugg) : "Л", `Подход ${index + 1}, левая`),
        ]
      : [
          input(`rl-${set.id}`, rl, setRl, () => commit({ repsL: clampReps(parseNum(rl)) }), prev?.repsL != null ? String(prev.repsL) : sugg != null ? String(sugg) : "Л", `Подход ${index + 1}, левая`),
          input(`rr-${set.id}`, rr, setRr, () => commit({ repsR: clampReps(parseNum(rr)) }), prev?.repsR != null ? String(prev.repsR) : sugg != null ? String(sugg) : "П", `Подход ${index + 1}, правая`),
        ];
  return (
    <div className={cls}>
      <span className="set-idx">{index + 1}</span>
      {noWeight ? (
        input(`r-${set.id}`, r, setR, () => commit({ reps: clampReps(parseNum(r)) }), sugg != null ? String(sugg) : "повт", `Подход ${index + 1}, повторы`)
      ) : time ? (
        input(`d-${set.id}`, d, setD, () => commit({ durationSec: clampReps(parseNum(d)) }), String(se.durationSec ?? prev?.durationSec ?? "сек"), `Подход ${index + 1}, секунды`)
      ) : (
        <>
          {input(`w-${set.id}`, w, setW, () => commit({ weight: clampW(parseNum(w)) }), ex.tracking === "reps" ? (prev?.weight ? wPh : "+кг") : wPh, `Подход ${index + 1}, вес`, true)}
          {uni ? sides : input(`r-${set.id}`, r, setR, () => commit({ reps: clampReps(parseNum(r)) }), sugg != null ? String(sugg) : "повт", `Подход ${index + 1}, повторы`)}
        </>
      )}
      <button className={"check" + (set.done ? " on" : "")} onClick={toggle} aria-label={set.done ? "Отменить подход" : "Подход выполнен"} aria-pressed={set.done}>
        <Icon name="check" size={22} stroke={2.5} />
      </button>
    </div>
  );
}

// ── Карточка упражнения ─────────────────────────────────
function ExerciseCard({ session, se, index, total, onMenu, onInfo }: { session: WorkoutSession; se: SessionExercise; index: number; total: number; onMenu: () => void; onInfo: () => void }) {
  const ex = EXERCISE_BY_ID[se.exerciseId];
  const profile = useStore((s) => s.meta.profile);
  const sessions = useStore(liveSessions);
  const last = useMemo(() => lastPerformance(se.exerciseId, sessions, session.id), [se.exerciseId, sessions, session.id]);
  if (!ex) return null;
  const caution = zoneCaution(ex, profile);
  const time = ex.tracking === "time";
  const noWeight = repsOnly(ex);
  const uni = ex.unilateral && !time && !noWeight;
  const weakFirst = profile.weakSide === "left" ? "left" : "right";
  const allDone = se.sets.length > 0 && se.sets.every((s) => s.done);
  const target = itemTarget({ sets: se.targetSets, repsMin: se.repsMin ?? undefined, repsMax: se.repsMax ?? undefined, durationSec: se.durationSec ?? undefined });
  const sideLabel = (s: "left" | "right") => (s === "right" ? "П" : "Л");
  return (
    <article className={"wex" + (allDone ? " complete" : "")} aria-label={ex.name}>
      <div className="wex-head">
        <div className="grow stack gap-s">
          <button className="name" onClick={onInfo}>
            {ex.name}
          </button>
          <span className="small muted num">
            {target}
            {se.restSec > 0 && ` · отдых ${fmtClock(se.restSec)}`}
            {se.block === "warmup" && " · разминка"}
            {se.block === "cooldown" && " · заминка"}
          </span>
        </div>
        <span className="xs muted num" style={{ paddingTop: 12 }}>
          {index + 1}/{total}
        </span>
        <button className="icon-btn" onClick={onMenu} aria-label={`Действия: ${ex.name}`}>
          <Icon name="more" />
        </button>
      </div>
      <div className="wex-meta">
        {last ? (
          <p className="last-time">
            Прошлый раз, {fmtShort(last.at)}: <b>{fmtSets(last.sets, ex)}</b>
          </p>
        ) : (
          ex.category !== "warmup" && ex.category !== "stretch" && ex.category !== "mobility" && ex.category !== "cardio" && <p className="last-time muted">Первый раз — подбери рабочий вес, приложение запомнит.</p>
        )}
        {se.swappedFromId && <p className="xs muted">Замена для «{EXERCISE_BY_ID[se.swappedFromId]?.name}»</p>}
        {se.notes && <p className="xs dim">Заметка: {se.notes}</p>}
        {caution && (
          <p className="xs" style={{ color: "var(--warn)" }}>
            {ZONES[caution.zone]}: без боли{caution.limitsHeavy ? ", не гонись за максимальным весом" : ""}.
          </p>
        )}
        {uni && profile.weakSide && <p className="xs muted">Начни с {profile.weakSide === "right" ? "правой" : "левой"}. Сильной — столько же повторов.</p>}
      </div>
      <div className={"sets-head" + (uni ? " uni" : time || noWeight ? " single" : "")}>
        <span>#</span>
        {time || noWeight ? (
          <span>{time ? "секунды" : "повторы"}</span>
        ) : (
          <>
            <span>{ex.tracking === "reps" ? "доп. кг" : "кг"}</span>
            {uni ? (
              <>
                <span>{sideLabel(weakFirst)}</span>
                <span>{sideLabel(weakFirst === "right" ? "left" : "right")}</span>
              </>
            ) : (
              <span>повторы</span>
            )}
          </>
        )}
        <span />
      </div>
      {se.sets.map((set, i) => (
        <SetRow key={set.id} sessionId={session.id} se={se} set={set} index={i} ex={ex} lastSets={last?.sets ?? null} weakFirst={weakFirst} />
      ))}
      <div className="wex-foot">
        <button className="btn small" onClick={() => mutateExercise(session.id, se.id, (e) => addSet(e))}>
          <Icon name="plus" size={16} /> Подход
        </button>
        {se.sets.length > 1 && !se.sets[se.sets.length - 1].done && (
          <button className="btn small ghost" onClick={() => mutateExercise(session.id, se.id, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
            <Icon name="minus" size={16} /> Убрать
          </button>
        )}
      </div>
    </article>
  );
}

// ── Меню упражнения ─────────────────────────────────────
function ExerciseMenu({ session, se, index, onClose }: { session: WorkoutSession; se: SessionExercise; index: number; onClose: () => void }) {
  const profile = useStore((s) => s.meta.profile);
  const [mode, setMode] = useState<"menu" | "swap" | "all" | "note">("menu");
  const [note, setNote] = useState(se.notes);
  const ex = EXERCISE_BY_ID[se.exerciseId];
  const loc = profile.locations[0] ?? "gym";
  const alts = useMemo(() => (ex ? alternatives(ex, EXERCISES, profile, loc).slice(0, 8) : []), [ex, profile, loc]);
  const doSwap = async (id: string) => {
    const to = EXERCISE_BY_ID[id];
    if (!to) return;
    await mutateExercise(session.id, se.id, (e) => swapExercise(e, to, profile, liveSessions(getState())));
    toast(`Заменено на «${to.name}»`);
    onClose();
  };
  if (mode === "all") return <ExercisePickerSheet title="Заменить на…" onPick={doSwap} onClose={onClose} exclude={[se.exerciseId]} />;
  return (
    <Sheet title={ex?.name ?? "Упражнение"} onClose={onClose}>
      {mode === "menu" && (
        <div className="list">
          <button className="list-item" onClick={() => setMode("swap")}>
            <Icon name="swap" />
            <span className="grow">Заменить аналогом</span>
          </button>
          <button className="list-item" onClick={() => setMode("note")}>
            <Icon name="note" />
            <span className="grow">Заметка</span>
          </button>
          <button className="list-item" disabled={index === 0} onClick={() => mutate(session.id, (s) => ({ ...s, exercises: moveItem(s.exercises, index, -1) })).then(onClose)}>
            <Icon name="up" />
            <span className="grow">Выше</span>
          </button>
          <button className="list-item" disabled={index === session.exercises.length - 1} onClick={() => mutate(session.id, (s) => ({ ...s, exercises: moveItem(s.exercises, index, 1) })).then(onClose)}>
            <Icon name="down" />
            <span className="grow">Ниже</span>
          </button>
          <button className="list-item" style={{ color: "var(--bad)" }} onClick={() => mutateExercise(session.id, se.id, () => null).then(onClose)}>
            <Icon name="trash" />
            <span className="grow">Убрать из тренировки</span>
          </button>
        </div>
      )}
      {mode === "swap" && (
        <>
          <p className="small muted">Тот же тип движения, доступно с твоим оборудованием.</p>
          <div className="list">
            {alts.map((a) => (
              <button key={a.id} className="list-item" onClick={() => doSwap(a.id)}>
                <div className="grow">
                  <div className="title">{a.name}</div>
                  <div className="sub">{a.primary.length ? `${a.difficulty}/5 сложность` : ""}</div>
                </div>
                <Icon name="swap" size={18} className="chev" />
              </button>
            ))}
            {!alts.length && <div className="list-item muted">Аналогов с твоим оборудованием нет</div>}
          </div>
          <button className="btn" onClick={() => setMode("all")}>
            Выбрать из всех упражнений
          </button>
        </>
      )}
      {mode === "note" && (
        <>
          <textarea id="ex-note" className="textarea" value={note} maxLength={500} placeholder="Например: сиденье на 4, хват шире" onChange={(e) => setNote(e.target.value)} autoFocus />
          <button
            className="btn primary"
            onClick={() =>
              mutateExercise(session.id, se.id, (e) => ({ ...e, notes: note.trim() })).then(() => {
                toast("Заметка сохранена");
                onClose();
              })
            }
          >
            Сохранить
          </button>
        </>
      )}
    </Sheet>
  );
}

// ── Итог ───────────────────────────────────────────────
export function SummaryView({ session, prs, onDone }: { session: WorkoutSession; prs: SessionPR[]; onDone: () => void }) {
  const dur = (session.endedAt ?? Date.now()) - session.startedAt;
  const sets = sessionDoneSets(session);
  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <span className="eyebrow">Тренировка завершена</span>
      <h1 className="hero-title">{session.title}</h1>
      <div className="stats">
        <div className="stat card tight">
          <span className="v">{fmtDuration(dur)}</span>
          <span className="k">время</span>
        </div>
        <div className="stat card tight">
          <span className="v">{sets}</span>
          <span className="k">{plural(sets, ["подход", "подхода", "подходов"])}</span>
        </div>
        <div className="stat card tight">
          <span className="v">{fmtTonnage(sessionVolume(session))}</span>
          <span className="k">объём</span>
        </div>
      </div>
      {prs.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Новые рекорды</h2>
          </div>
          <div className="list">
            {prs.map((pr) => (
              <div key={pr.exerciseId + pr.kind} className="list-item">
                <Icon name="trophy" className="chev" />
                <div className="grow">
                  <div className="title">{EXERCISE_BY_ID[pr.exerciseId]?.name}</div>
                  <div className="sub">
                    {RECORD_LABEL[pr.kind]}: {fmtRecord(pr.kind, pr.previous)} → <b style={{ color: "var(--accent)" }}>{fmtRecord(pr.kind, pr.value)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="dim small">Рекордов в этот раз нет — это нормально. Главное — регулярность.</p>
      )}
      <button className="btn primary big block" onClick={onDone}>
        Готово
      </button>
    </div>
  );
}

// ── Экран тренировки ────────────────────────────────────
export function WorkoutOverlay() {
  const nav = useNav();
  const session = useStore(activeSession);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<"finish" | "abandon" | null>(null);
  const [summary, setSummary] = useState<{ session: WorkoutSession; prs: SessionPR[] } | null>(null);
  const [notes, setNotes] = useState(session?.notes ?? "");
  const finishing = useRef(false);
  const now = useNow(1000);

  useEffect(() => {
    // Экран не гаснет во время тренировки; после сворачивания блокировку нужно запросить снова.
    let lock: { release(): Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock = (await (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!session && !summary && !finishing.current) nav.closeWorkout();
  }, [session, summary]); // eslint-disable-line react-hooks/exhaustive-deps

  if (summary) {
    return (
      <div className="workout">
        <div className="workout-inner">
          <SummaryView
            session={summary.session}
            prs={summary.prs}
            onDone={() => {
              setSummary(null);
              nav.closeWorkout();
              nav.setTab("today");
            }}
          />
        </div>
      </div>
    );
  }
  if (!session) return null;

  const menuSe = session.exercises.find((e) => e.id === menuFor);
  const pending = session.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const finish = async () => {
    finishing.current = true;
    setRest(null);
    const saved = await finishWorkout(getState().sessions[session.id]);
    const prs = sessionPRs(saved, liveSessions(getState()), EXERCISE_BY_ID);
    setSummary({ session: saved, prs });
    finishing.current = false;
  };

  return (
    <div className="workout" role="dialog" aria-label="Активная тренировка">
      <div className="workout-inner">
        <TopBar
          title={session.title}
          onBack={nav.closeWorkout}
          actions={
            <>
              <span className="clock" aria-label="Время тренировки" style={{ alignSelf: "center", paddingRight: 4 }}>
                {fmtClock((now - session.startedAt) / 1000)}
              </span>
              <button className="btn primary small" onClick={() => setConfirm("finish")} disabled={!doneSets}>
                <Icon name="flag" size={16} /> Завершить
              </button>
            </>
          }
        />
        <div className="screen">
          {session.exercises.length === 0 && (
            <div className="empty">
              <b>Пустая тренировка</b>
              <span className="small">Добавь упражнения из библиотеки.</span>
            </div>
          )}
          {session.exercises.map((se, i) => (
            <ExerciseCard key={se.id} session={session} se={se} index={i} total={session.exercises.length} onMenu={() => setMenuFor(se.id)} onInfo={() => setInfoFor(se.exerciseId)} />
          ))}
          <button className="btn block" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Добавить упражнение
          </button>
          <div className="field">
            <label htmlFor="session-notes">Заметки к тренировке</label>
            <textarea
              id="session-notes"
              className="textarea"
              value={notes}
              maxLength={2000}
              placeholder="Самочувствие, что получилось, что поменять"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => mutate(session.id, (s) => ({ ...s, notes: notes.trim() }))}
            />
          </div>
          <button className="btn ghost block" style={{ color: "var(--bad)" }} onClick={() => setConfirm("abandon")}>
            Отменить тренировку
          </button>
        </div>
      </div>
      <RestTimer />
      {menuSe && <ExerciseMenu session={session} se={menuSe} index={session.exercises.indexOf(menuSe)} onClose={() => setMenuFor(null)} />}
      {infoFor && (
        <Sheet title={EXERCISE_BY_ID[infoFor]?.name ?? ""} onClose={() => setInfoFor(null)}>
          <ExerciseInfo id={infoFor} compact />
        </Sheet>
      )}
      {adding && (
        <ExercisePickerSheet
          title="Добавить упражнение"
          exclude={session.exercises.map((e) => e.exerciseId)}
          onClose={() => setAdding(false)}
          onPick={async (id) => {
            const ex = EXERCISE_BY_ID[id];
            const st = getState();
            const se = makeSessionExercise({
              exercise: ex,
              block: "main",
              sets: 3,
              repsMin: ex.tracking === "time" ? null : 8,
              repsMax: ex.tracking === "time" ? null : 12,
              durationSec: ex.tracking === "time" ? 30 : null,
              restSec: ex.mechanics === "compound" ? 120 : 75,
              profile: st.meta.profile,
              sessions: liveSessions(st),
            });
            await mutate(session.id, (s) => ({ ...s, exercises: [...s.exercises, se] }));
            setAdding(false);
          }}
        />
      )}
      {confirm === "finish" && (
        <Confirm
          title="Завершить тренировку?"
          text={pending ? `Невыполненные подходы (${pending}) не сохранятся.` : "Все подходы выполнены. Отличная работа!"}
          confirmLabel="Завершить"
          onConfirm={finish}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "abandon" && (
        <Confirm
          title="Отменить тренировку?"
          text="Записанные подходы этой тренировки удалятся."
          confirmLabel="Отменить тренировку"
          danger
          onConfirm={() => {
            setRest(null);
            void abandonWorkout(session).then(() => nav.closeWorkout());
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
