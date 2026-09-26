import * as THREE from 'three';

// All textures are procedural (canvas) so the dial prints stay razor sharp at any size
// and the date / variants can be regenerated at runtime.
// Model units are millimetres. Dial UV: u = x/32 + .5, v = y/32 + .5 (glTF flips v).

const MM = 32; // dial texture spans 32 mm

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function tex(c, { srgb = true, repeat = false, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// seeded random so textures are stable between reloads
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function arrowPath(ctx, cx, cy, h) {
  // APKMASON arrow mark: a chevron with a notched base
  const w = h * 0.86;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.62);
  ctx.lineTo(cx + w * 0.5, cy + h * 0.38);
  ctx.lineTo(cx, cy + h * 0.1);
  ctx.lineTo(cx - w * 0.5, cy + h * 0.38);
  ctx.closePath();
}

/**
 * Dial print + base colour.
 * variant: { base: '#0c0d0f', print: '#ecebe6', grain: 0.06 }
 */
export function makeDialTextures(size, variant) {
  const px = size / MM; // px per mm
  const cx = size / 2, cy = size / 2;
  const P = (x, y) => [cx + x * px, cy - y * px];

  // ---------- colour ----------
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = variant.base;
  g.fillRect(0, 0, size, size);

  // radial gradient: sunburst dials darken toward the edge ("dégradé")
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 16.5 * px);
  rg.addColorStop(0, variant.center || 'rgba(255,255,255,0.05)');
  rg.addColorStop(0.7, 'rgba(0,0,0,0)');
  rg.addColorStop(1, variant.edge || 'rgba(0,0,0,0.55)');
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);

  // fine radial guilloché grooves (sunburst) baked into albedo for texture in shadow
  const rnd = rng(7);
  g.save();
  g.translate(cx, cy);
  g.globalCompositeOperation = 'lighter';
  const lines = 2600;
  for (let i = 0; i < lines; i++) {
    const a = (i / lines) * Math.PI * 2 + rnd() * 0.002;
    const l = rnd();
    g.strokeStyle = `rgba(255,255,255,${0.006 + l * variant.grain * 0.18})`;
    g.lineWidth = px * 0.02;
    g.beginPath();
    g.moveTo(Math.cos(a) * 0.4 * px, Math.sin(a) * 0.4 * px);
    g.lineTo(Math.cos(a) * 16.5 * px, Math.sin(a) * 16.5 * px);
    g.stroke();
  }
  g.restore();
  g.globalCompositeOperation = 'source-over';

  // ---------- print (shared with ORM mask) ----------
  const drawPrint = (ctx, style) => {
    ctx.fillStyle = style;
    ctx.strokeStyle = style;
    // minute track
    for (let i = 0; i < 60; i++) {
      const a = Math.PI / 2 - (i / 60) * Math.PI * 2;
      const hour = i % 5 === 0;
      const r0 = hour ? 15.25 : 15.45, r1 = 16.05;
      const w = hour ? 0.2 : 0.11;
      ctx.save();
      ctx.translate(...P(Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2));
      ctx.rotate(-a + Math.PI / 2);
      ctx.fillRect((-w / 2) * px, (-(r1 - r0) / 2) * px, w * px, (r1 - r0) * px);
      ctx.restore();
    }
    // logo arrow
    arrowPath(ctx, ...P(0, 8.55), 1.75 * px);
    ctx.fill();
    // wordmark
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `500 ${1.72 * px}px "Cormorant Garamond", "Times New Roman", serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.16 * px}px`;
    ctx.fillText('APKMASON', ...P(0.08, 5.55));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // dash
    ctx.fillRect(...P(-0.42, -5.72), 0.84 * px, 0.1 * px);
    ctx.font = `500 ${0.72 * px}px "Manrope", "Helvetica Neue", Arial, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.09 * px}px`;
    ctx.fillText('AUTOMATIC', ...P(0.05, -7.05));
    ctx.font = `400 ${0.62 * px}px "Manrope", "Helvetica Neue", Arial, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.05 * px}px`;
    ctx.fillText('100m / 330ft', ...P(0.03, -8.12));
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };
  drawPrint(g, variant.print);

  // ---------- roughness / metalness (G = rough, B = metal) ----------
  const o = canvas(size / 2);
  const og = o.getContext('2d');
  og.fillStyle = `rgb(255, ${Math.round(variant.rough * 255)}, ${Math.round(variant.metal * 255)})`;
  og.fillRect(0, 0, size / 2, size / 2);
  og.save();
  og.scale(0.5, 0.5);
  drawPrint(og, 'rgb(255, 150, 0)');
  og.restore();

  return {
    map: tex(c),
    orm: tex(o, { srgb: false }),
    aniso: anisoTexture(),
  };
}

