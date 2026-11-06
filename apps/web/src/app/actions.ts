// Сценарии приложения: связывают доменную логику и хранилище. UI вызывает только их.
import { EXERCISES, EXERCISE_BY_ID, programById } from "../data/catalog";
import { getDraft, setDraft } from "./draft";
import type { Plan } from "../domain/plan-types";
import { activeSession, getState, liveSessions, saveSession, updateMeta } from "../data/store";
import type { CarryItem, Goal, Program, ProgramItem, ProgramTweaks, UserMeta, WorkoutSession } from "../data/types";
import type { NextAction } from "../domain/review";
import { advanceEnrollment, buildSessionFromProgram, emptySession, finalizeSession, hasDoneSets, makeSessionExercise, programCycle } from "../domain/session";
import { uuidv7 } from "../domain/ids";
import { effectiveDay } from "../domain/tweaks";
import { saveProgram } from "../data/store";

export async function enroll(programId: string): Promise<void> {
  await updateMeta((m) => ({ ...m, enrollment: { programId, startedAt: Date.now(), nextDayIndex: 0, completedSessions: 0 } }));
}

export async function setNextDay(index: number): Promise<void> {
  await updateMeta((m) => (m.enrollment ? { ...m, enrollment: { ...m.enrollment, nextDayIndex: index } } : m));
}

export async function changeGoal(goal: Goal): Promise<void> {
  await updateMeta((m) => (m.profile.goal === goal ? m : { ...m, profile: { ...m.profile, goal }, goalHistory: [...m.goalHistory, { goal, at: Date.now() }] }));
}

export async function startProgramDay(program: Program, dayIndex: number): Promise<WorkoutSession> {
  const s = getState();
  const existing = activeSession(s);
  if (existing) return existing;
  const en = s.meta.enrollment;
  const mine = en?.programId === program.id && program.kind === "program";
  const session = buildSessionFromProgram({
    program,
    dayIndex,
    profile: s.meta.profile,
    sessions: liveSessions(s),
    exerciseById: EXERCISE_BY_ID,
    all: EXERCISES,
    cycle: programCycle(en, program),
    carryOver: mine ? en?.carryOver : undefined,
    tweaks: s.meta.programTweaks?.[program.id],
  });
  await saveSession(session);
  // Перенесённые упражнения добавлены в эту тренировку — очередь переноса очищаем.
  if (mine && en?.carryOver?.length) await updateMeta((m) => (m.enrollment ? { ...m, enrollment: { ...m.enrollment, carryOver: [] } } : m));
  return session;
}

export async function startFree(): Promise<WorkoutSession> {
  const s = getState();
  const existing = activeSession(s);
  if (existing) return existing;
  const session = emptySession("Свободная тренировка");
  await saveSession(session);
  return session;
}

export async function finishWorkout(session: WorkoutSession): Promise<WorkoutSession> {
  const done = finalizeSession(session);
  await saveSession(done);
  const s = getState();
  const en = s.meta.enrollment;
  const program = programById(s, session.programId);
  if (en && program && program.kind === "program" && en.programId === session.programId && hasDoneSets(done)) {
    await updateMeta((m) => ({ ...m, enrollment: m.enrollment ? advanceEnrollment(m.enrollment, program, session.dayIndex) : null }));
  }
  return getState().sessions[done.id];
}

export async function abandonWorkout(session: WorkoutSession): Promise<void> {
  await saveSession({ ...session, status: "abandoned", endedAt: Date.now(), deletedAt: Date.now() });
}

/** Решение из сводки. Переход к следующему дню уже сделан при завершении; здесь — отмена или перенос. */
export async function applyNextAction(session: WorkoutSession, action: NextAction, carry: CarryItem[]): Promise<void> {
  await updateMeta((m) => {
    const en = m.enrollment;
    if (!en || en.programId !== session.programId) return m;
    if (action === "repeat" && session.dayIndex != null) return { ...m, enrollment: { ...en, nextDayIndex: session.dayIndex, carryOver: [] } };
    if (action === "carry") return { ...m, enrollment: { ...en, carryOver: carry } };
    return { ...m, enrollment: { ...en, carryOver: [] } };
  });
}

// ── Предпросмотр ──────────────────────────────────────

