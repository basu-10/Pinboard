import { PREVIEW_MAX, putCard, clearWall, queryAll } from "./db.js";
import { clearHistory } from "./history.js";

/**
 * Board templates seed the empty canvas with a set of pre-placed text pins.
 * Each template is a function returning descriptors of the form
 * { row, col, colSpan, rowSpan, color, text }. Only the column/day header pins
 * carry a `color` (a preset hex from the pin palette); the body pins stay
 * uncolored so the accent reads as structure, not noise.
 */
// Distinct preset hexes (from the pin color palette) — one per header.
const KANBAN_COLORS = ["#FF8FA3", "#8CE99A", "#63D2FF"];
const WEEK_COLORS = [
  "#FF8FA3", // Mon
  "#FFB27D", // Tue
  "#FFD43B", // Wed
  "#8CE99A", // Thu
  "#63D2FF", // Fri
  "#B197FC", // Sat
  "#F783C2", // Sun
];

const TEMPLATES = {
  kanban: {
    name: "Kanban",
    blurb: "Three columns — To Do, In Progress, Done.",
    build: () => {
      const cols = [
        { c: 0, title: "To Do" },
        { c: 1, title: "In Progress" },
        { c: 2, title: "Done" },
      ];
      const out = [];
      cols.forEach(({ c, title }, i) => {
        out.push({ row: 0, col: c, colSpan: 1, rowSpan: 1, color: KANBAN_COLORS[i], text: `${title}\nDrop tasks into this column.` });
        const seeds = [
          ["Write project brief", "Sketch the goals and scope."],
          ["Design board grid", "Map columns to your workflow."],
          ["Set up repo", "Initial commit is done."],
        ][i];
        if (seeds) {
          out.push({ row: 1, col: c, colSpan: 1, rowSpan: 2, text: seeds[0] });
          if (i < 2) out.push({ row: 3, col: c, colSpan: 1, rowSpan: 1, text: seeds[1] });
        }
      });
      return out;
    },
  },

  weekly: {
    name: "Weekly Planner",
    blurb: "Seven days, each with a notes column.",
    build: () => {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const out = [];
      days.forEach((d, i) => {
        // Whole column takes the day's color: header + its notes area share it.
        out.push({ row: 0, col: i, colSpan: 1, rowSpan: 1, color: WEEK_COLORS[i], text: `${d}\nHeadline for the day.` });
        out.push({ row: 1, col: i, colSpan: 1, rowSpan: 2, color: WEEK_COLORS[i], text: `${d} notes\n\n• \n• \n• ` });
      });
      return out;
    },
  },

  life: {
    name: "Life Areas",
    blurb: "Five focus areas, each its own color.",
    build: () => {
      const areas = [
        { title: "Health", color: "#8CE99A" },
        { title: "Career", color: "#63D2FF" },
        { title: "Learning", color: "#FFD43B" },
        { title: "Social", color: "#F783C2" },
        { title: "Fun", color: "#B197FC" },
      ];
      const out = [];
      areas.forEach((a, i) => {
        // Whole column shares the area's color, like the weekly planner.
        out.push({ row: 0, col: i, colSpan: 1, rowSpan: 1, color: a.color, text: `${a.title}\nFocus for this area.` });
        out.push({ row: 1, col: i, colSpan: 1, rowSpan: 2, color: a.color, text: `${a.title} notes\n\n• \n• \n• ` });
      });
      return out;
    },
  },

  roadmap: {
    name: "Roadmap",
    blurb: "Phased plan — Discover, Design, Build, Launch.",
    build: () => {
      const phases = [
        { title: "Discover", color: "#FF8FA3" },
        { title: "Design", color: "#FFB27D" },
        { title: "Build", color: "#63D2FF" },
        { title: "Launch", color: "#8CE99A" },
      ];
      const out = [];
      phases.forEach((p, i) => {
        // Whole column shares the phase's color.
        out.push({ row: 0, col: i, colSpan: 1, rowSpan: 1, color: p.color, text: `${p.title}\nWhat we aim to do.` });
        out.push({ row: 1, col: i, colSpan: 1, rowSpan: 2, color: p.color, text: `${p.title} milestones\n\n• \n• ` });
      });
      return out;
    },
  },

  brainstorm: {
    name: "Brainstorm",
    blurb: "A central idea with colored branches around it.",
    build: () => {
      const center = { row: 4, col: 4 };
      const branches = [
        { row: 2, col: 4, color: "#FF8FA3", text: "Idea A\nWhat if…?" },
        { row: 2, col: 2, color: "#B197FC", text: "Idea B\nWhat if…?" },
        { row: 4, col: 2, color: "#8CE99A", text: "Idea C\nWhat if…?" },
        { row: 6, col: 2, color: "#63D2FF", text: "Idea D\nWhat if…?" },
        { row: 6, col: 4, color: "#FFD43B", text: "Idea E\nWhat if…?" },
        { row: 6, col: 6, color: "#F783C2", text: "Idea F\nWhat if…?" },
        { row: 4, col: 6, color: "#FFB27D", text: "Idea G\nWhat if…?" },
      ];
      const out = [
        { ...center, rowSpan: 1, colSpan: 1, text: "My Big Idea\nCentral topic to explore." },
        ...branches.map((b) => ({ ...b, rowSpan: 1, colSpan: 1 })),
      ];
      return out;
    },
  },

  blank: {
    name: "Blank",
    blurb: "An empty canvas to start from scratch.",
    build: () => [],
  },
};

