// Личные правки программы поверх шаблона и подбор подходящего дня для упражнения.
import type { Exercise, MuscleId, Program, ProgramDay, ProgramItem, ProgramTweaks } from "../data/types";
import { MUSCLES } from "../data/seed/labels";

const clamp = (v: unknown, min: number, max: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined);

/** День программы с учётом правок. Данные правок проверяются: они приходят из облака. */
export function effectiveDay(day: ProgramDay, t: ProgramTweaks | undefined): ProgramDay {
  if (!t) return day;
  const ov = t.overrides && typeof t.overrides === "object" ? t.overrides : {};
  const apply = (it: ProgramItem): ProgramItem => {
    const o = Object.prototype.hasOwnProperty.call(ov, it.id) ? ov[it.id] : undefined;
    if (!o) return it;
    const repsMin = clamp(o.repsMin, 1, 60) ?? it.repsMin;
    const repsMax = clamp(o.repsMax, 1, 60) ?? it.repsMax;
    return {
      ...it,
      sets: clamp(o.sets, 1, 10) ?? it.sets,
      repsMin: repsMin != null && repsMax != null ? Math.min(repsMin, repsMax) : repsMin,
      repsMax: repsMin != null && repsMax != null ? Math.max(repsMin, repsMax) : repsMax,
      restSec: clamp(o.restSec, 0, 600) ?? it.restSec,
      durationSec: clamp(o.durationSec, 5, 900) ?? it.durationSec,
    };
  };
  const extrasRaw = t.extras && Object.prototype.hasOwnProperty.call(t.extras, day.id) ? t.extras[day.id] : [];
  const extras = (Array.isArray(extrasRaw) ? extrasRaw : [])
    .filter((x) => x && typeof x.id === "string" && typeof x.exerciseId === "string" && !day.items.some((i) => i.exerciseId === x.exerciseId))
    .slice(0, 12)
    .map((x) => apply({ ...x, block: "main" as const, sets: clamp(x.sets, 1, 10) ?? 3, restSec: clamp(x.restSec, 0, 600) ?? 90 }));
  const items = day.items.map(apply);
  const cd = items.findIndex((i) => i.block === "cooldown");
  items.splice(cd < 0 ? items.length : cd, 0, ...extras);
  return { ...day, items };
}

export function isExtra(t: ProgramTweaks | undefined, dayId: string, itemId: string): boolean {
  return !!t?.extras?.[dayId]?.some((x) => x.id === itemId);
}

/** День программы, который лучше всего подходит упражнению. Главная мышца упражнения весит больше остальных. */
export function bestDayFor(program: Program, ex: Exercise, byId: Record<string, Exercise>): number {
  const main = ex.primary[0];
  const mainGroup = main ? MUSCLES[main].group : null;
  const otherGroups = new Set(ex.primary.slice(1).map((m) => MUSCLES[m].group).filter((g) => g !== mainGroup));
  let best = 0;
  let bestScore = -Infinity;
  program.days.forEach((d, i) => {
    let score = 0;
    for (const it of d.items) {
      if (it.block !== "main") continue;
      const e = byId[it.exerciseId];
      if (!e) continue;
      if (e.id === ex.id) score -= 100; // уже есть в этом дне
      if (main && e.primary.includes(main)) score += 3;
      if (main && e.secondary.includes(main)) score += 1;
      score += e.primary.filter((m: MuscleId) => m !== main && ex.primary.includes(m)).length;
    }
    // Название дня с группой («Спина + бицепс») — сильный признак для главной мышцы.
    const name = d.name.toLowerCase();
    if (mainGroup && name.includes(mainGroup.toLowerCase().slice(0, 4))) score += 6;
    for (const g of otherGroups) if (name.includes(g.toLowerCase().slice(0, 4))) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
