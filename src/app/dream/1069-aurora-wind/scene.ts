// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the GPU aurora for 1069-aurora-wind.
//
// Vertical auroral CURTAINS built as shader-displaced ribbon planes with additive
// blending over a sparse star backdrop. NOT a center-out radial bloom: each
// curtain is a tall, drifting sheet that ripples horizontally and shimmers along
// its height. Several curtains sit at staggered depths/positions so the field
// drifts as a whole rather than glowing out from one point.
//
// The classic green→magenta→red auroral palette is driven by uniforms the React
// layer updates from live solar-wind data:
//   uSpeed   → ripple/flow speed
//   uDensity → curtain brightness / opacity
//   uIntensity (southward Bz) → overall glow surge
//   uKp      → colour spread + how high the red tops reach (low-latitude red)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

export interface AuroraDrivers {
  speed: number; // 0..1
  density: number; // 0..1
  intensity: number; // 0..1 (southward Bz)
  kp: number; // 0..1
}

export interface AuroraScene {
  /** Advance + render one frame. dt seconds; drivers are smoothed internally. */
  render(dt: number, drivers: AuroraDrivers): void;
  /** Handle a viewport resize. */
  resize(w: number, h: number): void;
  /** Dispose GPU resources and remove the canvas listeners. */
  dispose(): void;
}

const CURTAIN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uIntensity;
  uniform float uKp;
  uniform float uOffset;
  varying vec2 vUv;
  varying float vWave;

  // cheap value noise
  float hash(float n){ return fract(sin(n)*43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash(i.x + i.y*57.0);
    float b = hash(i.x+1.0 + i.y*57.0);
    float c = hash(i.x + (i.y+1.0)*57.0);
    float d = hash(i.x+1.0 + (i.y+1.0)*57.0);
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }

  void main(){
    vUv = uv;
    vec3 pos = position;
    float t = uTime * (0.25 + uSpeed * 0.9) + uOffset * 10.0;
    // Horizontal ripple that grows toward the top of the curtain.
    float h = uv.y;
    float ripple =
      sin(pos.x * 0.6 + t * 1.3) * 1.4 +
      sin(pos.x * 1.7 - t * 0.8) * 0.6 +
      (noise(vec2(pos.x * 0.4 + uOffset * 5.0, t * 0.3)) - 0.5) * 3.0;
    pos.z += ripple * (0.3 + h * 1.0) * (0.7 + uIntensity * 0.8);
    // Slow vertical breathing of the whole sheet.
    pos.y += sin(t * 0.4 + pos.x * 0.2) * 0.4;
    vWave = ripple;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const CURTAIN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDensity;
  uniform float uIntensity;
  uniform float uKp;
  uniform float uSpeed;
  uniform float uOffset;
  varying vec2 vUv;
  varying float vWave;

  void main(){
    float h = vUv.y;                 // 0 bottom .. 1 top
    // Vertical falloff: bright lower edge fading up, like a real curtain.
    float vert = pow(1.0 - h, 0.7) * smoothstep(0.0, 0.12, h);
    // Horizontal soft edges so ribbons feel feathered.
    float horiz = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);

    // Vertical striations that scroll — the shimmer.
    float stri = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * (1.0 + uSpeed * 3.0) + uOffset * 20.0 + vWave);

    // Palette: green base, magenta mid, red tops. Kp pushes red lower (low
    // latitude red curtains during strong storms).
    float redLine = mix(0.78, 0.45, clamp(uKp, 0.0, 1.0));
    vec3 green   = vec3(0.10, 0.95, 0.45);
    vec3 magenta = vec3(0.85, 0.25, 0.95);
    vec3 red     = vec3(0.98, 0.18, 0.22);

    vec3 col = green;
    col = mix(col, magenta, smoothstep(0.4, redLine, h));
    col = mix(col, red, smoothstep(redLine, 1.0, h));

    float bright = vert * horiz * stri;
    bright *= (0.35 + uDensity * 0.9);          // density → brightness
    bright *= (0.5 + uIntensity * 1.1);         // southward Bz → surge
    // Kp widens the active band so curtains reach higher.
    bright *= (0.7 + uKp * 0.6);

    float alpha = clamp(bright, 0.0, 1.0);
    gl_FragColor = vec4(col * (0.8 + bright), alpha);
  }
