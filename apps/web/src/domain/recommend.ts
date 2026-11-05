import type { Exercise, Program, Profile } from "../data/types";
import { GOALS, LEVELS, LOCATIONS, MUSCLES } from "../data/seed/labels";
import { alternatives, isAvailable } from "./availability";

export interface Recommendation {
  program: Program;
  score: number;
  reasons: string[];
  warnings: string[];
}

/** Доля основных упражнений, которые можно сделать (или заменить аналогом) с доступным оборудованием. */
export function equipmentCoverage(program: Program, profile: Profile, exerciseById: Record<string, Exercise>, all: Exercise[]): number {
  const location = profile.locations[0] ?? "gym";
  const items = program.days.flatMap((d) => d.items.filter((i) => i.block === "main"));
  if (!items.length) return 1;
  let ok = 0;
  for (const it of items) {
    const ex = exerciseById[it.exerciseId];
    if (!ex) continue;
    if (isAvailable(ex, profile, location) || alternatives(ex, all, profile, location).length) ok++;
  }
  return ok / items.length;
}

/** Ранжирование программ по профилю. Правила простые и объяснимые — каждое даёт причину. */
export function recommendPrograms(profile: Profile, programs: Program[], exerciseById: Record<string, Exercise>, all: Exercise[]): Recommendation[] {
  const primary = profile.locations[0] ?? "gym";
  const result: Recommendation[] = [];
  for (const program of programs.filter((p) => p.kind === "program" && !p.deletedAt)) {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (program.locations.includes(primary)) {
      score += 4;
      reasons.push(`Подходит для места «${LOCATIONS[primary]}»`);
    } else if (program.locations.some((l) => profile.locations.includes(l))) {
      score += 1;
    } else {
      score -= 6;
      warnings.push(`Рассчитана на: ${program.locations.map((l) => LOCATIONS[l]).join(", ")}`);
    }

    if (program.goals.includes(profile.goal)) {
      score += 3;
      reasons.push(`Цель «${GOALS[profile.goal].name}»`);
    }

    const dayDiff = Math.abs(program.days.length - Math.max(1, profile.daysPerWeek));
    if (profile.daysPerWeek <= 2 && program.days.length <= 3) {
      score += 2;
      reasons.push("Тренировки идут по очереди — пропуски не ломают план");
    } else if (dayDiff === 0) {
      score += 2;
      reasons.push(`${program.days.length} тренировки в цикле — как твой график`);
    } else if (dayDiff >= 2) {
      score -= 1;
      warnings.push(`В цикле ${program.days.length} тренировки, а у тебя ${profile.daysPerWeek} в неделю`);
    }

    if (program.levels.includes(profile.level)) score += 1;
    else warnings.push(`Уровень программы: ${program.levels.map((l) => LEVELS[l]).join(", ")}`);

    const focusHits = profile.focusMuscles.filter((m) => program.emphasis.includes(m));
    if (focusHits.length) {
      score += focusHits.length * 1.5;
      reasons.push(`Акцент: ${focusHits.map((m) => MUSCLES[m].name.toLowerCase()).join(", ")}`);
    }

    if (program.minutes > profile.sessionMin + 15) {
      score -= 1;
      warnings.push(`Тренировка около ${program.minutes} мин`);
    }

    const coverage = equipmentCoverage(program, profile, exerciseById, all);
    if (coverage < 0.7) {
      score -= 4;
      warnings.push("Не хватает оборудования для части упражнений");
    }

    result.push({ program, score, reasons, warnings });
  }
  return result.sort((a, b) => b.score - a.score);
}
