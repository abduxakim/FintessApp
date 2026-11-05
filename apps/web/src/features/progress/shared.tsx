import React from "react";
import type { Exercise, SetLog } from "../../data/types";
import type { ExerciseRecords, RecordKind } from "../../domain/history";
import { fmtKg, fmtShort } from "../../domain/format";

/** «60×8 · 60×7», «П10/Л10 × 20», «40 с». */
export function fmtSet(s: SetLog, ex: Exercise | undefined): string {
  if (ex?.tracking === "time") return `${s.durationSec ?? 0} с${s.weight ? ` · ${fmtKg(s.weight)} кг` : ""}`;
  const reps = s.repsL != null || s.repsR != null ? `П${s.repsR ?? 0}/Л${s.repsL ?? 0}` : `${s.reps ?? 0}`;
  return s.weight ? `${fmtKg(s.weight)}×${reps}` : reps;
}

export function fmtSets(sets: SetLog[], ex: Exercise | undefined): string {
  return sets.map((s) => fmtSet(s, ex)).join(" · ");
}

export const RECORD_LABEL: Record<RecordKind, string> = {
  e1rm: "Расчётный максимум",
  weight: "Макс. вес",
  reps: "Макс. повторов",
  duration: "Макс. время",
};

export function fmtRecord(kind: RecordKind, value: number): string {
  if (kind === "reps") return `${value}`;
  if (kind === "duration") return `${value} с`;
  return `${fmtKg(Math.round(value * 2) / 2)} кг`;
}

export function RecordsLine({ rec, tracking }: { rec: ExerciseRecords; tracking: Exercise["tracking"] }) {
  const kinds: RecordKind[] = tracking === "time" ? ["duration"] : tracking === "reps" ? ["reps", "weight"] : ["weight", "e1rm", "reps"];
  const items = kinds.map((k) => rec[k]).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="stats">
      {items.slice(0, 3).map((r) => (
        <div key={r!.kind} className="stat card tight">
          <span className="v">{fmtRecord(r!.kind, r!.value)}</span>
          <span className="k">
            {RECORD_LABEL[r!.kind]} · {fmtShort(r!.at)}
          </span>
        </div>
      ))}
    </div>
  );
}
