// Тренировка по запросу словами. Два пути:
//  1) Claude (capability sample) получает запрос, профиль без веса и список доступных упражнений;
//  2) если Claude недоступен — простой разбор ключевых слов.
// Ответ всегда проверяется: только упражнения из каталога, числа в разумных пределах.
import type { Exercise, ItemBlock, Location, Profile } from "../data/types";
import { MUSCLES, GOALS, LEVELS, LOCATIONS, ZONES } from "../data/seed/labels";
import { isAvailable } from "./availability";
import { exerciseForGroup, type Group, type GroupLoad } from "./balance";

import type { Plan, PlanItem } from "./plan-types";
export type { Plan, PlanItem };

const KEYWORDS: [RegExp, Group | "light" | "calves" | "forearms"][] = [
  [/спин|тяг|подтяг|широчайш/i, "Спина"],
  [/груд|жим лёж|жим леж/i, "Грудь"],
  [/плеч|дельт/i, "Плечи"],
  [/рук|бицеп|трицеп/i, "Руки"],
  [/ног|присед|бедр|ягод|квадри/i, "Ноги"],
  [/пресс|кор\b|живот/i, "Кор"],
  [/икр/i, "calves"],
  [/предплеч|хват/i, "forearms"],
  [/лёгк|легк|устал|восстан|разгруз|мобил|растяж/i, "light"],
];

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
  const tags = KEYWORDS.filter(([re]) => re.test(text)).map(([, g]) => g);
  const available = (e: Exercise) => isAvailable(e, profile, location);
  const items: PlanItem[] = [];
  const used: string[] = [];
  const add = (e: Exercise | null | undefined, sets: number, reps: [number, number] | number, rest: number, block: ItemBlock = "main") => {
    if (!e || used.includes(e.id)) return;
    used.push(e.id);
    const time = e.tracking === "time";
    items.push({ exerciseId: e.id, sets, repsMin: time ? null : Array.isArray(reps) ? reps[0] : null, repsMax: time ? null : Array.isArray(reps) ? reps[1] : null, durationSec: time ? (typeof reps === "number" ? reps : 30) : null, restSec: rest, note: "", block });
  };

  if (tags.includes("light")) {
    for (const id of ["cardio_warmup", "cat_cow", "thoracic_open_book", "worlds_greatest_stretch", "band_pull_apart", "wall_slide", "dead_hang", "hip_flexor_stretch", "child_pose"]) {
      const e = byId[id];
      if (e && available(e)) add(e, e.tracking === "time" ? 1 : 2, e.tracking === "time" ? (id === "cardio_warmup" ? 300 : 40) : [8, 10], 30, e.category === "stretch" ? "cooldown" : "main");
    }
    return { title: "Лёгкая тренировка", rationale: "Подвижность и восстановление без тяжёлой нагрузки. Составлено по ключевым словам.", items, source: "local" };
  }

  let groups = tags.filter((t): t is Group => t !== "calves" && t !== "forearms" && t !== "light");
  if (!groups.length && !tags.length) groups = load.filter((l) => l.sets < l.target).sort((a, b) => a.sets / a.target - b.sets / b.target).slice(0, 2).map((l) => l.group);
  const slots = Math.max(3, Math.min(9, Math.round((minutes - 15) / 9)));

  add(byId.cardio_warmup, 1, 300, 0, "warmup");
  if (groups.some((g) => g === "Грудь" || g === "Спина" || g === "Плечи") || profile.problemZones.some((z) => z.zone === "shoulder")) {
    add(byId.band_pull_apart, 2, [15, 15], 30, "warmup");
    add(byId.band_external_rotation, 2, [12, 15], 30, "warmup");
  }

  const perGroup = Math.max(1, Math.floor(slots / Math.max(1, groups.length + (tags.includes("calves") ? 1 : 0) + (tags.includes("forearms") ? 1 : 0))));
  for (const g of groups) {
    for (let i = 0; i < perGroup; i++) {
      const e = exerciseForGroup(g, all, available, used);
      if (!e) break;
      const compound = e.mechanics === "compound";
      add(e, compound ? 4 : 3, compound ? [6, 10] : [10, 15], compound ? 120 : 60);
    }
  }
  const pickMuscle = (m: "calves" | "forearms", n: number) => {
    for (const e of all.filter((x) => x.primary.includes(m) && available(x)).slice(0, n)) add(e, 3, [12, 15], 45);
  };
  if (tags.includes("calves")) pickMuscle("calves", Math.max(2, perGroup));
  if (tags.includes("forearms")) pickMuscle("forearms", Math.max(2, perGroup));
  add(byId.doorway_pec_stretch, 1, 30, 0, "cooldown");
  add(byId.lat_stretch, 1, 30, 0, "cooldown");

  const names = [...groups, ...(tags.includes("calves") ? ["Икры"] : []), ...(tags.includes("forearms") ? ["Предплечья"] : [])];
  return {
    title: names.length ? names.join(" + ") : "Своя тренировка",
    rationale: tags.length ? `Составлено по ключевым словам: ${names.join(", ").toLowerCase()}, около ${minutes} мин.` : `В запросе нет групп мышц — взял те, что недобрали за неделю: ${names.join(", ").toLowerCase()}.`,
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
