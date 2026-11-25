/** Tiny promise-based IndexedDB key-value store (manifest cache, remembered keys). */

const DB_NAME = 'kdrive'
const STORE = 'kv'
let dbPromise: Promise<IDBDatabase> | null = null

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await db()
  return new Promise<T>((resolve, reject) => {
    const req = fn(database.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idb = {
  get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).catch(() => undefined),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).catch(() => undefined),
}
