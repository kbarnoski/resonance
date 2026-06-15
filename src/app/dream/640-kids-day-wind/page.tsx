"use client";

// A Day on the Wind — a cycle-2 deepening of "A Whole Day" (624-kids-day-meadow).
//
// One question: what if a 4-year-old TENDS a self-evolving day-meadow by
// TILTING the iPad — steering a glowing wind that PLANTS living things where it
// lingers AND PLAYS the garden like a wind-harp where it sweeps — with no
// touching at all?
//
// Two headline changes vs. 624:
//   1) INPUT is TILT (DeviceOrientation beta/gamma -> a breeze vector), with an
//      arrow-key fallback. No touch-to-act.
//   2) The wind both PLANTS (dwell) and PLAYS (sweep). Brushing already-planted
//      things rings their motifs in passing order = a wind-harp. The swept
//      order+timing is captured as a TRAVELING MOTIF that the wind replays,
//      re-voiced into the current time-of-day (procedural Motif-Memory
//      Retrieval, after MusicWeaver arXiv 2509.21714).
//
// Renderer: a single Canvas2D painterly side-on meadow diorama.
// Audio: a Chris-Wilson look-ahead scheduler over a kid-safe master chain.
// Self-contained — the diurnal engine + motif bank are reimplemented here.

import { useRef, useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const DAY_SECONDS = 540; // ~9 min for a full day at the settled rate
const PREVIEW_RATE = 13; // accelerated day-rate before first interaction
const MAX_THINGS = 24;
const IDLE_MS = 2500;
const DWELL_MS = 750; // wind must linger this long over empty ground to plant
const BRUSH_COOLDOWN = 0.12; // per-thing ring rate limit (s)
const TRAVEL_MAX = 8; // captured brushes kept in the traveling motif

// ===========================================================================
// ENGINE — diurnal phase machine + motif memory (compact reimplementation)
// ===========================================================================

type Kind = "flower" | "bird" | "star";

const REGIONS = ["dawn", "morning", "midday", "dusk", "night"] as const;
type RegionName = (typeof REGIONS)[number];

interface Region {
  scale: number[];
  rootMidi: number;
  bps: number;
  brightness: number;
  sky: [number, number, number][];
  cloud: [number, number, number];
}

const REGION_DATA: Record<RegionName, Region> = {
  // dawn — major pentatonic / lydian shimmer, deep-indigo -> rose, slow
  dawn: {
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19],
    rootMidi: 57,
    bps: 1.1,
    brightness: 0.32,
    sky: [
      [24, 22, 58],
      [86, 64, 110],
      [214, 138, 138],
    ],
    cloud: [220, 170, 180],
  },
  // morning — bright major, livelier, clear-blue
  morning: {
    scale: [0, 2, 4, 5, 7, 9, 11, 12, 16, 19],
    rootMidi: 60,
    bps: 1.7,
    brightness: 0.7,
    sky: [
      [86, 150, 222],
      [150, 196, 240],
      [214, 232, 248],
    ],
    cloud: [255, 255, 255],
  },
  // midday — fullest playful major, brightest
  midday: {
    scale: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19, 21],
    rootMidi: 62,
    bps: 2.0,
    brightness: 1.0,
    sky: [
      [96, 170, 236],
      [168, 214, 246],
      [226, 244, 252],
    ],
    cloud: [255, 255, 255],
  },
  // dusk — warm mixolydian / suspended, amber -> violet, slowing
  dusk: {
    scale: [0, 2, 4, 5, 7, 9, 10, 12, 14, 17],
    rootMidi: 59,
    bps: 1.3,
    brightness: 0.5,
    sky: [
      [70, 48, 96],
      [186, 96, 96],
      [240, 170, 96],
    ],
    cloud: [232, 150, 120],
  },
  // night — low glassy lullaby pentatonic + drone, near-black, slowest
  night: {
    scale: [0, 3, 5, 7, 10, 12, 15, 17],
    rootMidi: 50,
    bps: 0.85,
    brightness: 0.12,
    sky: [
      [6, 8, 26],
      [16, 20, 48],
      [30, 34, 66],
    ],
    cloud: [40, 48, 86],
  },
};

const REGION_CENTERS: Record<RegionName, number> = {
  dawn: 0.0,
  morning: 0.2,
  midday: 0.42,
  dusk: 0.64,
  night: 0.84,
};

function regionWeight(phase: number, center: number): number {
  let d = Math.abs(phase - center);
  if (d > 0.5) d = 1 - d;
  const w = Math.max(0, 1 - d / 0.26);
  return w * w * (3 - 2 * w); // smoothstep -> soft circular bump
}

interface DayState {
  phase: number;
  brightness: number;
  bps: number;
  rootMidi: number;
  scale: number[];
  sky: [number, number, number][];
  cloud: [number, number, number];
  sunAlt: number;
  moonAlt: number;
  starAlpha: number;
  dominant: RegionName;
}

