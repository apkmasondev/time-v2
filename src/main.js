import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { WatchStage } from './scene.js';
import { DICT } from './i18n.js';
import { buildBlueprint } from './blueprint.js';
import { grainDataURL } from './textures.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEG = Math.PI / 180;
const small = matchMedia('(max-width: 900px)');
const finePointer = matchMedia('(pointer: fine)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

let lang = navigator.language?.startsWith('pl') ? 'pl' : 'en';
try { lang = localStorage.getItem('apk-lang') || lang; } catch (e) { /* storage blocked */ }
if (!DICT[lang]) lang = 'pl';
let soundOn = false;
let flipped = false;

// ------------------------------------------------------------------ sound (synthesised, no files)
class Sfx {
  constructor() { this.on = false; this.ctx = null; this.last = 0; }
  enable(on) {
    this.on = on;
    if (on && !this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; }
    }
    if (on) this.ctx?.resume?.(); else this.ctx?.suspend?.();
  }
  _burst({ freq = 3200, q = 8, dur = 0.03, gain = 0.08, when = 0 }) {
    if (!this.on || !this.ctx) return;
    const a = this.ctx, t0 = a.currentTime + when;
    const n = Math.ceil(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 6;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
  }
  // escapement-like double tick for chapter changes
  tick() {
    const now = performance.now();
    if (now - this.last < 120) return;
    this.last = now;
    this._burst({ freq: 4200, q: 12, dur: 0.025, gain: 0.12 });
    this._burst({ freq: 2600, q: 10, dur: 0.02, gain: 0.07, when: 0.09 });
  }
  click() { this._burst({ freq: 1800, q: 4, dur: 0.04, gain: 0.1 }); }
}
const sfx = new Sfx();

// ------------------------------------------------------------------ i18n
function t(key) { return DICT[lang][key] ?? DICT.pl[key] ?? key; }

// wrap every word in a mask so headings can rise into view
function split(el) {
  const wasIn = el.classList.contains('is-in');
  let i = 0;
  const walk = (node) => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of c.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('i');
          inner.style.setProperty('--i', i++);
          inner.textContent = part;
          w.appendChild(inner);
          frag.appendChild(w);
        }
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && !c.classList.contains('w') && c.tagName !== 'BR') walk(c);
    }
  };
  walk(el);
  if (wasIn) el.classList.add('is-in');
}

function applyLang() {
  document.documentElement.lang = lang;
  for (const el of $$('[data-i18n]')) {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  }
  for (const el of $$('[data-split]')) split(el);
  $$('.nav__lang span').forEach((s) => s.classList.toggle('is-active', s.dataset.lang === lang));
  $('#soundToggle').setAttribute('aria-label', t('nav.sound'));
  $('#demoClose').setAttribute('aria-label', t('demo.close'));
  annotations.relabel();
  renderSpecs();
  labelFinaleSwatches();
  $('#flipBtn').textContent = t(flipped ? 'studio.flipBack' : 'studio.flip');
  $('#studioName').textContent = $('#swatches .is-active span').textContent;
  formCounter.set(formCounter.idx, true);
}

// ------------------------------------------------------------------ film grain + cursor
$('.grain').style.backgroundImage = `url(${grainDataURL()})`;

const cursor = {
  el: $('#cursor'), dot: $('#cursor .cursor__dot'),
  x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2,
  update() {
    if (!finePointer) return;
    this.rx += (this.x - this.rx) * 0.2;
    this.ry += (this.y - this.ry) * 0.2;
    this.el.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
    this.dot.style.transform = `translate3d(${this.x - this.rx}px, ${this.y - this.ry}px, 0)`;
  },
};
if (finePointer) {
  document.body.classList.add('has-cursor');
  addEventListener('pointermove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY; cursor.el.classList.add('is-on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.el.classList.remove('is-on'));
  document.addEventListener('pointerover', (e) => {
    const hit = e.target.closest('a, button');
    cursor.el.classList.toggle('is-hover', !!hit);
    cursor.el.classList.toggle('is-drag', !hit && !!e.target.closest('[data-cursor="drag"]'));
  });
  for (const b of $$('.btn--solid')) {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      gsap.to(b, { x: (e.clientX - r.left - r.width / 2) * 0.22, y: (e.clientY - r.top - r.height / 2) * 0.3, duration: 0.6, ease: 'power3.out' });
    });
    b.addEventListener('pointerleave', () => gsap.to(b, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' }));
  }
}

// ------------------------------------------------------------------ live time
const timeEls = $$('.liveTime');
let lastTime = '';
function tickTime() {
  const d = new Date();
  const s = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  if (s === lastTime) return;
  lastTime = s;
  for (const el of timeEls) el.textContent = s;
}
setInterval(tickTime, 250);
tickTime();

// ------------------------------------------------------------------ WebGL stage
const stage = new WatchStage($('#gl'));
const S = stage.S;

