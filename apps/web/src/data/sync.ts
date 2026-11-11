// Синхронизация с личным облачным хранилищем артефакта (capability `db`).
//
// Пути (только владелец данных может их читать — `data/users/<id>/` приватен на уровне платформы):
//   data/users/<uid>/fitness                 — документ: профиль, активная программа (meta)
//   data/users/<uid>/fitness/sessions/<id>   — по документу на тренировку (с упражнениями и подходами)
//   data/users/<uid>/fitness/programs/<id>   — свои программы
//   data/users/<uid>/fitness/days/<YYYY-MM-DD> — дневник дня: вода, сон, чек-ин, замеры, питание
//
// Правило конфликтов: побеждает запись с бо́льшим updatedAt (last-writer-wins). Пользователь один,
// одновременные правки с двух устройств редки.
import { capability, type CollectionRef, type Db, type DbError, type DocRef, type DocSnap, type UserCap } from "./runtime";
import { ackOutbox, applyRemote, finishBootstrap, getEntity, getState, outboxEntries, requeue, setLocalChangeHandler, setSyncStatus, type EntityKind, type OutboxEntry } from "./store";
import { isMeta, isProgram, isSession, sanitizeDay } from "./validate";
import { idb } from "./idb";

const PAGE = 300;
const FLUSH_DELAY = 1500;

let root: DocRef | null = null;
let sessionsCol: CollectionRef | null = null;
let programsCol: CollectionRef | null = null;
let daysCol: CollectionRef | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let pulling = false;
let backoffUntil = 0;

function clean(v: unknown): Record<string, unknown> {
  // Облако принимает только JSON: убираем undefined и прочее.
  return JSON.parse(JSON.stringify(v));
}

function errCode(e: unknown): string {
  return (e as DbError)?.code ?? "unavailable";
}

export async function startSync(): Promise<void> {
  setLocalChangeHandler(() => scheduleFlush());
  // Не ждём облако дольше 6 секунд: дальше работаем локально, синхронизация догонит.
  setTimeout(finishBootstrap, 6000);
  const db = await capability<Db>("db");
  const user = await capability<UserCap>("user");
  const uid = user ? await user.id().catch(() => null) : null;
  if (!db || !uid) {
    setSyncStatus({ mode: "off", message: "Облако недоступно: данные хранятся только на этом устройстве" });
    finishBootstrap();
    return;
  }
  try {
    root = db.doc(`data/users/${uid}/fitness`);
    sessionsCol = root.collection("sessions");
    programsCol = root.collection("programs");
    daysCol = root.collection("days");
  } catch {
    setSyncStatus({ mode: "error", message: "Не удалось открыть облачное хранилище" });
    finishBootstrap();
    return;
  }
  await syncNow();
  finishBootstrap();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  window.addEventListener("online", () => void syncNow());
}

export async function syncNow(): Promise<void> {
  if (!root) return;
  await pull();
  await flush();
}

async function readAll(col: CollectionRef, since: number): Promise<DocSnap[]> {
  const out: DocSnap[] = [];
  let cursor = since;
  const seen = new Set<string>();
  for (let guard = 0; guard < 100; guard++) {
    const snap = await col.where("updatedAt", ">=", cursor).orderBy("updatedAt", "asc").limit(PAGE).get();
    let fresh = 0;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
      fresh++;
      const u = d.data()?.updatedAt;
      if (typeof u === "number" && u > cursor) cursor = u;
    }
    if (snap.size < PAGE || fresh === 0) break;
  }
  return out;
}

async function pull(): Promise<void> {
  if (!root || !sessionsCol || !programsCol || !daysCol || pulling) return;
  pulling = true;
  setSyncStatus({ mode: "connecting" });
  try {
    const lastPull = ((await idb.get<number>("kv", "lastPullAt")) ?? 0) as number;
    const lastFull = ((await idb.get<number>("kv", "lastFullPullAt")) ?? 0) as number;
    // Раз в сутки — полная выборка (данных мало), иначе инкрементальная с запасом на расхождение часов.
    const full = Date.now() - lastFull > 24 * 3600 * 1000;
    const since = full ? 0 : Math.max(0, lastPull - 30 * 60 * 1000);
    let maxSeen = lastPull;

    const metaSnap = await root.get();
    const remoteMeta = metaSnap.exists ? metaSnap.data()?.data : undefined;
    if (isMeta(remoteMeta)) {
      const changed = await applyRemote("meta", remoteMeta);
      if (!changed && getState().meta.updatedAt > remoteMeta.updatedAt) await requeue("meta", "meta");
    } else if (getState().meta.rev > 0) {
      await requeue("meta", "meta");
    }

    const remoteIds = { session: new Set<string>(), program: new Set<string>(), day: new Set<string>() };
    // Дневник проверяется мягко: плохие записи внутри дня отбрасываются, а не весь день.
    const strict = <T,>(guard: (v: unknown) => v is T) => (v: unknown) => (guard(v) ? v : null);
    for (const [kind, col, clean] of [
      ["session", sessionsCol, strict(isSession)],
      ["program", programsCol, strict(isProgram)],
      ["day", daysCol, sanitizeDay],
    ] as const) {
      const docs = await readAll(col, since);
      for (const d of docs) {
        const body = (clean as (v: unknown) => unknown)(d.data()?.data);
        if (!body) {
          // Повреждённую запись не применяем, но и не перетираем вслепую при первой синхронизации.
          remoteIds[kind].add(d.id);
          continue;
        }
        const entity = body as { id: string; updatedAt: number };
        remoteIds[kind].add(entity.id);
        maxSeen = Math.max(maxSeen, entity.updatedAt);
        const changed = await applyRemote(kind, entity as never);
        const local = getEntity(kind, entity.id);
        if (!changed && local && (local.updatedAt ?? 0) > entity.updatedAt) await requeue(kind, entity.id);
      }
    }

    // Первая синхронизация на устройстве: всё локальное, чего нет в облаке, отправляем.
    if (lastPull === 0) {
      const st = getState();
      for (const s of Object.values(st.sessions)) if (!remoteIds.session.has(s.id)) await requeue("session", s.id);
      for (const p of Object.values(st.programs)) if (!remoteIds.program.has(p.id)) await requeue("program", p.id);
      for (const d of Object.values(st.days)) if (!remoteIds.day.has(d.id)) await requeue("day", d.id);
    }

    // Не даём метке уйти в будущее, если часы другого устройства спешат.
    await idb.put("kv", Math.min(Date.now(), Math.max(maxSeen, Date.now() - 60 * 1000)), "lastPullAt");
    if (full) await idb.put("kv", Date.now(), "lastFullPullAt");
    setSyncStatus({ mode: "on", lastSyncAt: Date.now(), message: null });
  } catch (e) {
    handleError(e);
  } finally {
    pulling = false;
  }
}

