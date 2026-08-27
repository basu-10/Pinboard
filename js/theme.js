// Theme control: respects the OS `prefers-color-scheme` (the "system" state)
// and lets the user override it manually. The choice is persisted in
// localStorage. The three states cycle: system -> light -> dark -> system.
//
// An inline script in each HTML <head> sets `data-theme` before first paint to
// avoid a flash; this module takes over afterwards (button + OS changes).

const KEY = "pinboard-theme";
const ORDER = ["system", "light", "dark"];
const mq = window.matchMedia("(prefers-color-scheme: dark)");

let state = "system";
let btn = null;

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return ORDER.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

function write(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode / disabled storage: theme still works for this session */
  }
}

function effective(v) {
  if (v === "system") return mq.matches ? "dark" : "light";
  return v;
}

function apply() {
  state = read();
  document.documentElement.dataset.theme = effective(state);
}

const ICONS = {
  system:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v18a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm-1 9a9 9 0 0 0 0 10 9 9 0 0 1 0-10Z"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 16a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1ZM4.2 4.2a1 1 0 0 1 1.4 0l1.4 1.4A1 1 0 0 1 5.6 7L4.2 5.6a1 1 0 0 1 0-1.4Zm12.8 12.8a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4l-1.4-1.4a1 1 0 0 1 0-1.4ZM2 11h2a1 1 0 1 1 0 2H2a1 1 0 1 1 0-2Zm16 0h2a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2ZM4.2 19.8a1 1 0 0 1 0-1.4L5.6 17a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4 0ZM17 5.6 18.4 4.2a1 1 0 0 1 1.4 1.4L18.4 7A1 1 0 0 1 17 5.6Z"/></svg>',
  dark:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.7 2.3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg>',
};

function labelFor(v) {
  if (v === "system") return `Theme: system (currently ${mq.matches ? "dark" : "light"})`;
  return v === "dark" ? "Theme: dark" : "Theme: light";
}

function syncBtn() {
  if (!btn) return;
  btn.innerHTML = ICONS[state] || ICONS.system;
  btn.title = labelFor(state);
  btn.setAttribute("aria-label", labelFor(state));
  btn.setAttribute("aria-pressed", String(state === "dark"));
}

function cycle() {
  const next = ORDER[(ORDER.indexOf(state) + 1) % ORDER.length];
  write(next);
  apply();
  syncBtn();
}

export function initTheme() {
  apply();
  // Follow the OS only while the user hasn't chosen a fixed theme.
  const onOS = () => {
    if (read() === "system") {
      apply();
      syncBtn();
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", onOS);
  else if (mq.addListener) mq.addListener(onOS);
}

export function mountThemeToggle(el) {
  btn = el;
  el.addEventListener("click", cycle);
  syncBtn();
}