/** Sample the full blended day-state at a phase in [0,1). */
function sampleDay(phase: number): DayState {
  const p = ((phase % 1) + 1) % 1;
  let total = 0;
  const weights: Record<RegionName, number> = {
    dawn: 0,
    morning: 0,
    midday: 0,
    dusk: 0,
    night: 0,
  };
  for (const r of REGIONS) {
    const w = regionWeight(p, REGION_CENTERS[r]);
    weights[r] = w;
    total += w;
  }
  if (total < 1e-4) {
    weights.dawn = 1;
    total = 1;
  }

  let brightness = 0;
  let bps = 0;
  let rootMidi = 0;
  const sky: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let cloud: [number, number, number] = [0, 0, 0];
  let dominant: RegionName = "dawn";
  let domW = -1;

  for (const r of REGIONS) {
    const w = weights[r] / total;
    const d = REGION_DATA[r];
    brightness += d.brightness * w;
    bps += d.bps * w;
    rootMidi += d.rootMidi * w;
    sky[0] = [
      sky[0][0] + d.sky[0][0] * w,
      sky[0][1] + d.sky[0][1] * w,
      sky[0][2] + d.sky[0][2] * w,
    ];
    sky[1] = [
      sky[1][0] + d.sky[1][0] * w,
      sky[1][1] + d.sky[1][1] * w,
      sky[1][2] + d.sky[1][2] * w,
    ];
    sky[2] = [
      sky[2][0] + d.sky[2][0] * w,
      sky[2][1] + d.sky[2][1] * w,
      sky[2][2] + d.sky[2][2] * w,
    ];
    cloud = [
      cloud[0] + d.cloud[0] * w,
      cloud[1] + d.cloud[1] * w,
      cloud[2] + d.cloud[2] * w,
    ];
    if (weights[r] > domW) {
      domW = weights[r];
      dominant = r;
    }
  }

  const sunAlt = Math.max(0, Math.cos(((p - 0.42) * Math.PI) / 0.5));
  let md = Math.abs(p - 0.9);
  if (md > 0.5) md = 1 - md;
  const moonAlt = Math.max(0, Math.cos((md * Math.PI) / 0.28));
  const starAlpha = Math.max(0, Math.min(1, (weights.night / total) * 1.4));

  return {
    phase: p,
    brightness,
    bps,
    rootMidi,
    scale: REGION_DATA[dominant].scale,
    sky,
    cloud,
    sunAlt,
    moonAlt: Math.min(1, moonAlt),
    starAlpha,
    dominant,
  };
}

// --- Motif memory bank -----------------------------------------------------

interface Motif {
  degrees: number[]; // abstract scale-degree indices
  rhythm: number[];
  octave: number;
}

interface Thing {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  hue: number;
  birthPhase: number;
  motif: Motif;
  wakeful: number; // smoothed 0..1 for visuals
  swayPhase: number;
  lastSungAt: number; // audio time of last scheduled/brushed note
  brushFlash: number; // visual flash when brushed (audio time)
  nextNoteIdx: number; // cursor through the (mutated) motif
}

let _seed = 9871234;
function rng() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

function makeMotif(kind: Kind): Motif {
  let degrees: number[];
  let rhythm: number[];
  let octave: number;
  if (kind === "flower") {
    degrees = [0, 2, 4].slice(0, 2 + Math.floor(rng() * 2));
    rhythm = degrees.map(() => 1 + Math.floor(rng() * 2));
    octave = 0;
  } else if (kind === "bird") {
    degrees = [4, 6, 5, 7].slice(0, 2 + Math.floor(rng() * 3));
    rhythm = degrees.map(() => (rng() < 0.5 ? 0.5 : 1));
    octave = 1;
  } else {
    degrees = [0, 3, 5].slice(0, 2 + Math.floor(rng() * 2));
    rhythm = degrees.map(() => 2 + Math.floor(rng() * 2));
    octave = -1;
  }
  return { degrees, rhythm, octave };
}

