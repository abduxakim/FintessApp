// Тренировка по запросу словами. Два пути:
//  1) Claude (capability sample) получает запрос, профиль без веса и список доступных упражнений;
//  2) если Claude недоступен — простой разбор ключевых слов.
// Ответ всегда проверяется: только упражнения из каталога, числа в разумных пределах.
import type { Exercise, ItemBlock, Location, MuscleId, Profile } from "../data/types";
import { MUSCLES, GOALS, LEVELS, LOCATIONS, ZONES } from "../data/seed/labels";
import { isAvailable } from "./availability";
import { exerciseForGroup, type Group, type GroupLoad } from "./balance";

import type { Plan, PlanItem } from "./plan-types";
export type { Plan, PlanItem };

type Target = { label: string; group?: Group; muscles?: MuscleId[] };

// Порядок важен: сначала узкие мышцы («бицепс бедра», «предплечья»), затем группы.
// Найденное слово вырезается из текста, чтобы «предплечья» не сработали как «плечи».
const KEYWORDS: [RegExp, Target | "light"][] = [
  [/лёгк\S*|легк\S*|устал\S*|восстан\S*|разгруз\S*|мобил\S*|растяж\S*/gi, "light"],
  [/бицепс\S* бедр\S*|задн\S* поверхн\S*/gi, { label: "Бицепс бедра", muscles: ["hamstrings"] }],
  [/предплеч\S*|хват\S*/gi, { label: "Предплечья", muscles: ["forearms"] }],
  [/трицеп\S*/gi, { label: "Трицепс", muscles: ["triceps"] }],
  [/бицеп\S*/gi, { label: "Бицепс", muscles: ["biceps"] }],
  [/икр\S*/gi, { label: "Икры", muscles: ["calves"] }],
  [/трапец\S*/gi, { label: "Трапеции", muscles: ["traps"] }],
  [/ягодиц\S*/gi, { label: "Ягодицы", muscles: ["glutes"] }],
  [/квадри\S*/gi, { label: "Квадрицепс", muscles: ["quads"] }],
  [/задн\S* дельт\S*/gi, { label: "Задняя дельта", muscles: ["rear_delts"] }],
  [/средн\S* дельт\S*|ширин\S* плеч\S*/gi, { label: "Средняя дельта", muscles: ["side_delts"] }],
  [/пресс\S*|(?<=[\s,.])кор(?=[\s,.])|живот\S*/gi, { label: "Пресс", muscles: ["abs", "obliques"] }],
  [/спин\S*|тяг\S*|подтяг\S*|широчайш\S*/gi, { label: "Спина", group: "Спина" }],
  [/груд\S*|жим\S* лёж\S*|жим\S* леж\S*/gi, { label: "Грудь", group: "Грудь" }],
  [/плеч\S*|дельт\S*/gi, { label: "Плечи", group: "Плечи" }],
  [/рук\S*/gi, { label: "Руки", group: "Руки" }],
  [/ног\S*|присед\S*|бедр\S*/gi, { label: "Ноги", group: "Ноги" }],
];

export function detectTargets(text: string): (Target | "light")[] {
  let t = ` ${text.toLowerCase()} `;
  const out: { at: number; target: Target | "light" }[] = [];
  for (const [re, target] of KEYWORDS) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m) {
      out.push({ at: m.index, target });
      // Заменяем пробелами той же длины, чтобы позиции остальных слов не сдвигались.
      t = t.replace(re, (x) => " ".repeat(x.length));
    }
    re.lastIndex = 0;
  }
  // В том порядке, как написано в запросе.
  return out.sort((a, b) => a.at - b.at).map((x) => x.target);
}

export function detectLocation(text: string, fallback: Location): Location {
  if (/улиц|площадк|турник|брус/i.test(text)) return "outdoor";
  if (/дом|дома\b/i.test(text)) return "home";
  if (/зал/i.test(text)) return "gym";
  return fallback;
}

export function detectMinutes(text: string): number | null {
  const m = /(\d{2,3})\s*(мин|m)/i.exec(text) ?? (/(час|1 ч)/i.test(text) ? ["", "60"] : null);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 15 && n <= 180 ? n : null;
}

