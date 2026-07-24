// modal.ts — the engine layer for "collide": a tiny deterministic rigid-body
// solver plus a physically-flavored modal-synthesis voice bank. No physics
// library, no external audio graph helpers — everything is owned here so the
// renderer in page.tsx only has to draw bodies and forward strikes.

// ── seeded PRNG (mulberry32) ────────────────────────────────────────────────
// The whole build is forbidden from touching Math.random / Date, so every
// stochastic choice — spawn positions, shake impulses, the reverb impulse
// response — is drawn from one of these deterministic streams.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── material presets ────────────────────────────────────────────────────────
// A struck object's sound is a sum of exponentially-decaying sinusoids. Each
// material is a preset of partial frequency ratios (relative to the struck
// fundamental), per-partial decay times in seconds, an overall brightness that
// scales the high partials, and a level trim. `geom`, `color`, `metalness` and
// `roughness` are the visual half of the same identity, consumed by the
// three.js renderer. Colors stay inside the dream-lab violet/indigo/neutral
// ramp — materials read apart by geometry + surface + brightness, not by
// jumping to foreign hues.
export type MaterialKey = "glass" | "wood" | "metal" | "stone";

export interface MaterialPreset {
  label: string;
  ratios: number[];
  decays: number[];
  brightness: number;
  gain: number;
  geom: "ico" | "bar" | "sphere" | "rock";
  color: number;
  metalness: number;
  roughness: number;
}

export const MATERIALS: Record<MaterialKey, MaterialPreset> = {
  // Bright inharmonic high partials, long ring.
  glass: {
    label: "glass",
    ratios: [1, 2.76, 5.4, 8.9],
    decays: [3.4, 2.5, 1.7, 1.1],
    brightness: 1.0,
    gain: 0.85,
    geom: "ico",
    color: 0xc4b5fd,
    metalness: 0.0,
    roughness: 0.06,
  },
  // Marimba-bar warmth: stretched first overtone, strong fundamental, fast decay.
  wood: {
    label: "wood",
    ratios: [1, 3.9, 10.7],
    decays: [0.55, 0.3, 0.16],
    brightness: 0.5,
    gain: 1.0,
    geom: "bar",
    color: 0x8b5cf6,
    metalness: 0.0,
    roughness: 0.72,
  },
  // Bell / aluminium: dense inharmonic partials, very long bright shimmer.
  metal: {
    label: "metal",
    ratios: [1, 2.7, 4.2, 5.4, 6.6, 8.0],
    decays: [5.2, 4.1, 3.3, 2.7, 2.1, 1.6],
    brightness: 1.0,
    gain: 0.7,
    geom: "sphere",
    color: 0xa9b0f5,
    metalness: 0.9,
    roughness: 0.22,
  },
  // Stone / ceramic: dull short thunk with a brief pitched tail, rolled-off highs.
  stone: {
    label: "stone",
    ratios: [1, 2.3, 3.7],
    decays: [0.32, 0.2, 0.13],
    brightness: 0.28,
    gain: 1.0,
    geom: "rock",
    color: 0x8a8a93,
    metalness: 0.12,
    roughness: 0.95,
  },
};

export const MATERIAL_KEYS: MaterialKey[] = ["glass", "wood", "metal", "stone"];

// ── just-intonation pitch map ───────────────────────────────────────────────
// Fundamentals land on a two-octave just scale so random collisions still sound
// consonant. Larger objects ring lower — size maps inversely onto the scale.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
const BASE_HZ = 174.6; // F3-ish anchor
export const R_MIN = 0.17;
export const R_MAX = 0.42;

export function pickFundamental(r: number): number {
  const t = clamp((R_MAX - r) / (R_MAX - R_MIN), 0, 1); // small r -> high pitch
  const steps = JI.length * 2;
  const idx = Math.min(steps - 1, Math.floor(t * steps));
  const oct = Math.floor(idx / JI.length);
  const deg = idx % JI.length;
  return BASE_HZ * JI[deg] * Math.pow(2, oct);
}

// ── bowl geometry ───────────────────────────────────────────────────────────
// A paraboloid bowl: it funnels everything toward the centre so a dropped pile
// keeps colliding and re-ringing on its own. RIM is a soft cylindrical wall so
// hard throws don't escape out the top.
export const BOWL = {
  rim: 2.7, // horizontal radius of the lip
  k: 0.4, // depth curvature: floor height = k * (x^2 + z^2)
  restitution: 0.55,
};

export function bowlFloorY(x: number, z: number): number {
  return BOWL.k * (x * x + z * z);
}

