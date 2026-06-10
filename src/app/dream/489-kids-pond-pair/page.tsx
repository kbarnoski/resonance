"use client";

/**
 * 489 — Kids Pond Pair
 * Two coupled FDTD wave ponds with a floating lily pad that physically transports
 * energy across the channel as a visible sound messenger.
 * Canvas2D rendering. Web Audio API. Kid-safe pentatonic bells.
 *
 * FDTD reference: Van Duyne & Smith, "Physical Modeling with the 2-D Digital
 * Waveguide Mesh," ICMC 1993. Sympathetic coupling between resonators.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ── Grid constants ────────────────────────────────────────────────────────────
const GRID = 56;
const C2 = 0.35 * 0.35; // 0.1225
const DAMP = 0.0018;
const SUBSTEPS = 3;
// Baseline sympathetic coupling coefficient (always-on whisper between ponds)
const K_COUPLE = 0.08;

// ── Pickup cells (off-centre to avoid modal nulls) ────────────────────────────
const PU_A_I = 22;
const PU_A_J = 34;
const PU_B_I = 33;
const PU_B_J = 20;

// ── Pentatonic tunings ────────────────────────────────────────────────────────
// Pond A: low pentatonic  C3 D3 E3 G3 A3
const PENTA_A: number[] = [130.81, 146.83, 164.81, 196.0, 220.0];
// Pond B: high pentatonic C4 D4 E4 G4 A4
const PENTA_B: number[] = [261.63, 293.66, 329.63, 392.0, 440.0];
// Ambient pad: C3 + G3
const AMB_ROOT = 130.815;

// ── Auto-demo schedule (scripted taps before first touch) ─────────────────────
interface DemoEvent {
  t: number;
  pond: "A" | "B";
  ni: number;
  nj: number;
  amp: number;
}
const AUTO_DEMO: DemoEvent[] = [
  // Three taps on the left side of pond A → waves push pad rightward toward channel
  { t: 0.30, pond: "A", ni: 0.45, nj: 0.25, amp: 0.72 },
  { t: 0.90, pond: "A", ni: 0.55, nj: 0.20, amp: 0.65 },
  { t: 1.55, pond: "A", ni: 0.35, nj: 0.28, amp: 0.60 },
  // Two taps on the right side of pond B → waves push pad leftward toward channel on return
  { t: 2.25, pond: "B", ni: 0.45, nj: 0.75, amp: 0.65 },
  { t: 2.80, pond: "B", ni: 0.55, nj: 0.80, amp: 0.55 },
];

// ── Colour mapping helpers ────────────────────────────────────────────────────
// Returns [r, g, b] as 0-255 integers
function dispToRGB(d: number, isA: boolean): [number, number, number] {
  const t = (Math.max(-1, Math.min(1, d)) + 1) * 0.5; // 0=trough, 1=crest
  if (isA) {
    // Pond A: deep indigo → vivid cyan
    const u = t;
    return [
      Math.round((0.04 + u * 0.66) * 255),
      Math.round((0.02 + u * 0.82) * 255),
      Math.round((0.14 + u * 0.82) * 255),
    ];
  } else {
    // Pond B: deep teal → vivid lime-green
    const u = t;
    return [
      Math.round((0.02 + u * 0.26) * 255),
      Math.round((0.10 + u * 0.82) * 255),
      Math.round((0.16 + u * 0.40) * 255),
    ];
  }
}

// ── Lily pad physics interface ────────────────────────────────────────────────
interface LilyPad {
  // "A" | "B" = floating in that pond; "channel" = crossing
  state: "A" | "B" | "channel";
  // Position within current pond (0..1 each axis)
  x: number;
  y: number;
  // Velocity from wave gradient drift
  vx: number;
  vy: number;
  // Visual bob from wave height
  bobAmt: number;
  // Visual tilt from gradient
  tiltX: number;
  tiltY: number;
  // Channel crossing bookkeeping
  crossProgress: number;       // 0 → 1 (0 = just started, 1 = arrived)
  crossDir: 1 | -1;            // +1 = A→B; -1 = B→A
  // Carried energy (accumulates; injected on arrival)
  carriedEnergy: number;
  // Seconds until pad can trigger another crossing (prevents rapid thrashing)
  dropCooldown: number;
}

// ── Tap request queue ─────────────────────────────────────────────────────────
interface TapRequest {
  pond: "A" | "B";
  ni: number; // 0..1, maps to FDTD row
  nj: number; // 0..1, maps to FDTD col
  amp: number;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function KidsPondPair() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const startedRef = useRef(false);
  const actxRef = useRef<AudioContext | null>(null);
  const audioReadyRef = useRef(false);

  // ── Start handler (user gesture → AudioContext unlock for iOS) ────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const Ctor = (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ) as typeof AudioContext;
    const actx = new Ctor();
    if (actx.state === "suspended") await actx.resume();
    actxRef.current = actx;
    audioReadyRef.current = true;
    setStarted(true);
  }, []);

  // ── Main simulation+render effect ────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      setCanvasFailed(true);
      return;
    }

    const actx = actxRef.current;
    if (!actx) return;

    // ── Canvas sizing ───────────────────────────────────────────────────
    const dpr = () => Math.min(window.devicePixelRatio, 2);

    const resizeCanvas = () => {
      const d = dpr();
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resizeCanvas();

    // ── Audio master chain ──────────────────────────────────────────────
    const masterGain = actx.createGain();
    masterGain.gain.value = 0.65;

    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;

    masterGain.connect(comp);
    comp.connect(actx.destination);

    // Cleanup handles for oscillators started at setup time
    const oscStopFns: Array<() => void> = [];

    // Build always-on ambient pad: C3 + G3
    const buildAmbientPad = () => {
      const freqs = [AMB_ROOT, AMB_ROOT * 1.5];
      const levels = [0.022, 0.016];
      freqs.forEach((freq, k) => {
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.002);
        const g = actx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(levels[k], actx.currentTime, 1.8);
        const lfo = actx.createOscillator();
        lfo.frequency.value = 0.07 + k * 0.03;
        const lg = actx.createGain();
        lg.gain.value = freq * 0.0025;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        osc.connect(g).connect(masterGain);
        osc.start();
        lfo.start();
        oscStopFns.push(() => {
          try { osc.stop(); } catch { /* already stopped */ }
          try { lfo.stop(); } catch { /* already stopped */ }
        });
      });
    };
    buildAmbientPad();

    // One-shot bell: soft 12ms attack, 1.2s release
    const playBell = (freq: number, amp: number) => {
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const env = actx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(amp * 0.18, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      const osc2 = actx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq * 2.002;
      const env2 = actx.createGain();
      env2.gain.setValueAtTime(0, t);
      env2.gain.linearRampToValueAtTime(amp * 0.04, t + 0.012);
      env2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(env).connect(masterGain);
      osc2.connect(env2).connect(masterGain);
      osc.start(t);  osc.stop(t + 1.3);
      osc2.start(t); osc2.stop(t + 0.65);
    };

    // Arrival sparkle: ascending C5–E5–G5–C6 arpeggio
    const playSparkle = () => {
      [523.25, 659.26, 783.99, 1046.5].forEach((f, k) => {
        const t = actx.currentTime + k * 0.065;
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const env = actx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.09, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(env).connect(masterGain);
        osc.start(t); osc.stop(t + 0.5);
      });
    };

    // Per-note cooldowns prevent bell re-triggering too fast
    const cdA = new Float32Array(PENTA_A.length);
    const cdB = new Float32Array(PENTA_B.length);

    const maybeBell = (energy: number, penta: number[], cd: Float32Array) => {
      if (energy < 0.04) return;
      const idx = Math.min(penta.length - 1, Math.floor(energy * penta.length * 2.5));
      if (cd[idx] > 0) return;
      cd[idx] = 0.55;
      playBell(penta[idx], Math.min(1, energy * 2.5));
    };

    // ── FDTD grids ──────────────────────────────────────────────────────
    const G2 = GRID * GRID;
    // Pond A
    const uA  = new Float32Array(G2);
    const uAp = new Float32Array(G2);
    const uAn = new Float32Array(G2);
    // Pond B
    const uB  = new Float32Array(G2);
    const uBp = new Float32Array(G2);
    const uBn = new Float32Array(G2);

    // Inject a Gaussian displacement bump into a grid
    const injectGaussian = (
      u: Float32Array,
      up: Float32Array,
      ci: number,
      cj: number,
      amp: number,
      r = 3,
    ) => {
      const r2 = r * r;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 1 || ni >= GRID - 1 || nj < 1 || nj >= GRID - 1) continue;
          const d2 = di * di + dj * dj;
          if (d2 > r2) continue;
          const w = amp * Math.exp(-3 * d2 / r2);
          const idx = ni * GRID + nj;
          u[idx]  += w;
          up[idx] += w * 0.5;
        }
      }
    };

    // One FDTD substep for a single grid
    const stepGrid = (u: Float32Array, up: Float32Array, un: Float32Array) => {
      for (let i = 1; i < GRID - 1; i++) {
        const row = i * GRID;
        for (let j = 1; j < GRID - 1; j++) {
          const k = row + j;
          const lap = u[k + GRID] + u[k - GRID] + u[k + 1] + u[k - 1] - 4 * u[k];
          un[k] = (2 * u[k] - up[k] + C2 * lap) * (1 - DAMP);
        }
      }
      up.set(u);
      u.set(un);
    };

    // Sympathetic coupling: edge columns of A and B whisper to each other
    const applySympatheticCoupling = () => {
      const jA = GRID - 2; // rightmost interior column of A
      const jB = 1;        // leftmost interior column of B
      for (let i = 1; i < GRID - 1; i++) {
        const kA = i * GRID + jA;
        const kB = i * GRID + jB;
        const diff = uB[kB] - uA[kA];
        uA[kA] += K_COUPLE * diff;
        uB[kB] -= K_COUPLE * diff;
      }
    };

    // Average absolute amplitude near a pickup cell
    const pickupEnergy = (u: Float32Array, pi: number, pj: number): number => {
      let e = 0;
      let cnt = 0;
      const R = 4;
      for (let di = -R; di <= R; di++) {
        for (let dj = -R; dj <= R; dj++) {
          const ni = pi + di;
          const nj = pj + dj;
          if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
          e += Math.abs(u[ni * GRID + nj]);
          cnt++;
        }
      }
      return cnt > 0 ? e / cnt : 0;
    };

    // RMS of whole field (used to drive pad energy accumulation)
    const fieldRMS = (u: Float32Array): number => {
      let e = 0;
      for (let i = 0; i < G2; i++) e += u[i] * u[i];
      return Math.sqrt(e / G2);
    };

    // Sample wave height at normalised position (nx, ny in 0..1)
    const waveAt = (u: Float32Array, nx: number, ny: number): number => {
      const gi = Math.max(1, Math.min(GRID - 2, Math.round(ny * (GRID - 1))));
      const gj = Math.max(1, Math.min(GRID - 2, Math.round(nx * (GRID - 1))));
      return u[gi * GRID + gj];
    };

    // Wave gradient at normalised position — used to drift the pad
    const waveGrad = (u: Float32Array, nx: number, ny: number): [number, number] => {
      const gi = Math.max(2, Math.min(GRID - 3, Math.round(ny * (GRID - 1))));
      const gj = Math.max(2, Math.min(GRID - 3, Math.round(nx * (GRID - 1))));
      const dx = (u[gi * GRID + gj + 1] - u[gi * GRID + gj - 1]) * 0.5;
      const dy = (u[(gi + 1) * GRID + gj] - u[(gi - 1) * GRID + gj]) * 0.5;
      return [dx, dy];
    };

    // ── Lily pad ────────────────────────────────────────────────────────
    const PAD_DRIFT    = 0.012;   // how strongly wave gradient pushes the pad
    const PAD_FRICTION = 0.88;    // velocity decay per frame
    const CROSS_THRESH = 0.018;   // carried-energy threshold to start crossing
    const CROSS_SPEED  = 0.014;   // channel-crossing progress per frame (at 60fps ~= 1.2s)

    const pad: LilyPad = {
      state: "A",
      x: 0.50, y: 0.50,
      vx: 0, vy: 0,
      bobAmt: 0, tiltX: 0, tiltY: 0,
      crossProgress: 0, crossDir: 1,
      carriedEnergy: 0, dropCooldown: 0,
    };

    const updatePad = (dt: number) => {
      pad.dropCooldown = Math.max(0, pad.dropCooldown - dt);

      if (pad.state === "A" || pad.state === "B") {
        const u    = pad.state === "A" ? uA : uB;
        const h    = waveAt(u, pad.x, pad.y);
        const [gx, gy] = waveGrad(u, pad.x, pad.y);

        // Visual bob (lowpass-filtered wave height)
        pad.bobAmt  = pad.bobAmt  * 0.85 + Math.abs(h) * 0.15;
        pad.tiltX   = pad.tiltX   * 0.90 + gx * 0.10;
        pad.tiltY   = pad.tiltY   * 0.90 + gy * 0.10;

        // Drift velocity from wave gradient
        pad.vx = (pad.vx + gx * PAD_DRIFT) * PAD_FRICTION;
        pad.vy = (pad.vy + gy * PAD_DRIFT) * PAD_FRICTION;

        pad.x = Math.max(0.08, Math.min(0.92, pad.x + pad.vx));
        pad.y = Math.max(0.08, Math.min(0.92, pad.y + pad.vy));

        // Accumulate carried energy proportional to field RMS
        const rms = fieldRMS(u);
        pad.carriedEnergy = Math.min(1, pad.carriedEnergy * 0.97 + rms * 1.8 * dt);

        // Trigger crossing when near channel edge and enough energy
        if (pad.dropCooldown <= 0) {
          if (pad.state === "A" && pad.x > 0.72 && pad.carriedEnergy > CROSS_THRESH) {
            pad.state = "channel";
            pad.crossProgress = 0;
            pad.crossDir = 1;
          } else if (pad.state === "B" && pad.x < 0.28 && pad.carriedEnergy > CROSS_THRESH) {
            pad.state = "channel";
            pad.crossProgress = 0;
            pad.crossDir = -1;
          }
        }

      } else {
        // Crossing the channel
        pad.crossProgress += CROSS_SPEED;
        pad.bobAmt = pad.bobAmt * 0.92; // settle while crossing

        if (pad.crossProgress >= 1) {
          const arrivedIn: "A" | "B" = pad.crossDir === 1 ? "B" : "A";
          pad.state = arrivedIn;
          pad.crossProgress = 0;
          // Land near the channel-facing edge of the new pond
          pad.x = pad.crossDir === 1 ? 0.18 : 0.82;
          pad.y = 0.50;
          pad.vx = 0;
          pad.vy = 0;
          pad.dropCooldown = 1.8;

          // Inject carried energy into arrival pond
          const destU  = arrivedIn === "B" ? uB : uA;
          const destUp = arrivedIn === "B" ? uBp : uAp;
          const ci = Math.max(1, Math.min(GRID - 2, Math.round(pad.y * (GRID - 1))));
          const cj = Math.max(1, Math.min(GRID - 2, Math.round(pad.x * (GRID - 1))));
          injectGaussian(destU, destUp, ci, cj, pad.carriedEnergy * 0.6, 4);
          playSparkle();

          pad.carriedEnergy = 0;
          pad.bobAmt = 0.45;
        }
      }
    };

    // ── Pending taps queue ──────────────────────────────────────────────
    const pendingTaps: TapRequest[] = [];

    const enqueueTap = (pond: "A" | "B", ni: number, nj: number, amp: number) => {
      pendingTaps.push({ pond, ni, nj, amp });
    };

    // ── Layout computation ──────────────────────────────────────────────
    // Returns layout in CSS-pixel units (pre-DPR)
    const getLayout = () => {
      const d    = dpr();
      const cw   = canvas.width  / d;
      const ch   = canvas.height / d;
      const margin     = 8;
      const chanFrac   = 0.075;
      const totalW     = cw - margin * 2;
      const channelW   = Math.max(22, totalW * chanFrac);
      const pondW      = (totalW - channelW) / 2;
      const pondH      = ch - margin * 2;
      const pondAX     = margin;
      const pondAY     = margin;
      const chanX      = pondAX + pondW;
      const pondBX     = chanX + channelW;
      return { pondW, pondH, pondAX, pondAY, chanX, channelW, pondBX, cw, ch };
    };

    // ── Input hit-testing ───────────────────────────────────────────────
    const getPondCoords = (
      clientX: number,
      clientY: number,
    ): { pond: "A" | "B"; ni: number; nj: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const rx = (clientX - rect.left)  / rect.width;
      const ry = (clientY - rect.top)   / rect.height;
      if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return null;

      const { pondW, pondH, pondAX, pondAY, chanX, pondBX, cw, ch } = getLayout();
      const px = rx * cw;
      const py = ry * ch;

      if (px >= pondAX && px < chanX && py >= pondAY && py < pondAY + pondH) {
        return { pond: "A", ni: (py - pondAY) / pondH, nj: (px - pondAX) / pondW };
      }
      if (px >= pondBX && px < pondBX + pondW && py >= pondAY && py < pondAY + pondH) {
        return { pond: "B", ni: (py - pondAY) / pondH, nj: (px - pondBX) / pondW };
      }
      return null;
    };

    // ── Auto-demo ───────────────────────────────────────────────────────
    let demoDone = false;
    const demoTimers: ReturnType<typeof setTimeout>[] = [];

    const stopAutoDemo = () => {
      if (demoDone) return;
      demoDone = true;
      demoTimers.forEach(clearTimeout);
    };

    for (const ev of AUTO_DEMO) {
      const id = setTimeout(() => {
        if (!demoDone) enqueueTap(ev.pond, ev.ni, ev.nj, ev.amp);
      }, ev.t * 1000);
      demoTimers.push(id);
    }
    demoTimers.push(setTimeout(stopAutoDemo, 3200));

    // ── Event handlers ──────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      stopAutoDemo();
      const p = getPondCoords(e.clientX, e.clientY);
      if (p) enqueueTap(p.pond, p.ni, p.nj, 0.70);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const p = getPondCoords(e.clientX, e.clientY);
      if (p) enqueueTap(p.pond, p.ni, p.nj, 0.28);
    };

    const onTouchStart = (e: TouchEvent) => {
      stopAutoDemo();
      e.preventDefault();
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        const p = getPondCoords(t.clientX, t.clientY);
        if (p) enqueueTap(p.pond, p.ni, p.nj, 0.70);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        const p = getPondCoords(t.clientX, t.clientY);
        if (p) enqueueTap(p.pond, p.ni, p.nj, 0.24);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("touchstart",  onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",   onTouchMove,  { passive: false });
    window.addEventListener("resize",      resizeCanvas);

    // ── Draw helpers ────────────────────────────────────────────────────

    // Render one FDTD field as a pixel map in a rect on the canvas
    const drawPond = (
      u: Float32Array,
      isA: boolean,
      destX: number, destY: number,
      pondW: number, pondH: number,
    ) => {
      const d  = dpr();
      const px = Math.round(destX * d);
      const py = Math.round(destY * d);
      const pw = Math.round(pondW * d);
      const ph = Math.round(pondH * d);
      if (pw <= 0 || ph <= 0) return;

      const img  = ctx2d.createImageData(pw, ph);
      const data = img.data;

      for (let row = 0; row < ph; row++) {
        const gi = Math.min(GRID - 1, Math.floor((row / ph) * GRID));
        const rowOff = row * pw;
        for (let col = 0; col < pw; col++) {
          const gj = Math.min(GRID - 1, Math.floor((col / pw) * GRID));
          const [r, g, b] = dispToRGB(u[gi * GRID + gj], isA);
          const off = (rowOff + col) * 4;
          data[off]     = r;
          data[off + 1] = g;
          data[off + 2] = b;
          data[off + 3] = 255;
        }
      }
      ctx2d.putImageData(img, px, py);
    };

    // Render the narrow channel between ponds
    const drawChannel = (
      chanX: number, chanY: number,
      chanW: number, chanH: number,
      now: number,
    ) => {
      const d  = dpr();
      const cx = chanX * d;
      const cy = chanY * d;
      const cw = chanW * d;
      const ch = chanH * d;

      const grad = ctx2d.createLinearGradient(cx, 0, cx + cw, 0);
      grad.addColorStop(0,   "rgba(20, 55, 80, 0.92)");
      grad.addColorStop(0.5, "rgba(28, 72, 100, 0.96)");
      grad.addColorStop(1,   "rgba(20, 55, 80, 0.92)");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(cx, cy, cw, ch);

      // Animated ripple lines
      ctx2d.save();
      ctx2d.strokeStyle = "rgba(80, 170, 220, 0.22)";
      ctx2d.lineWidth = Math.max(1, d);
      for (let w = 0; w < 3; w++) {
        const yBase = cy + (ch / 4) * (w + 1);
        ctx2d.beginPath();
        for (let x = 0; x <= cw; x += 3) {
          const wy = yBase + Math.sin((x / cw) * Math.PI * 3 + now * 0.0012 + w * 1.1) * 2.5 * d;
          if (x === 0) ctx2d.moveTo(cx + x, wy); else ctx2d.lineTo(cx + x, wy);
        }
        ctx2d.stroke();
      }
      ctx2d.restore();
    };

    // Render a glowing border around a pond rect
    const drawPondRim = (
      x: number, y: number, w: number, h: number,
      color: string,
    ) => {
      const d = dpr();
      ctx2d.save();
      ctx2d.strokeStyle = color;
      ctx2d.lineWidth   = 2.5 * d;
      ctx2d.shadowBlur  = 10 * d;
      ctx2d.shadowColor = color;
      ctx2d.strokeRect(x * d + 1, y * d + 1, w * d - 2, h * d - 2);
      ctx2d.restore();
    };

    // Render the lily pad sprite
    const drawLilyPad = (
      pondAX: number, pondAY: number,
      pondW: number,  pondH: number,
      chanX: number,  chanW: number,
    ) => {
      const d = dpr();

      let screenX: number;
      let screenY: number;

      if (pad.state === "A") {
        screenX = (pondAX + pad.x * pondW) * d;
        screenY = (pondAY + pad.y * pondH) * d;
      } else if (pad.state === "B") {
        const pondBX = chanX + chanW;
        screenX = (pondBX + pad.x * pondW) * d;
        screenY = (pondAY + pad.y * pondH) * d;
      } else {
        // Crossing the channel: interpolate across channel rect
        const startX = (pad.crossDir === 1 ? chanX : chanX + chanW) * d;
        const endX   = (pad.crossDir === 1 ? chanX + chanW : chanX) * d;
        screenX = startX + (endX - startX) * pad.crossProgress;
        screenY = (pondAY + pondH * 0.50) * d;
      }

      const bobOffset = pad.bobAmt * 7 * d;
      const radius    = Math.max(14 * d, Math.min(pondW, pondH) * 0.072 * d);

      // Tilt vector: rotate the pad and shift the specular highlight accordingly
      const tiltAngle   = Math.atan2(pad.tiltY, pad.tiltX) * 0.25;
      const tiltMag     = Math.sqrt(pad.tiltX * pad.tiltX + pad.tiltY * pad.tiltY);
      const hlOffX      = -pad.tiltX * radius * 0.28;
      const hlOffY      = -pad.tiltY * radius * 0.28;

      ctx2d.save();
      ctx2d.translate(screenX, screenY - bobOffset);
      ctx2d.rotate(tiltAngle + tiltMag * 0.15);

      // Outer glow
      const glow = ctx2d.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius * 1.7);
      glow.addColorStop(0,   `rgba(130, 230, 80, ${0.25 + pad.bobAmt * 0.35})`);
      glow.addColorStop(1,   "rgba(80, 180, 40, 0)");
      ctx2d.beginPath();
      ctx2d.arc(0, 0, radius * 1.7, 0, Math.PI * 2);
      ctx2d.fillStyle = glow;
      ctx2d.fill();

      // Pad disc — highlight offset by tilt direction
      const fill = ctx2d.createRadialGradient(
        hlOffX - radius * 0.08, hlOffY - radius * 0.08, 0,
        0, 0, radius,
      );
      fill.addColorStop(0,   "#c4f070");
      fill.addColorStop(0.6, "#6cc42a");
      fill.addColorStop(1,   "#3a7e0f");
      ctx2d.beginPath();
      ctx2d.arc(0, 0, radius, 0, Math.PI * 2);
      ctx2d.fillStyle = fill;
      ctx2d.fill();

      // Characteristic V-notch
      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.lineTo(Math.cos(-0.32) * radius, Math.sin(-0.32) * radius);
      ctx2d.arc(0, 0, radius, -0.32, 0.32);
      ctx2d.closePath();
      ctx2d.fillStyle = "rgba(5, 20, 5, 0.55)";
      ctx2d.fill();

      // Radial veins
      ctx2d.strokeStyle = "rgba(255,255,255,0.22)";
      ctx2d.lineWidth   = Math.max(0.8, radius * 0.075);
      for (let v = 0; v < 6; v++) {
        const angle = (v / 6) * Math.PI * 2 + 0.45;
        ctx2d.beginPath();
        ctx2d.moveTo(0, 0);
        ctx2d.lineTo(Math.cos(angle) * radius * 0.88, Math.sin(angle) * radius * 0.88);
        ctx2d.stroke();
      }

      // Carried-energy glow at centre (golden dot)
      if (pad.carriedEnergy > 0.015) {
        const alpha = Math.min(1, pad.carriedEnergy * 1.8);
        const dotGlow = ctx2d.createRadialGradient(0, 0, 0, 0, 0, radius * 0.38);
        dotGlow.addColorStop(0,  `rgba(255, 245, 80, ${alpha})`);
        dotGlow.addColorStop(1,  "rgba(255, 180, 30, 0)");
        ctx2d.beginPath();
        ctx2d.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
        ctx2d.fillStyle = dotGlow;
        ctx2d.fill();
      }

      ctx2d.restore();
    };

    // ── Render loop ─────────────────────────────────────────────────────
    let rafId    = 0;
    let lastTime = performance.now();
    let audioClock = 0;
    const AUDIO_INTERVAL = 1 / 30;

    const renderLoop = (now: number) => {
      rafId = requestAnimationFrame(renderLoop);
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Flush pending taps
      while (pendingTaps.length > 0) {
        const tap = pendingTaps.shift()!;
        const u  = tap.pond === "A" ? uA : uB;
        const up = tap.pond === "A" ? uAp : uBp;
        const ci = Math.max(1, Math.min(GRID - 2, Math.round(tap.ni * (GRID - 1))));
        const cj = Math.max(1, Math.min(GRID - 2, Math.round(tap.nj * (GRID - 1))));
        injectGaussian(u, up, ci, cj, tap.amp);
      }

      // FDTD substeps
      for (let s = 0; s < SUBSTEPS; s++) {
        stepGrid(uA, uAp, uAn);
        stepGrid(uB, uBp, uBn);
        applySympatheticCoupling();
      }

      // Lily pad update
      updatePad(dt);

      // Bell cooldown timers
      for (let i = 0; i < cdA.length; i++) cdA[i] = Math.max(0, cdA[i] - dt);
      for (let i = 0; i < cdB.length; i++) cdB[i] = Math.max(0, cdB[i] - dt);

      // Audio events at ~30Hz
      audioClock += dt;
      if (audioClock >= AUDIO_INTERVAL) {
        audioClock = 0;
        maybeBell(pickupEnergy(uA, PU_A_I, PU_A_J), PENTA_A, cdA);
        maybeBell(pickupEnergy(uB, PU_B_I, PU_B_J), PENTA_B, cdB);
      }

      // ── Draw ─────────────────────────────────────────────────────────
      const { pondW, pondH, pondAX, pondAY, chanX, channelW, pondBX } = getLayout();

      ctx2d.fillStyle = "#07050e";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);

      drawPond(uA, true,  pondAX, pondAY, pondW, pondH);
      drawPond(uB, false, pondBX, pondAY, pondW, pondH);
      drawChannel(chanX, pondAY, channelW, pondH, now);

      drawPondRim(pondAX, pondAY, pondW, pondH, "rgba(90, 180, 255, 0.55)");
      drawPondRim(pondBX, pondAY, pondW, pondH, "rgba(70, 220, 140, 0.55)");

      // Pickup indicator dots
      const d       = dpr();
      const dotR    = Math.max(4, 5 * d);
      const puAx    = (pondAX + (PU_A_J / (GRID - 1)) * pondW) * d;
      const puAy    = (pondAY + (PU_A_I / (GRID - 1)) * pondH) * d;
      const puBx    = (pondBX + (PU_B_J / (GRID - 1)) * pondW) * d;
      const puBy    = (pondAY + (PU_B_I / (GRID - 1)) * pondH) * d;
      ctx2d.save();
      ctx2d.fillStyle   = "rgba(255, 210, 60, 0.8)";
      ctx2d.shadowBlur  = 8 * d;
      ctx2d.shadowColor = "rgba(255, 200, 50, 0.9)";
      ctx2d.beginPath(); ctx2d.arc(puAx, puAy, dotR, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.beginPath(); ctx2d.arc(puBx, puBy, dotR, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.restore();

      drawLilyPad(pondAX, pondAY, pondW, pondH, chanX, channelW);
    };

    requestAnimationFrame(renderLoop);

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      stopAutoDemo();
      canvas.removeEventListener("pointerdown",  onPointerDown);
      canvas.removeEventListener("pointermove",  onPointerMove);
      canvas.removeEventListener("touchstart",   onTouchStart);
      canvas.removeEventListener("touchmove",    onTouchMove);
      window.removeEventListener("resize",       resizeCanvas);
      oscStopFns.forEach((fn) => fn());
      void actx.close();
    };
  }, [started]);

  // ── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#07050e" }}>
      {/* Header */}
      <div className="w-full px-6 pt-8 pb-3 text-center flex-none">
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
          Pond Pair
        </h1>
        <p className="text-white/80 text-base leading-relaxed max-w-lg mx-auto">
          Tap the water — the lily pad rides the ripples and carries their energy across the channel.
        </p>
      </div>

      {/* Canvas unavailable notice */}
      {canvasFailed && (
        <div
          className="mx-6 my-4 rounded-xl px-6 py-4 text-center"
          style={{
            background: "rgba(244,63,94,0.12)",
            border:     "1px solid rgba(244,63,94,0.3)",
          }}
        >
          <p className="text-rose-300 text-base font-semibold">
            Canvas 2D unavailable on this device
          </p>
          <p className="text-white/75 text-sm mt-1">
            Try a different browser or device.
          </p>
        </div>
      )}

      {/* Start button — user gesture unlocks iOS audio */}
      {!started && (
        <div className="flex flex-col items-center flex-1 justify-center gap-4 pb-16">
          <button
            onClick={handleStart}
            className="rounded-2xl text-xl font-semibold text-white
                       transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #1a6eb8 0%, #18a870 100%)",
              boxShadow:  "0 0 40px rgba(26,110,184,0.5)",
              minWidth:   "220px",
              minHeight:  "64px",
              padding:    "16px 40px",
            }}
          >
            Tap the Water
          </button>
          <p className="text-white/55 text-sm">
            Multi-touch works — try both ponds at once!
          </p>
        </div>
      )}

      {/* Canvas area — fills remaining vertical space */}
      {started && !canvasFailed && (
        <>
          <div
            ref={containerRef}
            className="flex-1 w-full relative"
            style={{ minHeight: 280, cursor: "crosshair", touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              style={{ display: "block", width: "100%", height: "100%" }}
            />
            {/* Pond labels */}
            <div className="absolute bottom-2 left-0 pointer-events-none" style={{ width: "47%" }}>
              <p className="text-center text-white/55 text-sm">Pond A · low bells</p>
            </div>
            <div className="absolute bottom-2 right-0 pointer-events-none" style={{ width: "47%" }}>
              <p className="text-center text-white/55 text-sm">Pond B · high bells</p>
            </div>
          </div>

          <p className="text-white/45 text-sm text-center py-2 px-4 flex-none">
            Big splash → pad bobs to the edge → crosses the channel → drops into the other pond → it sings
          </p>
        </>
      )}

      {/* Design notes (collapsible) */}
      <section className="w-full max-w-2xl mx-auto px-6 pb-16 pt-4 flex-none">
        <details>
          <summary className="text-white/55 text-sm cursor-pointer hover:text-white/80 transition-colors py-2">
            Design notes ↓
          </summary>
          <div
            className="mt-3 rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border:     "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-xl font-semibold text-white">Design Notes</h2>
            <div className="space-y-3 text-white/75 text-sm leading-relaxed">
              <p>
                <span className="text-white/90 font-medium">FDTD wave fields.</span>{" "}
                Two 56×56 grids, each stepped 3 substeps per frame using the discrete 2-D wave equation:{" "}
                <code className="font-mono text-cyan-300 text-xs bg-white/5 px-1 rounded">
                  uNext = 2u − uPrev + C²·∇²u, ×(1−DAMP)
                </code>.{" "}
                C_WAVE = 0.35, DAMP ≈ 0.0018. Dirichlet (zero) outer boundary makes waves reflect.
                Reference: Van Duyne &amp; Smith, &ldquo;Physical Modeling with the 2-D Digital Waveguide Mesh,&rdquo;
                ICMC 1993.
              </p>
              <p>
                <span className="text-white/90 font-medium">Sympathetic coupling.</span>{" "}
                The ponds whisper to each other always via edge-column coupling
                (<code className="font-mono text-xs bg-white/5 px-1 rounded">K ≈ 0.08</code>).
                This is analogous to sympathetic resonance between two coupled resonators — a ringing
                in one pond subtly excites the other. The lily pad is the dramatic, visible layer on top.
              </p>
              <p>
                <span className="text-white/90 font-medium">Lily pad carrier.</span>{" "}
                The pad bobs on the local wave height (lowpass-filtered) and drifts from the wave-gradient
                vector (a wave pushes the pad like a real object riding a water surface).
                When accumulated field energy exceeds a threshold and the pad has drifted near the channel edge,
                it begins crossing. On arrival it injects a Gaussian bump and triggers a sparkle chime.
                The golden dot on the pad visualises carried energy.
              </p>
              <p>
                <span className="text-white/90 font-medium">Audio.</span>{" "}
                Pond A: low pentatonic C3–A3. Pond B: high pentatonic C4–A4 (harmonising register).
                Bell tones use a 12ms attack, 1.2s exponential release.
                An always-on C3+G3 ambient pad keeps the space alive.
                All audio passes through a DynamicsCompressor brick-wall limiter for child safety.
              </p>
              <p>
                <span className="text-white/90 font-medium">Rendering.</span>{" "}
                Canvas2D only: per-frame pixel fill via{" "}
                <code className="font-mono text-xs bg-white/5 px-1 rounded">createImageData</code> +{" "}
                <code className="font-mono text-xs bg-white/5 px-1 rounded">putImageData</code>{" "}
                (no Three.js, no WebGL). The lily pad is drawn with arc/path primitives and radial gradients.
              </p>
              <p className="text-white/50 text-xs">
                Unverified: pixel-fill at 60fps may lag on very large canvases on low-end devices
                (consider reducing GRID to 40 if needed). Pad crossing threshold is tuned aesthetically,
                not physically. The sympathetic coupling is simplified (edge-column only). Bell note
                timing is approximate.
              </p>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
