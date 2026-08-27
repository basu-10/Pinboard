import { initDB, getAllBoards, deleteBoard } from "./db.js";
import {
  exportBoardJSON,
  exportBoardZip,
  importBoardJSON,
} from "./backup.js";
import { initTheme, mountThemeToggle } from "./theme.js";
import * as quota from "./quota.js";

const grid = document.getElementById("libraryGrid");
const emptyEl = document.getElementById("libraryEmpty");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function cardCounts(c) {
  const t = c && c.text ? c.text : 0;
  const i = c && c.image ? c.image : 0;
  const parts = [];
  if (t) parts.push(`${t} note${t === 1 ? "" : "s"}`);
  if (i) parts.push(`${i} image${i === 1 ? "" : "s"}`);
  return parts.join(" · ") || "empty board";
}

function toast(msg, isError = false) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.color = isError ? "var(--danger)" : "";
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 2400);
}

function buildCard(board) {
  const el = document.createElement("article");
  el.className = "board-card";

  const cover = document.createElement("div");
  cover.className = "board-cover";
  if (board.cover) {
    const img = document.createElement("img");
    img.src = board.cover;
    img.alt = "";
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    cover.classList.add("board-cover--empty");
    cover.textContent = "Pinboard";
  }

  const body = document.createElement("div");
  body.className = "board-body";
  body.innerHTML = `
    <h2 class="board-name"></h2>
    <p class="board-meta"></p>`;
  body.querySelector(".board-name").textContent = board.title || "Untitled board";
  body.querySelector(".board-meta").textContent =
    `${cardCounts(board.counts)} · ${fmtDate(board.updatedAt)}`;

  const actions = document.createElement("div");
  actions.className = "board-actions";
  const open = document.createElement("a");
  open.className = "btn-accent board-open";
  open.href = `app.html?board=${encodeURIComponent(board.id)}`;
  open.textContent = "Open";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn-danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => onDelete(board, el));
  actions.append(open, del);

  const actions2 = document.createElement("div");
  actions2.className = "board-actions-2";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn-ghost";
  exportBtn.textContent = "Backup";
  exportBtn.title = "Export this board as a JSON backup (notes + images)";
  exportBtn.addEventListener("click", () => onExport(board));
  const zipBtn = document.createElement("button");
  zipBtn.type = "button";
  zipBtn.className = "btn-ghost";
  zipBtn.textContent = "Save as zip";
  zipBtn.title = "Download all cards as .txt and .png/.jpg files in a zip";
  zipBtn.addEventListener("click", () => onZip(board));
  actions2.append(exportBtn, zipBtn);

  el.append(cover, body, actions, actions2);
  return el;
}

async function onDelete(board, el) {
  if (!confirm(`Delete “${board.title || "Untitled board"}”? This cannot be undone.`))
    return;
  await deleteBoard(board.id);
  el.remove();
  refreshEmpty();
}

async function onExport(board) {
  try {
    await exportBoardJSON(board);
    toast(`Backed up “${board.title || "Untitled board"}”`);
  } catch (err) {
    console.error("Failed to export board:", err);
    toast("Could not create backup", true);
  }
}

async function onZip(board) {
  try {
    await exportBoardZip(board);
    toast(`Saved “${board.title || "Untitled board"}” as zip`);
  } catch (err) {
    console.error("Failed to export board as zip:", err);
    toast(err.message || "Could not create zip", true);
  }
}

async function onImportFile() {
  const file = importFile.files && importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    await quota.warnBeforeWrite();
    const board = await importBoardJSON(file);
    grid.prepend(buildCard(board));
    refreshEmpty();
    toast(`Imported “${board.title || "Untitled board"}”`);
  } catch (err) {
    if (!quota.reportWriteError(err)) {
      console.error("Failed to import board:", err);
      toast(err.message || "Import failed", true);
    }
  }
}

function refreshEmpty() {
  emptyEl.hidden = grid.childElementCount > 0;
}

async function main() {
  initTheme();
  mountThemeToggle(document.getElementById("themeToggle"));
  quota.installGlobalGuard();

  await initDB();
  const boards = await getAllBoards();
  grid.innerHTML = "";
  for (const b of boards) grid.appendChild(buildCard(b));
  refreshEmpty();

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", onImportFile);
}

main();
