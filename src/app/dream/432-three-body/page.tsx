"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * 432 · THREE-BODY — sonifying gravitational chaos.
 * A real Newtonian N-body simulation (velocity Verlet, softened gravity) drives
 * the sound. Close approaches swell, slingshots whoosh, and every body drones at
 * a frequency tracking its speed. Deterministic but non-repeating (Poincaré):
 * the piece never resolves and never loops.
 */

// ── Types ────────────────────────────────────────────────────────────────
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  m: number;
  hue: number;
}

interface Preset {
  id: string;
  label: string;
  make: () => Body[];
}

// ── Physics constants ────────────────────────────────────────────────────
const G = 1.0; // gravitational constant (sim units)
const SOFT2 = 0.0009; // ε² softening — prevents singularity blow-ups
const SUBSTEPS = 6; // physics steps per render frame (stability)
const DT = 0.0026; // timestep per substep
const BOUND = 1.4; // soft world radius; bodies past this get gently pulled back
const MAX_BODIES = 7;

// Distinct cool/warm hues for bodies
const HUES = [265, 200, 30, 330, 150, 50, 300];

// ── Preset initial conditions ────────────────────────────────────────────
// Coordinates are in a normalized [-1,1] world space, scaled to pixels at draw.

// Figure-8 choreography (Chenciner & Montgomery, 2000). Three equal masses
// chasing each other along a single figure-eight curve. Numerically delicate;
// softening makes it drift into chaos after a while — which is exactly what we want.
function makeFigure8(): Body[] {
  const p1x = 0.97000436;
  const p1y = -0.24308753;
  const vx = 0.466203685;
  const vy = 0.43236573;
  const s = 0.7; // scale into our world
  return [
    { x: -p1x * s, y: -p1y * s, vx: vx, vy: vy, ax: 0, ay: 0, m: 1, hue: HUES[0] },
    { x: p1x * s, y: p1y * s, vx: vx, vy: vy, ax: 0, ay: 0, m: 1, hue: HUES[1] },
    { x: 0, y: 0, vx: -2 * vx, vy: -2 * vy, ax: 0, ay: 0, m: 1, hue: HUES[2] },
  ];
}

// A lopsided three-body system tuned to produce frequent close approaches and
// slingshots within the first few seconds — the default "alive on load" seed.
function makeChaosTrio(): Body[] {
  return [
    { x: -0.55, y: 0.1, vx: 0.18, vy: 0.62, ax: 0, ay: 0, m: 1.6, hue: HUES[0] },
    { x: 0.5, y: -0.05, vx: -0.1, vy: -0.7, ax: 0, ay: 0, m: 1.2, hue: HUES[3] },
    { x: 0.05, y: 0.45, vx: -0.75, vy: 0.08, ax: 0, ay: 0, m: 0.9, hue: HUES[1] },
  ];
}

// Random cluster of 4–5 bodies with small net momentum.
function makeRandomCluster(): Body[] {
  const n = 4 + Math.floor(Math.random() * 2);
  const bodies: Body[] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.2 + Math.random() * 0.55;
    const m = 0.7 + Math.random() * 1.3;
    const vmag = 0.35 + Math.random() * 0.5;
    const vang = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const vx = Math.cos(vang) * vmag;
    const vy = Math.sin(vang) * vmag;
    px += m * vx;
    py += m * vy;
    bodies.push({
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      vx,
      vy,
      ax: 0,
      ay: 0,
      m,
      hue: HUES[i % HUES.length],
    });
  }
  // Cancel net momentum so the cluster doesn't drift off as a whole.
  let totalM = 0;
  for (const b of bodies) totalM += b.m;
  for (const b of bodies) {
    b.vx -= px / totalM;
    b.vy -= py / totalM;
  }
  return bodies;
}

const PRESETS: Preset[] = [
  { id: "trio", label: "chaos trio", make: makeChaosTrio },
  { id: "figure8", label: "figure-8", make: makeFigure8 },
  { id: "cluster", label: "random cluster", make: makeRandomCluster },
];