/**
 * Стереть данные в облаке и на устройстве: тренировки и дневник ("history") или всё ("all").
 * Пока идёт стирание, синхронизация стоит, иначе она вернула бы удалённое с устройства или из облака.
 * Сначала облако: если оно отказало на середине, устройство не трогаем — можно повторить.
 * Возвращает false, если облако недоступно (стёрто только устройство).
 */
export async function wipeData(scope: "history" | "all", wipeLocal: () => Promise<void>, onProgress?: (done: number, total: number) => void): Promise<boolean> {
  if (!root || !sessionsCol || !programsCol || !daysCol) {
    await wipeLocal();
    return false;
  }
  while (pulling || flushing) await new Promise((r) => setTimeout(r, 100));
  if (flushTimer) clearTimeout(flushTimer);
  pulling = flushing = true;
  try {
    const cols = scope === "all" ? [sessionsCol, daysCol, programsCol] : [sessionsCol, daysCol];
    const refs: DocRef[] = [];
    for (const col of cols) for (const d of await readAll(col, 0)) refs.push(col.doc(d.id));
    if (scope === "all") refs.push(root);
    let done = 0;
    onProgress?.(0, refs.length);
    // По одному документу: облако ограничивает частоту записей.
    for (const ref of refs) {
      await ref.delete();
      onProgress?.(++done, refs.length);
    }
    await wipeLocal();
    return true;
  } finally {
    pulling = flushing = false;
  }
}

function refFor(entry: OutboxEntry): DocRef | null {
  if (!root || !sessionsCol || !programsCol || !daysCol) return null;
  if (entry.kind === "meta") return root;
  if (entry.kind === "day") return daysCol.doc(entry.id);
  return (entry.kind === "session" ? sessionsCol : programsCol).doc(entry.id);
}

export function scheduleFlush(delay = FLUSH_DELAY): void {
  if (!root) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), Math.max(delay, backoffUntil - Date.now()));
}

async function flush(): Promise<void> {
  if (!root || flushing) return;
  if (Date.now() < backoffUntil) return scheduleFlush();
  flushing = true;
  let rejected = 0;
  try {
    // Одна запись за раз на документ: идём по очереди последовательно.
    for (const entry of outboxEntries()) {
      const entity = getEntity(entry.kind as EntityKind, entry.id);
      const ref = refFor(entry);
      if (!entity || !ref) {
        await ackOutbox(entry);
        continue;
      }
      try {
        await ref.set(clean({ v: 1, kind: entry.kind, updatedAt: entity.updatedAt ?? 0, data: entity }));
      } catch (e) {
        // Запись, которую облако отклоняет по содержимому, не должна блокировать остальную очередь.
        if (errCode(e) === "invalid_argument" || errCode(e) === "transform_error") {
          rejected++;
          await ackOutbox({ ...entry, updatedAt: entity.updatedAt ?? 0 });
          continue;
        }
        throw e;
      }
      await ackOutbox({ ...entry, updatedAt: entity.updatedAt ?? 0 });
    }
    setSyncStatus({ mode: "on", lastSyncAt: Date.now(), message: rejected ? `Облако не приняло записей: ${rejected}. Они сохранены на устройстве и в экспорте.` : null });
  } catch (e) {
    handleError(e);
  } finally {
    flushing = false;
    // Если за время отправки появились новые изменения — отправим их следом.
    if (root && outboxEntries().length && Date.now() >= backoffUntil && getState().sync.mode === "on") scheduleFlush();
  }
}

function handleError(e: unknown) {
  const code = errCode(e);
  if (code === "quota_exceeded") {
    setSyncStatus({ mode: "error", message: "Облачное хранилище заполнено. Данные сохраняются на устройстве; сделай экспорт." });
    return;
  }
  if (code === "invalid_argument" || code === "transform_error") {
    setSyncStatus({ mode: "error", message: "Облако отклонило запись. Данные сохранены на устройстве." });
    return;
  }
  if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") {
    root = null;
    setSyncStatus({ mode: "off", message: "Доступ к облаку закрыт в этом окне. Данные хранятся на устройстве." });
    return;
  }
  // unavailable, resource_exhausted, сеть: повторим позже.
  backoffUntil = Date.now() + (code === "resource_exhausted" ? 60_000 : 15_000);
  setSyncStatus({ mode: "connecting", message: "Нет связи с облаком — изменения отправятся позже" });
  scheduleFlush();
}
