// sim.ts — the gravitational swarm, integrated on the CPU each frame.
//
// This is the WHOLE instrument. Tens of thousands of "motes" fall into orbit
// around a handful of user-placed attractors. Softened inverse-square gravity
// pulls each mote toward every attractor; a very weak global spring keeps the
// field bounded; a little drag keeps orbits from cooking. We never read audio
// here — instead the orbital DYNAMICS are measured (how many motes are streaming
// through each attractor's periapsis shell, how fast, and how many crossed *in*
// this frame) and handed to the audio engine. Geometry drives sound, not the
// other way around.

// A cosmic-consonant seven-note set (A minor pentatonic, spilling into the next
// octave). Number keys 1–7 pick a pitch for the selected attractor from this.
export const SCALE_HZ = [110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63];
export const SCALE_LABEL = ["A2", "C3", "D3", "E3", "G3", "A3", "C4"];

export const MAX_ATTRACTORS = 6;

// per-attractor geometry (world units)
const SHELL_R = 3.4; // periapsis "resonance shell" radius — motes inside it voice the tone
const SHELL_EXIT = SHELL_R * 1.28; // hysteresis so a mote grazing the edge doesn't chatter
const SWALLOW_R = 0.6; // fall closer than this → respawn far away (keeps density stable)
const ATTR_MASS = 62;

// integration constants — chosen conservative so the field can never blow up:
// drag + a global spring + a hard velocity clamp are three independent safeties.
const SOFT2 = 1.4 * 1.4; // gravity softening (r^2 + soft^2) — no singularity at r→0
const SPRING_K = 0.014; // faint pull toward origin → bounded, boundless-looking cloud
const DRAG = 0.05; // per-second velocity damping → stable orbits
const MAX_SPEED = 15;
const SPEED_NORM = 1 / 7.5; // maps speed → 0..1 for colour / brightness

export interface Attractor {
  id: number;
  x: number;
  y: number;
  z: number;
  pitchIndex: number; // 0..6 into SCALE_HZ
  // rolling per-frame telemetry that becomes sound:
  density: number; // motes currently inside the periapsis shell
  meanSpeed: number; // mean speed (0..1) of those motes
  grains: number; // motes that crossed *into* the shell this frame
}

export interface SimState {
  count: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  speed: Float32Array; // per-mote normalised speed, for the point-cloud colour
  shellOf: Int16Array; // attractor index the mote is currently "inside", or -1
  attractors: Attractor[];
  nextId: number;
  spawnMin: number;
  spawnMax: number;
}

function seedMote(s: SimState, i: number) {
  // spherical shell of radius [spawnMin, spawnMax], with a mostly-tangential
  // velocity about the Y axis so motes arrive already wanting to orbit.
  const r = s.spawnMin + Math.random() * (s.spawnMax - s.spawnMin);
  const u = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const sr = Math.sqrt(1 - u * u);
  const x = r * sr * Math.cos(phi);
  const y = r * sr * Math.sin(phi);
  const z = r * u;
  s.px[i] = x;
  s.py[i] = y;
  s.pz[i] = z;
  // tangential seed: omega × r about a slightly tilted axis, plus a little jitter
  const spin = 0.16 + Math.random() * 0.05;
  s.vx[i] = -z * spin * 0.25 - y * spin + (Math.random() - 0.5) * 0.4;
  s.vy[i] = x * spin + (Math.random() - 0.5) * 0.4;
  s.vz[i] = x * spin * 0.25 + (Math.random() - 0.5) * 0.4;
  s.speed[i] = 0;
  s.shellOf[i] = -1;
}

export function createSim(count: number): SimState {
  const s: SimState = {
    count,
    px: new Float32Array(count),
    py: new Float32Array(count),
    pz: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    vz: new Float32Array(count),
    speed: new Float32Array(count),
    shellOf: new Int16Array(count),
    attractors: [],
    nextId: 1,
    spawnMin: 7,
    spawnMax: 24,
  };
  for (let i = 0; i < count; i++) seedMote(s, i);
  return s;
}

