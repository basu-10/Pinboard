// Corner "pan joystick" — a rate-based scroll control for the infinite board.
//
// Unlike a scrollbar (which needs bounded content to map a thumb to an absolute
// position) this is a *velocity* control: the knob's distance from its rest
// point sets the scroll speed in each axis, and release springs it back to
// center. That makes it a natural fit for an unbounded canvas, and it works
// identically for mouse, touch, and pen because it is built on Pointer Events
// with `touch-action: none`.
//
// The stick lives inside the viewport but isolates its own pointer gesture
// (stopPropagation + setPointerCapture), so it never triggers the canvas
// drag-pan and works even when drag-pan is unavailable.

import * as grid from "./grid.js";

const WELL = 96;          // px, the square track
const KNOB = 40;          // px, the draggable pill
const MAX_TRAVEL = (WELL - KNOB) / 2; // px the knob may move from center
const MAX_SPEED = 22;     // px scrolled per frame at full deflection
const DEAD_ZONE = 5;      // px slack at center so a near-still press won't drift
const EASE = 1.7;         // >1 → precise near center, fast at the edge

let viewEl = null;
let stickEl = null;
let knobEl = null;
let active = false;
let pointerId = null;
let cx = 0;               // well center, viewport coords
let cy = 0;
let vx = 0;               // current scroll velocity (px/frame)
let vy = 0;
let raf = 0;

export function initScrollStick(viewport) {
  viewEl = viewport;

  stickEl = document.createElement("div");
  stickEl.className = "scroll-stick";
  stickEl.setAttribute("role", "slider");
  stickEl.setAttribute("aria-label", "Pan the board");
  stickEl.setAttribute("aria-hidden", "true");
  stickEl.title = "Drag to pan the board";
  stickEl.innerHTML = `<span class="scroll-stick-knob"></span>`;
  viewport.appendChild(stickEl);
  knobEl = stickEl.querySelector(".scroll-stick-knob");

  // Keep the gesture local to the stick so it never starts a canvas pan.
  stickEl.addEventListener("pointerdown", onDown);
  stickEl.addEventListener("click", (e) => e.stopPropagation());
}

function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();

  active = true;
  pointerId = e.pointerId;
  const rect = stickEl.getBoundingClientRect();
  cx = rect.left + rect.width / 2;
  cy = rect.top + rect.height / 2;

  // Immediate follow while dragging; no spring transition.
  knobEl.style.transition = "none";

  try {
    stickEl.setPointerCapture(pointerId);
  } catch (_) {
    /* ignore */
  }

  stickEl.addEventListener("pointermove", onMove);
  stickEl.addEventListener("pointerup", onUp);
  stickEl.addEventListener("pointercancel", onUp);

  stickEl.classList.add("active");
  update(e.clientX, e.clientY);
  if (!raf) raf = requestAnimationFrame(tick);
}

function onMove(e) {
  if (!active || e.pointerId !== pointerId) return;
  e.stopPropagation();
  update(e.clientX, e.clientY);
}

function onUp(e) {
  if (e && e.pointerId !== pointerId) return;
  e && e.stopPropagation();
  active = false;
  vx = 0;
  vy = 0;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  stickEl.removeEventListener("pointermove", onMove);
  stickEl.removeEventListener("pointerup", onUp);
  stickEl.removeEventListener("pointercancel", onUp);
  stickEl.classList.remove("active");

  // Spring the knob back to center.
  knobEl.style.transition = "transform 0.18s cubic-bezier(.2,.8,.2,1)";
  knobEl.style.transform = "translate(0px, 0px)";
}

/** Map a raw offset (with a centered dead-zone) to eased 0..1 deflection. */
function deflection(offset) {
  const mag = Math.abs(offset);
  if (mag <= DEAD_ZONE) return 0;
  const t = Math.min(1, (mag - DEAD_ZONE) / (MAX_TRAVEL - DEAD_ZONE));
  return Math.sign(offset) * Math.pow(t, EASE) * MAX_SPEED;
}

/** Clamp a vector to MAX_TRAVEL and update knob + velocity. */
function update(clientX, clientY) {
  let dx = clientX - cx;
  let dy = clientY - cy;
  const mag = Math.hypot(dx, dy);
  if (mag > MAX_TRAVEL) {
    dx = (dx / mag) * MAX_TRAVEL;
    dy = (dy / mag) * MAX_TRAVEL;
  }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  vx = deflection(dx);
  vy = deflection(dy);
}

/** Per-frame scroll loop, driven only while the stick is held. */
function tick() {
  if (!active) {
    raf = 0;
    return;
  }
  if (vx !== 0 || vy !== 0) grid.panBy(vx, vy);
  raf = requestAnimationFrame(tick);
}
