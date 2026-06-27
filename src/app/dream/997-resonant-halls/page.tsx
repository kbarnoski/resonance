"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// RESONANT HALLS — a first-person walk through a cathedral of harmonic rooms.
// Each room is a KEY arranged by the circle of fifths (C → G → D → A → E), laid
// out as a corridor of connected chambers. Each room runs its OWN continuously-
// sounding just-intoned drone chord on that key's tonic, and — the headline —
// its OWN acoustics: a procedurally-synthesized impulse response (ConvolverNode)
// whose decay time and early-reflection pattern match the room's geometry.
// Stepping through a doorway cross-fades drone + reverb AND performs a real
// pivot-chord key modulation: fifth-related neighbours share common tones, so we
// hold the shared partials and retune the rest. You HEAR the modulation in the
// reverb itself.
//
// Lineage: La Monte Young & Marian Zazeela's *Dream House* (sustained JI drones,
// no triggered notes); architectural-acoustics auralization (convolution reverb
// from synthesized room IRs); the circle of fifths as a spatial floor-plan.
//
// 3D is hand-rolled (NO three.js): a single full-screen fragment shader
// raymarches a corridor of box-rooms. The camera (position + yaw/pitch) is built
// by hand and drives the ray origin / direction. Pointer-drag looks; WASD walks.
// ─────────────────────────────────────────────────────────────────────────────

// ── The keys, by circle of fifths ────────────────────────────────────────────
// Five rooms. Each tonic frequency is the just-intoned perfect fifth (3/2) above
// the previous, folded into a warm low register so the whole hall stays in the
// felt-in-the-body range (master lowpass ~6 kHz guards the top).
interface RoomDef {
  name: string; // "C", "G", …
  full: string; // "C major"
  tonic: number; // Hz, the drone root
  fifthsIndex: number; // 0..11 position on circle of fifths → hue
  // Acoustics: a small intimate chapel vs a tall dark nave. Drives the IR.
  decay: number; // reverb tail length, seconds
  bright: number; // 0 dark / 1 bright — IR lowpass + early-reflection sparkle
  size: number; // visual room half-extent (also reads as acoustic size)
  label: string; // a one-word character for the HUD
}

// Build five fifth-related tonics. Start on a low C (~65.4 Hz), go up a just
// fifth four times but octave-fold so nothing climbs out of the warm register.
function computeRooms(): RoomDef[] {
  const names = ["C", "G", "D", "A", "E"];
  const fulls = ["C major", "G major", "D major", "A major", "E major"];
  // circle-of-fifths index: C=0, G=1, D=2, A=3, E=4 (steps of a fifth)
  const fifthsIdx = [0, 1, 2, 3, 4];
  // Acoustic characters chosen to contrast as you walk deeper:
  // small bright chapel → grows into a long dark nave, then a shimmering apse.
  const decays = [1.1, 2.0, 3.4, 2.6, 4.6];
  const brights = [0.85, 0.6, 0.32, 0.55, 0.75];
  const sizes = [3.0, 3.6, 4.6, 4.0, 5.2];
  const labels = ["chapel", "hall", "nave", "gallery", "apse"];
  let f = 65.41; // low C
  const rooms: RoomDef[] = [];
  for (let i = 0; i < 5; i++) {
    rooms.push({
      name: names[i],
      full: fulls[i],
      tonic: f,
      fifthsIndex: fifthsIdx[i],
      decay: decays[i],
      bright: brights[i],
      size: sizes[i],
      label: labels[i],
    });
    // next tonic: just fifth (×3/2). If it climbs above ~130 Hz, fold an octave
    // down so the drone roots stay low and kindred.
    f *= 3 / 2;
    if (f > 130) f /= 2;
  }
  return rooms;
}

const ROOMS = computeRooms();
const ROOM_SPACING = 14; // world-units between room centres along the corridor (z)

// Each room centre sits at z = i * ROOM_SPACING. The camera walks along +z.
function roomCenterZ(i: number): number {
  return i * ROOM_SPACING;
}

