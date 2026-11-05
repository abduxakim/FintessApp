// Доступ к возможностям артефакта (window.claude.use). Вне claude.ai всё возвращает null,
// и приложение работает только локально.

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

const cache = new Map<string, Promise<unknown>>();

export function capability<T>(name: string): Promise<T | null> {
  if (!cache.has(name)) {
    const p = (async () => {
      try {
        if (typeof window === "undefined" || !window.claude?.use) return null;
        return (await window.claude.use(name)) ?? null;
      } catch {
        return null;
      }
    })();
    cache.set(name, p);
  }
  return cache.get(name) as Promise<T | null>;
}

// Минимальные типы используемых возможностей (полные — в контракте платформы).
export interface DbError {
  code: string;
  message: string;
}
export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface QuerySnap {
  docs: DocSnap[];
  size: number;
}
export interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
}
export interface CollectionRef extends Query {
  doc(id: string): DocRef;
}
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  collection(path: string): CollectionRef;
}
export interface Db {
  doc(path: string): DocRef;
}
export interface UserCap {
  id(): Promise<string | null>;
}
export interface DownloadsCap {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
