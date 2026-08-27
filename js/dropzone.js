import { CELL, state } from "./state.js";
import * as cards from "./cards.js";
import * as image from "./image.js";
import * as editor from "./editor.js";
import * as quota from "./quota.js";

let viewportEl = null;
let dropHintEl = null;
let overlay = null; // force-decode error modal
let errorMsgEl = null;
let fileNameEl = null;
let fileMetaEl = null;
let closeBtn = null;

// dragenter/dragleave both fire for child elements, so track a depth counter
// to know when the cursor has truly left the viewport.
let dragDepth = 0;
let currentCell = null;

// Pending force-decode errors discovered while importing a drop batch.
const errorQueue = [];
let pending = null; // the file/row/col currently shown in the modal

const hasFiles = (e) =>
  e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

/* ----------------------------------------------------------------------- */
/* init                                                                    */
/* ----------------------------------------------------------------------- */

export function init(vp) {
  viewportEl = vp;
  buildHint();
  buildErrorModal();

  // Prevent the browser from navigating away / opening a file dropped
  // anywhere outside our board (e.g. on the top bar).
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });

  viewportEl.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    showHint();
  });

  viewportEl.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const cell = cellFromEvent(e);
    if (cell) {
      currentCell = cell;
      positionHint(cell);
    }
  });

  viewportEl.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideHint();
  });

  viewportEl.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    hideHint();
    const cell = currentCell || cellFromEvent(e);
    currentCell = null;
    if (!cell) return;
    importFiles(Array.from(e.dataTransfer.files || []), cell.row, cell.col);
  });
}

/* ----------------------------------------------------------------------- */
/* geometry                                                                */
/* ----------------------------------------------------------------------- */

function cellFromEvent(e) {
  const rect = viewportEl.getBoundingClientRect();
  const wx = e.clientX - rect.left - state.panX;
  const wy = e.clientY - rect.top - state.panY;
  if (wx < 0 || wy < 0) return null;
  return { row: Math.floor(wy / CELL), col: Math.floor(wx / CELL) };
}

/** First free cell at/around (row,col), accounting for a batch of drops. */
function freeCell(row, col, used) {
  const key = (r, c) => `${r},${c}`;
  if (cards.isCellFree(row, col) && !used.has(key(row, col))) {
    return { row, col };
  }
  const R = 16;
  for (let radius = 1; radius <= R; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const r = row + dr;
        const c = col + dc;
        if (cards.isCellFree(r, c) && !used.has(key(r, c))) {
          return { row: r, col: c };
        }
      }
    }
  }
  return { row, col };
}

/* ----------------------------------------------------------------------- */
/* import                                                                  */
/* ----------------------------------------------------------------------- */

async function importFiles(files, row, col) {
  if (!files.length) return;
  await quota.warnBeforeWrite();
  const used = new Set();
  for (const file of files) {
    const target = freeCell(row, col, used);
    used.add(`${target.row},${target.col}`);
    await importOne(file, target.row, target.col);
  }
  showNextError();
}

async function importOne(file, row, col) {
  try {
    if (file.type.startsWith("image/")) {
      await image.createFromBlob(file, row, col, { open: false });
      return;
    }
    const text = await readText(file);
    await editor.createFromText(text, row, col);
  } catch (err) {
    if (quota.isQuotaError(err) || err instanceof quota.QuotaError) {
      quota.showQuotaError();
      return;
    }
    errorQueue.push({ file, row, col, info: classifyError(err, file) });
  }
}

/**
 * Read a file as UTF-8 text, rejecting with a friendly error when the bytes
 * look binary (lots of U+FFFD replacement characters). Huge files are capped
 * with a trailing note so the board stays responsive.
 */
async function readText(file, { force = false } = {}) {
  const MAX = 25 * 1024 * 1024;
  const slice = file.slice(0, MAX);
  const buf = await slice.arrayBuffer();
  const dec = new TextDecoder("utf-8", { fatal: false });
  const text = dec.decode(buf);

  if (!force) {
    let bad = 0;
    const step = Math.max(1, Math.floor(text.length / 2000));
    for (let i = 0; i < text.length; i += step) {
      if (text.charCodeAt(i) === 0xfffd) bad++;
    }
    const sampled = Math.ceil(text.length / step);
    if (sampled > 0 && bad / sampled > 0.05) {
      throw new Error("This file contains binary data, so it can't be read as text.");
    }
  }

  if (file.size > MAX) {
    return (
      text +
      `\n\n… (file truncated at ${Math.round(MAX / 1024 / 1024)} MB of ` +
      `${Math.round(file.size / 1024 / 1024)} MB)`
    );
  }
  return text;
}

