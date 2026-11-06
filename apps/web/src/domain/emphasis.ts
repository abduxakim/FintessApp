// Упор тренировки: какие мышцы и группы получают больше всего подходов.
// Основная мышца упражнения — полный подход, вспомогательная — половина.
import type { Exercise, MuscleId } from "../data/types";
import { MUSCLES } from "../data/seed/labels";
import type { Group } from "./balance";

export interface Emphasis {
  groups: { group: Group; sets: number }[];
  muscles: { muscle: MuscleId; sets: number }[];
  /** Мышцы с основным упором (для схемы) и второстепенные. */
  main: MuscleId[];
  minor: MuscleId[];
}

export function emphasisOf(items: { exerciseId: string; sets: number; block?: string }[], byId: Record<string, Exercise>): Emphasis {
  const m = new Map<MuscleId, number>();
  const g = new Map<Group, number>();
  for (const it of items) {
    if (it.block && it.block !== "main") continue;
    const ex = byId[it.exerciseId];
    if (!ex || ex.tracking === "rounds") continue;
    for (const p of ex.primary) m.set(p, (m.get(p) ?? 0) + it.sets);
    for (const s of ex.secondary) m.set(s, (m.get(s) ?? 0) + it.sets * 0.5);
    const prim = new Set(ex.primary.map((x) => MUSCLES[x].group));
    for (const grp of prim) g.set(grp, (g.get(grp) ?? 0) + it.sets);
  }
  const muscles = [...m.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
  const groups = [...g.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);
  const top = muscles[0]?.sets ?? 0;
  // Основной упор — мышцы, получившие хотя бы 45% подходов лидера.
  const main = muscles.filter((x) => x.sets >= top * 0.45).map((x) => x.muscle);
  const minor = muscles.filter((x) => !main.includes(x.muscle)).map((x) => x.muscle);
  return { groups, muscles, main, minor };
}

/** Короткая строка: «грудь, спина, ноги». */
export function emphasisLine(e: Emphasis, n = 3): string {
  return e.groups
    .slice(0, n)
    .map((x) => x.group.toLowerCase())
    .join(", ");
}