/** Re-voice an abstract scale-degree into the CURRENT region's scale + root. */
function voiceDegree(day: DayState, degree: number, octave: number): number {
  const scale = day.scale;
  const len = scale.length;
  let idx = degree;
  let oct = octave;
  while (idx >= len) {
    idx -= len;
    oct += 1;
  }
  while (idx < 0) {
    idx += len;
    oct -= 1;
  }
  const semis = scale[idx] + oct * 12;
  const midi = Math.round(day.rootMidi) + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Gently mutate a motif by age (transpose / ornament / thin) — non-destructive. */
function mutatedDegrees(motif: Motif, age: number): number[] {
  const m = Math.min(1, age);
  const out = motif.degrees.slice();
  const transpose = Math.round(m * 2);
  for (let i = 0; i < out.length; i++) out[i] += transpose;
  if (m > 0.5 && out.length > 1) out.splice(1, 0, out[0] + 1);
  if (m > 0.85 && out.length > 2) out.pop();
  return out;
}

function wakefulness(kind: Kind, day: DayState): number {
  const p = day.phase;
  const bump = (center: number, width: number) => {
    let d = Math.abs(p - center);
    if (d > 0.5) d = 1 - d;
    return Math.max(0, 1 - d / width);
  };
  if (kind === "flower") return Math.min(1, bump(0.32, 0.34));
  if (kind === "bird") return Math.min(1, bump(0.25, 0.26) * 1.1);
  return Math.min(1, bump(0.88, 0.2) * 1.3); // star: night only
}

// ===========================================================================
// AUDIO — kid-safe Web Audio chain + look-ahead scheduler primitives
// ===========================================================================

type Timbre = "bell" | "pluck" | "pad" | "breath";

interface KidAudio {
  ctx: AudioContext;
  tone: (
    when: number,
    freq: number,
    dur: number,
    gain: number,
    timbre: Timbre,
    pan?: number,
  ) => void;
  setBed: (rootHz: number, brightness: number, level: number) => void;
  resume: () => Promise<void>;
}

/** Build the kid-safe audio graph. Call INSIDE a user gesture for iOS unlock. */
function makeAudio(): KidAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // kid-safe master chain: gain(<=0.55) -> lowpass(<=7500) -> compressor -> out
  const master = ctx.createGain();
  master.gain.value = 0.0;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  lp.Q.value = 0.0001;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // gentle fade-in so nothing thumps on start
  master.gain.setValueAtTime(0.0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);

  // always-on ambient bed (two detuned oscillators + a sub)
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.0;
  const bedLp = ctx.createBiquadFilter();
  bedLp.type = "lowpass";
  bedLp.frequency.value = 800;
  bedLp.Q.value = 0.3;
  bedGain.connect(bedLp);
  bedLp.connect(master);

  const oscA = ctx.createOscillator();
  oscA.type = "triangle";
  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  const sub = ctx.createOscillator();
  sub.type = "sine";
  oscA.frequency.value = 110;
  oscB.frequency.value = 110;
  oscB.detune.value = 6;
  sub.frequency.value = 55;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain);
  lfoGain.connect(bedLp.frequency);

  oscA.connect(bedGain);
  oscB.connect(bedGain);
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain);
  subGain.connect(bedGain);

  oscA.start();
  oscB.start();
  sub.start();
  lfo.start();

  const setBed = (rootHz: number, brightness: number, level: number) => {
    const t = ctx.currentTime;
    const g = Math.max(0, Math.min(0.22, level));
    bedGain.gain.setTargetAtTime(g, t, 0.6);
    oscA.frequency.setTargetAtTime(rootHz, t, 1.2);
    oscB.frequency.setTargetAtTime(rootHz, t, 1.2);
    sub.frequency.setTargetAtTime(rootHz / 2, t, 1.2);
    const center = 400 + brightness * 1300;
    bedLp.frequency.setTargetAtTime(center, t, 1.5);
  };

  const tone: KidAudio["tone"] = (when, freq, dur, gain, timbre, pan = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));

    let peak = gain;
    let attack = 0.01;
    let release = dur;

    switch (timbre) {
      case "bell": {
        osc.type = "sine";
        attack = 0.005;
        release = dur * 1.6;
        peak = gain * 0.9;
        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 3.0;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0, when);
        g2.gain.linearRampToValueAtTime(peak * 0.18, when + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, when + release * 0.7);
        osc2.connect(g2);
        g2.connect(panner);
        osc2.start(when);
        osc2.stop(when + release + 0.1);
        break;
      }
      case "pluck": {
        osc.type = "triangle";
        attack = 0.004;
        release = dur * 1.1;
        peak = gain;
        break;
      }
      case "breath": {
        osc.type = "sine";
        attack = 0.08;
        release = dur * 1.2;
        peak = gain * 0.8;
        break;
      }
      case "pad":
      default: {
        osc.type = "triangle";
        attack = 0.06;
        release = dur * 1.3;
        peak = gain * 0.7;
      }
    }

    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + release);

    osc.connect(g);
    g.connect(panner);
    panner.connect(master);

    osc.start(when);
    osc.stop(when + release + 0.1);
  };

  const resume = async () => {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  };

  return { ctx, tone, setBed, resume };
}

// ===========================================================================
// Helpers (placement + color)
// ===========================================================================

function kindForY(y: number, h: number): Kind {
  const f = y / h;
  if (f > 0.62) return "flower";
  if (f > 0.34) return "bird";
  return "star";
}

function hueForKind(kind: Kind, y: number, h: number): number {
  const f = 1 - y / h;
  if (kind === "flower") return 320 - f * 80;
  if (kind === "bird") return 150 + f * 80;
  return 48;
}

// One brushed event remembered in the traveling motif.
interface TravelStep {
  degree: number; // abstract degree (from the brushed thing's motif)
  octave: number;
  kind: Kind;
  dt: number; // time since previous brush (s), for replay rhythm
}

