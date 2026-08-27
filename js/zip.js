// Minimal, dependency-free ZIP writer using the STORE method (no compression).
// Enough to package text + image files into a .zip the browser can download and
// any standard unzip tool can open. Filenames are flagged as UTF-8.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive.
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Promise<Blob>} a Blob with type "application/zip"
 */
export async function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    // --- local file header ---
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0x0800, true); // general purpose flag: UTF-8 names
    lv.setUint16(8, 0, true); // compression method: store
    lv.setUint16(10, 0, true); // last mod file time
    lv.setUint16(12, 0, true); // last mod file date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    const localOffset = offset;
    chunks.push(local, data);
    offset += local.length + data.length;

    // --- central directory header ---
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central file header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // general purpose flag: UTF-8
    cv.setUint16(10, 0, true); // compression method: store
    cv.setUint16(12, 0, true); // last mod time
    cv.setUint16(14, 0, true); // last mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); // compressed size
    cv.setUint32(24, size, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra field length
    cv.setUint16(32, 0, true); // file comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal file attributes
    cv.setUint32(38, 0, true); // external file attributes
    cv.setUint32(42, localOffset, true); // relative offset of local header
    cd.set(nameBytes, 46);
    central.push(cd);
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const cd of central) {
    chunks.push(cd);
    centralSize += cd.length;
    offset += cd.length;
  }

  // --- end of central directory record ---
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(4, 0, true); // number of this disk
  ev.setUint16(6, 0, true); // disk with start of central dir
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true); // comment length
  chunks.push(eocd);

  return new Blob(chunks, { type: "application/zip" });
}
