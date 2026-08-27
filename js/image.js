import { putCard, deleteCard, getMeta, getBlob } from "./db.js";

let onChange = () => {};
let overlay = null;
let imgEl = null;
let titleEl = null;
let dlLink = null;
let fileInput = null;
let current = null; // { id, row, col, isNew }
let lastUrl = null;

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
  current = { id: uuid(), row, col, isNew: true };
  fileInput.value = "";
  fileInput.click();
}

export async function open(id) {
  const meta = await getMeta(id);
  if (!meta) return;
  const blob = await getBlob(id);
  if (!blob || !blob.imageBlob) return;
  current = { id, row: meta.row, col: meta.col, isNew: false };

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
  const { id, row, col } = current;
  try {
    const { blob, thumb } = await resizeImage(file);
    const meta = {
      id,
      row,
      col,
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
  } catch (err) {
    console.error(err);
    alert("Could not load that image.");
  }
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
