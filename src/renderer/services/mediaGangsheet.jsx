import { PDFDocument } from 'pdf-lib';

// Pixel-only layout, mirroring bullstart's gangsheetBuilder. Each design face
// (_qr) becomes ONE full PDF page: the artwork is drawn centered on a fixed
// 3300×2550 canvas (Letter landscape @ 300 DPI) with registration marks in
// the margin, then the canvas is embedded as a single PNG page.
const DPI = 300;
const PT_PER_IN = 72;

const CANVAS_W = 3300;
const CANVAS_H = 2550;

const DESIGN_W = 3000;
const DESIGN_H = 2100;
const DESIGN_X = (CANVAS_W - DESIGN_W) / 2;   // 150
const DESIGN_Y = 150;                         // 0.5 in from top

const MARK_GAP = 30;
const MARK_ARM = 90;
const MARK_THICK = 10;
const CENTER_TICK = 70;

const PAGE_W_PT = (CANVAS_W / DPI) * PT_PER_IN;   // 792
const PAGE_H_PT = (CANVAS_H / DPI) * PT_PER_IN;   // 612

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fetchImageBytes(url) {
  if (window.electronAPI?.fetchImage) {
    const { base64 } = await window.electronAPI.fetchImage(url);
    return base64ToBytes(base64);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function loadImageFromBytes(bytes) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), type);
  });
}

// Corner L-marks + top/bottom center ticks around the design footprint.
function drawAlignmentMarks(ctx) {
  ctx.save();
  ctx.fillStyle = '#000000';

  const dx1 = DESIGN_X, dy1 = DESIGN_Y;
  const dx2 = DESIGN_X + DESIGN_W, dy2 = DESIGN_Y + DESIGN_H;
  const cx = (dx1 + dx2) / 2;

  const drawCornerL = (ix, iy, sx, sy) => {
    const hx = sx > 0 ? ix : ix - MARK_ARM;
    const hy = sy > 0 ? iy - MARK_THICK : iy;
    ctx.fillRect(hx, hy, MARK_ARM, MARK_THICK);
    const vx = sx > 0 ? ix - MARK_THICK : ix;
    const vy = sy > 0 ? iy : iy - MARK_ARM;
    ctx.fillRect(vx, vy, MARK_THICK, MARK_ARM);
  };

  drawCornerL(dx1 - MARK_GAP, dy1 - MARK_GAP, -1, -1);
  drawCornerL(dx2 + MARK_GAP, dy1 - MARK_GAP, +1, -1);
  drawCornerL(dx1 - MARK_GAP, dy2 + MARK_GAP, -1, +1);
  drawCornerL(dx2 + MARK_GAP, dy2 + MARK_GAP, +1, +1);

  ctx.fillRect(cx - MARK_THICK / 2, dy1 - MARK_GAP - CENTER_TICK, MARK_THICK, CENTER_TICK);
  ctx.fillRect(cx - MARK_THICK / 2, dy2 + MARK_GAP, MARK_THICK, CENTER_TICK);

  ctx.restore();
}

/**
 * Build the gangsheet PDF — one page per design face (_qr), each centered on
 * the canvas with alignment marks. Faces are ordered front then back, design
 * after design.
 *
 * @param {Array} designs  selected design rows (front_qr / back_qr)
 * @param {{ onProgress?: (p)=>void }} opts
 * @returns {{ blob, faces, firstCode, lastCode, designIds }}
 */
export async function buildMediaGangsheet(designs, { onProgress } = {}) {
  const faces = [];
  for (const d of designs) {
    if (d.front_qr) faces.push({ code: d.code, url: d.front_qr });
    if (d.back_qr)  faces.push({ code: d.code, url: d.back_qr });
  }
  if (faces.length === 0) throw new Error('Không có _qr nào để gộp (các design chưa convert?).');

  const pdf = await PDFDocument.create();

  // Reuse one canvas across all pages.
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  let done = 0;
  for (const face of faces) {
    onProgress?.({ done, total: faces.length, code: face.code });

    const bytes = await fetchImageBytes(face.url);
    const img = await loadImageFromBytes(bytes);

    // 1. White background.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // 2. Design centered at fixed footprint.
    ctx.drawImage(img, DESIGN_X, DESIGN_Y, DESIGN_W, DESIGN_H);
    // 3. Registration marks.
    drawAlignmentMarks(ctx);

    // 4. Snapshot → embed as a full PDF page.
    const blob = await canvasToBlob(canvas, 'image/png');
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const pageImg = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT]);
    page.drawImage(pageImg, { x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT });

    done++;
    onProgress?.({ done, total: faces.length, code: face.code });
  }

  const pdfBytes = await pdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  const codes = designs.map(d => d.code);
  return {
    blob,
    faces: faces.length,
    firstCode: codes[0] || '',
    lastCode: codes[codes.length - 1] || '',
    designIds: designs.map(d => d.id),
  };
}

// MMMDD upper, e.g. MAY28
function shortDate(d = new Date()) {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${m[d.getMonth()]}${String(d.getDate()).padStart(2, '0')}`;
}

export function mediaGangsheetFilename({ firstCode, lastCode, designsCount, facesCount }) {
  const a = (firstCode || 'X').replace(/[^a-zA-Z0-9_-]/g, '');
  const b = (lastCode || 'X').replace(/[^a-zA-Z0-9_-]/g, '');
  return `MEDIA_${a}-${b}_${designsCount}d_${facesCount}f_${shortDate()}.pdf`;
}
