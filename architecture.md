# Text Wall — Architecture

## Overview

Text Wall is a static, single-page application with no build step and no
server. The entry point is `index.html`, which loads ES-module JavaScript
from `js/` and stylesheets from `css/`. All state lives in the browser:
IndexedDB for persistence, an in-memory render cache for the visible viewport,
and a few module-level variables for transient interaction state (camera
position, hover, drag sessions, and a shared ghost element).

## Directory layout

```
index.html          entry point; hosts the world canvas and cell toolbar
css/                stylesheets (base, grid, modal, nav)
js/
  app.js            application bootstrap: wires modules and handlers
  state.js          shared state (camera pan, viewport geometry, constants)
  grid.js           pannable viewport: pointer drag, wheel zoom, camera
  cards.js          card rendering, hover toolbar, resize, occupancy grid
  drag.js           DragSession class for move-to-drag lifecycle
  editor.js         text-note modal editor (open, save, delete)
  image.js          image viewer modal + image resize/thumbnail encoding
  db.js             IndexedDB layer (meta + blob stores, window queries)
  nav.js            minimap, island clustering, navigation controls
```

## Module responsibilities

### app.js

Bootstraps the application. Initializes the database, creates the editor,
image viewer, card layer, and grid, and passes callback handlers that wire
them together. It also registers a global keyboard handler for arrow-key
panning. The `pasteAt` function lives here: it reads the system clipboard,
inspects available MIME types, and dispatches to either `image.pasteFile`
(for image data) or `editor.createFromText` (for text data). Clipboard
errors are logged to the browser console, never silently swallowed.

### state.js

Holds the camera state (`panX`, `panY`), viewport dimensions, computed
window bounds (row/col min/max), and the grid `CELL` constant. `computeWindow`
translates camera + viewport into the set of grid cells currently visible,
enabling windowed rendering.

### grid.js

Owns the pannable viewport element. Translates pointer drags and mouse-wheel
into camera motion, applies CSS transforms to a "world" element that holds
the card layer, and fires an `onWindowChange` callback when the visible
cell range shifts (so cards.js can re-render only what's needed). Subscribes
via a camera callback for post-animation re-syncs (e.g. minimap).

### cards.js

The rendering engine and interaction hub. Key concerns:

- **Occupancy grid**: `occupied` (a Set of "row,col" strings) and
  `occupiedRects` (bounding boxes per card) track which cells are taken,
  enabling snap-to-free-cell during drags and collision-free resize.
- **Windowed render**: `render(w)` queries only the visible cell range from
  IndexedDB, reconciles the DOM (create/update/remove cards), and caches
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
lifecycle for card dragging. On construction it captures the pointer's
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
writes a note card directly from clipboard text without opening the modal.
Saves write the full text blob and update metadata (title, character count,
preview).

### image.js

Manages the image viewer modal and image processing. `openNew` opens the file
picker; `pasteFile` (used by paste) accepts a clipboard image blob directly
and runs it through the same resize + thumbnail pipeline. `paintCardThumb`
re-renders a card's thumbnail from the full-resolution stored blob at the
card's current pixel dimensions, keeping images crisp across resize. Images
are capped at 1920×1080 and encoded as WebP with a JPEG/PNG fallback.

### db.js

Thin IndexedDB wrapper. Two object stores: `meta` (card metadata, indexed by
row+col for windowed queries) and `blobs` (text content and image data, keyed
by card id). `queryWindow` uses the compound `by_rc` index to fetch only
visible cards. `putCard` writes meta + blob in a single transaction.

### nav.js

Provides a minimap overview of all cards (island clustering for density) and
navigation controls. Subscribes to camera changes from grid.js to keep the
minimap position in sync.

## Data flow

1. **Startup**: `app.js → initDB()` → initialize editor, image, cards, grid, nav.
2. **Render loop**: grid pan → `onWindowChange` → `cards.render(w)` →
   `db.queryWindow(rowMin..rowMax, colMin..colMax)` → reconcile DOM.
3. **Place**: cell toolbar click → handler (editor.openNew / image.openNew /
   pasteAt) → `db.putCard` → `onChange` → `cards.renderCurrent`.
4. **Drag**: `onCardDown` → `new DragSession` → `onMove` updates live DOM
   position + ghost → `onCommit` updates occupancy + `db.updateCardPosition`
   → `onMove` handler re-renders nav.
5. **Resize**: handle drag → live DOM width/height → `onCardUp` →
   `db.updateCardSpan` → callback re-renders.
6. **Paste**: toolbar Paste click → `app.js.pasteAt` → `navigator.clipboard.read()`
   → dispatch image/text → `db.putCard` → `onChange`.

## Design decisions

- **No framework**: the application is fundamentally pointer-coordinate math
  and absolute positioning; a virtual DOM would add overhead without reducing
  complexity. Vanilla ES modules keep it dependency-free and directly
  debuggable in the browser.
- **Windowed rendering**: only visible cells are queried and rendered, so the
  wall can grow indefinitely without performance degradation.
- **Blob caching**: full text and image blobs are cached in memory after
  first read so that pan/re-render cycles don't re-query IndexedDB.
- **Whole-cell snapping**: all positions (drag, resize) snap to `CELL`
  multiples, ensuring cards never overlap or land at fractional offsets.
- **Unified pointerup**: the drag's pointerup is the single resolution point —
  it either commits a move or opens the card, eliminating the click/drag race.
- **Clipboard as first-class**: paste reuses the exact same image/text
  creation pipeline as the file picker and editor, so pasted content behaves
  identically to manually added content.
