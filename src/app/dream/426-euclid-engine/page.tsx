"use client";

/**
 * 426 — Euclid Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * "What if you could build a hypnotic, evolving polyrhythm by stacking
 *  interlocking Euclidean rhythms — pure percussion, ZERO tuning — and watch
 *  the rings slowly PHASE against each other the way Steve Reich's players
 *  drift apart?"
 *
 * Algorithm: Bjorklund (Euclidean rhythm) — E(K, N) spreads K onsets as evenly
 * as possible across N steps. E.g. E(3,8) = the Afro-Cuban tresillo.
 *
 * Scheduler: Chris Wilson's look-ahead pattern ("A Tale of Two Clocks") —
 * setInterval ~25ms, scheduling 100ms ahead so audio fires precisely even when
 * the JS thread is busy with rendering.
 *
 * Phasing: each ring runs at BASE_BPM + driftBpm, so voices gradually slip
 * against each other — Steve Reich's Piano Phase / Clapping Music in drum form.
 *
 * References: Godfried Toussaint (2005), Steve Reich, Chris Wilson (2013).
 * Output: three.js concentric rings of step cells, rotating playhead, particles.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_BPM = 112;
const LOOK_AHEAD_S = 0.1;        // schedule this far ahead (Chris Wilson)
const SCHEDULE_INTERVAL_MS = 25;  // scheduler tick rate ms
const RING_RADII = [1.1, 1.85, 2.55, 3.2]; // world-unit radii
const CELL_SIZE  = 0.12;
const PARTICLE_COUNT = 18;

// Default ring configs: [id, k, n, voice, driftBpm, color, active]
const DEFAULT_RINGS: RingConfig[] = [
  { id: 0, k: 3, n: 8,  voice: "kick",   driftBpm: 0,      color: 0xc084fc, active: true },
  { id: 1, k: 7, n: 16, voice: "hat",    driftBpm: 0.12,   color: 0x38bdf8, active: true },
  { id: 2, k: 5, n: 8,  voice: "clave",  driftBpm: -0.07,  color: 0xfbbf24, active: true },
  { id: 3, k: 9, n: 16, voice: "shaker", driftBpm: 0.22,   color: 0x4ade80, active: true },
];

type VoiceType = "kick" | "snare" | "hat" | "clave" | "tom" | "shaker";

interface RingConfig {
  id: number;
  k: number;
  n: number;
  voice: VoiceType;
  driftBpm: number;
  color: number;
  active: boolean;
}

// ─── Euclidean Rhythm — Bjorklund Algorithm ───────────────────────────────────
//
// E(k, n) distributes k onsets as evenly as possible over n steps.
// Uses Bresenham / modular placement — equivalent to Bjorklund, produces
// the same rhythms described in Toussaint (2005).
// E(3,8) → tresillo; E(5,8) → cinquillo; E(7,16) → jazz subdivision.

function bjorklund(k: number, n: number): boolean[] {
  if (k <= 0) return (new Array(n) as boolean[]).fill(false);
  if (k >= n) return (new Array(n) as boolean[]).fill(true);

  // Bresenham-style: onset[i] = floor((i+1)*k/n) !== floor(i*k/n)
  // This is mathematically equivalent to Bjorklund's recursive algorithm
  // and provably produces the maximally-even distribution.
  const result: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = Math.floor(((i + 1) * k) / n) !== Math.floor((i * k) / n);
  }
  return result;
}

// ─── Percussion Synthesiser ───────────────────────────────────────────────────

function triggerKick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  osc.connect(gain); gain.connect(dest);
  osc.start(time); osc.stop(time + 0.36);

  // Attack click
  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = "square"; click.frequency.setValueAtTime(300, time);
  cg.gain.setValueAtTime(0.3, time);
  cg.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
  click.connect(cg); cg.connect(dest);
  click.start(time); click.stop(time + 0.016);
}

function triggerSnare(ctx: AudioContext, dest: AudioNode, time: number): void {
  const len = Math.ceil(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 3000; bpf.Q.value = 0.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  src.connect(bpf); bpf.connect(gain); gain.connect(dest);
  src.start(time); src.stop(time + 0.13);
}

function triggerHat(ctx: AudioContext, dest: AudioNode, time: number): void {
  const len = Math.ceil(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 8000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(hpf); hpf.connect(gain); gain.connect(dest);
  src.start(time); src.stop(time + 0.07);
}

function triggerClave(ctx: AudioContext, dest: AudioNode, time: number): void {
  const len = Math.ceil(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    d[i] = Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-t * 80);
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 2500; bpf.Q.value = 8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  src.connect(bpf); bpf.connect(gain); gain.connect(dest);
  src.start(time); src.stop(time + 0.05);
}

function triggerTom(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(70, time + 0.12);
  gain.gain.setValueAtTime(0.65, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  osc.connect(gain); gain.connect(dest);
  osc.start(time); osc.stop(time + 0.2);
}

function triggerShaker(ctx: AudioContext, dest: AudioNode, time: number): void {
  const len = Math.ceil(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 6000;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 12000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
  src.connect(hpf); hpf.connect(lpf); lpf.connect(gain); gain.connect(dest);
  src.start(time); src.stop(time + 0.035);
}

function triggerVoice(voice: VoiceType, ctx: AudioContext, dest: AudioNode, time: number): void {
  switch (voice) {
    case "kick":   triggerKick(ctx, dest, time);   break;
    case "snare":  triggerSnare(ctx, dest, time);  break;
    case "hat":    triggerHat(ctx, dest, time);    break;
    case "clave":  triggerClave(ctx, dest, time);  break;
    case "tom":    triggerTom(ctx, dest, time);    break;
    case "shaker": triggerShaker(ctx, dest, time); break;
  }
}

// ─── Scheduler state (per ring) ───────────────────────────────────────────────

interface RingScheduler {
  step: number;
  nextTime: number; // AudioContext.currentTime of the next step
}

// ─── Three.js scene types ─────────────────────────────────────────────────────

interface ParticleSystem {
  mesh: THREE.Points;
  mat: THREE.PointsMaterial;
  posAttr: THREE.BufferAttribute;
  velocities: Float32Array;
  life: number;
  active: boolean;
}

interface RingMesh {
  stepMeshes: THREE.Mesh[];
  stepMats: THREE.MeshBasicMaterial[];
  playheadMesh: THREE.Mesh;
  playheadMat: THREE.MeshBasicMaterial;
  particles: ParticleSystem[];
}

interface ThreeScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  ringMeshes: RingMesh[];
  dispose: () => void;
}

// ─── Visual state (mutated each frame, no React re-render) ───────────────────

interface VisualState {
  playheadPos: number[];  // 0..1 per ring
  flash: number[];        // 0..1 decaying energy per ring
  hitStep: number[];      // step index just triggered (-1 = none)
  patterns: boolean[][];  // current Euclidean pattern per ring
}

// ─── Three.js scene builder ───────────────────────────────────────────────────

function buildThreeScene(host: HTMLElement, rings: RingConfig[]): ThreeScene {
  const w = host.clientWidth || 600;
  const h = host.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const aspect = w / h;
  const viewH  = 4.2;
  const camera = new THREE.OrthographicCamera(
    -viewH * aspect, viewH * aspect, viewH, -viewH, 0.1, 100
  );
  camera.position.z = 10;

  // Subtle center dot
  const dotGeo = new THREE.CircleGeometry(0.06, 32);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
  scene.add(new THREE.Mesh(dotGeo, dotMat));

  const ringMeshes: RingMesh[] = [];

  rings.forEach((cfg, ri) => {
    const radius = RING_RADII[ri] ?? (RING_RADII[RING_RADII.length - 1] + (ri - RING_RADII.length + 1) * 0.7);
    const pattern = bjorklund(cfg.k, cfg.n);
    const stepMeshes: THREE.Mesh[] = [];
    const stepMats: THREE.MeshBasicMaterial[] = [];

    // Thin ring outline
    const outlineGeo = new THREE.RingGeometry(radius - 0.025, radius + 0.025, 80);
    const outlineMat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.1 });
    scene.add(new THREE.Mesh(outlineGeo, outlineMat));

    for (let si = 0; si < cfg.n; si++) {
      const angle = (si / cfg.n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const isOn = pattern[si];
      const geo = new THREE.CircleGeometry(CELL_SIZE * (isOn ? 1.0 : 0.5), 20);
      const mat = new THREE.MeshBasicMaterial({
        color: isOn ? cfg.color : 0x334155,
        transparent: true,
        opacity: isOn ? 0.85 : 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      stepMeshes.push(mesh);
      stepMats.push(mat);
    }

    // Playhead dot
    const phGeo = new THREE.CircleGeometry(CELL_SIZE * 0.8, 16);
    const phMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const phMesh = new THREE.Mesh(phGeo, phMat);
    phMesh.position.set(0, radius, 0.1);
    scene.add(phMesh);

    // Particle pool
    const particles: ParticleSystem[] = [];
    for (let pi = 0; pi < 5; pi++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const posAttr = new THREE.BufferAttribute(positions, 3);
      geo.setAttribute("position", posAttr);
      const mat = new THREE.PointsMaterial({
        color: cfg.color, size: 0.07, transparent: true, opacity: 0, sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      particles.push({ mesh: pts, mat, posAttr, velocities: new Float32Array(PARTICLE_COUNT * 3), life: 0, active: false });
    }

    ringMeshes.push({ stepMeshes, stepMats, playheadMesh: phMesh, playheadMat: phMat, particles });
  });

  function onResize(): void {
    const nw = host.clientWidth || 600;
    const nh = host.clientHeight || 600;
    renderer.setSize(nw, nh);
    const asp = nw / nh;
    camera.left   = -viewH * asp;
    camera.right  =  viewH * asp;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  function dispose(): void {
    window.removeEventListener("resize", onResize);
    scene.traverse((obj) => {
      const asMesh = obj as THREE.Mesh;
      const asPts  = obj as THREE.Points;
      if (asMesh.isMesh || asPts.isPoints) {
        (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          (mat as THREE.Material[]).forEach((m) => m.dispose());
        } else {
          (mat as THREE.Material | undefined)?.dispose();
        }
      }
    });
    renderer.dispose();
    renderer.domElement.parentNode?.removeChild(renderer.domElement);
  }

  return { renderer, scene, camera, ringMeshes, dispose };
}

// ─── Particle helpers ─────────────────────────────────────────────────────────

function spawnParticles(ps: ParticleSystem, cx: number, cy: number): void {
  ps.active = true;
  ps.life   = 1.0;
  const pos = ps.posAttr.array as Float32Array;
  const vel = ps.velocities;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pos[i * 3]     = cx;
    pos[i * 3 + 1] = cy;
    pos[i * 3 + 2] = 0;
    const a = Math.random() * Math.PI * 2;
    const s = 0.4 + Math.random() * 1.1;
    vel[i * 3]     = Math.cos(a) * s;
    vel[i * 3 + 1] = Math.sin(a) * s;
    vel[i * 3 + 2] = 0;
  }
  ps.posAttr.needsUpdate = true;
  ps.mat.opacity = 0.9;
}

function tickParticles(ps: ParticleSystem, dt: number): void {
  if (!ps.active) return;
  ps.life -= dt * 2.8;
  if (ps.life <= 0) { ps.active = false; ps.mat.opacity = 0; return; }
  const pos = ps.posAttr.array as Float32Array;
  const vel = ps.velocities;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pos[i * 3]     += vel[i * 3]     * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
  }
  ps.posAttr.needsUpdate = true;
  ps.mat.opacity = Math.max(0, ps.life * 0.88);
}

// ─── Per-frame scene update ───────────────────────────────────────────────────

function renderFrame(
  ts: ThreeScene,
  vis: VisualState,
  rings: RingConfig[],
  dt: number
): void {
  rings.forEach((cfg, ri) => {
    const rm = ts.ringMeshes[ri];
    if (!rm) return;
    const radius  = RING_RADII[ri] ?? (RING_RADII[RING_RADII.length - 1] + (ri - RING_RADII.length + 1) * 0.7);
    const pattern = vis.patterns[ri];
    const flash   = vis.flash[ri];
    const hitStep = vis.hitStep[ri];

    // Step cells
    for (let si = 0; si < cfg.n; si++) {
      const mat  = rm.stepMats[si];
      const mesh = rm.stepMeshes[si];
      if (!mat || !mesh) continue;
      const isOn  = pattern ? pattern[si] : false;
      const isHit = si === hitStep && flash > 0.5;
      if (isHit) {
        mat.color.setHex(0xffffff); mat.opacity = 1.0;
        mesh.scale.setScalar(1.6);
      } else {
        mat.color.setHex(isOn ? cfg.color : 0x334155);
        mat.opacity = (isOn ? 0.85 : 0.28) * (cfg.active ? 1 : 0.3);
        mesh.scale.setScalar(1.0);
      }
    }

    // Decay flash
    if (vis.flash[ri] > 0) vis.flash[ri] = Math.max(0, vis.flash[ri] - dt * 9);

    // Playhead
    const phAngle = (vis.playheadPos[ri] % 1) * Math.PI * 2 - Math.PI / 2;
    rm.playheadMesh.position.set(Math.cos(phAngle) * radius, Math.sin(phAngle) * radius, 0.1);
    rm.playheadMat.opacity = cfg.active ? 0.9 : 0.15;

    // Particles
    rm.particles.forEach((ps) => tickParticles(ps, dt));

    // Spawn burst on hit
    if (hitStep >= 0 && flash > 0.8 && cfg.active) {
      const ha = (hitStep / cfg.n) * Math.PI * 2 - Math.PI / 2;
      const idle = rm.particles.find((p) => !p.active);
      if (idle) spawnParticles(idle, Math.cos(ha) * radius, Math.sin(ha) * radius);
    }

    vis.hitStep[ri] = -1;
  });

  ts.renderer.render(ts.scene, ts.camera);
}

// ─── Step-cell rebuilder (called when k/n changes) ────────────────────────────

function rebuildCells(ts: ThreeScene, rings: RingConfig[]): void {
  rings.forEach((cfg, ri) => {
    const rm = ts.ringMeshes[ri];
    if (!rm) return;
    const radius  = RING_RADII[ri] ?? (RING_RADII[RING_RADII.length - 1] + (ri - RING_RADII.length + 1) * 0.7);
    const pattern = bjorklund(cfg.k, cfg.n);

    // Dispose old cells
    rm.stepMeshes.forEach((m) => {
      ts.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    rm.stepMeshes.length = 0;
    rm.stepMats.length   = 0;

    for (let si = 0; si < cfg.n; si++) {
      const angle = (si / cfg.n) * Math.PI * 2 - Math.PI / 2;
      const x     = Math.cos(angle) * radius;
      const y     = Math.sin(angle) * radius;
      const isOn  = pattern[si];
      const geo   = new THREE.CircleGeometry(CELL_SIZE * (isOn ? 1.0 : 0.5), 20);
      const mat   = new THREE.MeshBasicMaterial({
        color: isOn ? cfg.color : 0x334155, transparent: true,
        opacity: isOn ? 0.85 : 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      ts.scene.add(mesh);
      rm.stepMeshes.push(mesh);
      rm.stepMats.push(mat);
    }
  });
}

// ─── WebGL availability check ─────────────────────────────────────────────────

function checkWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

// ─── Voice label map ──────────────────────────────────────────────────────────

const VOICE_LABELS: Record<VoiceType, string> = {
  kick: "Kick", snare: "Snare", hat: "Hat",
  clave: "Clave", tom: "Tom", shaker: "Shaker",
};
const RING_LABELS = ["I", "II", "III", "IV"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EuclidEnginePage() {
  const hostRef     = useRef<HTMLDivElement | null>(null);
  const threeRef    = useRef<ThreeScene | null>(null);
  const audioRef    = useRef<AudioContext | null>(null);
  const destRef     = useRef<AudioNode | null>(null);
  const schedRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef      = useRef<number | null>(null);
  const schStateRef = useRef<RingScheduler[]>([]);
  const ringsRef    = useRef<RingConfig[]>(DEFAULT_RINGS.map((r) => ({ ...r })));
  const startedRef  = useRef(false);
  const lastWallRef = useRef<number>(0);

  const visRef = useRef<VisualState>({
    playheadPos: [0, 0, 0, 0],
    flash:       [0, 0, 0, 0],
    hitStep:     [-1, -1, -1, -1],
    patterns:    DEFAULT_RINGS.map((r) => bjorklund(r.k, r.n)),
  });

  const [started, setStarted]       = useState(false);
  const [webgl, setWebgl]           = useState(true);
  const [rings, setRings]           = useState<RingConfig[]>(
    DEFAULT_RINGS.map((r) => ({ ...r }))
  );
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Keep ringsRef + patterns in sync with state
  useEffect(() => {
    ringsRef.current = rings;
    visRef.current.patterns = rings.map((r) => bjorklund(r.k, r.n));
    if (threeRef.current) rebuildCells(threeRef.current, rings);
  }, [rings]);

  // ─ Scheduler ────────────────────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx  = audioRef.current;
    const dest = destRef.current;
    if (!ctx || !dest) return;

    const curRings  = ringsRef.current;
    const schStates = schStateRef.current;
    const vis       = visRef.current;

    curRings.forEach((cfg, ri) => {
      if (!schStates[ri]) {
        schStates[ri] = { step: 0, nextTime: ctx.currentTime + 0.04 };
      }
      const sch = schStates[ri];
      const effectiveBpm = BASE_BPM + cfg.driftBpm;
      // stepDur: one step = one 16th note at effective BPM, scaled by N
      const stepDur   = 60 / (effectiveBpm * (cfg.n / 4));
      const schedUntil = ctx.currentTime + LOOK_AHEAD_S;

      while (sch.nextTime < schedUntil) {
        const pattern = bjorklund(cfg.k, cfg.n);
        if (cfg.active && pattern[sch.step]) {
          triggerVoice(cfg.voice, ctx, dest, sch.nextTime);
          // Schedule the visual flash via setTimeout to align with audio
          const hitStepCopy = sch.step;
          const delayMs = Math.max(0, (sch.nextTime - ctx.currentTime) * 1000);
          setTimeout(() => {
            vis.hitStep[ri] = hitStepCopy;
            vis.flash[ri]   = 1.0;
          }, delayMs);
        }

        // Smooth playhead interpolation between steps
        const stepCopy  = sch.step;
        const nSteps    = cfg.n;
        const startPos  = stepCopy / nSteps;
        const endPos    = (stepCopy + 1) / nSteps;
        const durMs     = stepDur * 1000;
        const startDelayMs = Math.max(0, (sch.nextTime - ctx.currentTime) * 1000);
        setTimeout(() => {
          const t0 = performance.now();
          const interpTick = () => {
            const frac = Math.min(1, (performance.now() - t0) / durMs);
            vis.playheadPos[ri] = startPos + (endPos - startPos) * frac;
          };
          // Four interpolation ticks spread across the step duration
          [16, 48, 80, durMs - 8].forEach((delay) => setTimeout(interpTick, delay));
        }, startDelayMs);

        sch.step = (sch.step + 1) % cfg.n;
        sch.nextTime += stepDur;
      }
    });
  }, []);

  // ─ Animation loop ────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      const ts = threeRef.current;
      if (ts) {
        const now = performance.now();
        const dt  = lastWallRef.current
          ? Math.min((now - lastWallRef.current) / 1000, 0.05)
          : 0.016;
        lastWallRef.current = now;
        renderFrame(ts, visRef.current, ringsRef.current, dt);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ─ Start ─────────────────────────────────────────────────────────────────────
  const onStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setAudioBlocked(true);
      return;
    }
    audioRef.current = ctx;

    // Master compressor / brick-wall limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value       = 3;
    comp.ratio.value      = 20;
    comp.attack.value     = 0.001;
    comp.release.value    = 0.1;
    comp.connect(ctx.destination);
    destRef.current = comp;

    // Three.js
    if (hostRef.current && webgl) {
      threeRef.current = buildThreeScene(hostRef.current, ringsRef.current);
    }

    // Scheduler + rAF
    schStateRef.current = [];
    schedRef.current    = setInterval(runScheduler, SCHEDULE_INTERVAL_MS);
    startLoop();
  }, [webgl, runScheduler, startLoop]);

  // ─ WebGL check (once on mount) ───────────────────────────────────────────────
  useEffect(() => { setWebgl(checkWebGL()); }, []);

  // ─ Auto-start (desktop friendly; mobile needs gesture) ──────────────────────
  useEffect(() => {
    const tid = setTimeout(() => {
      if (!startedRef.current) void onStart();
    }, 1500);
    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─ Teardown ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null)   cancelAnimationFrame(rafRef.current);
      if (schedRef.current !== null) clearInterval(schedRef.current);
      threeRef.current?.dispose();
      threeRef.current = null;
      audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    };
  }, []);

  // ─ Ring control handlers ─────────────────────────────────────────────────────

  const toggleRing = useCallback((id: number) => {
    if (!startedRef.current) void onStart();
    setRings((prev) => prev.map((r) => r.id === id ? { ...r, active: !r.active } : r));
  }, [onStart]);

  const changeK = useCallback((id: number, delta: number) => {
    if (!startedRef.current) void onStart();
    setRings((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return { ...r, k: Math.max(1, Math.min(r.n - 1, r.k + delta)) };
    }));
  }, [onStart]);

  const changeN = useCallback((id: number, delta: number) => {
    if (!startedRef.current) void onStart();
    setRings((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const newN = Math.max(4, Math.min(24, r.n + delta));
      return { ...r, n: newN, k: Math.min(r.k, newN - 1) };
    }));
  }, [onStart]);

  const nudgeDrift = useCallback((id: number, delta: number) => {
    if (!startedRef.current) void onStart();
    setRings((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return { ...r, driftBpm: parseFloat((r.driftBpm + delta).toFixed(3)) };
    }));
  }, [onStart]);

  // ─ Fallback text readout (no WebGL) ─────────────────────────────────────────
  function renderTextRing(r: RingConfig, idx: number) {
    const pattern = bjorklund(r.k, r.n);
    const hexCol  = `#${r.color.toString(16).padStart(6, "0")}`;
    return (
      <div key={r.id} className="font-mono text-sm text-white/75">
        <span className="text-white/55">{RING_LABELS[idx]} {r.voice} E({r.k},{r.n})  </span>
        {pattern.map((on, si) => (
          <span key={si} style={on ? { color: hexCol } : undefined}>
            {on ? "●" : "·"}
          </span>
        ))}
      </div>
    );
  }

  // ─ Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#030712] text-white flex flex-col">

      {/* Header */}
      <header className="px-5 pt-6 pb-3 max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-white/95 font-mono">
          Euclid Engine
        </h1>
        <p className="mt-1 text-base text-white/75">
          Stack interlocking Euclidean percussion rings and watch them slowly
          phase against each other — Reich-style polyrhythm, ZERO pitch.
        </p>
      </header>

      {/* Start button / notices */}
      {!started && (
        <div className="px-5 pb-3 flex flex-col gap-2">
          <button
            onClick={onStart}
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-lg bg-violet-500/20 border border-violet-400/40 text-violet-300 text-base font-semibold hover:bg-violet-500/35 transition-colors self-start"
          >
            ▶ Start Engine
          </button>
          <p className="text-sm text-white/55">
            Auto-starts in ~1.5 s on desktop · tap button on mobile to unlock audio
          </p>
        </div>
      )}

      {audioBlocked && (
        <p className="px-5 pb-2 text-amber-300/95 text-base">
          AudioContext blocked — tap &quot;Start Engine&quot; above to activate.
        </p>
      )}

      {!webgl && started && (
        <div className="px-5 pb-3">
          <p className="text-amber-300/95 text-base mb-2">
            WebGL unavailable — text ring display. Audio still runs.
          </p>
          <div className="space-y-1">{rings.map((r, i) => renderTextRing(r, i))}</div>
        </div>
      )}

      {/* Three.js canvas host */}
      {webgl && (
        <div
          ref={hostRef}
          className="flex-1 min-h-[320px] w-full cursor-pointer"
          style={{ background: "radial-gradient(ellipse at 50% 50%, #10052a 0%, #030712 75%)" }}
          onClick={() => { if (!startedRef.current) void onStart(); }}
          role="img"
          aria-label="Euclidean rhythm ring visualisation"
        />
      )}

      {/* Ring controls */}
      <section
        className="px-4 pt-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl"
        aria-label="Ring controls"
      >
        {rings.map((r, ri) => {
          const hexCol = `#${r.color.toString(16).padStart(6, "0")}`;
          return (
            <div
              key={r.id}
              className={`rounded-xl border p-3 flex flex-col gap-2 transition-all duration-200 ${
                r.active
                  ? "border-white/20 bg-white/[0.04]"
                  : "border-white/[0.08] bg-white/[0.015] opacity-55"
              }`}
            >
              {/* Title row */}
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: hexCol }} />
                <span className="text-white/80 text-sm font-mono font-semibold">
                  {RING_LABELS[ri]} · {VOICE_LABELS[r.voice]}
                </span>
                <span className="ml-auto text-white/50 text-xs font-mono">
                  E({r.k},{r.n})
                </span>
                <button
                  onClick={() => toggleRing(r.id)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-sm font-semibold transition-colors ml-1 ${
                    r.active
                      ? "bg-violet-500/30 text-violet-200 hover:bg-violet-500/45"
                      : "bg-white/8 text-white/45 hover:bg-white/14"
                  }`}
                  aria-pressed={r.active}
                  aria-label={`${r.active ? "Mute" : "Unmute"} ring ${RING_LABELS[ri]}`}
                >
                  {r.active ? "ON" : "OFF"}
                </button>
              </div>

              {/* K (onsets) */}
              <div className="flex items-center gap-2">
                <span className="text-white/55 text-xs font-mono w-10 flex-shrink-0">K =</span>
                <button
                  onClick={() => changeK(r.id, -1)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Decrease onsets for ring ${RING_LABELS[ri]}`}
                >−</button>
                <span className="text-white/90 font-mono text-base w-6 text-center">{r.k}</span>
                <button
                  onClick={() => changeK(r.id, 1)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Increase onsets for ring ${RING_LABELS[ri]}`}
                >+</button>
                <span className="text-white/40 text-xs ml-1">onsets</span>
              </div>

              {/* N (steps) */}
              <div className="flex items-center gap-2">
                <span className="text-white/55 text-xs font-mono w-10 flex-shrink-0">N =</span>
                <button
                  onClick={() => changeN(r.id, -2)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Decrease steps for ring ${RING_LABELS[ri]}`}
                >−</button>
                <span className="text-white/90 font-mono text-base w-6 text-center">{r.n}</span>
                <button
                  onClick={() => changeN(r.id, 2)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Increase steps for ring ${RING_LABELS[ri]}`}
                >+</button>
                <span className="text-white/40 text-xs ml-1">steps</span>
              </div>

              {/* Phase drift */}
              <div className="flex items-center gap-2">
                <span className="text-white/55 text-xs font-mono w-10 flex-shrink-0">drift</span>
                <button
                  onClick={() => nudgeDrift(r.id, -0.05)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Slow phase drift for ring ${RING_LABELS[ri]}`}
                >−</button>
                <span className="text-violet-300/90 font-mono text-xs w-14 text-center">
                  {r.driftBpm > 0 ? "+" : ""}{r.driftBpm.toFixed(2)} BPM
                </span>
                <button
                  onClick={() => nudgeDrift(r.id, 0.05)}
                  className="min-h-[44px] w-11 rounded-lg bg-white/8 text-white/80 text-xl font-bold hover:bg-white/15 transition-colors"
                  aria-label={`Speed phase drift for ring ${RING_LABELS[ri]}`}
                >+</button>
              </div>

              {/* Mini pattern preview */}
              <div className="font-mono text-xs tracking-wider overflow-hidden leading-none pt-0.5">
                {bjorklund(r.k, r.n).map((on, si) => (
                  <span
                    key={si}
                    style={on ? { color: hexCol } : { color: "rgba(255,255,255,0.2)" }}
                  >
                    {on ? "●" : "·"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Footer */}
      <footer className="px-5 pb-6 flex items-center gap-4 max-w-3xl">
        <p className="text-white/55 text-xs flex-1">
          Base {BASE_BPM} BPM · Bjorklund · Reich phasing · Wilson look-ahead scheduler
        </p>
        <Link
          href="#design-notes"
          className="text-violet-300/80 text-sm hover:text-violet-300 underline underline-offset-2"
          aria-label="Read the design notes"
        >
          Design notes ↗
        </Link>
      </footer>

      {/* Design notes anchor */}
      <section id="design-notes" className="px-5 pb-10 max-w-3xl border-t border-white/8 pt-6">
        <h2 className="text-xl font-bold text-white/90 font-mono mb-3">Design Notes</h2>
        <div className="space-y-3 text-white/70 text-sm leading-relaxed">
          <p>
            <strong className="text-white/85">Euclidean rhythms (Bjorklund)</strong> —
            E(k, n) distributes k onsets across n steps as evenly as possible using
            the same remainder algorithm that Euclid used for GCDs. E(3,8) is the
            Afro-Cuban <em>tresillo</em>; E(5,8) appears in Middle Eastern and African
            music; E(7,16) is common in jazz subdivisions.
            Reference: Godfried Toussaint, &quot;The Euclidean Algorithm Generates Traditional
            Musical Rhythms,&quot; 2005.
          </p>
          <p>
            <strong className="text-white/85">Reich phasing</strong> — each ring runs at
            BASE_BPM + a tiny driftBpm offset so their downbeats gradually slip against
            each other, producing an interference pattern that never exactly repeats within
            a normal listening session. After ~4–8 minutes the rings re-align, then drift
            again. Inspired by Steve Reich&apos;s <em>Piano Phase</em> (1967) and <em>Clapping Music</em> (1972).
          </p>
          <p>
            <strong className="text-white/85">Look-ahead scheduler</strong> — a
            setInterval at 25 ms pre-schedules audio events 100 ms ahead using
            AudioContext.currentTime, so percussion fires with sub-millisecond precision
            regardless of frame-rate jitter. Visual flashes are queued via setTimeout
            aligned to the same audio timestamp.
            Reference: Chris Wilson, &quot;A Tale of Two Clocks,&quot; 2013.
          </p>
          <p>
            <strong className="text-white/85">Voices</strong> — kick (pitch-enveloped
            sine 150→45 Hz + click), hat (HF noise burst), clave (band-pass exponential
            decay), shaker (band-pass HF noise). All synthesised in Web Audio — no samples.
            Output through a DynamicsCompressor brick-wall limiter.
          </p>
        </div>
      </section>
    </main>
  );
}
