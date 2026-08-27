import { PREVIEW_MAX, putCard, clearWall, queryAll } from "./db.js";
import { clearHistory } from "./history.js";

/**
 * Board templates seed the empty canvas with a set of pre-placed text pins.
 * Each template is a descriptor that builds an array of pin definitions of the
 * form { row, col, colSpan, rowSpan, color, text }. Only structural pins
 * (column/day/area headers, or a few accent cards) carry a `color` — a preset
 * hex from the pin palette — so the color signals structure, not decoration.
 * Templates are grouped (see GROUPS) and surfaced through a tabbed picker.
 */

// Distinct preset hexes (from the pin color palette).
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
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Build a colored-column layout: each def gets a colored header + (optional)
 *  colored notes area directly beneath it. */
function coloredColumns(defs, { notesRowSpan = 2, notesText } = {}) {
  const out = [];
  defs.forEach((d, i) => {
    out.push({
      row: 0,
      col: i,
      colSpan: 1,
      rowSpan: 1,
      color: d.color,
      text: d.sub ? `${d.title}\n${d.sub}` : d.title,
    });
    if (notesText) {
      out.push({
        row: 1,
        col: i,
        colSpan: 1,
        rowSpan: notesRowSpan,
        color: d.color,
        text: notesText(d),
      });
    }
  });
  return out;
}

/** Build a Kanban-style layout: colored column headers, neutral task cards. */
function kanbanColumns(cols, seeds = []) {
  const out = [];
  cols.forEach(({ c, title, color }) => {
    out.push({
      row: 0,
      col: c,
      colSpan: 1,
      rowSpan: 1,
      color,
      text: `${title}\nDrop items here.`,
    });
  });
  out.push(...seeds);
  return out;
}

const TEMPLATES = {
  // ----- Planning -----
  weekly: {
    name: "Weekly Planner",
    blurb: "Seven days, each a colored column.",
    build: () =>
      coloredColumns(
        DAYS.map((d, i) => ({ title: d, color: WEEK_COLORS[i] })),
        { notesText: (d) => `${d.title} notes\n\n• \n• \n• ` }
      ),
  },

  life: {
    name: "Life Areas",
    blurb: "Five focus areas, each its own color.",
    build: () =>
      coloredColumns(
        [
          { title: "Health", color: "#8CE99A" },
          { title: "Career", color: "#63D2FF" },
          { title: "Learning", color: "#FFD43B" },
          { title: "Social", color: "#F783C2" },
          { title: "Fun", color: "#B197FC" },
        ],
        { notesText: (d) => `${d.title} notes\n\n• \n• \n• ` }
      ),
  },

  roadmap: {
    name: "Roadmap",
    blurb: "Phased plan — Discover to Launch.",
    build: () =>
      coloredColumns(
        [
          { title: "Discover", color: "#FF8FA3" },
          { title: "Design", color: "#FFB27D" },
          { title: "Build", color: "#63D2FF" },
          { title: "Launch", color: "#8CE99A" },
        ],
        { notesText: (d) => `${d.title} milestones\n\n• \n• ` }
      ),
  },

  habit: {
    name: "Habit Tracker",
    blurb: "Habits as colored rows across the week.",
    build: () => {
      const habits = [
        { title: "Exercise", color: "#8CE99A" },
        { title: "Read", color: "#63D2FF" },
        { title: "Meditate", color: "#FFD43B" },
        { title: "Sleep", color: "#F783C2" },
      ];
      const out = [];
      habits.forEach((h, r) => {
        out.push({ row: r, col: 0, colSpan: 1, rowSpan: 1, color: h.color, text: h.title });
        for (let d = 1; d <= 7; d++) {
          out.push({ row: r, col: d, colSpan: 1, rowSpan: 1, text: "" });
        }
      });
      return out;
    },
  },

  meal: {
    name: "Meal Planner",
    blurb: "Plan meals, day by colored day.",
    build: () =>
      coloredColumns(
        DAYS.map((d, i) => ({ title: d, color: WEEK_COLORS[i] })),
        { notesText: () => "Breakfast:\nLunch:\nDinner:" }
      ),
  },

  // ----- Work -----
  kanban: {
    name: "Kanban",
    blurb: "To Do, In Progress, Done.",
    build: () =>
      kanbanColumns(
        [
          { c: 0, title: "To Do", color: KANBAN_COLORS[0] },
          { c: 1, title: "In Progress", color: KANBAN_COLORS[1] },
          { c: 2, title: "Done", color: KANBAN_COLORS[2] },
        ],
        [
          { row: 1, col: 0, colSpan: 1, rowSpan: 2, text: "Write project brief" },
          { row: 3, col: 0, colSpan: 1, rowSpan: 1, text: "Sketch wireframes" },
          { row: 1, col: 1, colSpan: 1, rowSpan: 1, text: "Design board grid" },
          { row: 1, col: 2, colSpan: 1, rowSpan: 1, text: "Set up repo" },
        ]
      ),
  },

  sprint: {
    name: "Sprint Board",
    blurb: "Backlog → Sprint → Review → Done.",
    build: () =>
      kanbanColumns(
        [
          { c: 0, title: "Backlog", color: "#FF8FA3" },
          { c: 1, title: "This Sprint", color: "#FFB27D" },
          { c: 2, title: "In Progress", color: "#63D2FF" },
          { c: 3, title: "Review", color: "#B197FC" },
          { c: 4, title: "Done", color: "#8CE99A" },
        ],
        [
          { row: 1, col: 0, colSpan: 1, rowSpan: 1, text: "User research" },
          { row: 2, col: 0, colSpan: 1, rowSpan: 1, text: "API design" },
          { row: 1, col: 1, colSpan: 1, rowSpan: 1, text: "Build board grid" },
        ]
      ),
  },

  bugs: {
    name: "Bug Triage",
    blurb: "By priority — Critical to Low.",
    build: () =>
      kanbanColumns(
        [
          { c: 0, title: "Critical", color: "#FF8FA3" },
          { c: 1, title: "High", color: "#FFB27D" },
          { c: 2, title: "Medium", color: "#FFD43B" },
          { c: 3, title: "Low", color: "#8CE99A" },
        ],
        [
          { row: 1, col: 0, colSpan: 1, rowSpan: 1, text: "Login crash" },
          { row: 1, col: 2, colSpan: 1, rowSpan: 1, text: "Header typo" },
        ]
      ),
  },

  // ----- Creative -----
  brainstorm: {
    name: "Brainstorm",
    blurb: "A central idea with colored branches.",
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
      return [
        { ...center, rowSpan: 1, colSpan: 1, text: "My Big Idea\nCentral topic to explore." },
        ...branches.map((b) => ({ ...b, rowSpan: 1, colSpan: 1 })),
      ];
    },
  },

  story: {
    name: "Story Outline",
    blurb: "Three acts, each its own color.",
    build: () =>
      coloredColumns(
        [
          { title: "Act I", color: "#FF8FA3" },
          { title: "Act II", color: "#63D2FF" },
          { title: "Act III", color: "#8CE99A" },
        ],
        { notesText: (d) => `${d.title} scenes\n\n• \n• ` }
      ),
  },

  vision: {
    name: "Vision Board",
    blurb: "A 2×2 grid of big colorful tiles.",
    build: () => {
      const tiles = [
        { row: 0, col: 0, color: "#FF8FA3", text: "Dream Big\nWhat do you want?" },
        { row: 0, col: 2, color: "#63D2FF", text: "Aesthetic\nColors & mood." },
        { row: 2, col: 0, color: "#FFD43B", text: "Words to live by\nAffirmations." },
        { row: 2, col: 2, color: "#8CE99A", text: "Goals\nSteps to take." },
      ];
      return tiles.map((t) => ({ ...t, colSpan: 2, rowSpan: 2 }));
    },
  },

  // ----- Personal -----
  reading: {
    name: "Reading List",
    blurb: "To Read, Reading, Finished.",
    build: () =>
      kanbanColumns(
        [
          { c: 0, title: "To Read", color: "#FF8FA3" },
          { c: 1, title: "Reading", color: "#63D2FF" },
          { c: 2, title: "Finished", color: "#8CE99A" },
        ],
        [
          { row: 1, col: 0, colSpan: 1, rowSpan: 1, text: "The Pragmatic Programmer" },
          { row: 1, col: 2, colSpan: 1, rowSpan: 1, text: "Pinboard user guide" },
        ]
      ),
  },

  travel: {
    name: "Travel Plan",
    blurb: "Day-by-day, each day colored.",
    build: () =>
      coloredColumns(
        DAYS.map((d, i) => ({ title: d, color: WEEK_COLORS[i] })),
        { notesText: () => "Pack:\nDo:\nEat:" }
      ),
  },

  party: {
    name: "Event Plan",
    blurb: "Venue, Guests, Food, Music.",
    build: () =>
      coloredColumns(
        [
          { title: "Venue", color: "#FF8FA3" },
          { title: "Guests", color: "#63D2FF" },
          { title: "Food", color: "#8CE99A" },
          { title: "Music", color: "#FFD43B" },
        ],
        { notesText: (d) => `${d.title} notes\n\n• \n• ` }
      ),
  },

  blank: {
    name: "Blank",
    blurb: "An empty canvas to start from scratch.",
    build: () => [],
  },
};