// ------------------------------------------------------------------ form counter (01)
const formCounter = {
  el: $('#formNum'), cap: $('#formCap'), idx: 0,
  data: [[40, 'form.c1'], [43.4, 'form.c2'], [9.7, 'form.c3']],
  set(i, silent = false) {
    if (i === this.idx && !silent) return;
    this.idx = i;
    const [n, key] = this.data[i];
    this.el.textContent = String(n).replace('.', lang === 'pl' ? ',' : '.');
    this.cap.textContent = t(key);
    if (!silent) gsap.fromTo(this.el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
  },
};

// ------------------------------------------------------------------ annotations
class Annotations {
  constructor() {
    this.svg = $('#leaders');
    this.root = $('#annotations');
    this.items = {};
    this.p = { x: 0, y: 0 };
  }
  add(key, anchor, { dx = 120, dy = -70, num = '' } = {}) {
    const el = document.createElement('div');
    el.className = 'anno';
    this.root.appendChild(el);
    const ns = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(ns, 'line');
    const dot = document.createElementNS(ns, 'circle');
    const halo = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', 2.5);
    halo.setAttribute('r', 7);
    halo.classList.add('halo');
    this.svg.append(line, halo, dot);
    const item = { key, anchor, dx, dy, num, el, line, dot, halo, o: 0, shown: true };
    this.items[key] = item;
    this.label(item);
    return item;
  }
  label(item) {
    const [a, b] = t('a.' + (item.akey || item.key));
    item.el.innerHTML = `${item.num ? `<b>${item.num}</b>` : ''}${a}<small>${b}</small>`;
    item.w = 0; // re-measured the next time it is shown
  }
  relabel() { Object.values(this.items).forEach((i) => this.label(i)); }
  update(time) {
    for (const it of Object.values(this.items)) {
      const vis = it.o > 0.002;
      if (vis !== it.shown) {
        it.shown = vis;
        it.el.style.display = it.line.style.display = it.dot.style.display = it.halo.style.display = vis ? '' : 'none';
      }
      if (!vis) continue;
      const p = stage.project(it.anchor, this.p);
      const dx = typeof it.dx === 'function' ? it.dx() : it.dx;
      const dy = typeof it.dy === 'function' ? it.dy() : it.dy;
      const lx = p.x + dx, ly = p.y + dy;
      const grow = Math.min(1, it.o * 1.4);
      it.line.setAttribute('x1', p.x); it.line.setAttribute('y1', p.y);
      it.line.setAttribute('x2', p.x + dx * grow); it.line.setAttribute('y2', p.y + dy * grow);
      it.line.style.opacity = it.o;
      it.dot.setAttribute('cx', p.x); it.dot.setAttribute('cy', p.y); it.dot.style.opacity = it.o;
      const pulse = 1 + 0.35 * Math.sin(time * 3 + p.x);
      it.halo.setAttribute('cx', p.x); it.halo.setAttribute('cy', p.y); it.halo.setAttribute('r', 7 * pulse);
      it.halo.style.opacity = it.o * 0.8;
      const right = dx >= 0;
      const w = it.w || (it.w = it.el.offsetWidth);
      const x = Math.max(12, Math.min(innerWidth - w - 12, right ? lx + 12 : lx - 12 - w));
      it.el.style.transform = `translate3d(${x}px, ${ly - 9}px, 0)`;
      it.el.style.textAlign = right ? 'left' : 'right';
      it.el.style.opacity = Math.max(0, (it.o - 0.3) / 0.7);
    }
  }
}
const annotations = new Annotations();

// ------------------------------------------------------------------ poses
const tan = (fov) => Math.tan((fov / 2) * DEG);
const fit = (units, frac, fov = 22) => units / frac / (2 * tan(fov));
// frame of the film's last shot: bezel 434 px wide, centred at (945, 488) in 1920x1080
function filmPose() {
  const w = innerWidth, h = innerHeight;
  const sc = Math.max(w / 1920, h / 1080);
  const fov = 22;
  const f = (434 * sc) / h;
  return {
    fov, dist: 4.0 / f / (2 * tan(fov)) + 0.23,
    shiftX: ((945 - 960) * sc) / w, shiftY: ((540 - 488) * sc) / h,
    rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0,
    pedestal: 1, column: 1, panel: 1, columnX: 0, columnW: (320 * sc) / (h / 2) / 1.9,
    explode: 0, bracelet: 1, envRot: 0, float: 1, envIntensity: 1.25,
  };
}
// on phones the film framing is too tight for the copy: settle into a smaller composition
function heroPose() {
  const f = filmPose();
  if (!small.matches) return f;
  return { ...f, dist: fit(4.0, 0.22), shiftX: 0, shiftY: -0.06, columnW: 0.34 };
}
const P = {
  form0: () => small.matches
    ? { dist: fit(8.5, 0.4), shiftX: 0, shiftY: 0.07, rotX: -0.18, rotY: -0.25, rotZ: 0, columnX: 0, pedestal: 0, column: 0.5, panel: 0, columnW: 0.4, envIntensity: 1.05 }
    : { dist: fit(8.4, 0.86), shiftX: 0.2, shiftY: 0, rotX: -0.18, rotY: -0.25, rotZ: 0, columnX: 0.4, pedestal: 0, column: 0.55, panel: 0, columnW: 0.34, envIntensity: 1.05 },
  form1: () => ({ dist: fit(7.4, small.matches ? 0.4 : 0.95), rotX: -0.46, rotY: -0.32, rotZ: 0.06 }),
  form2: () => ({ dist: fit(7.4, small.matches ? 0.4 : 0.95), rotX: -0.72, rotY: -0.62, rotZ: 0.3 }),
  form3: () => ({ dist: fit(5.6, small.matches ? 0.38 : 0.9), rotX: -0.1, rotY: -1.36, rotZ: 0.0 }),
  dial0: () => small.matches
    ? { dist: fit(3.4, 0.62), shiftX: 0, shiftY: 0.16, rotX: -0.36, rotY: 0.22, rotZ: 0.12, column: 0.25, columnX: 0, panel: 0, pedestal: 0, bracelet: 1, explode: 0 }
    : { dist: fit(3.4, 0.92), shiftX: -0.2, shiftY: 0.02, rotX: -0.36, rotY: 0.3, rotZ: 0.12, column: 0.25, columnX: -0.4, panel: 0, pedestal: 0, bracelet: 1, explode: 0 },
  dial1: () => ({ dist: fit(3.4, small.matches ? 0.72 : 1.0), shiftX: small.matches ? 0 : -0.25, rotX: -0.14, rotY: 0.06, rotZ: -0.08 }),
  anat0: () => ({ dist: fit(9.5, small.matches ? 0.5 : 0.9), shiftX: 0, shiftY: small.matches ? 0.02 : -0.05, rotX: -1.12, rotY: 0, rotZ: 0.45, column: 0.4, columnX: 0, panel: 0, columnW: 0.5 }),
  studio: () => small.matches
    ? { dist: fit(7.6, 0.42), shiftX: 0, shiftY: 0.18, rotX: -0.37, rotY: -0.38, rotZ: 0, column: 0.8, columnX: 0, panel: 0, pedestal: 0, explode: 0, bracelet: 1, columnW: 0.3, pivot: 1 }
    : { dist: fit(7.6, 0.8), shiftX: 0.12, shiftY: 0, rotX: -0.37, rotY: -0.38, rotZ: 0, column: 1, columnX: 0.24, panel: 0, pedestal: 0, explode: 0, bracelet: 1, columnW: 0.3, pivot: 1 },
};

// ------------------------------------------------------------------ bracelet macro sequence
// Frames are kept as small compressed blobs (~27 KB each) and only a handful around the playhead
// are decoded into ImageBitmaps at any time, so memory stays bounded instead of holding 100
// decoded 1600x900 frames (~575 MB).
const craft = {
  canvas: $('#craftCanvas'), fr: $('#craftFr'),
  count: 100, blobs: [], bitmaps: new Map(), pending: new Set(),
  target: 0, drawn: -1, exact: false, dirty: true, loaded: 0, active: false,
  url(i) { return `seq/craft_${String(i + 1).padStart(3, '0')}.webp`; },
  async fetchRange(a, b) {
    const todo = [];
    for (let i = a; i < b; i++) if (!this.blobs[i]) todo.push(i);
    let k = 0;
    const worker = async () => {
      while (k < todo.length) {
        const i = todo[k++];
        try {
          const r = await fetch(this.url(i));
          if (!r.ok) throw new Error(r.status);
          this.blobs[i] = await r.blob();
          this.loaded++;
          if (this.active && Math.abs(i - this.target) < 8) this.dirty = true;
        } catch (e) { /* a missing frame falls back to its neighbour */ }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  },
  decode(k) {
    if (k < 0 || k >= this.count || this.bitmaps.has(k) || this.pending.has(k) || !this.blobs[k]) return;
    this.pending.add(k);
    createImageBitmap(this.blobs[k]).then((bmp) => {
      this.pending.delete(k);
      if (!this.active || Math.abs(k - this.target) > 12) { bmp.close(); return; }
      this.bitmaps.set(k, bmp);
      if (!this.exact) this.dirty = true;
    }).catch(() => this.pending.delete(k));
  },
  want(i) {
    for (let d = 0; d <= 5; d++) { this.decode(i + d); this.decode(i - d); }
    for (const [k, bmp] of this.bitmaps) if (Math.abs(k - i) > 9) { bmp.close(); this.bitmaps.delete(k); }
  },
  nearest(i) {
    for (let d = 0; d < this.count; d++) {
      if (this.bitmaps.has(i - d)) return i - d;
      if (this.bitmaps.has(i + d)) return i + d;
    }
    return -1;
  },
  release() {
    for (const bmp of this.bitmaps.values()) bmp.close();
    this.bitmaps.clear();
    this.drawn = -1; this.exact = false;
  },
  update() {
    if (!this.active) return;
    const i = Math.round(this.target);
    if (i === this.drawn && this.exact && !this.dirty) return;
    this.want(i);
    const k = this.nearest(i);
    if (k < 0) return;
    this.draw(this.bitmaps.get(k));
    this.drawn = i; this.exact = k === i; this.dirty = false;
    this.fr.textContent = `FR ${String(k + 1).padStart(3, '0')} / ${this.count}`;
  },
  draw(img) {
    const c = this.canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (!W || !H) return;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    const s = Math.max(W / img.width, H / img.height);
    const iw = img.width * s, ih = img.height * s;
    // on portrait screens keep the interesting right-hand part (case & bracelet) in frame
    const ox = small.matches ? (W - iw) * 0.72 : (W - iw) / 2;
    g.drawImage(img, ox, (H - ih) / 2, iw, ih);
  },
};

// ------------------------------------------------------------------ loader
const loader = $('#loader');
const prog = { model: 0, video: 0, frames: 0, shown: 0 };
const introVideo = $('#introVideo');
const vq = innerWidth * Math.min(devicePixelRatio, 1.5) > 1300 && !navigator.connection?.saveData ? '1080' : '720';
introVideo.src = `video/intro-${vq}.mp4`;
introVideo.load();

const videoReady = new Promise((res) => {
  const onProgress = () => {
    try { prog.video = Math.max(prog.video, introVideo.buffered.end(0) / (introVideo.duration || 10)); } catch (e) { /* not buffered yet */ }
  };
  const done = () => { prog.video = 1; introVideo.removeEventListener('progress', onProgress); res(); };
  introVideo.addEventListener('canplaythrough', done, { once: true });
  introVideo.addEventListener('error', done, { once: true });
  introVideo.addEventListener('progress', onProgress);
  setTimeout(done, 9000);
});
const framesReady = (async () => {
  const n = 24;
  const iv = setInterval(() => { prog.frames = Math.min(1, craft.loaded / n); }, 100);
  await craft.fetchRange(0, n);
  clearInterval(iv);
  prog.frames = 1;
})();
const modelReady = stage.load('models/apkmason.glb', (p) => { prog.model = p * 0.9; }).then(() => { prog.model = 1; });

const countEl = $('.loader__count');
const barEl = $('.loader__bar i');
const barRole = $('.loader__bar');
const loaderTick = () => {
  const target = prog.model * 0.55 + prog.video * 0.3 + prog.frames * 0.15;
  prog.shown += (target - prog.shown) * 0.08;
  const pct = Math.round(prog.shown * 100);
  countEl.textContent = String(pct).padStart(3, '0');
  barRole.setAttribute('aria-valuenow', pct);
  barEl.style.transform = `scaleX(${prog.shown})`;
};
gsap.ticker.add(loaderTick);

applyLang();

Promise.all([modelReady, videoReady, framesReady]).then(() => {
  gsap.ticker.remove(loaderTick);
  prog.shown = 1;
  countEl.textContent = '100';
  barEl.style.transform = 'scaleX(1)';
  // warm-up render at the film's final framing behind the loader
  Object.assign(S, filmPose());
  stage.render();
  setTimeout(() => loader.classList.add('is-ready'), 500);
  craft.fetchRange(24, craft.count); // stream the rest of the sequence
  // dev shortcut: ?skip jumps straight past loader + film
  if (params.has('skip')) {
    loader.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
    finishIntro(true);
  }
}).catch((e) => {
  console.error(e);
  gsap.ticker.remove(loaderTick);
  loader.classList.add('is-ready');
});

for (const b of $$('[data-enter]')) {
  b.addEventListener('click', () => {
    setSound(b.dataset.enter === '1');
    sfx.click();
    loader.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
    playIntro();
  });
}

// ------------------------------------------------------------------ intro film
const intro = $('#intro');
let introDone = false;
let introTicker = null;

function playIntro() {
  document.body.classList.add('is-intro');
  window.scrollTo(0, 0);
  lenis.stop();
  Object.assign(S, filmPose());
  if (reduced) { finishIntro(true); return; }
  introVideo.muted = !soundOn;
  introVideo.volume = 0.9;
  introVideo.currentTime = 0;
  introVideo.play()?.catch(() => { introVideo.muted = true; introVideo.play().catch(() => finishIntro(true)); });
  requestAnimationFrame(() => intro.classList.add('is-playing'));
  const caps = $$('.intro__cap', intro);
  const tc = $('.intro__tc', intro);
  const bar = $('.intro__progress i', intro);
  let handed = false;
  introTicker = () => {
    const ct = introVideo.currentTime;
    const d = introVideo.duration || 10;
    for (const c of caps) c.classList.toggle('is-on', ct >= +c.dataset.in && ct < +c.dataset.out);
    const fr = Math.floor((ct % 1) * 24);
    tc.textContent = `00:00:${String(Math.floor(ct)).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
    bar.style.transform = `scaleX(${ct / d})`;
    if (!handed && ct >= d - 0.9) { handed = true; handoff(); }
  };
  gsap.ticker.add(introTicker);
  introVideo.addEventListener('ended', () => { if (!handed) { handed = true; handoff(); } }, { once: true });
}

function handoff() {
  // the 3D watch is already rendering in exactly the film's final composition: dissolve into it
  $('#gl').classList.add('is-on');
  intro.style.background = 'transparent';
  intro.classList.add('is-open');
  gsap.to(introVideo, { opacity: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.15, onComplete: () => finishIntro() });
  gsap.to(introVideo, { volume: 0, duration: 1.6 });
}

function finishIntro(immediate = false) {
  if (introDone) return;
  introDone = true;
  if (introTicker) gsap.ticker.remove(introTicker);
  $('#gl').classList.add('is-on');
  const kill = () => {
    gsap.killTweensOf(introVideo);
    introVideo.pause();
    // release the decoder and its buffers: a detached <video> with a src keeps them alive
    introVideo.removeAttribute('src');
    introVideo.load();
    intro.remove();
  };
  if (immediate) gsap.to(intro, { opacity: 0, duration: 1.2, ease: 'power2.inOut', onComplete: kill });
  else kill();
  document.body.classList.remove('is-intro');
  document.body.classList.add('is-ready-ui');
  lenis.start();
  if (layoutStale) { layoutStale = false; lastW = innerWidth; buildTimelines(); }
  ScrollTrigger.refresh();
  if (small.matches) gsap.to(S, { ...heroPose(), duration: 2.4, ease: 'power3.inOut', delay: immediate ? 0 : 0.2 });
  revealHero();
}

$('#skipIntro').addEventListener('click', () => {
  sfx.click();
  if (introTicker) gsap.ticker.remove(introTicker);
  gsap.to(introVideo, { volume: 0, duration: 0.6 });
  $('#gl').classList.add('is-on');
  intro.classList.add('is-open');
  finishIntro(true);
});

function revealHero() {
  $$('[data-split], .reveal-up', $('#hero')).forEach((el, i) => setTimeout(() => el.classList.add('is-in'), 250 + i * 180));
}

// ------------------------------------------------------------------ smooth scroll
const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop();

// land where each chapter's choreography reads best
const anchorOffset = { '#form': 0.9, '#craft': 1.2, '#dial': 0.4, '#anatomy': 1.8, '#wrist': 0.7 };
function goTo(id) {
  const el = id.length > 1 && $(id);
  if (!el) return;
  lenis.scrollTo(el, { offset: (anchorOffset[id] || 0) * innerHeight, duration: 2.2, easing: (x) => 1 - Math.pow(1 - x, 4) });
}
for (const a of $$('a[href^="#"]')) {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!$(id)) return;
    e.preventDefault();
    sfx.click();
    if (document.body.classList.contains('is-menu')) { setMenu(false); setTimeout(() => goTo(id), 350); } else goTo(id);
  });
}

// ------------------------------------------------------------------ reveal-on-view
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}, { threshold: 0.25 });
function observeReveals() {
  $$('main [data-split], main .reveal-up').forEach((el) => { if (!el.closest('#hero')) io.observe(el); });
}

// ------------------------------------------------------------------ day / night films (05)
const wrist = {
  day: $('#wristDayVideo'), night: $('#wristNightVideo'), active: new Set(),
  start(v, fromStart = false) {
    if (!v.src) v.src = `video/${v.dataset.src}-${vq}.mp4`;
    if (fromStart && !this.active.has(v)) v.currentTime = 0;
    this.active.add(v);
    v.play().catch(() => {});
  },
  stop(v) { this.active.delete(v); v.pause(); },
  // each file ends in a mirrored copy of its macro shot: jumping back to the loop point is seamless
  tick() {
    for (const v of this.active) {
      if (v.duration && v.currentTime >= v.duration - 0.05) v.currentTime = +v.dataset.loop;
    }
  },
};
for (const v of [wrist.day, wrist.night]) {
  v.addEventListener('ended', () => { if (wrist.active.has(v)) { v.currentTime = +v.dataset.loop; v.play().catch(() => {}); } });
}

// ------------------------------------------------------------------ scroll choreography
function st(trigger, opts = {}) {
  return { trigger, start: 'top top', end: 'bottom bottom', scrub: 1, ...opts };
}

let built = [];
const hiddenRanges = [];
const docTop = (sel) => $(sel).getBoundingClientRect().top + window.scrollY;
const hOf = (sel) => $(sel).offsetHeight;
const ann = (key, anchor, opts) => annotations.items[key] || annotations.add(key, anchor, opts);
const CHAPTER_NUM = { hero: '00', form: '01', craft: '02', dial: '03', anatomy: '04', presence: '04', wrist: '05', specs: '06', studio: '07', finale: '07' };

function buildTimelines() {
  built.forEach((x) => { x.scrollTrigger?.kill(); x.kill?.(); });
  built = [];
  const keep = (x) => { built.push(x); return x; };
  const H = innerHeight;
  const K = 1 / 1000; // timeline seconds per scrolled pixel
  const Tf = docTop('#form'), rf = hOf('#form') - H;
  const Tc = docTop('#craft'), rc = hOf('#craft') - H;
  const Td = docTop('#dial'), rd = hOf('#dial') - H;
  const Ta = docTop('#anatomy'), ra = hOf('#anatomy') - H;
  const Tp = docTop('#presence'), rp = hOf('#presence') - H;
  const Ts = docTop('#studio');
  const Tfin = docTop('#finale');
  const maxY = document.documentElement.scrollHeight - H;

  // the canvas sleeps while an opaque film / page covers it (presence -> wrist -> specs)
  hiddenRanges.length = 0;
  hiddenRanges.push([Tc + 0.115 * rc, Tc + 0.885 * rc], [Tp + 0.34 * rp, Ts - H - 2], [Tfin + 2, Infinity]);

  // ---------------------------------------------------------------- master 3D choreography
  const bezel = ann('bezel', 'bezel', { dx: () => (small.matches ? 60 : -150), dy: -80 });
  const kase = ann('case', 'case', { dx: () => (small.matches ? 50 : -170), dy: 90 });
  const crown = ann('crown', 'crown', { dx: () => (small.matches ? -60 : 110), dy: -120 });
  const parts = [
    ['crystal', '01', 1], ['bezel', '02', -1], ['hands', '03', 1], ['flange', '04', -1],
    ['indices', '05', 1], ['case', '06', -1], ['crown', '07', 1], ['caseback', '08', -1],
  ];
  const xa = parts.map(([k, n, side]) => {
    const mdy = { hands: -22, indices: 8, crown: 30 }[k] ?? -12;
    const it = ann('x' + k, k, { num: n, dx: () => side * (small.matches ? 34 : Math.min(260, innerWidth * 0.16)), dy: () => (small.matches ? mdy : ({ hands: -58, indices: 8 }[k] ?? -24)) });
    it.akey = k;
    return it;
  });
  annotations.relabel();

  const m = keep(gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } }));
  const at = (y) => Math.max(0, y) * K;
  const span = (y0, y1) => Math.max(0.001, (y1 - y0) * K);
  const seg = (targets, vars, y0, y1) => m.to(targets, { ...vars, duration: span(y0, y1) }, at(y0));

  m.fromTo(S, { ...heroPose(), timeWarp: 0 }, { ...P.form0(), duration: span(0, Tf), ease: 'power2.inOut' }, 0);
  // I. form
  seg(S, P.form1(), Tf, Tf + 0.3 * rf);
  seg(bezel, { o: 1, ease: 'none' }, Tf + 0.14 * rf, Tf + 0.22 * rf);
  seg(bezel, { o: 0, ease: 'none' }, Tf + 0.3 * rf, Tf + 0.34 * rf);
  seg(S, P.form2(), Tf + 0.33 * rf, Tf + 0.63 * rf);
  seg(kase, { o: 1, ease: 'none' }, Tf + 0.48 * rf, Tf + 0.56 * rf);
  seg(kase, { o: 0, ease: 'none' }, Tf + 0.63 * rf, Tf + 0.67 * rf);
  seg(S, P.form3(), Tf + 0.66 * rf, Tf + 0.95 * rf);
  seg(crown, { o: 1, ease: 'none' }, Tf + 0.8 * rf, Tf + 0.88 * rf);
  seg(crown, { o: 0, ease: 'none' }, Tf + rf + 0.1 * H, Tf + rf + 0.3 * H);
  // II. craft: while the film covers the screen, jump to the dial macro
  seg(S, { ...P.dial0(), ease: 'none' }, Tc + 0.13 * rc, Tc + 0.2 * rc);
  // III. dial: light sweeps the sunburst, hands travel twelve hours back to "now"
  seg(S, { ...P.dial1(), ease: 'sine.inOut' }, Td - 0.2 * H, Td + rd);
  seg(S, { envRot: 3.4, timeWarp: 12, ease: 'power1.inOut' }, Td, Td + rd);
  // IV. anatomy
  seg(S, { ...P.anat0(), envRot: 5.2 }, Td + rd, Ta + 0.3 * ra);
  seg(S, { bracelet: 0, ease: 'power1.in' }, Td + rd + 0.2 * H, Ta + 0.18 * ra);
  seg(S, { explode: 1, ease: 'power3.inOut' }, Ta + 0.16 * ra, Ta + 0.46 * ra);
  seg(S, { rotZ: 1.15, ease: 'none' }, Ta + 0.3 * ra, Ta + 0.86 * ra);
  xa.forEach((it, i) => {
    seg(it, { o: 1, ease: 'none' }, Ta + (0.42 + i * 0.022) * ra, Ta + (0.48 + i * 0.022) * ra);
    seg(it, { o: 0, ease: 'none' }, Ta + 0.84 * ra, Ta + 0.88 * ra);
  });
  seg(S, { explode: 0, bracelet: 1, rotX: -0.5, dist: P.anat0().dist * 0.85 }, Ta + 0.87 * ra, Ta + ra + 0.3 * H);
  // prepared while the interlude, wrist films and specs cover the canvas: a three-quarter view tipped
  // towards the viewer, studio lights turned so a bright band crosses the dial and the polished bezel
  seg(S, { ...P.studio(), envRot: 1.6, ease: 'none' }, Tp + 0.5 * rp, Tp + 0.6 * rp);
  m.set({}, {}, at(maxY));
  keep(ScrollTrigger.create({ start: 0, end: () => maxY, scrub: reduced ? true : 1.1, animation: m }));

  // ---------------------------------------------------------------- per-section DOM
  keep(gsap.timeline({ scrollTrigger: st('#hero', { end: 'bottom top', scrub: true }) })
    .fromTo('#hero .hero__left, #hero .hero__right', { opacity: 1, y: 0 }, { opacity: 0, y: -80, ease: 'power1.in' })
    .fromTo('#hero .scrollcue', { opacity: 1 }, { opacity: 0, duration: 0.3 }, 0));

  // I. form
  const steps = $$('#formSteps .step');
  const ticks = $$('.steps__ticks i');
  keep(gsap.timeline({
    scrollTrigger: st('#form', {
      onUpdate: (self) => {
        const p = self.progress;
        const idx = p < 0.33 ? 0 : p < 0.66 ? 1 : 2;
        steps.forEach((s, i) => s.classList.toggle('is-active', i === idx && p > 0.03 && p < 0.99));
        ticks.forEach((s, i) => s.classList.toggle('is-active', i === idx));
        formCounter.set(idx);
      },
    }),
  }).fromTo('#form .chapter__head, #form .chapter__counter, #form .steps__ticks', { opacity: 1, y: 0 }, { opacity: 1, duration: 0.9 })
    .to('#form .chapter__head, #form .chapter__counter, #form .steps__ticks', { opacity: 0, y: -30, duration: 0.1 }));

  // II. craft
  const craftStage = $('#craftStage');
  const lines = $$('.craft__line');
  keep(ScrollTrigger.create({
    trigger: '#craft', start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { craft.active = self.isActive; if (self.isActive) craft.dirty = true; else craft.release(); },
  }));
  keep(gsap.timeline({
    scrollTrigger: st('#craft', {
      onUpdate: (self) => {
        const p = self.progress;
        craft.target = gsap.utils.clamp(0, craft.count - 1, gsap.utils.mapRange(0.1, 0.9, 0, craft.count - 1, p));
        for (const l of lines) {
          const [a0, a1] = l.dataset.range.split(',').map(Number);
          const k = Math.min(gsap.utils.normalize(a0, a0 + 0.06, p), 1 - gsap.utils.normalize(a1 - 0.06, a1, p));
          const o = gsap.utils.clamp(0, 1, k);
          l.style.opacity = o;
          l.style.translate = `0 ${(1 - o) * 30}px`;
          l.style.filter = o < 1 ? `blur(${(1 - o) * 8}px)` : 'none';
        }
      },
    }),
  })
    .fromTo(craftStage, { clipPath: 'inset(50% 0% 50% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.11, ease: 'power2.inOut' })
    .to(craftStage, { duration: 0.78 })
    .to(craftStage, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.11, ease: 'power2.inOut' })
    .fromTo('#craftCanvas', { scale: 1.12 }, { scale: 1, duration: 1, ease: 'none' }, 0));

  // III. dial copy
  keep(gsap.timeline({ scrollTrigger: st('#dial', { start: 'top 70%', end: 'bottom 80%', scrub: true }) })
    .fromTo('#dial .dial__text', { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.15 })
    .to({}, { duration: 0.7 })
    .to('#dial .dial__text', { opacity: 0, y: -30, duration: 0.12 }));

  // IV. anatomy heading
  keep(gsap.timeline({ scrollTrigger: st('#anatomy', { start: 'top 60%', end: 'bottom bottom', scrub: true }) })
    .fromTo('#anatomy .chapter__head', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.12 })
    .to('#anatomy .chapter__head', { opacity: 1, duration: 0.18 })
    .to('#anatomy .chapter__head', { opacity: 0, y: -30, duration: 0.08 })
    .to({}, { duration: 0.6 }));

  // interlude: iris opens onto the marble film
  const pv = $('#presenceVideo');
  keep(gsap.timeline({
    scrollTrigger: st('#presence', {
      start: 'top bottom', end: 'bottom bottom',
      onToggle: (self) => {
        if (self.isActive) {
          if (!pv.src) pv.src = `video/presence-${vq}.mp4`;
          pv.play().catch(() => {});
        } else pv.pause();
      },
    }),
  })
    .to({}, { duration: 0.25 })
    .fromTo('#presenceStage', { clipPath: 'circle(0% at 50% 55%)' }, { clipPath: 'circle(75% at 50% 55%)', duration: 0.3, ease: 'power2.inOut' })
    .fromTo(pv, { scale: 1.3 }, { scale: 1.02, duration: 0.75, ease: 'none' }, 0.25)
    .fromTo('.presence__quote', { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.15 }, 0.5)
    .to('.presence__quote', { opacity: 0, y: -30, duration: 0.1 }, 0.9));
  keep(ScrollTrigger.create({ trigger: '#presence', start: 'top top', onEnter: () => $('.presence__quote [data-split]').classList.add('is-in') }));
  // the interlude track plays from the moment the iris opens until the wrist films end
  keep(ScrollTrigger.create({
    trigger: '#presence', start: 'top 30%', endTrigger: '#wrist', end: 'bottom top',
    onEnter: () => music.play(), onEnterBack: () => music.play(), onLeave: () => music.stop(), onLeaveBack: () => music.stop(),
  }));

  // V. on the wrist: a framed day film opens to full bleed, night wipes in beside it, then takes over
  const vertical = small.matches;
  const dayFrom = vertical ? 'inset(30% 14% 30% 14% round 4px)' : 'inset(24% 32% 24% 32% round 4px)';
  const full = 'inset(0% 0% 0% 0% round 0px)';
  const nightFrom = vertical ? 'inset(100% 0% 0% 0% round 0px)' : 'inset(0% 0% 0% 100% round 0px)';
  const nightHalf = vertical ? 'inset(50% 0% 0% 0% round 0px)' : 'inset(0% 0% 0% 50% round 0px)';
  // while split, slide each film so its subject sits in the middle of its half
  const half = vertical ? 'yPercent' : 'xPercent';
  keep(ScrollTrigger.create({
    trigger: '#wrist', start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { if (self.isActive) wrist.start(wrist.day, true); else { wrist.stop(wrist.day); wrist.stop(wrist.night); } },
  }));
  keep(gsap.timeline({
    scrollTrigger: st('#wrist', {
      onUpdate: (self) => {
        const p = self.progress;
        if (p > 0.36 && !wrist.active.has(wrist.night)) wrist.start(wrist.night, true);
        else if (p < 0.3 && wrist.active.has(wrist.night)) { wrist.stop(wrist.night); wrist.night.currentTime = 0; }
        // once night covers the whole screen the day film is hidden: stop decoding it
        if (p > 0.93 && wrist.active.has(wrist.day)) wrist.stop(wrist.day);
        else if (p < 0.9 && self.isActive && !wrist.active.has(wrist.day)) wrist.start(wrist.day);
      },
    }),
  })
    .fromTo('#wristDay', { clipPath: dayFrom }, { clipPath: full, duration: 0.2, ease: 'power2.inOut' }, 0)
    .fromTo(wrist.day, { scale: 1.2, [half]: 0 }, { scale: 1, duration: 0.42, ease: 'none' }, 0)
    .fromTo('.wrist__head', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.08 }, 0.1)
    .fromTo('#wristDay .wrist__tag', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.06 }, 0.16)
    .to('.wrist__head', { opacity: 0, y: -30, duration: 0.06 }, 0.4)
    .fromTo('#wristNight', { clipPath: nightFrom }, { clipPath: nightHalf, duration: 0.16, ease: 'power2.inOut' }, 0.42)
    .fromTo(wrist.night, { [half]: 25, scale: 1.08 }, { scale: 1, duration: 0.32, ease: 'none' }, 0.42)
    .to(wrist.day, { [half]: -25, duration: 0.16, ease: 'power2.inOut' }, 0.42)
    .fromTo('#wristNight .wrist__tag', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.06 }, 0.54)
    .fromTo('.wrist__facts > div', { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.02, duration: 0.06 }, 0.58)
    .to('#wristNight', { clipPath: full, duration: 0.16, ease: 'power2.inOut' }, 0.76)
    .to(wrist.night, { [half]: 0, duration: 0.16, ease: 'power2.inOut' }, 0.76)
    .to('#wristDay .wrist__tag', { opacity: 0, duration: 0.04 }, 0.76)
    .to('.wrist__facts > div', { opacity: 0, y: -20, duration: 0.05 }, 0.84)
    // hide the day panel before the night one fades out, or it shows through as a double exposure
    .to('#wristDay', { opacity: 0, duration: 0.005 }, 0.92)
    .to('#wristNight', { opacity: 0, duration: 0.07 }, 0.93));

  // studio copy; reset lighting when scrolling back above it
  keep(gsap.fromTo('#studio .studio__panel > *, #studio .studio__hint', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.06, scrollTrigger: st('#studio', { start: 'top 75%', end: 'top 15%', scrub: true }) }));
  keep(ScrollTrigger.create({
    trigger: '#studio', start: 'top bottom', end: 'bottom top',
    onLeaveBack: () => resetStudio(),
  }));

  // finale film (the variant follows the chosen dial)
  keep(ScrollTrigger.create({
    trigger: '#finale', start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { if (self.isActive) finale.enter(); else finale.leave(); },
  }));
  keep(gsap.fromTo('.finale__video', { yPercent: -14 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '#finale', start: 'top bottom', end: 'top top', scrub: true } }));
  keep(gsap.fromTo('.finale__inner > *', { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.08, scrollTrigger: { trigger: '#finale', start: 'top 70%', end: 'top 10%', scrub: true } }));

  // chapter nav + rail + tick
  for (const id of Object.keys(CHAPTER_NUM)) {
    keep(ScrollTrigger.create({
      trigger: '#' + id, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        $$('[data-chapter-link]').forEach((l) => l.classList.toggle('is-active', l.dataset.chapterLink === id));
        $('#railLabel').textContent = CHAPTER_NUM[id];
        if (introDone) sfx.tick();
      },
    }));
  }
  const railFill = $('.rail__fill');
  keep(ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => { railFill.style.transform = `scaleY(${self.progress})`; } }));

  keep(ScrollTrigger.create({ trigger: '#specList', start: 'top 85%', onEnter: () => $$('.spec-group, .spec').forEach((e, i) => setTimeout(() => e.classList.add('is-in'), i * 45)) }));
  keep(ScrollTrigger.create({ trigger: '#blueprint', start: 'top 85%', once: true, onEnter: () => gsap.to('#blueprint [pathLength]', { strokeDashoffset: 0, duration: 2.6, stagger: 0.035, ease: 'power2.inOut' }) }));
}

function resetStudio() {
  if (stage.envName !== 'studio') {
    stage.setEnvironment('studio');
    setActive('#lights button', (b) => b.dataset.light === 'studio');
  }
  gsap.to(S, { lume: 0, userRotX: 0, userRotY: 0, duration: 0.6 });
  if (flipped) gsap.to(S, { bracelet: 1, envRot: S.envRot - Math.PI, pivot: 1, duration: 0.6 });
  flipped = false;
  $('#flipBtn').textContent = t('studio.flip');
}

let rebuildTimer;
let lastW = innerWidth;
let layoutStale = false;
addEventListener('resize', () => {
  for (const it of Object.values(annotations.items)) it.w = 0;
  if (!introDone) { Object.assign(S, filmPose()); layoutStale = true; return; }
  craft.dirty = true;
  // mobile browsers resize the viewport height while scrolling (toolbar); only rebuild on real changes
  if (Math.abs(innerWidth - lastW) < 2 && small.matches) return;
  lastW = innerWidth;
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { buildTimelines(); ScrollTrigger.refresh(); }, 250);
});

// ------------------------------------------------------------------ specs
function renderSpecs() {
  const list = $('#specList');
  const shown = list.querySelector('.is-in') !== null;
  list.innerHTML = DICT[lang].specs.map(([group, rows], g) => `
    <section class="spec-group">
      <h3 class="spec-group__title"><span class="num">${String(g + 1).padStart(2, '0')}</span>${group}</h3>
      <dl>${rows.map(([k, v]) => `<div class="spec"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </section>`).join('');
  if (shown) $$('.spec-group, .spec', list).forEach((e) => e.classList.add('is-in'));
}
$('#blueprint').innerHTML = buildBlueprint();

// ------------------------------------------------------------------ studio interaction
function setActive(sel, pred) {
  for (const b of $$(sel)) {
    const on = pred(b);
    b.classList.toggle('is-active', on);
    if (b.hasAttribute('role')) b.setAttribute('aria-checked', String(on));
  }
}
{
  const drag = $('#studioDrag');
  let down = false, lx = 0, ly = 0, vx = 0, vy = 0;
  drag.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; ly = e.clientY; vx = vy = 0; drag.setPointerCapture(e.pointerId); gsap.killTweensOf(S, 'userRotX,userRotY'); });
  drag.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    vx = dx * 0.009; vy = dy * 0.006;
    S.userRotY += vx;
    S.userRotX = gsap.utils.clamp(-1.1, 1.1, S.userRotX + vy);
  });
  const up = () => { down = false; };
  drag.addEventListener('pointerup', up);
  drag.addEventListener('pointercancel', up);
  gsap.ticker.add(() => {
    if (down) return;
    if (Math.abs(vx) > 0.0001 || Math.abs(vy) > 0.0001) {
      S.userRotY += vx; S.userRotX = gsap.utils.clamp(-1.1, 1.1, S.userRotX + vy);
      vx *= 0.94; vy *= 0.9;
    }
  });

  // one full turn of the studio lights: the highlight sweeps across the new dial and settles exactly
  // where it started. Quick repeated clicks continue the same sweep, so the light never drifts.
  let envHome = null;
  let dialSwap = null, lightSwap = null; // the running dial / light changes
  const sweepLight = () => {
    if (envHome === null) envHome = S.envRot;
    gsap.killTweensOf(S, 'envRot');
    gsap.fromTo(S, { envRot: S.envRot }, { envRot: envHome + Math.PI * 2, duration: 2.4, ease: 'power2.inOut', onComplete: settleLight });
  };
  const settleLight = () => {
    if (envHome === null) return;
    gsap.killTweensOf(S, 'envRot');
    S.envRot = envHome;
    envHome = null;
  };

  for (const b of $$('#swatches .swatch')) {
    b.addEventListener('click', () => {
      if (b.classList.contains('is-active')) return;
      sfx.click();
      chooseDial(b.dataset.dial);
      // a quicker next click cancels this swap, so only the final choice redraws the 4K dial texture
      dialSwap?.kill();
      dialSwap = gsap.timeline()
        .to(S, { exposure: 0.25, duration: 0.35, ease: 'power2.in' })
        .add(() => applyDial3D())
        .to(S, { exposure: 1, duration: 0.9, ease: 'power2.out' });
      sweepLight();
    });
  }
  for (const b of $$('#lights button')) {
    b.addEventListener('click', () => {
      if (b.classList.contains('is-active')) return;
      sfx.click();
      setActive('#lights button', (s) => s === b);
      const l = b.dataset.light;
      lightSwap?.kill(); // likewise only the final choice rebuilds the environment map
      lightSwap = gsap.timeline()
        .to(S, { exposure: 0.3, duration: 0.35, ease: 'power2.in' })
        .add(() => stage.setEnvironment(l))
        .to(S, { exposure: 1, duration: 1.0, ease: 'power2.out' });
      gsap.to(S, { lume: l === 'noir' ? 1 : 0, duration: 1.6, ease: 'power2.inOut' });
    });
  }
  // the closed bracelet runs right across the caseback: fold it away while the back is shown
  $('#flipBtn').addEventListener('click', () => {
    sfx.click();
    settleLight(); // the flip turns the lights from their resting place
    flipped = !flipped;
    const base = Math.round(S.userRotY / (2 * Math.PI)) * 2 * Math.PI;
    gsap.to(S, { userRotY: base + (flipped ? Math.PI : 0), userRotX: 0, duration: 1.8, ease: 'power3.inOut' });
    gsap.to(S, { bracelet: flipped ? 0 : 1, duration: 0.9, delay: flipped ? 0 : 0.8, ease: 'power2.inOut' });
    // turn the studio lights with the watch, so the caseback is lit like the dial instead of by the back lights
    gsap.to(S, { envRot: S.envRot + (flipped ? Math.PI : -Math.PI), duration: 1.8, ease: 'power3.inOut' });
    gsap.to(S, { pivot: flipped ? 0 : 1, duration: 1.8, ease: 'power3.inOut' });
    $('#flipBtn').textContent = t(flipped ? 'studio.flipBack' : 'studio.flip');
  });
  $('#resetBtn').addEventListener('click', () => {
    sfx.click();
    settleLight();
    if (flipped) {
      gsap.to(S, { bracelet: 1, duration: 0.9, delay: 0.7 });
      gsap.to(S, { envRot: S.envRot - Math.PI, pivot: 1, duration: 1.6, ease: 'power3.inOut' });
    }
    flipped = false;
    gsap.to(S, { userRotY: 0, userRotX: 0, duration: 1.6, ease: 'power3.inOut' });
    $('#flipBtn').textContent = t('studio.flip');
  });
}

// ------------------------------------------------------------------ dial choice (configurator + finale film)
let dial3D = 'obsidian';
// Redraws the 3D dial when the selection differs from what the model shows. A choice made in the
// finale, where the film covers the canvas, is applied in idle time after the dissolve, and at the
// latest in the frame the canvas comes back into view (see the main loop).
function applyDial3D() {
  const k = $('#swatches .is-active').dataset.dial;
  if (k === dial3D) return;
  dial3D = k;
  stage.setDial(k);
}
function chooseDial(k) {
  setActive('#swatches .swatch', (s) => s.dataset.dial === k);
  setActive('#finaleSwatches .fswatch', (s) => s.dataset.dial === k);
  $('#studioName').textContent = $('#swatches .is-active span').textContent;
  finale.show(k);
}

const finale = {
  vids: [$('#finaleA'), $('#finaleB')], front: 0, dial: 'obsidian', active: false, fading: false, queued: null,
  src(k) { return `video/finale-${k}-${vq}.mp4`; },
  poster(k) { return `img/finale-${k}-poster.jpg`; },
  enter() {
    this.active = true;
    const v = this.vids[this.front];
    if (!v.getAttribute('src')) v.src = this.src(this.dial);
    v.play().catch(() => {});
  },
  leave() {
    this.active = false;
    for (const v of this.vids) v.pause();
  },
  show(k) {
    if (this.fading) { this.queued = k; return; }
    if (k === this.dial) return;
    this.dial = k;
    const out = this.vids[this.front];
    // off screen: swap quietly, the right film is waiting when the visitor arrives
    if (!this.active || !out.getAttribute('src') || reduced) {
      out.poster = this.poster(k);
      if (out.getAttribute('src')) { out.src = this.src(k); if (this.active) out.play().catch(() => {}); }
      return;
    }
    // on screen: start the new variant at the same moment of the shot and dissolve into it.
    // The films share camera and light, so only the dial appears to change colour.
    const inc = this.vids[1 - this.front];
    this.fading = true;
    let settled = false;
    // a stalled network or a refused play() must not lock the picker: fall back to a plain cut
    const cut = () => {
      if (settled) return;
      settled = true;
      gsap.set(inc, { opacity: 0 });
      inc.removeAttribute('src'); inc.load();
      out.poster = this.poster(this.dial);
      out.src = this.src(this.dial);
      out.play().catch(() => {});
      done();
    };
    const guard = setTimeout(cut, 4000);
    const done = () => {
      clearTimeout(guard);
      this.fading = false;
      const q = this.queued;
      this.queued = null;
      if (q && q !== this.dial) this.show(q);
    };
    const fade = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      gsap.set(out, { zIndex: 0 });
      gsap.set(inc, { zIndex: 1 });
      gsap.fromTo(inc, { opacity: 0 }, {
        opacity: 1, duration: 1.2, ease: 'power2.inOut',
        onComplete: () => {
          gsap.set(out, { opacity: 0 });
          out.pause();
          out.removeAttribute('src'); out.load(); // free the decoder of the hidden layer
          this.front = 1 - this.front;
          done();
        },
      });
    };
    const start = () => {
      inc.addEventListener('seeked', () => {
        inc.play().then(() => {
          if (inc.requestVideoFrameCallback) inc.requestVideoFrameCallback(fade); else requestAnimationFrame(fade);
        }).catch(cut);
      }, { once: true });
      inc.currentTime = ((out.currentTime || 0) + 0.12) % (out.duration || 10);
    };
    inc.poster = this.poster(k);
    inc.preload = 'auto'; // with preload="none" the browser would not even fetch metadata
    inc.src = this.src(k);
    inc.load();
    inc.addEventListener('loadedmetadata', start, { once: true });
  },
};
// the finale picker mirrors the configurator swatches
for (const s of $$('#swatches .swatch')) {
  const b = document.createElement('button');
  const on = s.classList.contains('is-active');
  b.className = 'fswatch' + (on ? ' is-active' : '');
  b.dataset.dial = s.dataset.dial;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(on));
  b.style.setProperty('--c', s.style.getPropertyValue('--c'));
  b.appendChild(document.createElement('i'));
  b.addEventListener('click', () => {
    if (b.classList.contains('is-active')) return;
    sfx.click();
    chooseDial(b.dataset.dial);
    if (stage.visible) applyDial3D();
    else setTimeout(() => (window.requestIdleCallback || setTimeout)(applyDial3D), 1400);
  });
  $('#finaleSwatches').appendChild(b);
}
function labelFinaleSwatches() {
  for (const b of $$('#finaleSwatches .fswatch')) {
    const name = $(`#swatches [data-dial="${b.dataset.dial}"] span`).textContent;
    b.setAttribute('aria-label', name);
    b.title = name;
  }
  $('#finaleSwatches').setAttribute('aria-label', t('finale.dial'));
}
labelFinaleSwatches();

