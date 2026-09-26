// Technical front elevation drawn from the same outline the Blender model is built from.

function fillet(pts, radii, seg = 10) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const r = radii[i];
    const d1 = norm([p0[0] - p1[0], p0[1] - p1[1]]), d2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const ang = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    const t = r / Math.tan(ang / 2);
    const bis = norm([d1[0] + d2[0], d1[1] + d2[1]]);
    const cd = r / Math.sin(ang / 2);
    const c = [p1[0] + bis[0] * cd, p1[1] + bis[1] * cd];
    const a = [p1[0] + d1[0] * t - c[0], p1[1] + d1[1] * t - c[1]];
    const b = [p1[0] + d2[0] * t - c[0], p1[1] + d2[1] * t - c[1]];
    const aa = Math.atan2(a[1], a[0]);
    let da = Math.atan2(b[1], b[0]) - aa;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const th = aa + (da * k) / seg;
      out.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
    }
  }
  return out;
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

export function buildBlueprint() {
  const raw = [[13.7, 21.7], [-13.7, 21.7], [-20.1, 4.4], [-20.1, -4.4], [-13.7, -21.7], [13.7, -21.7], [20.1, -4.4], [20.1, 4.4]];
  const rad = [1.1, 1.1, 8, 8, 1.1, 1.1, 8, 8];
  const o = fillet(raw, rad, 12);
  const f = (v) => v.toFixed(2);
  const pathD = 'M' + o.map(([x, y]) => `${f(x)} ${f(-y)}`).join(' L') + ' Z';
  const circle = (r, cls) => `<circle class="${cls}" cx="0" cy="0" r="${r}" pathLength="1" />`;
  const indices = Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI / 2 - (i * Math.PI) / 6;
    const r0 = i === 3 ? 13.85 : 10.8, r1 = 15;
    return `<line class="bp-line" x1="${f(Math.cos(a) * r0)}" y1="${f(-Math.sin(a) * r0)}" x2="${f(Math.cos(a) * r1)}" y2="${f(-Math.sin(a) * r1)}" pathLength="1" />`;
  }).join('');
  const tick = (x1, y1, x2, y2) => `<line class="bp-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  return `
<svg viewBox="-34 -36 68 72" xmlns="http://www.w3.org/2000/svg">
  <line class="bp-thin" x1="-33" y1="0" x2="33" y2="0" />
  <line class="bp-thin" x1="0" y1="-35" x2="0" y2="35" />
  <path class="bp-line" d="${pathD}" pathLength="1" />
  ${circle(20, 'bp-line')}
  ${circle(17.1, 'bp-line')}
  ${circle(16.45, 'bp-thin')}
  ${indices}
  <rect class="bp-line" x="10.15" y="-1.05" width="2.7" height="2.1" pathLength="1" />
  <path class="bp-line" d="M20.8 -2.8 L24.1 -2.8 L24.25 -2.2 L24.25 2.2 L24.1 2.8 L20.8 2.8" pathLength="1" />
  <path class="bp-thin" d="M-12.5 -21.7 L-12.5 -34 M12.5 -21.7 L12.5 -34 M-12.5 21.7 L-12.5 34 M12.5 21.7 L12.5 34" />
  <path class="bp-thin" d="M-5.6 -21.7 L-5.6 -34 M5.6 -21.7 L5.6 -34 M-5.6 21.7 L-5.6 34 M5.6 21.7 L5.6 34" />
  ${tick(-20, 27, 20, 27)}${tick(-20, 25.5, -20, 28.5)}${tick(20, 25.5, 20, 28.5)}
  <text x="0" y="31" text-anchor="middle">40 MM</text>
  ${tick(-29, -21.7, -29, 21.7)}${tick(-30.5, -21.7, -27.5, -21.7)}${tick(-30.5, 21.7, -27.5, 21.7)}
  <text x="-31.5" y="0" text-anchor="middle" transform="rotate(-90 -31.5 0)">43.4 MM</text>
  ${tick(-12.5, -33, 12.5, -33)}
  <text x="0" y="-34.2" text-anchor="middle">25 MM</text>
</svg>`;
}
