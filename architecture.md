# Pinboard — Architecture

## Overview

Pinboard is a static, single-page application with no build step and no
server. The site has three HTML surfaces, all loading ES-module JavaScript
from `js/` and stylesheets from `css/`, and all sharing one browser IndexedDB
database:

- `index.html` — the landing page: two entry points into the board and the library.
- `app.html` — the pannable board (the original single-page app).
- `library.html` — lists saved boards and lets you open or delete them.

All state lives in the browser: IndexedDB for persistence, an in-memory render
cache for the visible viewport, and a few module-level variables for transient
interaction state (camera position, hover, drag sessions, and a shared ghost
element).

## Directory layout

```
index.html          landing page; entry points to the board and library
app.html            the pannable board canvas and cell toolbar
library.html        saved-boards listing (open / delete)
css/                stylesheets (base, grid, modal, nav, site)
js/
  app.js            board bootstrap: wires modules, save-to-library, ?board restore
  library.js        library page: load boards, render pins, delete
  backup.js          library robustness: JSON backup/restore + zip export
  zip.js             dependency-free STORE-method ZIP writer
  state.js          shared state (camera pan, viewport geometry, constants)
  grid.js           pannable viewport: pointer drag, wheel zoom, camera
  cards.js          pin rendering, hover toolbar, resize, occupancy grid
  drag.js           DragSession class for move-to-drag lifecycle
  editor.js         text-note modal editor (open, save, delete)
  image.js          image viewer modal + image resize/thumbnail encoding
  colorPalette.js   preset pin colors + reusable swatch picker UI
   db.js             IndexedDB layer (meta + blob + boards stores, window queries)
   nav.js            minimap, island clustering, navigation + jump/fit controls
   search.js         slide-out note search panel (magnifier toggle, text index)
   history.js        undo/redo command stack
```

## Module responsibilities

### app.js

Bootstraps the board application. Initializes the database, creates the editor,
image viewer, pin layer, and grid, and passes callback handlers that wire
them together. It also registers a global keyboard handler for arrow-key
panning. The `pasteAt` function lives here: it reads the system clipboard,
inspects available MIME types, and dispatches to either `image.pasteFile`
(for image data) or `editor.createFromText` (for text data). Clipboard
errors are logged to the browser console, never silently swallowed.

In addition, `app.js` owns the "save to library" flow: the title field and
save icon in the top bar snapshot the whole board (`queryAll` + each pin's
blob) into a titled board via `putBoard`, and show a transient toast. On
startup it checks the URL for `?board=<id>` and, if present, restores that
board onto the working board, with a confirmation when the board is non-empty. It also wires the template picker
(`createTemplatePicker` from `templates.js`) to the top-bar template icon and to
the empty-board hint link, and shows a toast when a template is applied.

### templates.js

Provides pre-built board layouts that seed the canvas. Templates live in a
`TEMPLATES` map and are organized into `GROUPS` (Planning, Work, Creative,
Personal) for a tabbed picker. Each template is a descriptor that builds an
array of text-pin definitions; `applyTemplate` clears the wall and writes those
pins directly via `putCard`, then clears history so the seed reads as a fresh
baseline rather than a long undo chain. Template pins carry a `color` (a preset
hex from the pin palette). Column/row layouts (Weekly, Life Areas, Roadmap, Habit
Tracker, Meal Planner, Story Outline, Event Plan, Travel Plan) fill the whole
column with one color — the header and its notes area share it. Kanban-style
layouts (Kanban, Sprint Board, Bug Triage, Reading List) color only the column
headers while task/book cards stay neutral. The Brainstorm template places a
central uncolored "Big Idea" pin with seven colored branch pins arranged
radially, and Vision Board is a 2×2 grid of large colored tiles. `createTemplatePicker`
builds the tabbed modal (tabs + a grid of selectable tiles, re-rendered on tab
switch). The picker is surfaced through a single top-bar icon plus an "or start
from a template" link that only appears in the empty-board hint, so the feature
stays discoverable without cluttering a populated board.

### state.js

Holds the camera state (`panX`, `panY`), viewport dimensions, computed
window bounds (row/col min/max), and the grid `CELL` constant. `computeWindow`
translates camera + viewport into the set of grid cells currently visible,
enabling windowed rendering.

### grid.js

