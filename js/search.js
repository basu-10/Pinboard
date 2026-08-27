import { CELL, state } from "./state.js";
import { queryAll, getBlob } from "./db.js";
import * as grid from "./grid.js";
import * as editor from "./editor.js";
import * as image from "./image.js";

let panelEl, btnEl, inputEl, scopeEl, resultsEl, countEl;

// Lazily-loaded full text of every note, keyed by pin id. This reuses the same
// idea as cards.js's textCache so searching never re-reads IndexedDB per keystroke.
const textCache = new Map(); // id -> Promise<string>

const DEBOUNCE = 160;
let debounceTimer = null;

/** Load + cache a note's full text once, then serve it from memory. */
function getText(id) {
  if (!textCache.has(id)) {
    textCache.set(
      id,
      getBlob(id)
        .then((b) => (b && b.text ? b.text : ""))
        .catch(() => "")
    );
  }
  return textCache.get(id);
}

/** Invalidate cached text for a pin (call when a note is edited/saved). */
export function invalidateText(id) {
  if (id) textCache.delete(id);
  else textCache.clear();
}

export function init() {
  buildUI();
}

function buildUI() {
  btnEl = document.createElement("button");
  btnEl.type = "button";
  btnEl.className = "icon-btn search-toggle";
  btnEl.setAttribute("aria-label", "Search notes");
  btnEl.setAttribute("aria-expanded", "false");
  btnEl.title = "Search notes";
  btnEl.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M10 4a6 6 0 1 0 3.8 10.6l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>
    </svg>`;
  const tools = document.querySelector(".board-tools");
  if (tools) tools.appendChild(btnEl);
  else document.body.appendChild(btnEl);

  panelEl = document.createElement("aside");
  panelEl.className = "search-panel";
  panelEl.hidden = true;
  panelEl.setAttribute("aria-hidden", "true");
  panelEl.innerHTML = `
    <div class="search-head">
      <span class="search-title">Search notes</span>
      <button type="button" class="search-close" aria-label="Close search">&times;</button>
    </div>
    <div class="search-row">
      <input type="search" class="search-input" placeholder="Search note text…" aria-label="Search note text" />
      <select class="search-scope" aria-label="Search scope">
        <option value="both">Title &amp; body</option>
        <option value="title">Title only</option>
        <option value="body">Body only</option>
      </select>
    </div>
    <div class="search-count" hidden></div>
    <ul class="search-results" role="listbox" aria-label="Search results"></ul>`;
  document.body.appendChild(panelEl);

  inputEl = panelEl.querySelector(".search-input");
  scopeEl = panelEl.querySelector(".search-scope");
  resultsEl = panelEl.querySelector(".search-results");
  countEl = panelEl.querySelector(".search-count");

  btnEl.addEventListener("click", toggle);
  panelEl.querySelector(".search-close").addEventListener("click", close);
  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, DEBOUNCE);
  });
  scopeEl.addEventListener("change", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, DEBOUNCE);
  });
  resultsEl.addEventListener("click", onResultClick);

  // Esc closes the panel; clicking outside also closes it.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isOpen()) return;
      if (e.target.closest(".search-panel") || e.target.closest(".search-toggle")) return;
      close();
    },
    true
  );
}

function isOpen() {
  return !panelEl.hidden;
}

function open() {
  panelEl.hidden = false;
  panelEl.setAttribute("aria-hidden", "false");
  btnEl.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => panelEl.classList.add("open"));
  inputEl.focus();
  if (inputEl.value.trim()) run();
}

function close() {
  panelEl.classList.remove("open");
  btnEl.setAttribute("aria-expanded", "false");
  panelEl.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    if (!panelEl.classList.contains("open")) panelEl.hidden = true;
  }, 260);
}

function toggle() {
  isOpen() ? close() : open();
}

async function run() {
  const q = inputEl.value.trim().toLowerCase();
  const scope = scopeEl.value;
  if (!q) {
    resultsEl.innerHTML = "";
    countEl.hidden = true;
    return;
  }

  const all = await queryAll();
  const texts = await Promise.all(
    all.filter((m) => m.type === "text").map((m) => getText(m.id).then((t) => [m, t]))
  );

  const hits = [];
  for (const [m, text] of texts) {
    const title = (m.title || "").toLowerCase();
    const body = text.toLowerCase();
    let ok = false;
    if (scope === "title") ok = title.includes(q);
    else if (scope === "body") ok = body.includes(q);
    else ok = title.includes(q) || body.includes(q);
    if (!ok) continue;
    hits.push({ m, text, title: m.title || "" });
  }

  countEl.hidden = false;
  countEl.textContent = hits.length
    ? `${hits.length} match${hits.length === 1 ? "" : "es"}`
    : "No matches";
  renderResults(hits, q, scope);
}

function renderResults(hits, q, scope) {
  resultsEl.innerHTML = "";
  for (const { m, text, title } of hits) {
    const li = document.createElement("li");
    li.className = "search-result";
    li.setAttribute("role", "option");
    li.dataset.id = m.id;

    const label = title || "(untitled note)";
    const meta = document.createElement("div");
    meta.className = "search-result-title";
    meta.textContent = label;

    const sub = document.createElement("div");
    sub.className = "search-result-snippet";
    const bodyHit = scope !== "title" && text.toLowerCase().includes(q);
    sub.innerHTML = bodyHit ? snippet(text, q) : escapeHtml(title);
    if (!bodyHit && scope !== "title") sub.textContent = title;

    const loc = document.createElement("div");
    loc.className = "search-result-pos";
    loc.textContent = `col ${m.col}, row ${m.row}`;

    li.append(meta, sub, loc);
    resultsEl.appendChild(li);
  }
}

/** A short excerpt around the first match, with the term wrapped in <mark>. */
function snippet(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + q.length + 50);
  let s = (start > 0 ? "…" : "") + text.slice(start, end);
  if (end < text.length) s += "…";
  s = escapeHtml(s);
  const re = new RegExp(escapeReg(q), "gi");
  return s.replace(re, (m) => `<mark>${m}</mark>`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function onResultClick(e) {
  const li = e.target.closest(".search-result");
  if (!li) return;
  const id = li.dataset.id;
  // Re-query to guarantee fresh position data, then fly the camera to the note.
  queryAll().then((metas) => {
    const m = metas.find((x) => x.id === id);
    if (!m) return;
    const cs = m.colSpan || 1;
    const rs = m.rowSpan || 1;
    const x = m.col * CELL;
    const y = m.row * CELL;
    const w = cs * CELL;
    const h = rs * CELL;
    grid.setPan(state.viewportW / 2 - (x + w / 2), state.viewportH / 2 - (y + h / 2), true);
    if (m.type === "text") editor.open(id);
    else image.open(id);
  });
}
