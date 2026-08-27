import { CELL, state } from "./state.js";
import { queryWindow, PREVIEW_MAX, updateCardSpan } from "./db.js";
import { didPan } from "./grid.js";
import * as editor from "./editor.js";
import * as image from "./image.js";

let worldEl = null;
let cellAddEl = null;
let cardsLayer = null;
let viewportEl = null;
let handlers = null;

const rendered = new Map(); // id -> element
let occupied = new Set(); // "row,col" — every cell covered by any card
let occupiedRects = []; // { id, r0, c0, r1, c1 } — for overlap checks
let lastWindow = null;
let hoverCell = null;

const MAX_SPAN = 64; // hard cap on either dimension
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function init(world, cellAdd, h) {
  worldEl = world;
  cellAddEl = cellAdd;
  handlers = h;
  viewportEl = world.parentElement;

  cardsLayer = document.createElement("div");
  cardsLayer.className = "cards-layer";
  worldEl.appendChild(cardsLayer);

  cellAddEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !hoverCell) return;
    const { row, col } = hoverCell;
    hideAdd();
    if (btn.dataset.type === "note") handlers.openNote(row, col);
    else handlers.openImage(row, col);
  });

  viewportEl.addEventListener("pointermove", onHover);
  viewportEl.addEventListener("pointerleave", hideAdd);
  // left-click on empty space dismisses any open resize handles
  viewportEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".card")) return;
    for (const [, el] of rendered) el.classList.remove("card-resize");
  });
}

export function renderCurrent() {
  if (lastWindow) render(lastWindow);
}

export async function render(w) {
  lastWindow = w;
  const metas = await queryWindow(w.rowMin, w.rowMax, w.colMin, w.colMax);

  occupied = new Set();
  occupiedRects = [];
  const needed = new Set();
  for (const m of metas) {
    needed.add(m.id);
    const cs = m.colSpan || 1;
    const rs = m.rowSpan || 1;
    const r1 = m.row + rs - 1;
    const c1 = m.col + cs - 1;
    occupiedRects.push({ id: m.id, r0: m.row, c0: m.col, r1, c1 });
    for (let r = m.row; r <= r1; r++) {
      for (let c = m.col; c <= c1; c++) occupied.add(`${r},${c}`);
    }
  }

  for (const [id, el] of rendered) {
    if (!needed.has(id)) {
      el.remove();
      rendered.delete(id);
    }
  }

  for (const m of metas) {
    let el = rendered.get(m.id);
    if (!el) {
      el = createCard(m);
      rendered.set(m.id, el);
      cardsLayer.appendChild(el);
    }
    updateCard(el, m);
  }
}

function createCard(m) {
  const el = document.createElement("div");
  el.className = `card card-${m.type}`;
  el.dataset.id = m.id;
  el.dataset.type = m.type;

  el.addEventListener("click", () => {
    if (didPan()) return; // swallow click that ended a pan
    if (m.type === "text") handlers.openCard(m.id, "text");
    else handlers.openCard(m.id, "image");
  });

  // right-click toggles interactive resize handles for this card
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const active = el.classList.contains("card-resize");
    for (const [, c] of rendered) c.classList.remove("card-resize");
    if (!active) el.classList.add("card-resize");
  });

  // resize handles: east (width), south (height), south-east (both)
  const handles = [
    { cls: "rh-r", mode: "e" },
    { cls: "rh-b", mode: "s" },
    { cls: "rh-c", mode: "se" },
  ];
  for (const h of handles) {
    const handle = document.createElement("div");
    handle.className = `rh ${h.cls}`;
    handle.dataset.mode = h.mode;
    handle.addEventListener("pointerdown", onHandleDown);
    handle.addEventListener("click", (e) => e.stopPropagation());
    el.appendChild(handle);
  }

  return el;
}

function clearCardContent(el) {
  // remove body/meta but keep the resize handles (they carry .rh)
  for (const child of [...el.children]) {
    if (!child.classList.contains("rh")) child.remove();
  }
}

