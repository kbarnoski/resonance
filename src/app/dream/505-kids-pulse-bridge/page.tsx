"use client";
import { useRef, useEffect, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Left (gold) and Right (teal) player colours
const COL_L = { h: 38,  s: 90, l: 55 }; // warm gold
const COL_R = { h: 180, s: 65, l: 50 }; // cool teal

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// Two-voice ostinati notes (Hz):
//   Low-sync: L plays A3 (220 Hz) + R plays B3 (246.94 Hz) → major 2nd, yearning
//   High-sync: L plays C4 (261.63) + R plays G4 (392) → open fifth, warm resolution
const L_FREQ_TENSE    = 220.00;   // A3
const L_FREQ_RESOLVED = 261.63;   // C4
const R_FREQ_TENSE    = 246.94;   // B3
const R_FREQ_RESOLVED = 392.00;   // G4

// Shimmer chord: C4 E4 G4 (major triad sparkle when locked)
const SHIMMER_FREQS = [261.63, 329.63, 392.00];

// Tap-pluck note pitches (pentatonic):
const L_PLUCK_HZ = 261.63; // C4
const R_PLUCK_HZ = 392.00; // G4

// Synchrony thresholds
const SYNC_LOCK = 0.82; // above this → "locked"

// Max recent taps to keep per side
const TAP_HISTORY   = 8;

// Auto-demo: total cycle in seconds
const DEMO_CYCLE_S  = 26;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface TapRecord { t: number; itvMs: number }

interface Ring {
  x: number; y: number;
  r: number; maxR: number;
  alpha: number; color: string;
}

interface Firefly {
  // bridge position (0=left anchor, 1=right anchor)
  pos: number;   // 0..1 along bridge
  y: number;     // vertical offset from bridge center-line
  vy: number;
  speed: number;
  size: number;
  alpha: number;
  col: string;
  side: 0 | 1;   // which end it was born at
}

// All mutable simulation state — live in a single ref to avoid stale closures
interface State {
  // tap history per side
  tapsL: TapRecord[];
  tapsR: TapRecord[];
  // synchrony index (0..1), smoothed
  sync: number;
  syncRaw: number;
  // shimmer countdown (s)
  shimmerT: number;
  // was locked last frame?
  wasLocked: boolean;
  // rings (expanding circles on tap)
  rings: Ring[];
  // fireflies
  fireflies: Firefly[];
  // demo mode
  demoActive: boolean;
  demoT: number;     // seconds since demo started
  demoPhaseL: number; // accumulated phase of simulated L tapper
  demoPhaseR: number;
  // canvas size cache
  W: number; H: number;
  // last raf timestamp
  prevTs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE / NON-HOOK HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Compute Kuramoto-style synchrony order parameter from two tap histories.
 *  For each pair of recent taps, we treat each stream as a phase oscillator
 *  whose phase at time t is: φ = 2π × (t mod ITV) / ITV, where ITV is the
 *  mean inter-tap interval for that stream.
 *  We sample at the most recent common time, compute Δφ = φL − φR,
 *  then R = |mean of exp(i·Δφ)| over the last min(N,TAP_HISTORY) samples.
 *  Returns 0 when not enough data, rises to 1 when perfectly locked.
 */
function computeSyncIndex(tapsL: TapRecord[], tapsR: TapRecord[]): number {
  if (tapsL.length < 3 || tapsR.length < 3) return 0;

  // Mean ITV for each side (last TAP_HISTORY entries)
  const recentL = tapsL.slice(-TAP_HISTORY);
  const recentR = tapsR.slice(-TAP_HISTORY);
  const itvL = recentL.reduce((s, r) => s + r.itvMs, 0) / recentL.length;
  const itvR = recentR.reduce((s, r) => s + r.itvMs, 0) / recentR.length;
  if (itvL < 100 || itvR < 100) return 0;          // too fast (< ~10 BPM, ignore)
  if (itvL > 4000 || itvR > 4000) return 0;         // too slow (< 15 BPM, ignore)

  // Tempo similarity factor — penalise large tempo mismatch
  const ratio = Math.max(itvL, itvR) / Math.min(itvL, itvR);
  const tempoSim = ratio < 1.25 ? 1.0 : ratio < 2.0 ? Math.max(0, 2 - ratio) : 0;
  if (tempoSim <= 0) return 0;

  // Phase of L at each of L's recent tap times (relative to its own period)
  // and phase of R estimated at the same instant
  const nowL = recentL[recentL.length - 1].t;
  const nowR = recentR[recentR.length - 1].t;
  const refT  = Math.max(nowL, nowR);

  // For each side compute phase at refT: φ = 2π × ((refT - lastTap) mod ITV) / ITV
  const phL = (2 * Math.PI * ((refT - nowL) % itvL)) / itvL;
  const phR = (2 * Math.PI * ((refT - nowR) % itvR)) / itvR;

  // Phase diff over a sliding window of N samples from past taps
  let cosSum = 0; let sinSum = 0; let count = 0;
  const nL = recentL.length;
  const nR = recentR.length;
  const n  = Math.min(nL, nR);
  for (let k = 0; k < n; k++) {
    const tL  = recentL[nL - 1 - k].t;
    const tR  = recentR[nR - 1 - k].t;
    const dph = (2 * Math.PI * ((refT - tL) % itvL)) / itvL
              - (2 * Math.PI * ((refT - tR) % itvR)) / itvR;
    cosSum += Math.cos(dph);
    sinSum += Math.sin(dph);
    count++;
  }
  if (count === 0) return 0;
  const R = Math.sqrt((cosSum / count) ** 2 + (sinSum / count) ** 2);

  // Blend final phase alignment at refT too
  const rFinal = Math.cos(phL - phR) * 0.5 + 0.5;

  const raw = (R * 0.7 + rFinal * 0.3) * tempoSim;
  // Extra forgiveness: use a squashed curve so moderate sync still looks pretty
  return Math.min(1, Math.pow(raw, 0.65));
}

/** Spawn a tap ring */
function spawnRing(rings: Ring[], x: number, y: number, color: string, W: number) {
  rings.push({ x, y, r: 10, maxR: W * 0.18, alpha: 0.85, color });
}

/** Spawn a firefly at one end of the bridge */
function spawnFirefly(
  ff: Firefly[], sync: number,
  bridgeYL: number, bridgeYR: number,
  W: number, H: number,
  side: 0 | 1,
) {
  if (sync < 0.1) return;
  const count = Math.floor(sync * 3) + 1;
  for (let i = 0; i < count; i++) {
    const pos   = side === 0 ? 0 : 1;
    const t     = pos;
    const bridgeY = bridgeYL + (bridgeYR - bridgeYL) * t;
    const col   = side === 0
      ? hsl(COL_L.h, COL_L.s, COL_L.l + 20)
      : hsl(COL_R.h, COL_R.s, COL_R.l + 20);
    ff.push({
      pos,
      y: bridgeY + (Math.random() - 0.5) * H * 0.04,
      vy: (Math.random() - 0.5) * 0.8,
      speed: (0.002 + Math.random() * 0.008) * (side === 0 ? 1 : -1),
      size: 2 + Math.random() * 4 * sync,
      alpha: 0.5 + Math.random() * 0.5,
      col,
      side,
    });
  }
}

/** One pluck / bell sound via Web Audio */
function playPluck(
  actx: AudioContext,
  master: AudioNode,
  hz: number,
  gainVal: number,
) {
  const now = actx.currentTime;
  const osc  = actx.createOscillator();
  const env  = actx.createGain();
  // slight detune for a more "bell" quality
  const osc2 = actx.createOscillator();
  const env2 = actx.createGain();

  osc.type  = "triangle";
  osc2.type = "sine";
  osc.frequency.value  = hz;
  osc2.frequency.value = hz * 2.005;   // slight stretch inharmonicity

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gainVal, now + 0.010);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.90);

  env2.gain.setValueAtTime(0, now);
  env2.gain.linearRampToValueAtTime(gainVal * 0.35, now + 0.008);
  env2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc.connect(env);   env.connect(master);
  osc2.connect(env2); env2.connect(master);
  osc.start(now);   osc.stop(now + 0.95);
  osc2.start(now);  osc2.stop(now + 0.50);
}