/** Собрать черновик дня программы (не начиная тренировку). */
export function prepareProgramDay(program: Program, dayIndex: number): void {
  const s = getState();
  const en = s.meta.enrollment;
  const mine = en?.programId === program.id && program.kind === "program";
  const carry = mine ? en?.carryOver ?? [] : [];
  const session = buildSessionFromProgram({
    program,
    dayIndex,
    profile: s.meta.profile,
    sessions: liveSessions(s),
    exerciseById: EXERCISE_BY_ID,
    all: EXERCISES,
    cycle: programCycle(en, program),
    carryOver: carry,
    tweaks: s.meta.programTweaks?.[program.id],
  });
  setDraft({ session, usesCarry: carry.length > 0, source: "program" });
}

export function prepareCustom(title = "Своя тренировка"): void {
  setDraft({ session: emptySession(title), usesCarry: false, source: "custom" });
}

export function preparePlan(plan: Plan): void {
  const s = getState();
  const session = emptySession(plan.title);
  session.exercises = plan.items.map((it) =>
    makeSessionExercise({
      exercise: EXERCISE_BY_ID[it.exerciseId],
      block: it.block,
      sets: it.sets,
      repsMin: it.repsMin,
      repsMax: it.repsMax,
      durationSec: it.durationSec,
      restSec: it.restSec,
      note: it.note,
      profile: s.meta.profile,
      sessions: liveSessions(s),
    }),
  );
  setDraft({ session, usesCarry: false, source: "plan", rationale: plan.rationale, planSource: plan.source });
}

/** Начать тренировку из черновика. */
export async function startDraft(): Promise<WorkoutSession | null> {
  const d = getDraft();
  const s = getState();
  if (!d) return null;
  const existing = activeSession(s);
  if (existing) return existing;
  const now = Date.now();
  const session: WorkoutSession = { ...d.session, id: uuidv7(now), status: "active", startedAt: now, createdAt: now, updatedAt: now };
  await saveSession(session);
  if (d.usesCarry) await updateMeta((m) => (m.enrollment ? { ...m, enrollment: { ...m.enrollment, carryOver: [] } } : m));
  if (d.remember) await rememberSessionChanges(session);
  setDraft(null);
  return session;
}

// ── Свои программы ────────────────────────────────────

export async function createProgram(): Promise<Program> {
  const p = getState().meta.profile;
  const now = Date.now();
  const program: Program = {
    id: uuidv7(now),
    owner: "user",
    kind: "program",
    name: "Моя программа",
    summary: "",
    description: "Своя программа.",
    locations: [...p.locations],
    goals: [p.goal],
    levels: [p.level],
    daysPerWeek: p.daysPerWeek,
    emphasis: [],
    minutes: p.sessionMin,
    days: [{ id: uuidv7(now), name: "День 1", focus: "", items: [] }],
    createdAt: now,
    updatedAt: now,
    rev: 0,
    deletedAt: null,
  };
  await saveProgram(program);
  return getState().programs[program.id];
}

/** Копия шаблона, которую можно менять. Новые id, чтобы не смешивать с оригиналом. */
export async function copyProgram(src: Program): Promise<Program> {
  const now = Date.now();
  const program: Program = {
    ...structuredClone(src),
    id: uuidv7(now),
    owner: "user",
    name: `${src.name} (моя)`,
    sourceId: src.id,
    days: src.days.map((d) => ({ ...d, id: uuidv7(), items: d.items.map((i) => ({ ...i, id: uuidv7() })) })),
    createdAt: now,
    updatedAt: now,
    rev: 0,
    deletedAt: null,
  };
  await saveProgram(program);
  return getState().programs[program.id];
}

export async function deleteProgram(program: Program): Promise<void> {
  await saveProgram({ ...program, deletedAt: Date.now() });
  if (getState().meta.enrollment?.programId === program.id) await updateMeta((m) => ({ ...m, enrollment: null }));
}

// ── Личные правки программы ───────────────────────────

type ItemPatch = Partial<Pick<ProgramItem, "sets" | "repsMin" | "repsMax" | "restSec" | "durationSec">>;

function tweaksOf(m: UserMeta, programId: string): ProgramTweaks {
  return m.programTweaks?.[programId] ?? {};
}

