import { state, CELL } from "./state.js";
import * as grid from "./grid.js";
import { queryAll } from "./db.js";

// Cards within this many empty cells (in either axis) are considered part of
// the same island. 0 = only touching/adjacent cards; raise to merge looser
// clusters. This is the single knob that decides "how tight is a group".
const ISLAND_GAP = 1;

let islands = []; // [{ x, y, w, h, cx, cy, count }] in world px, spatial order
let currentIndex = -1; // last island framed via prev/next/minimap

let navBar, prevBtn, nextBtn, countEl;
let minimap, mmCanvas, mmTotal;
let pillEl;
let mmRects = []; // island rect elements, parallel to `islands`
let vpRect = null; // viewport indicator element
let lastMap = null; // { b, scale, offX, offY } for click-to-world

export async function init() {
  buildUI();
  grid.subscribe(onCamera);
  await recompute();
}

/** Recompute island clusters from the database and refresh all UI. */
export async function recompute() {
  await computeIslands();
  rebuildMinimapDom();
  renderNav();
}

// ---------------------------------------------------------------------------
// Island computation
// ---------------------------------------------------------------------------

async function computeIslands() {
  const all = await queryAll();
  const rects = all.map((m) => ({
    c0: m.col,
    r0: m.row,
    c1: m.col + (m.colSpan || 1) - 1,
    r1: m.row + (m.rowSpan || 1) - 1,
  }));

  const parent = rects.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (near(rects[i], rects[j])) union(i, j);
    }
  }

  const groups = new Map();
  rects.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  });

  const list = [...groups.values()].map((g) => {
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (const r of g) {
      minC = Math.min(minC, r.c0);
      minR = Math.min(minR, r.r0);
      maxC = Math.max(maxC, r.c1);
      maxR = Math.max(maxR, r.r1);
    }
    const x = minC * CELL;
    const y = minR * CELL;
    const w = (maxC - minC + 1) * CELL;
    const h = (maxR - minR + 1) * CELL;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, count: g.length };
  });

  list.sort((a, b) => a.y - b.y || a.x - b.x);
  islands = list;
  currentIndex = currentIndex < list.length ? currentIndex : -1;
}

/** Two grid rects are neighbours when within ISLAND_GAP cells on both axes. */
function near(a, b) {
  const g = ISLAND_GAP;
  return (
    a.c0 - g <= b.c1 &&
    b.c0 - g <= a.c1 &&
    a.r0 - g <= b.r1 &&
    b.r0 - g <= a.r1
  );
}

// ---------------------------------------------------------------------------
// Framing / navigation
// ---------------------------------------------------------------------------

/** Center a world-px rect in the viewport with an eased pan. */
function frameWorldRect(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const panX = state.viewportW / 2 - cx;
  const panY = state.viewportH / 2 - cy;
  grid.setPan(panX, panY, true);
}

function frameIsland(i) {
  const isl = islands[i];
  if (!isl) return;
  currentIndex = i;
  frameWorldRect(isl.x, isl.y, isl.w, isl.h);
  renderNav();
}

function step(dir) {
  if (!islands.length) return;
  let idx = currentIndex;
  if (idx < 0) idx = dir > 0 ? -1 : islands.length;
  idx = (idx + dir) % islands.length;
  if (idx < 0) idx += islands.length;
  frameIsland(idx);
}

// ---------------------------------------------------------------------------
// Lost detection
// ---------------------------------------------------------------------------

