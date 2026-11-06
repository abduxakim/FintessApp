// Распознавание тренажёра по фото: запрос к Claude и проверка ответа.
import type { Exercise } from "../data/types";
import { MUSCLES } from "../data/seed/labels";
import { CUSTOM_PATTERNS, sanitizeCustom } from "../data/custom";
import { uuidv7 } from "./ids";

export interface PhotoResult {
  machine: string;
  confidence: "high" | "medium" | "low";
  note: string;
  exerciseIds: string[];
  newExercises: Exercise[];
}

export function buildPhotoPrompt(all: Exercise[]): string {
  const list = all
    .filter((e) => e.tracking !== "rounds" && (e.category === "strength" || e.category === "calisthenics"))
    .map((e) => `${e.id} | ${e.name} | ${e.equipment.join(",") || "свой вес"}`)
    .join("\n");
  return [
    "На фото — тренажёр или оборудование в спортзале. Определи, что это, и какие упражнения на нём можно делать. Отвечай на русском.",
    "Правила:",
    "- сначала выбери подходящие упражнения из списка ниже (только существующие id, до 6);",
    "- если для этого тренажёра в списке нет подходящего упражнения, опиши новое (не больше 3) — только если уверен, что оно действительно выполняется на этом тренажёре;",
    "- не создавай новое упражнение, если в списке уже есть то же движение (вариации акцента, хвата или темпа — это то же упражнение, выбери его из списка);",
    "- если фото неясное или это не тренажёр — confidence \"low\" и пустые списки, ничего не придумывай;",
    "- без медицинских советов.",
    "",
    `Мышцы (id: название): ${Object.entries(MUSCLES).map(([k, v]) => `${k}: ${v.name}`).join("; ")}`,
    `Типы движения: ${CUSTOM_PATTERNS.join(", ")}`,
    "",
    'Ответь только JSON: {"machine": "название тренажёра", "confidence": "high|medium|low", "note": "1 предложение", "exercises": [{"id": "..."}], "newExercises": [{"name": "...", "primary": ["muscle_id"], "secondary": [], "pattern": "...", "tracking": "weight_reps", "technique": "2–3 предложения", "load": "куда идёт нагрузка", "mistakes": ["..."]}]}',
    "",
    "Упражнения (id | название | оборудование):",
    list,
  ].join("\n");
}

export function parsePhotoResult(raw: unknown, byId: Record<string, Exercise>): PhotoResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const machine = typeof r.machine === "string" ? r.machine.trim().slice(0, 80) : "";
  const confidence = r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low";
  const ids = Array.isArray(r.exercises)
    ? [...new Set(r.exercises.map((e) => (e && typeof e === "object" ? (e as { id?: unknown }).id : e)).filter((id): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(byId, id)))].slice(0, 6)
    : [];
  const fresh = Array.isArray(r.newExercises)
    ? r.newExercises
        .slice(0, 3)
        .map((e) => sanitizeCustom(e, `custom_${uuidv7().slice(-12)}`))
        .filter((e): e is Exercise => !!e && !Object.values(byId).some((x) => x.name.toLowerCase() === e.name.toLowerCase()))
    : [];
  if (!machine && !ids.length && !fresh.length) return null;
  return { machine: machine || "Тренажёр", confidence, note: typeof r.note === "string" ? r.note.slice(0, 300) : "", exerciseIds: ids, newExercises: fresh };
}

/** Сжатие фото на устройстве: до 1024 px по длинной стороне, JPEG. Перекодирование убирает EXIF (в т.ч. геолокацию). */
export async function compressImage(file: Blob, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Не удалось обработать фото"))), "image/jpeg", 0.85));
}
