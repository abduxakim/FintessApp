import { capability, type DownloadsCap } from "./runtime";
import { applyRemote, getState, liveSessions, requeue } from "./store";
import { SCHEMA_VERSION } from "./defaults";
import { parseImport } from "./validate";
import { EXERCISE_BY_ID } from "./seed/exercises";
import { dayTotals, waterTotal } from "../domain/nutrition";
import { readiness } from "../domain/recovery";
import type { ExportFile } from "./types";

export function buildExport(): ExportFile {
  const s = getState();
  return {
    app: "fitness-app",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    meta: s.meta,
    sessions: liveSessions(s),
    programs: Object.values(s.programs).filter((p) => !p.deletedAt),
    days: Object.values(s.days),
  };
}

export type ExportResult = { ok: true } | { ok: false; reason: "unavailable" | "declined" | "error"; json: string };

/** Сохраняет файл через возможность downloads. Если она недоступна — возвращает JSON для ручного копирования. */
export async function exportToFile(): Promise<ExportResult> {
  const json = JSON.stringify(buildExport(), null, 1);
  const downloads = await capability<DownloadsCap>("downloads");
  if (!downloads) return { ok: false, reason: "unavailable", json };
  const date = new Date().toISOString().slice(0, 10);
  try {
    await downloads.save({ filename: `fitness-backup-${date}.json`, data: json });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, reason: code === "declined" ? "declined" : "error", json };
  }
}

export interface ImportSummary {
  sessions: number;
  programs: number;
  profile: boolean;
  skipped: number;
}

/** Слияние: из файла берутся записи, которые новее локальных. Ничего не удаляется. */
export async function importFromText(text: string): Promise<ImportSummary> {
  const parsed = parseImport(text);
  let sessions = 0;
  let programs = 0;
  let profile = false;
  if (parsed.meta && (await applyRemote("meta", parsed.meta))) {
    profile = true;
    await requeue("meta", "meta");
  }
  for (const s of parsed.sessions) {
    if (await applyRemote("session", s)) {
      sessions++;
      await requeue("session", s.id);
    }
  }
  for (const p of parsed.programs) {
    if (await applyRemote("program", p)) {
      programs++;
      await requeue("program", p.id);
    }
  }
  for (const d of parsed.days) {
    if (await applyRemote("day", d)) await requeue("day", d.id);
  }
  return { sessions, programs, profile, skipped: parsed.skipped };
}

// ── CSV (для Excel / Google Таблиц): разделитель «;», десятичная запятая, BOM для кириллицы ──

const cell = (v: unknown): string => {
  if (v == null) return "";
  const t = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows: unknown[][]) => "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");

export function workoutsCsv(): string {
  const s = getState();
  const rows: unknown[][] = [["Дата", "Время", "Тренировка", "Упражнение", "Подход", "Вес, кг", "Повторы", "Повторы Л", "Повторы П", "Секунды"]];
  for (const w of liveSessions(s).filter((x) => x.status === "done").sort((a, b) => a.startedAt - b.startedAt)) {
    const d = new Date(w.startedAt);
    for (const e of w.exercises)
      e.sets.forEach((x, i) => {
        if (!x.done) return;
        rows.push([d.toLocaleDateString("ru-RU"), d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), w.title, EXERCISE_BY_ID[e.exerciseId]?.name ?? e.exerciseId, i + 1, x.weight, x.reps, x.repsL, x.repsR, x.durationSec]);
      });
  }
  return csv(rows);
}

export function daysCsv(): string {
  const s = getState();
  const rows: unknown[][] = [["Дата", "Вода, мл", "Сон, ч", "Качество сна", "Готовность", "Ккал", "Белки", "Жиры", "Углеводы", "Вес", "Талия", "Грудь", "Рука Л", "Рука П", "Предплечье Л", "Предплечье П", "Бедро Л", "Бедро П"]];
  for (const d of Object.values(s.days).sort((a, b) => a.id.localeCompare(b.id))) {
    const t = dayTotals(d);
    const b = d.body ?? {};
    rows.push([d.id, waterTotal(d) || null, d.sleep?.hours, d.sleep?.quality, readiness(d.checkin, d.sleep)?.score, d.meals.length ? t.kcal : null, d.meals.length ? t.protein : null, d.meals.length ? t.fat : null, d.meals.length ? t.carbs : null, b.weightKg, b.waistCm, b.chestCm, b.armL, b.armR, b.forearmL, b.forearmR, b.thighL, b.thighR]);
  }
  return csv(rows);
}

export async function exportCsv(kind: "workouts" | "days"): Promise<"saved" | "declined" | "unavailable"> {
  const downloads = await capability<DownloadsCap>("downloads");
  if (!downloads) return "unavailable";
  const date = new Date().toISOString().slice(0, 10);
  try {
    await downloads.save({ filename: `${kind === "workouts" ? "trenirovki" : "dnevnik"}-${date}.csv`, data: kind === "workouts" ? workoutsCsv() : daysCsv() });
    return "saved";
  } catch (e) {
    return (e as { code?: string })?.code === "declined" ? "declined" : "unavailable";
  }
}
