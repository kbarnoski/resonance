"use client";

// Flock — "What does a flock SOUND like when it agrees?"
//
// A WebGPU compute-shader boids simulation (Craig Reynolds, 1987) whose
// emergent global order — the mean velocity-alignment of a few thousand
// agents — drives a spatial choir. High alignment locks the voices into a
// consonant just-intonation chord; low alignment spreads their detune into
// beating dissonance. Drop an attractor to gather the flock, a predator to
// scatter it, and hear it cohere or panic.
//
// GPU path: a WGSL @compute shader applies separation / alignment / cohesion
// to a storage buffer each frame; positions are read back and drawn in
// Canvas2D. CPU path (mandatory fallback): the same three rules in a JS loop.
// The audio and interaction are identical on both paths.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";

// ─────────────────────────────────────────────────────────────────────────────
// Shared model
// ─────────────────────────────────────────────────────────────────────────────

interface FlockStats {
  /** Flock centroid in normalized [0,1] space. */
  cx: number;
  cy: number;
  /** Mean distance from centroid (spatial spread), ~0..0.6. */
  spread: number;
  /** Mean speed magnitude. */
  speed: number;
  /** Order parameter: |mean(v̂)| in [0,1]. 1 = every bird agrees on a heading. */
  order: number;
}

interface Control {
  x: number;
  y: number;
  /** > 0 = attractor pull, < 0 = predator repel, 0 = idle. */
  signedStrength: number;
  /** Predator influence radius (normalized). */
  radius: number;
}

interface FlockSim {
  readonly kind: "gpu" | "cpu";
  readonly count: number;
  /** px, py, vx, vy interleaved, length count*4. Refreshed after each frame. */
  readonly packed: Float32Array;
  stats: FlockStats;
  setControl(c: Control): void;
  frame(dt: number): Promise<void> | void;
  destroy(): void;
}

// Rule weights, shared by both substrates so the flock feels identical.
const RULES = {
  cohesion: 0.02,
  alignment: 0.05,
  separation: 0.06,
  separationDist: 0.022,
  neighborDist: 0.08,
  maxSpeed: 0.0045,
  attract: 0.0022,
  predator: 0.02,
  drift: 0.0002,
};

const GPU_COUNT = 2600;
const CPU_COUNT = 720;

// ─────────────────────────────────────────────────────────────────────────────
// WGSL compute shader — the point of the piece
// ─────────────────────────────────────────────────────────────────────────────

