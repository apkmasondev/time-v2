import * as THREE from 'three';

// Procedural photo-studio: emissive "softboxes" and strip lights rendered into a PMREM cube.
// Polished steel is essentially a mirror of this scene, so every strip here is a highlight
// you see sliding along the bezel and bracelet.

const PRESETS = {
  studio: {
    // mid-grey room + big soft sources: steel never mirrors pure black, peaks stay controlled
    bg: 0x3a3e44,
    horizon: [0.16, 0.165, 0.175],
    lights: [
      // [intensity, color, position, scale(w,h)]
      [2.4, 0xfff7ec, [-9, 4, 6], [7, 15]],           // big key softbox, left-front
      [3.2, 0xe9f0ff, [9, 2, 3], [2.2, 15]],          // tall strip, right side
      [1.9, 0xffffff, [0, 11, -2], [14, 5]],          // overhead
      [1.3, 0xffffff, [-4, 0, -10], [5, 14]],         // back-left (rim on bracelet)
      [0.6, 0xfff4e6, [0, -9, 4], [12, 5]],           // floor bounce
      [0.6, 0xffffff, [-1, 1, 12], [10, 11]],         // large frontal card: dial + crystal always read
    ],
  },
  noir: {
    // moonlit: thin cold rims keep the silhouette readable while the lume glows
    bg: 0x020203,
    horizon: [0.012, 0.014, 0.02],
    lights: [
      [5.0, 0xc8d4ff, [-8, 2, -2], [0.6, 10]],
      [2.2, 0xb8c8ff, [0, 9, -3], [6, 0.8]],
      [1.6, 0xa0b4ff, [6, -3, -8], [10, 0.4]],
      [0.9, 0x8fa6ff, [8, 1, 4], [0.5, 12]],
    ],
  },
  aurum: {
    // low warm sun through a window, cool sky from above: steel stays steel, warmed only by the light
    bg: 0x1d1a17,
    horizon: [0.2, 0.165, 0.13],
    lights: [
      [4.2, 0xffd8a8, [-9, 1.5, 5], [5, 12]],        // warm sun key, low and to the left
      [2.6, 0xfff1e2, [9, 2, 3], [2.2, 14]],         // near-white strip, right: keeps the steel neutral
      [1.5, 0xd6e2ff, [0, 11, -2], [14, 5]],         // cool sky overhead
      [0.8, 0xffc28f, [0, -8, 4], [12, 5]],          // soft amber floor bounce
      [1.6, 0xffc58c, [-4, 0, -10], [5, 14]],        // warm rim from behind
      [0.3, 0xfff6ec, [-1, 1, 12], [10, 11]],        // frontal card: dial and crystal read
    ],
  },
};

/**
 * Returns the PMREM render target (not just its texture) so the caller can dispose the whole
 * target, framebuffer included, when switching presets. Pass a shared PMREMGenerator so its
 * blur shaders are compiled once.
 */
export function buildEnvironment(pmrem, name = 'studio') {
  const p = PRESETS[name] || PRESETS.studio;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(p.bg);

  // gradient dome: dark floor, faint horizon glow, dark sky
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { horizon: { value: new THREE.Vector3(...p.horizon) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 horizon; varying vec3 vP;
        void main(){
          float h = vP.y;
          float band = exp(-pow(h*3.2, 2.0));
          vec3 c = horizon * band + horizon*0.25*smoothstep(0.0,1.0,h);
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  scene.add(dome);

  const geo = new THREE.PlaneGeometry(1, 1);
  for (const [intensity, color, pos, [w, h]] of p.lights) {
    // soft-edged card: radial falloff so reflections have a feathered edge
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { c: { value: new THREE.Color(color).multiplyScalar(intensity) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 c; varying vec2 vUv;
        void main(){
          vec2 d = abs(vUv-0.5)*2.0;
          float m = (1.0 - smoothstep(0.72, 1.0, d.x)) * (1.0 - smoothstep(0.82, 1.0, d.y));
          gl_FragColor = vec4(c*m, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.scale.set(w, h, 1);
    m.lookAt(0, 0, 0);
    scene.add(m);
  }

  const rt = pmrem.fromScene(scene, 0.012, 0.1, 100);
  scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
  return rt;
}
