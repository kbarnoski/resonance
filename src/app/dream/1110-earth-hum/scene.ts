// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the warm ionospheric globe for 1110-earth-hum.
//
// Earth's night side rendered as a planet LIT FROM WITHIN: a deep indigo→amber
// sky, a warm amber/gold sphere, and an additive atmosphere shell that BREATHES.
// This is the "Overview Effect" made small — a whole, glowing world, warm not
// cold. Deliberately NON-black.
//
// Uniforms are driven from live geomagnetic data:
//   uKp    (0..1) → warmer/redder glow, more storm energy
//   uBreath(0..1) → the slow eased pulse of the ionospheric shell
// Around the globe float five glowing rings — the harmonic ladder SR1–SR5 — each
// ring's brightness tracking the amplitude of its drone voice. Seeded lightning
// flickers spark around the sphere at a rate tied to Kp (gentle, brief, never a
// full-screen flash; mean brightness ~constant).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

export interface HumDrivers {
  kp: number; // 0..1
  wind: number; // 0..1
  /** Per-voice levels 0..1 for the SR1–SR5 harmonic-ladder rings. */
  levels: number[];
  /** Damp flicker + pulse for prefers-reduced-motion. */
  reduced: boolean;
}

export interface HumScene {
  render(dt: number, drivers: HumDrivers): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

/** Small deterministic PRNG (mulberry32) — no Math.random in per-frame paths. */
function makePRNG(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main(){
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Deep indigo overhead melting to a warm amber horizon glow behind the planet.
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform float uKp;
  void main(){
    vec3 dir = normalize(vWorld);
    float h = dir.y * 0.5 + 0.5;                 // 0 bottom .. 1 top
    vec3 top    = vec3(0.06, 0.04, 0.13);        // deep indigo (never black)
    vec3 horizon= vec3(0.34, 0.16, 0.09);        // warm amber haze
    vec3 col = mix(horizon, top, smoothstep(0.15, 0.85, h));
    // A soft amber bloom low-behind the world; storms redden it.
    float glow = pow(clamp(1.0 - abs(dir.y) - 0.05, 0.0, 1.0), 2.0);
    vec3 stormTint = mix(vec3(0.42, 0.22, 0.10), vec3(0.5, 0.14, 0.07), uKp);
    col += glow * stormTint * (0.6 + 0.5 * uKp);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLOBE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// A warm world glowing from within: dark-amber core, gold fresnel rim, faint
// banded "aurora" latitudes that intensify with Kp.
const GLOBE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uKp;
  uniform float uBreath;
  uniform float uTime;
  void main(){
    float fres = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 2.4);
    vec3 core = mix(vec3(0.16, 0.08, 0.05), vec3(0.30, 0.15, 0.07), uBreath);
    vec3 rim  = mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.5, 0.24), uKp); // storms redden
    vec3 col = core + rim * fres;
    // Warm ionospheric bands drifting over the poles, stronger in storms.
    float band = sin(vNormal.y * 9.0 + uTime * 0.4);
    col += vec3(0.5, 0.28, 0.12) * smoothstep(0.6, 1.0, band) * (0.12 + 0.4 * uKp);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SHELL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// Additive atmosphere: a warm amber halo, brightest at the limb, breathing.
const SHELL_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uKp;
  uniform float uBreath;
  void main(){
    float fres = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 3.2);
    vec3 warm = mix(vec3(1.0, 0.66, 0.30), vec3(1.0, 0.42, 0.20), uKp);
    float pulse = 0.7 + 0.5 * uBreath;
    float a = fres * (0.55 + 0.35 * uKp) * pulse;
    gl_FragColor = vec4(warm * (0.8 + 0.6 * uBreath), a);
  }
`;

interface Flash {
  pos: THREE.Vector3;
  life: number;
}

export function buildScene(canvas: HTMLCanvasElement): HumScene {
  const rng = makePRNG(0x5c8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0713, 1); // deep indigo, never pure black

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 0.3, 6.2);
  camera.lookAt(0, 0, 0);

  // ── warm gradient sky (large inward-facing sphere) ──────────────────────────
  const skyUniforms = { uKp: { value: 0.4 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 32),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  scene.add(sky);

  // ── the glowing world ───────────────────────────────────────────────────────
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const globeUniforms = {
    uKp: { value: 0.4 },
    uBreath: { value: 0.5 },
    uTime: { value: 0 },
  };
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: globeUniforms,
      vertexShader: GLOBE_VERT,
      fragmentShader: GLOBE_FRAG,
    }),
  );
  worldGroup.add(globe);

  const shellUniforms = { uKp: { value: 0.4 }, uBreath: { value: 0.5 } };
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.72, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  worldGroup.add(shell);

  // ── harmonic-ladder rings SR1–SR5 ───────────────────────────────────────────
  const RING_N = 5;
  const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < RING_N; i++) {
    const r = 2.05 + i * 0.34;
    const geo = new THREE.TorusGeometry(r, 0.012 + 0.004 * (RING_N - i), 8, 160);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.09 - i * 0.008, 0.85, 0.6),
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.5;
    mesh.rotation.y = (rng() - 0.5) * 0.5;
    worldGroup.add(mesh);
    rings.push({ mesh, mat });
  }

  // ── lightning flicker layer (additive points around the globe) ──────────────
  const MAX_FLASH = 26;
  const flashPos = new Float32Array(MAX_FLASH * 3);
  const flashLife = new Float32Array(MAX_FLASH);
  const flashGeo = new THREE.BufferGeometry();
  flashGeo.setAttribute("position", new THREE.BufferAttribute(flashPos, 3));
  flashGeo.setAttribute("aLife", new THREE.BufferAttribute(flashLife, 1));
  const flashMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float aLife;
      varying float vLife;
      void main(){
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (10.0 + 46.0 * aLife) * (300.0 / -mv.z) / 100.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vLife;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r) * vLife;
        vec3 warm = vec3(1.0, 0.82, 0.5);
        gl_FragColor = vec4(warm, a * 0.7);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flashes = new THREE.Points(flashGeo, flashMat);
  worldGroup.add(flashes);
  const activeFlashes: Flash[] = [];

  // ── smoothed drivers & clocks ───────────────────────────────────────────────
  let kp = 0.4;
  let wind = 0.4;
  const ringLevel = new Array<number>(RING_N).fill(0.4);
  let time = 0;
  let breathPhase = 0;
  let sparkAccum = 0;

  const spawnFlash = () => {
    if (activeFlashes.length >= MAX_FLASH) return;
    // A point just above the globe surface, biased toward the lit limb.
    const u = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const rad = Math.sqrt(1 - u * u);
    const R = 1.44 + rng() * 0.12;
    activeFlashes.push({
      pos: new THREE.Vector3(rad * Math.cos(theta) * R, u * R, rad * Math.sin(theta) * R),
      life: 1,
    });
  };

  const render = (dt: number, drivers: HumDrivers) => {
    const cdt = Math.min(0.05, Math.max(0, dt));
    time += cdt;
    const k = 1 - Math.exp(-cdt / 1.4);
    kp += (drivers.kp - kp) * k;
    wind += (drivers.wind - wind) * k;
    for (let i = 0; i < RING_N; i++) {
      const target = drivers.levels[i] ?? 0.3;
      ringLevel[i] += (target - ringLevel[i]) * (1 - Math.exp(-cdt / 0.3));
    }

    // ── eased breath: the 7.83 Hz heartbeat, slowed to a calm ~0.15 Hz breath ──
    const breathRate = drivers.reduced ? 0.08 : 0.15 + 0.05 * wind;
    breathPhase += cdt * breathRate * 2 * Math.PI;
    const rawBreath = 0.5 + 0.5 * Math.sin(breathPhase);
    const breathAmt = drivers.reduced ? 0.4 : 1.0;
    const breath = 0.5 + (rawBreath - 0.5) * breathAmt;

    // ── push uniforms ───────────────────────────────────────────────────────
    skyUniforms.uKp.value = kp;
    globeUniforms.uKp.value = kp;
    globeUniforms.uBreath.value = breath;
    globeUniforms.uTime.value = time;
    shellUniforms.uKp.value = kp;
    shellUniforms.uBreath.value = breath;

    // Shell breathes in scale a touch too — a calm swell, not a strobe.
    const s = 1 + (breath - 0.5) * (drivers.reduced ? 0.015 : 0.04);
    shell.scale.setScalar(s);

    // Rings glow with their voice level and rotate slowly.
    for (let i = 0; i < RING_N; i++) {
      rings[i].mat.opacity = 0.18 + 0.62 * ringLevel[i];
      rings[i].mesh.rotation.z += cdt * (0.04 + 0.02 * i) * (0.6 + wind);
    }

    // Slow world turn so it reads as a living planet.
    worldGroup.rotation.y += cdt * 0.05;

    // ── seeded lightning: rate rises with Kp, damped when reduced-motion ──────
    const baseRate = drivers.reduced ? 0.6 : 2.0;
    const rate = baseRate + kp * (drivers.reduced ? 2.0 : 9.0); // flashes/sec
    sparkAccum += cdt * rate;
    while (sparkAccum >= 1) {
      sparkAccum -= 1;
      if (rng() < 0.85) spawnFlash();
    }
    // Decay + upload flash buffer.
    const decay = drivers.reduced ? 1.6 : 2.6;
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      activeFlashes[i].life -= cdt * decay;
      if (activeFlashes[i].life <= 0) activeFlashes.splice(i, 1);
    }
    for (let i = 0; i < MAX_FLASH; i++) {
      const f = activeFlashes[i];
      if (f) {
        flashPos[i * 3] = f.pos.x;
        flashPos[i * 3 + 1] = f.pos.y;
        flashPos[i * 3 + 2] = f.pos.z;
        // ease-out glow so it reads as a soft brief flicker, not a hard blink
        flashLife[i] = Math.max(0, f.life) * (2 - Math.max(0, f.life));
      } else {
        flashLife[i] = 0;
      }
    }
    flashGeo.attributes.position.needsUpdate = true;
    flashGeo.attributes.aLife.needsUpdate = true;

    // gentle camera drift for weightlessness
    camera.position.x = Math.sin(time * 0.06) * 0.35;
    camera.position.y = 0.3 + Math.sin(time * 0.045) * 0.18;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    sky.geometry.dispose();
    (sky.material as THREE.Material).dispose();
    globe.geometry.dispose();
    (globe.material as THREE.Material).dispose();
    shell.geometry.dispose();
    (shell.material as THREE.Material).dispose();
    for (const r of rings) {
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    flashGeo.dispose();
    flashMat.dispose();
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