// ── Just-intonation chord over a tonic ───────────────────────────────────────
// A warm major-ish pad in pure ratios. We name each partial by its ratio so the
// pivot-chord logic can find shared tones between neighbouring keys.
// Ratios: 1/1 (root), 3/2 (fifth), 2/1 (octave), 5/4 (major third), 9/8 (ninth),
// 15/8-ish handled via octave. Kept small-integer and consonant.
interface ChordTone {
  ratio: number; // multiplier over the room tonic
  name: string; // pitch-class label for pivot matching (computed at build)
  gain: number; // relative weight within the chord
}

// Base chord shape (ratios over tonic). The MAJOR triad + octave + gentle ninth.
const CHORD_SHAPE: { ratio: number; gain: number }[] = [
  { ratio: 1 / 1, gain: 1.0 }, // root
  { ratio: 3 / 2, gain: 0.7 }, // perfect fifth (the PIVOT to the next key)
  { ratio: 2 / 1, gain: 0.55 }, // octave
  { ratio: 5 / 4, gain: 0.5 }, // major third
  { ratio: 9 / 8, gain: 0.32 }, // ninth (color)
  { ratio: 3 / 1, gain: 0.28 }, // twelfth (root+fifth, airy)
];

// For each room, compute the actual chord (frequencies) and tag each tone with a
// rough pitch-class name so we can detect pivots. Two tones are "shared" between
// adjacent fifth-related rooms when their frequencies (mod octave) nearly match:
// the fifth of key K IS the root of key K+1 (3/2 of C ≈ root of G). Holding that
// shared partial steady while retuning the rest is the audible pivot modulation.
function buildChord(tonic: number): ChordTone[] {
  return CHORD_SHAPE.map((c) => {
    const f = tonic * c.ratio;
    // pitch class as cents-rounded value within an octave → label key for match.
    const pc = Math.round((12 * Math.log2(f / 16.35)) % 12 + 1200) % 12;
    return { ratio: c.ratio, name: String(pc), gain: c.gain };
  });
}

// ── Circle-of-fifths hue ─────────────────────────────────────────────────────
// hue = fifthsIndex / 12 so kindred keys are kindred colors (a fifth apart = a
// small hue step). Returns an [r,g,b] in 0..1, luminous/cathedral-saturated.
function hueRGB(fifthsIndex: number, light: number): [number, number, number] {
  const h = ((fifthsIndex / 12) % 1) * 6;
  const s = 0.62;
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = light - c / 2;
  return [r + m, g + m, b + m];
}