/** Разбор без Claude: ключевые слова → группы → по 2–3 доступных упражнения. */
export function localPlan(text: string, profile: Profile, all: Exercise[], byId: Record<string, Exercise>, load: GroupLoad[]): Plan {
  const location = detectLocation(text, profile.locations[0] ?? "gym");
  const minutes = detectMinutes(text) ?? profile.sessionMin;
  const found = detectTargets(text);
  const light = found.includes("light");
  let targets = found.filter((t): t is Target => t !== "light");
  const available = (e: Exercise) => isAvailable(e, profile, location);
  const items: PlanItem[] = [];
  const used: string[] = [];
  const add = (e: Exercise | null | undefined, sets: number, reps: [number, number] | number, rest: number, block: ItemBlock = "main") => {
    if (!e || used.includes(e.id)) return;
    used.push(e.id);
    const time = e.tracking === "time";
    items.push({ exerciseId: e.id, sets, repsMin: time ? null : Array.isArray(reps) ? reps[0] : null, repsMax: time ? null : Array.isArray(reps) ? reps[1] : null, durationSec: time ? (typeof reps === "number" ? reps : 30) : null, restSec: rest, note: "", block });
  };

  if (light && !targets.length) {
    for (const id of ["cardio_warmup", "cat_cow", "thoracic_open_book", "worlds_greatest_stretch", "band_pull_apart", "wall_slide", "dead_hang", "hip_flexor_stretch", "child_pose"]) {
      const e = byId[id];
      if (e && available(e)) add(e, e.tracking === "time" ? 1 : 2, e.tracking === "time" ? (id === "cardio_warmup" ? 300 : 40) : [8, 10], 30, e.category === "stretch" ? "cooldown" : "main");
    }
    return { title: "Лёгкая тренировка", rationale: "Подвижность и восстановление без тяжёлой нагрузки. Составлено по ключевым словам.", items, source: "local" };
  }

  const fromBalance = !targets.length;
  if (fromBalance)
    targets = load
      .filter((l) => l.sets < l.target)
      .sort((a, b) => a.sets / a.target - b.sets / b.target)
      .slice(0, 2)
      .map((l) => ({ label: l.group, group: l.group }));
  const slots = Math.max(3, Math.min(9, Math.round((minutes - 15) / 9)));

  add(byId.cardio_warmup, 1, 300, 0, "warmup");
  const upper = targets.some((t) => t.group === "Грудь" || t.group === "Спина" || t.group === "Плечи" || t.muscles?.some((m) => ["triceps", "biceps", "rear_delts", "side_delts", "traps"].includes(m)));
  if (upper || profile.problemZones.some((z) => z.zone === "shoulder")) {
    add(byId.band_pull_apart, 2, [15, 15], 30, "warmup");
    add(byId.band_external_rotation, 2, [12, 15], 30, "warmup");
  }

  // Группам — больше слотов, отдельным мышцам — по 2.
  const groupCount = targets.filter((t) => t.group).length;
  const muscleCount = targets.length - groupCount;
  const perGroup = Math.max(1, Math.floor((slots - muscleCount * 2) / Math.max(1, groupCount)));
  for (const t of targets) {
    if (t.group) {
      for (let i = 0; i < perGroup; i++) {
        const e = exerciseForGroup(t.group, all, available, used);
        if (!e) break;
        const compound = e.mechanics === "compound";
        add(e, compound ? 4 : 3, compound ? [6, 10] : [10, 15], compound ? 120 : 60);
      }
    } else if (t.muscles) {
      const pool = all
        .filter((x) => (x.category === "strength" || x.category === "calisthenics") && x.tracking !== "rounds" && x.primary.some((m) => t.muscles!.includes(m)) && available(x))
        .sort((a, b) => Number(b.primary[0] === t.muscles![0]) - Number(a.primary[0] === t.muscles![0]) || a.difficulty - b.difficulty);
      let n = 0;
      for (const e of pool) {
        if (n >= Math.max(2, Math.min(3, perGroup))) break;
        if (used.includes(e.id)) continue;
        const compound = e.mechanics === "compound";
        add(e, 3, compound ? [6, 10] : [10, 15], compound ? 90 : 60);
        n++;
      }
    }
  }
  add(byId.doorway_pec_stretch, 1, 30, 0, "cooldown");
  add(byId.lat_stretch, 1, 30, 0, "cooldown");

  const names = targets.map((t) => t.label);
  return {
    title: names.length ? names.join(" + ") : "Своя тренировка",
    rationale: !fromBalance ? `Составлено по ключевым словам: ${names.join(", ").toLowerCase()}, около ${minutes} мин.` : `В запросе нет групп мышц — взял те, что недобрали за неделю: ${names.join(", ").toLowerCase()}.`,
    items,
    source: "local",
  };
}

