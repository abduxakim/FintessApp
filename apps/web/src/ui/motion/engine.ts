// Простой 2D-скелет для схем движения. Длины сегментов постоянны: позы задаются углами
// и целевыми точками для рук и ног (решаются двухзвенной обратной кинематикой).
// Углы — абсолютные, в градусах: 0 — вниз, 90 — вперёд (вправо), 180 — вверх.

export type Vec = [number, number];

export const L = { torso: 48, neck: 6, head: 9, upper: 27, fore: 25, thigh: 38, shin: 37, foot: 11, shoulderHalf: 15, hipHalf: 8 };
export const GROUND = 190;

export interface Pose {
  /** Корень — центр таза. Либо задан явно, либо вычисляется от опорной стопы. */
  hip?: Vec;
  /** Опорная стопа: таз вычисляется по углам ног (стоя, присед, выпад). */
  foot?: Vec;
  /** Углы бедра и голени. */
  leg?: [number, number];
  /** Вторая нога (для выпадов) — углы бедра и голени. */
  leg2?: [number, number];
  /** Цель стопы для ноги через ИК (если таз задан явно). */
  footTarget?: Vec;
  kneeBend?: 1 | -1;
  /** Наклон корпуса: 180 — вертикально вверх. */
  torso: number;
  /** Углы плеча и предплечья. */
  arm?: [number, number];
  /** Цель кисти через ИК. */
  hand?: Vec;
  elbowBend?: 1 | -1;
  /** Наклон головы относительно корпуса. */
  head?: number;
}

export interface Skeleton {
  view: "side" | "front";
  hip: Vec;
  shoulder: Vec;
  neck: Vec;
  headC: Vec;
  /** Для бокового вида — одна рука/нога (ближняя) и вторая нога; для фронтального — левая и правая. */
  arms: { shoulder: Vec; elbow: Vec; hand: Vec }[];
  legs: { hip: Vec; knee: Vec; ankle: Vec; toe: Vec }[];
}

const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (a: number, len: number): Vec => [Math.sin(rad(a)) * len, Math.cos(rad(a)) * len];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];

/** Двухзвенная ИК: сустав между base и target. bend выбирает, в какую сторону сгибается. */
export function ik(base: Vec, target: Vec, l1: number, l2: number, bend: 1 | -1): Vec {
  const dx = target[0] - base[0];
  const dy = target[1] - base[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const a = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const t = Math.atan2(dy, dx) + bend * a;
  return [base[0] + Math.cos(t) * l1, base[1] + Math.sin(t) * l1];
}

function legFrom(hip: Vec, p: Pose, angles: [number, number] | undefined, mirrorX?: (v: Vec) => Vec) {
  let knee: Vec;
  let ankle: Vec;
  if (p.footTarget && !angles) {
    const t = mirrorX ? mirrorX(p.footTarget) : p.footTarget;
    knee = ik(hip, t, L.thigh, L.shin, (p.kneeBend ?? -1) * (mirrorX ? -1 : 1) as 1 | -1);
    ankle = add(knee, scale(norm(sub(t, knee)), L.shin));
  } else {
    const [th, sh] = angles ?? [0, 0];
    const s = mirrorX ? -1 : 1;
    knee = add(hip, dir(th * s, L.thigh));
    ankle = add(knee, dir(sh * s, L.shin));
  }
  const toe = add(ankle, [mirrorX ? -L.foot * 0.2 : L.foot, 0]);
  return { hip, knee, ankle, toe };
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const scale = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k];

function armFrom(shoulder: Vec, p: Pose, mirrorX?: (v: Vec) => Vec) {
  let elbow: Vec;
  let hand: Vec;
  if (p.hand) {
    const t = mirrorX ? mirrorX(p.hand) : p.hand;
    elbow = ik(shoulder, t, L.upper, L.fore, ((p.elbowBend ?? 1) * (mirrorX ? -1 : 1)) as 1 | -1);
    hand = add(elbow, scale(norm(sub(t, elbow)), L.fore));
  } else {
    const [ua, fa] = p.arm ?? [0, 0];
    const s = mirrorX ? -1 : 1;
    elbow = add(shoulder, dir(ua * s, L.upper));
    hand = add(elbow, dir(fa * s, L.fore));
  }
  return { shoulder, elbow, hand };
}

export function solve(p: Pose, view: "side" | "front"): Skeleton {
  let hip: Vec;
  if (p.hip) hip = p.hip;
  else {
    const foot = p.foot ?? [100, GROUND];
    const [th, sh] = p.leg ?? [0, 0];
    hip = sub(sub(foot, dir(sh, L.shin)), dir(th, L.thigh));
  }
  const shoulder = add(hip, dir(p.torso, L.torso));
  const neck = add(shoulder, dir(p.torso + (p.head ?? 0), L.neck));
  const headC = add(neck, dir(p.torso + (p.head ?? 0), L.head));

  if (view === "side") {
    const legs = [legFrom(hip, p, p.leg ?? (p.footTarget ? undefined : [0, 0]))];
    if (p.leg2) legs.unshift(legFrom(hip, { ...p, footTarget: undefined }, p.leg2));
    return { view, hip, shoulder, neck, headC, arms: [armFrom(shoulder, p)], legs };
  }
  // Фронтальный вид: симметрично относительно центра таза.
  const cx = hip[0];
  const mirror = (v: Vec): Vec => [2 * cx - v[0], v[1]];
  const sL: Vec = [shoulder[0] - L.shoulderHalf, shoulder[1] + 3];
  const sR: Vec = [shoulder[0] + L.shoulderHalf, shoulder[1] + 3];
  const hL: Vec = [cx - L.hipHalf, hip[1]];
  const hR: Vec = [cx + L.hipHalf, hip[1]];
  const legL = legFrom(hL, p, p.footTarget ? undefined : p.leg ?? [0, 0]);
  const legR = legFrom(hR, p, p.footTarget ? undefined : p.leg ?? [0, 0], mirror);
  legL.toe = add(legL.ankle, [-4, 0]);
  legR.toe = add(legR.ankle, [4, 0]);
  return { view, hip, shoulder, neck, headC, arms: [armFrom(sL, p), armFrom(sR, p, mirror)], legs: [legL, legR] };
}

/** Интерполяция поз: углы и точки — линейно, с плавным ускорением. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const n = (x: number | undefined, y: number | undefined) => (x == null || y == null ? x ?? y : x + (y - x) * k);
  const v = (x: Vec | undefined, y: Vec | undefined): Vec | undefined => (x && y ? [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k] : x ?? y);
  const pair = (x: [number, number] | undefined, y: [number, number] | undefined): [number, number] | undefined => (x && y ? [n(x[0], y[0])!, n(x[1], y[1])!] : x ?? y);
  return {
    hip: v(a.hip, b.hip),
    foot: v(a.foot, b.foot),
    leg: pair(a.leg, b.leg),
    leg2: pair(a.leg2, b.leg2),
    footTarget: v(a.footTarget, b.footTarget),
    kneeBend: a.kneeBend,
    torso: n(a.torso, b.torso)!,
    arm: pair(a.arm, b.arm),
    hand: v(a.hand, b.hand),
    elbowBend: a.elbowBend,
    head: n(a.head ?? 0, b.head ?? 0),
  };
}