Owns the pannable viewport element. Translates pointer drags and mouse-wheel
into camera motion, applies CSS transforms to a "world" element that holds
the pin layer, and fires an `onWindowChange` callback when the visible
cell range shifts (so cards.js can re-render only what's needed). Subscribes
via a camera callback for post-animation re-syncs (e.g. minimap).

### cards.js

The rendering engine and interaction hub. Key concerns:

- **Occupancy grid**: `occupied` (a Set of "row,col" strings) and
  `occupiedRects` (bounding boxes per pin) track which cells are taken,
  enabling snap-to-free-cell during drags and collision-free resize.
- **Windowed render**: `render(w)` queries only the visible cell range from
  IndexedDB, reconciles the DOM (create/update/remove pins), and caches
  full text and image blobs to avoid repeated IndexedDB reads.
- **Hover toolbar**: `onHover` positions the `cellAdd` toolbar on the
  hovered empty cell. A `suppressAdd` flag prevents the toolbar from
  re-appearing while an asynchronous action (like paste) is in flight.
- **Resize handles**: right-click toggles `card-resize` class; drag handles
  on east/south/southeast edges snap to whole cells and respect the
  occupancy grid.
- **Drag**: `onCardDown` constructs a `DragSession` (see drag.js).

### drag.js

The `DragSession` class encapsulates the full press → move → release
lifecycle for pin dragging. On construction it captures the pointer's
world coordinates, cell position, and start position, then attaches
`pointermove`/`pointerup`/`pointercancel` listeners to `window`. The
movement threshold (3 px) distinguishes a drag from a tap. All movement is
snapped to whole-cell multiples of `CELL`. A shared singleton ghost element
provides a live preview of the drop location. On release, the class delegates
to injected callbacks: `onTap` (open editor for a no-movement click) or
`onCommit` (persist the new position via cards.js's occupancy update +
IndexedDB write). The class self-cleans its event listeners, so there is no
module-level drag state variable.

### editor.js

Manages the text-note modal. `openNew` creates a blank note at a cell;
`open` loads an existing note for editing. `createFromText` (used by paste)
writes a note pin directly from clipboard text without opening the modal.
Saves write the full text blob and update metadata (title, character count,
preview, and the chosen accent color). The modal embeds the shared color
picker so a note's preset color is committed on save.

### image.js

Manages the image viewer modal and image processing. `openNew` opens the file
picker; `pasteFile` (used by paste) accepts a clipboard image blob directly
and runs it through the same resize + thumbnail pipeline. `paintCardThumb`
re-renders a pin's thumbnail from the full-resolution stored blob at the
pin's current pixel dimensions, keeping images crisp across resize. Images
are capped at 1920×1080 and encoded as WebP with a JPEG/PNG fallback. The
viewer embeds the shared color picker and persists a chosen accent color
immediately for existing pins (recorded on the history stack like any edit).

### colorPalette.js

Exposes the preset palettes (three arrays of ten hex colors) and a
`createColorPicker({ onPick })` factory that builds a self-contained swatch
grid plus a "None" control. `onPick(hex)` fires with a hex string or `null`;
`select(hex)` reflects the active choice in the UI. `editor.js` and `image.js`
both mount an instance inside their modals so the two pin types share the same
look and behavior.

### db.js

Thin IndexedDB wrapper. Three object stores: `meta` (pin metadata, indexed by
row+col for windowed queries), `blobs` (text content and image data, keyed by
pin id), and `boards` (saved board snapshots, keyed by board id). `queryWindow`
uses the compound `by_rc` index to fetch only visible pins; `putCard` writes
meta + blob in a single transaction. Board helpers cover `putBoard`,
`getBoard`, `getAllBoards`, `deleteBoard`, `clearWall`, and `restoreBoard`,
which replaces the live board with a board's stored pins. `updateCardColor`
writes only the accent `color` field of an existing pin, used by the color
picker.

### nav.js

Provides island clustering (group detection), a minimap overview of all pins,
and the navigation controls. The minimap is collapsed by default — only the
navigation header (group title, count, and previous/next buttons) renders — and
a chevron toggle in the header slides it open or closed. While the camera moves
(grid.js fires a camera callback), the minimap briefly reveals itself for
spatial context and then auto-collapses after a short idle period; the chevron
lets the user pin it open manually. Clicking a group (or empty space) in the
minimap flies the camera to that cluster. nav.js subscribes to camera changes
from grid.js to keep the minimap's viewport indicator in sync, and recomputes
the island clusters whenever the board changes.

Two further controls live in the header. A **Jump** button toggles a popover
that lists the most recently visited groups (tracked in an in-memory
`recentIslands` list, capped and de-duplicated, cleared on every board change),
each labelled with its group number and grid position; selecting one frames that
group. The minimap rings the newest entry (`recent` class) so the last-visited
cluster is visible at a glance. A **Zoom to fit all** button (frameAll) computes
the union bounding box of every group and centers it in the viewport; because
the board has no scale step, this is a center-all rather than a true zoom.

### search.js

Implements the slide-out note search. A magnifying-glass button in the top bar
toggles a panel that slides in from the left; it is hidden by default, so search
is not a permanently visible control. The panel holds a text input, a **scope**
selector (title and body / title only / body only), a result count, and a
scrollable result list. On each (debounced) keystroke it queries every text pin
from the database and matches the query against title and/or body per the chosen
scope. Note text is loaded through a small in-memory cache (mirroring
cards.js's textCache) keyed by pin id, so repeated searches don't re-read
IndexedDB. Each result shows the title, a body snippet with the matched term
wrapped in `<mark>`, and the note's grid position; clicking a result flies the
camera to that note (via grid.setPan) and opens it. The cache is invalidated
from app.js's change handler when a note is edited.

### library.js

Renders the Library page. On load it calls `getAllBoards` and builds an entry for
each board showing a cover preview, title, pin counts, and saved date, with
Open (links to `app.html?board=<id>`) and Delete actions. Deleting calls
`deleteBoard` and removes the entry from the DOM. Each entry also exposes a
**Backup** action (JSON export) and a **Save as zip** action; the Library header
holds an **Import backup** button that reads a JSON backup file and stores it as
a new board via `putBoard`.

### backup.js

Implements the Library's robustness features. `exportBoardJSON` serializes a
board (including image blobs, embedded as data URLs) into a self-contained JSON
file for backup. `importBoardJSON` reads such a file, rehydrates image blobs from
their data URLs, assigns a fresh board id, and writes it back through `putBoard`.
`exportBoardZip` flattens every pin into a plain file — notes to `.txt`, images
to `.png` (or kept as `.jpg`) — and packages them with `makeZip`.

### zip.js

A small, dependency-free ZIP writer using the STORE method (no compression). It
assembles local file headers, a central directory, and the end-of-central-
directory record, flagging filenames as UTF-8, and returns a `Blob` the browser
can download. Used by `backup.js` for the zip export.

### history.js

Implements an undo/redo command stack using the command pattern. Each board
mutation is recorded as a reversible command object with `undo()` and `redo()`
methods that perform the corresponding IndexedDB operation and notify the app
to re-render. Five command types cover every mutation:

- **Add pin** — undo deletes, redo re-adds (stores meta + blob).
- **Delete pin** — undo re-adds from captured meta + blob, redo deletes.
- **Move pin** — undo/redo call `updateCardPosition` with the from/to cells.
- **Resize pin** — undo/redo call `updateCardSpan` with the from/to spans.
- **Edit pin** — undo/redo write the old/new meta + blob via `putCard`.

The stack is bounded (100 entries) and pushing a new command clears the redo
stack. The module owns the undo/redo button disabled state and exposes
`clearHistory` for board restore.

## Data flow

1. **Startup**: `app.js → initDB()` → initialize editor, image, cards, grid, nav.
2. **Render loop**: grid pan → `onWindowChange` → `cards.render(w)` →
   `db.queryWindow(rowMin..rowMax, colMin..colMax)` → reconcile DOM.
3. **Place**: cell toolbar click → handler (editor.openNew / image.openNew /
   pasteAt) → `db.putCard` → `history.recordAddCard` → `onChange` →
   `cards.renderCurrent`.
4. **Drag**: `onCardDown` → `new DragSession` → `onMove` updates live DOM
   position + ghost → `onCommit` updates occupancy + `db.updateCardPosition`
   → `history.recordMoveCard` → `onMove` handler re-renders nav.
 5. **Resize**: handle drag → live DOM width/height → `onCardUp` →
    `db.updateCardSpan` → `history.recordResizeCard` → callback re-renders.
 6. **Color**: modal picker → `db.updateCardColor` (image) or saved with the
    note meta (text) → `history.recordEditCard` (image) → `onChange` re-renders
    the card with its tinted background and colored ring.
 7. **Paste**: toolbar Paste click → `app.js.pasteAt` → `navigator.clipboard.read()`
    → dispatch image/text → `db.putCard` → `history.recordAddCard` → `onChange`.
 8. **Undo/redo**: button click or Ctrl+Z / Ctrl+Y → `history.undo()` /
    `history.redo()` → command performs the inverse/repeat DB operation →
    `notify(id)` invalidates the affected pin's cache and re-renders.

## Design decisions

- **No framework**: the application is fundamentally pointer-coordinate math
  and absolute positioning; a virtual DOM would add overhead without reducing
  complexity. Vanilla ES modules keep it dependency-free and directly
  debuggable in the browser.
- **Windowed rendering**: only visible cells are queried and rendered, so the
  board can grow indefinitely without performance degradation.
- **Blob caching**: full text and image blobs are cached in memory after
  first read so that pan/re-render cycles don't re-query IndexedDB.
- **Whole-cell snapping**: all positions (drag, resize) snap to `CELL`
  multiples, ensuring pins never overlap or land at fractional offsets.
- **Unified pointerup**: the drag's pointerup is the single resolution point —
  it either commits a move or opens the pin, eliminating the click/drag race.
- **Clipboard as first-class**: paste reuses the exact same image/text
  creation pipeline as the file picker and editor, so pasted content behaves
  identically to manually added content.
- **Command pattern for undo/redo**: every board mutation is wrapped in a small
  command object (`undo`/`redo` methods) pushed onto a bounded stack. This keeps
  the history concern isolated from the interaction code — cards.js, editor.js,
  and image.js each record a command after their DB write, without knowing how
  undo/redo is implemented.