// ------------------------------------------------------------------ menu (tablet / phone)
const menu = $('#menu');
const menuBtn = $('#menuToggle');
function setMenu(open) {
  document.body.classList.toggle('is-menu', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.querySelector('span').textContent = t(open ? 'nav.close' : 'nav.menu');
  menu.setAttribute('aria-hidden', String(!open));
  menu.inert = !open;
  if (open) lenis.stop(); else if (introDone && !demo.open) lenis.start();
}
menuBtn.addEventListener('click', () => { sfx.click(); setMenu(!document.body.classList.contains('is-menu')); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('is-menu')) setMenu(false); });

// ------------------------------------------------------------------ demo notice ("ask about availability")
const demo = $('#demo');
const configSummary = () => `${$('#swatches .is-active span').textContent} · ${t('light.' + (stage.envName || 'studio'))}`;
function openDemo() {
  sfx.click();
  if (document.body.classList.contains('is-menu')) setMenu(false);
  $('#demoSummary').textContent = configSummary();
  const title = $('#demoTitle');
  title.classList.remove('is-in');
  demo.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => title.classList.add('is-in')));
  lenis.stop();
}
$$('[data-demo]').forEach((b) => b.addEventListener('click', openDemo));
$('#demoClose').addEventListener('click', () => demo.close());
$$('#demo [data-close]').forEach((b) => b.addEventListener('click', () => demo.close()));
demo.addEventListener('click', (e) => { if (e.target === demo) demo.close(); });
demo.addEventListener('close', () => { if (introDone) lenis.start(); });

