// Схемы движений: 2–3 ключевые позы на тип упражнения. Это упрощённая схема, а не эталон техники —
// для деталей в интерфейсе есть ссылка на видео.
import type { Pose, Vec } from "./engine";
import { GROUND } from "./engine";

export type Grip = "barbell" | "dumbbell" | "handle" | "none";
export type Prop =
  | { k: "rect"; x: number; y: number; w: number; h: number; rot?: number }
  | { k: "line"; a: Vec; b: Vec; w?: number };

export interface Motion {
  view: "side" | "front";
  frames: Pose[];
  ms: number;
  grip?: Grip;
  /** Гриф лежит на плечах (присед). */
  barOnBack?: boolean;
  /** Трос от точки крепления к кисти. */
  cable?: Vec;
  props?: Prop[];
  /** Носок стопы зафиксирован (подъёмы на носки). */
  toe?: Vec;
  /** Без линии пола (висы на турнике). */
  noFloor?: boolean;
  /** Какие части подсветить как рабочие. */
  hl: ("arms" | "legs" | "torso")[];
}

const G = GROUND;
const floorBench = (x: number, w: number, y = 150): Prop[] => [
  { k: "rect", x, y, w, h: 7 },
  { k: "line", a: [x + 8, y + 7], b: [x + 8, G], w: 3 },
  { k: "line", a: [x + w - 8, y + 7], b: [x + w - 8, G], w: 3 },
];