function visibleWorldRect() {
  return {
    x: -state.panX,
    y: -state.panY,
    w: state.viewportW,
    h: state.viewportH,
  };
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

function rectDistance(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

function isLost() {
  if (!islands.length) return false;
  const v = visibleWorldRect();
  return !islands.some((i) => rectsOverlap(v, i));
}

function nearestIslandIndex() {
  const v = visibleWorldRect();
  let best = -1;
  let bestD = Infinity;
  islands.forEach((i, idx) => {
    const d = rectDistance(v, i);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

function worldBounds() {
  const v = visibleWorldRect();
  let minX = v.x, minY = v.y, maxX = v.x + v.w, maxY = v.y + v.h;
  for (const i of islands) {
    minX = Math.min(minX, i.x);
    minY = Math.min(minY, i.y);
    maxX = Math.max(maxX, i.x + i.w);
    maxY = Math.max(maxY, i.y + i.h);
  }
  const padX = (maxX - minX) * 0.08 + CELL * 0.5;
  const padY = (maxY - minY) * 0.08 + CELL * 0.5;
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

function rebuildMinimapDom() {
  if (!mmCanvas) return;
  mmCanvas.innerHTML = "";
  mmRects = [];
  islands.forEach((_, idx) => {
    const el = document.createElement("div");
    el.className = "mm-island";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      frameIsland(idx);
    });
    mmCanvas.appendChild(el);
    mmRects.push(el);
  });
  vpRect = document.createElement("div");
  vpRect.className = "mm-view";
  mmCanvas.appendChild(vpRect);
  updateMinimap();
}

function updateMinimap() {
  if (!mmCanvas) return;
  const mmW = mmCanvas.clientWidth;
  const mmH = mmCanvas.clientHeight;
  if (!mmW || !mmH) return;

  const b = worldBounds();
  const cw = Math.max(1, b.maxX - b.minX);
  const ch = Math.max(1, b.maxY - b.minY);
  const scale = Math.min(mmW / cw, mmH / ch);
  const offX = (mmW - cw * scale) / 2;
  const offY = (mmH - ch * scale) / 2;
  lastMap = { b, scale, offX, offY };

  islands.forEach((i, idx) => {
    const el = mmRects[idx];
    if (!el) return;
    el.style.left = `${(i.x - b.minX) * scale + offX}px`;
    el.style.top = `${(i.y - b.minY) * scale + offY}px`;
    el.style.width = `${Math.max(2, i.w * scale)}px`;
    el.style.height = `${Math.max(2, i.h * scale)}px`;
    el.classList.toggle("current", idx === currentIndex);
  });

  const v = visibleWorldRect();
  vpRect.style.left = `${(v.x - b.minX) * scale + offX}px`;
  vpRect.style.top = `${(v.y - b.minY) * scale + offY}px`;
  vpRect.style.width = `${Math.max(2, v.w * scale)}px`;
  vpRect.style.height = `${Math.max(2, v.h * scale)}px`;

  if (pillEl) pillEl.hidden = !isLost() || islands.length === 0;
}

function onMinimapClick(e) {
  if (!lastMap || !islands.length) return;
  const rect = mmCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { b, scale, offX, offY } = lastMap;
  const wx = b.minX + (mx - offX) / scale;
  const wy = b.minY + (my - offY) / scale;
  const idx = islandIndexAt(wx, wy);
  frameIsland(idx >= 0 ? idx : nearestIslandToPoint(wx, wy));
}

function islandIndexAt(wx, wy) {
  for (let i = 0; i < islands.length; i++) {
    const isl = islands[i];
    if (wx >= isl.x && wx <= isl.x + isl.w && wy >= isl.y && wy <= isl.y + isl.h)
      return i;
  }
  return -1;
}

function nearestIslandToPoint(wx, wy) {
  let best = -1;
  let bestD = Infinity;
  islands.forEach((i, idx) => {
    const d = Math.hypot(wx - (i.x + i.w / 2), wy - (i.y + i.h / 2));
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function buildUI() {
  navBar = document.createElement("div");
  navBar.className = "nav-bar";
  navBar.innerHTML = `
    <button type="button" class="nav-prev" aria-label="Previous group">&lsaquo;</button>
    <span class="nav-count" aria-live="polite">&ndash; / &ndash;</span>
    <button type="button" class="nav-next" aria-label="Next group">&rsaquo;</button>`;
  document.body.appendChild(navBar);
  prevBtn = navBar.querySelector(".nav-prev");
  nextBtn = navBar.querySelector(".nav-next");
  countEl = navBar.querySelector(".nav-count");
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));

  minimap = document.createElement("div");
  minimap.className = "minimap";
  minimap.innerHTML = `
    <div class="minimap-head">Groups <span class="minimap-total"></span></div>
    <div class="minimap-canvas"></div>`;
  document.body.appendChild(minimap);
  mmCanvas = minimap.querySelector(".minimap-canvas");
  mmTotal = minimap.querySelector(".minimap-total");
  mmCanvas.addEventListener("click", onMinimapClick);

  pillEl = document.createElement("button");
  pillEl.type = "button";
  pillEl.className = "lost-pill";
  pillEl.hidden = true;
  pillEl.textContent = "Return to content";
  document.body.appendChild(pillEl);
  pillEl.addEventListener("click", () => {
    const idx = nearestIslandIndex();
    if (idx >= 0) frameIsland(idx);
  });
}

function renderNav() {
  if (countEl)
    countEl.textContent = islands.length
      ? `${currentIndex + 1} / ${islands.length}`
      : "– / –";
  if (mmTotal)
    mmTotal.textContent = islands.length ? `(${islands.length})` : "";
}

function onCamera() {
  if (mmCanvas) updateMinimap();
}
