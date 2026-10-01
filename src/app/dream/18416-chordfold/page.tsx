"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 18416-chordfold · cycle-2 of 18352-fluxweave.
//
// "What if your two hands harmonized your own piano recording IN THE KEY AND
//  CHORD OF THE MOMENT — pull your hands apart and the single take fans open
//  into a chord of ITSELF that is diatonic to whatever chord the piece is
//  actually playing right now, re-voicing live as the harmony moves?"
//
//   THE CHANGE. Fluxweave added a FIXED consonant stack (+7/+12/+4/−5). Chordfold
//   makes the stack CHORD-AWARE. On play we also pull the take's own chord track
//   from its analysis (`loadTrackAnalysis`). Each frame we find the chord sounding
//   at the current playback position, parse its (messy, real-world) symbol into a
//   pitch-class SET, and snap the four voice anchors (≈third, ≈fifth, ≈octave,
//   ≈tenth) to the NEAREST chord tone. Transposing the whole take by an interval
//   that lies BETWEEN chord tones keeps chord tones mapping onto chord tones — so
//   the fan stays diatonic to this chord. As the chord changes, the four targets
//   change and the stack re-voices live, glissando'd smoothly through `detune`.
//
//   AUDIO. Karel's real piano plays untouched at rate 1.0 through a DRY path.
//   Four granular pitch-shift AudioWorklets read the SAME buffer; each is built
//   with semitones = 0 and carries its whole transposition on the a-rate `detune`
//   param, so re-voicing is a continuous slide rather than a jump. Hand SEPARATION
//   still fans the voices in one by one; hand HEIGHT still swells the overall wet
//   level; hand SPEED breathes a tiny ±cents shimmer that rides on top of the
//   chord-driven detune without pulling a voice out of the chord.
//
//   VISUAL. A WebGPU compute shader advects ~200,000 particles through a
//   divergence-free CURL-NOISE field — v = curl(potential), incompressible and
//   unconditionally stable. The hands are vortex sources. NEW palette register
//   `harmonic-chroma`: the current's hue tracks the HARMONY — a restrained,
//   low-saturation tint set by the chord root around the circle of fifths, warming
//   over major chords and cooling over minor ones, drifting gently as chords move.
//
//   Refs: Bridson, Hourihan & Nordenstam (2007) "Curl-Noise for Procedural Fluid
//   Flow"; harmony-aware anchor MIDIBack (arXiv:2609.28008, 2026-09-23).
// ─────────────────────────────────────────────────────────────────────────────

const N_PARTICLES = 200_000;
const GRID_MAX = 1024; // domain resolution (long edge)
const N_CPU = 3200; // reduced fallback current

// Four voices. `anchor` is the ideal interval each voice WANTS (third / fifth /
// octave / tenth); each frame that anchor is snapped to the nearest tone of the
// chord sounding right now. baseGain / threshold / shimmer stay as fluxweave had.
interface Voice {
  anchor: number; // ideal semitone interval, snapped to a chord tone live
  baseGain: number; // relative loudness within the stack
  threshold: number; // spread at which this voice begins to fan in
  shimmerRate: number; // detune LFO rate (Hz-ish) for this voice
  shimmerPhase: number;
}
const VOICES: Voice[] = [
  { anchor: 7, baseGain: 0.5, threshold: 0.02, shimmerRate: 0.23, shimmerPhase: 0.0 },
  { anchor: 12, baseGain: 0.46, threshold: 0.22, shimmerRate: 0.31, shimmerPhase: 1.7 },
  { anchor: 4, baseGain: 0.4, threshold: 0.42, shimmerRate: 0.19, shimmerPhase: 3.1 },
  { anchor: 16, baseGain: 0.5, threshold: 0.6, shimmerRate: 0.27, shimmerPhase: 4.6 },
];
const ANCHORS = VOICES.map((v) => v.anchor);
// fixed consonant stack used when a track has no chord analysis
const FALLBACK_VOICING = [...ANCHORS];
const SPREAD_RAMP = 0.26; // how quickly each voice fades in past its threshold