// ===========================================================================
// COMPONENT
// ===========================================================================

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [needsTiltPerm, setNeedsTiltPerm] = useState(false);
  const [usingTilt, setUsingTilt] = useState(false);

  // --- mutable engine state held in refs ---
  const audioRef = useRef<KidAudio | null>(null);
  const thingsRef = useRef<Thing[]>([]);
  const idRef = useRef(1);
  const phaseRef = useRef(0);
  const rateRef = useRef(PREVIEW_RATE);
  const interactedRef = useRef(false);
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);
  const schedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastInputRef = useRef(0); // performance.now() of last real input
  const dayRef = useRef<DayState>(sampleDay(0));

  // --- wind spirit state ---
  const windRef = useRef({ x: 0.5, y: 0.5, vx: 0, vy: 0 }); // normalized 0..1
  const dwellRef = useRef({ x: 0.5, y: 0.5, since: 0 }); // dwell accumulator (s)
  // input vector (target breeze), normalized -1..1; set by tilt or keys
  const breezeRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const orientZeroRef = useRef<{ beta: number; gamma: number } | null>(null);

  // --- traveling motif memory (procedural MMR) ---
  const travelRef = useRef<TravelStep[]>([]);
  const lastBrushTimeRef = useRef(0); // perf time of last brush, for dt capture
  const travelReplayAtRef = useRef(0); // audio time of next replay note
  const travelCursorRef = useRef(0);

  // Plant a living thing at normalized coords. Immediate sound + bloom.
  const plant = useCallback((nx: number, ny: number, ghost = false) => {
    const cv = canvasRef.current;
    const audio = audioRef.current;
    if (!cv) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const x = nx * w;
    const y = ny * h;
    const kind = kindForY(y, h);
    const thing: Thing = {
      id: idRef.current++,
      kind,
      x,
      y,
      hue: hueForKind(kind, y, h),
      birthPhase: phaseRef.current,
      motif: makeMotif(kind),
      wakeful: 0,
      swayPhase: Math.random() * Math.PI * 2,
      lastSungAt: 0,
      brushFlash: 0,
      nextNoteIdx: 0,
    };
    const arr = thingsRef.current;
    arr.push(thing);
    if (arr.length > MAX_THINGS) arr.shift();

    if (!audio) return;
    const day = dayRef.current;
    const f = voiceDegree(day, thing.motif.degrees[0], thing.motif.octave);
    const t = audio.ctx.currentTime + 0.02;
    audio.tone(
      t,
      f,
      kind === "star" ? 1.6 : kind === "bird" ? 0.5 : 0.9,
      ghost ? 0.1 : 0.16,
      kind === "star" ? "bell" : kind === "bird" ? "pluck" : "pad",
      nx * 1.6 - 0.8,
    );
    thing.lastSungAt = t;
    thing.brushFlash = t;
  }, []);

  // Brush a thing: ring its next motif note NOW + remember it in the traveling
  // motif. Rate-limited per thing. Returns true if it actually rang.
  const brush = useCallback((th: Thing) => {
    const audio = audioRef.current;
    if (!audio) return false;
    const now = audio.ctx.currentTime;
    if (now - th.lastSungAt < BRUSH_COOLDOWN) return false;

    const day = dayRef.current;
    const age = (((day.phase - th.birthPhase) % 1) + 1) % 1;
    const degs = mutatedDegrees(th.motif, age);
    const step = th.nextNoteIdx % degs.length;
    const deg = degs[step];
    const f = voiceDegree(day, deg, th.motif.octave);
    const cv = canvasRef.current;
    const pan = cv ? (th.x / cv.clientWidth) * 1.6 - 0.8 : 0;
    const dur = th.kind === "star" ? 1.6 : th.kind === "bird" ? 0.42 : 0.7;
    audio.tone(
      now + 0.01,
      f,
      dur,
      0.15 * (th.kind === "bird" ? 0.9 : th.kind === "star" ? 1.05 : 1),
      th.kind === "star" ? "bell" : th.kind === "bird" ? "pluck" : "pad",
      pan,
    );
    th.lastSungAt = now;
    th.brushFlash = now;
    th.nextNoteIdx = th.nextNoteIdx + 1;

    // capture into the traveling motif (degree+octave+rhythm of the gesture)
    const pnow = performance.now();
    const dt = lastBrushTimeRef.current
      ? Math.min(1.2, (pnow - lastBrushTimeRef.current) / 1000)
      : 0.3;
    lastBrushTimeRef.current = pnow;
    const travel = travelRef.current;
    travel.push({ degree: deg, octave: th.motif.octave, kind: th.kind, dt });
    if (travel.length > TRAVEL_MAX) travel.shift();
    return true;
  }, []);

  // --- start (inside the user gesture for iOS audio unlock) ---
  const begin = useCallback(async () => {
    if (audioRef.current) return;
    let audio: KidAudio | null = null;
    try {
      audio = makeAudio();
      await audio.resume();
    } catch {
      audio = null; // no audio -> visuals still animate
    }
    audioRef.current = audio;
    lastTickRef.current = performance.now() / 1000;
    lastInputRef.current = performance.now();

    // iOS 13+ requires an explicit permission request from a user gesture.
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          setUsingTilt(true);
          setNeedsTiltPerm(false);
        } else {
          // denied -> offer a second tap to allow; keys work meanwhile
          setNeedsTiltPerm(true);
        }
      } catch {
        setNeedsTiltPerm(true);
      }
    }
    setStarted(true);
  }, []);

  const markInput = useCallback(() => {
    interactedRef.current = true;
    lastInputRef.current = performance.now();
  }, []);

  // --- DeviceOrientation + keyboard listeners ---
  useEffect(() => {
    if (!started) return;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!orientZeroRef.current) {
        // capture the neutral hold as zero
        orientZeroRef.current = { beta: e.beta, gamma: e.gamma };
        setUsingTilt(true);
        return;
      }
      const z = orientZeroRef.current;
      // gamma: left-right tilt; beta: front-back tilt
      const gx = (e.gamma - z.gamma) / 30; // ~30deg -> full deflection
      const gy = (e.beta - z.beta) / 30;
      breezeRef.current.x = Math.max(-1, Math.min(1, gx));
      breezeRef.current.y = Math.max(-1, Math.min(1, gy));
      markInput();
    };

    const setKey = (e: KeyboardEvent, down: boolean) => {
      let hit = true;
      switch (e.key) {
        case "ArrowUp":
          keysRef.current.up = down;
          break;
        case "ArrowDown":
          keysRef.current.down = down;
          break;
        case "ArrowLeft":
          keysRef.current.left = down;
          break;
        case "ArrowRight":
          keysRef.current.right = down;
          break;
        default:
          hit = false;
      }
      if (hit) {
        e.preventDefault();
        if (down) markInput();
        const k = keysRef.current;
        breezeRef.current.x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        breezeRef.current.y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e, false);

    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started, markInput]);

  // --- audio scheduler (Chris Wilson look-ahead) ---
  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    if (!audio) return; // no audio context -> scheduler is a no-op

    const LOOKAHEAD = 0.12;
    const nextAt = new Map<number, number>();
    let bedNextAt = 0;
    let ostinatoStep = 0;
    let ostinatoNextAt = 0;

    const pump = () => {
      const ctx = audio.ctx;
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      const day = dayRef.current;

      // always-on bed: shift root + brightness with phase
      if (now >= bedNextAt) {
        const rootHz =
          440 * Math.pow(2, (Math.round(day.rootMidi) - 12 - 69) / 12);
        const level = 0.08 + day.brightness * 0.1;
        audio.setBed(rootHz, day.brightness, level);
        bedNextAt = now + 0.4;
      }

      // evolving ostinato bed-line
      const beat = 1 / Math.max(0.4, day.bps);
      if (ostinatoNextAt < now) ostinatoNextAt = now + 0.05;
      while (ostinatoNextAt < horizon) {
        const fire = Math.random() < 0.35 + day.brightness * 0.4;
        if (fire) {
          const deg = [0, 2, 4, 4, 2, 0, 7, 4][ostinatoStep % 8];
          const fr = voiceDegree(day, deg, -1);
          audio.tone(
            ostinatoNextAt,
            fr,
            beat * 1.4,
            0.06 + day.brightness * 0.05,
            "breath",
            Math.sin(ostinatoStep) * 0.4,
          );
        }
        ostinatoStep++;
        ostinatoNextAt += beat * 2;
      }

      // each planted thing re-voices its (mutated) motif into the current scale
      for (const th of thingsRef.current) {
        const wake = wakefulness(th.kind, day);
        if (wake < 0.12) continue;
        let na = nextAt.get(th.id);
        if (na === undefined || na < now) {
          na = now + Math.random() * beat;
          nextAt.set(th.id, na);
        }
        while (na < horizon) {
          const age = (((day.phase - th.birthPhase) % 1) + 1) % 1;
          const degs = mutatedDegrees(th.motif, age);
          const step = th.nextNoteIdx % degs.length;
          const deg = degs[step];
          const fr = voiceDegree(day, deg, th.motif.octave);
          const dur =
            th.kind === "star" ? 1.8 : th.kind === "bird" ? 0.45 : 0.8;
          const cv = canvasRef.current;
          const pan = cv ? (th.x / cv.clientWidth) * 1.6 - 0.8 : 0;
          audio.tone(
            na,
            fr,
            dur,
            (0.05 + wake * 0.1) *
              (th.kind === "bird" ? 0.9 : th.kind === "star" ? 1.1 : 1),
            th.kind === "star" ? "bell" : th.kind === "bird" ? "pluck" : "pad",
            pan,
          );
          th.lastSungAt = na;
          th.nextNoteIdx = th.nextNoteIdx + 1;
          const rhy = th.motif.rhythm[step % th.motif.rhythm.length] || 1;
          na += beat * rhy * (th.kind === "star" ? 2.4 : 1.4);
        }
        nextAt.set(th.id, na);
      }

      // TRAVELING MOTIF replay: the wind periodically re-voices the captured
      // sweep gesture into the CURRENT scale, mutating/thinning with age.
      const travel = travelRef.current;
      if (travel.length >= 2) {
        if (travelReplayAtRef.current < now) {
          // start a fresh pass a little ahead, after a rest
          travelReplayAtRef.current = now + beat * 2;
          travelCursorRef.current = 0;
        }
        while (travelReplayAtRef.current < horizon) {
          const len = travel.length;
          // thin with the cursor: skip every 3rd step late in a long motif
          const cur = travelCursorRef.current;
          if (cur >= len) {
            // finished a pass -> rest before the next, like a returning breeze
            travelReplayAtRef.current += beat * 4;
            travelCursorRef.current = 0;
            break;
          }
          const stepData = travel[cur];
          // gentle mutation: transpose the whole replayed motif by +1 degree
          const fr = voiceDegree(day, stepData.degree + 1, stepData.octave);
          const dur =
            stepData.kind === "star" ? 1.4 : stepData.kind === "bird" ? 0.4 : 0.6;
          audio.tone(
            travelReplayAtRef.current,
            fr,
            dur,
            0.05, // quiet — a memory drifting past, under the live garden
            stepData.kind === "star" ? "bell" : "pluck",
            Math.sin(cur * 1.3) * 0.5,
          );
          travelReplayAtRef.current += beat * Math.max(0.5, stepData.dt * 2);
          travelCursorRef.current = cur + 1;
        }
      }
    };

    const id = setInterval(pump, 25);
    schedRef.current = id;
    return () => {
      clearInterval(id);
      schedRef.current = null;
    };
  }, [started]);

  // --- render + time loop (rAF). Wind motion + dwell + sweep live here. ---
  useEffect(() => {
    if (!started) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const nowS = performance.now() / 1000;
      let dt = nowS - lastTickRef.current;
      if (dt > 0.1) dt = 0.1;
      lastTickRef.current = nowS;

      // ease day-rate from preview down to full once the child interacts
      const target = interactedRef.current ? 1 : PREVIEW_RATE;
      rateRef.current += (target - rateRef.current) * Math.min(1, dt * 0.6);
      phaseRef.current =
        (phaseRef.current + (dt * rateRef.current) / DAY_SECONDS) % 1;
      const day = sampleDay(phaseRef.current);
      dayRef.current = day;

      const idle = performance.now() - lastInputRef.current > IDLE_MS;
      const wind = windRef.current;

      // determine breeze: idle auto-demo drives a gentle Lissajous path
      let bx = breezeRef.current.x;
      let by = breezeRef.current.y;
      if (idle && !interactedRef.current) {
        const t = nowS * 0.5;
        bx = Math.sin(t * 0.9) * 0.8;
        by = Math.cos(t * 0.6 + 1.3) * 0.7;
      }

      // ease wind velocity toward the breeze target; integrate position
      const accel = 1.6;
      wind.vx += (bx - wind.vx) * Math.min(1, dt * accel);
      wind.vy += (by - wind.vy) * Math.min(1, dt * accel);
      const speed = Math.hypot(wind.vx, wind.vy);
      wind.x += wind.vx * dt * 0.55;
      wind.y += wind.vy * dt * 0.55;
      // soft bounce off the edges so the wind stays on the meadow
      if (wind.x < 0.04) { wind.x = 0.04; wind.vx = Math.abs(wind.vx) * 0.5; }
      if (wind.x > 0.96) { wind.x = 0.96; wind.vx = -Math.abs(wind.vx) * 0.5; }
      if (wind.y < 0.04) { wind.y = 0.04; wind.vy = Math.abs(wind.vy) * 0.5; }
      if (wind.y > 0.96) { wind.y = 0.96; wind.vy = -Math.abs(wind.vy) * 0.5; }

      const wpx = wind.x * w;
      const wpy = wind.y * h;

      // --- SWEEP-TO-PLAY: brush any planted thing the wind is passing over ---
      for (const th of thingsRef.current) {
        const d = Math.hypot(th.x - wpx, th.y - wpy);
        if (d < 46) brush(th); // rate-limited inside brush()
      }

      // --- DWELL-TO-PLANT: lingering at low speed over empty ground grows one ---
      const dwell = dwellRef.current;
      let nearThing = false;
      for (const th of thingsRef.current) {
        if (Math.hypot(th.x - wpx, th.y - wpy) < 56) {
          nearThing = true;
          break;
        }
      }
      if (speed < 0.18 && !nearThing) {
        // moved less than a small radius? keep accumulating dwell time
        if (Math.hypot(dwell.x - wind.x, dwell.y - wind.y) < 0.05) {
          dwell.since += dt;
        } else {
          dwell.x = wind.x;
          dwell.y = wind.y;
          dwell.since = 0;
        }
        if (dwell.since > DWELL_MS / 1000) {
          plant(wind.x, wind.y, idle && !interactedRef.current);
          dwell.since = 0;
          dwell.x = wind.x + 999; // force a fresh dwell before next plant
        }
      } else {
        dwell.since = 0;
        dwell.x = wind.x;
        dwell.y = wind.y;
      }

      drawScene(
        ctx,
        w,
        h,
        day,
        thingsRef.current,
        nowS,
        audioRef.current,
        wpx,
        wpy,
        speed,
        dwell.since / (DWELL_MS / 1000),
      );
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started, plant, brush]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedRef.current) clearInterval(schedRef.current);
      cancelAnimationFrame(rafRef.current);
      const a = audioRef.current;
      if (a) {
        try {
          a.ctx.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // request tilt permission again from a button (some browsers need a tap)
  const requestTilt = useCallback(async () => {
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") setUsingTilt(true);
      } catch {
        /* ignore */
      }
    }
    setNeedsTiltPerm(false);
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060f] text-white select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0b1030] to-[#1a1230] px-6 text-center">
          <h1 className="font-serif text-4xl text-white sm:text-5xl">
            A Day on the Wind
          </h1>
          <p className="max-w-md text-base text-white/80">
            Tilt your iPad to steer a glowing wind across a whole day. Where the
            wind rests, living things grow. Where it sweeps, they sing. No
            tapping — just lean, and play your meadow like a harp.
          </p>
          <button
            onClick={begin}
            className="flex min-h-[64px] items-center gap-3 rounded-full bg-amber-300 px-8 py-3.5 text-xl font-medium text-amber-950 shadow-lg shadow-amber-300/30 transition active:scale-95"
          >
            <span className="text-2xl">☀</span> Begin the day
          </button>
          <p className="text-base text-white/75">
            On a computer, use the arrow keys.
          </p>
        </div>
      )}

      {started && (
        <>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="absolute right-3 top-3 z-10 min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 font-mono text-sm text-white/80 backdrop-blur transition active:scale-95"
          >
            Design notes
          </button>
          <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-sm text-white/80">
            {usingTilt ? "tilt to steer the wind" : "arrow keys steer the wind"}
            <span className="block text-white/75">
              rest → it plants · sweep → it sings
            </span>
          </div>

          {needsTiltPerm && (
            <button
              onClick={requestTilt}
              className="absolute bottom-3 left-3 z-10 min-h-[44px] rounded-full bg-rose-400/90 px-4 py-2.5 text-base font-medium text-rose-950 active:scale-95"
            >
              Tap to allow tilt
            </button>
          )}

          {showNotes && (
            <div className="absolute inset-x-3 bottom-3 z-10 max-h-[64dvh] overflow-auto rounded-2xl bg-black/75 p-5 text-base text-white/90 backdrop-blur">
              <p className="mb-2 text-white">
                A long-form generative journey: a continuous diurnal phase
                cross-fades through five musical regions (dawn, morning, midday,
                dusk, night) over ~9 minutes — minute 8 is not minute 1.
              </p>
              <p className="mb-2 text-white/80">
                You steer a glowing wind by tilting (or with the arrow keys).
                Where it rests it plants a flower, bird, or star; where it sweeps
                across what you planted, each thing rings its motif in passing
                order — a wind-harp you draw by leaning.
              </p>
              <p className="mb-2 text-white/80">
                The wind remembers your recent sweep as a traveling motif and
                drifts it back, re-voiced into whatever scale the day has reached
                — a procedural take on motif-memory retrieval.
              </p>
              <p className="text-white/75 font-mono text-xs">
                After MusicWeaver, Motif Memory Retrieval (arXiv 2509.21714,
                2026); Toshio Iwai, Electroplankton (2005); Brian Eno, Bloom.
                Deepens 624 (A Whole Day): tilt replaces touch, and the wind both
                plants and plays.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ===========================================================================
// Canvas2D painterly diorama renderer (pure draw fns; no React, no audio).
// ===========================================================================

function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  day: DayState,
  things: Thing[],
  nowS: number,
  audio: KidAudio | null,
  windX: number,
  windY: number,
  windSpeed: number,
  dwellFrac: number,
) {
  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(day.sky[0]));
  sky.addColorStop(0.5, rgb(day.sky[1]));
  sky.addColorStop(1, rgb(day.sky[2]));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.72;

  if (day.starAlpha > 0.01) {
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const sx = (i * 97.13) % w;
      const sy = (i * 53.7) % (horizon * 0.85);
      const tw = 0.5 + 0.5 * Math.sin(nowS * 1.5 + i);
      ctx.globalAlpha = day.starAlpha * (0.3 + tw * 0.7);
      ctx.fillStyle = "#fffbe8";
      const r = 0.8 + (i % 3) * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawArc(ctx, w, horizon);
  if (day.sunAlt > 0.01) drawSun(ctx, w, horizon, day);
  if (day.moonAlt > 0.01) drawMoon(ctx, w, horizon, day);
  drawClouds(ctx, w, horizon, day, nowS);
  drawHills(ctx, w, h, horizon, day);

  // planted things
  for (const th of things) {
    const wake = wakefulness(th.kind, day);
    th.wakeful += (wake - th.wakeful) * 0.08;
    const sungAgo = audio ? audio.ctx.currentTime - th.lastSungAt : 999;
    const brushAgo = audio ? audio.ctx.currentTime - th.brushFlash : 999;
    const sang = Math.max(
      0,
      Math.max(1 - sungAgo * 1.5, 1 - brushAgo * 2.2),
    );
    if (th.kind === "flower") drawFlower(ctx, th, sang, nowS);
    else if (th.kind === "bird") drawBird(ctx, th, sang, nowS);
    else drawStar(ctx, th, sang, nowS, day);
  }

  // the wind spirit (a soft luminous breeze-sprite + a trailing comet tail)
  drawWind(ctx, windX, windY, windSpeed, dwellFrac, nowS);

  // night veil
  const dark = 1 - day.brightness;
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(4,6,20,${dark * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function arcXY(t: number, w: number, horizon: number): [number, number] {
  const x = t * w;
  const peak = horizon * 0.12;
  const y = horizon - Math.sin(t * Math.PI) * (horizon - peak);
  return [x, y];
}

function drawArc(ctx: CanvasRenderingContext2D, w: number, horizon: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const [x, y] = arcXY(i / 40, w, horizon);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  day: DayState,
) {
  const t = Math.min(1, Math.max(0, day.phase / 0.8));
  const [x, y] = arcXY(t, w, horizon);
  const R = 34;
  const g = ctx.createRadialGradient(x, y, 2, x, y, R * 3);
  g.addColorStop(0, `rgba(255,244,200,${0.5 * day.sunAlt})`);
  g.addColorStop(1, "rgba(255,244,200,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,236,168,${0.85 * Math.max(0.3, day.sunAlt)})`;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  day: DayState,
) {
  let t = (day.phase - 0.78) / 0.4;
  if (t < 0) t = (day.phase + 0.22) / 0.4;
  t = Math.min(1, Math.max(0, t));
  const [x, y] = arcXY(t, w, horizon);
  const R = 26;
  const g = ctx.createRadialGradient(x, y, 2, x, y, R * 3.2);
  g.addColorStop(0, `rgba(214,224,255,${0.4 * day.moonAlt})`);
  g.addColorStop(1, "rgba(214,224,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(236,240,255,${0.92 * day.moonAlt})`;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb(day.sky[0], 0.5 * day.moonAlt);
  ctx.beginPath();
  ctx.arc(x + 9, y - 5, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  day: DayState,
  nowS: number,
) {
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const speed = 6 + i * 4;
    const cx = ((nowS * speed + i * 220) % (w + 300)) - 150;
    const cy = horizon * (0.2 + i * 0.13);
    const s = 34 + i * 10;
    ctx.fillStyle = rgb(day.cloud, 0.18 + day.brightness * 0.22);
    drawBlob(ctx, cx, cy, s);
  }
  ctx.restore();
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.8, 0, Math.PI * 2);
  ctx.arc(x - s * 0.9, y + s * 0.18, s * 0.7, 0, Math.PI * 2);
  ctx.arc(x + s * 0.3, y - s * 0.3, s * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  day: DayState,
) {
  const b = day.brightness;
  const layers: { y: number; col: [number, number, number]; amp: number }[] = [
    { y: horizon, col: [40 + b * 70, 80 + b * 90, 60 + b * 60], amp: 22 },
    {
      y: horizon + (h - horizon) * 0.28,
      col: [34 + b * 60, 92 + b * 80, 56 + b * 50],
      amp: 30,
    },
    {
      y: horizon + (h - horizon) * 0.6,
      col: [26 + b * 50, 100 + b * 70, 50 + b * 40],
      amp: 16,
    },
  ];
  for (const L of layers) {
    ctx.fillStyle = rgb(L.col);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, L.y);
    for (let x = 0; x <= w; x += 24) {
      const yy = L.y + Math.sin(x * 0.01 + L.y) * L.amp;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  awake: number,
) {
  const open = Math.max(0.1, awake);
  ctx.fillStyle = "rgba(40,30,40,0.85)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y, r * 0.16, r * 0.16 * open, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.4, y, r * 0.16, r * 0.16 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  if (awake > 0.3) {
    ctx.strokeStyle = "rgba(40,30,40,0.7)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.25, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  th: Thing,
  sang: number,
  nowS: number,
) {
  const open = th.wakeful;
  const sway = Math.sin(nowS * 0.8 + th.swayPhase) * 4;
  const x = th.x + sway;
  const y = th.y;
  const petalR = (16 + sang * 6) * (0.45 + open * 0.55);
  ctx.strokeStyle = "rgba(60,120,60,0.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(th.x, y + 40);
  ctx.quadraticCurveTo(th.x + sway * 0.5, y + 18, x, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  const petals = 6;
  for (let i = 0; i < petals; i++) {
    ctx.rotate((Math.PI * 2) / petals);
    ctx.fillStyle = `hsla(${th.hue},80%,${60 + sang * 12}%,${0.55 + open * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(0, -petalR, petalR * 0.5, petalR, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = `hsl(48,90%,${55 + sang * 20}%)`;
  ctx.beginPath();
  ctx.arc(x, y, petalR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  drawFace(ctx, x, y, petalR * 0.55, open);
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  th: Thing,
  sang: number,
  nowS: number,
) {
  const awake = th.wakeful;
  const glide = awake * Math.sin(nowS * 0.5 + th.swayPhase) * 26;
  const x = th.x + glide;
  const bob = Math.sin(nowS * 2 + th.swayPhase) * (3 + sang * 4) * awake;
  const y = th.y + bob;
  const r = 16 + sang * 5;
  ctx.fillStyle = `hsla(${th.hue},70%,${55 + sang * 12}%,0.95)`;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const flap = Math.sin(nowS * 9 + th.swayPhase) * (0.4 + sang) * awake;
  ctx.fillStyle = `hsla(${th.hue},60%,46%,0.9)`;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, -r * 0.2, r * 0.9, r * 0.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(245,180,60,0.95)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + r + 8, y - 3);
  ctx.lineTo(x + r + 8, y + 3);
  ctx.fill();
  drawFace(ctx, x - r * 0.2, y - r * 0.15, r * 0.7, awake);
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  th: Thing,
  sang: number,
  nowS: number,
  day: DayState,
) {
  const vis = th.wakeful * Math.max(day.starAlpha, day.moonAlt * 0.6 + 0.2);
  if (vis < 0.03) return;
  const tw = 0.6 + 0.4 * Math.sin(nowS * 2 + th.swayPhase);
  const R = (14 + sang * 8) * (0.6 + tw * 0.4);
  const x = th.x;
  const y = th.y;
  const g = ctx.createRadialGradient(x, y, 1, x, y, R * 2.4);
  g.addColorStop(0, `hsla(${th.hue},95%,75%,${0.55 * vis})`);
  g.addColorStop(1, `hsla(${th.hue},95%,75%,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsla(${th.hue},95%,${72 + sang * 15}%,${0.85 * vis})`;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? R : R * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  drawFace(ctx, x, y, R * 0.6, vis);
}

// The glowing wind spirit: a luminous core, a soft halo, and a faint trail.
// A growing ring previews a dwell-plant so the child sees it about to bloom.
function drawWind(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  speed: number,
  dwellFrac: number,
  nowS: number,
) {
  ctx.save();
  // soft swirling halo
  const haloR = 30 + speed * 18 + Math.sin(nowS * 3) * 3;
  const halo = ctx.createRadialGradient(x, y, 2, x, y, haloR);
  halo.addColorStop(0, "rgba(200,240,255,0.55)");
  halo.addColorStop(0.5, "rgba(150,210,255,0.22)");
  halo.addColorStop(1, "rgba(150,210,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // little orbiting sparkles (the "breeze")
  for (let i = 0; i < 4; i++) {
    const a = nowS * 2 + (i * Math.PI) / 2;
    const rr = 14 + Math.sin(nowS * 4 + i) * 4;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    ctx.fillStyle = "rgba(235,250,255,0.7)";
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // bright core
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();

  // dwell preview ring: fills up as a plant is about to grow
  if (dwellFrac > 0.02) {
    ctx.strokeStyle = "rgba(255,244,200,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dwellFrac) * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
