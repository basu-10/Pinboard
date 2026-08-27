import { putCard, deleteCard, getMeta, getBlob } from "./db.js";

let onChange = () => {};
let overlay = null;
let imgEl = null;
let titleEl = null;
let dlLink = null;
let fileInput = null;
let current = null; // { id, row, col, isNew }
let lastUrl = null;

// Cache full-size image blobs so the card can re-render them at any size
// without re-reading IndexedDB on every resize.
const blobCache = new Map(); // id -> Promise<Blob|null>
function getBlobCached(id) {
  if (!blobCache.has(id)) {
    blobCache.set(
      id,
      getBlob(id)
        .then((b) => (b && b.imageBlob ? b.imageBlob : null))
        .catch(() => null)
    );
  }
  return blobCache.get(id);
}

/**
 * Paint the card thumbnail from the stored (full-size) image blob, sized to the
 * card's on-screen pixels. This keeps the image crisp after the card is resized
 * instead of stretching the tiny 200px upload thumbnail. Never upscales past the
 * source image, so the canvas stays within the original (capped) resolution.
 */
export async function paintCardThumb(imgEl, id, cssW, cssH) {
  const blob = await getBlobCached(id);
  if (!blob) return;
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch (_) {
    const url = URL.createObjectURL(blob);
    imgEl.src = url;
    imgEl.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  let tw = Math.max(1, Math.round(cssW * dpr));
  let th = Math.max(1, Math.round(cssH * dpr));
  const fit = Math.min(1, tw / bmp.width, th / bmp.height);
  tw = Math.max(1, Math.round(bmp.width * fit));
  th = Math.max(1, Math.round(bmp.height * fit));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  const s = Math.max(tw / bmp.width, th / bmp.height);
  const dw = bmp.width * s;
  const dh = bmp.height * s;
  ctx.drawImage(bmp, (tw - dw) / 2, (th - dh) / 2, dw, dh);
  if (bmp.close) bmp.close();
  const url = canvas.toDataURL("image/webp", 0.9);
  imgEl.parentElement._lastThumb = url;
  imgEl.src = url;
}

export function init(opts) {
  onChange = opts.onChange;
  build();
}

function uuid() {
  return crypto.randomUUID();
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal viewer" role="dialog" aria-modal="true">
      <header class="modal-head">
        <span class="modal-title">Image</span>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </header>
      <div class="viewer-body"><img class="viewer-img" alt="" /></div>
      <footer class="modal-foot">
        <button class="btn-danger" type="button" data-act="delete">Delete</button>
        <span class="spacer"></span>
        <button class="btn-ghost" type="button" data-act="full">Full size</button>
        <a class="btn-accent" data-act="download">Download</a>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  imgEl = overlay.querySelector(".viewer-img");
  titleEl = overlay.querySelector(".modal-title");
  dlLink = overlay.querySelector('[data-act="download"]');

  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector('[data-act="full"]').addEventListener("click", openFull);
  overlay.querySelector('[data-act="delete"]').addEventListener("click", remove);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  fileInput.addEventListener("change", onFile);
}

export function openNew(row, col) {
  current = { id: uuid(), row, col, rowSpan: 1, colSpan: 1, isNew: true };
  fileInput.value = "";
  fileInput.click();
}

/** Create an image card directly from a File/Blob (skips the file picker). */
export async function pasteFile(file, row, col) {
  try {
    await createFromBlob(file, row, col);
  } catch (err) {
    console.error("Failed to paste image from clipboard:", err);
    alert("Could not load that image.");
  }
}

export async function open(id) {
  const meta = await getMeta(id);
  if (!meta) return;
  const blob = await getBlob(id);
  if (!blob || !blob.imageBlob) return;
  current = {
    id,
    row: meta.row,
    col: meta.col,
    rowSpan: meta.rowSpan || 1,
    colSpan: meta.colSpan || 1,
    isNew: false,
  };

  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob.imageBlob);

  imgEl.src = lastUrl;
  titleEl.textContent = meta.title || "Image";
  dlLink.href = lastUrl;
  dlLink.download = (meta.title || "image") + ext(blob.imageBlob.type);
  overlay.hidden = false;
}

async function onFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !current) return;
  const { row, col } = current;
  try {
    await createFromBlob(file, row, col);
  } catch (err) {
    console.error(err);
    alert("Could not load that image.");
  }
}

/** Build and store an image card from a File/Blob, then open the viewer. */
async function createFromBlob(file, row, col) {
  const id = uuid();
  current = { id, row, col, rowSpan: 1, colSpan: 1, isNew: true };
  const { blob, thumb } = await resizeImage(file);
  const meta = {
    id,
    row,
    col,
    rowSpan: current.rowSpan || 1,
    colSpan: current.colSpan || 1,
    type: "image",
    title: file.name || "image",
    preview: "",
    charCount: 0,
    thumb,
    updatedAt: Date.now(),
  };
  await putCard(meta, { id, imageBlob: blob });
  onChange(id);
  open(id);
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const maxW = 1920;
      const maxH = 1080;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      let blob = null;
      try {
        blob = await canvasToBlob(canvas, "image/webp", 0.9);
        if (!blob) blob = await canvasToBlob(canvas, "image/png");
        if (!blob) blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      } catch (e) {
        reject(e);
        return;
      }
      if (!blob) {
        reject(new Error("toBlob failed"));
        return;
      }
      const thumb = await makeThumb(img, 200);
      resolve({ blob, thumb });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      // Very old engines: synthesize a Blob from a data URL.
      try {
        const url = canvas.toDataURL(type, quality);
        const [head, b64] = url.split(",");
        const mime = (head.match(/:(.*?);/) || [])[1] || "image/png";
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: mime }));
      } catch (e) {
        reject(e);
      }
      return;
    }
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });
}

function makeThumb(img, tw) {
  return new Promise((resolve) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const th = Math.max(1, Math.round((tw * h) / w));
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    c.getContext("2d").drawImage(img, 0, 0, tw, th);
    let out = c.toDataURL("image/webp", 0.8);
    if (!out || out.indexOf("data:image/webp") !== 0) {
      out = c.toDataURL("image/jpeg", 0.8);
    }
    resolve(out);
  });
}

function openFull() {
  if (lastUrl) window.open(lastUrl, "_blank");
}

function ext(type) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return ".jpg";
}

async function remove() {
  if (!current) return;
  const id = current.id;
  await deleteCard(id);
  close();
  onChange(id);
}

function close() {
  overlay.hidden = true;
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }
  current = null;
}