// ------------------------------------------------------------------ interlude music
// A separate file (not muxed into the looping marble film): it plays once through with fades,
// and it is only downloaded by visitors who turned the sound on.
const music = {
  el: new Audio(), wanted: false,
  play() {
    this.wanted = true;
    if (!soundOn) return;
    const a = this.el;
    if (!a.getAttribute('src')) { a.src = 'audio/interlude.m4a'; a.preload = 'auto'; }
    if (a.paused) { a.currentTime = 0; a.volume = 0; a.play().catch(() => {}); }
    gsap.to(a, { volume: 0.85, duration: 1.4, ease: 'power1.out', overwrite: true });
  },
  stop() {
    this.wanted = false;
    const a = this.el;
    if (a.paused) return;
    gsap.to(a, { volume: 0, duration: 1.4, ease: 'power1.in', overwrite: true, onComplete: () => a.pause() });
  },
  mute() { gsap.killTweensOf(this.el); this.el.pause(); },
};

// ------------------------------------------------------------------ chrome
function setSound(on) {
  soundOn = on;
  sfx.enable(on);
  document.body.classList.toggle('is-sound', on);
  $('#soundToggle').setAttribute('aria-pressed', String(on));
  // only the intro film carries audio; the interlude track is a separate element
  for (const v of $$('video')) v.muted = !on;
  if (!on) music.mute(); else if (music.wanted) music.play();
}
$('#langToggle').addEventListener('click', () => {
  lang = lang === 'pl' ? 'en' : 'pl';
  try { localStorage.setItem('apk-lang', lang); } catch (e) { /* storage blocked */ }
  sfx.click();
  applyLang();
  if (demo.open) $('#demoSummary').textContent = configSummary();
});
$('#soundToggle').addEventListener('click', () => { setSound(!soundOn); sfx.click(); });

