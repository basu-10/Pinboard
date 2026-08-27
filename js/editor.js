import { PREVIEW_MAX, putCard, deleteCard, getMeta, getBlob } from "./db.js";
import * as history from "./history.js";

let onChange = () => {};
let overlay = null;
let ta = null;
let info = null;
let current = null; // { id, row, col, isNew }

export function init(opts) {
  onChange = opts.onChange;
  build();
}

function uuid() {
  return crypto.randomUUID();
}

function firstLine(text) {
  const l = text.trim().split("\n")[0] || "";
  return l.slice(0, 60);
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal editor" role="dialog" aria-modal="true">
      <header class="modal-head">
        <span class="modal-title">Note</span>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </header>
      <p class="editor-info"></p>
      <textarea class="editor-area" placeholder="Write your note…"></textarea>
      <footer class="modal-foot">
        <button class="btn-danger" type="button" data-act="delete">Delete</button>
        <span class="spacer"></span>
        <button class="btn-ghost" type="button" data-act="cancel">Cancel</button>
        <button class="btn-accent" type="button" data-act="save">Save</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  ta = overlay.querySelector(".editor-area");
  info = overlay.querySelector(".editor-info");

  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);
  overlay.querySelector('[data-act="save"]').addEventListener("click", save);
  overlay.querySelector('[data-act="delete"]').addEventListener("click", remove);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

export function openNew(row, col) {
  current = { id: uuid(), row, col, rowSpan: 1, colSpan: 1, isNew: true };
  ta.value = "";
  info.textContent = `Preview shows the first ${PREVIEW_MAX} characters on the board.`;
  show();
  ta.focus();
}

/** Create a note pin directly from text (skips the editor dialog). */
export async function createFromText(text, row, col) {
  const id = uuid();
  const charCount = text.length;
  const meta = {
    id,
    row,
    col,
    rowSpan: 1,
    colSpan: 1,
    type: "text",
    title: firstLine(text),
    preview: text.slice(0, PREVIEW_MAX),
    charCount,
    thumb: "",
    updatedAt: Date.now(),
  };
  await putCard(meta, { id, text });
  history.recordAddCard(meta, { id, text });
  onChange(id);
}

export async function open(id) {
  const meta = await getMeta(id);
  if (!meta) return;
  const blob = await getBlob(id);
  current = {
    id,
    row: meta.row,
    col: meta.col,
    rowSpan: meta.rowSpan || 1,
    colSpan: meta.colSpan || 1,
    isNew: false,
    oldMeta: meta,
    oldBlob: blob,
  };
  ta.value = blob ? blob.text : "";
  updateInfo(meta.charCount || 0);
  show();
  ta.focus();
}

function updateInfo(charCount) {
  const cut = Math.max(0, charCount - PREVIEW_MAX);
  info.textContent =
    cut > 0
      ? `Preview shows first ${PREVIEW_MAX} of ${charCount} chars (${cut} hidden on the board).`
      : `Preview shows all ${charCount} chars.`;
}

async function save() {
  if (!current) return;
  const id = current.id;
  const text = ta.value;
  const charCount = text.length;
  const meta = {
    id: current.id,
    row: current.row,
    col: current.col,
    rowSpan: current.rowSpan || 1,
    colSpan: current.colSpan || 1,
    type: "text",
    title: firstLine(text),
    preview: text.slice(0, PREVIEW_MAX),
    charCount,
    thumb: "",
    updatedAt: Date.now(),
  };
  const blob = { id, text };
  await putCard(meta, blob);
  if (current.isNew) {
    history.recordAddCard(meta, blob);
  } else {
    history.recordEditCard(current.oldMeta, current.oldBlob, meta, blob);
  }
  close();
  onChange(id);
}

async function remove() {
  if (!current) return;
  const id = current.id;
  if (current.isNew) {
    close();
    return;
  }
  const meta = current.oldMeta;
  const blob = current.oldBlob;
  await deleteCard(id);
  history.recordDeleteCard(meta, blob);
  close();
  onChange(id);
}

function show() {
  overlay.hidden = false;
}

function close() {
  overlay.hidden = true;
  current = null;
}
