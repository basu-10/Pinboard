// Backup / restore / export helpers for the Library page.
//
//  - exportBoardJSON : serialize a board (incl. image blobs) to a JSON file for
//    backup. Blobs are embedded as data URLs so the file is self-contained.
//  - importBoardJSON : read such a JSON file and add the board back to the
//    library (a fresh id is assigned to avoid clobbering an existing board).
//  - exportBoardZip  : flatten every pin into a .txt (notes) or .png/.jpg
//    (images) file, packaged into a single .zip named after the board.

import { putBoard } from "./db.js";
import { makeZip } from "./zip.js";

const BACKUP_FORMAT = "pinboard-board-backup";
const BACKUP_VERSION = 1;

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name) {
  return (name || "board").replace(/[\\/:*?"<>|]+/g, "_").trim() || "board";
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [head, b64] = dataURL.split(",");
  const mime = (head.match(/:(.*?);/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Convert an image blob to PNG (or keep JPEG) so the zip holds png/jpg only. */
async function normalizeImageBlob(blob) {
  const type = (blob && blob.type) || "";
  if (type === "image/jpeg") return { blob, ext: ".jpg" };
  if (type === "image/png") return { blob, ext: ".png" };
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width || 1;
    canvas.height = bmp.height || 1;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    const png = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (png) return { blob: png, ext: ".png" };
  } catch (err) {
    console.error("Image could not be re-encoded; keeping original:", err);
  }
  return { blob, ext: ".png" };
}

async function serializeCards(board) {
  const cards = [];
  for (const c of board.cards || []) {
    const meta = c.meta;
    let blob = c.blob;
    if (blob && blob.imageBlob instanceof Blob) {
      blob = { id: blob.id, imageBlob: await blobToDataURL(blob.imageBlob) };
    }
    cards.push({ meta, blob });
  }
  return cards;
}

async function deserializeCards(board) {
  const cards = [];
  for (const c of board.cards || []) {
    const meta = c.meta;
    let blob = c.blob;
    if (blob && typeof blob.imageBlob === "string") {
      blob = { id: blob.id, imageBlob: dataURLToBlob(blob.imageBlob) };
    }
    cards.push({ meta, blob });
  }
  return cards;
}

/** Download a self-contained JSON backup of a board. */
export async function exportBoardJSON(board) {
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    board: {
      ...board,
      cards: await serializeCards(board),
    },
  };
  const json = JSON.stringify(payload, null, 2);
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    `${safeName(board.title)}.json`
  );
}

/**
 * Read a JSON backup file and add it to the library.
 * Returns the stored board (with a freshly assigned id).
 */
export async function importBoardJSON(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error("The file is not valid JSON.");
  }
  if (!payload || payload.format !== BACKUP_FORMAT || !payload.board) {
    throw new Error("This file is not a Pinboard backup.");
  }
  const board = payload.board;
  board.id = crypto.randomUUID();
  board.createdAt = board.createdAt || Date.now();
  board.updatedAt = Date.now();
  board.cards = await deserializeCards(board);
  await putBoard(board);
  return board;
}

/** Package every pin as a .txt/.png file into a single board-named .zip. */
export async function exportBoardZip(board) {
  const files = [];
  for (const c of board.cards || []) {
    const m = c.meta || {};
    const name = `r${m.row ?? 0}_c${m.col ?? 0}`;
    if (m.type === "image") {
      const imgBlob = c.blob && c.blob.imageBlob;
      if (!(imgBlob instanceof Blob)) continue;
      const { blob, ext } = await normalizeImageBlob(imgBlob);
      files.push({
        name: `images/image_${name}${ext}`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    } else {
      const text = (c.blob && c.blob.text) || "";
      files.push({
        name: `notes/note_${name}.txt`,
        data: new TextEncoder().encode(text),
      });
    }
  }
  if (files.length === 0) {
    throw new Error("This board has no pins to export.");
  }
  const zip = await makeZip(files);
  downloadBlob(zip, `${safeName(board.title)}.zip`);
}
