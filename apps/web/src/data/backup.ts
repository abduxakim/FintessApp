import { capability, type DownloadsCap } from "./runtime";
import { applyRemote, getState, liveSessions, requeue } from "./store";
import { SCHEMA_VERSION } from "./defaults";
import { parseImport } from "./validate";
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
  return { sessions, programs, profile, skipped: parsed.skipped };
}