/** Shimmer chord — plays when sync locks */
function playShimmer(actx: AudioContext, master: AudioNode) {
  const now = actx.currentTime;
  SHIMMER_FREQS.forEach((hz, i) => {
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    const delay = i * 0.05;
    env.gain.setValueAtTime(0, now + delay);
    env.gain.linearRampToValueAtTime(0.12, now + delay + 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, now + delay + 1.4);
    osc.connect(env); env.connect(master);
    osc.start(now + delay);
    osc.stop(now + delay + 1.5);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, sync: number) {
  // Two-sided gradient: gold left, teal right, blending toward center based on sync
  const grd = ctx.createLinearGradient(0, 0, W, 0);
  const lAlpha = 0.18 + sync * 0.08;
  const rAlpha = 0.18 + sync * 0.08;
  grd.addColorStop(0,    hsl(COL_L.h, COL_L.s, 10, 1));
  grd.addColorStop(0.38, hsl(COL_L.h, COL_L.s, 12, 1));
  grd.addColorStop(0.48, hsl(0, 0, 7, 1));
  grd.addColorStop(0.52, hsl(0, 0, 7, 1));
  grd.addColorStop(0.62, hsl(COL_R.h, COL_R.s, 10, 1));
  grd.addColorStop(1,    hsl(COL_R.h, COL_R.s, 12, 1));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Subtle centre glow when synced
  if (sync > 0.3) {
    const cx = W / 2;
    const cy = H / 2;
    const rad = Math.min(W, H) * (0.2 + sync * 0.35);
    const g2  = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const centreL = Math.round(sync * 22);
    g2.addColorStop(0,   hsl(55, 80, centreL, sync * 0.55));
    g2.addColorStop(0.5, hsl(55, 70, 10, sync * 0.18));
    g2.addColorStop(1,   hsl(55, 60, 5, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  // Divider line (centre seam)
  ctx.save();
  ctx.globalAlpha = 0.15 + (1 - sync) * 0.25;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Side half-glow from edges
  const glL = ctx.createLinearGradient(0, 0, W * 0.3, 0);
  glL.addColorStop(0, hsl(COL_L.h, COL_L.s, COL_L.l, lAlpha));
  glL.addColorStop(1, hsl(COL_L.h, COL_L.s, COL_L.l, 0));
  ctx.fillStyle = glL;
  ctx.fillRect(0, 0, W * 0.3, H);

  const glR = ctx.createLinearGradient(W, 0, W * 0.7, 0);
  glR.addColorStop(0, hsl(COL_R.h, COL_R.s, COL_R.l, rAlpha));
  glR.addColorStop(1, hsl(COL_R.h, COL_R.s, COL_R.l, 0));
  ctx.fillStyle = glR;
  ctx.fillRect(W * 0.7, 0, W * 0.3, H);
}

function drawRings(ctx: CanvasRenderingContext2D, rings: Ring[], dt: number) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.r     += dt * ring.maxR * 1.6;
    ring.alpha -= dt * 1.2;
    if (ring.alpha <= 0 || ring.r >= ring.maxR) { rings.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = ring.alpha;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth   = 2.5;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = ring.color;
    ctx.stroke();
    ctx.restore();
  }
}

function drawBridge(
  ctx: CanvasRenderingContext2D,
  sync: number,
  W: number, H: number,
  ts: number,
) {
  // Bridge is an arc from left-centre to right-centre with a slight upward bow
  const anchorLX = W * 0.08;
  const anchorRX = W * 0.92;
  const anchorY  = H * 0.50;
  const bowAmt   = -H * 0.06; // upward bow (negative = up)

  // Number of segments in the bridge arc
  const N = 40;

  if (sync < 0.02) return; // nothing to draw

  // Main bridge line — draw as bezier curve
  const cp1x = W * 0.35;
  const cp2x = W * 0.65;
  const cpY  = anchorY + bowAmt * (1 + sync * 0.5);

  // Glow layers: dim & broken at low sync, bright & continuous at high sync
  const breaks = sync < 0.6 ? Math.floor((1 - sync) * 6) : 0;
  const segW   = N / (breaks + 1);
  const lineW  = 1.5 + sync * 4;
  const glowB  = 4 + sync * 22;

  ctx.save();

  // Outer glow pass
  ctx.shadowBlur  = glowB * 1.8;
  ctx.shadowColor = hsl(50, 90, 70);
  ctx.lineWidth   = lineW + 2;
  ctx.globalAlpha = sync * 0.4;
  ctx.strokeStyle = hsl(50, 90, 85);

  for (let seg = 0; seg <= breaks; seg++) {
    const t0 = (seg * segW) / N;
    const t1 = Math.min(((seg + 1) * segW - 0.8) / N, 0.97);
    if (t0 >= t1) continue;
    ctx.beginPath();
    // Sample bezier points between t0 and t1
    for (let k = 0; k <= 12; k++) {
      const t  = t0 + (t1 - t0) * k / 12;
      const bx = sampleBezierX(anchorLX, cp1x, cp2x, anchorRX, t);
      const by = sampleBezierY(anchorY, cpY, cpY, anchorY, t);
      // add subtle wobble at low sync
      const wobble = (1 - sync) * 4 * Math.sin(t * Math.PI * 6 + ts * 0.003);
      if (k === 0) ctx.moveTo(bx, by + wobble);
      else         ctx.lineTo(bx, by + wobble);
    }
    ctx.stroke();
  }

  // Core line pass
  ctx.shadowBlur  = glowB;
  ctx.shadowColor = hsl(50, 90, 80);
  ctx.lineWidth   = lineW;
  ctx.globalAlpha = 0.3 + sync * 0.65;

  // Animated gradient along bridge
  const grad = ctx.createLinearGradient(anchorLX, 0, anchorRX, 0);
  grad.addColorStop(0,   hsl(COL_L.h, COL_L.s, 80));
  grad.addColorStop(0.5, hsl(50,      90,       95));
  grad.addColorStop(1,   hsl(COL_R.h, COL_R.s, 80));
  ctx.strokeStyle = grad;

  for (let seg = 0; seg <= breaks; seg++) {
    const t0 = (seg * segW) / N;
    const t1 = Math.min(((seg + 1) * segW - 0.8) / N, 0.97);
    if (t0 >= t1) continue;
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const t  = t0 + (t1 - t0) * k / 12;
      const bx = sampleBezierX(anchorLX, cp1x, cp2x, anchorRX, t);
      const by = sampleBezierY(anchorY, cpY, cpY, anchorY, t);
      const wobble = (1 - sync) * 4 * Math.sin(t * Math.PI * 6 + ts * 0.003);
      if (k === 0) ctx.moveTo(bx, by + wobble);
      else         ctx.lineTo(bx, by + wobble);
    }
    ctx.stroke();
  }

  ctx.restore();

  // Anchor orbs at each end
  drawAnchorOrb(ctx, anchorLX, anchorY, sync, COL_L.h, COL_L.s);
  drawAnchorOrb(ctx, anchorRX, anchorY, sync, COL_R.h, COL_R.s);
}

function drawAnchorOrb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  sync: number,
  h: number, s: number,
) {
  const r = 8 + sync * 14;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  grd.addColorStop(0,   hsl(h, s, 95, 0.9));
  grd.addColorStop(0.4, hsl(h, s, 70, 0.6 + sync * 0.3));
  grd.addColorStop(1,   hsl(h, s, 50, 0));
  ctx.save();
  ctx.shadowBlur  = 14 + sync * 20;
  ctx.shadowColor = hsl(h, s, 70);
  ctx.fillStyle   = grd;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFireflies(
  ctx: CanvasRenderingContext2D,
  ff: Firefly[],
  sync: number,
  W: number, H: number,
  dt: number,
  ts: number,
  bridgeY: number,
) {
  const anchorLX = W * 0.08;
  const anchorRX = W * 0.92;
  const cp1x = W * 0.35;
  const cp2x = W * 0.65;
  const cpY  = bridgeY - H * 0.06 * (1 + sync * 0.5);

  for (let i = ff.length - 1; i >= 0; i--) {
    const f = ff[i];
    // Move along bridge in its direction
    f.pos   += f.speed * (0.5 + sync * 1.5);
    f.y     += f.vy * dt;
    f.alpha -= dt * (0.18 + (1 - sync) * 0.55);

    // Remove if out of bounds or faded
    if (f.pos < 0 || f.pos > 1 || f.alpha <= 0) { ff.splice(i, 1); continue; }

    // Position on bezier curve
    const bx = sampleBezierX(anchorLX, cp1x, cp2x, anchorRX, f.pos);
    const by = sampleBezierY(bridgeY,   cpY,   cpY,   bridgeY, f.pos);

    const flicker = 0.7 + 0.3 * Math.sin(ts * 0.012 + i * 1.3);

    ctx.save();
    ctx.globalAlpha = f.alpha * flicker;
    ctx.shadowBlur  = f.size * 3;
    ctx.shadowColor = f.col;
    ctx.fillStyle   = f.col;
    ctx.beginPath();
    ctx.arc(bx, f.y === bridgeY ? by : f.y, f.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayerHint(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  sync: number,
  ts: number,
) {
  // Gentle pulsing hand-shape hint at the bottom of each half, fades when sync is high
  const alpha = Math.max(0, (1 - sync * 1.5)) * (0.35 + 0.12 * Math.sin(ts * 0.0015));
  if (alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font        = `${Math.max(40, H * 0.07)}px serif`;
  ctx.textAlign   = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle   = hsl(COL_L.h, 70, 80);
  ctx.fillText("✋", W * 0.25, H - H * 0.08);
  ctx.fillStyle   = hsl(COL_R.h, 70, 80);
  ctx.fillText("✋", W * 0.75, H - H * 0.08);
  ctx.restore();
}

function drawSyncLabel(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  sync: number,
  ts: number,
) {
  // "together!" label blooms in at centre when locked
  if (sync < SYNC_LOCK) return;
  const pulse = 0.85 + 0.15 * Math.sin(ts * 0.004);
  const alpha = (sync - SYNC_LOCK) / (1 - SYNC_LOCK) * pulse;
  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.font         = `bold ${Math.max(22, W * 0.048)}px serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur   = 18;
  ctx.shadowColor  = hsl(50, 90, 80);
  ctx.fillStyle    = hsl(50, 95, 92);
  ctx.fillText("together ✨", W / 2, H * 0.26);
  ctx.restore();
}

// Cubic bezier sampling helpers
function sampleBezierX(x0: number, x1: number, x2: number, x3: number, t: number) {
  const u = 1 - t;
  return u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3;
}
function sampleBezierY(y0: number, y1: number, y2: number, y3: number, t: number) {
  const u = 1 - t;
  return u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO SUBSYSTEM  (managed purely via refs, no hooks)
// ─────────────────────────────────────────────────────────────────────────────

interface AudioNodes {
  actx:    AudioContext;
  master:  GainNode;
  // ostinato oscillators
  oscL:    OscillatorNode;
  envL:    GainNode;
  oscR:    OscillatorNode;
  envR:    GainNode;
  // ambient pad (always on)
  padOscL: OscillatorNode;
  padOscR: OscillatorNode;
  padGain: GainNode;
  // lowpass filter
  lpf:     BiquadFilterNode;
  // compressor
  comp:    DynamicsCompressorNode;
}

function buildAudioGraph(): AudioNodes {
  const actx   = new AudioContext();
  const comp   = actx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value      = 10;
  comp.ratio.value     = 8;
  comp.attack.value    = 0.003;
  comp.release.value   = 0.15;

  const lpf = actx.createBiquadFilter();
  lpf.type            = "lowpass";
  lpf.frequency.value = 9000;
  lpf.Q.value         = 0.5;

  const master = actx.createGain();
  master.gain.value = 0.72;

  master.connect(lpf);
  lpf.connect(comp);
  comp.connect(actx.destination);

  // Ostinato L (tense pitch, fades up)
  const oscL = actx.createOscillator();
  const envL = actx.createGain();
  oscL.type = "triangle";
  oscL.frequency.value = L_FREQ_TENSE;
  envL.gain.value = 0.0;
  oscL.connect(envL); envL.connect(master);
  oscL.start();

  // Ostinato R
  const oscR = actx.createOscillator();
  const envR = actx.createGain();
  oscR.type = "triangle";
  oscR.frequency.value = R_FREQ_TENSE;
  envR.gain.value = 0.0;
  oscR.connect(envR); envR.connect(master);
  oscR.start();

  // Ambient pad: very soft sine drones C2 + G2
  const padOscL = actx.createOscillator();
  const padOscR = actx.createOscillator();
  const padGain = actx.createGain();
  padOscL.type = "sine"; padOscL.frequency.value = 65.41;  // C2
  padOscR.type = "sine"; padOscR.frequency.value = 98.0;   // G2
  padGain.gain.value = 0.022;
  padOscL.connect(padGain);
  padOscR.connect(padGain);
  padGain.connect(master);
  padOscL.start(); padOscR.start();

  return { actx, master, oscL, envL, oscR, envR, padOscL, padOscR, padGain, lpf, comp };
}

/** Update the continuous ostinato voice-leading based on current sync and tap activity */
function applyOstinatoSync(nodes: AudioNodes, sync: number, hasTaps: boolean) {
  const now = nodes.actx.currentTime;
  const tau  = 1.2; // smoothing time constant in seconds

  // Target frequencies: voice-lead from tense major-2nd to open fifth
  const freqL = L_FREQ_TENSE + (L_FREQ_RESOLVED - L_FREQ_TENSE) * sync;
  const freqR = R_FREQ_TENSE + (R_FREQ_RESOLVED - R_FREQ_TENSE) * sync;

  nodes.oscL.frequency.setTargetAtTime(freqL, now, tau);
  nodes.oscR.frequency.setTargetAtTime(freqR, now, tau);

  // Gain: swell in once both players have tapped at least twice
  const swellFactor = hasTaps ? 1 : 0;
  const targetGain  = swellFactor * (0.045 + sync * 0.07);
  nodes.envL.gain.setTargetAtTime(targetGain,        now, 1.5);
  nodes.envR.gain.setTargetAtTime(targetGain * 0.92, now, 1.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DEMO STEP
// ─────────────────────────────────────────────────────────────────────────────

/** Advance the auto-demo simulation. Returns tap events if a simulated tap fires.
 *  The demo arc: 0–8s apart, 8–16s locking, 16–20s locked, 20–26s drifting. */
function stepDemo(
  S: State,
  dt: number,
): { tapL: boolean; tapR: boolean } {
  S.demoT += dt;
  const t  = S.demoT % DEMO_CYCLE_S;

  // Desired tempo for each simulated player (BPM), modulated over time
  let bpmL: number;
  let bpmR: number;
  let phaseOffset: number; // desired phase lag of R vs L

  if (t < 8) {
    // Apart: different tempos, large phase offset
    bpmL = 72 + 8  * Math.sin(t * 0.4);
    bpmR = 88 - 12 * Math.cos(t * 0.3);
    phaseOffset = Math.PI * (0.6 + 0.3 * Math.sin(t * 0.7));
  } else if (t < 16) {
    // Converging: tempos approach 76 BPM, phase offset shrinks
    const frac = (t - 8) / 8;
    bpmL = 72  + (76 - 72)  * frac;
    bpmR = 88  + (76 - 88)  * frac;
    phaseOffset = Math.PI * (0.6 * (1 - frac) + 0.05 * frac);
  } else if (t < 20) {
    // Locked
    bpmL = 76; bpmR = 76; phaseOffset = 0.05;
  } else {
    // Drifting
    const frac = (t - 20) / 6;
    bpmL = 76 + frac * 10;
    bpmR = 76 - frac * 8;
    phaseOffset = Math.PI * 0.7 * frac;
  }

  const itvL = 60 / bpmL;
  const itvR = 60 / bpmR;

  const prevPhL = S.demoPhaseL;
  const prevPhR = S.demoPhaseR;

  S.demoPhaseL = (S.demoPhaseL + dt / itvL) % 1;
  S.demoPhaseR = (S.demoPhaseR + dt / itvR + phaseOffset / (2 * Math.PI)) % 1;

  const tapL = prevPhL > S.demoPhaseL; // phase wrapped → tap
  const tapR = prevPhR > S.demoPhaseR;

  return { tapL, tapR };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function KidsPulseBridge() {
  const [started, setStarted] = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const audioRef   = useRef<AudioNodes | null>(null);
  const stateRef   = useRef<State>({
    tapsL: [], tapsR: [],
    sync: 0, syncRaw: 0,
    shimmerT: 0,
    wasLocked: false,
    rings: [],
    fireflies: [],
    demoActive: true,
    demoT: 0,
    demoPhaseL: 0,
    demoPhaseR: 0.47,
    W: 0, H: 0,
    prevTs: 0,
  });

  // ── Start handler ──────────────────────────────────────────────────────────
  const handleStart = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const nodes = buildAudioGraph();
    // iOS unlock: resume must happen in gesture
    void nodes.actx.resume();
    audioRef.current = nodes;
    setStarted(true);
  }, []);

  // ── Main rAF loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    let rafId = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = stateRef.current;
      S.W = canvas.offsetWidth;
      S.H = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const S = stateRef.current;

    // ── Tap registrar ────────────────────────────────────────────────────────
    const registerTap = (side: "L" | "R", nowMs: number) => {
      const arr = side === "L" ? S.tapsL : S.tapsR;
      const itvMs = arr.length > 0 ? nowMs - arr[arr.length - 1].t : 600;
      // clamp to reasonable range
      const clamped = Math.max(200, Math.min(4000, itvMs));
      arr.push({ t: nowMs, itvMs: clamped });
      if (arr.length > TAP_HISTORY) arr.shift();
    };

    const doTapEffect = (side: "L" | "R", x: number, y: number) => {
      const nodes = audioRef.current;
      const { W, H, rings, fireflies, sync } = S;

      // Pluck sound
      if (nodes) {
        const hz = side === "L" ? L_PLUCK_HZ : R_PLUCK_HZ;
        playPluck(nodes.actx, nodes.master, hz, 0.16);
      }

      // Ring visual
      const col = side === "L"
        ? hsl(COL_L.h, COL_L.s, 65)
        : hsl(COL_R.h, COL_R.s, 65);
      spawnRing(rings, x, y, col, W);

      // Firefly toward bridge
      spawnFirefly(
        fireflies, sync,
        H * 0.50, H * 0.50,
        W, H,
        side === "L" ? 0 : 1,
      );
    };

    // ── Pointer events ───────────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      // Cancel demo on first real tap
      S.demoActive = false;

      const rect = canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const y    = e.clientY - rect.top;
      const side: "L" | "R" = x < S.W / 2 ? "L" : "R";

      const now = performance.now();
      registerTap(side, now);
      doTapEffect(side, x, y);

      // Recompute sync immediately
      S.syncRaw = computeSyncIndex(S.tapsL, S.tapsR);
    };

    const onPointerUp = (_e: PointerEvent) => {
      // pointer released — no per-pointer state to clean up
    };

    canvas.addEventListener("pointerdown",   onPointerDown, { passive: false });
    canvas.addEventListener("pointerup",     onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    // ── rAF frame ────────────────────────────────────────────────────────────
    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);

      const dtRaw = S.prevTs === 0 ? 16 : ts - S.prevTs;
      S.prevTs    = ts;
      const dt    = Math.min(dtRaw, 80) * 0.001; // seconds, clamped

      const { W, H } = S;

      // ── Demo simulation ──────────────────────────────────────────────────
      if (S.demoActive) {
        const { tapL, tapR } = stepDemo(S, dt);
        const now = performance.now();
        if (tapL) {
          registerTap("L", now);
          const x = W * (0.15 + 0.2 * Math.random());
          const y = H * (0.3 + 0.4 * Math.random());
          doTapEffect("L", x, y);
        }
        if (tapR) {
          registerTap("R", now);
          const x = W * (0.65 + 0.2 * Math.random());
          const y = H * (0.3 + 0.4 * Math.random());
          doTapEffect("R", x, y);
        }
        S.syncRaw = computeSyncIndex(S.tapsL, S.tapsR);
      }

      // ── Smooth sync scalar ───────────────────────────────────────────────
      const syncTarget = S.syncRaw;
      const tauUp   = 1.8;  // slow rise (takes real sustained sync to get there)
      const tauDown = 3.2;  // even slower fall (doesn't drop instantly)
      const alphaDt = dt / (dt + (syncTarget > S.sync ? tauUp : tauDown));
      S.sync = S.sync + alphaDt * (syncTarget - S.sync);

      const sync = S.sync;

      // ── Audio voice-leading ──────────────────────────────────────────────
      const nodes   = audioRef.current;
      const hasTaps = S.tapsL.length >= 2 && S.tapsR.length >= 2;
      if (nodes) {
        applyOstinatoSync(nodes, sync, hasTaps);
      }

      // ── Shimmer trigger ──────────────────────────────────────────────────
      const isLocked = sync >= SYNC_LOCK;
      if (isLocked && !S.wasLocked && nodes) {
        playShimmer(nodes.actx, nodes.master);
        S.shimmerT = 1.2;
      }
      S.wasLocked = isLocked;
      S.shimmerT  = Math.max(0, S.shimmerT - dt);

      // ── Firefly spawning (continuous trickle when synced) ────────────────
      if (sync > 0.25 && Math.random() < dt * (1 + sync * 4)) {
        const side: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        spawnFirefly(S.fireflies, sync, H * 0.5, H * 0.5, W, H, side);
      }

      // ── DRAW ─────────────────────────────────────────────────────────────
      if (!ctx) {
        // Canvas2D unavailable — still keep audio running
        return;
      }

      drawBackground(ctx, W, H, sync);
      drawBridge(ctx, sync, W, H, ts);
      drawFireflies(ctx, S.fireflies, sync, W, H, dt, ts, H * 0.5);
      drawRings(ctx, S.rings, dt);
      // Arrival bloom flash at lock
      if (S.shimmerT > 0) {
        const bAlpha = (S.shimmerT / 1.2) * 0.55;
        const bRad   = Math.min(W, H) * (0.25 + (1 - S.shimmerT / 1.2) * 0.45);
        const bg     = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, bRad);
        bg.addColorStop(0,   `rgba(255,240,160,${bAlpha})`);
        bg.addColorStop(0.5, `rgba(255,220,80,${bAlpha * 0.4})`);
        bg.addColorStop(1,   "rgba(255,200,0,0)");
        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      drawPlayerHint(ctx, W, H, sync, ts);
      drawSyncLabel(ctx, W, H, sync, ts);

      // Demo label
      if (S.demoActive) {
        ctx.save();
        ctx.globalAlpha  = 0.45;
        ctx.font         = `${Math.max(14, W * 0.028)}px monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle    = "#ffffff";
        ctx.fillText("tap to play — demo running", W / 2, 14);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown",   onPointerDown);
      canvas.removeEventListener("pointerup",     onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      audioRef.current?.actx.close().catch(() => undefined);
    };
  }, [started]);

  // ── Canvas unavailable notice ──────────────────────────────────────────────
  const [noCanvas, setNoCanvas] = useState(false);
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) setNoCanvas(true);
  }, [started]);

  // ─── Start screen ──────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen text-foreground gap-6 px-6 text-center select-none"
        style={{ background: "linear-gradient(135deg, #1a0e02 0%, #050a0a 50%, #021212 100%)" }}
      >
        {/* Title area */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full"
            style={{ background: hsl(COL_L.h, COL_L.s, 50, 0.9), boxShadow: `0 0 18px ${hsl(COL_L.h, COL_L.s, 50)}` }}
            aria-hidden="true"
          />
          <h1 className="text-3xl font-serif text-foreground">Pulse Bridge</h1>
          <div
            className="w-10 h-10 rounded-full"
            style={{ background: hsl(COL_R.h, COL_R.s, 44, 0.9), boxShadow: `0 0 18px ${hsl(COL_R.h, COL_R.s, 44)}` }}
            aria-hidden="true"
          />
        </div>

        {/* Bridge illustration */}
        <svg
          width="260" height="80"
          viewBox="0 0 260 80"
          className="opacity-70"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="bridgeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={hsl(COL_L.h, COL_L.s, 65)} />
              <stop offset="50%"  stopColor="#fff8d0" />
              <stop offset="100%" stopColor={hsl(COL_R.h, COL_R.s, 65)} />
            </linearGradient>
          </defs>
          <path
            d="M 20 50 C 80 20, 180 20, 240 50"
            fill="none"
            stroke="url(#bridgeGrad)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="20"  cy="50" r="8" fill={hsl(COL_L.h, COL_L.s, 55, 0.9)} />
          <circle cx="240" cy="50" r="8" fill={hsl(COL_R.h, COL_R.s, 50, 0.9)} />
          {/* Fireflies */}
          {[0.2, 0.4, 0.6, 0.8].map((t, i) => {
            const bx = 20 + (260-40) * t;
            const by = 50 - 30 * Math.sin(Math.PI * t);
            return (
              <circle
                key={i}
                cx={bx} cy={by} r="3"
                fill="#fffde0"
                opacity={0.5 + 0.4 * Math.sin(i * 1.4)}
              />
            );
          })}
        </svg>

        <p className="text-base text-muted-foreground max-w-xs leading-relaxed">
          Two children, one screen. Each side is yours.
          Tap your side to the same steady beat
          — and light a bridge between you.
        </p>

        <button
          onPointerDown={handleStart}
          className="min-h-[64px] min-w-[260px] rounded-2xl px-8 py-4 text-foreground text-xl font-semibold transition-colors"
          style={{
            background: `linear-gradient(90deg, ${hsl(COL_L.h, COL_L.s, 30, 0.8)}, ${hsl(COL_R.h, COL_R.s, 25, 0.8)})`,
            border: `1.5px solid ${hsl(50, 60, 60, 0.4)}`,
            boxShadow: "0 0 24px rgba(255,220,100,0.15)",
          }}
        >
          Play together ✨
        </button>

        <p className="text-sm text-muted-foreground">
          no mic · no camera · for kids 4+
        </p>
      </div>
    );
  }

  // ─── Active screen ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#050a0a" }}>
      {noCanvas ? (
        <p className="text-violet-300 text-base p-6 text-center">
          Canvas is unavailable in this browser — audio is still running.
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ display: "block", cursor: "none" }}
      />
    </div>
  );
}
