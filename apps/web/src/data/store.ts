// Локальное хранилище состояния (local-first).
// Каждое изменение: память → IndexedDB → очередь outbox → облако (sync.ts).
// Чтение идёт только из памяти, поэтому интерфейс не ждёт сеть.
import { useRef, useSyncExternalStore } from "react";
import { idb, STORES } from "./idb";
import { dayId, defaultMeta, emptyDay, normalizeMeta, setDayEndHour } from "./defaults";
import { registerCustom } from "./custom";
import type { DayLog, Program, UserMeta, WorkoutSession } from "./types";
import { EXERCISE_BY_ID } from "./seed/exercises";
import { liftSummaries, type LiftSummary } from "../domain/lifts";

export type EntityKind = "meta" | "session" | "program" | "day";

export interface OutboxEntry {
  key: string;
  kind: EntityKind;
  id: string;
  updatedAt: number;
}

export type SyncMode = "connecting" | "on" | "off" | "error";

export interface SyncStatus {
  mode: SyncMode;
  pending: number;
  lastSyncAt: number | null;
  message: string | null;
}

export interface State {
  ready: boolean;
  /** Первая загрузка из облака ещё идёт (на новом устройстве не показываем онбординг раньше времени). */
  bootstrapping: boolean;
  localStorage: boolean;
  meta: UserMeta;
  sessions: Record<string, WorkoutSession>;
  programs: Record<string, Program>;
  /** Дневник по датам «YYYY-MM-DD». */
  days: Record<string, DayLog>;
  sync: SyncStatus;
}

let state: State = {
  ready: false,
  bootstrapping: true,
  localStorage: false,
  meta: defaultMeta(),
  sessions: {},
  programs: {},
  days: {},
  sync: { mode: "connecting", pending: 0, lastSyncAt: null, message: null },
};

const listeners = new Set<() => void>();
/** Очередь отправки в облако. Дублируется в IndexedDB, чтобы пережить перезагрузку. */
const outbox = new Map<string, OutboxEntry>();
let onLocalChange: (() => void) | null = null;

export function getState(): State {
  return state;
}

