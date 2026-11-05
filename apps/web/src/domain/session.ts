import type { Enrollment, Exercise, ItemBlock, Location, Program, ProgramItem, Profile, SessionExercise, SetLog, WorkoutSession } from "../data/types";
import { alternatives, isAvailable } from "./availability";
import { lastPerformance } from "./history";
import { e1rm, weightForReps } from "./strength";
import { uuidv7 } from "./ids";

export function newSet(partial: Partial<SetLog> = {}): SetLog {
  return { id: uuidv7(), type: "work", weight: null, reps: null, repsL: null, repsR: null, durationSec: null, done: false, doneAt: null, ...partial };
}

/** Стартовый вес по базовым результатам из профиля (сейчас — только жим лёжа). */
export function baselineWeight(ex: Exercise, profile: Profile | null, repsTarget: number | null): number | null {
  const b = profile?.baselines;
  if (!b || !repsTarget) return null;
  const one = e1rm(b.benchKg ?? null, b.benchReps ?? null);
  if (!one) return null;
  const ratio: Record<string, number> = { bench_press: 1, incline_bench_press: 0.85, close_grip_bench: 0.85 };
  const r = ratio[ex.id];
  if (!r) return null;
  return weightForReps(one * r, repsTarget, ex.loadStep ?? 2.5);
}

export interface BuildOptions {
  exercise: Exercise;
  block: ItemBlock;
  sets: number;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSec?: number | null;
  restSec: number;
  plannedItemId?: string | null;
  swappedFromId?: string | null;
  note?: string;
  profile: Profile | null;
  sessions: WorkoutSession[];
}

/** Упражнение тренировки с подходами, заполненными по прошлому разу (или по базовым результатам). */
export function makeSessionExercise(o: BuildOptions): SessionExercise {
  const last = lastPerformance(o.exercise.id, o.sessions);
  const base = baselineWeight(o.exercise, o.profile, o.repsMax ?? null);
  const sets: SetLog[] = [];
  for (let i = 0; i < Math.max(1, o.sets); i++) {
    const prev = last?.sets[Math.min(i, (last?.sets.length ?? 1) - 1)];
    sets.push(
      newSet({
        weight: o.exercise.tracking === "time" ? prev?.weight ?? null : prev?.weight ?? base,
        durationSec: o.exercise.tracking === "time" ? prev?.durationSec ?? o.durationSec ?? null : null,
      }),
    );
  }
  return {
    id: uuidv7(),
    exerciseId: o.exercise.id,
    block: o.block,
    plannedItemId: o.plannedItemId ?? null,
    swappedFromId: o.swappedFromId ?? null,
    targetSets: Math.max(1, o.sets),
    repsMin: o.repsMin ?? null,
    repsMax: o.repsMax ?? null,
    durationSec: o.durationSec ?? null,
    restSec: o.restSec,
    notes: o.note ?? "",
    sets,
  };
}

function fromItem(item: ProgramItem, exerciseById: Record<string, Exercise>, all: Exercise[], profile: Profile | null, location: Location, sessions: WorkoutSession[]): SessionExercise | null {
  let ex = exerciseById[item.exerciseId];
  if (!ex) return null;
  let swappedFromId: string | null = null;
  if (profile && !isAvailable(ex, profile, location)) {
    const alt = alternatives(ex, all, profile, location)[0];
    if (alt) {
      swappedFromId = ex.id;
      ex = alt;
    }
  }
  return makeSessionExercise({
    exercise: ex,
    block: item.block,
    sets: item.sets,
    repsMin: item.repsMin,
    repsMax: item.repsMax,
    durationSec: item.durationSec,
    restSec: item.restSec,
    plannedItemId: item.id,
    swappedFromId,
    note: item.note,
    profile,
    sessions,
  });
}

export function buildSessionFromProgram(args: {
  program: Program;
  dayIndex: number;
  profile: Profile | null;
  sessions: WorkoutSession[];
  exerciseById: Record<string, Exercise>;
  all: Exercise[];
  location?: Location;
  now?: number;
}): WorkoutSession {
  const now = args.now ?? Date.now();
  const day = args.program.days[args.dayIndex % args.program.days.length];
  const location = args.location ?? args.profile?.locations[0] ?? "gym";
  const exercises = day.items
    .map((it) => fromItem(it, args.exerciseById, args.all, args.profile, location, args.sessions))
    .filter((x): x is SessionExercise => !!x);
  const title = args.program.kind === "block" ? args.program.name : `${args.program.name} · ${day.name}`;
  return {
    id: uuidv7(now),
    status: "active",
    title,
    programId: args.program.id,
    programName: args.program.name,
    dayId: day.id,
    dayIndex: args.dayIndex % args.program.days.length,
    startedAt: now,
    endedAt: null,
    notes: "",
    exercises,
    createdAt: now,
    updatedAt: now,
    rev: 1,
    deletedAt: null,
  };
}

export function emptySession(title: string, now = Date.now()): WorkoutSession {
  return {
    id: uuidv7(now),
    status: "active",
    title,
    programId: null,
    programName: null,
    dayId: null,
    dayIndex: null,
    startedAt: now,
    endedAt: null,
    notes: "",
    exercises: [],
    createdAt: now,
    updatedAt: now,
    rev: 1,
    deletedAt: null,
  };
}

/** Новый подход копирует значения предыдущего. */
export function addSet(se: SessionExercise): SessionExercise {
  const last = se.sets[se.sets.length - 1];
  return {
    ...se,
    sets: [...se.sets, newSet({ weight: last?.weight ?? null, reps: last?.done ? last.reps : null, repsL: last?.done ? last.repsL : null, repsR: last?.done ? last.repsR : null, durationSec: last?.durationSec ?? null })],
  };
}

/** Замена упражнения аналогом: подходы пересоздаются по истории нового упражнения. */
export function swapExercise(se: SessionExercise, to: Exercise, profile: Profile | null, sessions: WorkoutSession[]): SessionExercise {
  const fresh = makeSessionExercise({
    exercise: to,
    block: se.block,
    sets: se.targetSets,
    repsMin: se.repsMin,
    repsMax: se.repsMax,
    durationSec: se.durationSec,
    restSec: se.restSec,
    plannedItemId: se.plannedItemId,
    swappedFromId: se.swappedFromId ?? se.exerciseId,
    profile,
    sessions,
  });
  return { ...fresh, id: se.id, notes: se.notes };
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const copy = list.slice();
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}

/** Завершение: невыполненные подходы удаляются, пустые упражнения тоже. */
export function finalizeSession(s: WorkoutSession, now = Date.now()): WorkoutSession {
  const exercises = s.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length > 0);
  return { ...s, exercises, status: "done", endedAt: now };
}

export function advanceEnrollment(en: Enrollment, program: Program, completedDayIndex: number | null): Enrollment {
  const len = Math.max(1, program.days.length);
  const base = completedDayIndex ?? en.nextDayIndex;
  return { ...en, nextDayIndex: (base + 1) % len, completedSessions: en.completedSessions + 1 };
}

/** Повторы, которые подставятся, если подход отмечен без ввода: прошлый раз → нижняя граница цели. */
export function suggestedReps(se: SessionExercise, setIndex: number, lastSets: SetLog[] | null): number | null {
  const prev = lastSets?.[Math.min(setIndex, lastSets.length - 1)];
  if (prev?.reps != null) return prev.reps;
  if (prev && (prev.repsL != null || prev.repsR != null)) return Math.min(prev.repsL ?? Infinity, prev.repsR ?? Infinity);
  return se.repsMin ?? se.repsMax ?? null;
}