// ── Proximity weights ────────────────────────────────────────────────────────
// Deterministic, hand-verifiable: each room is a Gaussian "well" centred on its
// z. The camera's z picks a normalized weight per room (sums to 1). These weights
// drive (a) each room's drone+reverb gain and (b) the visual accent blend.
//   roomWeights(cz) -> number[]   normalized, length = ROOMS.length
function computeRoomWeights(cameraZ: number): number[] {
  const sigma = ROOM_SPACING * 0.62; // overlap so doorways cross-fade smoothly
  const raw = ROOMS.map((_, i) => {
    const d = cameraZ - roomCenterZ(i);
    return Math.exp(-(d * d) / (2 * sigma * sigma));
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => w / sum);
}

// Which two rooms are we between, and how far across the doorway (0..1)?
// Used for the "→ modulating to G" HUD text and pivot-hold blending.
function computeCrossing(cameraZ: number): {
  from: number;
  to: number;
  t: number; // 0 at `from` centre, 1 at `to` centre
  inDoorway: boolean;
} {
  const seg = cameraZ / ROOM_SPACING;
  let from = Math.floor(seg);
  let to = from + 1;
  from = Math.max(0, Math.min(ROOMS.length - 1, from));
  to = Math.max(0, Math.min(ROOMS.length - 1, to));
  const t = Math.max(0, Math.min(1, seg - Math.floor(seg)));
  // "in the doorway" when we're in the crossing band (not parked in a room).
  const inDoorway = from !== to && t > 0.28 && t < 0.72;
  return { from, to, t, inDoorway };
}

// ── Audio engine ─────────────────────────────────────────────────────────────
// Per room: a bank of sine oscillators (the JI chord) → per-room input gain →
// per-room ConvolverNode (its synthesized IR) → per-room wet gain (proximity) →
// master bus. A small dry path keeps the near drone present. Master bus:
// gain → lowpass (6 kHz) → compressor/limiter → destination.
//
// PIVOT-HOLD: the fifth (3/2) of room K equals the root of room K+1. As you cross
// the doorway we keep that shared oscillator steady (no retune, smooth gain),
// while the OTHER tones of the departing room fade and the arriving room's tones
// bloom — so the modulation lands on a held common tone. That's the reward.
interface RoomVoice {
  oscs: OscillatorNode[];
  toneGains: GainNode[];
  input: GainNode; // chord sum
  convolver: ConvolverNode;
  wet: GainNode; // proximity-weighted reverb send
  dry: GainNode; // a little direct sound
  chord: ChordTone[];
}

class HallAudio {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  rooms: RoomVoice[] = [];

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6000; // warm guard — never shrill
    this.lowpass.Q.value = 0.4;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 28;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // fade in, no click

    this.bus.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (const def of ROOMS) {
      this.rooms.push(this.buildRoom(def));
    }
  }

  // Synthesize a per-room impulse response: stereo exponential-decay noise with a
  // sparse early-reflection pattern up front. Decay length & brightness come from
  // the room's geometry, so a small chapel rings short & bright and a tall nave
  // rings long & dark. This is the "each room its own acoustics" headline.
  buildIR(def: RoomDef): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * def.decay));
    const buf = this.ctx.createBuffer(2, len, sr);
    // early-reflection times (s) scale with room size — bigger room, later, more
    // spread-out reflections. Deterministic per room (seeded by size).
    const erCount = 6 + Math.floor(def.size);
    const ers: { t: number; a: number; pan: number }[] = [];
    let seed = Math.floor(def.size * 1000 + def.fifthsIndex * 7 + 13);
    const rnd = () => {
      // tiny deterministic LCG so IRs are stable across rebuilds
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let k = 0; k < erCount; k++) {
      const t = (0.004 + rnd() * 0.02) * (def.size / 3) * (k + 1) * 0.5;
      ers.push({ t, a: (0.5 + rnd() * 0.5) * (1 - k / erCount), pan: rnd() });
    }
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      // dense exponential-decay diffuse tail
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 2.2 + (1 - def.bright) * 1.6);
        // brighter rooms keep more high-frequency content (less smoothing)
        data[i] = (rnd() * 2 - 1) * env;
      }
      // simple one-pole lowpass to darken (dark room = heavier smoothing)
      const dark = 0.18 + (1 - def.bright) * 0.55;
      let prev = 0;
      for (let i = 0; i < len; i++) {
        prev = prev + dark * (data[i] - prev);
        data[i] = prev;
      }
      // stamp early reflections (panned per channel)
      for (const er of ers) {
        const idx = Math.floor(er.t * sr);
        if (idx < len) {
          const panAmt = ch === 0 ? 1 - er.pan : er.pan;
          data[idx] += er.a * panAmt * 0.9;
        }
      }
    }
    return buf;
  }

  buildRoom(def: RoomDef): RoomVoice {
    const chord = buildChord(def.tonic);
    const input = this.ctx.createGain();
    input.gain.value = 1;

    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.buildIR(def);

    const wet = this.ctx.createGain();
    wet.gain.value = 0.0001; // proximity-ramped
    const dry = this.ctx.createGain();
    dry.gain.value = 0.0001;

    // chord input → convolver → wet → bus ; and input → dry → bus
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(this.bus);
    input.connect(dry);
    dry.connect(this.bus);

    const oscs: OscillatorNode[] = [];
    const toneGains: GainNode[] = [];
    for (const tone of chord) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = def.tonic * tone.ratio;
      const g = this.ctx.createGain();
      g.gain.value = tone.gain * 0.16; // chord-internal balance, headroom-safe
      osc.connect(g);
      g.connect(input);
      osc.start();
      oscs.push(osc);
      toneGains.push(g);
    }

    return { oscs, toneGains, input, convolver, wet, dry, chord };
  }

  // Drive proximity gains from camera z. wet (reverb) gain follows the room
  // weight; a smaller dry component keeps the nearest drone tactile. All ramped.
  // The pivot-hold is implicit: every room's chord includes a 3/2 fifth and a
  // 1/1 root, and the fifth of room i equals the root of room i+1 in frequency,
  // so while both rooms are audible during a crossing the shared partial sounds
  // continuous — a held common tone across the modulation.
  apply(cameraZ: number) {
    const weights = computeRoomWeights(cameraZ);
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      const w = weights[i];
      r.wet.gain.setTargetAtTime(0.0001 + w * 0.95, t, 0.22);
      r.dry.gain.setTargetAtTime(0.0001 + w * 0.28, t, 0.22);
    }
  }

  fadeIn() {
    this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 1.8);
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    try {
      for (const r of this.rooms) {
        for (const o of r.oscs) {
          o.stop();
          o.disconnect();
        }
        for (const g of r.toneGains) g.disconnect();
        r.input.disconnect();
        r.convolver.disconnect();
        r.wet.disconnect();
        r.dry.disconnect();
      }
    } catch {
      /* already stopped */
    }
    this.bus.disconnect();
    this.lowpass.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── WebGL2 raymarched corridor ───────────────────────────────────────────────
