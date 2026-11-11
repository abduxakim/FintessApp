// Рекомендации на сегодня: собираются из разных модулей в один понятный список.
import type { Exercise, Profile, ProgramItem } from "../data/types";
import type { LiftSummary } from "./lifts";
import { zoneCaution } from "./availability";
import { ZONES } from "../data/seed/labels";
import { fmtKg } from "./format";

export interface NextHint {
  exerciseId: string;
  text: string;
  kind: "increase" | "reps" | "hold" | "progress-bodyweight";
  /** Прибавка не подставлена в план: упражнение нагружает проблемную зону. */
  cautious?: boolean;
}

/** «если плечо не беспокоит» — для упражнений, нагружающих зону, где тяжёлый вес нежелателен. */
export function cautionNote(ex: Exercise, profile: Profile | null): string | null {
  const z = zoneCaution(ex, profile);
  return z?.limitsHeavy ? `если ${ZONES[z.zone].toLowerCase()}${z.zone === "hip" ? " сустав" : ""} не беспокоит` : null;
}

/** Совет по весу на следующий раз для одного упражнения. Общий для «Рекомендаций» и плана тренировки. */
export function liftHint(l: LiftSummary | undefined, ex: Exercise, profile: Profile | null): NextHint | null {
  const n = l?.next;
  if (!l || !n) return null;
  if (n.kind === "increase") {
    const note = cautionNote(ex, profile);
    return { exerciseId: ex.id, kind: n.kind, cautious: !!note, text: note ? `можно ${fmtKg(n.weight)} кг, ${note}` : `${fmtKg(n.weight)} кг (было ${fmtKg(l.last.weight)})` };
  }
  if (n.kind === "progress-bodyweight") return { exerciseId: ex.id, kind: n.kind, text: "добавь вес или усложни вариант" };
  if (n.kind === "hold") return { exerciseId: ex.id, kind: n.kind, text: `оставь ${fmtKg(n.weight)} кг, добирай повторы` };
  return null;
}

/** Что изменить в следующей тренировке: по упражнениям её плана и истории выполнения. */
export function nextWorkoutHints(items: ProgramItem[], lifts: Map<string, LiftSummary>, byId: Record<string, Exercise>, profile: Profile | null): NextHint[] {
  const out: NextHint[] = [];
  for (const it of items) {
    const ex = byId[it.exerciseId];
    const h = it.block === "main" && ex ? liftHint(lifts.get(it.exerciseId), ex, profile) : null;
    if (h) out.push(h);
  }
  return out.sort((a, b) => Number(b.kind === "increase") - Number(a.kind === "increase"));
}
