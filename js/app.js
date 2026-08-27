import { initDB } from "./db.js";
import * as state from "./state.js";
import * as grid from "./grid.js";
import * as cards from "./cards.js";
import * as editor from "./editor.js";
import * as image from "./image.js";
import * as nav from "./nav.js";

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

async function main() {
  await initDB();

  const onChange = () => {
    cards.renderCurrent();
    nav.recompute();
  };

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

  window.addEventListener("keydown", (e) => {
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
