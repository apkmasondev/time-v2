import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildEnvironment } from './env.js';
import { makeDialTextures, makeBrushedTextures, makeDateTexture, makeCasebackTextures } from './textures.js';

// Blender (x, y, z) mm  ->  glTF (x, z, -y)
const B = (x, y, z) => new THREE.Vector3(x, z, -y);

export const DIALS = {
  obsidian: { base: '#202226', print: '#f2f1ec', grain: 0.06, rough: 0.34, metal: 0.6, center: 'rgba(255,255,255,0.05)', edge: 'rgba(0,0,0,0.6)' },
  // hues sampled from the finale films, so the 3D dial and the film show the same colour
  glacier: { base: '#a2c7d6', print: '#101418', grain: 0.05, rough: 0.3, metal: 0.5, center: 'rgba(255,255,255,0.22)', edge: 'rgba(20,55,75,0.42)', date: ['#f3f3f0', '#101418'] },
  abyss: { base: '#1c3c7c', print: '#f0efe9', grain: 0.07, rough: 0.32, metal: 0.65, center: 'rgba(120,160,255,0.2)', edge: 'rgba(0,3,18,0.72)' },
  verde: { base: '#1d5c30', print: '#f0efe9', grain: 0.07, rough: 0.32, metal: 0.65, center: 'rgba(170,255,175,0.14)', edge: 'rgba(0,10,2,0.72)' },
  // lower metalness keeps it a lacquered yellow instead of turning brassy gold
  // no-date version, as in the films: the aperture closes and the 3 o'clock index runs full length
  solar: { base: '#e3ae1e', print: '#17140c', grain: 0.05, rough: 0.28, metal: 0.18, center: 'rgba(255,245,200,0.3)', edge: 'rgba(120,70,0,0.45)', noDate: true },
};

// how far each component travels in the exploded view (glTF units = mm, +Y = dial normal)
const EXPLODE = {
  // everything above the case lifts well clear of it, so its bore (and the movement below) shows
  Crystal: [0, 41, 0], Bezel: [0, 32, 0], Flange: [0, 24.5, 0],
  SecondHand: [0, 20, 0], MinuteHand: [0, 18.2, 0], HourHand: [0, 16.4, 0],
  Indices: [0, 10.6, 0], DateFrame: [0, 10.6, 0], Dial: [0, 9, 0], DateDisc: [0, 7, 0],
  Case: [0, 0, 0], Crown: [15, 0, 0], Movement: [0, -12, 0], Caseback: [0, -22, 0], Bracelet: [0, -12, 0],
};

