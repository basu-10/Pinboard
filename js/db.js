export const PREVIEW_MAX = 280;

import { isQuotaError, QuotaError } from "./quota.js";

const DB_NAME = "text-wall";
const DB_VERSION = 2;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
const BOARD_STORE = "boards";

let dbPromise = null;

// Normalize every write failure: a quota rejection becomes a `QuotaError` so
// callers can surface a clear, actionable message instead of a silent loss.
function rej(error) {
  return isQuotaError(error) ? new QuotaError(error) : error;
}

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
      if (!db.objectStoreNames.contains(BOARD_STORE)) {
        db.createObjectStore(BOARD_STORE, { keyPath: "id" });
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
    t.onerror = () => reject(rej(t.error));
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
 * Update only the grid geometry (colSpan/rowSpan) of an existing pin.
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
    t.onerror = () => reject(rej(t.error));
  });
}

/**
 * Update only the accent color of an existing pin.
 * Used by the editor / image viewer color picker; keeps all other fields intact.
 */
export async function updateCardColor(id, color) {
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
      m.color = color || null;
      store.put(m);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
  });
}

/**
 * Update only the grid position (row/col anchor) of an existing pin.
 * Used by drag-to-move; keeps all other fields (and span) intact.
 */
export async function updateCardPosition(id, row, col) {
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
      m.row = row;
      m.col = col;
      store.put(m);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
  });
}

/**
 * Fetch every pin's metadata (no windowing). Used by navigation to compute
 * island clusters and the minimap across the whole board.
 */
export async function queryAll() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction(META_STORE);
    const cur = t.objectStore(META_STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) {
        resolve(out);
        return;
      }
      out.push(c.value);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

export async function deleteCard(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    t.objectStore(META_STORE).delete(id);
    t.objectStore(BLOB_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
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

// ---------------------------------------------------------------------------
// Boards: saved, titled snapshots of a board (all pins + their blobs).
// ---------------------------------------------------------------------------

/** Persist a single board record (with its embedded pins array). */
export async function putBoard(board) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(BOARD_STORE, "readwrite");
    t.objectStore(BOARD_STORE).put(board);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
  });
}

export async function getBoard(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(BOARD_STORE).objectStore(BOARD_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/** Return every saved board, newest first. */
export async function getAllBoards() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction(BOARD_STORE);
    const cur = t.objectStore(BOARD_STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) {
        out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(out);
        return;
      }
      out.push(c.value);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

export async function deleteBoard(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(BOARD_STORE, "readwrite");
    t.objectStore(BOARD_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
  });
}

/**
 * Remove every pin (metadata + blob) from the live board, leaving it empty.
 * Used before restoring a board so the working board holds exactly that board.
 */
export async function clearWall() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    t.objectStore(META_STORE).clear();
    t.objectStore(BLOB_STORE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(rej(t.error));
  });
}

/**
 * Replace the entire live board with the pins stored in `board`. The board's
 * pins are written back to the meta + blob stores keyed by their original ids.
 */
export async function restoreBoard(board) {
  if (!board || !Array.isArray(board.cards)) return;
  await clearWall();
  const db = await initDB();
  for (const card of board.cards) {
      // Each board pin is authored by the same DB; reuse its raw put path.
    await new Promise((resolve, reject) => {
      const t = db.transaction([META_STORE, BLOB_STORE], "readwrite");
      t.objectStore(META_STORE).put(card.meta);
      if (card.blob) t.objectStore(BLOB_STORE).put(card.blob);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(rej(t.error));
    });
  }
}
