# Pinboard — Product

## What it is

Pinboard is a single-page, browser-based workspace for collecting lightweight
pins — short text notes and images — arranged on an infinite, pannable grid.
It runs entirely client-side with no server, no build step, and no user
accounts. Everything the user creates is persisted in the browser via
IndexedDB, so each visitor keeps their own private board.

The experience is deliberately tactile: you pan by dragging empty space, place
new pins by hovering an empty cell and choosing from a contextual toolbar,
rearrange pins by dragging them, resize them with a right-click handle, and
edit their contents in a modal dialog. Pins snap to grid cells, never float
freely at fractional positions.

## Core interactions

### Placing pins

Hovering the cursor over an empty grid cell highlights that cell itself — the
cell lights up with an inset accent ring and a soft fill, and the three add
options are embedded directly inside the highlighted cell, so the action reads
as placing content into that specific cell. The choices are:

- **+ Note** — opens a text editor modal where you type a note. Saving stores
  it and returns to the board, where the note appears as a text pin showing its
  title (first line) and a clamped preview of its body.
- **Plain click on the highlighted cell** — clicking the cell itself (anywhere
  other than a specific button) falls back to **+ Note**, so a single click adds
  a note without aiming for a button. The explicit **+ Note**, **+ Image**, and
  **Paste** buttons choose their own type.

On a brand-new, empty board the dotted grid loads with no pins and a faint,
centered hint — "Hover a cell to add a note, image, or paste" — orienting first
time users. The hint disappears as soon as any pin exists anywhere on the board.
- **+ Image** — opens a file picker restricted to image types. The selected
  image is resized to a maximum of 1920×1080, stored as a full-resolution WebP
  blob, and displayed as a pin with a thumbnail and a download link. Clicking
  the pin opens a full-size viewer modal.
- **Paste** — reads from the system clipboard (requires permission in the
  browser). If the clipboard contains an image, it is placed as an image pin
  the same way the file picker works; if it contains text, it is placed as a
  note pin. If the clipboard cannot be read or contains unsupported content,
  the error is reported in the browser console rather than failing silently.
  While the paste is in progress the toolbar does not reappear until the
  operation settles.

### Moving pins

A left press on a pin begins a drag session. Small movements within a
3-pixel radius are treated as a tap rather than a drag. Once movement exceeds
that threshold, the pin follows the cursor, snapping to whole grid cells —
it never lands at a fractional cell offset. A live ghost preview shows where
the pin will drop, colored to indicate whether the target cell is valid or
occupied. Releasing the pointer commits the move; the pin's new position is
written to IndexedDB and the board re-renders at the new location.

### Opening / editing pins

A click (press without movement) on a pin opens its editor modal. For text
pins this is a textarea with a character-count preview note; for image pins
this is a full-size viewer with a download link and delete button. Changes are
saved on confirmation.

### Coloring pins

Each pin can be given an accent color to help organize the board visually. The
note editor and the image viewer both include a color picker offering three
palettes of ten preset swatches (Soft, Vivid, and Earth) plus a "None" option
to clear the color. For text notes the chosen color is saved with the note; for
image pins it is applied immediately. A colored pin shows a tinted card
background and a colored ring around its border, so the accent reads clearly on
both text and image cards.

### Resizing pins

Right-clicking a pin toggles resize handles on its east, south, and
south-east edges. Dragging a handle resizes the pin by whole grid cells,
respecting the board's occupied-cell grid so pins never overlap. The new span
is persisted on release.

### Undo / redo

Every change to the board — placing, moving, resizing, editing, or deleting a
pin — can be undone and redone. The top bar has dedicated undo and redo
buttons (disabled when there is nothing to undo/redo), and the standard
keyboard shortcuts work: **Ctrl+Z** (undo) and **Ctrl+Y** or **Ctrl+Shift+Z**
(redo). Accidental drags and deletes are fully reversible.

### Panning the canvas

Dragging on empty space (not on a pin or the cell toolbar) pans the
viewport. Keyboard arrow keys pan by one cell, or by a larger step while
shifting. The grid is dotted and scrolls infinitely in all directions.

