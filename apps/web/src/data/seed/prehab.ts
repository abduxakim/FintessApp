// Профилактика и коррекция: подборки упражнений для проблемных зон.
// Общие ориентиры, не лечение. При боли, онемении или ухудшении — к врачу.
import type { ProblemZone } from "../types";

export interface PrehabStep {
  exerciseId: string;
  sets: number;
  reps?: [number, number];
  sec?: number;
}

export interface PrehabIssue {
  id: string;
  zone: ProblemZone["zone"];
  name: string;
  about: string;
  mobility: PrehabStep[];
  activation: PrehabStep[];
  strength: PrehabStep[];
  review?: "check";
}

export const PREHAB: PrehabIssue[] = [
  {
    id: "shoulder_click",
    zone: "shoulder",
    name: "Щелчки или дискомфорт в плече при жимах",
    about: "Подвижность грудного отдела, активация лопаток и укрепление ротаторной манжеты лёгким сопротивлением. Выполняй в разминке перед жимами и подтягиваниями, медленно и без боли.",
    mobility: [
      { exerciseId: "thoracic_open_book", sets: 1, reps: [6, 8] },
      { exerciseId: "shoulder_dislocates", sets: 1, reps: [10, 10] },
    ],
    activation: [
      { exerciseId: "band_pull_apart", sets: 2, reps: [15, 15] },
      { exerciseId: "wall_slide", sets: 2, reps: [10, 10] },
      { exerciseId: "scap_push_up", sets: 1, reps: [10, 10] },
    ],
    strength: [
      { exerciseId: "band_external_rotation", sets: 2, reps: [12, 15] },
      { exerciseId: "prone_ytw", sets: 1, reps: [8, 8] },
      { exerciseId: "face_pull", sets: 2, reps: [15, 15] },
    ],
  },
  {
    id: "upper_back_posture",
    zone: "neck",
    name: "Сутулость, скованность шеи и верха спины",
    about: "Раскрытие грудного отдела и укрепление мышц между лопатками. Полезно при сидячей работе.",
    mobility: [
      { exerciseId: "cat_cow", sets: 1, reps: [8, 8] },
      { exerciseId: "thoracic_open_book", sets: 1, reps: [8, 8] },
      { exerciseId: "doorway_pec_stretch", sets: 1, sec: 30 },
    ],
    activation: [
      { exerciseId: "wall_slide", sets: 2, reps: [10, 10] },
      { exerciseId: "band_pull_apart", sets: 2, reps: [15, 15] },
    ],
    strength: [{ exerciseId: "prone_ytw", sets: 2, reps: [8, 8] }],
  },
  {
    id: "lower_back_stiff",
    zone: "lower_back",
    name: "Скованность поясницы после тяг и приседаний",
    about: "Мягкая подвижность, работа кора и ягодиц, чтобы поясница не брала на себя лишнюю работу.",
    mobility: [
      { exerciseId: "cat_cow", sets: 1, reps: [8, 8] },
      { exerciseId: "hip_flexor_stretch", sets: 1, sec: 30 },
      { exerciseId: "child_pose", sets: 1, sec: 40 },
    ],
    activation: [
      { exerciseId: "glute_bridge", sets: 2, reps: [12, 15] },
      { exerciseId: "dead_bug", sets: 2, reps: [8, 10] },
    ],
    strength: [
      { exerciseId: "side_plank", sets: 2, sec: 25 },
      { exerciseId: "pallof_press", sets: 2, reps: [10, 12] },
    ],
  },
  {
    id: "knee_squat",
    zone: "knee",
    name: "Дискомфорт в колене при приседаниях и выпадах",
    about: "Подвижность передней поверхности бедра и таза, активация ягодиц. Глубину приседа держи в комфортной амплитуде.",
    review: "check",
    mobility: [
      { exerciseId: "quad_stretch", sets: 1, sec: 30 },
      { exerciseId: "hip_flexor_stretch", sets: 1, sec: 30 },
    ],
    activation: [{ exerciseId: "glute_bridge", sets: 2, reps: [12, 15] }],
    strength: [
      { exerciseId: "single_leg_calf_raise", sets: 2, reps: [12, 15] },
      { exerciseId: "leg_curl", sets: 2, reps: [12, 15] },
    ],
  },
  {
    id: "hip_tight",
    zone: "hip",
    name: "Скованность таза и бёдер",
    about: "Подвижность тазобедренных суставов и активация ягодиц перед днём ног.",
    mobility: [
      { exerciseId: "leg_swings", sets: 1, reps: [10, 10] },
      { exerciseId: "worlds_greatest_stretch", sets: 1, reps: [5, 5] },
      { exerciseId: "hip_flexor_stretch", sets: 1, sec: 30 },
    ],
    activation: [{ exerciseId: "glute_bridge", sets: 2, reps: [12, 15] }],
    strength: [{ exerciseId: "side_plank", sets: 2, sec: 25 }],
  },
  {
    id: "elbow_wrist",
    zone: "elbow",
    name: "Нагрузка на локти и запястья (подтягивания, жимы)",
    about: "Лёгкая работа на предплечья и хват — очень маленькие веса, медленно, без боли.",
    review: "check",
    mobility: [{ exerciseId: "dead_hang", sets: 2, sec: 20 }],
    activation: [
      { exerciseId: "wrist_curl", sets: 2, reps: [15, 20] },
      { exerciseId: "reverse_wrist_curl", sets: 2, reps: [15, 20] },
    ],
    strength: [{ exerciseId: "hammer_curl", sets: 2, reps: [12, 15] }],
  },
];

export const PREHAB_BY_ID: Record<string, PrehabIssue> = Object.assign(Object.create(null), Object.fromEntries(PREHAB.map((p) => [p.id, p])));

export function prehabSteps(i: PrehabIssue): PrehabStep[] {
  return [...i.mobility, ...i.activation, ...i.strength];
}