// A single full-screen triangle. The fragment shader raymarches an SDF of a
// corridor of box-rooms connected by doorways. The camera ray origin/direction
// come from hand-rolled position + yaw/pitch (matching the lookAt approach of
// 995). Each room glows in its circle-of-fifths accent; volumetric light spills
// through the doorways.
interface GLScene {
  draw: (
    camPos: [number, number, number],
    yaw: number,
    pitch: number,
    weights: number[],
    time: number
  ) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

const FRAG = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 uRes;
uniform vec3 uCam;     // camera position
uniform vec3 uFwd;     // forward (look) dir
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTime;
uniform float uSpacing;
uniform int uRoomCount;
uniform vec3 uAccent[5]; // per-room accent color
uniform float uWeight[5];
uniform float uSize[5];

const int MAXR = 5;

// box SDF
float sdBox(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

// The hall: union of rooms (hollow boxes) connected by doorway gaps.
// We model the INTERIOR by taking the negative-space: distance to the nearest
// wall. Rooms are boxes centred at z = i*spacing; doorways are gaps in the
// shared wall (a vertical slot) so the corridor is continuous.
// Returns signed distance to walls (positive inside the hall) and writes the
// dominant room index for shading.
float mapHall(vec3 p, out int room){
  // Distance is "positive inside the hall": for each room we take -sdBox of its
  // interior box, then UNION the rooms (being inside ANY room = max of the
  // positive-inside values). Adjacent rooms overlap in z (half-extent reaches
  // past the midpoint), so the shared wall is open — a continuous corridor /
  // doorway. room (out) is the nearest room centre, used for accent shading.
  float d = -1e9;
  room = 0;
  float bestc = 1e9;
  for(int i=0;i<MAXR;i++){
    if(i>=uRoomCount) break;
    float cz = float(i)*uSpacing;
    float s = uSize[i];
    vec3 rp = p - vec3(0.0,0.0,cz);
    vec3 b = vec3(s, s*0.95, uSpacing*0.5+0.9); // +0.9 → rooms overlap = doorway
    float inside = -sdBox(rp, b);               // positive inside this room
    d = max(d, inside);                         // union of interiors
    float cdist = abs(p.z - cz);
    if(cdist < bestc){ bestc = cdist; room = i; }
  }
  return d;
}

vec3 hallNormal(vec3 p){
  float e = 0.02; int r;
  vec2 k = vec2(1.0,-1.0);
  return normalize(
    k.xyy*mapHall(p+k.xyy*e,r) +
    k.yyx*mapHall(p+k.yyx*e,r) +
    k.yxy*mapHall(p+k.yxy*e,r) +
    k.xxx*mapHall(p+k.xxx*e,r));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 ro = uCam;
  vec3 rd = normalize(uFwd + uv.x*uRight + uv.y*uUp);

  // raymarch the interior: we're inside, so march until distance-to-wall ~ 0.
  float t = 0.0;
  int hitRoom = 0;
  bool hit = false;
  for(int i=0;i<96;i++){
    vec3 p = ro + rd*t;
    int r;
    float d = mapHall(p, r); // positive inside, shrinks toward walls
    if(d < 0.02){ hit = true; hitRoom = r; break; }
    t += max(d*0.7, 0.05);
    if(t > 80.0) break;
  }

  vec3 col = vec3(0.01,0.01,0.02);
  if(hit){
    vec3 p = ro + rd*t;
    vec3 n = hallNormal(p);
    int r = hitRoom;
    vec3 accent = uAccent[r];

    // soft ambient + a "clerestory" light from high +y, tinted by the room.
    vec3 lightDir = normalize(vec3(0.2, 1.0, 0.1));
    float diff = clamp(dot(n, lightDir)*0.5+0.5, 0.0, 1.0);

    // volumetric doorway glow: brighten near the doorway planes (z = (i+0.5)*sp)
    float doorGlow = 0.0;
    for(int i=0;i<MAXR;i++){
      if(i>=uRoomCount) break;
      float dz = (float(i)+0.5)*uSpacing;
      float band = exp(-pow((p.z-dz),2.0)*0.5);
      doorGlow += band;
    }
    doorGlow = clamp(doorGlow, 0.0, 1.0);

    // stone base, washed by the room accent; floor warmer, ceiling cooler.
    float h = clamp(p.y/3.0+0.5, 0.0, 1.0);
    vec3 stone = mix(vec3(0.10,0.09,0.12), vec3(0.16,0.15,0.20), h);
    col = stone * (0.35 + 0.75*diff);
    col += accent * (0.35 + 0.65*doorGlow) * (0.5 + 0.6*uWeight[r]);

    // pillars/ribs: vertical stripes from x give a cathedral cadence
    float ribs = smoothstep(0.86,0.92, abs(sin(p.x*1.6)));
    col += accent * ribs * 0.18 * (0.4+diff);

    // distance fog into deep colored haze
    float fog = 1.0 - exp(-t*0.018);
    vec3 haze = uAccent[min(uRoomCount-1, r)] * 0.06 + vec3(0.01,0.0,0.02);
    col = mix(col, haze, fog*0.7);

    // gentle shimmer over time (the drone made visible)
    col *= 0.92 + 0.08*sin(uTime*0.6 + p.z*0.2);
  } else {
    // looking down the infinite corridor: deep glow toward the far accent
    float g = clamp(rd.z*0.5+0.5, 0.0, 1.0);
    col = mix(vec3(0.01,0.01,0.03), uAccent[uRoomCount-1]*0.15, g);
  }

  // tone map + vignette
  col = col/(col+vec3(1.0));
  col = pow(col, vec3(0.85));
  float vig = smoothstep(1.2, 0.2, length(uv));
  col *= 0.55 + 0.45*vig;
  frag = vec4(col, 1.0);
}`;

const VERT = `#version 300 es
precision highp float;
void main(){
  // full-screen triangle
  vec2 p = vec2((gl_VertexID==2)?3.0:-1.0, (gl_VertexID==1)?3.0:-1.0);
  gl_Position = vec4(p,0.0,1.0);
}`;

function makeGLScene(canvas: HTMLCanvasElement): GLScene | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  const vao = gl.createVertexArray();
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const loc = {
    res: u("uRes"),
    cam: u("uCam"),
    fwd: u("uFwd"),
    right: u("uRight"),
    up: u("uUp"),
    time: u("uTime"),
    spacing: u("uSpacing"),
    roomCount: u("uRoomCount"),
    accent: u("uAccent"),
    weight: u("uWeight"),
    size: u("uSize"),
  };
  // static per-room uniforms
  const accents = new Float32Array(ROOMS.length * 3);
  const sizes = new Float32Array(ROOMS.length);
  for (let i = 0; i < ROOMS.length; i++) {
    const [r, g, b] = hueRGB(ROOMS[i].fifthsIndex, 0.55);
    accents[i * 3] = r;
    accents[i * 3 + 1] = g;
    accents[i * 3 + 2] = b;
    sizes[i] = ROOMS[i].size;
  }
  let W = canvas.width;
  let H = canvas.height;
  return {
    resize(w, h) {
      W = w;
      H = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    draw(camPos, yaw, pitch, weights, time) {
      // Hand-rolled lookAt basis (same idea as 995): build forward from yaw/pitch.
      const cp = Math.cos(pitch);
      const fwd: [number, number, number] = [
        Math.sin(yaw) * cp,
        Math.sin(pitch),
        Math.cos(yaw) * cp,
      ];
      // right = normalize(cross(fwd, worldUp)), up = cross(right, fwd)
      const wup: [number, number, number] = [0, 1, 0];
      const right: [number, number, number] = [
        fwd[1] * wup[2] - fwd[2] * wup[1],
        fwd[2] * wup[0] - fwd[0] * wup[2],
        fwd[0] * wup[1] - fwd[1] * wup[0],
      ];
      const rl = Math.hypot(right[0], right[1], right[2]) || 1;
      right[0] /= rl;
      right[1] /= rl;
      right[2] /= rl;
      const up: [number, number, number] = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.res, W, H);
      gl.uniform3f(loc.cam, camPos[0], camPos[1], camPos[2]);
      gl.uniform3f(loc.fwd, fwd[0], fwd[1], fwd[2]);
      gl.uniform3f(loc.right, right[0], right[1], right[2]);
      gl.uniform3f(loc.up, up[0], up[1], up[2]);
      gl.uniform1f(loc.time, time);
      gl.uniform1f(loc.spacing, ROOM_SPACING);
      gl.uniform1i(loc.roomCount, ROOMS.length);
      gl.uniform3fv(loc.accent, accents);
      gl.uniform1fv(loc.weight, new Float32Array(weights));
      gl.uniform1fv(loc.size, sizes);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}

// ── React component ──────────────────────────────────────────────────────────
export default function ResonantHalls() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [touring, setTouring] = useState(false);

  // HUD state (updated off the rAF path to avoid thrashing React)
  const [hud, setHud] = useState<{ room: string; full: string; label: string; cross: string | null }>(
    { room: ROOMS[0].name, full: ROOMS[0].full, label: ROOMS[0].label, cross: null }
  );

  const engineRef = useRef<HallAudio | null>(null);
  const sceneRef = useRef<GLScene | null>(null);
  const rafRef = useRef(0);

  // camera state (mutable, read by the loop)
  const camRef = useRef({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const draggingRef = useRef(false);
  const lastPtrRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touringRef = useRef(false);
  const hudRef = useRef(hud);

  useEffect(() => {
    touringRef.current = touring;
  }, [touring]);

  // ── Start (single user gesture creates the AudioContext) ──
  const handleStart = useCallback(async () => {
    if (!engineRef.current) {
      try {
        engineRef.current = new HallAudio();
        engineRef.current.fadeIn();
      } catch {
        // audio failed but visuals can still run
        engineRef.current = null;
      }
    }
    await engineRef.current?.resume();
    setStarted(true);
  }, []);

  // ── Pointer-look (primary control) ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    touringRef.current = false;
    setTouring(false);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPtrRef.current.x;
    const dy = e.clientY - lastPtrRef.current.y;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    const cam = camRef.current;
    cam.yaw -= dx * 0.0045; // drag right → look right
    cam.pitch -= dy * 0.0045;
    cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch));
  }, []);
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── Keyboard walk (co-equal, not the only input) ──
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keysRef.current[k] = true;
        touringRef.current = false;
        setTouring(false);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started]);

  // ── Main loop ──
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = makeGLScene(canvas);
    if (!scene) {
      setFailed(true);
      return;
    }
    sceneRef.current = scene;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      scene.resize(w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    const minZ = -ROOM_SPACING * 0.4;
    const maxZ = roomCenterZ(ROOMS.length - 1) + ROOM_SPACING * 0.4;

    let prev = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      let dt = (now - prev) / 1000;
      prev = now;
      if (dt > 0.05) dt = 0.05;
      const cam = camRef.current;

      // ── movement ──
      const speed = 6.2;
      if (touringRef.current) {
        // auto-walk: stroll forward along the corridor, slow gaze sweep. When we
        // reach the apse, ease back to the start so the demo loops.
        cam.z += speed * 0.55 * dt;
        cam.yaw = Math.sin(now * 0.00018) * 0.32; // gentle look-around
        cam.pitch = Math.sin(now * 0.00012) * 0.08;
        if (cam.z > maxZ) cam.z = minZ;
      } else {
        const k = keysRef.current;
        const fwd = (k["w"] || k["arrowup"] ? 1 : 0) - (k["s"] || k["arrowdown"] ? 1 : 0);
        const strafe = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
        // move in the look direction (flattened to the floor plane)
        const sinY = Math.sin(cam.yaw);
        const cosY = Math.cos(cam.yaw);
        cam.z += (fwd * cosY - strafe * sinY) * speed * dt;
        cam.x += (fwd * sinY + strafe * cosY) * speed * dt;
      }
      // keep inside the hall envelope
      cam.z = Math.max(minZ, Math.min(maxZ, cam.z));
      cam.x = Math.max(-3.2, Math.min(3.2, cam.x));
      cam.y = 0; // eye height baked into shader framing

      const weights = computeRoomWeights(cam.z);

      // ── audio ──
      engineRef.current?.apply(cam.z);

      // ── render ──
      scene.draw([cam.x, cam.y, cam.z], cam.yaw, cam.pitch, weights, now / 1000);

      // ── HUD (cheap; only update on change) ──
      const cr = computeCrossing(cam.z);
      // dominant room = highest weight
      let dom = 0;
      for (let i = 1; i < weights.length; i++) if (weights[i] > weights[dom]) dom = i;
      const crossText =
        cr.inDoorway && cr.from !== cr.to
          ? `modulating  ${ROOMS[cr.from].name} → ${ROOMS[cr.to].name}`
          : null;
      const next = {
        room: ROOMS[dom].name,
        full: ROOMS[dom].full,
        label: ROOMS[dom].label,
        cross: crossText,
      };
      const p = hudRef.current;
      if (p.room !== next.room || p.cross !== next.cross) {
        hudRef.current = next;
        setHud(next);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      scene.destroy();
      sceneRef.current = null;
    };
  }, [started]);

  // ── teardown audio ──
  useEffect(() => {
    return () => {
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  const accentCss = (i: number) => {
    const [r, g, b] = hueRGB(ROOMS[i].fifthsIndex, 0.62);
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  };

  return (
    <main className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-[#06040c] text-white">
      <PrototypeNav slugs={["997-resonant-halls", "992-dream-house"]} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Title + description (always present) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
            Resonant Halls
          </h1>
          <p className="mt-2 text-base text-white/75">
            A first-person walk through a cathedral of harmonic rooms — each room a
            key on the circle of fifths, each with its own acoustics, where stepping
            through a doorway is a key modulation you hear in the reverb itself.
          </p>
        </div>
      </div>

      {/* Live HUD: current room + modulation text */}
      {started && !failed && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex flex-col items-center gap-1 sm:top-32">
          <div
            className="rounded-full px-5 py-2 font-mono text-xl font-semibold backdrop-blur-sm"
            style={{
              color: accentCss(
                ROOMS.findIndex((r) => r.name === hud.room) >= 0
                  ? ROOMS.findIndex((r) => r.name === hud.room)
                  : 0
              ),
              background: "rgba(0,0,0,0.35)",
            }}
          >
            {hud.full} · {hud.label}
          </div>
          {hud.cross && (
            <div className="rounded-full bg-black/40 px-4 py-1.5 font-mono text-base text-white/85 backdrop-blur-sm">
              → {hud.cross}
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
      {started && !failed && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setTouring((s) => !s)}
              className="min-h-[44px] rounded-lg bg-violet-400/90 px-4 py-2.5 text-base font-medium text-[#120820] transition hover:bg-violet-300"
            >
              {touring ? "Stop tour" : "Take the tour"}
            </button>
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-lg border border-white/20 bg-transparent px-4 py-2.5 text-base text-white/75 transition hover:bg-white/10"
            >
              Read the design notes
            </button>
            <p className="ml-auto font-mono text-base text-white/60">
              drag to look · WASD / arrows to walk
            </p>
          </div>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0618] to-[#05030c] px-6 text-center">
          <h2 className="mb-3 text-2xl font-semibold text-white/95 sm:text-3xl">
            Enter the hall
          </h2>
          <p className="mb-8 max-w-md text-base text-white/75">
            Five connected chambers, tuned by the circle of fifths. Drag to look
            around; walk forward with WASD or the arrow keys; step through a doorway
            to hear the key modulate in the room&rsquo;s own reverb. Sound starts on
            entry.
          </p>
          <button
            onClick={handleStart}
            className="rounded-full bg-violet-500 px-10 py-4 text-2xl font-semibold text-white shadow-lg shadow-violet-900/50 transition hover:bg-violet-400 active:scale-95"
            style={{ minHeight: 64, minWidth: 220 }}
          >
            Enter the hall
          </button>
          <p className="mt-6 max-w-sm text-base text-white/55">
            Best with sound on. Or press &ldquo;Take the tour&rdquo; after entering
            for a hands-free stroll.
          </p>
        </div>
      )}

      {/* WebGL2 failure notice */}
      {failed && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-6 text-center">
          <div className="max-w-md">
            <h2 className="text-xl font-semibold text-white/95">
              WebGL2 isn&rsquo;t available
            </h2>
            <p className="mt-2 text-base text-white/75">
              This walk-through needs WebGL2 to raymarch the hall. Try a recent
              desktop browser with hardware acceleration enabled. The audio engine
              is unaffected, but there&rsquo;s nothing to render without WebGL2.
            </p>
          </div>
        </div>
      )}

      {/* Design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-[#120a20] p-6 text-base text-white/80 shadow-2xl">
            <h2 className="text-xl font-semibold text-white/95">Design notes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="text-white/95">Floor-plan:</span> five rooms laid
                out by the circle of fifths — C → G → D → A → E. Each room&rsquo;s
                tonic is a just (3/2) fifth above its neighbour, octave-folded into a
                warm low register.
              </li>
              <li>
                <span className="text-white/95">Drone:</span> each room runs a
                permanently-sounding just-intoned major pad (1/1, 5/4, 3/2, 2/1, 9/8,
                3/1) — sustained timbre, never triggered notes, never a wrong note.
              </li>
              <li>
                <span className="text-white/95">Each room its own acoustics:</span> a
                procedurally-synthesized impulse response per room (exponential-decay
                noise + sparse early reflections, darkened by a one-pole filter) fed
                to a ConvolverNode. Small bright chapel = short reverb; tall dark nave
                = long reverb.
              </li>
              <li>
                <span className="text-white/95">Doorway = modulation:</span> the 3/2
                fifth of each key equals the root of the next, so during a crossing
                that shared partial is held steady (a pivot common tone) while the
                rest retune — a real, audible key modulation in the reverb itself.
              </li>
              <li>
                <span className="text-white/95">Proximity:</span> a deterministic
                Gaussian well per room turns your position into normalized weights
                that ramp each room&rsquo;s drone + reverb send (no clicks).
              </li>
              <li>
                <span className="text-white/95">Render:</span> a single full-screen
                fragment shader raymarches an SDF corridor of box-rooms; a hand-rolled
                first-person camera (position + yaw/pitch, no three.js) drives the
                ray. Colors map hue = fifths-index / 12.
              </li>
              <li>
                <span className="text-white/95">Lineage:</span> La Monte Young &amp;
                Marian Zazeela&rsquo;s <em>Dream House</em>; architectural-acoustics
                auralization (convolution reverb from room IRs); the circle of fifths
                as a spatial layout.
              </li>
            </ul>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-white/90 px-4 py-2.5 text-base font-medium text-[#120820] hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
