import { initDB, getAllBoards, deleteBoard } from "./db.js";

const grid = document.getElementById("libraryGrid");
const emptyEl = document.getElementById("libraryEmpty");

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

  el.append(cover, body, actions);
  return el;
}

async function onDelete(board, el) {
  if (!confirm(`Delete “${board.title || "Untitled board"}”? This cannot be undone.`))
    return;
  await deleteBoard(board.id);
  el.remove();
  refreshEmpty();
}

function refreshEmpty() {
  emptyEl.hidden = grid.childElementCount > 0;
}

async function main() {
  await initDB();
  const boards = await getAllBoards();
  grid.innerHTML = "";
  for (const b of boards) grid.appendChild(buildCard(b));
  refreshEmpty();
}

main();