const BOIDS_WGSL = /* wgsl */ `
struct Agent { pos : vec2f, vel : vec2f };

struct Params {
  count        : f32,
  dt           : f32,
  cohesion     : f32,
  alignment    : f32,
  separation   : f32,
  sepDist      : f32,
  neighborDist : f32,
  maxSpeed     : f32,
  attractor    : vec2f,
  strength     : f32,   // >0 pull, <0 predator repel
  radius       : f32,   // predator influence radius
  drift        : f32,
};

@group(0) @binding(0) var<storage, read>       inAgents  : array<Agent>;
@group(0) @binding(1) var<storage, read_write> outAgents : array<Agent>;
@group(0) @binding(2) var<uniform>             p         : Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  let n = u32(p.count);
  if (i >= n) { return; }

  var pos = inAgents[i].pos;
  var vel = inAgents[i].vel;

  var coh = vec2f(0.0);
  var ali = vec2f(0.0);
  var sep = vec2f(0.0);
  var neighbors = 0.0;

  let nd2 = p.neighborDist * p.neighborDist;
  let sd2 = p.sepDist * p.sepDist;

  // O(n^2) neighbour sweep — cheap on the GPU across a few thousand agents.
  for (var j : u32 = 0u; j < n; j = j + 1u) {
    if (j == i) { continue; }
    let o = inAgents[j];
    let d = o.pos - pos;
    let d2 = dot(d, d);
    if (d2 > nd2) { continue; }
    coh += o.pos;
    ali += o.vel;
    if (d2 < sd2 && d2 > 1e-9) {
      sep -= d / sqrt(d2);
    }
    neighbors += 1.0;
  }

  if (neighbors > 0.0) {
    vel += ((coh / neighbors) - pos) * p.cohesion;
    vel += ((ali / neighbors) - vel) * p.alignment;
    vel += sep * p.separation;
  }

  // Attractor / predator.
  let toA = p.attractor - pos;
  let distA = length(toA) + 1e-6;
  if (p.strength > 0.0) {
    vel += (toA / distA) * p.strength;
  } else if (p.strength < 0.0 && distA < p.radius) {
    vel -= (toA / distA) * (-p.strength) * (1.0 - distA / p.radius);
  }

  // Gentle idle swirl so the flock never freezes.
  vel += vec2f(-(pos.y - 0.5), pos.x - 0.5) * p.drift;

  // Clamp speed.
  let sp = length(vel);
  if (sp > p.maxSpeed) { vel = vel / sp * p.maxSpeed; }

  pos += vel;

  // Soft wrap keeps the flock on the field.
  if (pos.x < 0.0) { pos.x += 1.0; } else if (pos.x > 1.0) { pos.x -= 1.0; }
  if (pos.y < 0.0) { pos.y += 1.0; } else if (pos.y > 1.0) { pos.y -= 1.0; }

  outAgents[i] = Agent(pos, vel);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// GPU flock
// ─────────────────────────────────────────────────────────────────────────────

async function initGpuFlock(count: number): Promise<FlockSim> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("no navigator.gpu");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no adapter");
  const device = await adapter.requestDevice();

  const AGENT_STRIDE = 4; // px, py, vx, vy
  const byteLen = count * AGENT_STRIDE * 4;

  // Seed a soft disc.
  const seed = new Float32Array(count * AGENT_STRIDE);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.26;
    const sp = RULES.maxSpeed * (0.3 + Math.random() * 0.7);
    const va = Math.random() * Math.PI * 2;
    seed[i * 4 + 0] = 0.5 + Math.cos(a) * r;
    seed[i * 4 + 1] = 0.5 + Math.sin(a) * r;
    seed[i * 4 + 2] = Math.cos(va) * sp;
    seed[i * 4 + 3] = Math.sin(va) * sp;
  }

  const bufUsage =
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const bufA = device.createBuffer({ size: byteLen, usage: bufUsage });
  const bufB = device.createBuffer({ size: byteLen, usage: bufUsage });
  device.queue.writeBuffer(bufA, 0, seed);

  const paramArr = new Float32Array(16);
  const paramBuf = device.createBuffer({
    size: paramArr.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const staging = device.createBuffer({
    size: byteLen,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const shader = device.createShaderModule({ code: BOIDS_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shader, entryPoint: "main" },
  });

  const bindAB = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: bufA } },
      { binding: 1, resource: { buffer: bufB } },
      { binding: 2, resource: { buffer: paramBuf } },
    ],
  });
  const bindBA = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: bufB } },
      { binding: 1, resource: { buffer: bufA } },
      { binding: 2, resource: { buffer: paramBuf } },
    ],
  });

  const packed = new Float32Array(count * AGENT_STRIDE);
  let control: Control = { x: 0.5, y: 0.5, signedStrength: 0, radius: 0.2 };
  let flip = false;
  let destroyed = false;
  const stats: FlockStats = { cx: 0.5, cy: 0.5, spread: 0.2, speed: 0, order: 0 };

  const dispatches = Math.ceil(count / 64);

  const sim: FlockSim = {
    kind: "gpu",
    count,
    packed,
    stats,
    setControl(c) {
      control = c;
    },
    async frame(dt) {
      if (destroyed) return;
      // Fixed-ish step scaled by frame time for stability.
      const scale = Math.min(2.2, Math.max(0.4, dt * 60));
      paramArr[0] = count;
      paramArr[1] = dt;
      paramArr[2] = RULES.cohesion * scale;
      paramArr[3] = RULES.alignment * scale;
      paramArr[4] = RULES.separation * scale;
      paramArr[5] = RULES.separationDist;
      paramArr[6] = RULES.neighborDist;
      paramArr[7] = RULES.maxSpeed * scale;
      paramArr[8] = control.x;
      paramArr[9] = control.y;
      paramArr[10] =
        control.signedStrength *
        (control.signedStrength > 0 ? RULES.attract : RULES.predator) *
        scale;
      paramArr[11] = control.radius;
      paramArr[12] = RULES.drift * scale;
      device.queue.writeBuffer(paramBuf, 0, paramArr);

      const outBuf = flip ? bufA : bufB;
      const bind = flip ? bindBA : bindAB;

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(dispatches);
      pass.end();
      enc.copyBufferToBuffer(outBuf, 0, staging, 0, byteLen);
      device.queue.submit([enc.finish()]);
      flip = !flip;

      await staging.mapAsync(GPUMapMode.READ);
      if (destroyed) {
        try {
          staging.unmap();
        } catch {
          /* device gone */
        }
        return;
      }
      packed.set(new Float32Array(staging.getMappedRange()));
      staging.unmap();

      computeStats(packed, count, stats);
    },
    destroy() {
      destroyed = true;
      try {
        bufA.destroy();
        bufB.destroy();
        paramBuf.destroy();
        staging.destroy();
        device.destroy();
      } catch {
        /* already gone */
      }
    },
  };

  return sim;
}

// ─────────────────────────────────────────────────────────────────────────────
// CPU flock (mandatory fallback) — same three rules, O(n²), Canvas2D-ready
// ─────────────────────────────────────────────────────────────────────────────

function makeCpuFlock(count: number): FlockSim {
  const packed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.26;
    const sp = RULES.maxSpeed * (0.3 + Math.random() * 0.7);
    const va = Math.random() * Math.PI * 2;
    packed[i * 4 + 0] = 0.5 + Math.cos(a) * r;
    packed[i * 4 + 1] = 0.5 + Math.sin(a) * r;
    packed[i * 4 + 2] = Math.cos(va) * sp;
    packed[i * 4 + 3] = Math.sin(va) * sp;
  }

  let control: Control = { x: 0.5, y: 0.5, signedStrength: 0, radius: 0.2 };
  const stats: FlockStats = { cx: 0.5, cy: 0.5, spread: 0.2, speed: 0, order: 0 };
  const nd2 = RULES.neighborDist * RULES.neighborDist;
  const sd2 = RULES.separationDist * RULES.separationDist;

  const sim: FlockSim = {
    kind: "cpu",
    count,
    packed,
    stats,
    setControl(c) {
      control = c;
    },
    frame(dt) {
      const scale = Math.min(2.2, Math.max(0.4, dt * 60));
      for (let i = 0; i < count; i++) {
        const xi = packed[i * 4 + 0];
        const yi = packed[i * 4 + 1];
        let vx = packed[i * 4 + 2];
        let vy = packed[i * 4 + 3];
        let cohX = 0,
          cohY = 0,
          aliX = 0,
          aliY = 0,
          sepX = 0,
          sepY = 0,
          ncount = 0;

        for (let j = 0; j < count; j++) {
          if (j === i) continue;
          const dx = packed[j * 4 + 0] - xi;
          const dy = packed[j * 4 + 1] - yi;
          const d2 = dx * dx + dy * dy;
          if (d2 > nd2) continue;
          cohX += packed[j * 4 + 0];
          cohY += packed[j * 4 + 1];
          aliX += packed[j * 4 + 2];
          aliY += packed[j * 4 + 3];
          if (d2 < sd2 && d2 > 1e-9) {
            const inv = 1 / Math.sqrt(d2);
            sepX -= dx * inv;
            sepY -= dy * inv;
          }
          ncount++;
        }

        if (ncount > 0) {
          vx += (cohX / ncount - xi) * RULES.cohesion * scale;
          vy += (cohY / ncount - yi) * RULES.cohesion * scale;
          vx += (aliX / ncount - vx) * RULES.alignment * scale;
          vy += (aliY / ncount - vy) * RULES.alignment * scale;
          vx += sepX * RULES.separation * scale;
          vy += sepY * RULES.separation * scale;
        }

        const toX = control.x - xi;
        const toY = control.y - yi;
        const distA = Math.hypot(toX, toY) + 1e-6;
        if (control.signedStrength > 0) {
          const f = (control.signedStrength * RULES.attract * scale) / distA;
          vx += toX * f;
          vy += toY * f;
        } else if (control.signedStrength < 0 && distA < control.radius) {
          const f =
            (-control.signedStrength *
              RULES.predator *
              scale *
              (1 - distA / control.radius)) /
            distA;
          vx -= toX * f;
          vy -= toY * f;
        }

        vx += -(yi - 0.5) * RULES.drift * scale;
        vy += (xi - 0.5) * RULES.drift * scale;

        const sp = Math.hypot(vx, vy);
        const maxS = RULES.maxSpeed * scale;
        if (sp > maxS) {
          const f = maxS / sp;
          vx *= f;
          vy *= f;
        }

        let nx = xi + vx;
        let ny = yi + vy;
        if (nx < 0) nx += 1;
        else if (nx > 1) nx -= 1;
        if (ny < 0) ny += 1;
        else if (ny > 1) ny -= 1;

        packed[i * 4 + 0] = nx;
        packed[i * 4 + 1] = ny;
        packed[i * 4 + 2] = vx;
        packed[i * 4 + 3] = vy;
      }
      computeStats(packed, count, stats);
    },
    destroy() {
      /* nothing to release */
    },
  };

  return sim;
}

// Order parameter + centroid + spread from the packed buffer.
function computeStats(packed: Float32Array, count: number, out: FlockStats) {
  let cx = 0,
    cy = 0,
    hx = 0,
    hy = 0,
    speed = 0;
  for (let i = 0; i < count; i++) {
    const x = packed[i * 4 + 0];
    const y = packed[i * 4 + 1];
    const vx = packed[i * 4 + 2];
    const vy = packed[i * 4 + 3];
    cx += x;
    cy += y;
    const s = Math.hypot(vx, vy);
    speed += s;
    if (s > 1e-9) {
      hx += vx / s;
      hy += vy / s;
    }
  }
  cx /= count;
  cy /= count;
  let spread = 0;
  for (let i = 0; i < count; i++) {
    spread += Math.hypot(packed[i * 4 + 0] - cx, packed[i * 4 + 1] - cy);
  }
  out.cx = cx;
  out.cy = cy;
  out.spread = spread / count;
  out.speed = speed / count;
  out.order = Math.hypot(hx, hy) / count; // |mean(v̂)|
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas2D rendering — shared by both substrates
// ─────────────────────────────────────────────────────────────────────────────

// Violet ramp buckets (deep → light) as rgb triples for additive motes.
const MOTE_RAMP: [number, number, number][] = [
  hexRgb(INDIGO),
  hexRgb(VIOLET[600]),
  hexRgb(VIOLET[500]),
  hexRgb(VIOLET[400]),
  hexRgb(VIOLET[300]),
];

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function drawFlock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: FlockSim,
  control: Control,
) {
  const { packed, count, stats } = sim;

  // Trailing fade for motion smear.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(6,4,14,0.34)";
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";
  const buckets = MOTE_RAMP.length;
  // Brighter, more saturated toward the light end as the flock agrees.
  const alpha = 0.28 + stats.order * 0.4;
  const maxSpeed = RULES.maxSpeed;

  for (let b = 0; b < buckets; b++) {
    const [r, g, bl] = MOTE_RAMP[b];
    ctx.fillStyle = `rgba(${r},${g},${bl},${alpha.toFixed(3)})`;
    for (let i = 0; i < count; i++) {
      const s = Math.hypot(packed[i * 4 + 2], packed[i * 4 + 3]) / maxSpeed;
      // Bucket by speed blended with global order so the whole flock warms
      // toward the light violet when it locks onto a heading.
      const t = Math.min(0.999, 0.35 * s + 0.65 * stats.order);
      if (Math.floor(t * buckets) !== b) continue;
      const px = packed[i * 4 + 0] * w;
      const py = packed[i * 4 + 1] * h;
      ctx.fillRect(px - 1, py - 1, 2.4, 2.4);
    }
  }

  // Attractor / predator marker.
  if (control.signedStrength !== 0) {
    const mx = control.x * w;
    const my = control.y * h;
    ctx.globalCompositeOperation = "lighter";
    if (control.signedStrength > 0) {
      ctx.strokeStyle = `rgba(${MOTE_RAMP[4].join(",")},0.8)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const [pr, pg, pb] = hexRgb(MAGENTA);
      ctx.strokeStyle = `rgba(${pr},${pg},${pb},0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - 9, my - 9);
      ctx.lineTo(mx + 9, my + 9);
      ctx.moveTo(mx + 9, my - 9);
      ctx.lineTo(mx - 9, my + 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, control.radius * Math.min(w, h) * 0.5, 0, Math.PI * 2);
      ctx.globalAlpha = 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.globalCompositeOperation = "source-over";
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio — the choir the order parameter tunes
// ─────────────────────────────────────────────────────────────────────────────

// Just-intonation stack over a root: unison, maj3, fifth, octave, and their
// octave copies. Beatless when locked; per-voice detune spreads with (1-order).
const CHORD_RATIOS = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4];
const ROOT_HZ = 110; // A2

interface AudioHandle {
  update(stats: FlockStats): void;
  event(kind: "gather" | "panic"): void;
  destroy(): void;
}

function buildAudio(ctx: AudioContext): AudioHandle {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.5, now + 2.2);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, now);
  filter.Q.setValueAtTime(0.7, now);
  filter.connect(master);
  master.connect(ctx.destination);

  // Sub drone for body.
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(ROOT_HZ / 2, now);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.12, now);
  sub.connect(subGain).connect(filter);
  sub.start();

  const voices = CHORD_RATIOS.map((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(ROOT_HZ * ratio, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 / CHORD_RATIOS.length, now);
    const pan = ctx.createStereoPanner();
    osc.connect(gain).connect(pan).connect(filter);
    osc.start();
    return { osc, gain, pan, ratio, sign: i % 2 === 0 ? 1 : -1, index: i };
  });

  let destroyed = false;

  return {
    update(stats) {
      if (destroyed) return;
      const t = ctx.currentTime;
      const order = stats.order;
      // Detune spread: 0 cents when locked, up to ~55 cents + a clashing
      // ~90-cent shove on some voices when fully scattered.
      const spreadCents = (1 - order) * 55;
      const clash = (1 - order) * (1 - order) * 90;
      for (const v of voices) {
        const base = ROOT_HZ * v.ratio;
        v.osc.frequency.setTargetAtTime(base, t, 0.2);
        const detune =
          v.sign * spreadCents * (0.4 + v.index / voices.length) +
          (v.index % 3 === 1 ? clash : 0);
        v.osc.detune.setTargetAtTime(detune, t, 0.25);
        // Spatial pan: centroid places the choir, spread widens it.
        const basePan = (stats.cx - 0.5) * 1.2;
        const wide = ((v.index - 3) / 3) * Math.min(1, stats.spread * 3);
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, basePan + wide)), t, 0.2);
        // Voices thin out slightly when scattered, swell when locked.
        v.gain.gain.setTargetAtTime(
          (0.35 + order * 0.65) * (0.5 / voices.length),
          t,
          0.2,
        );
      }
      // Brightness follows agreement; spread opens it a touch.
      const cutoff = 650 + order * 2500 + Math.min(1, stats.spread * 3) * 500;
      filter.frequency.setTargetAtTime(cutoff, t, 0.25);
    },
    event(kind) {
      if (destroyed) return;
      const t = ctx.currentTime;
      if (kind === "gather") {
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(0.62, t, 0.15);
        master.gain.setTargetAtTime(0.5, t + 0.8, 0.6);
      } else {
        // Predator stab: a short filtered noise burst + a duck.
        const dur = 0.5;
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const nf = ctx.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.setValueAtTime(1400, t);
        src.connect(nf).connect(ng).connect(master);
        src.start(t);
        src.stop(t + dur);
        master.gain.setTargetAtTime(0.32, t, 0.08);
        master.gain.setTargetAtTime(0.5, t + 0.6, 0.5);
      }
    },
    destroy() {
      destroyed = true;
      try {
        sub.stop();
        for (const v of voices) v.osc.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic idle autopilot — gather → lock → scatter → reform, on loop
// ─────────────────────────────────────────────────────────────────────────────

const AUTOPILOT_CYCLE = 20; // seconds

function autopilotControl(t: number): { control: Control; gatherPulse: boolean; panicPulse: boolean } {
  const phase = t % AUTOPILOT_CYCLE;
  // 0–7s   gather: attractor drifts to a slow orbit, flock coheres & locks
  // 7–11s  hold:   attractor near centre, chord locks (order high)
  // 11–15s scatter: predator sweeps across, flock panics (order drops)
  // 15–20s reform: release, flock drifts back and re-coheres
  if (phase < 7) {
    const a = phase * 0.7;
    return {
      control: {
        x: 0.5 + Math.cos(a) * 0.18,
        y: 0.5 + Math.sin(a * 0.8) * 0.16,
        signedStrength: 1,
        radius: 0.2,
      },
      gatherPulse: phase < 0.1,
      panicPulse: false,
    };
  }
  if (phase < 11) {
    return {
      control: { x: 0.5, y: 0.48, signedStrength: 1, radius: 0.2 },
      gatherPulse: false,
      panicPulse: false,
    };
  }
  if (phase < 15) {
    const s = (phase - 11) / 4; // 0..1 sweep
    return {
      control: {
        x: 0.15 + s * 0.7,
        y: 0.4 + Math.sin(s * Math.PI) * 0.2,
        signedStrength: -1,
        radius: 0.34,
      },
      gatherPulse: false,
      panicPulse: phase < 11.1,
    };
  }
  return {
    control: { x: 0.5, y: 0.5, signedStrength: 0, radius: 0.2 },
    gatherPulse: false,
    panicPulse: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "intro" | "running";

const README_NOTES = [
  'One question: "What does a flock sound like when it agrees?"',
  "A WebGPU @compute shader runs Craig Reynolds' 1987 boids — separation, alignment, cohesion — across a few thousand agents in a storage buffer.",
  "Each frame we read back positions and measure the ORDER PARAMETER: the magnitude of the mean normalized velocity (0 = chaos, 1 = one shared heading).",
  "Order drives consonance: near 1 the seven voices lock to a just-intonation chord (beatless); near 0 their detune spreads into beating dissonance.",
  "The flock's centroid pans the choir; its spread widens it. Attractor = gather, predator = scatter — you hear it cohere or panic.",
  "No WebGPU? A CPU boids fallback (same three rules) runs automatically. The badge shows which path is live.",
];

export default function FlockPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [path, setPath] = useState<"gpu" | "cpu" | null>(null);
  const [predatorArmed, setPredatorArmed] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ order: 0, spread: 0, autopilot: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<FlockSim | null>(null);
  const audioRef = useRef<AudioHandle | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastPointerRef = useRef(0);
  const predatorArmedRef = useRef(false);
  const controlRef = useRef<Control>({ x: 0.5, y: 0.5, signedStrength: 0, radius: 0.2 });
  const strengthDecayRef = useRef(0);
  const hudTickRef = useRef(0);
  const audioTickRef = useRef(0);
  const startClockRef = useRef(0);
  const lastEventRef = useRef({ gather: false, panic: false });

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 480;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#06040e";
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  // Pointer → live control (attractor or predator depending on armed mode).
  const applyPointer = useCallback((clientX: number, clientY: number, down: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    lastPointerRef.current = performance.now();
    const predator = predatorArmedRef.current;
    controlRef.current = {
      x,
      y,
      signedStrength: predator ? -1 : 1,
      radius: predator ? 0.34 : 0.2,
    };
    strengthDecayRef.current = down ? 1.6 : 0.9;
    if (down) {
      audioRef.current?.event(predator ? "panic" : "gather");
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => applyPointer(e.clientX, e.clientY, true),
    [applyPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons > 0 || e.pointerType === "touch") {
        applyPointer(e.clientX, e.clientY, false);
      }
    },
    [applyPointer],
  );

  const loop = useCallback((now: number) => {
    if (!runningRef.current) return;
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const dt = lastTimeRef.current ? Math.min(0.05, (now - lastTimeRef.current) / 1000) : 0.016;
    lastTimeRef.current = now;

    // Idle autopilot after ~4s of no pointer input.
    const idle = now - lastPointerRef.current > 4000;
    if (idle) {
      const t = (now - startClockRef.current) / 1000;
      const ap = autopilotControl(t);
      controlRef.current = ap.control;
      strengthDecayRef.current = 1;
      if (ap.gatherPulse && !lastEventRef.current.gather) {
        audioRef.current?.event("gather");
      }
      if (ap.panicPulse && !lastEventRef.current.panic) {
        audioRef.current?.event("panic");
      }
      lastEventRef.current = { gather: ap.gatherPulse, panic: ap.panicPulse };
    } else {
      // Decay pointer influence so a tap is a pulse, not a permanent magnet.
      strengthDecayRef.current *= 0.94;
      controlRef.current = {
        ...controlRef.current,
        signedStrength:
          Math.sign(controlRef.current.signedStrength) *
          Math.max(0, strengthDecayRef.current),
      };
      lastEventRef.current = { gather: false, panic: false };
    }

    sim.setControl(controlRef.current);

    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 480;
    const ctx = canvas.getContext("2d");

    const finish = () => {
      if (ctx) drawFlock(ctx, w, h, sim, controlRef.current);
      // Audio + HUD throttling.
      if (now - audioTickRef.current > 45) {
        audioTickRef.current = now;
        audioRef.current?.update(sim.stats);
      }
      if (now - hudTickRef.current > 120) {
        hudTickRef.current = now;
        setHud({ order: sim.stats.order, spread: sim.stats.spread, autopilot: idle });
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    const maybe = sim.frame(dt);
    if (maybe && typeof (maybe as Promise<void>).then === "function") {
      (maybe as Promise<void>).then(finish).catch(finish);
    } else {
      finish();
    }
  }, []);

  const release = useCallback(async () => {
    setPhase("running");
    sizeCanvas();

    // Audio first (needs the user gesture we're inside of).
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      audioCtxRef.current = ctx;
      audioRef.current = buildAudio(ctx);
    } catch {
      setAudioError("Audio unavailable — the flock still flies in silence.");
    }

    // GPU with automatic CPU fallback.
    let sim: FlockSim;
    try {
      sim = await initGpuFlock(GPU_COUNT);
    } catch {
      sim = makeCpuFlock(CPU_COUNT);
    }
    simRef.current = sim;
    setPath(sim.kind);

    startClockRef.current = performance.now();
    lastPointerRef.current = performance.now() - 4000; // start in autopilot
    lastTimeRef.current = 0;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, sizeCanvas]);

  useEffect(() => {
    predatorArmedRef.current = predatorArmed;
  }, [predatorArmed]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      simRef.current?.destroy();
      audioRef.current?.destroy();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background text-foreground">
      {/* Canvas field */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: phase === "running" ? "crosshair" : "default" }}
      />

      {/* Top-left title + live readout */}
      <div className="pointer-events-none absolute left-0 top-0 flex flex-col gap-2 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Flock</h1>
        <p className="max-w-sm text-base text-muted-foreground">
          What does a flock sound like when it agrees?
        </p>
        {phase === "running" && (
          <div className="mt-1 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>
              alignment{" "}
              <span className="text-primary">{hud.order.toFixed(2)}</span>
              {"  ·  "}spread {hud.spread.toFixed(2)}
            </span>
            <span>
              path{" "}
              <span className="text-primary">{path ?? "…"}</span>
              {hud.autopilot ? "  ·  autopilot" : "  ·  live"}
            </span>
          </div>
        )}
      </div>

      {/* Intro overlay */}
      {phase === "intro" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <p className="max-w-md text-base text-muted-foreground">
            A few thousand boids on the GPU. Their agreement — the mean
            velocity-alignment — tunes a choir: locked and consonant when they
            fly as one, detuned and dissonant when they scatter.
          </p>
          <button
            onClick={release}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Release the flock
          </button>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Craig Reynolds · Boids · 1987
          </p>
        </div>
      )}

      {/* Running controls */}
      {phase === "running" && (
        <div className="absolute bottom-0 left-0 flex items-center gap-3 p-6">
          <button
            onClick={() => setPredatorArmed((v) => !v)}
            aria-pressed={predatorArmed}
            className={
              predatorArmed
                ? "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            }
          >
            {predatorArmed ? "Predator armed" : "Predator"}
          </button>
          <span className="max-w-xs font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {predatorArmed ? "tap to scatter" : "tap to gather"}
          </span>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-0 top-0 m-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute right-0 top-0 m-4 mt-20 max-w-sm rounded-md border border-border bg-background/90 p-5 backdrop-blur">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Design notes
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            {README_NOTES.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Audio failure notice */}
      {audioError && (
        <p className="absolute bottom-0 right-0 m-6 text-sm text-destructive">
          {audioError}
        </p>
      )}

      {/* Back link */}
      <Link
        href="/dream"
        className="absolute bottom-0 right-0 m-6 mb-16 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </div>
  );
}
