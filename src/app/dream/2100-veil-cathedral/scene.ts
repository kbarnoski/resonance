// 2100-veil-cathedral — three.js volumetric point-field.
//
// A ~42k-point cloud arranged as a great toroidal NAVE: nested cylindrical
// shells of light wrapped around a ring, with repeated vertical "ribs" (arches)
// and a soft outer aura. A slow deterministic camera travels AROUND the ring —
// i.e. THROUGH the tube — so you inhabit a breathing cathedral of light rather
// than orbit a particle blob. Endless travel with no teleport (the nave loops).
//
// A single ShaderMaterial gives soft additive point-sprites and does the
// breathing on the GPU: each point stores its ring-centerline anchor, and the
// vertex shader scales its offset from that anchor by a slow, bass-modulated
// swell. FFT bands drive brightness/size per point-group:
//   bass → the deep volume swell   mid → mid-shell shimmer   high → sparkle aura
//
// Inspired by Refik Anadol's DATALAND (The Grand LA, 2026) — volumetric
// data-architecture you move through.

import * as THREE from "three";
import { mulberry32, VEIL_SEED } from "./prng";
import type { Bands } from "./audio";

const RING_R = 62; // major radius of the nave ring
const TUBE_MAX = 27; // outer tube radius
const ARCH_STATIONS = 56; // repeated vertical ribs around the ring

// Band ids baked per point.
const BAND_DUST = 0; // volumetric fill → bass swell
const BAND_SHELL = 1; // nested walls / ribs → mid shimmer
const BAND_SPARKLE = 2; // outer aura → high sparkle

export interface VeilScene {
  render(dtSec: number, bands: Bands, reduced: boolean): void;
  resize(w: number, h: number): void;
  pointCount: number;
  dispose(): void;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uPixelRatio;
  uniform float uSizeScale;

  attribute vec3 aCenter;   // anchor on the ring centerline
  attribute float aRand;    // per-point 0..1
  attribute float aBand;    // 0 dust, 1 shell, 2 sparkle
  attribute float aShell;   // normalized radius 0..1 (breathe phase)

  varying float vGlow;
  varying float vBand;
  varying float vWarm;