function classifyError(err, file) {
  const msg = (err && err.message) || "The file could not be read.";
  return `${msg} (${file.name})`;
}

/* ----------------------------------------------------------------------- */
/* drop hint                                                               */
/* ----------------------------------------------------------------------- */

function buildHint() {
  dropHintEl = document.createElement("div");
  dropHintEl.className = "drop-cell";
  dropHintEl.hidden = true;
  viewportEl.appendChild(dropHintEl);
}

function showHint() {
  dropHintEl.hidden = false;
}

function hideHint() {
  dropHintEl.hidden = true;
}

function positionHint(cell) {
  const inset = 4;
  dropHintEl.style.left = `${state.panX + cell.col * CELL + inset}px`;
  dropHintEl.style.top = `${state.panY + cell.row * CELL + inset}px`;
  dropHintEl.style.width = `${CELL - inset * 2}px`;
  dropHintEl.style.height = `${CELL - inset * 2}px`;
}

/* ----------------------------------------------------------------------- */
/* force-decode error modal                                                */
/* ----------------------------------------------------------------------- */

function buildErrorModal() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay drop-error-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal drop-error" role="dialog" aria-modal="true" aria-labelledby="dropErrTitle">
      <header class="modal-head">
        <span class="modal-title" id="dropErrTitle">Can't read that file</span>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </header>
      <p class="drop-error-msg"></p>
      <div class="drop-error-file">
        <span class="name"></span>
        <span class="meta"></span>
      </div>
      <p class="drop-error-help">How would you like to decode it?</p>
      <div class="drop-options">
        <button class="drop-opt" type="button" data-act="text">
          <span class="drop-opt-title">Force as text</span>
          <span class="drop-opt-info">Read the raw bytes as UTF-8. Works for .txt, .md, .csv, .json, code &amp; logs. Binary files may show gibberish.</span>
        </button>
        <button class="drop-opt" type="button" data-act="image">
          <span class="drop-opt-title">Force as image</span>
          <span class="drop-opt-info">Try to render the file as an image (PNG/JPG/WEBP/GIF). Only works if the file really is an image.</span>
        </button>
      </div>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button class="btn-ghost" type="button" data-act="cancel">Cancel</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  errorMsgEl = overlay.querySelector(".drop-error-msg");
  fileNameEl = overlay.querySelector(".drop-error-file .name");
  fileMetaEl = overlay.querySelector(".drop-error-file .meta");
  closeBtn = overlay.querySelector(".modal-close");

  closeBtn.addEventListener("click", () => dismissError());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismissError();
  });
  overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => dismissError());
  overlay.querySelectorAll(".drop-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "text") forceText();
      else if (act === "image") forceImage();
    });
  });
}

function showNextError() {
  if (overlay.hidden === false) return; // already open; queue waits
  const next = errorQueue.shift();
  if (!next) return;
  pending = next;
  errorMsgEl.textContent = next.info;
  fileNameEl.textContent = next.file.name;
  const sizeKb = next.file.size / 1024;
  fileMetaEl.textContent =
    (next.file.type || "unknown type") +
    " · " +
    (sizeKb >= 1024
      ? `${(sizeKb / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(sizeKb))} KB`);
  overlay.hidden = false;
}

function dismissError() {
  overlay.hidden = true;
  pending = null;
  if (errorQueue.length) showNextError();
}

async function forceText() {
  if (!pending) return;
  const { file, row, col } = pending;
  try {
    const text = await readText(file, { force: true });
    await editor.createFromText(text, row, col);
    overlay.hidden = true;
    pending = null;
    if (errorQueue.length) showNextError();
  } catch (err) {
    errorMsgEl.textContent =
      "Still couldn't read it as text: " + ((err && err.message) || "unknown error");
  }
}

async function forceImage() {
  if (!pending) return;
  const { file, row, col } = pending;
  try {
    await image.createFromBlob(file, row, col, { open: false });
    overlay.hidden = true;
    pending = null;
    if (errorQueue.length) showNextError();
  } catch (err) {
    errorMsgEl.textContent =
      "Still couldn't load it as an image: " + ((err && err.message) || "unknown error");
  }
}
