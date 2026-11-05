import React, { useEffect, useRef, useState } from "react";
import { GROUND, lerpPose, solve, type Skeleton, type Vec } from "./engine";
import { gripFor, type Motion } from "./motions";
import { Icon } from "../icons";

const line = (a: Vec, b: Vec, cls: string, w: number) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={cls} strokeWidth={w} />;

function Figure({ sk, m, equipment }: { sk: Skeleton; m: Motion; equipment: string[] }) {
  const hl = (part: "arms" | "legs" | "torso") => (m.hl.includes(part) ? "mv-hl" : "mv-body");
  const grip = gripFor(m, equipment);
  const hands = sk.arms.map((a) => a.hand);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Дальняя нога (выпад) — темнее */}
      {sk.view === "side" &&
        sk.legs.length > 1 &&
        (() => {
          const l = sk.legs[0];
          return (
            <g opacity={0.55}>
              {line(l.hip, l.knee, hl("legs"), 8)}
              {line(l.knee, l.ankle, hl("legs"), 7)}
              {line(l.ankle, l.toe, "mv-body", 5)}
            </g>
          );
        })()}
      {(sk.view === "side" ? sk.legs.slice(-1) : sk.legs).map((l, i) => (
        <g key={"l" + i}>
          {sk.view === "front" && line([sk.hip[0], sk.hip[1]], l.hip, "mv-body", 7)}
          {line(l.hip, l.knee, hl("legs"), 8)}
          {line(l.knee, l.ankle, hl("legs"), 7)}
          {line(l.ankle, m.toe ?? l.toe, "mv-body", 5)}
        </g>
      ))}
      {line(sk.hip, sk.shoulder, hl("torso"), 11)}
      {sk.view === "front" && line([sk.shoulder[0] - 15, sk.shoulder[1] + 3], [sk.shoulder[0] + 15, sk.shoulder[1] + 3], hl("torso"), 8)}
      {line(sk.shoulder, sk.neck, "mv-body", 6)}
      <circle cx={sk.headC[0]} cy={sk.headC[1]} r={8.5} className="mv-head" />
      {m.barOnBack && <circle cx={sk.shoulder[0] - 3} cy={sk.shoulder[1] - 2} r={10} className="mv-plate" />}
      {m.cable && hands.map((h, i) => <line key={"c" + i} x1={m.cable![0]} y1={m.cable![1]} x2={h[0]} y2={h[1]} className="mv-cable" />)}
      {sk.arms.map((a, i) => (
        <g key={"a" + i}>
          {line(a.shoulder, a.elbow, hl("arms"), 7)}
          {line(a.elbow, a.hand, hl("arms"), 6)}
        </g>
      ))}
      {grip === "barbell" &&
        (sk.view === "side" ? (
          <circle cx={hands[0][0]} cy={hands[0][1]} r={10} className="mv-plate" />
        ) : (
          <>
            {line([hands[0][0] - 22, hands[0][1]], [hands[1][0] + 22, hands[1][1]], "mv-bar", 3)}
            <rect x={hands[0][0] - 28} y={hands[0][1] - 10} width={6} height={20} rx={2} className="mv-plate" />
            <rect x={hands[1][0] + 22} y={hands[1][1] - 10} width={6} height={20} rx={2} className="mv-plate" />
          </>
        ))}
      {grip === "dumbbell" && hands.map((h, i) => <rect key={"d" + i} x={h[0] - 7} y={h[1] - 4} width={14} height={8} rx={3} className="mv-plate" />)}
      {grip === "handle" && hands.map((h, i) => <circle key={"h" + i} cx={h[0]} cy={h[1]} r={3.5} className="mv-plate" />)}
    </g>
  );
}

/** Анимированная схема движения. Останавливается, когда не видна, и при «уменьшении движения». */
export function MotionView({ motion, equipment, label }: { motion: Motion; equipment: string[]; label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [t, setT] = useState(0.5);
  const [playing, setPlaying] = useState(true);
  const visible = useRef(true);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || reduce) return;
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (visible.current && document.visibilityState === "visible") {
        phase = (phase + dt / (motion.ms * 2)) % 1;
        // Туда-обратно с короткими паузами в крайних точках.
        const p = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        setT(Math.min(1, Math.max(0, (p - 0.08) / 0.84)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, motion, reduce]);

  const frames = motion.frames;
  const seg = Math.min(frames.length - 2, Math.floor(t * (frames.length - 1)));
  const local = t * (frames.length - 1) - seg;
  const pose = lerpPose(frames[seg], frames[seg + 1], local);
  const sk = solve(pose, motion.view);

  return (
    <div className="motion">
      <svg ref={ref} viewBox="0 0 200 200" role="img" aria-label={`Схема движения: ${label}`}>
        {!motion.noFloor && <line x1={0} y1={GROUND + 1} x2={200} y2={GROUND + 1} className="mv-floor" />}
        {motion.props?.map((p, i) =>
          p.k === "rect" ? (
            <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={2} className="mv-prop" transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined} />
          ) : (
            <line key={i} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} strokeWidth={p.w ?? 3} className="mv-prop-line" />
          ),
        )}
        <Figure sk={sk} m={motion} equipment={equipment} />
      </svg>
      {!reduce && (
        <button className="icon-btn motion-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? "Пауза" : "Воспроизвести"}>
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
      )}
    </div>
  );
}

