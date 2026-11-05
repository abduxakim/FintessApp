// Модель данных приложения.
// Логическая модель описана в docs/data-model.md. Физически пользовательские данные хранятся
// агрегатами: meta (профиль, активная программа, настройки), session (тренировка вместе
// с упражнениями и подходами), program (своя программа). Один агрегат — одна запись в IndexedDB
// и один документ в облачном хранилище.

export type ID = string;
export type ISODate = string; // ISO-строка в UTC
export type Millis = number;

export type Location = "gym" | "home" | "outdoor";
export type Goal = "strength" | "hypertrophy" | "definition" | "endurance";
export type Level = "beginner" | "intermediate" | "advanced";
export type Side = "left" | "right";

export type Category = "strength" | "calisthenics" | "warmup" | "mobility" | "stretch" | "prehab" | "cardio";
/** rounds — круговой блок: каждый «подход» = один пройденный круг. */
export type Tracking = "weight_reps" | "reps" | "time" | "rounds";

export type MuscleId =
  | "chest"
  | "lats"
  | "upper_back"
  | "lower_back"
  | "traps"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "rotator_cuff"
  | "serratus"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "calves"
  | "hip_flexors";

export type EquipmentId =
  | "barbell"
  | "ez_bar"
  | "dumbbell"
  | "kettlebell"
  | "cable"
  | "machine"
  | "bench"
  | "rack"
  | "pullup_bar"
  | "dip_bars"
  | "band"
  | "rings"
  | "mat"
  | "cardio_machine";

export type Pattern =
  | "h_push"
  | "v_push"
  | "h_pull"
  | "v_pull"
  | "chest_fly"
  | "pullover"
  | "lateral_raise"
  | "rear_delt"
  | "biceps"
  | "triceps"
  | "squat"
  | "hinge"
  | "lunge"
  | "knee_flexion"
  | "knee_extension"
  | "hip_extension"
  | "calf"
  | "core_anti_ext"
  | "core_flex"
  | "core_anti_rot"
  | "core_lateral"
  | "carry"
  | "hang"
  | "scap"
  | "rotator"
  | "handstand"
  | "muscle_up"
  | "circuit"
  | "wrist"
  | "warmup"
  | "mobility"
  | "stretch";

export type ReviewStatus = "ok" | "check";

