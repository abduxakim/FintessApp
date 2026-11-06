// Баланс нагрузки по группам мышц за последние дни. Учитывает ВСЕ выполненные подходы,
// включая упражнения, добавленные во время тренировки вне плана.
import type { Exercise, MuscleId, Profile, WorkoutSession } from "../data/types";
import { MUSCLES } from "../data/seed/labels";

export type Group = (typeof MUSCLES)[MuscleId]["group"];
export const GROUPS: Group[] = ["Грудь", "Спина", "Плечи", "Руки", "Ноги", "Кор"];

export interface GroupLoad {
  group: Group;
  sets: number;
  target: number;
  focus: boolean;
}

/** Ориентир подходов в неделю: для зон в фокусе больше. Это не норма, а подсказка для баланса. */
function weeklyTarget(focus: boolean, daysPerWeek: number): number {
  const base = daysPerWeek <= 2 ? 6 : 9;
  return focus ? base + 4 : base;
}

export function groupLoad(sessions: WorkoutSession[], exerciseById: Record<string, Exercise>, profile: Profile | null, now = Date.now(), days = 7): GroupLoad[] {
  const since = now - days * 86400000;
  const sets = new Map<Group, number>();
  for (const s of sessions) {
    if (s.deletedAt || s.status === "abandoned" || s.startedAt < since) continue;
    for (const e of s.exercises) {
      const ex = exerciseById[e.exerciseId];
      if (!ex) continue;
      const n = e.circuit ? 0 : e.sets.filter((x) => x.done && x.type === "work").length;
      if (!n) continue;
      // Основная группа — полный подход, вспомогательная — половина.
      const prim = new Set(ex.primary.map((m) => MUSCLES[m].group));
      const sec = new Set(ex.secondary.map((m) => MUSCLES[m].group).filter((g) => !prim.has(g)));
      for (const g of prim) sets.set(g, (sets.get(g) ?? 0) + n);
      for (const g of sec) sets.set(g, (sets.get(g) ?? 0) + n * 0.5);
    }
  }
  const focusGroups = new Set((profile?.focusMuscles ?? []).map((m) => MUSCLES[m].group));
  const dpw = profile?.daysPerWeek ?? 2;
  return GROUPS.map((g) => ({ group: g, sets: Math.round((sets.get(g) ?? 0) * 2) / 2, target: weeklyTarget(focusGroups.has(g), dpw), focus: focusGroups.has(g) }));
}

/** Группы, недобравшие меньше половины ориентира. Сначала зоны в фокусе. */
export function underloaded(load: GroupLoad[]): GroupLoad[] {
  return load.filter((l) => l.sets < l.target / 2).sort((a, b) => Number(b.focus) - Number(a.focus) || a.sets / a.target - b.sets / b.target);
}

/** Лучшее упражнение, чтобы добрать группу: доступное, базовое, ещё не в тренировке. */
export function exerciseForGroup(group: Group, all: Exercise[], available: (e: Exercise) => boolean, exclude: string[]): Exercise | null {
  return (
    all
      .filter((e) => (e.category === "strength" || e.category === "calisthenics") && e.tracking !== "rounds")
      .filter((e) => e.primary.some((m) => MUSCLES[m].group === group) && available(e) && !exclude.includes(e.id))
      .sort((a, b) => Number(b.mechanics === "compound") - Number(a.mechanics === "compound") || a.difficulty - b.difficulty)[0] ?? null
  );
}
