import QRCode from 'qrcode';
import api from './api';
import { uploadFileToB2 } from './uploadB2';

// ---------------------------------------------------------------------------
// Media _qr converter. Fetches designs that still need _qr, overlays a small
// QR (encoding the design code) onto each uploaded face, uploads the result
// to B2, and saves the URLs back. Runs in the renderer (needs canvas + the
// Electron s3 bridge).
// ---------------------------------------------------------------------------

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

async function generateQrCanvas(value, size = 160) {
  const c = document.createElement('canvas');
  await QRCode.toCanvas(c, value, {
    width: size, margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return c;
}

// Overlay a QR + code text band at the bottom-left of a design image.
async function composeQrFace(sourceUrl, code) {
  const img = await loadImage(sourceUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const fontSize = Math.max(24, Math.round(w * 0.03));
  const qrSize = Math.max(120, Math.round(w * 0.11));
  const qr = await generateQrCanvas(code, qrSize);

  const pad = Math.round(fontSize * 0.45);
  const gap = Math.round(fontSize * 0.3);
  ctx.font = `bold ${fontSize}px sans-serif`;
  const textW = Math.ceil(ctx.measureText(code).width);
  const innerW = Math.max(qr.width, textW);
  const panelW = innerW + pad * 2;
  const panelH = fontSize + gap + qr.height + pad * 2;
  const margin = Math.round(fontSize * 0.5);
  const px = margin, py = h - panelH - margin;

  ctx.fillStyle = '#fff'; ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(px, py, panelW, panelH);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillText(code, px + pad, py + pad);
  ctx.drawImage(qr, px + pad, py + pad + fontSize + gap, qr.width, qr.height);

  return await canvasToBlob(canvas, 'image/jpeg', 0.95);
}

/**
 * Convert one design — build _qr for whichever faces (front/back) have an
 * uploaded image, upload them, and POST the URLs back.
 */
export async function convertDesign(design, onStep) {
  const out = {};
  if (design.front_url) {
    onStep?.(`#${design.code}: building front _qr…`);
    const blob = await composeQrFace(design.front_url, design.code);
    const { url } = await uploadFileToB2(blob, { folder: `qr/${design.code}`, filename: `${design.code}_front_qr.jpg` });
    out.front_qr = url;
  }
  if (design.back_url) {
    onStep?.(`#${design.code}: building back _qr…`);
    const blob = await composeQrFace(design.back_url, design.code);
    const { url } = await uploadFileToB2(blob, { folder: `qr/${design.code}`, filename: `${design.code}_back_qr.jpg` });
    out.back_qr = url;
  }
  await api.post(`/designs/${design.id}/qr`, out);
  return out;
}

/**
 * Run a full convert pass over all pending designs. Returns a summary.
 * onProgress({ done, total, code, message }) for UI updates.
 */
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