/** Текст запроса к Claude. Вес, замеры и личные заметки не передаются. */
export function buildPrompt(text: string, profile: Profile, all: Exercise[], load: GroupLoad[]): string {
  const location = detectLocation(text, profile.locations[0] ?? "gym");
  const list = all
    .filter((e) => isAvailable(e, profile, location) && e.tracking !== "rounds")
    .map((e) => `${e.id} | ${e.name} | ${e.primary.map((m) => MUSCLES[m].name).join(", ") || e.category} | ${e.category} | ${e.tracking}`)
    .join("\n");
  const zones = profile.problemZones.map((z) => `${ZONES[z.zone]}${z.side === "left" ? " (левое)" : z.side === "right" ? " (правое)" : ""}${z.limitsHeavy ? ": избегать максимальных весов" : ""}`).join("; ");
  return [
    "Ты — тренер. Составь ОДНУ силовую тренировку на сегодня по запросу пользователя. Отвечай на русском.",
    `Запрос пользователя: «${text.slice(0, 500)}»`,
    "",
    "Профиль:",
    `- цель: ${GOALS[profile.goal].name}; уровень: ${LEVELS[profile.level]}; место: ${LOCATIONS[location]}; обычная длительность: ${profile.sessionMin} мин`,
    `- зоны в фокусе: ${[...new Set(profile.focusMuscles.map((m) => MUSCLES[m].group))].join(", ") || "нет"}`,
    `- слабая сторона: ${profile.weakSide === "right" ? "правая" : profile.weakSide === "left" ? "левая" : "нет"}`,
    `- ограничения: ${zones || "нет"}`,
    `- подходов за последние 7 дней по группам: ${load.map((l) => `${l.group} ${l.sets}`).join(", ")}`,
    "",
    "Правила:",
    "- используй ТОЛЬКО id из списка ниже, ничего не придумывай;",
    "- начни с 2–4 упражнений разминки (category warmup/prehab/mobility/cardio), закончи 1–2 упражнениями растяжки (stretch);",
    "- для tracking=time укажи durationSec, для остальных repsMin и repsMax;",
    "- уложись во время из запроса, иначе в обычную длительность; базовые упражнения — раньше изолирующих;",
    "- без медицинских советов; если есть ограничение по плечу, не ставь максимальные веса и предпочитай щадящие варианты.",
    "",
    'Ответь только JSON: {"title": "до 40 символов", "rationale": "1–2 предложения, почему так", "items": [{"id": "...", "sets": 3, "repsMin": 8, "repsMax": 12, "durationSec": null, "restSec": 90, "note": "коротко или пусто"}]}',
    "",
    "Доступные упражнения (id | название | мышцы | category | tracking):",
    list,
  ].join("\n");
}

const clampInt = (v: unknown, min: number, max: number, dflt: number | null): number | null => {
  const n = typeof v === "number" ? Math.round(v) : typeof v === "string" ? Math.round(Number(v)) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};

/** Проверка ответа Claude. Неизвестные id отбрасываются, числа ограничиваются. */
export function parsePlan(raw: unknown, byId: Record<string, Exercise>): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  for (const it of r.items.slice(0, 16)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!Object.prototype.hasOwnProperty.call(byId, id) || seen.has(id)) continue;
    const ex = byId[id];
    if (ex.tracking === "rounds") continue;
    seen.add(id);
    const time = ex.tracking === "time";
    let repsMin = time ? null : clampInt(o.repsMin, 1, 50, 8);
    let repsMax = time ? null : clampInt(o.repsMax, 1, 60, 12);
    if (repsMin != null && repsMax != null && repsMin > repsMax) [repsMin, repsMax] = [repsMax, repsMin];
    items.push({
      exerciseId: id,
      sets: clampInt(o.sets, 1, 8, 3)!,
      repsMin,
      repsMax,
      durationSec: time ? clampInt(o.durationSec, 10, 900, 30) : null,
      restSec: clampInt(o.restSec, 0, 300, 90)!,
      note: typeof o.note === "string" ? o.note.slice(0, 140) : "",
      block: ex.category === "stretch" ? "cooldown" : ["warmup", "prehab", "mobility", "cardio"].includes(ex.category) && items.every((x) => x.block === "warmup") ? "warmup" : "main",
    });
  }
  if (!items.some((i) => i.block === "main")) return null;
  return {
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 60) : "Тренировка по запросу",
    rationale: typeof r.rationale === "string" ? r.rationale.slice(0, 400) : "",
    items,
    source: "claude",
  };
}
