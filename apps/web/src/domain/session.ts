import type { CarryItem, CircuitStation, Enrollment, Exercise, ItemBlock, Location, Program, ProgramItem, Profile, SessionExercise, SetLog, WorkoutSession } from "../data/types";
import { alternatives, isAvailable, zoneCaution } from "./availability";
import { overloadHint } from "./overload";
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

/** Упражнение программы на этот цикл: базовое или одна из вариаций по кругу. */
export function pickVariant(item: Pick<ProgramItem, "exerciseId" | "variants">, cycle: number): string {
  const all = [item.exerciseId, ...(item.variants ?? [])];
  return all[((cycle % all.length) + all.length) % all.length];
}

/** Номер прохода программы: сколько полных циклов уже сделано. */
export function programCycle(en: Enrollment | null, program: Program): number {
  if (!en || en.programId !== program.id || !program.days.length) return 0;
  return Math.floor(en.completedSessions / program.days.length);
}

/** Станции круга: как в прошлый раз (если менял вариации), иначе из профиля. */
function circuitStations(sessions: WorkoutSession[], exerciseId: string, profile: Profile | null): CircuitStation[] {
  const recent = sessions
    .filter((x) => x.status === "done" && !x.deletedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .flatMap((x) => x.exercises)
    .find((e) => e.exerciseId === exerciseId && e.circuit?.stations.length);
  const fromProfile = profile?.circuit.stations ?? [];
  return (recent?.circuit?.stations ?? fromProfile).map((st) => ({ ...st }));
}

/** Упражнение тренировки с подходами, заполненными по прошлому разу (или по базовым результатам). */
export function makeSessionExercise(o: BuildOptions): SessionExercise {
  if (o.exercise.tracking === "rounds") {
    const c = o.profile?.circuit;
    return {
      id: uuidv7(),
      exerciseId: o.exercise.id,
      block: o.block,
      plannedItemId: o.plannedItemId ?? null,
      swappedFromId: null,
      targetSets: 1,
      repsMin: null,
      repsMax: null,
      durationSec: null,
      restSec: 0,
      notes: o.note ?? "",
      sets: [],
      circuit: { stations: circuitStations(o.sessions, o.exercise.id, o.profile), targetRounds: c?.targetRounds ?? null, timeCapMin: c?.timeCapMin ?? null },
    };
  }
  const last = lastPerformance(o.exercise.id, o.sessions);
  const base = baselineWeight(o.exercise, o.profile, o.repsMax ?? null);
  // Пора прибавить вес — подставляем новый вес сразу. Для проблемных зон — только подсказка.
  const hint = overloadHint(o.exercise, last?.sets ?? null, o.repsMin ?? null, o.repsMax ?? null);
  const caution = zoneCaution(o.exercise, o.profile);
  const raised = hint?.kind === "increase" && !caution?.limitsHeavy ? hint.weight : null;
  const sets: SetLog[] = [];
  for (let i = 0; i < Math.max(1, o.sets); i++) {
    const prev = last?.sets[Math.min(i, (last?.sets.length ?? 1) - 1)];
    sets.push(
      newSet({
        weight: o.exercise.tracking === "time" ? prev?.weight ?? null : raised ?? prev?.weight ?? base,
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
  /** Номер прохода программы — для чередования упражнений. */
  cycle?: number;
  /** Упражнения, которые нужно добить с прошлой тренировки. */
  carryOver?: CarryItem[];
  now?: number;
}): WorkoutSession {
  const now = args.now ?? Date.now();
  const cycle = args.cycle ?? 0;
  const day = args.program.days[args.dayIndex % args.program.days.length];
  const location = args.location ?? args.profile?.locations[0] ?? "gym";
  const exercises = day.items
    .map((it) => fromItem({ ...it, exerciseId: pickVariant(it, cycle) }, args.exerciseById, args.all, args.profile, location, args.sessions))
    .filter((x): x is SessionExercise => !!x);

  const firstMain = () => {
    const i = exercises.findIndex((e) => e.block !== "warmup");
    return i < 0 ? exercises.length : i;
  };

  // Добить пропущенное — сразу после разминки, пока есть силы.
  const carried: SessionExercise[] = [];
  for (const c of args.carryOver ?? []) {
    const ex = args.exerciseById[c.exerciseId];
    if (!ex || exercises.some((e) => e.exerciseId === c.exerciseId)) continue;
    carried.push({
      ...makeSessionExercise({ exercise: ex, block: "main", sets: c.sets, repsMin: c.repsMin, repsMax: c.repsMax, durationSec: c.durationSec, restSec: c.restSec, note: "Добиваем с прошлой тренировки", profile: args.profile, sessions: args.sessions }),
      carried: true,
    });
  }
  exercises.splice(firstMain(), 0, ...carried);

  // Круговой блок из профиля — только в программных тренировках.
  const circuit = args.profile?.circuit;
  const circuitEx = args.exerciseById["circuit_5_10_15"];
  if (args.program.kind === "program" && circuit?.enabled && circuitEx) {
    const se = makeSessionExercise({ exercise: circuitEx, block: "main", sets: 1, restSec: 0, profile: args.profile, sessions: args.sessions });
    if (circuit.position === "start") exercises.splice(firstMain(), 0, se);
    else {
      const cd = exercises.findIndex((e) => e.block === "cooldown");
      exercises.splice(cd < 0 ? exercises.length : cd, 0, se);
    }
  }

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

/** Завершение: невыполненные подходы удаляются. Пропущенные упражнения из плана остаются
 *  с пустым списком подходов — по ним строится сводка «что не успел». Пустые добавленные вручную — удаляются. */
export function finalizeSession(s: WorkoutSession, now = Date.now()): WorkoutSession {
  const exercises = s.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
    .filter((e) => e.sets.length > 0 || e.plannedItemId != null || e.carried);
  return { ...s, exercises, status: "done", endedAt: now };
}

export function hasDoneSets(s: WorkoutSession): boolean {
  return s.exercises.some((e) => e.sets.some((x) => x.done));
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