export const MOTIONS: Record<string, Motion> = {
  squat_bar: {
    view: "side", ms: 1500, barOnBack: true, hl: ["legs"],
    frames: [
      { foot: [95, G], leg: [0, 0], torso: 180, arm: [-35, 175] },
      { foot: [95, G], leg: [80, -28], torso: 140, arm: [-5, 150] },
    ],
  },
  squat_goblet: {
    view: "side", ms: 1500, grip: "dumbbell", hl: ["legs"],
    frames: [
      { foot: [95, G], leg: [0, 0], torso: 180, arm: [25, 170] },
      { foot: [95, G], leg: [82, -25], torso: 155, arm: [55, 175] },
    ],
  },
  squat_bw: {
    view: "side", ms: 1400, hl: ["legs"],
    frames: [
      { foot: [95, G], leg: [0, 0], torso: 180, arm: [10, 5] },
      { foot: [95, G], leg: [82, -25], torso: 150, arm: [95, 95] },
    ],
  },
  leg_press: {
    view: "side", ms: 1500, hl: ["legs"],
    props: [
      { k: "rect", x: 30, y: 150, w: 70, h: 8, rot: -20 },
      { k: "line", a: [160, 70], b: [190, 135], w: 6 },
    ],
    frames: [
      { hip: [70, 150], torso: 215, arm: [30, 60], footTarget: [133, 112], kneeBend: 1 },
      { hip: [70, 150], torso: 215, arm: [30, 60], footTarget: [167, 92], kneeBend: 1 },
    ],
  },
  hinge: {
    view: "side", ms: 1700, grip: "barbell", hl: ["legs", "torso"],
    frames: [
      { foot: [95, G], leg: [3, -2], torso: 180, arm: [2, 2] },
      { foot: [95, G], leg: [38, -8], torso: 108, arm: [-16, -16] },
    ],
  },
  deadlift: {
    view: "side", ms: 1800, grip: "barbell", hl: ["legs", "torso"],
    frames: [
      { foot: [95, G], leg: [65, -22], torso: 128, arm: [-8, -8] },
      { foot: [95, G], leg: [3, -2], torso: 180, arm: [2, 2] },
    ],
  },
  lunge: {
    view: "side", ms: 1600, hl: ["legs"],
    frames: [
      { foot: [125, G], leg: [22, -8], leg2: [-22, -28], torso: 180, arm: [5, 5] },
      { foot: [125, G], leg: [82, -8], leg2: [-8, -88], torso: 178, arm: [5, 5] },
    ],
  },
  bulgarian: {
    view: "side", ms: 1600, grip: "dumbbell", hl: ["legs"],
    props: floorBench(10, 50, 150),
    frames: [
      { foot: [120, G], leg: [18, -6], leg2: [-40, -84], torso: 178, arm: [3, 3] },
      { foot: [120, G], leg: [78, -10], leg2: [0, -135], torso: 170, arm: [3, 3] },
    ],
  },
  bench: {
    view: "side", ms: 1600, grip: "barbell", hl: ["arms", "torso"],
    props: floorBench(40, 100, 145),
    frames: [
      { hip: [80, 138], torso: 90, head: 0, footTarget: [52, G], kneeBend: 1, hand: [118, 124], elbowBend: -1 },
      { hip: [80, 138], torso: 90, head: 0, footTarget: [52, G], kneeBend: 1, hand: [124, 88], elbowBend: -1 },
    ],
  },
  bench_incline: {
    view: "side", ms: 1600, grip: "barbell", hl: ["arms", "torso"],
    props: [{ k: "rect", x: 52, y: 128, w: 82, h: 7, rot: -30 }, { k: "rect", x: 30, y: 148, w: 40, h: 7 }, { k: "line", a: [60, 155], b: [60, G], w: 3 }, { k: "line", a: [110, 120], b: [110, G], w: 3 }],
    frames: [
      { hip: [70, 140], torso: 122, footTarget: [40, G], kneeBend: 1, hand: [104, 98], elbowBend: -1 },
      { hip: [70, 140], torso: 122, footTarget: [40, G], kneeBend: 1, hand: [112, 56], elbowBend: -1 },
    ],
  },
  push_up: {
    view: "side", ms: 1400, hl: ["arms", "torso"],
    frames: [
      { foot: [40, G], leg: [-66, -66], torso: 114, hand: [152, G], elbowBend: -1 },
      { foot: [40, G], leg: [-79, -79], torso: 101, hand: [152, G], elbowBend: -1 },
    ],
  },
  dips: {
    view: "side", ms: 1500, hl: ["arms", "torso"],
    props: [{ k: "line", a: [80, 92], b: [150, 92], w: 5 }, { k: "line", a: [140, 92], b: [140, G], w: 4 }],
    frames: [
      { hip: [104, 88], torso: 172, leg: [10, -85], hand: [110, 92], elbowBend: -1 },
      { hip: [92, 114], torso: 160, leg: [10, -85], hand: [110, 92], elbowBend: -1 },
    ],
  },
  pull_up: {
    view: "front", ms: 1700, noFloor: true, hl: ["arms", "torso"],
    props: [{ k: "line", a: [30, 20], b: [170, 20], w: 5 }],
    frames: [
      { hip: [100, 122], torso: 180, hand: [70, 22], elbowBend: -1, leg: [0, 0] },
      { hip: [100, 92], torso: 180, hand: [70, 22], elbowBend: -1, leg: [0, 0] },
    ],
  },
  chin_up: {
    view: "front", ms: 1700, noFloor: true, hl: ["arms", "torso"],
    props: [{ k: "line", a: [30, 20], b: [170, 20], w: 5 }],
    frames: [
      { hip: [100, 122], torso: 180, hand: [86, 22], elbowBend: -1, leg: [0, 0] },
      { hip: [100, 92], torso: 180, hand: [86, 22], elbowBend: -1, leg: [0, 0] },
    ],
  },
  pulldown: {
    view: "front", ms: 1600, grip: "barbell", cable: [100, 0], hl: ["arms", "torso"],
    props: [{ k: "rect", x: 70, y: 150, w: 60, h: 8 }],
    frames: [
      { hip: [100, 148], torso: 180, hand: [60, 46], elbowBend: -1, footTarget: [80, G], kneeBend: 1 },
      { hip: [100, 148], torso: 180, hand: [68, 92], elbowBend: -1, footTarget: [80, G], kneeBend: 1 },
    ],
  },
  row_bent: {
    view: "side", ms: 1500, grip: "barbell", hl: ["arms", "torso"],
    frames: [
      { foot: [95, G], leg: [28, -8], torso: 118, arm: [-4, -4] },
      { foot: [95, G], leg: [28, -8], torso: 118, arm: [-58, 8] },
    ],
  },
  row_db: {
    view: "side", ms: 1500, grip: "dumbbell", hl: ["arms", "torso"],
    props: floorBench(70, 90, 140),
    frames: [
      { hip: [80, 112], torso: 95, leg: [0, 0], arm: [0, 0] },
      { hip: [80, 112], torso: 95, leg: [0, 0], arm: [-60, 5] },
    ],
  },
  row_seated: {
    view: "side", ms: 1500, grip: "handle", cable: [196, 150], hl: ["arms", "torso"],
    props: [{ k: "rect", x: 40, y: 160, w: 70, h: 8 }, { k: "line", a: [150, 140], b: [150, 182], w: 5 }],
    frames: [
      { hip: [72, 156], torso: 160, footTarget: [148, 160], kneeBend: -1, hand: [138, 130], elbowBend: 1 },
      { hip: [72, 156], torso: 178, footTarget: [148, 160], kneeBend: -1, hand: [92, 132], elbowBend: 1 },
    ],
  },
  inverted_row: {
    view: "side", ms: 1500, hl: ["arms", "torso"],
    props: [{ k: "line", a: [140, 110], b: [180, 110], w: 5 }, { k: "line", a: [170, 110], b: [170, G], w: 4 }],
    frames: [
      { foot: [30, G], leg: [-78, -78], torso: 102, hand: [150, 112], elbowBend: 1 },
      { foot: [30, G], leg: [-61, -61], torso: 119, hand: [150, 112], elbowBend: 1 },
    ],
  },
  ohp: {
    view: "front", ms: 1500, grip: "barbell", hl: ["arms"],
    frames: [
      { hip: [100, 115], torso: 180, leg: [0, 0], hand: [68, 66], elbowBend: -1 },
      { hip: [100, 115], torso: 180, leg: [0, 0], hand: [72, 16], elbowBend: -1 },
    ],
  },
  lateral: {
    view: "front", ms: 1500, grip: "dumbbell", hl: ["arms"],
    frames: [
      { hip: [100, 115], torso: 180, leg: [0, 0], arm: [-6, -4] },
      { hip: [100, 115], torso: 180, leg: [0, 0], arm: [-84, -88] },
    ],
  },
  fly: {
    view: "front", ms: 1500, grip: "handle", hl: ["arms", "torso"],
    frames: [
      { hip: [100, 115], torso: 180, leg: [0, 0], hand: [38, 78], elbowBend: 1 },
      { hip: [100, 115], torso: 180, leg: [0, 0], hand: [95, 90], elbowBend: 1 },
    ],
  },
  curl: {
    view: "side", ms: 1300, grip: "dumbbell", hl: ["arms"],
    frames: [
      { foot: [95, G], leg: [0, 0], torso: 180, arm: [3, 5] },
      { foot: [95, G], leg: [0, 0], torso: 180, arm: [8, 160] },
    ],
  },
  pushdown: {
    view: "side", ms: 1300, grip: "handle", cable: [130, 4], hl: ["arms"],
    frames: [
      { foot: [95, G], leg: [3, 0], torso: 172, arm: [6, 125] },
      { foot: [95, G], leg: [3, 0], torso: 172, arm: [6, 4] },
    ],
  },
  overhead_ext: {
    view: "side", ms: 1400, grip: "handle", hl: ["arms"],
    frames: [
      { foot: [95, G], leg: [0, 0], torso: 175, arm: [168, -25] },
      { foot: [95, G], leg: [0, 0], torso: 175, arm: [168, 172] },
    ],
  },
  skull_crusher: {
    view: "side", ms: 1400, grip: "barbell", hl: ["arms"],
    props: floorBench(40, 100, 145),
    frames: [
      { hip: [80, 138], torso: 90, footTarget: [52, G], kneeBend: 1, arm: [168, 105] },
      { hip: [80, 138], torso: 90, footTarget: [52, G], kneeBend: 1, arm: [168, 172] },
    ],
  },
  straight_arm: {
    view: "side", ms: 1500, grip: "handle", cable: [170, 4], hl: ["arms", "torso"],
    frames: [
      { foot: [90, G], leg: [8, -4], torso: 160, arm: [145, 145] },
      { foot: [90, G], leg: [8, -4], torso: 160, arm: [12, 12] },
    ],
  },
  face_pull: {
    view: "side", ms: 1400, grip: "handle", cable: [196, 54], hl: ["arms", "torso"],
    frames: [
      { foot: [90, G], leg: [0, 0], torso: 176, hand: [140, 58], elbowBend: -1 },
      { foot: [90, G], leg: [0, 0], torso: 176, hand: [104, 52], elbowBend: -1 },
    ],
  },
  calf: {
    view: "side", ms: 1100, toe: [108, G], hl: ["legs"],
    frames: [
      { foot: [97, G], leg: [0, 0], torso: 180, arm: [4, 4] },
      { foot: [99, G - 9], leg: [0, 0], torso: 180, arm: [4, 4] },
    ],
  },
  knee_raise: {
    view: "side", ms: 1500, noFloor: true, hl: ["legs", "torso"],
    props: [{ k: "line", a: [60, 18], b: [150, 18], w: 5 }],
    frames: [
      { hip: [100, 124], torso: 180, hand: [104, 20], elbowBend: 1, leg: [2, 0] },
      { hip: [100, 118], torso: 172, hand: [104, 20], elbowBend: 1, leg: [100, 8] },
    ],
  },
  crunch: {
    view: "side", ms: 1400, grip: "handle", cable: [150, 4], hl: ["torso"],
    frames: [
      { hip: [90, 152], torso: 170, leg: [0, -90], hand: [104, 98], elbowBend: -1 },
      { hip: [90, 152], torso: 112, leg: [0, -90], hand: [134, 142], elbowBend: -1 },
    ],
  },
  bridge: {
    view: "side", ms: 1400, hl: ["legs", "torso"],
    frames: [
      { hip: [100, 184], torso: -88, footTarget: [130, G], kneeBend: -1, arm: [90, 90] },
      { hip: [100, 156], torso: -57, footTarget: [130, G], kneeBend: -1, arm: [80, 90] },
    ],
  },
  hip_thrust: {
    view: "side", ms: 1400, grip: "barbell", hl: ["legs", "torso"],
    props: floorBench(10, 50, 150),
    frames: [
      { hip: [86, 172], torso: -118, footTarget: [128, G], kneeBend: -1, hand: [90, 166], elbowBend: 1 },
      { hip: [96, 150], torso: -92, footTarget: [128, G], kneeBend: -1, hand: [100, 143], elbowBend: 1 },
    ],
  },
  leg_ext: {
    view: "side", ms: 1300, hl: ["legs"],
    props: [{ k: "rect", x: 40, y: 140, w: 60, h: 8 }, { k: "line", a: [50, 148], b: [50, G], w: 4 }],
    frames: [
      { hip: [70, 136], torso: 182, arm: [10, 60], leg: [90, 5] },
      { hip: [70, 136], torso: 182, arm: [10, 60], leg: [90, 86] },
    ],
  },
  leg_curl: {
    view: "side", ms: 1300, hl: ["legs"],
    props: floorBench(30, 140, 150),
    frames: [
      { hip: [100, 142], torso: -90, arm: [-150, -150], leg: [90, 90] },
      { hip: [100, 142], torso: -90, arm: [-150, -150], leg: [90, 175] },
    ],
  },
  plank: {
    view: "side", ms: 2400, hl: ["torso"],
    frames: [
      { foot: [40, G], leg: [-76, -76], torso: 104, hand: [184, G - 1], elbowBend: 1 },
      { foot: [40, G], leg: [-75, -75], torso: 105, hand: [184, G - 1], elbowBend: 1 },
    ],
  },
};

