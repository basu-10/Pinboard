import { state, computeWindow } from "./state.js";

let viewportEl = null;
let worldEl = null;
let onWindowChange = null;
let cameraCb = null;
let animTimer = null;
let dragging = false;
let moved = false;
let dragStart = null;

export function init(viewport, world, opts) {
  viewportEl = viewport;
  worldEl = world;
  onWindowChange = opts.onWindowChange;

  viewport.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", () => {
    measure();
    applyPan();
  });

  measure();
  applyPan();
}

function measure() {
  state.viewportW = viewportEl.clientWidth;
  state.viewportH = viewportEl.clientHeight;
}

function applyPan() {
  worldEl.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
  viewportEl.style.backgroundPosition =
    `${state.panX}px ${state.panY}px`;

  const w = computeWindow(state.panX, state.panY, state.viewportW, state.viewportH);
  const changed =
    w.rowMin !== state.rowMin ||
    w.rowMax !== state.rowMax ||
    w.colMin !== state.colMin ||
    w.colMax !== state.colMax;

  Object.assign(state, w);
  if (changed && onWindowChange) onWindowChange(w);
  if (cameraCb) cameraCb();
}

/** Register a listener fired after every camera (pan) change. */
export function subscribe(cb) {
  cameraCb = cb;
}

/** Current camera + viewport geometry. */
export function getView() {
  return {
    panX: state.panX,
    panY: state.panY,
    vw: state.viewportW,
    vh: state.viewportH,
  };
}

/**
 * Set the camera position. When `animate` is true the move eases so the user
 * sees a "fly to" rather than a jump. The class is added to both the world
 * (cards) and the viewport (dotted grid) so they travel together.
 */
export function setPan(x, y, animate = false) {
  if (animate) {
    worldEl.classList.add("animating");
    viewportEl.classList.add("animating");
  }
  state.panX = x;
  state.panY = y;
  applyPan();
  if (animate) {
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      worldEl.classList.remove("animating");
      viewportEl.classList.remove("animating");
      if (cameraCb) cameraCb(); // re-sync indicators once motion settles
    }, 480);
  }
}

export function panBy(dx, dy) {
  state.panX += dx;
  state.panY += dy;
  applyPan();
}

/** True once after a drag that actually moved (used to swallow the trailing click). */
export function didPan() {
  const v = moved;
  moved = false;
  return v;
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest(".card") || e.target.closest(".cell-add")) return;
  dragging = true;
  moved = false;
  dragStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
  viewportEl.classList.add("grabbing");
}

function onPointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
  state.panX = dragStart.panX + dx;
  state.panY = dragStart.panY + dy;
  applyPan();
}

function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  viewportEl.classList.remove("grabbing");
}

function onWheel(e) {
  e.preventDefault();
  if (e.shiftKey) panBy(-e.deltaY, 0);
  else panBy(-e.deltaX, -e.deltaY);
}