// ── Physics: compute accelerations (softened gravity) ────────────────────
function applyAccelerations(bodies: Body[]): void {
  for (const b of bodies) {
    b.ax = 0;
    b.ay = 0;
  }
  for (let i = 0; i < bodies.length; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const bj = bodies[j];
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const r2 = dx * dx + dy * dy + SOFT2;
      const inv = 1 / (r2 * Math.sqrt(r2)); // 1 / (r²+ε²)^(3/2)
      const fi = G * bj.m * inv;
      const fj = G * bi.m * inv;
      bi.ax += fi * dx;
      bi.ay += fi * dy;
      bj.ax -= fj * dx;
      bj.ay -= fj * dy;
    }
    // Soft confining bowl so nothing is ejected to infinity (keeps it sounding).
    const dr = Math.sqrt(bi.x * bi.x + bi.y * bi.y);
    if (dr > BOUND) {
      const pull = (dr - BOUND) * 2.5;
      bi.ax -= (bi.x / dr) * pull;
      bi.ay -= (bi.y / dr) * pull;
    }
  }
}

// One velocity-Verlet substep. Accelerations must be current on entry.
function stepVerlet(bodies: Body[]): void {
  // half-kick + drift
  for (const b of bodies) {
    b.vx += 0.5 * b.ax * DT;
    b.vy += 0.5 * b.ay * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
  }
  applyAccelerations(bodies);
  // second half-kick
  for (const b of bodies) {
    b.vx += 0.5 * b.ax * DT;
    b.vy += 0.5 * b.ay * DT;
    // gentle global damping so violent epochs settle instead of running away
    b.vx *= 0.99985;
    b.vy *= 0.99985;
  }
}

// ── Audio voices ─────────────────────────────────────────────────────────
interface DroneVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode; // inharmonic partial
  gain: GainNode;
  pan: StereoPannerNode;
}

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  bedGain: GainNode;
  brightness: BiquadFilterNode;
  drones: DroneVoice[];
}

// Map a physical scalar to an audible-but-uncanny frequency (continuous, no scale).
function speedToFreq(speed: number): number {
  // stretched, inharmonic: log-ish mapping, never quantized
  return 70 + speed * 240 + speed * speed * 60;
}

function makeAudio(numBodies: number): AudioRig {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.value = 0.55;

  // Master brightness filter driven by total kinetic energy.
  const brightness = ctx.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = 900;
  brightness.Q.value = 0.6;

  brightness.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Always-on quiet bed: two detuned low sines so it's never silent.
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.06;
  for (const f of [54.0, 81.3]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(bedGain);
    o.start();
  }
  bedGain.connect(brightness);

  // One drone per body.
  const drones: DroneVoice[] = [];
  for (let i = 0; i < numBodies; i++) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 120 + i * 30;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = (120 + i * 30) * 2.41; // inharmonic partial
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const pan = ctx.createStereoPanner();
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(pan);
    pan.connect(brightness);
    osc.start();
    osc2.start();
    drones.push({ osc, osc2, gain, pan });
  }

  return { ctx, master, limiter, bedGain, brightness, drones };
}

// Fire a transient sound event (close approach swell / slingshot whoosh).
function runEvent(
  rig: AudioRig,
  freq: number,
  intensity: number,
  pan: number,
  whoosh: boolean,
): void {
  const { ctx, brightness } = rig;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));

  const amp = Math.min(0.5, 0.12 + intensity * 0.4);

  if (whoosh) {
    // Filtered noise burst — a slingshot pass.
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(freq * 1.6, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.5), t + 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp).connect(g).connect(p).connect(brightness);
    src.start(t);
    src.stop(t + 0.55);
  } else {
    // Close-approach swell with a Doppler-like glide.
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o.frequency.setValueAtTime(freq * 0.85, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, freq * 0.7), t + 0.9);
    o2.frequency.setValueAtTime(freq * 1.503, t); // inharmonic shimmer
    o2.frequency.exponentialRampToValueAtTime(freq * 2.01, t + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = freq * 3 + 400;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(p).connect(brightness);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.05);
    o2.stop(t + 1.05);
  }
}

// ── Component ────────────────────────────────────────────────────────────
type Phase = "idle" | "running" | "nocanvas";

