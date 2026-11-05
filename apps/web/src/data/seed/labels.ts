import type { Category, EquipmentId, Goal, Level, Location, MuscleId, FocusIntent, ProblemZone } from "../types";

export const MUSCLES: Record<MuscleId, { name: string; group: "Грудь" | "Спина" | "Плечи" | "Руки" | "Кор" | "Ноги" }> = {
  chest: { name: "Грудные", group: "Грудь" },
  lats: { name: "Широчайшие", group: "Спина" },
  upper_back: { name: "Середина спины", group: "Спина" },
  lower_back: { name: "Поясница", group: "Спина" },
  traps: { name: "Трапеции", group: "Спина" },
  front_delts: { name: "Передняя дельта", group: "Плечи" },
  side_delts: { name: "Средняя дельта", group: "Плечи" },
  rear_delts: { name: "Задняя дельта", group: "Плечи" },
  rotator_cuff: { name: "Ротаторная манжета", group: "Плечи" },
  serratus: { name: "Передняя зубчатая", group: "Плечи" },
  biceps: { name: "Бицепс", group: "Руки" },
  triceps: { name: "Трицепс", group: "Руки" },
  forearms: { name: "Предплечья", group: "Руки" },
  abs: { name: "Пресс", group: "Кор" },
  obliques: { name: "Косые", group: "Кор" },
  glutes: { name: "Ягодицы", group: "Ноги" },
  quads: { name: "Квадрицепс", group: "Ноги" },
  hamstrings: { name: "Бицепс бедра", group: "Ноги" },
  adductors: { name: "Приводящие", group: "Ноги" },
  calves: { name: "Икры", group: "Ноги" },
  hip_flexors: { name: "Сгибатели бедра", group: "Ноги" },
};

/** Крупные зоны для фокуса в профиле. */
export const FOCUS_AREAS: { id: string; name: string; muscles: MuscleId[] }[] = [
  { id: "back", name: "Спина", muscles: ["lats", "upper_back", "traps"] },
  { id: "chest", name: "Грудь", muscles: ["chest"] },
  { id: "shoulders", name: "Плечи", muscles: ["side_delts", "rear_delts", "front_delts"] },
  { id: "arms", name: "Руки", muscles: ["biceps", "triceps", "forearms"] },
  { id: "abs", name: "Пресс", muscles: ["abs", "obliques"] },
  { id: "legs", name: "Ноги", muscles: ["quads", "hamstrings", "calves"] },
  { id: "glutes", name: "Ягодицы", muscles: ["glutes"] },
];

export const EQUIPMENT: Record<EquipmentId, string> = {
  barbell: "Штанга",
  ez_bar: "EZ-гриф",
  dumbbell: "Гантели",
  kettlebell: "Гиря",
  cable: "Блоки / кроссовер",
  machine: "Тренажёры",
  bench: "Скамья",
  rack: "Стойки / рама",
  pullup_bar: "Турник",
  dip_bars: "Брусья",
  band: "Резинка",
  rings: "Кольца",
  mat: "Коврик",
  cardio_machine: "Кардио (дорожка, велосипед)",
};

export const LOCATIONS: Record<Location, string> = { gym: "Зал", home: "Дом", outdoor: "Улица" };

export const GOALS: Record<Goal, { name: string; hint: string }> = {
  strength: { name: "Сила", hint: "Меньше повторов, больше вес, длинный отдых" },
  hypertrophy: { name: "Масса", hint: "Средние повторы, объём, профицит калорий" },
  definition: { name: "Рельеф", hint: "Сохранить мышцы, снизить жир: вес около поддержки или лёгкий дефицит" },
  endurance: { name: "Выносливость", hint: "Больше повторов, короткий отдых" },
};

export const LEVELS: Record<Level, string> = {
  beginner: "Новичок",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

export const CATEGORIES: Record<Category, string> = {
  strength: "Силовое",
  calisthenics: "Калистеника",
  warmup: "Разминка",
  mobility: "Мобильность",
  stretch: "Растяжка",
  prehab: "Профилактика",
  cardio: "Кардио",
};

export const INTENTS: Record<FocusIntent, string> = {
  improve: "Улучшить результат",
  technique: "Поставить технику",
  strengthen: "Усилить",
};

export const ZONES: Record<ProblemZone["zone"], string> = {
  shoulder: "Плечо",
  knee: "Колено",
  lower_back: "Поясница",
  elbow: "Локоть",
  wrist: "Запястье",
  neck: "Шея",
  hip: "Тазобедренный",
};

/** Типовой набор оборудования по местам — стартовая точка, правится в профиле. */
export const EQUIPMENT_PRESETS: Record<Location, EquipmentId[]> = {
  gym: ["barbell", "ez_bar", "dumbbell", "kettlebell", "cable", "machine", "bench", "rack", "pullup_bar", "dip_bars", "band", "mat", "cardio_machine"],
  home: ["mat"],
  outdoor: ["pullup_bar", "dip_bars"],
};

export const DIFFICULTY = ["", "Очень легко", "Легко", "Средне", "Сложно", "Очень сложно"];