### Group navigation and the minimap

Pins that sit near each other on the grid are clustered into **groups** (a
loose cluster of adjacent pins). A navigation panel in the corner of the board
always shows the group count and the current group's position within it, with
previous/next buttons that fly the camera to each group in turn.

The minimap — a small overview of every group plus a viewport indicator — is
**collapsed by default** so the panel stays unobtrusive and only the navigation
header (title, count, and the group buttons) is visible. A chevron toggle on the
header slides the minimap open and closed manually; the open/closed state is
reflected by the chevron's orientation. While you are panning or otherwise
moving the camera, the minimap briefly slides itself open for added spatial
awareness and then collapses again on its own once you stop moving. Clicking a
group in the minimap, or clicking empty space in it, flies the camera to that
group. When the viewport drifts away from all content, a "Return to content"
pill appears to bring you back.

Two extra controls sit in the navigation header alongside the prev/next
buttons. A **Jump** button opens a popover that lists the groups you have
visited most recently, newest first, each showing its group number and grid
position; clicking one flies the camera straight to that group. The minimap
also rings the most recently visited group so you can see where you just were.
A **Zoom to fit all** button flies the camera to the center of every group at
once, so the whole board's content comes back into view no matter how far you
have panned.

### Searching notes

The board hides a **magnifying-glass** button in the top bar. It is not a
permanently visible search box — pressing the icon slides a search panel out
from the left edge of the screen. The panel has a text field and a **scope**
selector that lets you choose where to look: the note title and body together,
the title only, or the body only. As you type, Pinboard searches the full text
of every note (already held in memory after first render, so it does not
re-read the database on each keystroke) and lists each matching note with its
title, a short snippet of the body with the matched term highlighted, and the
note's grid position. Clicking a result flies the camera to that note and
opens it, so you can jump from a search hit straight to the pin.

## Saving to the library

While working in the board, you can give it a title (the "Board title" field in
 the top bar) and press the save icon to snapshot the current board into a
saved **board**. A board captures every pin — notes, images, positions, and sizes —
along with a title, so the moment is preserved exactly as laid out. Saved
boards are listed in the **Library** (open it from the top bar or the landing
page), where each one shows a cover preview, its pin counts, and the last
time it was saved.

From the Library you can **Open** a board — this loads it back onto the board,
replacing the current pins — or **Delete** it. Opening a board is a one-way
swap of the working board, so the app confirms before overwriting anything
already on the canvas.

### Backing up and moving boards

Each saved board in the Library carries two extra actions so your work can
leave the browser and come back:

- **Backup** exports the entire board — every pin's text and every image blob —
  as a single self-contained JSON file. This is a full, lossless snapshot you can
  keep as a long-term backup or move between browsers and devices.
- **Import backup** (in the Library header) reads one of those JSON files and
  adds the board back into the Library. Imported boards get a fresh identity, so
  an import never silently overwrites a board you already have.
- **Save as zip** flattens the board into plain files: each note becomes a
  `.txt` file and each image becomes a `.png` or `.jpg` file, all collected into
  a single zip archive named after the board. This is the easiest way to get your
  content out as ordinary, openable files.

## Landing and navigation

The app opens on a landing page with two entry points: **Open Board** drops you
straight into the pannable canvas, and **My Library** shows every saved board.
The board and the library share the same browser storage, so boards saved on one
device in a given browser are visible in the library on that same browser.

## Data model

Each pin has a type (text or image) and a grid position (row, column) plus
an optional span (colSpan, rowSpan, both defaulting to 1). Text pins store
their full body in a blob; image pins store a full-resolution image blob
alongside a small thumbnail data URL used in the grid view. Metadata —
position, span, title, character count for text pins, thumbnail for image
pins, and an optional accent color for any pin — is stored separately in a
metadata record keyed by pin id.

A **board** is a separate record that bundles a title, a saved timestamp, a
cover image, pin counts, and a full copy of every pin (its metadata plus
its blob) at the moment of saving. Boards are independent of the live board:
saving never alters the board, and opening a board replaces the board's contents
with the stored copy.
