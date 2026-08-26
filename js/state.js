export const CELL = 240;
export const BUFFER = 2;

export const state = {
  panX: 0,
  panY: 0,
  viewportW: 0,
  viewportH: 0,
  rowMin: 0,
  rowMax: 0,
  colMin: 0,
  colMax: 0,
};

/** Visible cell window (row/col range) for a given pan + viewport size. */
export function computeWindow(panX, panY, vw, vh) {
  const colMin = Math.floor(-panX / CELL) - BUFFER;
  const colMax = Math.floor((vw - panX) / CELL) + BUFFER;
  const rowMin = Math.floor(-panY / CELL) - BUFFER;
  const rowMax = Math.floor((vh - panY) / CELL) + BUFFER;
  return { rowMin, rowMax, colMin, colMax };
}
