// Круговой блок 5-10-15: варианты станций.
import type { Exercise } from "../data/types";

export type StationKind = "pull" | "push" | "legs";

export const STATION_OPTIONS: Record<StationKind, string[]> = {
  pull: ["pull_up", "chin_up", "inverted_row", "negative_pull_up", "band_pull_up"],
  push: ["push_up", "decline_push_up", "incline_push_up", "pike_push_up", "dips", "pseudo_planche_push_up"],
  legs: ["bodyweight_squat", "goblet_squat", "back_squat", "leg_extension", "walking_lunge", "kneeling_db_lunge", "bulgarian_split_squat"],
};

export const STATION_LABEL: Record<StationKind, string> = { pull: "Тяга", push: "Жим", legs: "Ноги" };

export function stationKind(ex: Exercise | undefined, index: number): StationKind {
  if (ex) {
    if (ex.pattern === "v_pull" || ex.pattern === "h_pull") return "pull";
    if (ex.pattern === "h_push" || ex.pattern === "v_push") return "push";
    if (["squat", "lunge", "knee_extension"].includes(ex.pattern)) return "legs";
  }
  return (["pull", "push", "legs"] as const)[index] ?? "legs";
}
