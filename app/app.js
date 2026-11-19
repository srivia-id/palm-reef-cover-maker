// REEF HEAT — Palm Reef City Cover Maker
// A single-file canvas cover maker: photos + caption into multi-panel GTA-style
// poster covers, graded as one image, exported as PNG. Fully offline.

const SAMPLES = [
  { id: 'hero.jpg', label: 'Hero · sunset drive' },
  { id: 'marina.jpg', label: 'Marina · dusk docks' },
  { id: 'speedboat.jpg', label: 'Speedboat · open water' },
  { id: 'diner.jpg', label: 'Diner · neon night' },
];

const LAYOUTS = {
  grid: {
    name: 'Poster Grid',
    titleZone: 'band',
    rects: [
      [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
    ],
  },
  trio: {
    name: 'Hero Trio',
    titleZone: 'band',
    rects: [
      [0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1],
    ],
  },
  bands: {
    name: 'Skyline Bands',
    titleZone: 'band',
    rects: [
      [0, 0, 1, 0.42], [0, 0.42, 1, 0.30], [0, 0.72, 1, 0.28],
    ],
  },
  corners: {
    name: 'Four Corners',
    titleZone: 'center',
    rects: [
      [0, 0, 0.38, 0.38], [0.62, 0, 0.38, 0.38],
      [0, 0.62, 0.38, 0.38], [0.62, 0.62, 0.38, 0.38],
    ],
  },
  wall: {
    name: 'Poster Wall',
    titleZone: 'band',
    rects: [
      [0, 0, 0.52, 0.64],
      [0.52, 0, 0.48, 0.32], [0.52, 0.32, 0.48, 0.32],
      [0, 0.64, 0.25, 0.36], [0.25, 0.64, 0.25, 0.36],
      [0.5, 0.64, 0.25, 0.36], [0.75, 0.64, 0.25, 0.36],
    ],
  },
};

const GRADES = {
  sunset: { name: 'Palm Reef Sunset', filter: 'saturate(1.30) contrast(1.07) sepia(0.22) hue-rotate(-6deg)' },
  neon: { name: 'Neon Night', filter: 'saturate(1.50) contrast(1.14) hue-rotate(14deg)' },
  clean: { name: 'Clean', filter: 'saturate(1.06) contrast(1.03)' },
  ink: { name: 'Poster Ink', filter: '' },
};

// Poster Ink: 6-step sunset ramp, dark violet to pale gold.
const INK_RAMP = ['#1a0b2e', '#5b1a5e', '#c22a6e', '#ff5e3a', '#ff9e3c', '#ffe9a8'];

const DEFAULT_PANELS = ['hero.jpg', 'marina.jpg', 'speedboat.jpg', 'diner.jpg', 'hero.jpg', 'marina.jpg', 'speedboat.jpg'];

const state = {
  layout: 'wall',
  grade: 'ink',
  title: 'REEF HEAT',
  subtitle: 'Palm Reef City Nights',
  tagline: 'ONE CITY · NO BRAKES · ALL SUNSHINE',
  band: true,
  burst: true,
  rating: true,
  banner: true,
  span: false,
  spanPhoto: 'hero.jpg',
  exportSize: '1080x1350',
  selected: 0,
  panels: [],
};

const photos = new Map(); // id -> { label, img, src }
let uploadCount = 0;

function makePanels() {
  const count = LAYOUTS[state.layout].rects.length;
  state.panels = [];
  for (let i = 0; i < count; i++) {
    state.panels.push({ photo: DEFAULT_PANELS[i % DEFAULT_PANELS.length], zoom: 1, px: 0, py: 0 });
  }
  state.selected = 0;
}

function loadPhoto(id, src, label) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { photos.set(id, { label, img, src }); resolve(true); };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function loadSamples() {
  for (const s of SAMPLES) await loadPhoto(s.id, 'samples/' + s.id, s.label);
  const loaded = [...photos.keys()].length;
  setStatus(loaded + ' of ' + SAMPLES.length + ' sample photos loaded · drag a panel to pan, scroll to zoom');
  render();
}

// --- colour grades ---------------------------------------------------------

function gradeFilter() {
  return GRADES[state.grade].filter;
}

function posterizeToRamp(srcCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const sctx = srcCanvas.getContext('2d');
  const data = sctx.getImageData(0, 0, w, h);
  const px = data.data;
  const ramp = INK_RAMP.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const step = Math.min(5, Math.floor((lum / 256) * 6));
    px[i] = ramp[step][0];
    px[i + 1] = ramp[step][1];
    px[i + 2] = ramp[step][2];
  }
  sctx.putImageData(data, 0, 0);
  return srcCanvas;
}

