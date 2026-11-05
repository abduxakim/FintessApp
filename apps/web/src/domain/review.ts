// Сводка после тренировки: сравнение с планом и рекомендация, что делать дальше.
// Правила простые и объяснимые; это подсказка, решение остаётся за пользователем.
import type { CarryItem, Exercise, MuscleId, Profile, WorkoutSession } from "../data/types";
import { MUSCLES } from "../data/seed/labels";

export type NextAction = "continue" | "carry" | "repeat";

export interface ExerciseReview {
  exerciseId: string;
  planned: number;
  done: number;
  status: "done" | "partial" | "skipped";
  carried: boolean;
}

export interface GroupReview {
  group: string;
  planned: number;
  done: number;
}

export interface SessionReview {
  fromProgram: boolean;
  completion: number;
  plannedSets: number;
  doneSets: number;
  exercises: ExerciseReview[];
  skipped: ExerciseReview[];
  partial: ExerciseReview[];
  groups: GroupReview[];
  /** Группы, по которым сделано меньше половины плана. */
  missedGroups: string[];
  rounds: number;
  durationMin: number;
  plannedMin: number | null;
  verdict: "full" | "partial" | "short" | "free";
  recommended: NextAction;
  actions: NextAction[];
  advice: string[];
  carry: CarryItem[];
}

const MAX_CARRY = 3;

export function reviewSession(
  session: WorkoutSession,
  exerciseById: Record<string, Exercise>,
  opts: { profile?: Profile | null; plannedMin?: number | null; dayName?: string | null; nextDayName?: string | null; now?: number } = {},
): SessionReview {
  const main = session.exercises.filter((e) => e.block === "main" && !e.circuit);
  const exercises: ExerciseReview[] = main.map((e) => {
    const done = e.sets.filter((s) => s.done && s.type === "work").length;
    const planned = Math.max(e.targetSets, 1);
    return { exerciseId: e.exerciseId, planned, done, carried: !!e.carried, status: done >= planned ? "done" : done > 0 ? "partial" : "skipped" };
  });
  const plannedSets = exercises.reduce((n, e) => n + e.planned, 0);
  const doneSets = exercises.reduce((n, e) => n + Math.min(e.done, e.planned), 0);
  const completion = plannedSets ? doneSets / plannedSets : 1;

  const groupsMap = new Map<string, GroupReview>();
  for (const e of exercises) {
    const ex = exerciseById[e.exerciseId];
    if (!ex) continue;
    const groups = new Set(ex.primary.map((m: MuscleId) => MUSCLES[m].group));
    for (const g of groups) {
      const cur = groupsMap.get(g) ?? { group: g, planned: 0, done: 0 };
      cur.planned += e.planned;
      cur.done += Math.min(e.done, e.planned);
      groupsMap.set(g, cur);
    }
  }
  const groups = [...groupsMap.values()].sort((a, b) => b.planned - a.planned);
  const missedGroups = groups.filter((g) => g.planned >= 2 && g.done / g.planned < 0.5).map((g) => g.group);

  const skipped = exercises.filter((e) => e.status === "skipped");
  const partial = exercises.filter((e) => e.status === "partial");
  const rounds = session.exercises.filter((e) => e.circuit).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const end = session.endedAt ?? opts.now ?? Date.now();
  const durationMin = Math.round((end - session.startedAt) / 60000);
  const fromProgram = session.programId != null && session.dayIndex != null;

  // Что добить: недоделанные подходы, сначала базовые упражнения и зоны в фокусе.
  const focus = new Set(opts.profile?.focusMuscles ?? []);
  const carry: CarryItem[] = [...skipped, ...partial]
    .filter((e) => !e.carried)
    .map((e) => ({ e, ex: exerciseById[e.exerciseId], se: main.find((m) => m.exerciseId === e.exerciseId)! }))
    .filter((x) => x.ex && x.ex.category !== "stretch" && x.ex.category !== "warmup")
    .sort((a, b) => score(b.ex, focus) - score(a.ex, focus))
    .slice(0, MAX_CARRY)
    .map(({ e, se }) => ({
      exerciseId: e.exerciseId,
      sets: Math.min(3, Math.max(1, e.planned - e.done)),
      repsMin: se.repsMin,
      repsMax: se.repsMax,
      durationSec: se.durationSec,
      restSec: se.restSec,
      fromSessionId: session.id,
    }));

  const advice: string[] = [];
  let verdict: SessionReview["verdict"];
  let recommended: NextAction = "continue";
  const actions: NextAction[] = [];

  if (!fromProgram) {
    verdict = "free";
  } else if (completion >= 0.85) {
    verdict = "full";
    advice.push(`План выполнен на ${Math.round(completion * 100)}%. Следующая по плану${opts.nextDayName ? ` — «${opts.nextDayName}»` : ""}.`);
    actions.push("continue");
  } else if (completion >= 0.5) {
    verdict = "partial";
    const what = missedGroups.length ? ` Недобрали: ${missedGroups.join(", ").toLowerCase()}.` : "";
    advice.push(`Сделано ${Math.round(completion * 100)}% плана.${what}`);
    if (carry.length) {
      recommended = "carry";
      advice.push("Можно добить пропущенное в начале следующей тренировки — это 10–20 минут, нагрузка на эти мышцы не потеряется.");
    }
    actions.push("continue", "carry", "repeat");
  } else {
    verdict = "short";
    recommended = "repeat";
    advice.push(
      `Сделано меньше половины плана (${Math.round(completion * 100)}%).${opts.dayName ? ` Лучше повторить «${opts.dayName}» в следующий раз` : " Лучше повторить этот день"}, а не переходить дальше — иначе эти мышцы получат нагрузку только через цикл.`,
    );
    actions.push("repeat", "carry", "continue");
  }
  if (!carry.length) {
    const i = actions.indexOf("carry");
    if (i >= 0) actions.splice(i, 1);
  }

  if (opts.plannedMin && durationMin > opts.plannedMin + 30) {
    advice.push(`Тренировка заняла ${durationMin} мин при плане около ${opts.plannedMin}. Если времени мало — сократи отдых в изолирующих упражнениях или пропускай последние из них, а не базовые.`);
  }
  if (rounds > 0 && fromProgram && completion < 0.85) {
    advice.push("Если после круга не хватает сил на основную часть — попробуй ставить его в конец тренировки (Профиль → Круг 5-10-15).");
  }

  return { fromProgram, completion, plannedSets, doneSets, exercises, skipped, partial, groups, missedGroups, rounds, durationMin, plannedMin: opts.plannedMin ?? null, verdict, recommended, actions, advice, carry };
}

function score(ex: Exercise, focus: Set<MuscleId>): number {
  return (ex.mechanics === "compound" ? 2 : 0) + ex.primary.filter((m) => focus.has(m)).length * 2;
}