function updateCard(el, m) {
  const cs = m.colSpan || 1;
  const rs = m.rowSpan || 1;
  el._card = { id: m.id, row: m.row, col: m.col, colSpan: cs, rowSpan: rs };

  el.style.left = `${m.col * CELL + 8}px`;
  el.style.top = `${m.row * CELL + 8}px`;
  el.style.width = `${cs * CELL - 16}px`;
  el.style.height = `${rs * CELL - 16}px`;

  if (m.type === "text") {
    clearCardContent(el);
    const body = document.createElement("div");
    body.className = "card-body";
    body.textContent = m.preview || "";
    const meta = document.createElement("div");
    meta.className = "card-meta";
    if (m.charCount > PREVIEW_MAX) {
      meta.textContent = `… ${m.charCount - PREVIEW_MAX} more`;
    } else {
      meta.textContent = m.title || "";
    }
    el.append(body, meta);
  } else {
    clearCardContent(el);
    const img = document.createElement("img");
    img.className = "card-thumb";
    img.src = m.thumb || "";
    img.alt = m.title || "image";
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = m.title || "image";
    el.append(img, meta);
  }
}

function onHover(e) {
  if (viewportEl.classList.contains("grabbing")) {
    hideAdd();
    return;
  }
  if (e.target.closest(".card")) {
    hideAdd();
    return;
  }

  const rect = viewportEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const wx = x - state.panX;
  const wy = y - state.panY;
  const col = Math.floor(wx / CELL);
  const row = Math.floor(wy / CELL);

  if (occupied.has(`${row},${col}`)) {
    hideAdd();
    return;
  }

  hoverCell = { row, col };
  cellAddEl.style.left = `${state.panX + col * CELL + 8}px`;
  cellAddEl.style.top = `${state.panY + row * CELL + 8}px`;
  cellAddEl.hidden = false;
}

export function hideAdd() {
  cellAddEl.hidden = true;
  hoverCell = null;
}

/** Max colSpan (>=1) for `card` given its row span, without overlapping another card. */
function maxColSpan(card, rowSpan) {
  let max = MAX_SPAN;
  const r0 = card.row;
  const r1 = card.row + rowSpan - 1;
  for (const o of occupiedRects) {
    if (o.id === card.id) continue;
    if (o.r0 <= r1 && o.r1 >= r0) {
      const gap = o.c0 - card.col; // free columns to the right before o
      if (gap > 0) max = Math.min(max, gap);
    }
  }
  return Math.max(1, max);
}

/** Max rowSpan (>=1) for `card` given its col span, without overlapping another card. */
function maxRowSpan(card, colSpan) {
  let max = MAX_SPAN;
  const c0 = card.col;
  const c1 = card.col + colSpan - 1;
  for (const o of occupiedRects) {
    if (o.id === card.id) continue;
    if (o.c0 <= c1 && o.c1 >= c0) {
      const gap = o.r0 - card.row; // free rows below before o
      if (gap > 0) max = Math.min(max, gap);
    }
  }
  return Math.max(1, max);
}

/** Desired span for the pointer's screen position, snapped to whole grid cells. */
function screenToSpan(card, px, py) {
  const sCol = Math.round((px - state.panX - card.col * CELL + 8) / CELL);
  const sRow = Math.round((py - state.panY - card.row * CELL + 8) / CELL);
  return { sCol, sRow };
}

function onHandleDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const mode = handle.dataset.mode;
  const el = handle.parentElement;
  const card = el._card;
  if (!card) return;

  const startCS = card.colSpan;
  const startRS = card.rowSpan;

  try {
    el.setPointerCapture(e.pointerId);
  } catch (_) {
    /* ignore */
  }

  const move = (ev) => {
    const { sCol, sRow } = screenToSpan(card, ev.clientX, ev.clientY);
    let cs = startCS;
    let rs = startRS;
    if (mode === "e" || mode === "se") cs = clamp(sCol, 1, maxColSpan(card, startRS));
    if (mode === "s" || mode === "se") rs = clamp(sRow, 1, maxRowSpan(card, startCS));
    el.style.width = `${cs * CELL - 16}px`;
    el.style.height = `${rs * CELL - 16}px`;
    card.colSpan = cs;
    card.rowSpan = rs;
  };

  const up = async () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    if (card.colSpan !== startCS || card.rowSpan !== startRS) {
      await updateCardSpan(card.id, card.colSpan, card.rowSpan);
      if (handlers.onResize) handlers.onResize(card.id, card.colSpan, card.rowSpan);
    }
  };

  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}