export class WatchStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.isMobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x050506, 1);
    this.maxDpr = this.isMobile ? 1.5 : 1.75;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.dprCap = this.maxDpr; // lowered whenever a resolution proves too slow
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.1, 200);
    this.timer = new THREE.Timer();
    this.timer.connect(document); // ignores the time spent in a background tab
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this._v = new THREE.Vector3();
    this.dateDay = new Date().getDate();
    this.dateInk = ['#efeee9', '#0d0d0f'];

    // Choreography state — tweened from the outside (GSAP) and read every frame.
    this.S = {
      dist: 16, fov: 22, shiftX: 0, shiftY: 0,
      rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0,
      explode: 0, bracelet: 1, pedestal: 1,
      column: 1, columnX: 0, columnW: 0.3, panel: 1,
      envRot: 0, envIntensity: 1, exposure: 1,
      lume: 0, timeWarp: 0, float: 1, parallax: 1, pivot: 0,
      userRotX: 0, userRotY: 0,
    };
    this.pointer = new THREE.Vector2();
    this.pointerLerp = new THREE.Vector2();
    this.anchors = {};
    this.visible = true;
    this.frameTimes = [];

    this._initBackdrop();
    this._initComposer();
    this.setEnvironment('studio');
    this.resize();
    window.addEventListener('resize', () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => { this._resizeQueued = false; this.resize(); });
    });
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
  }

  // ------------------------------------------------------------------ backdrop
  _initBackdrop() {
    const mat = new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false,
      uniforms: {
        uColumn: { value: 1 }, uColumnX: { value: 0 }, uColumnW: { value: 0.3 }, uPanel: { value: 1 },
        uAspect: { value: 1 }, uTime: { value: 0 }, uLume: { value: 0 },
        uTint: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: `
        uniform float uColumn, uColumnX, uColumnW, uPanel, uAspect, uTime, uLume; uniform vec3 uTint;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 p = vUv*2.0-1.0;
          // soft light column (like the plinth light in the film)
          float cx = (p.x - uColumnX) * uAspect;
          float col = exp(-pow(cx / uColumnW, 2.0) * 1.6);
          float colCore = exp(-pow(cx / (uColumnW*0.55), 2.0) * 2.0);
          float vfall = smoothstep(-1.2, 0.6, p.y) * (1.0 - smoothstep(0.7, 1.3, p.y)*0.55);
          // hard-edged lit panel (matches the film's last frame)
          float W = uColumnW * 1.9;
          float panel = 1.0 - smoothstep(W*0.94, W*1.02, abs(cx));
          float pgrad = mix(0.2, 0.075, smoothstep(-0.7, 1.0, p.y)) * (0.78 + 0.22*exp(-pow(cx/W,2.0)*2.0));
          vec3 base = vec3(0.012, 0.012, 0.014);
          vec3 soft = uTint * (col*0.16 + colCore*0.22) * vfall;
          vec3 hard = uTint * vec3(0.9, 0.96, 1.08) * panel * pgrad;
          vec3 c = base + mix(soft, hard, uPanel) * uColumn;
          // vignette
          float v = smoothstep(1.75, 0.35, length(p*vec2(0.85, 1.0)));
          c *= mix(0.35, 1.0, v);
          // night: faint cool glow
          c += vec3(0.0, 0.012, 0.01) * uLume * col;
          c += (hash(vUv*vec2(1733.,977.) + uTime) - 0.5) * 0.004;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    this.backdrop = new THREE.Mesh(geo, mat);
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -10;
    this.scene.add(this.backdrop);
  }

  _initComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, { type: THREE.HalfFloatType, samples: this.isMobile ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // gentle: only the hottest speculars on the polished bezel glow, the backdrop never does
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.08, 0.22, 2.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setEnvironment(name) {
    const old = this.envRT;
    this.envRT = buildEnvironment(this.pmrem, name);
    this.scene.environment = this.envRT.texture;
    this.envName = name;
    old?.dispose(); // frees the framebuffer too, not only the texture
    const tint = { studio: [1, 1, 1], noir: [0.55, 0.65, 1.0], aurum: [1.0, 0.78, 0.55] }[name] || [1, 1, 1];
    this.backdrop.material.uniforms.uTint.value.setRGB(...tint);
  }

  // ------------------------------------------------------------------ loading
  async load(url, onProgress) {
    // fetch the model straight away (it is preloaded) while the fonts for the dial print load
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltfReady = loader.loadAsync(url, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    try {
      await Promise.all([
        document.fonts.load('500 64px "Cormorant Garamond"'),
        document.fonts.load('500 64px "Manrope"'),
        document.fonts.load('600 64px "Manrope"'),
      ]);
    } catch (e) { /* fall back to system fonts */ }
    const gltf = await gltfReady;
    this._setupModel(gltf.scene);
    this._initPedestal();
    // compile shaders up-front to avoid a hitch on the first reveal
    await this.renderer.compileAsync?.(this.scene, this.camera);
  }

  _materials() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const brushed = makeBrushedTextures(this.isMobile ? 512 : 1024);
    for (const t of [brushed.bump, brushed.orm]) { t.repeat.set(0.35, 1.4); t.anisotropy = maxAniso; }

    const polished = new THREE.MeshPhysicalMaterial({
      name: 'polished', color: 0xeeeef1, metalness: 1, roughness: 0.085,
      envMapIntensity: 1.0,
    });
    const brushedMat = new THREE.MeshPhysicalMaterial({
      name: 'brushed', color: 0xf0f0f2, metalness: 1, roughness: 0.55,
      roughnessMap: brushed.orm, bumpMap: brushed.bump, bumpScale: 0.18,
      anisotropy: 0.65, anisotropyRotation: Math.PI / 2,
    });
    // roughnessMap G channel (~0.59) * roughness 0.55 -> ~0.32: satin brushed steel
    const dialTex = makeDialTextures(this.isMobile ? 2048 : 4096, DIALS.obsidian);
    for (const t of [dialTex.map, dialTex.orm]) t.anisotropy = maxAniso;
    const dial = new THREE.MeshPhysicalMaterial({
      name: 'dial', color: 0xffffff, map: dialTex.map,
      roughness: 1, metalness: 1, roughnessMap: dialTex.orm, metalnessMap: dialTex.orm,
      anisotropy: 0.85, anisotropyMap: dialTex.aniso,
      clearcoat: 0.55, clearcoatRoughness: 0.07,
    });
    const dialSide = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.5, metalness: 0.4 });
    const lume = new THREE.MeshStandardMaterial({
      name: 'lume', color: 0xe9ede4, roughness: 0.55, metalness: 0,
      emissive: new THREE.Color(0x7dffcf), emissiveIntensity: 0,
    });
    // Sapphire: no refraction pass (it softens the dial). A black, additively blended surface
    // contributes only its Fresnel reflection, so the print underneath stays razor sharp.
    const crystal = new THREE.MeshPhysicalMaterial({
      name: 'crystal', color: 0x000000, metalness: 0, roughness: 0.03,
      specularIntensity: 0.8, iridescence: 0.3, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 340],
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.0,
    });
    const date = new THREE.MeshStandardMaterial({ map: makeDateTexture(this.dateDay), roughness: 0.45 });
    const flange = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.38, metalness: 0.7 });
    const cb = makeCasebackTextures(this.isMobile ? 1024 : 2048);
    const caseback = new THREE.MeshPhysicalMaterial({
      color: 0xe9e9ec, metalness: 1, roughness: 0.16, bumpMap: cb.bump, bumpScale: 0.6,
    });
    // movement: rhodium-plated plate, gilt wheels, rubies
    const mvPlate = new THREE.MeshPhysicalMaterial({ color: 0xc8cbd0, metalness: 1, roughness: 0.34 });
    const mvGold = new THREE.MeshPhysicalMaterial({ color: 0xd6b16c, metalness: 1, roughness: 0.26 });
    const jewel = new THREE.MeshPhysicalMaterial({ color: 0x8c0a24, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.mats = { polished, brushed: brushedMat, dial, dialSide, lume, crystal, date, flange, caseback, dialTex, mvPlate, mvGold, jewel };
    // bracelet gets its own clones so it can fade independently in the exploded view
    this.mats.bPolished = polished.clone();
    this.mats.bBrushed = brushedMat.clone();
    return this.mats;
  }

  _setupModel(root) {
    const M = this._materials();
    const byName = {
      SteelPolished: M.polished, SteelBrushed: M.brushed, Dial: M.dial, DialSide: M.dialSide,
      Lume: M.lume, Crystal: M.crystal, DateDisc: M.date, Flange: M.flange, Caseback: M.caseback,
      MovementPlate: M.mvPlate, MovementGold: M.mvGold, Jewel: M.jewel,
    };
    root.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material?.name;
      let m = byName[n] || M.polished;
      let p = o; let inBracelet = false;
      while (p) { if (p.name === 'Bracelet') inBracelet = true; p = p.parent; }
      if (inBracelet) m = n === 'SteelBrushed' ? M.bBrushed : M.bPolished;
      o.material = m;
      o.castShadow = o.receiveShadow = false;
    });

    // model root: mm -> scene units (1 unit = 1 cm), dial facing +Z, 12 o'clock up
    this.model = new THREE.Group();
    this.model.scale.setScalar(0.1);
    this.model.rotation.x = Math.PI / 2;
    this.model.position.z = 0;
    this.model.add(root);
    // move pivot to mid-case height (~4.5 mm)
    root.position.y = -4.5;

    // wrap every named part in a pivot at the origin (meshopt quantisation moved node origins)
    this.parts = {};
    const named = [];
    root.traverse((o) => { if (EXPLODE[o.name] && !this.parts[o.name]) named.push(o); });
    root.updateMatrixWorld(true);
    for (const o of named) {
      const pivot = new THREE.Group();
      pivot.name = o.name + '_pivot';
      root.add(pivot);
      pivot.updateMatrixWorld(true);
      pivot.attach(o);
      this.parts[o.name] = pivot;
    }

    // rotation pivot: 0 = dial axis (choreography), 1 = centre of the whole watch with its bracelet
    // loop (configurator), so dragging turns the watch in place instead of swinging it round the dial
    this.watch = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.add(this.model);
    this.watch.add(this.spin);
    this.scene.add(this.watch);
    this.model.updateMatrixWorld(true);
    this.center = new THREE.Box3().setFromObject(this.model).getCenter(new THREE.Vector3());

    // annotation anchors (Blender coordinates, mm)
    const A = {
      bezel: [['Bezel'], B(-13.2, 12.6, 8.4)],
      crown: [['Crown'], B(24.2, 0, 3.95)],
      case: [['Case'], B(-19.9, -2.0, 3.6)],   // left flank, 9 o'clock
      crystal: [['Crystal'], B(-11.5, -9.5, 9.1)],
      hands: [['MinuteHand'], B(0, 9, 7.6)],
      caseback: [['Caseback'], B(-12, -8, 0.2)],
      movement: [['Movement'], B(9.0, -9.2, 3.0)],   // front edge of the plate
      indices: [['Indices'], B(12.9 * Math.cos(Math.PI / 6 * 5), 12.9 * Math.sin(Math.PI / 6 * 5), 7.2)], // 10 o'clock index
      flange: [['Flange'], B(-16.5, 3, 7.4)],
    };
    for (const [k, [[part], v]] of Object.entries(A)) {
      const a = new THREE.Object3D();
      a.position.copy(v);
      this.parts[part].add(a);
      this.anchors[k] = a;
    }
    this._initNoDate(root);
  }

  // Parts of the no-date dial, hidden until a dial that needs them is chosen: a patch of dial over
  // the date aperture (same planar mapping as the dial, so print and sunburst run on unbroken) and a
  // full-length index at 3 o'clock over the short one.
  _initNoDate(root) {
    let dialMesh = null;
    this.parts.Dial.traverse((o) => { if (o.isMesh && o.material === this.mats.dial) dialMesh = o; });
    root.updateMatrixWorld(true);
    const toLocal = (x, y, z) => dialMesh.worldToLocal(root.localToWorld(B(x, y, z)));
    // least-squares fit of the dial's uv as a linear function of its local position
    const P = dialMesh.geometry.attributes.position, U = dialMesh.geometry.attributes.uv;
    const fit = (c) => {
      const A = Array.from({ length: 4 }, () => [0, 0, 0, 0]), r = [0, 0, 0, 0];
      for (let i = 0; i < P.count; i++) {
        const row = [P.getX(i), P.getY(i), P.getZ(i), 1];
        const u = c ? U.getY(i) : U.getX(i);
        for (let a = 0; a < 4; a++) { r[a] += row[a] * u; for (let b = 0; b < 4; b++) A[a][b] += row[a] * row[b]; }
      }
      for (let a = 0; a < 3; a++) A[a][a] += 1e-6 * P.count; // the dial is flat: keep the normal axis well-posed
      // Gaussian elimination
      for (let a = 0; a < 4; a++) {
        let m = a;
        for (let b = a + 1; b < 4; b++) if (Math.abs(A[b][a]) > Math.abs(A[m][a])) m = b;
        [A[a], A[m]] = [A[m], A[a]]; [r[a], r[m]] = [r[m], r[a]];
        for (let b = a + 1; b < 4; b++) {
          const f = A[b][a] / A[a][a];
          for (let k = a; k < 4; k++) A[b][k] -= f * A[a][k];
          r[b] -= f * r[a];
        }
      }
      const x = [0, 0, 0, 0];
      for (let a = 3; a >= 0; a--) { let v = r[a]; for (let k = a + 1; k < 4; k++) v -= A[a][k] * x[k]; x[a] = v / A[a][a]; }
      return (v) => x[0] * v.x + x[1] * v.y + x[2] * v.z + x[3];
    };
    const fu = fit(0), fv = fit(1);
    const z = 6.8 + 0.004;
    const corners = [toLocal(10.05, -1.15, z), toLocal(12.95, -1.15, z), toLocal(12.95, 1.15, z), toLocal(10.05, 1.15, z)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners.flatMap((v) => [v.x, v.y, v.z])), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(corners.flatMap((v) => [fu(v), fv(v)])), 2));
    const up = toLocal(0, 0, 1).sub(toLocal(0, 0, 0));
    const n = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0]));
    geo.setIndex(n.dot(up) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    this.datePatch = new THREE.Mesh(geo, this.mats.dial);
    dialMesh.add(this.datePatch);
    // full-length 3 o'clock index (Blender x along 12.9 +- 2.1, width 1.0, height 0.42) with its lume strip
    this.index3 = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 1.0), this.mats.polished);
    bar.position.copy(B(12.9, 0, 6.8 + 0.21));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.36), this.mats.lume);
    glow.position.copy(B(12.9, 0, 6.8 + 0.42 + 0.015));
    this.index3.add(bar, glow);
    this.parts.Indices.add(this.index3);
    this._setNoDate(false);
  }

  _setNoDate(on) {
    this.datePatch.visible = this.index3.visible = on;
    this.parts.DateDisc.visible = this.parts.DateFrame.visible = !on;
  }

  _initPedestal() {
    // glossy black drum, as in the film
    const R = 4.75, H = 7;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.28, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1, true), mat);
    drum.position.y = -H / 2;
    // mirror top with a dimmed, feathered reflection
    const mirror = new Reflector(new THREE.CircleGeometry(R, 128), {
      textureWidth: 1024, textureHeight: 1024, color: 0x7a7a7a, clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    const ms = mirror.material;
    ms.fragmentShader = ms.fragmentShader
      .replace('void main() {', 'varying vec2 vUv2;\nvoid main() {')
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
        'float rr = length(vUv2 - 0.5) * 2.0; float fade = 1.0 - smoothstep(0.35, 1.0, rr);\n gl_FragColor = vec4( base.rgb * 0.34 * fade + vec3(0.006), 1.0 );');
    ms.vertexShader = ms.vertexShader
      .replace('void main() {', 'varying vec2 vUv2;\nvoid main() {\n vUv2 = uv;');
    // soft contact shadow just above the mirror
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(0,0,0,0.85)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.4)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(6.5, 5.2, 1);
    shadow.position.set(0, 0.004, 0);
    // polished rim edge
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 8, 160), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.15, metalness: 0.2 }));
    rim.rotation.x = Math.PI / 2;
    this.pedestal = new THREE.Group();
    this.pedestal.add(drum, mirror, shadow, rim);
    this.pedestalGroup = new THREE.Group();
    this.pedestalGroup.add(this.pedestal);
    // watch's lowest point sits at y = -3.914 (bracelet loop, 6 o'clock side), its depth centre at z = -2.2
    this.pedestal.position.set(0, -3.915, -2.2);
    this.scene.add(this.pedestalGroup);
  }

  setDial(key) {
    const v = DIALS[key];
    if (!v || !this.mats) return;
    const old = this.mats.dialTex;
    const t = makeDialTextures(this.isMobile ? 2048 : 4096, v);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    t.map.anisotropy = t.orm.anisotropy = maxAniso;
    Object.assign(this.mats.dial, { map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, anisotropyMap: t.aniso });
    this.mats.dial.needsUpdate = true;
    this.mats.dialTex = t;
    this.dateInk = v.date || ['#efeee9', '#0d0d0f'];
    this._setDate(new Date().getDate());
    this._setNoDate(!!v.noDate);
    old?.map.dispose(); old?.orm.dispose();
  }

  _setDate(day) {
    const [bg, ink] = this.dateInk;
    this.dateDay = day;
    this.mats.date.map?.dispose();
    this.mats.date.map = makeDateTexture(day, { bg, ink });
    this.mats.date.needsUpdate = true;
  }

  // ------------------------------------------------------------------ frame
  resize() {
    const w = innerWidth, h = innerHeight;
    if (w === this.w && h === this.h && this.dpr === this._dprApplied) return;
    this._dprApplied = this.dpr;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(this.dpr);
    this.composer?.setPixelRatio(this.dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.backdrop.material.uniforms.uAspect.value = w / h;
    this.w = w; this.h = h;
  }

  project(name, out = { x: 0, y: 0, z: 0 }) {
    const a = this.anchors[name];
    if (!a) return out;
    const v = a.getWorldPosition(this._v).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.z = v.z;
    return out;
  }

  _updateHands() {
    if (!this.parts.HourHand) return;
    const real = new Date();
    // the date wheel turns over at midnight like the real thing
    if (real.getDate() !== this.dateDay && this.mats) this._setDate(real.getDate());
    const now = new Date(real.getTime() + this.S.timeWarp * 3600 * 1000);
    const ms = now.getMilliseconds();
    const s = now.getSeconds() + Math.floor(ms / 125) * 0.125; // 28 800 vph sweep
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    const TAU = Math.PI * 2;
    this.parts.SecondHand.rotation.y = -(s / 60) * TAU;
    this.parts.MinuteHand.rotation.y = -(m / 60) * TAU;
    this.parts.HourHand.rotation.y = -(h / 12) * TAU;
  }

  _applyState(dt, t) {
    const S = this.S;
    // camera
    this.camera.fov = S.fov;
    this.camera.position.set(0, 0, S.dist);
    this.camera.lookAt(0, 0, 0);
    if (S.shiftX || S.shiftY) {
      this.camera.setViewOffset(this.w, this.h, -S.shiftX * this.w, S.shiftY * this.h, this.w, this.h);
    } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();

    // pointer parallax
    const k = 1 - Math.exp(-dt * 3.0);
    this.pointerLerp.lerp(this.pointer, k);
    const px = this.pointerLerp.x * 0.09 * S.parallax, py = this.pointerLerp.y * 0.06 * S.parallax;
    const fl = Math.sin(t * 0.6) * 0.03 * S.float;

    if (this.watch) {
      this.watch.rotation.set(S.rotX - py + S.userRotX + fl * 0.4, S.rotY + px + S.userRotY, S.rotZ, 'YXZ');
      const c = this.center, k = S.pivot;
      this.spin.position.set(-c.x * k, -c.y * k, -c.z * k);
      this.watch.position.set(S.posX + c.x * k, S.posY + fl * 0.35 + c.y * k, S.posZ + c.z * k);
      // exploded view
      for (const [name, pivot] of Object.entries(this.parts)) {
        const o = EXPLODE[name];
        pivot.position.set(o[0] * S.explode, o[1] * S.explode, o[2] * S.explode);
      }
      // bracelet fade
      const b = S.bracelet;
      const bp = this.parts.Bracelet;
      bp.visible = b > 0.01;
      for (const m of [this.mats.bPolished, this.mats.bBrushed]) {
        const tr = b < 0.999;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = b;
        m.depthWrite = !tr;
      }
      // lume
      this.mats.lume.emissiveIntensity = S.lume * 2.4;
    }
    if (this.pedestalGroup) {
      this.pedestalGroup.visible = S.pedestal > 0.01;
      this.pedestalGroup.position.y = -(1 - S.pedestal) * 6;
      this.pedestalGroup.position.x = S.posX;
    }
    // backdrop + env
    const u = this.backdrop.material.uniforms;
    u.uColumn.value = S.column * (1 - S.lume * 0.85);
    u.uColumnX.value = S.columnX;
    u.uColumnW.value = S.columnW;
    u.uPanel.value = S.panel;
    u.uTime.value = t % 10;
    u.uLume.value = S.lume;
    this.scene.environmentRotation.set(0, S.envRot, 0);
    this.scene.environmentIntensity = S.envIntensity * (1 - S.lume * 0.7);
    this.renderer.toneMappingExposure = S.exposure;
  }

  render() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    if (!this.visible || !this.watch) return;
    this._updateHands();
    this._applyState(dt, t);
    this.composer.render(dt);
    this._adapt(dt);
  }

  // drop resolution if the GPU struggles
  _adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    // A level that ran too slowly is never tried again, so the resolution cannot oscillate
    // (each change reallocates the multisampled render targets: a visible hitch).
    if (avg > 1 / 40 && this.dpr > 1) {
      this.dprCap = this.dpr - 0.25;
      this.dpr = Math.max(1, this.dprCap);
      this.resize();
    } else if (avg < 1 / 58 && this.dpr + 0.25 <= Math.min(devicePixelRatio, this.dprCap)) {
      this.dpr += 0.25;
      this.resize();
    }
  }
}
