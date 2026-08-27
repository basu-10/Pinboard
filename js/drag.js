import { CELL } from "./state.js";

const DRAG_THRESHOLD = 3; // px before a press becomes a drag

// Shared across all drag sessions — a single ghost element reused so we never
// accumulate hidden nodes in the DOM.
let ghostEl = null;

function ensureGhost(cardsLayer) {
  if (ghostEl) return ghostEl;
  ghostEl = document.createElement("div");
  ghostEl.className = "card-ghost";
  ghostEl.hidden = true;
  cardsLayer.appendChild(ghostEl);
  return ghostEl;
}

/**
 * Encapsulates one card-drag lifecycle: press → move → commit/tap.
 *
 * Constructed on pointerdown. The unified pointerup handler resolves the
 * gesture: no movement past the threshold is a tap (delegated to `onTap`);
 * movement is a drag that commits the whole-cell move (delegated to
 * `onCommit`). All session state lives on the instance — no module-level
 * `drag` variable.
 */
export class DragSession {
  constructor({ el, card, startEvent, pointerWorld, isFree, cardsLayer, onCommit, onTap }) {
    this.el = el;
    this.card = card;
    this.pointerWorld = pointerWorld;
    this.isFree = isFree;
    this.cardsLayer = cardsLayer;
    this.onCommit = onCommit;
    this.onTap = onTap;

    const w = pointerWorld(startEvent);
    this.startWX = w.x;
    this.startWY = w.y;
    this.startCX = startEvent.clientX;
    this.startCY = startEvent.clientY;
    this.startRow = card.row;
    this.startCol = card.col;
    this.row = card.row;
    this.col = card.col;
    this.moved = false;

    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    window.addEventListener("pointercancel", this._onUp);
  }

  _showGhost(row, col) {
    const g = ensureGhost(this.cardsLayer);
    g.hidden = false;
    g.style.left = `${col * CELL + 8}px`;
    g.style.top = `${row * CELL + 8}px`;
    g.style.width = `${this.card.colSpan * CELL - 16}px`;
    g.style.height = `${this.card.rowSpan * CELL - 16}px`;
  }

  _hideGhost() {
    if (ghostEl) ghostEl.hidden = true;
  }

  _onMove(e) {
    if (!this.moved) {
      if (
        Math.hypot(e.clientX - this.startCX, e.clientY - this.startCY) <=
        DRAG_THRESHOLD
      ) {
        return;
      }
      this.moved = true;
      this.el.classList.add("card-dragging");
    }

    const w = this.pointerWorld(e);
    // Move by whole cells relative to where the drag began — never fractional.
    const dCol = Math.round((w.x - this.startWX) / CELL);
    const dRow = Math.round((w.y - this.startWY) / CELL);
    const col = Math.max(0, this.startCol + dCol);
    const row = Math.max(0, this.startRow + dRow);

    if (this.isFree(row, col, this.card)) {
      this.row = row;
      this.col = col;
      this.el.style.left = `${col * CELL + 8}px`;
      this.el.style.top = `${row * CELL + 8}px`;
      this.el.classList.remove("card-invalid");
      this._showGhost(row, col);
    } else {
      this.el.classList.add("card-invalid");
      this._hideGhost();
    }
  }

  async _onUp() {
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
    window.removeEventListener("pointercancel", this._onUp);
    this._hideGhost();
    this.el.classList.remove("card-dragging");

    if (!this.moved) {
      // No movement → this was a tap, open the editor for this card.
      this.onTap(this.card);
      return;
    }

    this.el.classList.remove("card-invalid");
    if (this.row !== this.startRow || this.col !== this.startCol) {
      await this.onCommit(this.card, this.startRow, this.startCol, this.row, this.col);
    }
  }
}
