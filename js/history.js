import { putCard, deleteCard, updateCardPosition, updateCardSpan } from "./db.js";

const MAX_HISTORY = 100;
const undoStack = [];
const redoStack = [];
let notify = () => {};
let undoBtn = null;
let redoBtn = null;

export function initHistory({ onChange }) {
  notify = onChange;
}

function updateButtons() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

export function setHistoryButtons(undo, redo) {
  undoBtn = undo;
  redoBtn = redo;
  updateButtons();
}

function pushCommand(cmd) {
  undoStack.push(cmd);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateButtons();
}

function makeAddCard(meta, blob) {
  return {
    undo: async () => { await deleteCard(meta.id); notify(meta.id); },
    redo: async () => { await putCard(meta, blob); notify(meta.id); },
  };
}

function makeDeleteCard(meta, blob) {
  return {
    undo: async () => { await putCard(meta, blob); notify(meta.id); },
    redo: async () => { await deleteCard(meta.id); notify(meta.id); },
  };
}

function makeMoveCard(id, fromRow, fromCol, toRow, toCol) {
  return {
    undo: async () => { await updateCardPosition(id, fromRow, fromCol); notify(id); },
    redo: async () => { await updateCardPosition(id, toRow, toCol); notify(id); },
  };
}

function makeResizeCard(id, fromColSpan, fromRowSpan, toColSpan, toRowSpan) {
  return {
    undo: async () => { await updateCardSpan(id, fromColSpan, fromRowSpan); notify(id); },
    redo: async () => { await updateCardSpan(id, toColSpan, toRowSpan); notify(id); },
  };
}

function makeEditCard(oldMeta, oldBlob, newMeta, newBlob) {
  return {
    undo: async () => { await putCard(oldMeta, oldBlob); notify(oldMeta.id); },
    redo: async () => { await putCard(newMeta, newBlob); notify(newMeta.id); },
  };
}

export function recordAddCard(meta, blob) {
  pushCommand(makeAddCard(meta, blob));
}

export function recordDeleteCard(meta, blob) {
  pushCommand(makeDeleteCard(meta, blob));
}

export function recordMoveCard(id, fromRow, fromCol, toRow, toCol) {
  pushCommand(makeMoveCard(id, fromRow, fromCol, toRow, toCol));
}

export function recordResizeCard(id, fromColSpan, fromRowSpan, toColSpan, toRowSpan) {
  pushCommand(makeResizeCard(id, fromColSpan, fromRowSpan, toColSpan, toRowSpan));
}

export function recordEditCard(oldMeta, oldBlob, newMeta, newBlob) {
  pushCommand(makeEditCard(oldMeta, oldBlob, newMeta, newBlob));
}

export async function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return;
  await cmd.undo();
  redoStack.push(cmd);
  updateButtons();
}

export async function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return;
  await cmd.redo();
  undoStack.push(cmd);
  updateButtons();
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateButtons();
}
