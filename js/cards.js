import { CELL, state } from "./state.js";
import { queryWindow, PREVIEW_MAX } from "./db.js";
import { didPan } from "./grid.js";
import * as editor from "./editor.js";
import * as image from "./image.js";

let worldEl = null;
let cellAddEl = null;
let cardsLayer = null;
let viewportEl = null;
let handlers = null;

const rendered = new Map(); // id -> element
let occupied = new Set(); // "row,col"
let lastWindow = null;
let hoverCell = null;

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
}

export function renderCurrent() {
  if (lastWindow) render(lastWindow);
}

export async function render(w) {
  lastWindow = w;
  const metas = await queryWindow(w.rowMin, w.rowMax, w.colMin, w.colMax);

  occupied = new Set();
  const needed = new Set();
  for (const m of metas) {
    needed.add(m.id);
    occupied.add(`${m.row},${m.col}`);
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
  el.style.left = `${m.col * CELL + 8}px`;
  el.style.top = `${m.row * CELL + 8}px`;
  el.dataset.id = m.id;
  el.dataset.type = m.type;

  el.addEventListener("click", () => {
    if (didPan()) return; // swallow click that ended a pan
    if (m.type === "text") handlers.openCard(m.id, "text");
    else handlers.openCard(m.id, "image");
  });

  return el;
}

function updateCard(el, m) {
  if (m.type === "text") {
    el.innerHTML = "";
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
    el.innerHTML = "";
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