function halftoneDots(ctx, rect) {
  const step = Math.max(6, rect.w / 160);
  ctx.save();
  ctx.fillStyle = 'rgba(12, 4, 24, 0.34)';
  for (let y = rect.y + step / 2; y < rect.y + rect.h; y += step) {
    for (let x = rect.x + step / 2; x < rect.x + rect.w; x += step) {
      const shade = 0.35 + 0.65 * (1 - ((x + y) % 97) / 97);
      const r = step * 0.16 * shade;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Draw one photo into a rect, cover-fit, with the active grade.
function drawGradedPhoto(ctx, img, rect, zoom, px, py) {
  const gap = Math.max(2, rect.w * 0.008);
  const inner = { x: rect.x + gap, y: rect.y + gap, w: rect.w - gap * 2, h: rect.h - gap * 2 };
  if (state.grade === 'ink') {
    const scale = Math.min(1, 560 / inner.w);
    const ow = Math.max(2, Math.round(inner.w * scale));
    const oh = Math.max(2, Math.round(inner.h * scale));
    const off = document.createElement('canvas');
    off.width = ow;
    off.height = oh;
    const octx = off.getContext('2d');
    drawCoverInto(octx, img, { x: 0, y: 0, w: ow, h: oh }, zoom, px, py);
    posterizeToRamp(off);
    ctx.save();
    ctx.drawImage(off, inner.x, inner.y, inner.w, inner.h);
    halftoneDots(ctx, inner);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.filter = gradeFilter();
  drawCoverInto(ctx, img, inner, zoom, px, py);
  ctx.restore();
}

// Cover-fit draw of an image into a rect, with zoom and pan offsets.
function drawCoverInto(ctx, img, rect, zoom, px, py) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = rect.x + (rect.w - dw) / 2 + px * rect.w * 0.25;
  const dy = rect.y + (rect.h - dh) / 2 + py * rect.h * 0.25;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// --- cover rendering -------------------------------------------------------

function photoArea(W, H) {
  // Photo area sits above the title band and tagline strip.
  return { x: 0, y: 0, w: W, h: H * 0.76 };
}

function bandRect(W, H) {
  return { x: 0, y: H * 0.76, w: W, h: H * 0.195 };
}

function stripRect(W, H) {
  return { x: 0, y: H * 0.955, w: W, h: H * 0.045 };
}

function drawCover(ctx, W, H) {
  const area = photoArea(W, H);
  ctx.fillStyle = '#160a1e';
  ctx.fillRect(0, 0, W, H);

  const layout = LAYOUTS[state.layout];
  const rects = layout.rects.map(([fx, fy, fw, fh]) => ({
    x: area.x + fx * area.w,
    y: area.y + fy * area.h,
    w: fw * area.w,
    h: fh * area.h,
  }));

  if (state.span) {
    const spanPhoto = photos.get(state.spanPhoto);
    if (spanPhoto) {
      ctx.save();
      if (state.grade !== 'ink') ctx.filter = gradeFilter();
      drawCoverInto(ctx, spanPhoto.img, area, 1.15, 0, 0);
      ctx.restore();
      if (state.grade === 'ink') {
        const off = document.createElement('canvas');
        off.width = Math.min(960, W);
        off.height = Math.round(off.width * (area.h / area.w));
        const octx = off.getContext('2d');
        drawCoverInto(octx, spanPhoto.img, { x: 0, y: 0, w: off.width, h: off.height }, 1.15, 0, 0);
        posterizeToRamp(off);
        ctx.drawImage(off, area.x, area.y, area.w, area.h);
        halftoneDots(ctx, area);
      }
    }
  } else {
    rects.forEach((rect, i) => {
      const panel = state.panels[i];
      if (!panel) return;
      const photo = photos.get(panel.photo);
      if (!photo) return;
      drawGradedPhoto(ctx, photo.img, rect, panel.zoom, panel.px, panel.py);
    });
  }

  // Panel gutters read as dark seams.
  ctx.strokeStyle = 'rgba(22, 10, 30, 0.9)';
  ctx.lineWidth = Math.max(3, W * 0.006);
  rects.forEach((r) => ctx.strokeRect(r.x, r.y, r.w, r.h));

  drawSunDisc(ctx, W, area);
  drawPalm(ctx, W * 0.06, area.h * 0.98, W * 0.16, -0.5);
  drawPalm(ctx, W * 0.94, area.h * 0.98, W * 0.13, 0.4);
  drawReef(ctx, W, area);

  if (layout.titleZone === 'band' && state.band) drawTitleBand(ctx, W, H);
  if (layout.titleZone === 'center') drawCenterTitle(ctx, W, area);
  drawTaglineStrip(ctx, W, H);
  if (state.burst) drawStarburst(ctx, W, area);
  if (state.rating) drawRatingPill(ctx, W, area);
  if (state.banner) drawCornerBanner(ctx, W, area);

  // Poster frame.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(4, W * 0.007);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  ctx.strokeStyle = 'rgba(255, 201, 60, 0.9)';
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.strokeRect(W * 0.014, H * 0.011, W * 0.972, H * 0.978);

  // Selected panel outline (editor only, drawn on the preview canvas).
  if (ctx === previewCtx && !state.span) {
    const sel = rects[state.selected];
    if (sel) {
      ctx.save();
      ctx.strokeStyle = '#ffc93c';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 8]);
      ctx.strokeRect(sel.x + 2, sel.y + 2, sel.w - 4, sel.h - 4);
      ctx.restore();
    }
  }
}

function drawSunDisc(ctx, W, area) {
  const cx = W * 0.8;
  const cy = area.h * 0.2;
  const r = W * 0.085;
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, 'rgba(255, 233, 168, 0.95)');
  g.addColorStop(0.55, 'rgba(255, 158, 60, 0.75)');
  g.addColorStop(1, 'rgba(255, 94, 58, 0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPalm(ctx, bx, by, size, lean) {
  ctx.save();
  ctx.strokeStyle = 'rgba(18, 5, 32, 0.9)';
  ctx.fillStyle = 'rgba(18, 5, 32, 0.9)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.lineCap = 'round';
  const topX = bx + lean * size * 0.5;
  const topY = by - size;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx + lean * size * 0.2, by - size * 0.55, topX, topY);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = (-Math.PI * 0.95) + (i / 6) * Math.PI * 0.9;
    const len = size * (0.52 - Math.abs(i - 3) * 0.05);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.55 + size * 0.12;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.5, topY + Math.sin(a) * len * 0.3 - size * 0.08, ex, ey);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(topX, topY + size * 0.04, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReef(ctx, W, area) {
  ctx.save();
  const baseY = area.h;
  const cols = ['rgba(255, 46, 136, 0.5)', 'rgba(255, 94, 58, 0.45)', 'rgba(255, 158, 60, 0.4)'];
  for (let i = 0; i < 9; i++) {
    const cx = (i / 8) * W + ((i % 2) * W * 0.03 - W * 0.015);
    const r = W * (0.03 + ((i * 37) % 5) * 0.008);
    ctx.fillStyle = cols[i % 3];
    ctx.beginPath();
    ctx.arc(cx, baseY - r * 0.35, r, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.5, baseY - r * 0.2, r * 0.55, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.5, baseY - r * 0.2, r * 0.55, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

function drawSkyline(ctx, rect) {
  ctx.save();
  ctx.fillStyle = 'rgba(22, 10, 30, 0.85)';
  const baseY = rect.y + rect.h * 0.28;
  let x = rect.x;
  let seed = 7;
  while (x < rect.x + rect.w) {
    seed = (seed * 37 + 11) % 97;
    const bw = rect.w * (0.03 + (seed % 5) * 0.012);
    const bh = rect.h * (0.1 + (seed % 7) * 0.035);
    ctx.fillRect(x, baseY - bh, bw, bh + rect.h * 0.28);
    x += bw + rect.w * 0.008;
  }
  ctx.restore();
}

function bandGradient(ctx, rect) {
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y);
  if (state.grade === 'neon') {
    g.addColorStop(0, '#ff2e88');
    g.addColorStop(0.55, '#7b2ff7');
    g.addColorStop(1, '#00b3ff');
  } else if (state.grade === 'clean') {
    g.addColorStop(0, '#1c0b26');
    g.addColorStop(1, '#3a1445');
  } else if (state.grade === 'ink') {
    g.addColorStop(0, '#c22a6e');
    g.addColorStop(0.5, '#ff5e3a');
    g.addColorStop(1, '#ff9e3c');
  } else {
    g.addColorStop(0, '#ff5e3a');
    g.addColorStop(0.55, '#ff2e88');
    g.addColorStop(1, '#7b2ff7');
  }
  return g;
}

function fitTitleFont(ctx, text, maxW, startPx, family) {
  let size = startPx;
  ctx.font = `900 ${size}px ${family}`;
  while (size > 24 && ctx.measureText(text).width > maxW) {
    size -= 4;
    ctx.font = `900 ${size}px ${family}`;
  }
  return size;
}

function drawTitleBand(ctx, W, H) {
  const rect = bandRect(W, H);
  ctx.save();
  ctx.fillStyle = bandGradient(ctx, rect);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  drawSkyline(ctx, rect);

  const family = '"Arial Black", "Archivo Black", Impact, sans-serif';
  const titleSize = fitTitleFont(ctx, state.title, W * 0.86, H * 0.085, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = `${Math.max(1, W * 0.004)}px`; } catch (e) { /* older canvas */ }
  ctx.lineWidth = Math.max(2, titleSize * 0.08);
  ctx.strokeStyle = 'rgba(22, 10, 30, 0.9)';
  ctx.fillStyle = '#ffffff';
  const ty = rect.y + rect.h * 0.42;
  ctx.strokeText(state.title, W / 2, ty);
  ctx.fillText(state.title, W / 2, ty);
  try { ctx.letterSpacing = '0px'; } catch (e) { /* older canvas */ }

  // Script subtitle, neon glow.
  ctx.font = `italic bold ${Math.round(H * 0.032)}px "Brush Script MT", "Segoe Script", cursive`;
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = H * 0.012;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(state.subtitle, W / 2, rect.y + rect.h * 0.82);
  ctx.restore();
}

function drawCenterTitle(ctx, W, area) {
  const cx = W / 2;
  const cy = area.h * 0.5;
  const family = '"Arial Black", "Archivo Black", Impact, sans-serif';
  ctx.save();
  ctx.fillStyle = 'rgba(22, 10, 30, 0.55)';
  ctx.fillRect(W * 0.04, area.h * 0.36, W * 0.92, area.h * 0.28);
  const titleSize = fitTitleFont(ctx, state.title, W * 0.86, area.h * 0.16, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, titleSize * 0.09);
  ctx.strokeStyle = 'rgba(22, 10, 30, 0.95)';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(state.title, cx, cy - area.h * 0.03);
  ctx.fillText(state.title, cx, cy - area.h * 0.03);
  ctx.font = `italic bold ${Math.round(area.h * 0.075)}px "Brush Script MT", "Segoe Script", cursive`;
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = area.h * 0.02;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(state.subtitle, cx, cy + area.h * 0.09);
  ctx.restore();
}

function drawTaglineStrip(ctx, W, H) {
  const rect = stripRect(W, H);
  ctx.save();
  ctx.fillStyle = '#160a1e';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = '#ffc93c';
  ctx.font = `700 ${Math.round(H * 0.016)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = `${Math.max(1, W * 0.003)}px`; } catch (e) { /* older canvas */ }
  ctx.fillText(state.tagline, W / 2, rect.y + rect.h / 2);
  try { ctx.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
  ctx.restore();
}

function drawStarburst(ctx, W, area) {
  const cx = W * 0.88;
  const cy = area.h * 0.1;
  const r = W * 0.075;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.21);
  ctx.beginPath();
  const points = 16;
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.72;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffc93c';
  ctx.fill();
  ctx.strokeStyle = '#160a1e';
  ctx.lineWidth = Math.max(2, W * 0.003);
  ctx.stroke();
  ctx.fillStyle = '#160a1e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(W * 0.02)}px "Arial Black", Impact, sans-serif`;
  ctx.fillText('EST.', 0, -r * 0.22);
  ctx.fillText('2026', 0, r * 0.28);
  ctx.restore();
}

function drawRatingPill(ctx, W, area) {
  const w = W * 0.24;
  const h = area.h * 0.055;
  const x = W * 0.03;
  const y = area.h - h - area.h * 0.03;
  ctx.save();
  ctx.fillStyle = 'rgba(22, 10, 30, 0.88)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.stroke();
  ctx.fillStyle = '#ffc93c';
  ctx.font = `900 ${Math.round(h * 0.52)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HEAT ★★★★★', x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawCornerBanner(ctx, W, area) {
  ctx.save();
  ctx.translate(W * 0.17, area.h * 0.055);
  ctx.rotate(-0.28);
  const w = W * 0.30;
  const h = area.h * 0.045;
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(h * 0.55)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = '2px'; } catch (e) { /* older canvas */ }
  ctx.fillText('PALM REEF CITY', 0, 1);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- preview + export ------------------------------------------------------

const preview = document.getElementById('preview');
const previewCtx = preview.getContext('2d');
const statusLine = document.getElementById('statusLine');
const captionLine = document.getElementById('previewCaption');

function setStatus(text) {
  statusLine.textContent = text;
}

function currentSize() {
  const [w, h] = state.exportSize.split('x').map(Number);
  return { w, h };
}

function render() {
  const { w, h } = currentSize();
  if (preview.width !== w || preview.height !== h) {
    preview.width = w;
    preview.height = h;
  }
  drawCover(previewCtx, w, h);
  captionLine.textContent =
    `${LAYOUTS[state.layout].name} · ${GRADES[state.grade].name} · ${state.exportSize.replace('x', ' × ')}`;
}

function renderCoverToCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, w, h);
  return canvas;
}

function exportPNG(w, h) {
  return new Promise((resolve) => {
    const canvas = renderCoverToCanvas(w, h);
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reef-heat-${w}x${h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve(blob.size);
    }, 'image/png');
  });
}

// Automation hook for screenshots: returns a PNG data URL, no download.
window.__reefHeat = {
  state,
  renderCoverToDataURL(w, h) {
    return renderCoverToCanvas(w, h).toDataURL('image/png');
  },
  photosLoaded() {
    return photos.size;
  },
};

// --- UI wiring -------------------------------------------------------------

function syncActiveButtons() {
  document.querySelectorAll('#layoutRow button').forEach((b) =>
    b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('#gradeRow button').forEach((b) =>
    b.classList.toggle('active', b.dataset.grade === state.grade));
  document.querySelectorAll('.samples img').forEach((img) =>
    img.classList.toggle('selected', img.dataset.photo === currentPanel().photo));
  document.querySelectorAll('.panel-row').forEach((row, i) =>
    row.classList.toggle('selected', i === state.selected));
}

function currentPanel() {
  return state.panels[state.selected] || state.panels[0];
}

function buildSampleStrip() {
  const strip = document.getElementById('sampleStrip');
  strip.innerHTML = '';
  for (const [id, photo] of photos) {
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.label;
    img.title = photo.label;
    img.dataset.photo = id;
    img.addEventListener('click', () => {
      if (state.span) { state.spanPhoto = id; }
      else { currentPanel().photo = id; }
      buildPanelList();
      syncActiveButtons();
      render();
    });
    strip.appendChild(img);
  }
}

function buildPanelList() {
  const list = document.getElementById('panelList');
  list.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const row = document.createElement('div');
    row.className = 'panel-row';
    if (i === state.selected) row.classList.add('selected');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Photo for panel ' + (i + 1));
    for (const [id, photo] of photos) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = photo.label;
      if (id === panel.photo) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => { panel.photo = sel.value; render(); });
    const zoom = document.createElement('input');
    zoom.type = 'range';
    zoom.min = '1';
    zoom.max = '2.5';
    zoom.step = '0.05';
    zoom.value = String(panel.zoom);
    zoom.setAttribute('aria-label', 'Zoom for panel ' + (i + 1));
    zoom.addEventListener('input', () => { panel.zoom = Number(zoom.value); render(); });
    row.addEventListener('click', (e) => {
      if (e.target === sel || e.target === zoom) return;
      state.selected = i;
      buildPanelList();
      syncActiveButtons();
      render();
    });
    row.append(num, sel, zoom);
    list.appendChild(row);
  });
}

document.getElementById('layoutRow').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  state.layout = btn.dataset.layout;
  makePanels();
  buildPanelList();
  syncActiveButtons();
  render();
});

document.getElementById('gradeRow').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-grade]');
  if (!btn) return;
  state.grade = btn.dataset.grade;
  syncActiveButtons();
  render();
});

document.getElementById('titleInput').addEventListener('input', (e) => { state.title = e.target.value || 'REEF HEAT'; render(); });
document.getElementById('subtitleInput').addEventListener('input', (e) => { state.subtitle = e.target.value; render(); });
document.getElementById('taglineInput').addEventListener('input', (e) => { state.tagline = e.target.value; render(); });
document.getElementById('bandToggle').addEventListener('change', (e) => { state.band = e.target.checked; render(); });
document.getElementById('burstToggle').addEventListener('change', (e) => { state.burst = e.target.checked; render(); });
document.getElementById('ratingToggle').addEventListener('change', (e) => { state.rating = e.target.checked; render(); });
document.getElementById('bannerToggle').addEventListener('change', (e) => { state.banner = e.target.checked; render(); });
document.getElementById('spanToggle').addEventListener('change', (e) => {
  state.span = e.target.checked;
  buildPanelList();
  render();
});

document.getElementById('uploadInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadCount += 1;
    const id = 'upload-' + uploadCount;
    loadPhoto(id, String(reader.result), 'Your photo ' + uploadCount).then(() => {
      currentPanel().photo = id;
      buildSampleStrip();
      buildPanelList();
      syncActiveButtons();
      render();
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById('exportSize').addEventListener('change', (e) => {
  state.exportSize = e.target.value;
  render();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const { w, h } = currentSize();
  exportPNG(w, h).then((size) => setStatus(size ? `Exported ${w}×${h} PNG (${Math.round(size / 1024)} KiB)` : 'Export failed'));
});
document.getElementById('exportSquare').addEventListener('click', () => exportPNG(1080, 1080));
document.getElementById('exportPortrait').addEventListener('click', () => exportPNG(1080, 1350));
document.getElementById('exportWide').addEventListener('click', () => exportPNG(1920, 1080));

// Preview interaction: click selects a panel, drag pans it, wheel zooms it.
let dragging = false;
let lastX = 0;
let lastY = 0;

function panelAt(clientX, clientY) {
  const r = preview.getBoundingClientRect();
  const fx = (clientX - r.left) / r.width;
  const fy = (clientY - r.top) / r.height;
  const area = { x: 0, y: 0, w: 1, h: 0.76 };
  const rects = LAYOUTS[state.layout].rects.map(([rx, ry, rw, rh]) => ({
    x: area.x + rx * area.w, y: area.y + ry * area.h, w: rw * area.w, h: rh * area.h,
  }));
  for (let i = rects.length - 1; i >= 0; i--) {
    const p = rects[i];
    if (fx >= p.x && fx <= p.x + p.w && fy >= p.y && fy <= p.y + p.h) return i;
  }
  return -1;
}

preview.addEventListener('pointerdown', (e) => {
  const i = panelAt(e.clientX, e.clientY);
  if (i < 0 || state.span) return;
  state.selected = i;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  preview.setPointerCapture(e.pointerId);
  buildPanelList();
  syncActiveButtons();
  render();
});

preview.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const panel = currentPanel();
  const r = preview.getBoundingClientRect();
  panel.px = Math.max(-1, Math.min(1, panel.px + ((e.clientX - lastX) / r.width) * 2));
  panel.py = Math.max(-1, Math.min(1, panel.py + ((e.clientY - lastY) / r.height) * 2));
  lastX = e.clientX;
  lastY = e.clientY;
  render();
});

preview.addEventListener('pointerup', () => { dragging = false; });

preview.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state.span) return;
  const panel = currentPanel();
  panel.zoom = Math.max(1, Math.min(2.5, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
  buildPanelList();
  render();
}, { passive: false });

// --- boot ------------------------------------------------------------------

makePanels();
loadSamples().then(() => {
  buildSampleStrip();
  buildPanelList();
  syncActiveButtons();
  render();
});
