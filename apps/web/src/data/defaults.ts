import type { CircuitSettings, Profile, UserMeta } from "./types";
import { EQUIPMENT_PRESETS } from "./seed/labels";

export const SCHEMA_VERSION = 1;

export function defaultCircuit(): CircuitSettings {
  return {
    enabled: false,
    position: "start",
    stations: [
      { exerciseId: "pull_up", reps: 5, weight: null },
      { exerciseId: "push_up", reps: 10, weight: null },
      { exerciseId: "bodyweight_squat", reps: 15, weight: null },
    ],
    targetRounds: null,
    timeCapMin: null,
    configured: false,
  };
}

export function defaultProfile(): Profile {
  return {
    heightCm: null,
    weightKg: null,
    sex: null,
    birthYear: null,
    level: "intermediate",
    goal: "definition",
    focusMuscles: [],
    focusExercises: [],
    locations: ["gym"],
    equipment: { gym: [...EQUIPMENT_PRESETS.gym], home: [...EQUIPMENT_PRESETS.home], outdoor: [...EQUIPMENT_PRESETS.outdoor] },
    daysPerWeek: 2,
    sessionMin: 90,
    preferredTime: "any",
    weakSide: null,
    problemZones: [],
    baselines: {},
    circuit: defaultCircuit(),
  };
}

export function defaultMeta(now = Date.now()): UserMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarded: false,
    profile: defaultProfile(),
    goalHistory: [],
    enrollment: null,
    createdAt: now,
    // 0 — профиль ещё не редактировался: любая облачная версия новее.
    updatedAt: 0,
    rev: 0,
    deletedAt: null,
  };
}

/** Дополняет запись из старой версии недостающими полями. */
export function normalizeMeta(m: UserMeta): UserMeta {
  const base = defaultMeta(m.createdAt ?? Date.now());
  return {
    ...base,
    ...m,
    profile: {
      ...base.profile,
      ...m.profile,
      equipment: { ...base.profile.equipment, ...m.profile?.equipment },
      baselines: { ...m.profile?.baselines },
      circuit: { ...base.profile.circuit, ...m.profile?.circuit },
    },
  };
}