export default function ThreeBody() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [presetId, setPresetId] = useState("trio");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const bodiesRef = useRef<Body[]>(makeChaosTrio());
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const presetIdRef = useRef(presetId);
  // pair separation tracking for close-approach detection
  const pairStateRef = useRef<Map<string, { prev: number; cooldown: number }>>(new Map());
  const flashesRef = useRef<{ x: number; y: number; life: number; hue: number }[]>([]);
  const dragRef = useRef<{ active: boolean; idx: number; x: number; y: number } | null>(null);

  presetIdRef.current = presetId;

  // Rebuild drones to match body count when a system is (re)seeded.
  const rebuildDrones = useCallback((rig: AudioRig, count: number) => {
    if (rig.drones.length === count) return;
    for (const d of rig.drones) {
      try {
        d.gain.gain.setTargetAtTime(0, rig.ctx.currentTime, 0.05);
        d.osc.stop(rig.ctx.currentTime + 0.3);
        d.osc2.stop(rig.ctx.currentTime + 0.3);
      } catch {
        /* already stopped */
      }
    }
    const drones: DroneVoice[] = [];
    for (let i = 0; i < count; i++) {
      const osc = rig.ctx.createOscillator();
      osc.type = "triangle";
      const osc2 = rig.ctx.createOscillator();
      osc2.type = "sine";
      const gain = rig.ctx.createGain();
      gain.gain.value = 0;
      const pan = rig.ctx.createStereoPanner();
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(pan);
      pan.connect(rig.brightness);
      osc.start();
      osc2.start();
      drones.push({ osc, osc2, gain, pan });
    }
    rig.drones = drones;
  }, []);

  const seed = useCallback(
    (id: string) => {
      const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
      bodiesRef.current = preset.make();
      pairStateRef.current.clear();
      flashesRef.current = [];
      applyAccelerations(bodiesRef.current);
      const rig = rigRef.current;
      if (rig) rebuildDrones(rig, bodiesRef.current.length);
    },
    [rebuildDrones],
  );

  // ── Resize / DPR ──
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    sizeRef.current = { w, h, dpr };
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05060d";
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  // ── Main loop ──
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const bodies = bodiesRef.current;

    // world→screen scale
    const scale = Math.min(w, h) * 0.42;
    const cx = w / 2;
    const cy = h / 2;
    const toScreen = (bx: number, by: number) => ({ x: cx + bx * scale, y: cy + by * scale });

    // ── Physics substeps ──
    for (let s = 0; s < SUBSTEPS; s++) {
      stepVerlet(bodies);
    }

    // ── Barycenter & total KE ──
    let totalM = 0;
    let bx = 0;
    let by = 0;
    let ke = 0;
    for (const b of bodies) {
      totalM += b.m;
      bx += b.m * b.x;
      by += b.m * b.y;
      ke += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    }
    bx /= totalM;
    by /= totalM;

    // ── Drive drones from per-body speed (continuous AudioParams) ──
    if (rig && rig.drones.length === bodies.length) {
      const nowT = rig.ctx.currentTime;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const speed = Math.hypot(b.vx, b.vy);
        const f = speedToFreq(speed);
        const d = rig.drones[i];
        d.osc.frequency.setTargetAtTime(f, nowT, 0.08);
        d.osc2.frequency.setTargetAtTime(f * 2.41, nowT, 0.08);
        // louder when fast & massive, but bounded
        const amp = Math.min(0.13, 0.02 + speed * 0.05) * (0.6 + b.m * 0.3);
        d.gain.gain.setTargetAtTime(amp, nowT, 0.1);
        d.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, b.x * 0.9)), nowT, 0.1);
      }
      // Master brightness tracks total kinetic energy (system "breathes").
      const bright = 600 + Math.min(6000, ke * 1400);
      rig.brightness.frequency.setTargetAtTime(bright, nowT, 0.15);
    }

    // ── Close-approach / slingshot detection ──
    const ps = pairStateRef.current;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const c = bodies[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const sep = Math.hypot(dx, dy);
        const key = `${i}-${j}`;
        let st = ps.get(key);
        if (!st) {
          st = { prev: sep, cooldown: 0 };
          ps.set(key, st);
        }
        if (st.cooldown > 0) st.cooldown -= 1;
        const approaching = sep < st.prev;
        const closeThresh = 0.32;
        // local minimum of separation while close = an encounter
        if (sep < closeThresh && !approaching && st.prev < closeThresh && st.cooldown === 0) {
          const relSpeed = Math.hypot(c.vx - a.vx, c.vy - a.vy);
          const intensity = Math.min(1, (closeThresh - sep) / closeThresh + relSpeed * 0.15);
          const mx = (a.x + c.x) / 2;
          // pitch from relative velocity & combined mass (Doppler-ish), continuous
          const freq = speedToFreq(relSpeed) * (1 + (a.m + c.m) * 0.05);
          const whoosh = relSpeed > 1.6; // fast pass → whoosh
          if (rig) runEvent(rig, freq, intensity, mx * 0.9, whoosh);
          const mid = toScreen((a.x + c.x) / 2, (a.y + c.y) / 2);
          flashesRef.current.push({ x: mid.x, y: mid.y, life: 1, hue: whoosh ? 0 : a.hue });
          st.cooldown = 18;
        }
        st.prev = sep;
      }
    }

    // ── Render: fade-the-canvas trick for comet trails ──
    ctx.fillStyle = "rgba(5, 6, 13, 0.16)";
    ctx.fillRect(0, 0, w, h);

    // faint barycenter marker
    const bc = toScreen(bx, by);
    ctx.fillStyle = "rgba(160,170,220,0.18)";
    ctx.beginPath();
    ctx.arc(bc.x, bc.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // close-approach connection lines (when bodies are near)
    ctx.lineWidth = 1;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const c = bodies[j];
        const sep = Math.hypot(c.x - a.x, c.y - a.y);
        if (sep < 0.4) {
          const pa = toScreen(a.x, a.y);
          const pc = toScreen(c.x, c.y);
          const alpha = (1 - sep / 0.4) * 0.4;
          ctx.strokeStyle = `rgba(200,210,255,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pc.x, pc.y);
          ctx.stroke();
        }
      }
    }

    // bodies as glowing discs
    for (const b of bodies) {
      const p = toScreen(b.x, b.y);
      const speed = Math.hypot(b.vx, b.vy);
      const radius = 5 + Math.sqrt(b.m) * 7;
      const glow = radius * (2.4 + Math.min(1.5, speed));
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      grad.addColorStop(0, `hsla(${b.hue}, 90%, 72%, 0.95)`);
      grad.addColorStop(0.4, `hsla(${b.hue}, 85%, 58%, 0.35)`);
      grad.addColorStop(1, `hsla(${b.hue}, 80%, 50%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${b.hue}, 95%, 88%, 0.95)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // encounter flashes
    const flashes = flashesRef.current;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const fl = flashes[i];
      fl.life -= 0.05;
      if (fl.life <= 0) {
        flashes.splice(i, 1);
        continue;
      }
      const r = (1 - fl.life) * 60 + 6;
      ctx.strokeStyle = `hsla(${fl.hue}, 95%, 80%, ${fl.life * 0.7})`;
      ctx.lineWidth = 2 * fl.life;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Start (inside user gesture: create+resume AudioContext) ──
  const begin = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) {
      setPhase("nocanvas");
      return;
    }
    try {
      const rig = makeAudio(bodiesRef.current.length);
      rigRef.current = rig;
      void rig.ctx.resume();
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
      // visuals still run silently
    }
    resize();
    applyAccelerations(bodiesRef.current);
    setPhase("running");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, resize]);

  // ── Resize listener (only while running) ──
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, resize]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const rig = rigRef.current;
      if (rig) {
        try {
          void rig.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ── Pointer interaction: drag a body, or drop/fling a new mass ──
  const pointerPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { wx: 0, wy: 0 };
    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const scale = Math.min(w, h) * 0.42;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { wx: (px - w / 2) / scale, wy: (py - h / 2) / scale };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "running") return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const { wx, wy } = pointerPos(e);
      const bodies = bodiesRef.current;
      // grab nearest body within a forgiving radius
      let best = -1;
      let bestD = 0.18;
      for (let i = 0; i < bodies.length; i++) {
        const d = Math.hypot(bodies[i].x - wx, bodies[i].y - wy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        dragRef.current = { active: true, idx: best, x: wx, y: wy };
      } else {
        dragRef.current = { active: true, idx: -1, x: wx, y: wy };
      }
    },
    [phase, pointerPos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !drag.active || drag.idx < 0) return;
      const { wx, wy } = pointerPos(e);
      const b = bodiesRef.current[drag.idx];
      if (!b) return;
      // move body and impart velocity from drag motion
      b.vx = (wx - drag.x) * 12;
      b.vy = (wy - drag.y) * 12;
      b.x = wx;
      b.y = wy;
      drag.x = wx;
      drag.y = wy;
    },
    [pointerPos],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (drag.idx < 0 && bodiesRef.current.length < MAX_BODIES) {
        // empty-space release → drop a new mass with fling velocity
        const { wx, wy } = pointerPos(e);
        const bodies = bodiesRef.current;
        bodies.push({
          x: wx,
          y: wy,
          vx: (wx - drag.x) * 8,
          vy: (wy - drag.y) * 8,
          ax: 0,
          ay: 0,
          m: 0.8 + Math.random() * 0.8,
          hue: HUES[bodies.length % HUES.length],
        });
        applyAccelerations(bodies);
        const rig = rigRef.current;
        if (rig) rebuildDrones(rig, bodies.length);
      }
    },
    [pointerPos, rebuildDrones],
  );

  // ── UI ──
  const onPreset = (id: string) => {
    setPresetId(id);
    seed(id);
  };

  const reseed = () => seed(presetIdRef.current);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060d] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5">
        <h1 className="font-mono text-2xl font-semibold text-foreground sm:text-3xl">
          432 · Three-Body
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Music generated by gravity — a chaotic many-body orbit that never repeats and never
          resolves.
        </p>
      </div>

      {/* Idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#05060d]/70 backdrop-blur-sm">
          <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
            A real Newtonian gravity simulation. Close approaches swell, slingshots whoosh, and
            every body drones with its speed. Sound on — find a quiet space.
          </p>
          <button
            type="button"
            onClick={begin}
            className="min-h-[44px] rounded-full bg-violet-500/20 px-8 py-3 font-mono text-xl font-semibold text-violet-300 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
          >
            Begin
          </button>
        </div>
      )}

      {/* Failure notices */}
      {phase === "nocanvas" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="text-base text-violet-300">
            Canvas2D is unavailable in this browser, so the simulation can&apos;t render.
          </p>
        </div>
      )}

      {/* Running controls */}
      {phase === "running" && (
        <>
          {audioBlocked && (
            <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 px-4 text-center text-base text-violet-300">
              Audio was blocked — visuals run silently. Reload and tap Begin to retry sound.
            </p>
          )}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPreset(p.id)}
                  className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base transition ${
                    presetId === p.id
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/40"
                      : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-accent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={reseed}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent"
              >
                re-seed
              </button>
            </div>
            <p className="font-mono text-base text-muted-foreground">
              Drag a body to fling it · drag empty space to drop a new mass
            </p>
          </div>
        </>
      )}

      {/* Design notes */}
      <details className="absolute right-4 top-5 z-20 max-w-xs rounded-lg bg-black/50 p-1 font-mono text-base text-muted-foreground backdrop-blur-sm">
        <summary className="cursor-pointer px-2 py-1.5 text-muted-foreground">design notes</summary>
        <div className="space-y-2 p-2 text-muted-foreground">
          <p>
            Velocity-Verlet integration of softened Newtonian gravity, substepped for stability.
            The three-body problem is deterministic but non-repeating — Poincaré&apos;s sensitive
            dependence on initial conditions.
          </p>
          <p>
            Sound is sonified physics: per-body drones track speed (inharmonic, never a scale);
            close approaches swell with a Doppler-like glide; fast passes whoosh. Total kinetic
            energy opens a master brightness filter, so the piece breathes with the chaos.
          </p>
          <p className="text-muted-foreground">
            Refs: three-body problem; Poincaré; figure-8 choreography (Chenciner &amp; Montgomery,
            2000).
          </p>
        </div>
      </details>

      <Link
        href="/dream"
        className="absolute bottom-4 right-4 z-20 font-mono text-base text-muted-foreground transition hover:text-muted-foreground"
      >
        ← dream lab
      </Link>
    </main>
  );
}