`;

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  varying float vTw;
  void main(){
    vTw = 0.5 + 0.5 * sin(uTime * 0.7 + aPhase * 6.28318);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (1.0 + vTw * 1.6) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying float vTw;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.0, r) * (0.35 + 0.5 * vTw);
    gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);
  }
`;

export function buildScene(canvas: HTMLCanvasElement): AuroraScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setClearColor(0x02030a, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02030a, 0.012);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  camera.position.set(0, 2, 26);
  camera.lookAt(0, 6, -10);

  // ── star backdrop ──────────────────────────────────────────────────────────
  const STAR_N = 900;
  const starPos = new Float32Array(STAR_N * 3);
  const starPhase = new Float32Array(STAR_N);
  for (let i = 0; i < STAR_N; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 160;
    starPos[i * 3 + 1] = Math.random() * 70 - 10;
    starPos[i * 3 + 2] = -20 - Math.random() * 120;
    starPhase[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
  const starUniforms = { uTime: { value: 0 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── auroral curtains ────────────────────────────────────────────────────────
  type CurtainUniforms = {
    uTime: { value: number };
    uSpeed: { value: number };
    uDensity: { value: number };
    uIntensity: { value: number };
    uKp: { value: number };
    uOffset: { value: number };
  };

  const curtains: { mesh: THREE.Mesh; uni: CurtainUniforms; driftX: number }[] = [];
  const CURTAIN_N = 7;
  for (let i = 0; i < CURTAIN_N; i++) {
    const w = 26 + Math.random() * 14;
    const hgt = 26 + Math.random() * 8;
    const geo = new THREE.PlaneGeometry(w, hgt, 80, 40);
    const uni: CurtainUniforms = {
      uTime: { value: 0 },
      uSpeed: { value: 0.3 },
      uDensity: { value: 0.5 },
      uIntensity: { value: 0.4 },
      uKp: { value: 0.4 },
      uOffset: { value: i / CURTAIN_N + Math.random() * 0.1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: CURTAIN_VERT,
      fragmentShader: CURTAIN_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Stagger the curtains across the field and into depth so the look is a
    // drifting wall, never a single centred glow.
    mesh.position.set(
      (i - (CURTAIN_N - 1) / 2) * 7 + (Math.random() - 0.5) * 4,
      hgt / 2 - 4,
      -8 - i * 5 - Math.random() * 4,
    );
    mesh.rotation.y = (Math.random() - 0.5) * 0.5;
    curtains.push({ mesh, uni, driftX: (Math.random() - 0.5) * 0.6 });
    scene.add(mesh);
  }

  // Smoothed drivers so live-data jumps glide in rather than snap.
  const sm: AuroraDrivers = { speed: 0.3, density: 0.5, intensity: 0.4, kp: 0.4 };
  let time = 0;

  const render = (dt: number, drivers: AuroraDrivers) => {
    const cdt = Math.min(0.05, Math.max(0, dt));
    time += cdt;
    const k = 1 - Math.exp(-cdt / 1.2); // ~1.2 s smoothing
    sm.speed += (drivers.speed - sm.speed) * k;
    sm.density += (drivers.density - sm.density) * k;
    sm.intensity += (drivers.intensity - sm.intensity) * k;
    sm.kp += (drivers.kp - sm.kp) * k;

    starUniforms.uTime.value = time;

    for (const c of curtains) {
      c.uni.uTime.value = time;
      c.uni.uSpeed.value = sm.speed;
      c.uni.uDensity.value = sm.density;
      c.uni.uIntensity.value = sm.intensity;
      c.uni.uKp.value = sm.kp;
      // Slow lateral drift across the sky, wrapping so it's endless.
      c.mesh.position.x += c.driftX * (0.2 + sm.speed * 0.8) * cdt;
      if (c.mesh.position.x > 32) c.mesh.position.x = -32;
      if (c.mesh.position.x < -32) c.mesh.position.x = 32;
    }

    // A gentle camera sway keeps the field weightless and oceanic.
    camera.position.x = Math.sin(time * 0.07) * 2.2;
    camera.position.y = 2 + Math.sin(time * 0.05) * 0.8;
    camera.lookAt(0, 7, -12);

    renderer.render(scene, camera);
  };

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    starGeo.dispose();
    starMat.dispose();
    for (const c of curtains) {
      c.mesh.geometry.dispose();
      (c.mesh.material as THREE.Material).dispose();
    }
    renderer.dispose();
  };

  return { render, resize, dispose };
}

/** Probe for WebGL so the page can show a notice instead of crashing. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}