export function addAttractor(s: SimState, x: number, y: number, z: number, pitchIndex: number): Attractor | null {
  if (s.attractors.length >= MAX_ATTRACTORS) return null;
  const a: Attractor = {
    id: s.nextId++,
    x,
    y,
    z,
    pitchIndex,
    density: 0,
    meanSpeed: 0,
    grains: 0,
  };
  s.attractors.push(a);
  s.shellOf.fill(-1); // indices shifted meaning — reset shell membership
  return a;
}

export function removeAttractor(s: SimState, id: number) {
  const i = s.attractors.findIndex((a) => a.id === id);
  if (i < 0) return;
  s.attractors.splice(i, 1);
  s.shellOf.fill(-1);
}

// One physics tick. Fills each attractor's {density, meanSpeed, grains}.
export function stepSim(s: SimState, dt: number) {
  const A = s.attractors;
  const n = A.length;

  // per-attractor accumulators (small n, cheap to allocate stack-style)
  const dens = new Int32Array(n);
  const spdSum = new Float32Array(n);
  const grn = new Int32Array(n);

  const dragF = Math.max(0, 1 - DRAG * dt);
  const { px, py, pz, vx, vy, vz, speed, shellOf } = s;

  for (let i = 0; i < s.count; i++) {
    let ax = -SPRING_K * px[i];
    let ay = -SPRING_K * py[i];
    let az = -SPRING_K * pz[i];

    // nearest attractor + distance to it, and distance to the one we're flagged inside
    let nearest = -1;
    let nearD2 = Infinity;
    const cur = shellOf[i];
    let curD2 = Infinity;
    let swallowed = false;

    for (let j = 0; j < n; j++) {
      const a = A[j];
      const dx = a.x - px[i];
      const dy = a.y - py[i];
      const dz = a.z - pz[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      const inv = 1 / (d2 + SOFT2);
      const f = ATTR_MASS * inv * Math.sqrt(inv); // m / (r^2+soft^2)^{3/2}
      ax += dx * f;
      ay += dy * f;
      az += dz * f;
      if (d2 < nearD2) {
        nearD2 = d2;
        nearest = j;
      }
      if (j === cur) curD2 = d2;
      if (d2 < SWALLOW_R * SWALLOW_R) swallowed = true;
    }

    if (swallowed) {
      seedMote(s, i);
      continue;
    }

    // integrate
    let nvx = (vx[i] + ax * dt) * dragF;
    let nvy = (vy[i] + ay * dt) * dragF;
    let nvz = (vz[i] + az * dt) * dragF;
    const sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz);
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
      nvx *= k;
      nvy *= k;
      nvz *= k;
    }
    vx[i] = nvx;
    vy[i] = nvy;
    vz[i] = nvz;
    px[i] += nvx * dt;
    py[i] += nvy * dt;
    pz[i] += nvz * dt;
    const spNorm = Math.min(1, sp * SPEED_NORM);
    speed[i] = spNorm;

    // ── shell membership + crossing detection (the sonified event) ──
    let inside = cur;
    if (inside >= 0 && (inside >= n || curD2 > SHELL_EXIT * SHELL_EXIT)) {
      inside = -1; // left the shell (hysteresis) or its attractor is gone
    }
    if (inside < 0 && nearest >= 0 && nearD2 < SHELL_R * SHELL_R) {
      inside = nearest;
      grn[nearest]++; // a fresh periapsis pass → trigger a grain
    }
    shellOf[i] = inside;
    if (inside >= 0) {
      dens[inside]++;
      spdSum[inside] += spNorm;
    }
  }

  for (let j = 0; j < n; j++) {
    const a = A[j];
    a.density = dens[j];
    a.meanSpeed = dens[j] > 0 ? spdSum[j] / dens[j] : 0;
    a.grains = grn[j];
  }
}

export { SHELL_R };
