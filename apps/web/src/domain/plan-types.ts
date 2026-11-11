import type { ItemBlock } from "../data/types";

export interface PlanItem {
  exerciseId: string;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSec: number | null;
  restSec: number;
  note: string;
  block: ItemBlock;
}

export interface Plan {
  title: string;
  rationale: string;
  items: PlanItem[];
  source: "claude" | "local";
}