// ── bodies + strikes ────────────────────────────────────────────────────────
export interface Body {
  id: number;
  mat: MaterialKey;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  mass: number;
  rest: number;
  fund: number;
  glow: number; // 0..1 impact flash, decays each frame
  spin: number; // cosmetic rotation rate
  age: number;
  lastStrike: number; // sim-time gate so one body can't machine-gun
}

export interface Strike {
  mat: MaterialKey;
  fund: number;
  speed: number; // relative normal speed at impact
  x: number;
  z: number;
}

const GRAVITY = 8.5;
const AIR = 0.9992;
const STRIKE_THRESH = 0.42; // min normal speed to emit a ring
const STRIKE_GATE = 0.05; // seconds between strikes on one body
const H = 1 / 120; // fixed physics substep
export const MAX_BODIES = 24;

let simTime = 0;
let nextId = 1;

export function resetSim(): void {
  simTime = 0;
  nextId = 1;
}

export function createBody(
  mat: MaterialKey,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  r: number,
  rng: () => number,
): Body {
  const mass = r * r * r * 8; // density-ish scaling
  return {
    id: nextId++,
    mat,
    x,
    y,
    z,
    vx,
    vy,
    vz,
    r,
    mass,
    rest: BOWL.restitution,
    fund: pickFundamental(r),
    glow: 0,
    spin: (rng() - 0.5) * 2.5,
    age: 0,
    lastStrike: -1,
  };
}

// map an impact speed to an expressive 0..1 strike velocity
function velCurve(speed: number): number {
  return clamp((speed - STRIKE_THRESH) / 5.5, 0, 1);
}

// One integration + collision pass. Advances a fixed number of substeps to keep
// the solve deterministic regardless of frame rate, and pushes any qualifying
// impacts into `out`. Returns the substep count consumed.
export function stepWorld(bodies: Body[], dtReal: number, out: Strike[]): void {
  const dt = clamp(dtReal, 0, 1 / 20);
  let acc = dt;
  let guard = 0;
  while (acc > 0 && guard < 8) {
    const h = Math.min(H, acc);
    substep(bodies, h, out);
    acc -= h;
    guard++;
  }
}

function substep(bodies: Body[], h: number, out: Strike[]): void {
  simTime += h;
  const n = bodies.length;

  // integrate gravity + air drag, advance position
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.vy -= GRAVITY * h;
    b.vx *= AIR;
    b.vy *= AIR;
    b.vz *= AIR;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    b.age += h;
    b.glow *= Math.exp(-h * 4.5);
  }

  // sphere–sphere pairs
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const min = a.r + b.r;
      if (dist >= min) continue;
      if (dist < 1e-5) {
        dx = 1;
        dy = 0;
        dz = 0;
        dist = 1;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      // positional de-overlap, split by inverse mass
      const overlap = min - dist;
      const invA = 1 / a.mass;
      const invB = 1 / b.mass;
      const invSum = invA + invB;
      const corr = overlap / invSum;
      a.x -= nx * corr * invA;
      a.y -= ny * corr * invA;
      a.z -= nz * corr * invA;
      b.x += nx * corr * invB;
      b.y += ny * corr * invB;
      b.z += nz * corr * invB;
      // relative normal velocity
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const rvz = b.vz - a.vz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn >= 0) continue; // separating already
      const e = Math.min(a.rest, b.rest);
      const jimp = (-(1 + e) * vn) / invSum;
      const ix = jimp * nx;
      const iy = jimp * ny;
      const iz = jimp * nz;
      a.vx -= ix * invA;
      a.vy -= iy * invA;
      a.vz -= iz * invA;
      b.vx += ix * invB;
      b.vy += iy * invB;
      b.vz += iz * invB;
      const speed = -vn;
      emitStrike(a, speed, out);
      emitStrike(b, speed, out);
    }
  }

  // bowl surface + rim
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    // paraboloid floor: contact when the sphere dips below the surface
    const floor = bowlFloorY(b.x, b.z) + b.r;
    if (b.y < floor) {
      // outward surface normal of y = k*(x^2+z^2): (-2kx, 1, -2kz)
      let nx = -2 * BOWL.k * b.x;
      let nz = -2 * BOWL.k * b.z;
      let ny = 1;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      b.y = floor;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        const e = b.rest;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        b.vz -= (1 + e) * vn * nz;
        // tangential (rolling) friction so piles settle
        b.vx *= 0.86;
        b.vz *= 0.86;
        emitStrike(b, -vn, out);
      }
    }
    // cylindrical rim
    const rad = Math.sqrt(b.x * b.x + b.z * b.z);
    const lim = BOWL.rim - b.r;
    if (rad > lim && rad > 1e-5) {
      const nx = b.x / rad;
      const nz = b.z / rad;
      b.x = nx * lim;
      b.z = nz * lim;
      const vn = b.vx * nx + b.vz * nz;
      if (vn > 0) {
        const e = b.rest;
        b.vx -= (1 + e) * vn * nx;
        b.vz -= (1 + e) * vn * nz;
        emitStrike(b, vn, out);
      }
    }
  }
}

