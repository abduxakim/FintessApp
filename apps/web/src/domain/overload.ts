// Прогрессивная перегрузка по схеме «двойной прогрессии»:
// сначала растут повторы в диапазоне, когда все подходы на верхней границе — растёт вес.
import type { Exercise, SetLog } from "../data/types";
import { setReps } from "./strength";
import { fmtKg } from "./format";

export interface OverloadHint {
  kind: "increase" | "reps" | "hold" | "progress-bodyweight";
  weight: number | null;
  text: string;
}

export function overloadHint(ex: Exercise, lastSets: SetLog[] | null, repsMin: number | null, repsMax: number | null): OverloadHint | null {
  if (!lastSets?.length || !repsMax || ex.tracking === "time" || ex.tracking === "rounds") return null;
  const work = lastSets.filter((s) => s.done && s.type === "work");
  if (!work.length) return null;
  const reps = work.map((s) => setReps(s) ?? 0);
  const allTop = reps.every((r) => r >= repsMax);
  const weights = work.map((s) => s.weight ?? 0);
  const topWeight = Math.max(...weights);

  if (ex.tracking === "reps" && !topWeight) {
    return allTop ? { kind: "progress-bodyweight", weight: null, text: `Прошлый раз все подходы ${repsMax}+ — добавь вес на поясе или переходи к более сложному варианту.` } : null;
  }
  if (!topWeight) return null;
  if (allTop) {
    const step = ex.loadStep ?? 2.5;
    const next = Math.round((topWeight + step) * 100) / 100;
    return { kind: "increase", weight: next, text: `Прошлый раз все подходы на ${repsMax}+ — пора прибавить: ${fmtKg(next)} кг на ${repsMin ?? repsMax}+ повторов.` };
  }
  if (repsMin && reps.filter((r) => r < repsMin).length >= Math.ceil(work.length / 2)) {
    return { kind: "hold", weight: topWeight, text: `Прошлый раз большинство подходов меньше ${repsMin} — оставь вес ${fmtKg(topWeight)} кг и добирай повторы.` };
  }
  return { kind: "reps", weight: topWeight, text: `Тот же вес ${fmtKg(topWeight)} кг — постарайся добавить по повтору.` };
}
