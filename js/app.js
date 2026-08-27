import { initDB, queryAll, getBlob, putBoard, getBoard, restoreBoard } from "./db.js";
import * as state from "./state.js";
import * as grid from "./grid.js";
import * as cards from "./cards.js";
import * as editor from "./editor.js";
import * as image from "./image.js";
import * as nav from "./nav.js";
import * as history from "./history.js";

async function pasteAt(row, col) {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    console.error("Clipboard read API is not available in this browser.");
    return;
  }

  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (err) {
    console.error("Failed to read from clipboard:", err);
    return;
  }

  if (!items || items.length === 0) {
    console.error("Clipboard is empty; nothing to paste.");
    return;
  }

  for (const item of items) {
    const type = (item.types || []).find((t) => t.startsWith("image/"));
    if (type) {
      try {
        const blob = await item.getType(type);
        image.pasteFile(blob, row, col);
      } catch (err) {
        console.error("Failed to read image from clipboard:", err);
      }
      return;
    }
  }

  for (const item of items) {
    const type = (item.types || []).find((t) => t === "text/plain");
    if (type) {
      try {
        const blob = await item.getType(type);
        const text = await blob.text();
        if (!text) {
          console.error("Clipboard text is empty; nothing to paste.");
          return;
        }
        await editor.createFromText(text, row, col);
      } catch (err) {
        console.error("Failed to read text from clipboard:", err);
      }
      return;
    }
  }

  console.error("Clipboard contains no image or text that can be pasted.");
}

const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const cellAdd = document.getElementById("cellAdd");
const boardTitle = document.getElementById("boardTitle");
const saveBoardBtn = document.getElementById("saveBoard");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 2200);
}

/** Snapshot the current board into a titled library board and store it. */
async function saveCurrentBoard() {
  const all = await queryAll();
  const cardsData = [];
  let cover = null;
  let textCount = 0;
  let imageCount = 0;
  for (const meta of all) {
    if (meta.type === "image") {
      imageCount++;
      if (!cover && meta.thumb) cover = meta.thumb;
    } else {
      textCount++;
    }
    const blob = await getBlob(meta.id);
    cardsData.push({ meta, blob: blob || null });
  }

  const title = (boardTitle.value || "").trim() || "Untitled board";
  const now = Date.now();
  const board = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    cover,
    counts: { text: textCount, image: imageCount },
    cards: cardsData,
  };
  await putBoard(board);
  toast(`Saved “${title}” to library`);
}

/** If the URL carries ?board=<id>, load that saved board into the current board. */
async function maybeRestoreFromUrl() {
  const id = new URLSearchParams(location.search).get("board");
  if (!id) return;
  const board = await getBoard(id);
  if (!board) {
    toast("That board could not be found");
    return;
  }
  const ok =
    (await queryAll()).length === 0 ||
    confirm(
      "Open this board? It will replace the pins currently on your board."
    );
  if (!ok) return;
  await restoreBoard(board);
  if (board.title) boardTitle.value = board.title;
  toast(`Opened “${board.title}”`);
}

async function main() {
  await initDB();
  await maybeRestoreFromUrl();

  const onChange = (id) => {
    if (id) {
      cards.invalidateCache(id);
      image.invalidateCache(id);
    }
    cards.renderCurrent();
    nav.recompute();
  };

  history.initHistory({ onChange });
  history.setHistoryButtons(undoBtn, redoBtn);

  editor.init({ onChange });
  image.init({ onChange });

  cards.init(world, cellAdd, {
    openNote: (row, col) => editor.openNew(row, col),
    openImage: (row, col) => image.openNew(row, col),
    paste: (row, col) => pasteAt(row, col),
    openCard: (id, type) =>
      type === "text" ? editor.open(id) : image.open(id),
    onResize: () => cards.renderCurrent(),
    onMove: () => nav.recompute(),
  });

  grid.init(viewport, world, {
    onWindowChange: (w) => cards.render(w),
  });

  await nav.init();

  saveBoardBtn.addEventListener("click", () => {
    saveBoardBtn.disabled = true;
    saveCurrentBoard()
      .catch((err) => {
        console.error("Failed to save board:", err);
        toast("Could not save board");
      })
      .finally(() => (saveBoardBtn.disabled = false));
  });

  undoBtn.addEventListener("click", () => history.undo());
  redoBtn.addEventListener("click", () => history.redo());

  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      history.undo();
      return;
    }
    if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      history.redo();
      return;
    }
    const step = state.CELL;
    const map = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (map[e.key]) {
      e.preventDefault();
      grid.panBy(map[e.key][0], map[e.key][1]);
    }
  });
}

main();
