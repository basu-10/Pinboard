# Pinboard — Product

## What it is

Pinboard is a single-page, browser-based workspace for collecting lightweight
cards — short text notes and images — arranged on an infinite, pannable grid.
It runs entirely client-side with no server, no build step, and no user
accounts. Everything the user creates is persisted in the browser via
IndexedDB, so each visitor keeps their own private wall.

The experience is deliberately tactile: you pan by dragging empty space, place
new cards by hovering an empty cell and choosing from a contextual toolbar,
rearrange cards by dragging them, resize them with a right-click handle, and
edit their contents in a modal dialog. Cards snap to grid cells, never float
freely at fractional positions.

## Core interactions

### Placing cards

Hovering the cursor over an empty grid cell highlights that cell itself — the
cell lights up with an inset accent ring and a soft fill, and the three add
options are embedded directly inside the highlighted cell, so the action reads
as placing content into that specific cell. The choices are:

- **+ Note** — opens a text editor modal where you type a note. Saving stores
  it and returns to the wall, where the note appears as a text card showing its
  title (first line) and a clamped preview of its body.
- **+ Image** — opens a file picker restricted to image types. The selected
  image is resized to a maximum of 1920×1080, stored as a full-resolution WebP
  blob, and displayed as a card with a thumbnail and a download link. Clicking
  the card opens a full-size viewer modal.
- **Paste** — reads from the system clipboard (requires permission in the
  browser). If the clipboard contains an image, it is placed as an image card
  the same way the file picker works; if it contains text, it is placed as a
  note card. If the clipboard cannot be read or contains unsupported content,
  the error is reported in the browser console rather than failing silently.
  While the paste is in progress the toolbar does not reappear until the
  operation settles.

### Moving cards

A left press on a card begins a drag session. Small movements within a
3-pixel radius are treated as a tap rather than a drag. Once movement exceeds
that threshold, the card follows the cursor, snapping to whole grid cells —
it never lands at a fractional cell offset. A live ghost preview shows where
the card will drop, colored to indicate whether the target cell is valid or
occupied. Releasing the pointer commits the move; the card's new position is
written to IndexedDB and the wall re-renders at the new location.

### Opening / editing cards

A click (press without movement) on a card opens its editor modal. For text
cards this is a textarea with a character-count preview note; for image cards
this is a full-size viewer with a download link and delete button. Changes are
saved on confirmation.

### Resizing cards

Right-clicking a card toggles resize handles on its east, south, and
south-east edges. Dragging a handle resizes the card by whole grid cells,
respecting the wall's occupied-cell grid so cards never overlap. The new span
is persisted on release.

### Undo / redo

Every change to the wall — placing, moving, resizing, editing, or deleting a
card — can be undone and redone. The top bar has dedicated undo and redo
buttons (disabled when there is nothing to undo/redo), and the standard
keyboard shortcuts work: **Ctrl+Z** (undo) and **Ctrl+Y** or **Ctrl+Shift+Z**
(redo). Accidental drags and deletes are fully reversible.

### Panning the canvas

Dragging on empty space (not on a card or the cell toolbar) pans the
viewport. Keyboard arrow keys pan by one cell, or by a larger step while
shifting. The grid is dotted and scrolls infinitely in all directions.

## Saving to the library

While working in the wall, you can give it a title (the "Board title" field in
the top bar) and press the save icon to snapshot the entire wall into a
**board**. A board captures every card — notes, images, positions, and sizes —
along with a title, so the moment is preserved exactly as laid out. Saved
boards are listed in the **Library** (open it from the top bar or the landing
page), where each one shows a cover preview, its card counts, and the last
time it was saved.

From the Library you can **Open** a board — this loads it back onto the wall,
replacing the current cards — or **Delete** it. Opening a board is a one-way
swap of the working wall, so the app confirms before overwriting anything
already on the canvas.

## Landing and navigation

The app opens on a landing page with two entry points: **Open Wall** drops you
straight into the pannable canvas, and **My Library** shows every saved board.
The wall and the library share the same browser storage, so boards saved on one
device in a given browser are visible in the library on that same browser.

## Data model

Each card has a type (text or image) and a grid position (row, column) plus
an optional span (colSpan, rowSpan, both defaulting to 1). Text cards store
their full body in a blob; image cards store a full-resolution image blob
alongside a small thumbnail data URL used in the grid view. Metadata —
position, span, title, character count for text cards, thumbnail for image
cards — is stored separately in a metadata record keyed by card id.

A **board** is a separate record that bundles a title, a saved timestamp, a
cover image, card counts, and a full copy of every card (its metadata plus
its blob) at the moment of saving. Boards are independent of the live wall:
saving never alters the wall, and opening a board replaces the wall's contents
with the stored copy.
