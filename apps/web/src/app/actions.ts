// Сценарии приложения: связывают доменную логику и хранилище. UI вызывает только их.
import { EXERCISES, EXERCISE_BY_ID, programById } from "../data/catalog";
import { getDraft, setDraft } from "./draft";
import type { Plan } from "../domain/plan-types";
import { activeSession, getState, liveSessions, saveSession, updateMeta } from "../data/store";
import type { CarryItem, Goal, Program, WorkoutSession } from "../data/types";
import type { NextAction } from "../domain/review";
import { advanceEnrollment, buildSessionFromProgram, emptySession, finalizeSession, hasDoneSets, makeSessionExercise, programCycle } from "../domain/session";
import { uuidv7 } from "../domain/ids";
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
