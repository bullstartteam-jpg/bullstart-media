import { PDFDocument } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Compose selected designs' _qr faces into a single gangsheet PDF. Each face
// (front_qr / back_qr) becomes one image placed in a grid. Images are fetched
// via the Electron main process (bypasses B2 CORS) when available.
// ---------------------------------------------------------------------------

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

async function embedAuto(pdf, bytes) {
  // Try PNG first, fall back to JPG.
  try { return await pdf.embedPng(bytes); }
  catch { return await pdf.embedJpg(bytes); }
}

/**
 * Build the gangsheet PDF.
 * @param {Array} designs  selected design rows (need front_qr / back_qr)
 * @param {{ columns?: number, onProgress?: (p)=>void }} opts
 * @returns {{ blob, faces, firstCode, lastCode, designIds }}
 */
export async function buildMediaGangsheet(designs, { columns = 3, onProgress } = {}) {
  // Flatten to a list of faces (one image per cell).
  const faces = [];
  for (const d of designs) {
    if (d.front_qr) faces.push({ code: d.code, url: d.front_qr });
    if (d.back_qr)  faces.push({ code: d.code, url: d.back_qr });
  }
  if (faces.length === 0) throw new Error('Không có _qr nào để gộp (các design chưa convert?).');

  const pdf = await PDFDocument.create();

  // A4-ish landscape page at 150 DPI-ish; cells laid out in a grid.
  const PAGE_W = 1748, PAGE_H = 1240;   // ~ A4 landscape @ 150dpi
  const CELL_PAD = 12;
  const cols = Math.max(1, columns);
  const rows = Math.max(1, Math.floor(PAGE_H / (PAGE_W / cols))); // square-ish cells
  const cellW = (PAGE_W - CELL_PAD * (cols + 1)) / cols;
  const cellH = (PAGE_H - CELL_PAD * (rows + 1)) / rows;
  const perPage = cols * rows;

  let page = null;
  for (let i = 0; i < faces.length; i++) {
    const idx = i % perPage;
    if (idx === 0) page = pdf.addPage([PAGE_W, PAGE_H]);

    onProgress?.({ done: i, total: faces.length, code: faces[i].code });
    let img;
    try {
      const bytes = await fetchImageBytes(faces[i].url);
      img = await embedAuto(pdf, bytes);
    } catch (err) {
      // Skip a broken face but keep going.
      continue;
    }

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellX = CELL_PAD + col * (cellW + CELL_PAD);
    // pdf-lib origin is bottom-left; lay rows top→down.
    const cellY = PAGE_H - CELL_PAD - (row + 1) * cellH - row * CELL_PAD;

    // Scale image to fit the cell preserving aspect ratio.
    const scale = Math.min(cellW / img.width, cellH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = cellX + (cellW - w) / 2;
    const y = cellY + (cellH - h) / 2;
    page.drawImage(img, { x, y, width: w, height: h });
  }
  onProgress?.({ done: faces.length, total: faces.length });

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
