import bwipjs from 'bwip-js';
import api from './api';
import { uploadFileToB2 } from './uploadB2';

// ---------------------------------------------------------------------------
// Media _qr converter. Mirrors bullstart's converter.composeImage: each design
// face is drawn onto a 3000×2100 canvas (the gangsheet design footprint) with
// a Code 128 barcode + code text panel stamped bottom-left, then exported as a
// PNG at 300 DPI. Output feeds straight into the gangsheet builder.
// ---------------------------------------------------------------------------

const TARGET_W = 3000;
const TARGET_H = 2100;

async function loadImage(url) {
  // Use the Electron main process to fetch bytes (bypasses B2 CORS) when
  // available; fall back to a direct <img> load in the browser.
  if (window.electronAPI?.fetchImage) {
    const { base64, contentType } = await window.electronAPI.fetchImage(url);
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:${contentType || 'image/png'};base64,${base64}`;
    });
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob null'))), type);
  });
}

function generateBarcodeCanvas(value, scale = 3) {
  const c = document.createElement('canvas');
  bwipjs.toCanvas(c, {
    bcid: 'code128',
    text: value,
    scale,
    height: 14,
    includetext: false,
    paddingwidth: 10,
    paddingheight: 4,
  });
  return c;
}

/**
 * Compose one design face → 3000×2100 PNG with a Code 128 barcode + code
 * text panel bottom-left. Portrait sources are rotated -90° to landscape so
 * they fill the footprint, same as bullstart.
 */
async function composeFace(sourceUrl, code) {
  const img = await loadImage(sourceUrl);
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const isPortrait = sourceW < sourceH;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = TARGET_H;
  const ctx = canvas.getContext('2d');

  if (isPortrait) {
    ctx.save();
    ctx.translate(TARGET_W / 2, TARGET_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -TARGET_H / 2, -TARGET_W / 2, TARGET_H, TARGET_W);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0, TARGET_W, TARGET_H);
  }

  // Barcode + code text panel, bottom-left (matches bullstart constants).
  const barcodeCanvas = generateBarcodeCanvas(code);
  const MARGIN_X = 190, MARGIN_Y = 60, PANEL_PAD = 10;
  const TEXT_H = 22, TEXT_TO_BAR = 6, BARCODE_W = 350, BARCODE_H = 130;

  ctx.font = 'bold 18px sans-serif';
  const innerW = Math.max(BARCODE_W, Math.ceil(ctx.measureText(code).width));
  const panelW = innerW + PANEL_PAD * 2;
  const panelH = TEXT_H + TEXT_TO_BAR + BARCODE_H + PANEL_PAD * 2;
  const panelX = MARGIN_X;
  const panelY = canvas.height - MARGIN_Y - panelH;

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText(code, panelX + PANEL_PAD + BARCODE_W / 2, panelY + PANEL_PAD);
  ctx.drawImage(barcodeCanvas, panelX + PANEL_PAD, panelY + PANEL_PAD + TEXT_H + TEXT_TO_BAR, BARCODE_W, BARCODE_H);

  const rawBlob = await canvasToBlob(canvas, 'image/png');
  return await setPngDpi(rawBlob, 300);
}

export async function convertDesign(design, onStep) {
  const out = {};
  if (design.front_url) {
    onStep?.(`#${design.code}: building front _qr…`);
    const blob = await composeFace(design.front_url, design.code);
    const { url } = await uploadFileToB2(blob, { folder: `qr/${design.code}`, filename: `${design.code}_front_qr.png` });
    out.front_qr = url;
  }
  if (design.back_url) {
    onStep?.(`#${design.code}: building back _qr…`);
    const blob = await composeFace(design.back_url, design.code);
    const { url } = await uploadFileToB2(blob, { folder: `qr/${design.code}`, filename: `${design.code}_back_qr.png` });
    out.back_qr = url;
  }
  await api.post(`/designs/${design.id}/qr`, out);
  return out;
}

export async function runConvertPass(onProgress) {
  if (!window.electronAPI?.s3Upload) {
    throw new Error('Cần mở từ desktop app (Electron) để build _qr + upload B2.');
  }
  const res = await api.get('/designs/pending-convert', { params: { per_page: 200 } });
  const designs = res.data.data || [];
  let done = 0, ok = 0, failed = 0;
  const errors = [];
  for (const d of designs) {
    try {
      await convertDesign(d, (msg) => onProgress?.({ done, total: designs.length, code: d.code, message: msg }));
      ok++;
    } catch (err) {
      failed++;
      errors.push(`#${d.code}: ${err.message || err}`);
    }
    done++;
    onProgress?.({ done, total: designs.length, code: d.code, message: '' });
  }
  return { total: designs.length, ok, failed, errors };
}

// --- PNG 300-DPI patch (pHYs chunk), copied from bullstart converter ---
async function setPngDpi(blob, dpi = 300) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const SIG_LEN = 8;
  const IHDR_END = SIG_LEN + 25;
  const stripped = stripPhysChunk(buf);

  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(4 + 4 + 9 + 4);
  phys[0] = 0; phys[1] = 0; phys[2] = 0; phys[3] = 9;
  phys[4] = 0x70; phys[5] = 0x48; phys[6] = 0x59; phys[7] = 0x73;
  const dv = new DataView(phys.buffer);
  dv.setUint32(8, ppm, false);
  dv.setUint32(12, ppm, false);
  phys[16] = 1;
  const crc = crc32(phys.subarray(4, 17));
  dv.setUint32(17, crc, false);

  const out = new Uint8Array(stripped.length + phys.length);
  out.set(stripped.subarray(0, IHDR_END), 0);
  out.set(phys, IHDR_END);
  out.set(stripped.subarray(IHDR_END), IHDR_END + phys.length);
  return new Blob([out], { type: 'image/png' });
}

function stripPhysChunk(buf) {
  let i = 8;
  while (i < buf.length) {
    const len = (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    const total = 4 + 4 + len + 4;
    if (type === 'pHYs') {
      const out = new Uint8Array(buf.length - total);
      out.set(buf.subarray(0, i), 0);
      out.set(buf.subarray(i + total), i);
      return out;
    }
    if (type === 'IEND') break;
    i += total;
  }
  return buf;
}

let _crcTable = null;
function crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (_crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