/** Добавить упражнение в день программы насовсем. */
export async function addToProgramDay(programId: string, dayId: string, exerciseId: string, patch: ItemPatch = {}): Promise<void> {
  const ex = EXERCISE_BY_ID[exerciseId];
  if (!ex) return;
  const time = ex.tracking === "time";
  const compound = ex.mechanics === "compound";
  const item: ProgramItem = {
    id: `x-${uuidv7()}`,
    exerciseId,
    block: "main",
    sets: 3,
    ...(time ? { durationSec: 30 } : { repsMin: compound ? 6 : 10, repsMax: compound ? 10 : 15 }),
    restSec: compound ? 120 : 60,
    ...patch,
  };
  await updateMeta((m) => {
    const t = tweaksOf(m, programId);
    const list = t.extras?.[dayId] ?? [];
    if (list.some((x) => x.exerciseId === exerciseId)) return m;
    return { ...m, programTweaks: { ...m.programTweaks, [programId]: { ...t, extras: { ...t.extras, [dayId]: [...list, item] } } } };
  });
}

export async function removeFromProgramDay(programId: string, dayId: string, itemId: string): Promise<void> {
  await updateMeta((m) => {
    const t = tweaksOf(m, programId);
    return { ...m, programTweaks: { ...m.programTweaks, [programId]: { ...t, extras: { ...t.extras, [dayId]: (t.extras?.[dayId] ?? []).filter((x) => x.id !== itemId) } } } };
  });
}

/** Сохранить подходы/повторы упражнения программы для будущих тренировок. */
export async function saveItemPatches(programId: string, patches: { dayId: string; itemId: string; patch: ItemPatch }[]): Promise<void> {
  if (!patches.length) return;
  await updateMeta((m) => {
    const t = { ...tweaksOf(m, programId) };
    const extras = { ...t.extras };
    const overrides = { ...t.overrides };
    for (const { dayId, itemId, patch } of patches) {
      if (extras[dayId]?.some((x) => x.id === itemId)) extras[dayId] = extras[dayId].map((x) => (x.id === itemId ? { ...x, ...patch } : x));
      else overrides[itemId] = { ...overrides[itemId], ...patch };
    }
    return { ...m, programTweaks: { ...m.programTweaks, [programId]: { ...t, extras, overrides } } };
  });
}

export async function resetProgramTweaks(programId: string): Promise<void> {
  await updateMeta((m) => {
    const next = { ...m.programTweaks };
    delete next[programId];
    return { ...m, programTweaks: next };
  });
}

/** Перенести в программу изменения из тренировки: подходы/повторы/отдых и добавленные упражнения. */
export async function rememberSessionChanges(session: WorkoutSession, opts: { useDoneSets?: boolean; only?: string[] } = {}): Promise<number> {
  const st = getState();
  const program = programById(st, session.programId);
  if (!program || program.kind !== "program" || !session.dayId) return 0;
  const rawDay = program.days.find((d) => d.id === session.dayId);
  if (!rawDay) return 0;
  const day = effectiveDay(rawDay, st.meta.programTweaks?.[program.id]);
  const patches: { dayId: string; itemId: string; patch: ItemPatch }[] = [];
  let added = 0;
  for (const e of session.exercises) {
    if (e.circuit || e.carried || e.block !== "main") continue;
    if (opts.only && !opts.only.includes(e.id)) continue;
    const sets = opts.useDoneSets ? e.sets.filter((x) => x.done).length || e.targetSets : e.targetSets;
    const item = e.plannedItemId ? day.items.find((i) => i.id === e.plannedItemId) : undefined;
    if (item) {
      const patch: ItemPatch = {};
      if (sets !== item.sets) patch.sets = sets;
      if (e.repsMin != null && e.repsMin !== item.repsMin) patch.repsMin = e.repsMin;
      if (e.repsMax != null && e.repsMax !== item.repsMax) patch.repsMax = e.repsMax;
      if (e.restSec !== item.restSec) patch.restSec = e.restSec;
      if (Object.keys(patch).length) patches.push({ dayId: day.id, itemId: item.id, patch });
    } else if (!e.plannedItemId && !day.items.some((i) => i.exerciseId === e.exerciseId)) {
      await addToProgramDay(program.id, day.id, e.exerciseId, { sets, repsMin: e.repsMin ?? undefined, repsMax: e.repsMax ?? undefined, restSec: e.restSec, durationSec: e.durationSec ?? undefined });
      added++;
    }
  }
  await saveItemPatches(program.id, patches);
  return patches.length + added;
}
