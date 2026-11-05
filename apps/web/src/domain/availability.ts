import type { EquipmentId, Exercise, Location, Pattern, Profile, ProblemZone } from "../data/types";

/** Коврик есть у всех (пол), поэтому не ограничивает выбор. */
const ALWAYS: EquipmentId[] = ["mat"];

export function equipmentAt(profile: Profile, location: Location): Set<EquipmentId> {
  return new Set([...(profile.equipment[location] ?? []), ...ALWAYS]);
}

export function isAvailable(ex: Exercise, profile: Profile, location: Location): boolean {
  const eq = equipmentAt(profile, location);
  return ex.equipment.every((e) => eq.has(e));
}

/** Аналоги для замены: тот же двигательный паттерн, доступны в этом месте, ближе по мышцам и сложности. */
export function alternatives(ex: Exercise, all: Exercise[], profile: Profile | null, location: Location | null): Exercise[] {
  return all
    .filter((o) => o.id !== ex.id && o.pattern === ex.pattern)
    .filter((o) => !profile || !location || isAvailable(o, profile, location))
    .map((o) => {
      const shared = o.primary.filter((m) => ex.primary.includes(m)).length;
      return { o, score: shared * 3 - Math.abs(o.difficulty - ex.difficulty) + (o.category === ex.category ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.o.name.localeCompare(b.o.name, "ru"))
    .map((x) => x.o);
}

const ZONE_PATTERNS: Record<ProblemZone["zone"], Pattern[]> = {
  shoulder: ["h_push", "v_push", "chest_fly", "v_pull", "muscle_up", "handstand", "pullover"],
  knee: ["squat", "lunge", "knee_extension"],
  lower_back: ["hinge", "squat", "h_pull"],
  elbow: ["triceps", "biceps", "v_pull", "muscle_up"],
  wrist: ["h_push", "handstand", "v_push"],
  neck: ["v_push", "carry"],
  hip: ["squat", "lunge", "hinge"],
};

/** Мягкое напоминание для упражнений, затрагивающих проблемную зону. Не медицинская рекомендация. */
export function zoneCaution(ex: Exercise, profile: Profile | null): ProblemZone | null {
  if (!profile) return null;
  if (ex.category !== "strength" && ex.category !== "calisthenics") return null;
  return profile.problemZones.find((z) => ZONE_PATTERNS[z.zone]?.includes(ex.pattern)) ?? null;
}
