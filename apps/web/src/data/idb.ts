// Тонкая обёртка над IndexedDB. Если хранилище недоступно (приватный режим, предпросмотр),
// все операции становятся no-op, а данные живут в памяти и в облаке.

const DB_NAME = "fitness-app";
const VERSION = 1;
export const STORES = ["meta", "sessions", "programs", "outbox", "kv"] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Версия 1. Будущие миграции — новые ветки по oldVersion.
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
        if (!db.objectStoreNames.contains("programs")) db.createObjectStore("programs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "key" });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          tx.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idb = {
  available: async () => (await open()) !== null,
  get: <T>(store: StoreName, key: IDBValidKey) => run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>),
  getAll: async <T>(store: StoreName) => ((await run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>)) ?? []) as T[],
  put: (store: StoreName, value: unknown, key?: IDBValidKey) => run(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  delete: (store: StoreName, key: IDBValidKey) => run(store, "readwrite", (s) => s.delete(key)),
  clear: (store: StoreName) => run(store, "readwrite", (s) => s.clear()),
};