export interface Exercise {
  id: ID;
  name: string;
  nameEn: string;
  category: Category;
  pattern: Pattern;
  primary: MuscleId[];
  secondary: MuscleId[];
  /** Всё, что нужно одновременно. Пустой массив — собственный вес. */
  equipment: EquipmentId[];
  locations: Location[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  mechanics: "compound" | "isolation";
  unilateral: boolean;
  tracking: Tracking;
  /** Шаг прибавки веса, кг. */
  loadStep?: number;
  technique: string;
  /** Куда именно идёт нагрузка — общее описание. */
  load?: string;
  mistakes: string[];
  /** "check" — описание стоит перепроверить с тренером. Показывается в интерфейсе. */
  review: ReviewStatus;
}

export type ItemBlock = "warmup" | "main" | "cooldown";

export interface ProgramItem {
  id: ID;
  exerciseId: ID;
  /** Чередование по циклам программы: [exerciseId, ...variants][цикл % длина]. */
  variants?: ID[];
  block: ItemBlock;
  sets: number;
  repsMin?: number;
  repsMax?: number;
  durationSec?: number;
  restSec: number;
  note?: string;
}

export interface ProgramDay {
  id: ID;
  name: string;
  focus: string;
  items: ProgramItem[];
}

export interface SyncFields {
  createdAt: Millis;
  updatedAt: Millis;
  rev: number;
  deletedAt?: Millis | null;
}

export interface Program extends Partial<SyncFields> {
  id: ID;
  owner: "builtin" | "user";
  kind: "program" | "block";
  name: string;
  summary: string;
  description: string;
  locations: Location[];
  goals: Goal[];
  levels: Level[];
  daysPerWeek: number;
  /** Мышцы, на которые программа делает акцент (для рекомендаций). */
  emphasis: MuscleId[];
  minutes: number;
  days: ProgramDay[];
  sourceId?: ID;
}

export interface Progression {
  id: ID;
  name: string;
  steps: { exerciseId: ID; criteria: string }[];
}

// ── Пользовательские данные ─────────────────────────────

export type FocusIntent = "improve" | "technique" | "strengthen";

export interface Baselines {
  benchKg?: number | null;
  benchReps?: number | null;
  pullups?: number | null;
  dips?: number | null;
  pushups?: number | null;
}

export interface ProblemZone {
  id: ID;
  zone: "shoulder" | "knee" | "lower_back" | "elbow" | "wrist" | "neck" | "hip";
  side: Side | "both" | null;
  note: string;
  /** Беспокоит при тяжёлых весах — приложение не будет толкать к максимальным весам в связанных упражнениях. */
  limitsHeavy: boolean;
}

/** Станция кругового блока: упражнение и число повторов. */
export interface CircuitStation {
  exerciseId: ID;
  reps: number;
  weight: number | null;
}

export interface CircuitSettings {
  enabled: boolean;
  /** Где ставить круг в программной тренировке. */
  position: "start" | "end";
  stations: CircuitStation[];
  /** null — сколько успеешь в своём темпе; число — ориентир по кругам. */
  targetRounds: number | null;
  /** Ограничение по времени в минутах (вариант «20 минут»). */
  timeCapMin: number | null;
  /** Пользователь уже решил, нужен ли круг (чтобы не спрашивать повторно). */
  configured: boolean;
}

export interface Profile {
  heightCm: number | null;
  /** Чувствительные данные. */
  weightKg: number | null;
  sex: "male" | "female" | null;
  birthYear: number | null;
  level: Level;
  goal: Goal;
  focusMuscles: MuscleId[];
  focusExercises: { exerciseId: ID; intent: FocusIntent }[];
  locations: Location[];
  equipment: Record<Location, EquipmentId[]>;
  daysPerWeek: number;
  sessionMin: number;
  preferredTime: "morning" | "day" | "evening" | "any";
  weakSide: Side | null;
  problemZones: ProblemZone[];
  baselines: Baselines;
  circuit: CircuitSettings;
}

export interface Enrollment {
  programId: ID;
  startedAt: Millis;
  /** Индекс следующего дня программы (программы идут «по очереди», не по дням недели). */
  nextDayIndex: number;
  completedSessions: number;
  /** Упражнения, которые решено «добить» в следующей тренировке. */
  carryOver?: CarryItem[];
}

export interface CarryItem {
  exerciseId: ID;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSec: number | null;
  restSec: number;
  fromSessionId: ID;
}

export interface GoalChange {
  goal: Goal;
  at: Millis;
}

export interface UserMeta extends SyncFields {
  schemaVersion: number;
  onboarded: boolean;
  /** Свои упражнения (например, распознанные по фото тренажёра). */
  customExercises?: Exercise[];
  profile: Profile;
  goalHistory: GoalChange[];
  enrollment: Enrollment | null;
}

export type SetType = "warmup" | "work";

export interface SetLog {
  id: ID;
  type: SetType;
  weight: number | null;
  reps: number | null;
  /** Для односторонних упражнений — повторы по сторонам. */
  repsL: number | null;
  repsR: number | null;
  durationSec: number | null;
  done: boolean;
  doneAt: Millis | null;
}

export interface SessionExercise {
  id: ID;
  exerciseId: ID;
  block: ItemBlock;
  plannedItemId: ID | null;
  swappedFromId: ID | null;
  targetSets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSec: number | null;
  restSec: number;
  notes: string;
  sets: SetLog[];
  /** Только для кругового блока. */
  circuit?: { stations: CircuitStation[]; targetRounds: number | null; timeCapMin: number | null; startedAt?: number | null };
  /** Добито с прошлой тренировки. */
  carried?: boolean;
}

export interface WorkoutSession extends SyncFields {
  id: ID;
  status: "active" | "done" | "abandoned";
  title: string;
  programId: ID | null;
  programName: string | null;
  dayId: ID | null;
  dayIndex: number | null;
  startedAt: Millis;
  endedAt: Millis | null;
  notes: string;
  exercises: SessionExercise[];
}

export interface ExportFile {
  app: "fitness-app";
  schemaVersion: number;
  exportedAt: ISODate;
  meta: UserMeta | null;
  sessions: WorkoutSession[];
  programs: Program[];
}
