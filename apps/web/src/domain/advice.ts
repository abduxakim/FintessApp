// Рекомендации на сегодня: собираются из разных модулей в один понятный список.
import type { Exercise, ProgramItem } from "../data/types";
import type { LiftSummary } from "./lifts";
import { fmtKg } from "./format";

export interface NextHint {
  exerciseId: string;
  text: string;
  kind: "increase" | "reps" | "hold" | "progress-bodyweight";
}

/** Что изменить в следующей тренировке: по упражнениям её плана и истории выполнения. */
export function nextWorkoutHints(items: ProgramItem[], lifts: LiftSummary[], byId: Record<string, Exercise>, cautionIds: Set<string>): NextHint[] {
  const out: NextHint[] = [];
  for (const it of items) {
    if (it.block !== "main") continue;
    const l = lifts.find((x) => x.exerciseId === it.exerciseId);
    const ex = byId[it.exerciseId];
    if (!l?.next || !ex) continue;
    const n = l.next;
    if (n.kind === "increase") {
      out.push({ exerciseId: it.exerciseId, kind: n.kind, text: cautionIds.has(it.exerciseId) ? `можно ${fmtKg(n.weight)} кг, если плечо не беспокоит` : `${fmtKg(n.weight)} кг (было ${fmtKg(l.last.weight)})` });
    } else if (n.kind === "progress-bodyweight") out.push({ exerciseId: it.exerciseId, kind: n.kind, text: "добавь вес или усложни вариант" });
    else if (n.kind === "hold") out.push({ exerciseId: it.exerciseId, kind: n.kind, text: `оставь ${fmtKg(n.weight)} кг, добирай повторы` });
  }
  return out.sort((a, b) => Number(b.kind === "increase") - Number(a.kind === "increase"));
}