// ── chord → voicing (robust to Karel's messy real symbols) ────────────────────

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Pitch-class (0..11) of a single token's root, or null. */
function tokenPitchClass(token: string): number | null {
  const m = token.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return null;
  const key = (m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase();
  const pc = PITCH_CLASS[key];
  return pc === undefined ? null : pc;
}

/** Quality suffix (everything after the root letter) → intervals above the root.
 *  Not perfect jazz theory — a reasonable pitch-class set is the goal. */
function qualityIntervals(body: string): number[] {
  if (/^5(\b|$|[^0-9])/.test(body)) return [0, 7]; // power chord: root + fifth only
  const out = new Set<number>([0]);
  const isMin = /^m/.test(body) && !/^maj/.test(body); // lowercase m, not maj → minor
  const isDim = /dim|°/i.test(body);
  const isAug = /aug|\+/.test(body);
  const isSus2 = /sus2/i.test(body);
  const isSus4 = /sus4/i.test(body) || (/sus/i.test(body) && !/sus2/i.test(body));
  // third (or sus substitute)
  if (isSus2) out.add(2);
  else if (isSus4) out.add(5);
  else if (isDim || isMin) out.add(3);
  else out.add(4);
  // fifth
  if (/b5/i.test(body) || isDim) out.add(6);
  else if (/#5/.test(body) || isAug) out.add(8);
  else out.add(7);
  // sixth (major sixth; flat sixth handled separately)
  if (/(^|[^b#])6/.test(body)) out.add(9);
  if (/b6/i.test(body)) out.add(8);
  // sevenths
  if (/maj7|maj9|maj11|maj13|△|M7|M9|M11|M13/.test(body)) out.add(11);
  else if (/7/.test(body)) out.add(10);
  // extensions / alterations (collapsed into the octave)
  if (/b9/i.test(body)) out.add(1);
  else if (/#9/.test(body)) out.add(3);
  else if (/9/.test(body)) out.add(2);
  if (/#11/.test(body)) out.add(6);
  else if (/11/.test(body)) out.add(5);
  if (/b13/i.test(body)) out.add(8);
  else if (/13/.test(body)) out.add(9);
  return [...out];
}

/** Union every token's pitch class, plus the first token's chord-quality tones. */
function chordPitchClasses(symbol: string): { root: number; set: Set<number> } | null {
  const tokens = symbol.split("/").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return null;
  const root = tokenPitchClass(tokens[0]);
  if (root === null) return null;
  const set = new Set<number>();
  for (const tk of tokens) {
    const pc = tokenPitchClass(tk); // every slash token is a real sounding note
    if (pc !== null) set.add(pc);
  }
  const body = tokens[0].replace(/^[A-Ga-g][#b]?/, "");
  for (const iv of qualityIntervals(body)) set.add((root + iv) % 12);
  return { root, set };
}

/** Snap the four anchors to the nearest chord tone, so every voice stays diatonic. */
function computeVoicing(symbol: string): { root: number; voices: number[] } | null {
  const parsed = chordPitchClasses(symbol);
  if (!parsed) return null;
  const { root, set } = parsed;
  // rising chord-tone intervals above the root across ~2 octaves
  const base: number[] = [];
  for (const pc of set) base.push((((pc - root) % 12) + 12) % 12);
  if (!base.includes(0)) base.push(0);
  const rising = new Set<number>([24]);
  for (const iv of base) {
    rising.add(iv);
    rising.add(iv + 12);
    rising.add(iv + 24);
  }
  const uniq = [...rising].sort((a, b) => a - b);
  const voices = ANCHORS.map((anchor) => {
    let best = uniq[0];
    let bestD = Infinity;
    for (const iv of uniq) {
      const d = Math.abs(iv - anchor);
      if (d < bestD) {
        bestD = d;
        best = iv;
      }
    }
    return best;
  });
  return { root, voices };
}

/** Last chord whose onset is ≤ pos (binary search; handles gaps by holding). */
function activeChordIndex(chords: TrackChord[], pos: number): number {
  let lo = 0;
  let hi = chords.length - 1;
  let res = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].time <= pos) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}

/** Clean one-glyph display name, e.g. "F△" / "Am". */
function chordDisplay(symbol: string): string {
  const pc = tokenPitchClass(symbol);
  if (pc === null) return symbol;
  return NOTE_NAMES[pc] + (chordIsMinor(symbol) ? "m" : "△");
}

// ── shared control surface (identical for GPU + CPU + demo drive) ────────────

interface HandState {
  x: number; // screen-normalized [0,1], y down
  y: number;
  vx: number; // screen-normalized units / second
  vy: number;
  height: number; // 0 bottom … 1 top (conducting height)
  active: number; // 1 active, 0 not
}

interface Controls {
  dt: number;
  time: number;
  flowSpeed: number; // grid units / second (base)
  hands: [HandState, HandState];
}

/** harmony-driven palette state, smoothed in JS and fed to the shaders. */
interface Palette {
  hue: number; // 0..1, circle-of-fifths of the chord root
  sat: number; // low / pearlescent
  warm: number; // 1 major (warm) … 0 minor (cool)
}

interface FlowBundle {
  kind: "gpu" | "cpu";
  gridW: number;
  gridH: number;
  stepAndDraw: (c: Controls, exposure: number, pal: Palette) => void;
  destroy: () => void;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const SIM_STRUCT = /* wgsl */ `
struct Sim {
  size: vec2<f32>,
  nParticles: f32,
  dt: f32,
  time: f32,
  flowSpeed: f32,
  noiseScale: f32,
  timeScale: f32,
  curlEps: f32,
  maxDim: f32,
  vortexRadius: f32,
  vortexK: f32,
  frame: f32,
  hue: f32,
  sat: f32,
  warm: f32,
};
struct Hands { data: array<vec4<f32>, 4> };
`;

const NOISE_WGSL = /* wgsl */ `
// Dave Hoskins hash → value noise → 2-octave fbm → scalar potential.
fn hash3(p: vec3<f32>) -> f32 {
  var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(x: vec3<f32>) -> f32 {
  let p = floor(x);
  let f = fract(x);
  let ff = f * f * (3.0 - 2.0 * f);
  let n000 = hash3(p + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash3(p + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash3(p + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash3(p + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash3(p + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash3(p + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash3(p + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash3(p + vec3<f32>(1.0, 1.0, 1.0));
  let x00 = mix(n000, n100, ff.x);
  let x10 = mix(n010, n110, ff.x);
  let x01 = mix(n001, n101, ff.x);
  let x11 = mix(n011, n111, ff.x);
  let y0 = mix(x00, x10, ff.y);
  let y1 = mix(x01, x11, ff.y);
  return mix(y0, y1, ff.z) * 2.0 - 1.0;
}
fn fbm(p: vec3<f32>) -> f32 {
  var s = 0.0; var a = 0.6; var q = p;
  for (var o = 0; o < 2; o = o + 1) { s = s + a * vnoise(q); q = q * 2.03; a = a * 0.5; }
  return s;
}
`;

// shared hue→rgb (full-saturation ramp), used by the chroma tint everywhere.
const HUE_WGSL = /* wgsl */ `
fn hue2rgb(h: f32) -> vec3<f32> {
  let r = clamp(abs(fract(h) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  let g = clamp(abs(fract(h + 0.6667) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  let b = clamp(abs(fract(h + 0.3333) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return vec3<f32>(r, g, b);
}
`;

// Advect: sample a divergence-free curl-noise velocity, add hand vortices,
// integrate, wrap, respawn to keep the current dense.
const ADVECT_WGSL = /* wgsl */ `
${SIM_STRUCT}
${NOISE_WGSL}
struct P { pos: vec2<f32>, age: f32, spd: f32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> parts: array<P>;
@group(0) @binding(2) var<uniform> hands: Hands;

fn field(pos: vec2<f32>) -> f32 {
  return fbm(vec3<f32>(pos.x * S.noiseScale, pos.y * S.noiseScale, S.time * S.timeScale));
}
fn hash1(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u); x = x * 0x7feb352du;
  x = x ^ (x >> 15u); x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(S.nParticles)) { return; }
  var p = parts[i];

  // divergence-free curl of the scalar potential (finite differences)
  let e = S.curlEps;
  let dPdx = (field(p.pos + vec2<f32>(e, 0.0)) - field(p.pos - vec2<f32>(e, 0.0))) / (2.0 * e);
  let dPdy = (field(p.pos + vec2<f32>(0.0, e)) - field(p.pos - vec2<f32>(0.0, e))) / (2.0 * e);
  let raw = vec2<f32>(dPdy, -dPdx);
  let sp = length(raw);
  var dir = vec2<f32>(1.0, 0.0);
  if (sp > 1e-6) { dir = raw / sp; }
  // predictable base speed, with organic slow/fast variation from the field
  var vel = dir * S.flowSpeed * (0.55 + 0.85 * clamp(sp * 90.0, 0.0, 1.0));

  // hands are vortex sources: local rotational swirl + advection by hand motion
  for (var k = 0u; k < 2u; k = k + 1u) {
    let pv = hands.data[k * 2u];
    let meta = hands.data[k * 2u + 1u];
    if (meta.x < 0.5) { continue; }
    let hp = pv.xy * S.size;
    let hv = pv.zw * S.size; // grid units / second
    let radius = S.vortexRadius;
    let d = p.pos - hp;
    let dist = length(d);
    if (dist < radius && dist > 1e-3) {
      let fall = 1.0 - dist / radius;
      let f2 = fall * fall;
      let tang = vec2<f32>(-d.y, d.x) / dist; // rotational (curl-free-safe swirl)
      let hspeed = meta.z; // normalized hand speed
      vel = vel + tang * f2 * S.vortexK * hspeed * S.maxDim;
      vel = vel + hv * f2 * 0.5;
    }
  }

  var np = p.pos + vel * S.dt;
  // toroidal wrap keeps the body of light full-frame
  np.x = np.x - floor(np.x / S.size.x) * S.size.x;
  np.y = np.y - floor(np.y / S.size.y) * S.size.y;

  // respawn to preserve density (incompressible flow still forms voids over time)
  p.age = p.age + S.dt;
  let life = 6.0 + hash1(i * 747796405u) * 8.0;
  if (p.age > life) {
    let salt = i * 2654435761u + u32(S.frame) * 40503u;
    np = vec2<f32>(hash1(salt) * S.size.x, hash1(salt ^ 0x9e3779b9u) * S.size.y);
    p.age = 0.0;
  }

  p.pos = np;
  p.spd = clamp(length(vel) / S.maxDim, 0.0, 1.5);
  parts[i] = p;
}`;

// Fade the previous frame (feedback trails).
const FADE_WGSL = /* wgsl */ `
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, hue: f32, warm: f32 };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var prev: texture_2d<f32>;
@group(0) @binding(2) var<uniform> R: RU;
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(prev, samp, in.uv, 0.0);
  return vec4<f32>(c.rgb * R.fade, 1.0);
}`;

// Additive harmonic-chroma splats — one instanced quad per particle. The pearl
// base is tinted by the live harmony hue (low saturation) and nudged warm/cool.
const POINTS_WGSL = /* wgsl */ `
${SIM_STRUCT}
${HUE_WGSL}
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, hue: f32, warm: f32 };
struct P { pos: vec2<f32>, age: f32, spd: f32 };
@group(0) @binding(0) var<storage, read> parts: array<P>;
@group(0) @binding(1) var<uniform> S: Sim;
@group(0) @binding(2) var<uniform> R: RU;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) col: vec3<f32> };

fn chroma(a: f32) -> vec3<f32> {
  let pearl = vec3<f32>(0.80, 0.82, 0.86);
  var base = mix(pearl, hue2rgb(S.hue), S.sat);
  // temperature: warm chords lift red/green, minor chords lift blue
  let temp = (S.warm - 0.5) * 0.09;
  base = base + vec3<f32>(temp, temp * 0.3, -temp);
  // faint interference sheen keyed to speed + hue (stays near-white)
  let ph = 6.28318 * (a + S.hue);
  let sheen = vec3<f32>(0.10 * cos(ph), 0.09 * cos(ph + 2.20), 0.10 * cos(ph + 4.30));
  return base + sheen * (0.25 + S.sat * 2.0);
}

@vertex
fn vmain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0),
    vec2<f32>(-1.0,1.0),  vec2<f32>(1.0,-1.0), vec2<f32>(1.0,1.0));
  let a = parts[ii];
  let ndc = vec2<f32>(a.pos.x / S.size.x * 2.0 - 1.0, 1.0 - a.pos.y / S.size.y * 2.0);
  let corner = corners[vi];
  let off = corner * vec2<f32>(R.radius / R.vpW, R.radius / R.vpH) * 2.0;
  var o: VOut;
  o.pos = vec4<f32>(ndc + off, 0.0, 1.0);
  o.uv = corner;
  let t = fract(a.spd * 1.6 + f32(ii) * 0.0000037);
  o.col = chroma(t);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  let alpha = smoothstep(1.0, 0.0, d);
  let intensity = R.intensity;
  return vec4<f32>(in.col * alpha * intensity, alpha * intensity);
}`;

// Tonemap the HDR accumulation; the specular sheen and a whisper of background
// tint carry the harmony hue so the whole frame cools/warms with the chord.
const PRESENT_WGSL = /* wgsl */ `
${HUE_WGSL}
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, hue: f32, warm: f32 };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> R: RU;
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let hdr = textureSampleLevel(tex, samp, in.uv, 0.0).rgb;
  let mapped = vec3<f32>(1.0) - exp(-hdr * R.exposure);
  let lum = dot(mapped, vec3<f32>(0.333, 0.333, 0.333));
  // interference sheen ONLY in the specular highlights, phase-shifted by hue
  let hl = smoothstep(0.4, 0.95, lum);
  let ph = lum * 3.4 + hdr.r * 0.7 + R.hue * 6.28318;
  let sheen = vec3<f32>(cos(ph), cos(ph + 2.1), cos(ph + 4.2)) * 0.045 * hl;
  // deep near-black, warmed/cooled by a whisper of the harmony hue
  let bg = vec3<f32>(0.015, 0.017, 0.025) + hue2rgb(R.hue) * 0.010;
  var col = bg + mapped + sheen;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

// ── GPU init ─────────────────────────────────────────────────────────────────

function computeGrid(): [number, number] {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 720;
  const aspect = w / h;
  let gw: number;
  let gh: number;
  if (aspect >= 1) {
    gw = GRID_MAX;
    gh = Math.round(GRID_MAX / aspect);
  } else {
    gh = GRID_MAX;
    gw = Math.round(GRID_MAX * aspect);
  }
  return [Math.max(64, gw), Math.max(64, gh)];
}

async function initGpu(canvas: HTMLCanvasElement): Promise<FlowBundle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const [gridW, gridH] = computeGrid();
  const maxDim = Math.max(gridW, gridH);

  // particles: pos.xy, age, spd — 16 bytes
  const data = new Float32Array(N_PARTICLES * 4);
  for (let i = 0; i < N_PARTICLES; i++) {
    data[i * 4] = Math.random() * gridW;
    data[i * 4 + 1] = Math.random() * gridH;
    data[i * 4 + 2] = Math.random() * 12; // staggered ages
    data[i * 4 + 3] = 0;
  }
  const partBuf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(partBuf, 0, data as BufferSource);

  const simBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const handsBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const ruBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const advectPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: ADVECT_WGSL }), entryPoint: "main" },
  });

  const HDR: GPUTextureFormat = "rgba16float";
  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const pointsMod = device.createShaderModule({ code: POINTS_WGSL });
  const presentMod = device.createShaderModule({ code: PRESENT_WGSL });

  const fadePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vmain" },
    fragment: { module: fadeMod, entryPoint: "fmain", targets: [{ format: HDR }] },
    primitive: { topology: "triangle-list" },
  });
  const pointsPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: pointsMod, entryPoint: "vmain" },
    fragment: {
      module: pointsMod,
      entryPoint: "fmain",
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
  const presentPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: presentMod, entryPoint: "vmain" },
    fragment: { module: presentMod, entryPoint: "fmain", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const advectBG = device.createBindGroup({
    layout: advectPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: partBuf } },
      { binding: 2, resource: { buffer: handsBuf } },
    ],
  });
  const pointsBG = device.createBindGroup({
    layout: pointsPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: partBuf } },
      { binding: 1, resource: { buffer: simBuf } },
      { binding: 2, resource: { buffer: ruBuf } },
    ],
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  let tex: [GPUTexture, GPUTexture] | null = null;
  let fadeBG: [GPUBindGroup, GPUBindGroup] | null = null;
  let presentBG: [GPUBindGroup, GPUBindGroup] | null = null;
  let texW = 0;
  let texH = 0;

  const rebuildTargets = () => {
    const w = Math.max(2, canvas.width);
    const h = Math.max(2, canvas.height);
    if (w === texW && h === texH && tex) return;
    texW = w;
    texH = h;
    tex?.[0].destroy();
    tex?.[1].destroy();
    const mk = () =>
      device.createTexture({
        size: { width: w, height: h },
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    tex = [mk(), mk()];
    const mkBG = (pipe: GPURenderPipeline, i: 0 | 1) =>
      device.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: tex![i].createView() },
          { binding: 2, resource: { buffer: ruBuf } },
        ],
      });
    fadeBG = [mkBG(fadePipe, 0), mkBG(fadePipe, 1)];
    presentBG = [mkBG(presentPipe, 0), mkBG(presentPipe, 1)];
  };
  rebuildTargets();

  const sim = new Float32Array(16);
  const handsArr = new Float32Array(16);
  const ru = new Float32Array(8);
  let cur: 0 | 1 = 0;
  let frameNo = 0;
  const groups = Math.ceil(N_PARTICLES / 64);

  const stepAndDraw = (c: Controls, exposure: number, pal: Palette) => {
    rebuildTargets();
    if (!tex || !fadeBG || !presentBG) return;

    sim[0] = gridW;
    sim[1] = gridH;
    sim[2] = N_PARTICLES;
    sim[3] = c.dt;
    sim[4] = c.time;
    sim[5] = c.flowSpeed;
    sim[6] = 3.4 / maxDim; // noiseScale: features span ~maxDim/3.4 grid units
    sim[7] = 0.05; // timeScale — how fast the field evolves
    sim[8] = Math.max(1.0, maxDim * 0.0016); // curlEps
    sim[9] = maxDim;
    sim[10] = maxDim * 0.26; // vortexRadius
    sim[11] = 0.9; // vortexK
    sim[12] = frameNo;
    sim[13] = pal.hue;
    sim[14] = pal.sat;
    sim[15] = pal.warm;
    device.queue.writeBuffer(simBuf, 0, sim as BufferSource);

    for (let k = 0; k < 2; k++) {
      const hnd = c.hands[k];
      const speed = Math.hypot(hnd.vx, hnd.vy);
      handsArr[k * 8] = hnd.x;
      handsArr[k * 8 + 1] = hnd.y;
      handsArr[k * 8 + 2] = hnd.vx;
      handsArr[k * 8 + 3] = hnd.vy;
      handsArr[k * 8 + 4] = hnd.active;
      handsArr[k * 8 + 5] = 0;
      handsArr[k * 8 + 6] = Math.min(1.4, speed);
      handsArr[k * 8 + 7] = 0;
    }
    device.queue.writeBuffer(handsBuf, 0, handsArr as BufferSource);

    ru[0] = texW;
    ru[1] = texH;
    ru[2] = 1.35; // splat radius px
    ru[3] = exposure;
    ru[4] = 0.9; // trail fade
    ru[5] = 0.28; // splat intensity
    ru[6] = pal.hue;
    ru[7] = pal.warm;
    device.queue.writeBuffer(ruBuf, 0, ru as BufferSource);

    const nxt = (1 - cur) as 0 | 1;
    const enc = device.createCommandEncoder();

    const cp = enc.beginComputePass();
    cp.setPipeline(advectPipe);
    cp.setBindGroup(0, advectBG);
    cp.dispatchWorkgroups(groups);
    cp.end();

    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: tex[nxt].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(fadePipe);
    rp.setBindGroup(0, fadeBG[cur]);
    rp.draw(3);
    rp.setPipeline(pointsPipe);
    rp.setBindGroup(0, pointsBG);
    rp.draw(6, N_PARTICLES);
    rp.end();

    const view = ctx.getCurrentTexture().createView();
    const pp = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pp.setPipeline(presentPipe);
    pp.setBindGroup(0, presentBG[nxt]);
    pp.draw(3);
    pp.end();

    device.queue.submit([enc.finish()]);
    cur = nxt;
    frameNo++;
  };

  return {
    kind: "gpu",
    gridW,
    gridH,
    stepAndDraw,
    destroy: () => {
      partBuf.destroy();
      simBuf.destroy();
      handsBuf.destroy();
      ruBuf.destroy();
      tex?.[0].destroy();
      tex?.[1].destroy();
      device.destroy();
    },
  };
}

// ── CPU fallback current (Canvas2D, reduced curl-noise advection) ────────────

function hueToRgb(h: number): [number, number, number] {
  const f = (n: number) => {
    let v = (h + n) % 1;
    if (v < 0) v += 1;
    return Math.min(1, Math.max(0, Math.abs(v * 6 - 3) - 1));
  };
  return [f(0), f(0.6667), f(0.3333)];
}

function initCpu(canvas: HTMLCanvasElement): FlowBundle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const px = new Float32Array(N_CPU);
  const py = new Float32Array(N_CPU);
  const page = new Float32Array(N_CPU);
  const psp = new Float32Array(N_CPU);
  for (let i = 0; i < N_CPU; i++) {
    px[i] = Math.random();
    py[i] = Math.random();
    page[i] = Math.random() * 10;
  }

  // tiny 3D value noise for the potential
  const h3 = (x: number, y: number, z: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };
  const smooth = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const vn = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const c = (dx: number, dy: number, dz: number) => h3(xi + dx, yi + dy, zi + dz);
    const x00 = smooth(c(0, 0, 0), c(1, 0, 0), xf);
    const x10 = smooth(c(0, 1, 0), c(1, 1, 0), xf);
    const x01 = smooth(c(0, 0, 1), c(1, 0, 1), xf);
    const x11 = smooth(c(0, 1, 1), c(1, 1, 1), xf);
    const y0 = smooth(x00, x10, yf);
    const y1 = smooth(x01, x11, yf);
    return smooth(y0, y1, zf);
  };
  const pot = (x: number, y: number, t: number) =>
    0.6 * vn(x * 3.0, y * 3.0, t) + 0.3 * vn(x * 6.06, y * 6.06, t);

  const stepAndDraw = (c: Controls, exposure: number, pal: Palette) => {
    const W = canvas.width;
    const H = canvas.height;
    const t = c.time * 0.05;
    const e = 0.004;
    const base = 0.11 * (c.flowSpeed / 220); // normalized units/sec-ish

    // harmonic-chroma base tint for this frame
    const [tr, tg, tb] = hueToRgb(pal.hue);
    const temp = (pal.warm - 0.5) * 0.09;
    const br = 0.8 + (tr - 0.8) * pal.sat + temp;
    const bg = 0.82 + (tg - 0.82) * pal.sat + temp * 0.3;
    const bb = 0.86 + (tb - 0.86) * pal.sat - temp;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4,5,7,0.16)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < N_CPU; i++) {
      const x = px[i], y = py[i];
      const dPdx = (pot(x + e, y, t) - pot(x - e, y, t)) / (2 * e);
      const dPdy = (pot(x, y + e, t) - pot(x, y - e, t)) / (2 * e);
      let vx = dPdy * base;
      let vy = -dPdx * base;

      for (let k = 0; k < 2; k++) {
        const hnd = c.hands[k];
        if (hnd.active < 0.5) continue;
        const dx = x - hnd.x;
        const dy = y - hnd.y;
        const dist = Math.hypot(dx, dy);
        const radius = 0.26;
        if (dist < radius && dist > 1e-3) {
          const fall = 1 - dist / radius;
          const f2 = fall * fall;
          const speed = Math.min(1.4, Math.hypot(hnd.vx, hnd.vy));
          vx += (-dy / dist) * f2 * 0.9 * speed;
          vy += (dx / dist) * f2 * 0.9 * speed;
          vx += hnd.vx * f2 * 0.5;
          vy += hnd.vy * f2 * 0.5;
        }
      }

      let nx = x + vx * c.dt;
      let ny = y + vy * c.dt;
      nx -= Math.floor(nx);
      ny -= Math.floor(ny);

      page[i] += c.dt;
      if (page[i] > 9) {
        nx = Math.random();
        ny = Math.random();
        page[i] = 0;
      }
      px[i] = nx;
      py[i] = ny;
      psp[i] = Math.min(1, Math.hypot(vx, vy) * 3);

      const sh = psp[i];
      const sheen = 0.09 * Math.cos(6.28 * (sh + pal.hue));
      const r = Math.min(255, (br + sheen) * 255 * exposure * 0.5);
      const g = Math.min(255, (bg + sheen) * 255 * exposure * 0.5);
      const b = Math.min(255, (bb + sheen) * 255 * exposure * 0.5);
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.5)`;
      ctx.fillRect(nx * W - 1, ny * H - 1, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  return {
    kind: "cpu",
    gridW: 0,
    gridH: 0,
    stepAndDraw,
    destroy: () => {},
  };
}

// ── granular pitch-shift AudioWorklet (built from a blob, self-contained) ─────
// Two-tap, triangular-windowed overlap-add reader over a ring buffer. The whole
// transposition is carried by `detune` (cents, a-rate) with semitones = 0, so a
// change of target is a smooth glissando rather than a jump. The window is 0 at
// the wrap, so the seam is silent → glitch-free.
const CHORDFOLD_WORKLET_SRC = `
function sampleLerp(ring, pos, size) {
  var p = pos;
  while (p < 0) { p += size; }
  var i0 = Math.floor(p);
  var frac = p - i0;
  var a = ring[i0 & (size - 1)];
  var b = ring[(i0 + 1) & (size - 1)];
  return a + (b - a) * frac;
}
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'detune', defaultValue: 0, minValue: -2400, maxValue: 2400, automationRate: 'a-rate' }];
  }
  constructor(options) {
    super();
    var opt = (options && options.processorOptions) || {};
    this.semitones = opt.semitones || 0;
    this.bufSize = 32768; // power of two
    this.grain = Math.max(256, Math.floor(sampleRate * 0.10)); // ~100 ms
    this.ring = [new Float32Array(this.bufSize), new Float32Array(this.bufSize)];
    this.writePos = 0;
    this.phase = 0;
  }
  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];
    var nCh = output.length;
    var frames = output[0].length;
    var det = parameters.detune;
    var grain = this.grain;
    var mask = this.bufSize - 1;
    for (var i = 0; i < frames; i++) {
      var detune = det.length > 1 ? det[i] : det[0];
      var ratio = Math.pow(2, (this.semitones + detune / 100) / 12);
      for (var c = 0; c < nCh; c++) {
        var inCh = input && (input[c] || input[0]);
        this.ring[c][this.writePos] = inCh ? inCh[i] : 0;
      }
      this.phase += (1 - ratio) / grain;
      this.phase -= Math.floor(this.phase);
      var phase2 = this.phase + 0.5;
      phase2 -= Math.floor(phase2);
      var delay1 = this.phase * grain;
      var delay2 = phase2 * grain;
      var w1 = 1 - Math.abs(2 * this.phase - 1); // triangular → sum == 1
      var w2 = 1 - Math.abs(2 * phase2 - 1);
      for (var c2 = 0; c2 < nCh; c2++) {
        var ring = this.ring[c2];
        output[c2][i] = w1 * sampleLerp(ring, this.writePos - delay1, this.bufSize)
                      + w2 * sampleLerp(ring, this.writePos - delay2, this.bufSize);
      }
      this.writePos = (this.writePos + 1) & mask;
    }
    return true;
  }
}
registerProcessor('chordfold-pitch', PitchShiftProcessor);
`;

// ── demo drive (autonomous virtual hands) ─────────────────────────────────────
// Their SEPARATION breathes open and shut so the chord audibly fans and collapses;
// their HEIGHT rises and falls so the voices swell; both warp the current.
function computeDemoRaw(t: number): [
  { x: number; y: number; height: number },
  { x: number; y: number; height: number },
] {
  const half = 0.16 + 0.15 * Math.sin(t * 0.3); // half-separation 0.01 … 0.31
  const bob = 0.16 * Math.sin(t * 0.5);
  const drift = 0.05 * Math.sin(t * 0.7);
  const x0 = 0.5 - half + drift;
  const y0 = 0.5 + bob;
  const x1 = 0.5 + half - drift * 0.8;
  const y1 = 0.5 - bob * 0.8 + 0.04 * Math.sin(t * 0.9 + 1.0);
  return [
    { x: x0, y: y0, height: 1 - y0 },
    { x: x1, y: y1, height: 1 - y1 },
  ];
}

// ── component ────────────────────────────────────────────────────────────────

type TrackingMode = "demo" | "live" | "lost";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bundleRef = useRef<FlowBundle | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const voiceNodesRef = useRef<AudioWorkletNode[]>([]);
  const voiceGainsRef = useRef<GainNode[]>([]);
  const harmonizerRef = useRef(false); // worklet voices active

  // chord-awareness
  const chordsRef = useRef<TrackChord[]>([]);
  const startTimeRef = useRef(0); // ctx.currentTime at which the loop began
  const bufferDurRef = useRef(0);
  const lastChordIdxRef = useRef(-1);
  const voicingRef = useRef<number[]>([...FALLBACK_VOICING]);
  const hueRef = useRef(0.08);
  const hueTargetRef = useRef(0.08);
  const warmRef = useRef(0.6);
  const warmTargetRef = useRef(0.6);

  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);
  const handPrevRef = useRef<{ x: number; y: number; t: number; has: boolean }[]>([
    { x: 0, y: 0, t: 0, has: false },
    { x: 0, y: 0, t: 0, has: false },
  ]);
  const trackModeRef = useRef<TrackingMode>("demo");

  const lastTsRef = useRef(0);
  const simTimeRef = useRef(0);
  const spreadUiRef = useRef(0);
  const chordLabelRef = useRef<string | null>(null);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [gpuStatus, setGpuStatus] = useState<"checking" | "gpu" | "cpu">("checking");
  const [trackMode, setTrackMode] = useState<TrackingMode>("demo");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadUi, setSpreadUi] = useState(0);
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const [harmonyNote, setHarmonyNote] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const { immersive, toggle } = useImmersive();

  // ── init substrate + always-on render loop ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(r.width * dpr));
      canvas.height = Math.max(2, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let uiTick = 0;
    const freqBuf = new Uint8Array(1024);

    (async () => {
      let bundle: FlowBundle | null = null;
      try {
        bundle = await initGpu(canvas);
      } catch {
        bundle = null;
      }
      if (cancelled) {
        bundle?.destroy();
        return;
      }
      if (bundle) {
        setGpuStatus("gpu");
      } else {
        bundle = initCpu(canvas);
        setGpuStatus("cpu");
      }
      if (!bundle) return;
      bundleRef.current = bundle;

      const frame = (ts: number) => {
        rafRef.current = requestAnimationFrame(frame);
        if (lastTsRef.current === 0) lastTsRef.current = ts;
        let dt = (ts - lastTsRef.current) / 1000;
        lastTsRef.current = ts;
        if (dt <= 0 || dt > 0.05) dt = 0.016;
        simTimeRef.current += dt;
        const t = simTimeRef.current;

        // ── gather the two hands (live tracking or demo drive) ───────────────
        let raw: [
          { x: number; y: number; height: number; active: boolean },
          { x: number; y: number; height: number; active: boolean },
        ];
        let mode: TrackingMode;

        const tracker = trackerRef.current;
        const video = videoRef.current;
        if (cameraOnRef.current && tracker && video && video.readyState >= 2) {
          let res: { landmarks: { x: number; y: number; z: number }[][] } | null = null;
          try {
            res = tracker.detectForVideo(video, performance.now());
          } catch {
            res = null;
          }
          const lms = res?.landmarks ?? [];
          const mk = (i: number) => {
            if (i < lms.length && lms[i]) {
              const f = computeHandFeatures(lms[i]);
              const nx = f.cx / 1.2 / 2 + 0.5;
              const ny = 1 - (f.cy / 1.2 / 2 + 0.5);
              return { x: nx, y: ny, height: f.height, active: true };
            }
            return { x: 0.5, y: 0.5, height: 0.5, active: false };
          };
          raw = [mk(0), mk(1)];
          mode = lms.length > 0 ? "live" : "lost";
        } else {
          const d = computeDemoRaw(t);
          raw = [
            { ...d[0], active: true },
            { ...d[1], active: true },
          ];
          mode = "demo";
        }

        if (mode !== trackModeRef.current) {
          trackModeRef.current = mode;
          setTrackMode(mode);
        }

        // velocities from previous positions (shared by live + demo)
        const hands: [HandState, HandState] = [
          { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 },
          { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 },
        ];
        for (let i = 0; i < 2; i++) {
          const prev = handPrevRef.current[i];
          const r = raw[i];
          if (r.active) {
            let vx = 0;
            let vy = 0;
            if (prev.has) {
              const pdt = Math.max(0.008, t - prev.t);
              vx = (r.x - prev.x) / pdt;
              vy = (r.y - prev.y) / pdt;
            }
            prev.x = r.x;
            prev.y = r.y;
            prev.t = t;
            prev.has = true;
            hands[i] = { x: r.x, y: r.y, vx, vy, height: r.height, active: 1 };
          } else {
            prev.has = false;
            hands[i] = { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 };
          }
        }

        // ── derive the conducting parameters ─────────────────────────────────
        const bothActive = hands[0].active > 0.5 && hands[1].active > 0.5;
        const sep = bothActive ? Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y) : 0;
        const spread = Math.min(1, Math.max(0, (sep - 0.05) / 0.55));
        let heightAvg = 0;
        let nAct = 0;
        for (const h of hands) {
          if (h.active > 0.5) {
            heightAvg += h.height;
            nAct++;
          }
        }
        heightAvg = nAct > 0 ? heightAvg / nAct : 0.4;
        let turbulence = 0;
        for (const h of hands) {
          if (h.active > 0.5) turbulence += Math.hypot(h.vx, h.vy);
        }
        turbulence = Math.min(1, turbulence * 0.7);

        // flow energy rises with hand height
        const baseFlow = bundle!.kind === "gpu" ? bundle!.gridW * 0.45 : 220;
        const flow = baseFlow * (0.5 + heightAvg * 0.95);

        // audio level → a small exposure lift so the light breathes with the music
        let level = 0;
        const master = masterRef.current;
        if (master) {
          master.analyser.getByteFrequencyData(freqBuf);
          let s = 0;
          for (let i = 0; i < 220; i++) s += freqBuf[i];
          level = s / 220 / 255;
        }
        const exposure = 1.3 + level * 0.9;

        // ── read the chord sounding at the current playback position ─────────
        const ac = ctxRef.current;
        if (
          phaseRef.current === "playing" &&
          ac &&
          bufferDurRef.current > 0 &&
          chordsRef.current.length > 0
        ) {
          const dur = bufferDurRef.current;
          const pos = (((ac.currentTime - startTimeRef.current) % dur) + dur) % dur;
          const idx = activeChordIndex(chordsRef.current, pos);
          if (idx !== lastChordIdxRef.current) {
            lastChordIdxRef.current = idx;
            const sym = chordsRef.current[idx].chord;
            const v = computeVoicing(sym);
            if (v) {
              voicingRef.current = v.voices;
              hueTargetRef.current = ((v.root * 7) % 12) / 12;
              warmTargetRef.current = chordIsMinor(sym) ? 0.0 : 1.0;
              chordLabelRef.current = chordDisplay(sym);
            } else {
              voicingRef.current = [...FALLBACK_VOICING];
              chordLabelRef.current = sym;
            }
          }
        }

        // smooth the harmony hue (shortest path around the wheel) + warmth
        let dHue = hueTargetRef.current - hueRef.current;
        dHue -= Math.round(dHue); // wrap to (-0.5, 0.5]
        hueRef.current = (hueRef.current + dHue * 0.05 + 1) % 1;
        warmRef.current += (warmTargetRef.current - warmRef.current) * 0.05;
        const sat = 0.13 + (1 - warmRef.current) * 0.06; // minor a touch richer/cooler

        bundle!.stepAndDraw(
          { dt, time: t, flowSpeed: flow, hands },
          exposure,
          { hue: hueRef.current, sat, warm: warmRef.current },
        );

        // ── conduct the harmonizer (all params smoothed) ─────────────────────
        if (
          phaseRef.current === "playing" &&
          ac &&
          harmonizerRef.current &&
          voiceGainsRef.current.length === VOICES.length
        ) {
          const now = ac.currentTime;
          const voicesLevel = 0.16 + heightAvg * 0.84; // hand height = overall wet level
          const voicing = voicingRef.current;
          for (let i = 0; i < VOICES.length; i++) {
            const v = VOICES[i];
            const fan = Math.min(1, Math.max(0, (spread - v.threshold) / SPREAD_RAMP));
            const target = fan * voicesLevel * v.baseGain;
            voiceGainsRef.current[i].gain.setTargetAtTime(target, now, 0.12);
            const node = voiceNodesRef.current[i];
            const det = node.parameters.get("detune");
            if (det) {
              // chord-driven interval (cents) + a small hand-speed shimmer on top
              const shimmer = Math.sin(t * v.shimmerRate * 6.283 + v.shimmerPhase) * turbulence * 10;
              const interval = voicing[i] ?? v.anchor;
              det.setTargetAtTime(interval * 100 + shimmer, now, 0.12);
            }
          }
        }

        spreadUiRef.current = spread;
        uiTick++;
        if (uiTick % 12 === 0) {
          setSpreadUi(spreadUiRef.current);
          setChordLabel(chordLabelRef.current); // React bails out if unchanged
        }
      };

      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      voiceNodesRef.current.forEach((n) => n.disconnect());
      voiceGainsRef.current.forEach((g) => g.disconnect());
      voiceNodesRef.current = [];
      voiceGainsRef.current = [];
      masterRef.current?.disconnect();
      masterRef.current = null;
      trackerRef.current?.close();
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
      bundleRef.current?.destroy();
      bundleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── audio: dry take (rate 1.0) + four chord-aware granular voices ──────────
  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }

      // register the granular pitch-shift worklet once
      if (!harmonizerRef.current) {
        try {
          const blob = new Blob([CHORDFOLD_WORKLET_SRC], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          harmonizerRef.current = true;
        } catch {
          harmonizerRef.current = false;
          setError(
            "Harmonic voices unavailable in this browser — the dry take still plays and the current still flows.",
          );
        }
      }

      const wh = await loadRealTrackBuffer(ctx, trackRef.current.id);

      // pull the take's own chord track; fall back to a fixed stack if absent
      chordsRef.current = [];
      lastChordIdxRef.current = -1;
      voicingRef.current = [...FALLBACK_VOICING];
      let keySig: string | null = null;
      try {
        const analysis = await loadTrackAnalysis(trackRef.current.id);
        if (analysis && analysis.chords.length > 0) {
          chordsRef.current = analysis.chords;
          keySig = analysis.key_signature;
          setHarmonyNote(null);
        } else {
          setHarmonyNote("Harmony data unavailable — holding a fixed consonant stack.");
        }
      } catch {
        setHarmonyNote("Harmony data unavailable — holding a fixed consonant stack.");
      }
      // seed the palette from the key signature until the first chord lands
      const kr = keySig ? tokenPitchClass(keySig) : null;
      hueTargetRef.current = kr !== null ? ((kr * 7) % 12) / 12 : 0.08;
      warmTargetRef.current = keySig && /min/i.test(keySig) ? 0.0 : 0.6;
      chordLabelRef.current = null;
      setChordLabel(null);

      // tear down any prior chain
      try {
        sourceRef.current?.stop();
      } catch {
        /* none */
      }
      sourceRef.current?.disconnect();
      voiceNodesRef.current.forEach((n) => n.disconnect());
      voiceGainsRef.current.forEach((g) => g.disconnect());
      voiceNodesRef.current = [];
      voiceGainsRef.current = [];

      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.loop = true;
      src.playbackRate.value = 1.0; // SOURCE pitch/melody never changes
      bufferDurRef.current = wh.buffer.duration;

      // DRY / clear path — always audible, the untouched take
      const dry = ctx.createGain();
      dry.gain.value = 1.0;
      src.connect(dry);
      dry.connect(master.input);
      dryRef.current = dry;

      // HARMONIC voices — same buffer, transposed entirely via `detune`
      if (harmonizerRef.current) {
        for (let i = 0; i < VOICES.length; i++) {
          const node = new AudioWorkletNode(ctx, "chordfold-pitch", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { semitones: 0 }, // base ratio 1.0 — detune carries all
          });
          const g = ctx.createGain();
          g.gain.value = 0; // start at unison (silent) — fans in with spread
          src.connect(node);
          node.connect(g);
          g.connect(master.input);
          voiceNodesRef.current.push(node);
          voiceGainsRef.current.push(g);
        }
      }

      src.onended = () => {
        if (sourceRef.current === src) setPhase("idle");
      };
      startTimeRef.current = ctx.currentTime;
      src.start();
      sourceRef.current = src;
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this recording.");
      setPhase("idle");
    }
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    voiceNodesRef.current.forEach((n) => n.disconnect());
    voiceGainsRef.current.forEach((g) => g.disconnect());
    voiceNodesRef.current = [];
    voiceGainsRef.current = [];
    chordsRef.current = [];
    lastChordIdxRef.current = -1;
    chordLabelRef.current = null;
    setChordLabel(null);
    setPhase("idle");
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current || cameraBusy) return;
    setCameraBusy(true);
    setError(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      await startCamera(video);
      streamRef.current = video.srcObject as MediaStream | null;
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      cameraOnRef.current = true;
    } catch {
      setError(
        "Camera or hand model unavailable — the demo drive keeps weaving the chord.",
      );
      cameraOnRef.current = false;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const tk = REAL_TRACKS.find((x) => x.id === id);
      if (!tk) return;
      setTrack(tk);
      if (phaseRef.current === "playing") stopAudio();
    },
    [stopAudio],
  );

  const spreadLabel =
    spreadUi < 0.12 ? "unison" : spreadUi < 0.45 ? "opening" : spreadUi < 0.75 ? "chord" : "full stack";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: "none" }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* tracking status + live chord readout — always visible */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {trackMode === "live" && <span className="text-muted-foreground">tracking · live</span>}
        {trackMode === "lost" && (
          <span className="text-destructive">
            tracking lost · show both hands, palms to camera
          </span>
        )}
        {trackMode === "demo" && (
          <span className="text-primary">demo · autonomous</span>
        )}
        <span className="ml-3 text-muted-foreground/70">
          {chordLabel ? `${chordLabel} · ${spreadLabel}` : `spread ${spreadUi.toFixed(2)} · ${spreadLabel}`}
        </span>
      </div>

      {error && (
        <p className="pointer-events-none absolute inset-x-4 top-12 z-30 text-sm text-destructive">
          {error}
        </p>
      )}

      {!immersive && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-12">
            <header className="max-w-2xl space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                chordfold · harmonize your recording in the chord of the moment
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Pull your hands apart and the take fans open into a chord of itself —
                diatonic to whatever chord the piece is playing right now, re-voicing
                live as the harmony moves.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                {gpuStatus === "gpu"
                  ? "200,000 particles flow through a divergence-free curl-noise field on the GPU."
                  : gpuStatus === "cpu"
                    ? "WebGPU unavailable — reduced preview: a smaller CPU current, same mechanism."
                    : "Starting the current…"}{" "}
                Karel&apos;s piano plays untouched at rate 1.0; your hands add pitch-shifted
                copies that snap to the chord sounding at this instant, read from the take&apos;s
                own chord track. The light&apos;s hue tracks the harmony.
              </p>
              {harmonyNote && (
                <p className="max-w-xl text-sm text-muted-foreground/80">{harmonyNote}</p>
              )}
            </header>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6 pb-16">
            {gpuStatus === "cpu" && (
              <p className="text-sm text-muted-foreground">
                WebGPU unavailable — reduced preview.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  track
                </span>
                <select
                  value={track.id}
                  onChange={(e) => onSelectTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {phase !== "playing" ? (
                <button
                  onClick={() => void play()}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading…" : `Play ${track.title}`}
                </button>
              ) : (
                <button
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Stop
                </button>
              )}

              <button
                onClick={() => void enableCamera()}
                disabled={cameraBusy || trackMode !== "demo"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                {cameraBusy
                  ? "Enabling camera…"
                  : trackMode === "demo"
                    ? "Harmonize with your hands"
                    : "Camera on"}
              </button>

              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
          </div>

          <PrototypeNav slugs={["18416-chordfold", "18352-fluxweave"]} />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Chordfold"
        description="Karel's piano is poured into a divergence-free curl-noise current of ~200,000 luminous particles. The take plays untouched at rate 1.0; your two hands add pitch-shifted copies of it — but instead of a fixed stack, each voice snaps to the chord sounding RIGHT NOW, read from the take's own chord track, so the fan stays diatonic to the harmony and re-voices live as it moves. Hand separation is harmonic spread; hand height swells the voices and the flow energy; hand speed breathes a gentle shimmer and stirs vortices. The current's hue tracks the harmony — warming over major chords, cooling over minor ones."
        howTo={[
          "Bring your hands together to hear the take clear, in unison",
          "Pull your hands apart to fan it open into a chord diatonic to the moment",
          "Hold through a chord change and hear (and see) the stack re-voice",
          "Raise both hands to swell the harmony and quicken the current",
          "Press f for fullscreen, i for info",
        ]}
      />

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The recording plays back at rate 1.0 through a dry path that is never
                touched — its pitch and melody are always exactly Karel&apos;s take. The
                harmony is <strong>added</strong>: four granular pitch-shifters read the
                same decoded buffer and transpose it. What makes this cycle different is
                that the stack is <strong>chord-aware</strong>.
              </p>
              <p>
                On play, the piece also fetches the take&apos;s own{" "}
                <strong>chord track</strong> from its analysis. Each frame it finds the
                chord sounding at the current playback position, parses that (often messy)
                symbol into a set of pitch classes, and snaps the four voice anchors
                (≈third, ≈fifth, ≈octave, ≈tenth) to the <strong>nearest chord tone</strong>.
                Transposing the whole take by an interval that lies between chord tones
                keeps chord tones landing on chord tones, so the fan stays diatonic to this
                chord. When the chord changes, the targets change and the stack re-voices.
              </p>
              <p>
                Each shifter carries its whole transposition on the a-rate{" "}
                <code>detune</code> parameter (semitones = 0), so re-voicing is a smooth
                glissando rather than a jump. A tiny ±cents shimmer, driven by hand speed,
                rides on top without pulling a voice out of the chord.
              </p>
              <p>
                <strong>Your hands harmonize.</strong> The distance between your two hands
                is the harmonic spread: together → unison; as they part, the voices fan in
                one by one. Average hand height is the overall level of the added voices and
                the energy of the flow; hand speed stirs vortices and breathes the shimmer.
              </p>
              <p>
                <strong>The current.</strong> ~200,000 particles are advected on the GPU by
                a divergence-free velocity field, v = curl(potential), where the potential
                is 2-octave value noise in space and time. Because the field is
                incompressible by construction, the flow is unconditionally stable — it
                never explodes.
              </p>
              <p>
                <strong>Palette — harmonic-chroma.</strong> The current&apos;s hue tracks
                the harmony: a low-saturation, pearlescent tint set by the chord root around
                the circle of fifths, warming over major chords and cooling over minor ones,
                drifting gently so color never snaps. Deep near-black background preserved —
                restrained, not a rainbow.
              </p>
              <p>
                <strong>References.</strong> Bridson, Hourihan &amp; Nordenstam (2007),{" "}
                <em>Curl-Noise for Procedural Fluid Flow</em> (SIGGRAPH). Harmony-aware
                anchor: MIDIBack (arXiv:2609.28008, 2026-09-23).
              </p>
              <p>
                <strong>Degrades.</strong> No WebGPU adapter → a reduced Canvas2D current
                with the identical hands → harmonizer chain. No camera / denied / model fail
                → a labelled autonomous demo drive. No AudioWorklet → the dry take still
                plays and the current still flows. No chord analysis → a fixed consonant
                stack and a neutral tint, noted on screen.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
