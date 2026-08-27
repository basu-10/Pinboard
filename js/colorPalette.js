// Preset pin colors, grouped into three palettes of ten swatches each.
// Kept light/medium so the colored card's tinted background stays readable
// with the default dark ink.
export const PALETTES = [
  [
    "#FFD6DD",
    "#FFE0B5",
    "#FFF1B8",
    "#D7F0C2",
    "#C9E9F6",
    "#DDD3F5",
    "#F7D0E6",
    "#CDEFE3",
    "#EAD9C4",
    "#D9DEE3",
  ],
  [
    "#FF8FA3",
    "#FFB27D",
    "#FFD43B",
    "#8CE99A",
    "#63D2FF",
    "#B197FC",
    "#F783C2",
    "#38D9C9",
    "#FFA8A8",
    "#91A7FF",
  ],
  [
    "#E5C9A8",
    "#D6B98C",
    "#A8C9A3",
    "#BFD0AE",
    "#CDBBA3",
    "#D9A5A5",
    "#AFC2D6",
    "#C9B98E",
    "#A6B5A0",
    "#E0C9A8",
  ],
];

/**
 * Build a color picker and mount it wherever the caller chooses.
 * `onPick(hex)` fires with a hex string on swatch click, or `null` when the
 * "None" control is clicked. `select(hex)` reflects the active choice in the UI.
 */
export function createColorPicker({ onPick }) {
  const root = document.createElement("div");
  root.className = "color-picker";
  root.innerHTML = `
    <div class="color-picker-head">
      <span>Color</span>
      <button type="button" class="color-clear" title="No color">None</button>
    </div>
    <div class="color-palettes"></div>`;

  const palettesEl = root.querySelector(".color-palettes");
  const clearBtn = root.querySelector(".color-clear");
  const swatches = [];

  PALETTES.forEach((palette) => {
    const row = document.createElement("div");
    row.className = "color-palette";
    palette.forEach((hex) => {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "color-swatch";
      sw.style.background = hex;
      sw.dataset.color = hex;
      sw.setAttribute("aria-label", `Color ${hex}`);
      sw.addEventListener("click", () => onPick(hex));
      row.appendChild(sw);
      swatches.push(sw);
    });
    palettesEl.appendChild(row);
  });

  clearBtn.addEventListener("click", () => onPick(null));

  function select(color) {
    swatches.forEach((s) =>
      s.classList.toggle("is-selected", !!color && s.dataset.color === color)
    );
    clearBtn.classList.toggle("is-active", !color);
  }

  return { root, select };
}
