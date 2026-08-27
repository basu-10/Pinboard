export const PREVIEW_MAX = 280;

const DB_NAME = "text-wall";
const DB_VERSION = 1;
const META_STORE = "meta";
const BLOB_STORE = "blobs";

let dbPromise = null;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        const meta = db.createObjectStore(META_STORE, { keyPath: "id" });
        meta.createIndex("by_rc", ["row", "col"], { unique: true });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function putCard(meta, blob) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    t.objectStore(META_STORE).put(meta);
    if (blob !== undefined && blob !== null) t.objectStore(BLOB_STORE).put(blob);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getMeta(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(META_STORE).objectStore(META_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function getBlob(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(BLOB_STORE).objectStore(BLOB_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Update only the grid geometry (colSpan/rowSpan) of an existing card.
 * Used by the interactive resize handles; keeps all other fields intact.
 */
export async function updateCardSpan(id, colSpan, rowSpan) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(META_STORE, "readwrite");
    const store = t.objectStore(META_STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const m = get.result;
      if (!m) {
        resolve();
        return;
      }
      m.colSpan = colSpan;
      m.rowSpan = rowSpan;
      store.put(m);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteCard(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    t.objectStore(META_STORE).delete(id);
    t.objectStore(BLOB_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/**
 * Windowed range query. Uses the compound `by_rc` index to fetch the
 * row-band [rowMin .. rowMax], then filters columns in JS.
 * Bounds on the first key only: [rowMin] inclusive up to [rowMax+1]
 * (the shorter array sorts below any [rowMax, col], so all of rowMax is included).
 */
export async function queryWindow(rowMin, rowMax, colMin, colMax) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound([rowMin], [rowMax + 1]);
    const out = [];
    const t = db.transaction(META_STORE);
    const cur = t.objectStore(META_STORE).index("by_rc").openCursor(range);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) {
        resolve(out);
        return;
      }
      const m = c.value;
      if (m.col >= colMin && m.col <= colMax) out.push(m);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}