/** Tabbed grouping shown in the picker. The Blank template is offered in every
 *  group so it is always one click away. */
const GROUPS = [
  { id: "planning", name: "Planning", items: ["weekly", "life", "roadmap", "habit", "meal", "blank"] },
  { id: "work", name: "Work", items: ["kanban", "sprint", "bugs", "blank"] },
  { id: "creative", name: "Creative", items: ["brainstorm", "story", "vision", "blank"] },
  { id: "personal", name: "Personal", items: ["reading", "travel", "party", "blank"] },
];

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

/** Build the tabbed template picker modal and return an { open } controller. */
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
      <div class="tpl-tabs"></div>
      <div class="tpl-grid"></div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => (overlay.hidden = true);
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const tabsEl = overlay.querySelector(".tpl-tabs");
  const gridEl = overlay.querySelector(".tpl-grid");
  let activeGroup = GROUPS[0].id;

  function renderTabs() {
    tabsEl.innerHTML = GROUPS.map(
      (g) =>
        `<button type="button" class="tpl-tab${g.id === activeGroup ? " is-active" : ""}" data-group="${g.id}">${g.name}</button>`
    ).join("");
    tabsEl.querySelectorAll(".tpl-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeGroup = tab.dataset.group;
        renderTabs();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const group = GROUPS.find((g) => g.id === activeGroup);
    gridEl.innerHTML = group.items
      .map((id) => {
        const t = TEMPLATES[id];
        return `
          <button type="button" class="tpl-tile" data-tpl="${id}">
            <span class="tpl-name">${t.name}</span>
            <span class="tpl-blurb">${t.blurb}</span>
          </button>`;
      })
      .join("");
    gridEl.querySelectorAll(".tpl-tile").forEach((tile) => {
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
  }

  renderTabs();
  renderGrid();

  return {
    open() {
      overlay.hidden = false;
    },
  };
}
