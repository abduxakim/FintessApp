// Сценарии приложения: связывают доменную логику и хранилище. UI вызывает только их.
import { EXERCISES, EXERCISE_BY_ID, programById } from "../data/catalog";
import { activeSession, getState, liveSessions, saveSession, updateMeta } from "../data/store";
import type { Goal, Program, WorkoutSession } from "../data/types";
import { advanceEnrollment, buildSessionFromProgram, emptySession, finalizeSession } from "../domain/session";

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
  const session = buildSessionFromProgram({
    program,
    dayIndex,
    profile: s.meta.profile,
    sessions: liveSessions(s),
    exerciseById: EXERCISE_BY_ID,
    all: EXERCISES,
  });
  await saveSession(session);
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
  if (en && program && program.kind === "program" && en.programId === session.programId && done.exercises.length) {
    await updateMeta((m) => ({ ...m, enrollment: m.enrollment ? advanceEnrollment(m.enrollment, program, session.dayIndex) : null }));
  }
  return getState().sessions[done.id];
}

export async function abandonWorkout(session: WorkoutSession): Promise<void> {
  await saveSession({ ...session, status: "abandoned", endedAt: Date.now(), deletedAt: Date.now() });
}