  void main() {
    vBand = aBand;

    // Breathe: scale offset-from-anchor by a slow, bass-fed swell (< ~0.15 Hz).
    vec3 offset = position - aCenter;
    float phase = uTime * 0.5 + aShell * 6.2831 + aRand * 6.2831;
    float swell = 1.0 + (0.05 + 0.20 * uBass) * sin(phase);
    vec3 p = aCenter + offset * swell;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(0.001, -mv.z);

    // Slow twinkle, band-dependent (all well under the flicker danger band).
    float twk = 0.5 + 0.5 * sin(uTime * (0.8 + aRand * 1.6) + aRand * 12.566);

    float sizeBase;
    float glow;
    float warm;
    if (aBand < 0.5) {
      // Dust: the deep volume. Swells with bass.
      sizeBase = 2.1;
      glow = 0.30 + 0.55 * uBass;
      warm = 0.15 * uBass;
    } else if (aBand < 1.5) {
      // Shells / ribs: mid-shimmer.
      sizeBase = 1.7;
      glow = 0.26 + 0.75 * uMid * (0.55 + 0.45 * twk);
      warm = 0.30 * uMid;
    } else {
      // Sparkle aura: high-fed, sharpest twinkle.
      sizeBase = 1.25;
      glow = 0.12 + 1.0 * uHigh * twk;
      warm = 0.55 * uHigh + 0.2;
    }

    vGlow = clamp(glow, 0.0, 1.3);
    vWarm = clamp(warm, 0.0, 1.0);

    gl_PointSize = sizeBase * uSizeScale * uPixelRatio * (110.0 / dist)
                   * (0.75 + 0.5 * vGlow);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uIndigo;
  uniform vec3 uViolet;
  uniform vec3 uWarm;
  uniform float uBright; // slew-limited global brightness (anti-strobe)

  varying float vGlow;
  varying float vBand;
  varying float vWarm;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(uv, uv);
    if (d2 > 1.0) discard;
    float soft = exp(-d2 * 3.2); // soft luminous falloff

    // Indigo void → violet shells → warm-white blooms where energy is high.
    vec3 col = mix(uIndigo, uViolet, clamp(vBand, 0.0, 1.0));
    col = mix(col, uWarm, vWarm);

    float a = soft * vGlow * uBright;
    gl_FragColor = vec4(col * a, a);
  }
`;

export function createVeilScene(
  canvas: HTMLCanvasElement,
  reducedInit: boolean,
): VeilScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const pixelRatio = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x05030c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05030c, 0.0075);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);

  // ── Build the point field deterministically ────────────────────────────────
  const rand = mulberry32(VEIL_SEED ^ 0x9e37);
  const COUNT = reducedInit ? 20000 : 44000;

  const positions = new Float32Array(COUNT * 3);
  const centers = new Float32Array(COUNT * 3);
  const rands = new Float32Array(COUNT);
  const bandAttr = new Float32Array(COUNT);
  const shellAttr = new Float32Array(COUNT);

  const shellRadii = [9, 13, 17, 20.5, 24]; // nested walls

  for (let i = 0; i < COUNT; i++) {
    const roll = rand();
    let band: number;
    let r: number;
    let theta: number;
    let phi: number;
    let yJit = 0;

    if (roll < 0.42) {
      // Dust: fill the tube volume.
      band = BAND_DUST;
      r = Math.sqrt(rand()) * (TUBE_MAX - 1);
      theta = rand() * Math.PI * 2;
      phi = rand() * Math.PI * 2;
    } else if (roll < 0.85) {
      // Shells + ribs.
      band = BAND_SHELL;
      r = shellRadii[Math.floor(rand() * shellRadii.length)] + (rand() - 0.5) * 1.4;
      phi = rand() * Math.PI * 2;
      if (rand() < 0.5) {
        // Snap to an arch station → repeated vertical ribs (the vaulting).
        const station = Math.floor(rand() * ARCH_STATIONS);
        theta = (station / ARCH_STATIONS) * Math.PI * 2 + (rand() - 0.5) * 0.012;
      } else {
        theta = rand() * Math.PI * 2;
      }
    } else {
      // Sparkle aura on the outside.
      band = BAND_SPARKLE;
      r = TUBE_MAX + rand() * 9;
      theta = rand() * Math.PI * 2;
      phi = rand() * Math.PI * 2;
      yJit = (rand() - 0.5) * 3;
    }

    // Torus placement: anchor is the ring centerline; point offsets outward.
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cx = RING_R * ct;
    const cz = RING_R * st;
    const radial = r * Math.cos(phi);
    const px = (RING_R + radial) * ct;
    const pz = (RING_R + radial) * st;
    const py = r * Math.sin(phi) + yJit;

    const o = i * 3;
    positions[o] = px;
    positions[o + 1] = py;
    positions[o + 2] = pz;
    centers[o] = cx;
    centers[o + 1] = 0;
    centers[o + 2] = cz;
    rands[i] = rand();
    bandAttr[i] = band;
    shellAttr[i] = r / (TUBE_MAX + 9);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(centers, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  geo.setAttribute("aBand", new THREE.BufferAttribute(bandAttr, 1));
  geo.setAttribute("aShell", new THREE.BufferAttribute(shellAttr, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), RING_R + TUBE_MAX + 12);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBright: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: reducedInit ? 0.85 : 1.0 },
      uIndigo: { value: new THREE.Color(0x241147) }, // deep indigo void
      uViolet: { value: new THREE.Color(0x8b5cf6) }, // brand violet
      uWarm: { value: new THREE.Color(0xffe3b8) }, // warm light bloom
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, material);
  scene.add(points);

  // ── Loop state ─────────────────────────────────────────────────────────────
  let elapsed = 0;
  let camAngle = 0;
  let brightSlew = 0; // slew-limited global brightness (anti-strobe)
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function render(dtSec: number, bands: Bands, reduced: boolean): void {
    const dt = Math.min(0.05, dtSec); // clamp big frame gaps
    const speedScale = reduced ? 0.4 : 1;
    elapsed += dt;

    // Camera drifts around the ring (through the tube). Loops seamlessly.
    camAngle += dt * 0.045 * speedScale;
    const ct = Math.cos(camAngle);
    const st = Math.sin(camAngle);
    // Gentle radius sway + vertical bob so it reads as living architecture.
    const sway = Math.sin(elapsed * 0.07) * 6.0 * speedScale;
    const bob = Math.sin(elapsed * 0.11) * 3.2 * speedScale;
    const camR = RING_R + sway;
    camPos.set(camR * ct, bob, camR * st);
    camera.position.copy(camPos);

    // Look tangentially forward along the ring (into the nave ahead).
    const ahead = camAngle + 0.28;
    lookAt.set(RING_R * Math.cos(ahead), bob * 0.6, RING_R * Math.sin(ahead));
    camera.up.set(Math.sin(elapsed * 0.03) * 0.12, 1, 0); // slow roll drift
    camera.lookAt(lookAt);

    // Slow multi-minute evolution: the whole nave rotates a touch and the warm
    // bloom hue drifts within the violet↔warm family, so it feels different later.
    points.rotation.y = elapsed * 0.006 * speedScale;
    const warmHue = 0.09 + 0.02 * Math.sin(elapsed * 0.012);
    (material.uniforms.uWarm.value as THREE.Color).setHSL(warmHue, 0.65, 0.72);

    // Anti-strobe: target brightness responds to audio but the actual value can
    // only change slowly, so a bass transient can NEVER flash the whole field.
    const target = 0.55 + 0.45 * Math.min(1, bands.level * 1.6);
    const maxDelta = dt * 0.9; // ≤ 0.9 /s → sub-1 Hz global luminance change
    const diff = THREE.MathUtils.clamp(target - brightSlew, -maxDelta, maxDelta);
    brightSlew += diff;

    const u = material.uniforms;
    u.uTime.value = elapsed;
    u.uBass.value = bands.bass;
    u.uMid.value = bands.mid;
    u.uHigh.value = bands.high;
    u.uBright.value = brightSlew;

    renderer.render(scene, camera);
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    geo.dispose();
    material.dispose();
    renderer.dispose();
  }

  return { render, resize, pointCount: COUNT, dispose };
}