function firstLine(text) {
  return (text.trim().split("\n")[0] || "").slice(0, 60);
}

function makeTextCard({ row, col, colSpan = 1, rowSpan = 1, color, text }) {
  const id = crypto.randomUUID();
  const meta = {
    id,
    row,
    col,
    rowSpan,
    colSpan,
    type: "text",
    title: firstLine(text),
    preview: text.slice(0, PREVIEW_MAX),
    charCount: text.length,
    thumb: "",
    color: color || null,
    updatedAt: Date.now(),
  };
  return { meta, blob: { id, text } };
}

/**
 * Apply a template by id. Seeds the canvas: clears existing pins, then writes
 * each template pin. The seed is treated as a fresh baseline (history cleared),
 * so undoing doesn't try to remove one pin at a time.
 * Returns the template name on success, or null if the user cancelled.
 */
export async function applyTemplate(id, { onChange, requireConfirm }) {
  const tpl = TEMPLATES[id];
  if (!tpl) return null;

  const existing = await queryAll();
  if (existing.length > 0 && requireConfirm) {
    const verb = id === "blank" ? "clear your board" : `replace your board with the “${tpl.name}” template`;
    if (!confirm(`This will ${verb}. Continue?`)) return null;
  }

  const cards = tpl.build().map(makeTextCard);

  await clearWall();
  for (const { meta, blob } of cards) {
    await putCard(meta, blob);
  }

  clearHistory();
  if (onChange) onChange(null);
  return tpl.name;
}

/** Build the template picker modal and return an { open } controller. */
export function createTemplatePicker({ onChange }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal tpl-modal" role="dialog" aria-modal="true" aria-label="Board templates">
      <header class="modal-head">
        <span class="modal-title">Start from a template</span>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </header>
      <div class="tpl-grid">
        ${Object.entries(TEMPLATES)
          .map(
            ([id, t]) => `
          <button type="button" class="tpl-tile" data-tpl="${id}">
            <span class="tpl-name">${t.name}</span>
            <span class="tpl-blurb">${t.blurb}</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => (overlay.hidden = true);
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelectorAll(".tpl-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const name = await applyTemplate(tile.dataset.tpl, {
        onChange,
        requireConfirm: true,
      });
      if (name) {
        close();
        document.dispatchEvent(new CustomEvent("tpl:applied", { detail: { name } }));
      }
    });
  });

  return {
    open() {
      overlay.hidden = false;
    },
  };
}