function setState(patch: Partial<State>) {
  // Свои упражнения из профиля сразу попадают в каталог (в том числе пришедшие из облака).
  if (patch.meta?.customExercises) registerCustom(patch.meta.customExercises);
  // Граница дня из настроек: от неё зависит, в какой день идут записи после полуночи.
  if (patch.meta) setDayEndHour(patch.meta.reminders?.dayEndHour);
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Результат селектора кэшируется по (состояние, селектор): селекторы, возвращающие новые массивы,
 *  не вызывают бесконечных перерисовок. */
export function useStore<T>(selector: (s: State) => T): T {
  const cache = useRef<{ s: State | null; sel: unknown; v: T | undefined }>({ s: null, sel: null, v: undefined });
  const get = () => {
    const c = cache.current;
    if (c.s !== state || c.sel !== selector) cache.current = { s: state, sel: selector, v: selector(state) };
    return cache.current.v as T;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export function finishBootstrap() {
  if (state.bootstrapping) setState({ bootstrapping: false });
}

export function setSyncStatus(patch: Partial<SyncStatus>) {
  setState({ sync: { ...state.sync, ...patch } });
}

/** Синхронизация подписывается на локальные изменения, чтобы отправить их в облако. */
export function setLocalChangeHandler(fn: () => void) {
  onLocalChange = fn;
}

export async function loadLocal(): Promise<void> {
  const available = await idb.available();
  const [meta, sessions, programs, days, outboxList] = await Promise.all([
    idb.get<UserMeta>("meta", "meta"),
    idb.getAll<WorkoutSession>("sessions"),
    idb.getAll<Program>("programs"),
    idb.getAll<DayLog>("days"),
    idb.getAll<OutboxEntry>("outbox"),
  ]);
  outbox.clear();
  for (const e of outboxList) outbox.set(e.key, e);
  setState({
    ready: true,
    localStorage: available,
    meta: meta ? normalizeMeta(meta) : defaultMeta(),
    sessions: Object.fromEntries(sessions.map((s) => [s.id, s])),
    programs: Object.fromEntries(programs.map((p) => [p.id, p])),
    days: Object.fromEntries(days.map((d) => [d.id, d])),
    sync: { ...state.sync, pending: outboxList.length },
  });
}

async function enqueue(kind: EntityKind, id: string, updatedAt: number) {
  const key = kind === "meta" ? "meta" : `${kind}:${id}`;
  const entry: OutboxEntry = { key, kind, id, updatedAt };
  outbox.set(key, entry);
  setSyncStatus({ pending: outbox.size });
  await idb.put("outbox", entry);
  onLocalChange?.();
}

function stamp<T extends { updatedAt?: number; rev?: number }>(entity: T): T {
  // Монотонное время: две правки в одну миллисекунду не должны получить одинаковую метку.
  const now = Math.max(Date.now(), (entity.updatedAt ?? 0) + 1);
  return { ...entity, updatedAt: now, rev: (entity.rev ?? 0) + 1 };
}

// ── Запись (локальные изменения) ───────────────────────

export async function updateMeta(fn: (m: UserMeta) => UserMeta): Promise<void> {
  const next = stamp(fn(state.meta));
  setState({ meta: next });
  await idb.put("meta", next, "meta");
  await enqueue("meta", "meta", next.updatedAt);
}

export async function saveSession(session: WorkoutSession): Promise<void> {
  const next = stamp(session);
  setState({ sessions: { ...state.sessions, [next.id]: next } });
  await idb.put("sessions", next);
  await enqueue("session", next.id, next.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  const s = state.sessions[id];
  if (!s) return;
  await saveSession({ ...s, deletedAt: Date.now() });
}

export async function saveProgram(program: Program): Promise<void> {
  const next = stamp(program);
  setState({ programs: { ...state.programs, [next.id]: next } });
  await idb.put("programs", next);
  await enqueue("program", next.id, next.updatedAt!);
}

/** Изменить дневник дня (создаётся, если его ещё нет). */
export async function updateDay(id: string, fn: (d: DayLog) => DayLog): Promise<void> {
  const next = stamp(fn(state.days[id] ?? emptyDay(id)));
  setState({ days: { ...state.days, [id]: next } });
  await idb.put("days", next);
  await enqueue("day", next.id, next.updatedAt);
}

export function today(s: State = state): DayLog {
  const id = dayId();
  return s.days[id] ?? emptyDay(id);
}

// ── Применение данных извне (облако, импорт) ───────────

/** Принимает запись, если она новее локальной. Возвращает true, если локальная версия обновилась. */
export async function applyRemote(kind: EntityKind, entity: UserMeta | WorkoutSession | Program | DayLog): Promise<boolean> {
  if (kind === "day") {
    const d = entity as DayLog;
    const local = state.days[d.id];
    if (local && local.updatedAt >= d.updatedAt) return false;
    setState({ days: { ...state.days, [d.id]: d } });
    await idb.put("days", d);
    return true;
  }
  if (kind === "meta") {
    const m = entity as UserMeta;
    if (m.updatedAt <= state.meta.updatedAt) return false;
    const next = normalizeMeta(m);
    setState({ meta: next });
    await idb.put("meta", next, "meta");
    return true;
  }
  if (kind === "session") {
    const s = entity as WorkoutSession;
    const local = state.sessions[s.id];
    if (local && local.updatedAt >= s.updatedAt) return false;
    setState({ sessions: { ...state.sessions, [s.id]: s } });
    await idb.put("sessions", s);
    return true;
  }
  const p = entity as Program;
  const local = state.programs[p.id];
  if (local && (local.updatedAt ?? 0) >= (p.updatedAt ?? 0)) return false;
  setState({ programs: { ...state.programs, [p.id]: p } });
  await idb.put("programs", p);
  return true;
}

/** Ставит запись в очередь отправки без изменения (например, когда локальная версия новее облачной). */
export async function requeue(kind: EntityKind, id: string): Promise<void> {
  const e = getEntity(kind, id);
  if (!e) return;
  await enqueue(kind, id, e.updatedAt ?? 0);
}

export function outboxEntries(): OutboxEntry[] {
  return [...outbox.values()];
}

/** Убирает запись из очереди, только если с момента отправки она не менялась. */
export async function ackOutbox(entry: OutboxEntry): Promise<void> {
  const cur = outbox.get(entry.key);
  if (!cur || cur.updatedAt !== entry.updatedAt) return;
  outbox.delete(entry.key);
  setSyncStatus({ pending: outbox.size });
  await idb.delete("outbox", entry.key);
}

export function getEntity(kind: EntityKind, id: string): UserMeta | WorkoutSession | Program | DayLog | undefined {
  if (kind === "meta") return state.meta;
  if (kind === "session") return state.sessions[id];
  if (kind === "day") return state.days[id];
  return state.programs[id];
}

/**
 * Стереть историю на устройстве: тренировки и дневник (еда, вода, сон, замеры).
 * Профиль, свои программы, сохранённые блюда и настройки остаются; прогресс программы — с начала.
 */
export async function wipeHistoryLocal(): Promise<void> {
  await Promise.all([idb.clear("sessions"), idb.clear("days")]);
  for (const e of [...outbox.values()]) {
    if (e.kind === "session" || e.kind === "day") {
      outbox.delete(e.key);
      await idb.delete("outbox", e.key);
    }
  }
  setState({ sessions: {}, days: {}, sync: { ...state.sync, pending: outbox.size } });
  await updateMeta((m) => ({ ...m, enrollment: m.enrollment ? { ...m.enrollment, startedAt: Date.now(), nextDayIndex: 0, completedSessions: 0, carryOver: [] } : null }));
}

export async function resetLocal(): Promise<void> {
  await Promise.all(STORES.map((s) => idb.clear(s)));
  outbox.clear();
  setState({ meta: defaultMeta(), sessions: {}, programs: {}, days: {}, sync: { ...state.sync, pending: 0 } });
}

// ── Селекторы ──────────────────────────────────────────

/**
 * Выборка, которая пересчитывается только при смене своих входов (обычно `s.sessions`).
 * Без этого запись воды или замера пересобирала историю и рабочие веса на каждом экране.
 */
function memoOn<T>(deps: (s: State) => unknown[], fn: (s: State) => T): (s: State) => T {
  let last: unknown[] | null = null;
  let value: T;
  return (s) => {
    const d = deps(s);
    if (!last || d.length !== last.length || d.some((x, i) => x !== last![i])) {
      value = fn(s);
      last = d;
    }
    return value;
  };
}

export const liveSessions = memoOn(
  (s) => [s.sessions],
  (s) => Object.values(s.sessions).filter((x) => !x.deletedAt),
);

export function activeSession(s: State): WorkoutSession | null {
  const list = liveSessions(s).filter((x) => x.status === "active");
  return list.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

export const doneSessions = memoOn(
  (s) => [s.sessions],
  (s) => liveSessions(s)
    .filter((x) => x.status === "done")
    .sort((a, b) => b.startedAt - a.startedAt),
);

/** Рабочие веса по упражнениям. Свои упражнения тоже влияют на каталог, поэтому они во входах. */
export const liftsById = memoOn(
  (s) => [s.sessions, s.meta.customExercises],
  (s): Map<string, LiftSummary> => new Map(liftSummaries(doneSessions(s), EXERCISE_BY_ID).map((l) => [l.exerciseId, l])),
);
