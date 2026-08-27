// Browser storage is finite. IndexedDB writes can fail with a quota error when
// the origin runs out of space. This module (1) estimates current usage so the
// UI can warn before a write fails, and (2) detects quota failures and surfaces
// a clear, actionable modal instead of a silent loss of data.
//
// db.js translates quota failures into `QuotaError`, so callers can route them
// here via `reportWriteError`.

const WARN_RATIO = 0.85;
const WARN_COOLDOWN = 30 * 1000;
let lastWarned = 0;

export class QuotaError extends Error {
  constructor(cause) {
    super("Your browser storage is full, so this change couldn't be saved.");
    this.name = "QuotaError";
    this.cause = cause || null;
  }
}

export function isQuotaError(err) {
  if (!err) return false;
  const name = err.name || "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("exceeded") ||
    msg.includes("reach the quota")
  );
}

export async function estimateUsage() {
  if (navigator.storage && typeof navigator.storage.estimate === "function") {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    } catch (e) {
      console.error("Could not estimate storage usage:", e);
    }
  }
  return { usage: 0, quota: 0 };
}

function fmtBytes(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

let overlay = null;
let titleEl = null;
let msgEl = null;
let barFill = null;
let labelEl = null;
let adviceEl = null;
let okBtn = null;

function buildModal() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.className = "modal-overlay quota-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal quota-modal" role="dialog" aria-modal="true" aria-labelledby="quotaTitle">
      <header class="modal-head">
        <span class="modal-title" id="quotaTitle"></span>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </header>
      <p class="quota-msg"></p>
      <div class="quota-usage">
        <div class="quota-bar"><div class="quota-bar-fill"></div></div>
        <p class="quota-label"></p>
      </div>
      <p class="quota-advice"></p>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button class="btn-accent quota-ok" type="button">Got it</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  titleEl = overlay.querySelector(".modal-title");
  msgEl = overlay.querySelector(".quota-msg");
  barFill = overlay.querySelector(".quota-bar-fill");
  labelEl = overlay.querySelector(".quota-label");
  adviceEl = overlay.querySelector(".quota-advice");
  okBtn = overlay.querySelector(".quota-ok");

  const close = () => (overlay.hidden = true);
  overlay.querySelector(".modal-close").addEventListener("click", close);
  okBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

async function renderUsage({ near }) {
  const { usage, quota } = await estimateUsage();
  if (quota > 0) {
    const pct = Math.min(1, usage / quota);
    barFill.style.width = (pct * 100).toFixed(1) + "%";
    barFill.classList.toggle("is-near", near || pct >= WARN_RATIO);
    labelEl.textContent = `${fmtBytes(usage)} of ${fmtBytes(quota)} used`;
  } else {
    barFill.style.width = "0%";
    barFill.classList.toggle("is-near", false);
    labelEl.textContent = "Storage usage couldn't be measured in this browser.";
  }
}

async function showModal({ title, message, advice, near }) {
  buildModal();
  titleEl.textContent = title;
  msgEl.textContent = message;
  adviceEl.textContent = advice || "";
  adviceEl.hidden = !advice;
  await renderUsage({ near });
  overlay.hidden = false;
}

// Non-blocking heads-up shown *before* a write when storage is nearly full.
export async function warnBeforeWrite() {
  const { usage, quota } = await estimateUsage();
  if (!quota || usage / quota < WARN_RATIO) return;
  const now = Date.now();
  if (now - lastWarned < WARN_COOLDOWN) return;
  lastWarned = now;
  await showModal({
    title: "Storage is almost full",
    message:
      "Your browser is running low on storage for this site. The next save or import may fail.",
    advice:
      "Free up space by opening the Library and deleting boards you no longer need, or export a board as a backup before adding more.",
    near: true,
  });
}

// Blocking error shown *after* a write actually fails because storage is full.
export async function showQuotaError() {
  lastWarned = Date.now();
  await showModal({
    title: "Storage full — change not saved",
    message: "Your browser storage is full, so this change couldn't be saved.",
    advice:
      "Open the Library and delete boards you no longer need, or export a board as a JSON backup, then try again.",
    near: true,
  });
}

// Returns true (and shows the modal) if `err` was a quota failure; callers then
// skip their generic error handling. Returns false for any other error.
export function reportWriteError(err) {
  if (isQuotaError(err) || err instanceof QuotaError) {
    showQuotaError();
    return true;
  }
  return false;
}

// Safety net: catch any quota failure that escapes a local try/catch (e.g. a
// single note/image add) and surface it instead of silently losing the data.
export function installGlobalGuard() {
  window.addEventListener("unhandledrejection", (e) => {
    const err = e && e.reason;
    if (err instanceof QuotaError || isQuotaError(err)) {
      if (e.preventDefault) e.preventDefault();
      showQuotaError();
    }
  });
}