function emitStrike(b: Body, speed: number, out: Strike[]): void {
  if (speed <= STRIKE_THRESH) return;
  if (simTime - b.lastStrike < STRIKE_GATE) return;
  b.lastStrike = simTime;
  const v = velCurve(speed);
  b.glow = Math.max(b.glow, 0.35 + 0.65 * v);
  out.push({ mat: b.mat, fund: b.fund, speed, x: b.x, z: b.z });
}

// Give the whole pile an upward, outward kick so it keeps ringing.
export function shakeBodies(bodies: Body[], rng: () => number): void {
  for (const b of bodies) {
    b.vy += 2.2 + rng() * 2.6;
    b.vx += (rng() - 0.5) * 4;
    b.vz += (rng() - 0.5) * 4;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── modal-synthesis voice bank ──────────────────────────────────────────────
// Additive: one OscillatorNode per partial into a per-partial gain running a
// scheduled exponential decay. Strike velocity scales both overall level and
// high-partial brightness (a harder hit is brighter). Voices are pooled and the
// oldest is stolen past the cap so a busy pile never blows up the graph. A
// synthesized convolution reverb gives the room a shared tail.
const MAX_VOICES = 24;

interface Voice {
  g: GainNode;
  end: number;
  oscs: OscillatorNode[];
}

export class ModalSynth {
  readonly ctx: AudioContext;
  private strikeBus: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private comp: DynamicsCompressorNode;
  private convolver: ConvolverNode;
  private voices: Voice[] = [];
  private disposed = false;

  constructor(ctx: AudioContext, rng: () => number) {
    this.ctx = ctx;
    this.strikeBus = ctx.createGain();
    this.strikeBus.gain.value = 1;

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.82;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = buildImpulse(ctx, rng);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.strikeBus.connect(this.dry);
    this.strikeBus.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.dry.connect(this.comp);
    this.wet.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  strike(fund: number, key: MaterialKey, vel: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const nyq = ctx.sampleRate * 0.45;

    // cull finished voices
    this.voices = this.voices.filter((v) => {
      if (v.end <= now) {
        try {
          v.g.disconnect();
        } catch {
          /* already gone */
        }
        return false;
      }
      return true;
    });
    // steal oldest if saturated
    if (this.voices.length >= MAX_VOICES) {
      const old = this.voices.shift();
      if (old) {
        try {
          old.g.gain.cancelScheduledValues(now);
          old.g.gain.setValueAtTime(old.g.gain.value, now);
          old.g.gain.linearRampToValueAtTime(0.0001, now + 0.04);
          for (const o of old.oscs) o.stop(now + 0.05);
        } catch {
          /* node already stopped */
        }
      }
    }

    const p = MATERIALS[key];
    const overall = 0.16 * p.gain * (0.2 + 0.8 * vel);
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(this.strikeBus);

    const oscs: OscillatorNode[] = [];
    let maxDecay = 0;
    for (let i = 0; i < p.ratios.length; i++) {
      const f = fund * p.ratios[i];
      if (f >= nyq) continue;
      const dec = p.decays[i] * (0.8 + 0.4 * vel);
      const partBase = 1 / Math.pow(i + 1, 0.7);
      const hi = i === 0 ? 1 : p.brightness * Math.pow(vel, 0.6);
      const amp = overall * partBase * hi;
      if (amp < 1e-4) continue;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.004 + dec);
      osc.connect(g);
      g.connect(voiceGain);
      osc.start(now);
      osc.stop(now + 0.03 + dec);
      oscs.push(osc);
      if (dec > maxDecay) maxDecay = dec;
    }
    if (oscs.length === 0) {
      voiceGain.disconnect();
      return;
    }
    this.voices.push({ g: voiceGain, end: now + maxDecay + 0.1, oscs });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      for (const o of v.oscs) {
        try {
          o.stop(now);
        } catch {
          /* already stopped */
        }
      }
      try {
        v.g.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.voices = [];
    try {
      this.strikeBus.disconnect();
      this.dry.disconnect();
      this.wet.disconnect();
      this.convolver.disconnect();
      this.comp.disconnect();
    } catch {
      /* already gone */
    }
    if (this.ctx.state !== "closed") {
      void this.ctx.close();
    }
  }
}

// Synthesized room impulse response: decaying noise, deterministic via the PRNG.
function buildImpulse(ctx: AudioContext, rng: () => number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2.4);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.2);
      data[i] = (rng() * 2 - 1) * env * 0.6;
    }
  }
  return buf;
}
