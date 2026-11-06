import React from "react";
import type { MuscleId } from "../data/types";
import { MUSCLES } from "../data/seed/labels";

// Упрощённая схема тела: спереди и сзади. Каждая мышца — область, которую можно подсветить или нажать.
// Фигуры заданы для левой половины и зеркалятся на правую.

type Shape = { m: MuscleId | null; d?: string; e?: [number, number, number, number, number?] };

const FRONT: Shape[] = [
  { m: null, e: [60, 18, 11, 13] },
  { m: null, d: "M55,30 L65,30 L66,38 L54,38 Z" },
  { m: "traps", d: "M54,37 L42,43 L56,43 Z" },
  { m: "side_delts", e: [33, 51, 5, 8.5] },
  { m: "front_delts", e: [40, 50, 5.5, 8] },
  { m: "chest", d: "M58.5,44 L44,44 Q38.5,50 42,59 Q48,66 58.5,64 Z" },
  { m: "serratus", d: "M42,62 L46.5,64.5 L46.5,76 L43,73 Z" },
  { m: "biceps", e: [34.5, 70, 5, 10] },
  { m: "forearms", e: [31, 96, 4.5, 14, 8] },
  { m: null, e: [28, 117, 3.8, 5.5] },
  { m: "abs", d: "M52,66 h6.5 v9 h-6.5 Z M52,77 h6.5 v9 h-6.5 Z M52,88 h6.5 v9 h-6.5 Z M52.5,99 h6 v7 h-6 Z" },
  { m: "obliques", d: "M50.5,66 L45.5,76 L46.5,98 L51,101 Z" },
  { m: "hip_flexors", d: "M51,104 L46.5,105 L53.5,115 Z" },
  { m: "quads", e: [48, 135, 7.5, 24, -3] },
  { m: "adductors", d: "M54.5,114 L58.5,116 L58,146 L55,148 Z" },
  { m: null, e: [49.5, 163, 4, 3.5] },
  { m: "calves", e: [48, 186, 5, 16, -2] },
  { m: null, e: [48.5, 207, 6, 3] },
];

const BACK: Shape[] = [
  { m: null, e: [60, 18, 11, 13] },
  { m: null, d: "M55,30 L65,30 L66,38 L54,38 Z" },
  { m: "traps", d: "M60,31 L45,43 L60,62 Z" },
  { m: "side_delts", e: [33, 51, 5, 8.5] },
  { m: "rear_delts", e: [40, 50, 5.5, 8] },
  { m: "rotator_cuff", e: [50.5, 52, 4.5, 3.5] },
  { m: "upper_back", d: "M58.5,62 L52,58 L51.5,72 L58.5,76 Z" },
  { m: "lats", d: "M46,58 Q41.5,76 50,96 L57.5,92 L57,80 L50.5,74 L50.5,60 Z" },
  { m: "lower_back", d: "M52,84 h6.5 v20 h-6.5 Z" },
  { m: "triceps", e: [34.5, 70, 5, 10] },
  { m: "forearms", e: [31, 96, 4.5, 14, 8] },
  { m: null, e: [28, 117, 3.8, 5.5] },
  { m: "glutes", e: [51, 116, 8.5, 10] },
  { m: "hamstrings", e: [49, 146, 7.5, 20, -2] },
  { m: null, e: [49.5, 168, 4, 3] },
  { m: "calves", e: [48, 186, 6.5, 15, -2] },
  { m: null, e: [48.5, 207, 6, 3] },
];

function ShapeEl({ s, fill, stroke, onClick, label }: { s: Shape; fill: string; stroke: string; onClick?: () => void; label?: string }) {
  const common = {
    fill,
    stroke,
    strokeWidth: 0.6,
    style: onClick ? { cursor: "pointer" } : undefined,
    onClick,
  };
  if (s.e) {
    const [cx, cy, rx, ry, rot] = s.e;
    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} {...common}>{label && <title>{label}</title>}</ellipse>;
  }
  return <path d={s.d} {...common}>{label && <title>{label}</title>}</path>;
}

export interface BodyMapProps {
  primary?: MuscleId[];
  secondary?: MuscleId[];
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  /** Показать подписи «Спереди / Сзади». */
  captions?: boolean;
}

function Figure({ shapes, title, props }: { shapes: Shape[]; title: string; props: BodyMapProps }) {
  const { primary = [], secondary = [], selected, onSelect } = props;
  const fillFor = (m: MuscleId | null) => {
    if (!m) return "var(--map-base)";
    if (selected === m || primary.includes(m)) return "var(--accent)";
    if (secondary.includes(m)) return "var(--map-secondary)";
    return "var(--map-muscle)";
  };
  const render = (mirror: boolean) =>
    shapes.map((s, i) => {
      // Центральные фигуры (голова, шея) рисуем один раз.
      const central = s.e ? s.e[0] === 60 : s.d?.startsWith("M55,30");
      if (mirror && central) return null;
      return (
        <ShapeEl
          key={(mirror ? "r" : "l") + i}
          s={s}
          fill={fillFor(s.m)}
          stroke={s.m && selected === s.m ? "var(--fg)" : "var(--bg)"}
          label={s.m ? MUSCLES[s.m].name : undefined}
          onClick={s.m && onSelect ? () => onSelect(s.m!) : undefined}
        />
      );
    });
  return (
    <figure className="body-fig">
      <svg viewBox="18 2 84 212" role="img" aria-label={title}>
        <g>{render(false)}</g>
        <g transform="translate(120,0) scale(-1,1)">{render(true)}</g>
      </svg>
      {props.captions !== false && <figcaption>{title}</figcaption>}
    </figure>
  );
}

export function BodyMap(props: BodyMapProps) {
  return (
    <div className="body-map">
      <Figure shapes={FRONT} title="Спереди" props={props} />
      <Figure shapes={BACK} title="Сзади" props={props} />
    </div>
  );
}

/** Все мышцы, которые есть на схеме (для подписи и доступного выбора списком). */
export const MAP_MUSCLES: MuscleId[] = [...new Set([...FRONT, ...BACK].map((s) => s.m).filter((m): m is MuscleId => !!m))];