/** Какую схему показывать для упражнения. Нет схемы — показываем только ссылку на видео. */
export const EXERCISE_MOTION: Record<string, keyof typeof MOTIONS> = {
  back_squat: "squat_bar",
  goblet_squat: "squat_goblet",
  bodyweight_squat: "squat_bw",
  box_pistol: "squat_bw",
  leg_press: "leg_press",
  romanian_deadlift: "hinge",
  db_romanian_deadlift: "hinge",
  back_extension: "hinge",
  deadlift: "deadlift",
  walking_lunge: "lunge",
  kneeling_db_lunge: "lunge",
  bulgarian_split_squat: "bulgarian",
  bench_press: "bench",
  db_bench_press: "bench",
  close_grip_bench: "bench",
  machine_chest_press: "bench",
  incline_bench_press: "bench_incline",
  incline_db_press: "bench_incline",
  push_up: "push_up",
  incline_push_up: "push_up",
  decline_push_up: "push_up",
  pseudo_planche_push_up: "push_up",
  dips: "dips",
  bench_dip: "dips",
  pull_up: "pull_up",
  negative_pull_up: "pull_up",
  band_pull_up: "pull_up",
  scap_pull_up: "pull_up",
  chin_up: "chin_up",
  lat_pulldown: "pulldown",
  barbell_row: "row_bent",
  t_bar_row: "row_bent",
  one_arm_db_row: "row_db",
  chest_supported_row: "row_db",
  seated_cable_row: "row_seated",
  single_arm_cable_row: "row_seated",
  inverted_row: "inverted_row",
  overhead_press: "ohp",
  db_shoulder_press: "ohp",
  lateral_raise: "lateral",
  cable_lateral_raise: "lateral",
  cable_fly: "fly",
  pec_deck: "fly",
  db_fly: "fly",
  barbell_curl: "curl",
  db_curl: "curl",
  hammer_curl: "curl",
  incline_db_curl: "curl",
  reverse_curl: "curl",
  triceps_pushdown: "pushdown",
  overhead_triceps_extension: "overhead_ext",
  skull_crusher: "skull_crusher",
  straight_arm_pulldown: "straight_arm",
  face_pull: "face_pull",
  calf_raise: "calf",
  single_leg_calf_raise: "calf",
  hanging_knee_raise: "knee_raise",
  hanging_leg_raise: "knee_raise",
  cable_crunch: "crunch",
  glute_bridge: "bridge",
  hip_thrust: "hip_thrust",
  leg_extension: "leg_ext",
  leg_curl: "leg_curl",
  plank: "plank",
};

/** Штанга, гантели или рукоять — по оборудованию упражнения. */
export function gripFor(motion: Motion, equipment: string[]): Grip {
  if (motion.grip === "handle" || motion.grip === "none") return motion.grip;
  if (equipment.includes("barbell") || equipment.includes("ez_bar")) return "barbell";
  if (equipment.includes("dumbbell") || equipment.includes("kettlebell")) return "dumbbell";
  if (equipment.includes("cable") || equipment.includes("machine")) return "handle";
  return motion.grip ? "none" : "none";
}