// The sunburst direction field is identical for every dial variant: build it once and share it.
let anisoCache = null;
function anisoTexture() {
  if (anisoCache) return anisoCache;
  // ---------- anisotropy direction (RG = direction in tangent space, B = strength) ----------
  const a = canvas(512);
  const ag = a.getContext('2d');
  const img = ag.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const dx = x - 256 + 0.5, dy = y - 256 + 0.5;
      const r = Math.hypot(dx, dy) || 1;
      // tangential direction -> radial highlight rays (sunburst)
      const tx = -dy / r, ty = dx / r;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.round((tx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ty * 0.5 + 0.5) * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ag.putImageData(img, 0, 0);
  anisoCache = tex(a, { srgb: false, aniso: 1 });
  return anisoCache;
}

/** Brushed steel: fine linear streaks along U (normal-ish bump + roughness). */
export function makeBrushedTextures(size = 1024) {
  const rnd = rng(3);
  const h = new Float32Array(size * size);
  // streaks: per-row noise, horizontally smeared (1D along U)
  for (let y = 0; y < size; y++) {
    let v = rnd();
    const amp = 0.4 + rnd() * 0.6;
    for (let x = 0; x < size; x++) {
      v += (rnd() - 0.5) * 0.02;
      h[y * size + x] = v * amp;
    }
  }
  // occasional deeper scratches
  for (let k = 0; k < size * 0.6; k++) {
    const y = Math.floor(rnd() * size);
    const x0 = Math.floor(rnd() * size), len = Math.floor(rnd() * size * 0.5);
    const d = 0.4 + rnd() * 0.8;
    for (let x = x0; x < x0 + len; x++) h[y * size + (x % size)] -= d;
  }
  // make seamless along U: blend with shifted copy
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rough = canvas(size);
  const rg = rough.getContext('2d');
  const rimg = rg.createImageData(size, size);
  let min = Infinity, max = -Infinity;
  for (const v of h) { if (v < min) min = v; if (v > max) max = v; }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = x / size;
      const a = h[y * size + x], b = h[y * size + ((x + size / 2) % size)];
      const w = Math.abs(t - 0.5) * 2; // 1 at edges
      const v = ((a * (1 - w) + b * w) - min) / (max - min);
      const i = (y * size + x) * 4;
      const val = Math.round(v * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val; img.data[i + 3] = 255;
      const r = Math.round(150 + (v - 0.5) * 70);
      rimg.data[i] = 255; rimg.data[i + 1] = r; rimg.data[i + 2] = 255; rimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  const bump = tex(c, { srgb: false, repeat: true });
  const orm = tex(rough, { srgb: false, repeat: true });
  return { bump, orm };
}

/** Date wheel print visible through the aperture. */
export function makeDateTexture(day, { bg = '#efeee9', ink = '#0d0d0f' } = {}) {
  const w = 512, h = 400;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${h * 0.62}px "Manrope", "Helvetica Neue", Arial, sans-serif`;
  g.fillText(String(day), w / 2 + 4, h / 2 + 10);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Engraved caseback (bump + roughness). Drawn mirrored because it is viewed from below. */
export function makeCasebackTextures(size = 2048) {
  const px = size / 36;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.scale(-1, 1);
  g.fillStyle = '#000';
  g.strokeStyle = '#000';

  // concentric rings
  g.lineWidth = px * 0.08;
  for (const r of [12.2, 9.4]) {
    g.beginPath(); g.arc(0, 0, r * px, 0, Math.PI * 2); g.stroke();
  }
  // circular text
  const txt = 'APKMASON  ·  AUTOMATIC  ·  SAPPHIRE CRYSTAL  ·  WATER RESISTANT 100 M  ·  STAINLESS STEEL 316L  ·  ';
  g.font = `600 ${0.95 * px}px "Manrope", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const R = 10.8 * px;
  const total = txt.length;
  for (let i = 0; i < total; i++) {
    const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(R, 0);
    g.rotate(Math.PI / 2);
    g.fillText(txt[i], 0, 0);
    g.restore();
  }
  // emblem
  arrowPath(g, 0, -2.2 * px, 5.2 * px);
  g.lineWidth = px * 0.14;
  g.stroke();
  g.font = `500 ${1.6 * px}px "Cormorant Garamond", serif`;
  g.fillText('APKMASON', 0, 3.2 * px);
  g.font = `500 ${0.8 * px}px "Manrope", Arial, sans-serif`;
  g.fillText('Nº 0001', 0, 5.6 * px);
  // grip notches around the screw-down ring
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.save(); g.rotate(a);
    g.fillRect(14.2 * px, -0.7 * px, 1.4 * px, 1.4 * px);
    g.restore();
  }
  const bump = tex(c, { srgb: false });
  return { bump };
}

/** Film-grain tile for the page overlay. */
export function grainDataURL(size = 160) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