// ------------------------------------------------------------------ main loop
gsap.ticker.add((time) => {
  cursor.update();
  if (!introDone && !document.body.classList.contains('is-intro')) return;
  const y = window.scrollY;
  const visible = !hiddenRanges.some(([a, b]) => y > a && y < b);
  if (visible && !stage.visible) applyDial3D(); // coming back into view: catch up with a dial picked meanwhile
  stage.visible = visible;
  stage.render();
  annotations.update(time);
  craft.update();
  wrist.tick();
});

buildTimelines();
observeReveals();
document.fonts?.ready.then(() => { buildTimelines(); ScrollTrigger.refresh(); });
// keep scroll position meaningful after reload
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

if (import.meta.env.DEV) {
  window.__apk = {
    stage, S, lenis, craft, music,
    // debug: magnify a region of the WebGL frame into a full-screen overlay (fractions of the viewport)
    zoom(x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
      document.getElementById('__zoom')?.remove();
      if (x0 === null) return;
      stage.render();
      const c = stage.canvas;
      const o = document.createElement('canvas');
      o.id = '__zoom';
      o.width = innerWidth; o.height = innerHeight;
      Object.assign(o.style, { position: 'fixed', inset: 0, zIndex: 9999, width: '100%', height: '100%', background: '#000' });
      const sw = (x1 - x0) * c.width, sh = (y1 - y0) * c.height;
      const k = Math.min(o.width / sw, o.height / sh);
      o.getContext('2d').drawImage(c, x0 * c.width, y0 * c.height, sw, sh, (o.width - sw * k) / 2, (o.height - sh * k) / 2, sw * k, sh * k);
      document.body.appendChild(o);
    },
  };
}
