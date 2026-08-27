import { initDB } from "./db.js";
import * as state from "./state.js";
import * as grid from "./grid.js";
import * as cards from "./cards.js";
import * as editor from "./editor.js";
import * as image from "./image.js";
import * as nav from "./nav.js";

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
