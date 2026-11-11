import React, { useMemo, useState } from "react";

// Линейный график без библиотек: одна ось Y, тонкие линии, подпись значения на конце,
// касание/наведение показывает значения всех линий в этой точке.

export interface Series {
  name: string;
  /** CSS-цвет линии (токен). */
  color: string;
  points: { x: number; y: number }[];
}

const W = 320;
const H = 168;
const PAD = { l: 34, r: 46, t: 12, b: 22 };

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fmtDate = (ms: number) => dateFmt.format(ms).replace(".", "");

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function LineChart({ series, unit, label, fmt = (v) => String(v).replace(".", ",") }: { series: Series[]; unit: string; label: string; fmt?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  const xs = useMemo(() => [...new Set(all.map((p) => p.x))].sort((a, b) => a - b), [all]);
  if (all.length < 2) return <p className="small muted">Для графика нужно хотя бы два значения.</p>;
  const ys = all.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const x0 = xs[0];
  const x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(sx(v) - x) < Math.abs(sx(xs[best]) - x)) best = i;
    });
    setHover(best);
  };
  const hx = hover != null ? xs[hover] : null;

  return (
    <figure className="chart" aria-label={label}>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="chart-grid" />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" className="chart-axis">
              {fmt(t)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} className="chart-axis">
          {fmtDate(x0)}
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className="chart-axis">
          {fmtDate(xs[xs.length - 1])}
        </text>
        {hx != null && <line x1={sx(hx)} x2={sx(hx)} y1={PAD.t} y2={H - PAD.b} className="chart-cross" />}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const last = pts[pts.length - 1];
          return (
            <g key={s.name}>
              <polyline points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.length <= 20 && pts.slice(0, -1).map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />)}
              <circle cx={sx(last.x)} cy={sy(last.y)} r={4.5} fill={s.color} className="chart-ring" />
              <text x={sx(last.x) + 8} y={sy(last.y) + 4} className="chart-value">
                {fmt(last.y)}
              </text>
              {hx != null &&
                (() => {
                  const p = pts.find((q) => q.x === hx);
                  return p ? <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill={s.color} className="chart-ring" /> : null;
                })()}
            </g>
          );
        })}
      </svg>
      <figcaption className="chart-tip" aria-live="polite">
        {hx != null ? (
          <>
            <b>{fmtDate(hx)}</b>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hx);
              return p ? (
                <span key={s.name}>
                  {series.length > 1 ? `${s.name}: ` : ""}
                  {fmt(p.y)} {unit}
                </span>
              ) : null;
            })}
          </>
        ) : (
          <span className="muted">Коснись графика, чтобы увидеть значения</span>
        )}
      </figcaption>
    </figure>
  );
}
