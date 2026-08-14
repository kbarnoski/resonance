"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 12976 · Dream Medley — the long, slow dream that remembers your songs.
//
//   ONE QUESTION
//   What if the melodies you sang became a long, slow dream that recalls each of
//   them exactly, wanders the edge-of-chaos space between them, develops
//   fragments, and returns — a five-minute piece made entirely of your own songs?
//
//   LINEAGE  10984-echofold → 11376-recallorbit → 12976-dreammedley (cycle 3).
//   recallorbit taught ONE phrase to a genuine Echo-State Network and reproduced
//   it EXACTLY with a ridge-trained readout. Here the SAME reservoir holds several
//   phrases at once — one trained readout per phrase (a memory "slot") — and a
//   slow cursor auto-navigates the latent space over the slots: visiting each
//   memory exactly (faithful recall), drifting through the interpolated space
//   between them (musical hybrids), developing fragments, and returning home.
//
//   ARCHITECTURE ANCHOR — Echo State Transformer (arXiv:2507.02917): the memory
//   slots are attended over. Attention concentrated on one slot with dream≈0 →
//   exact recall; attention spread with dream>0 → the between-memory reverie.
//
//   STATEFUL BY CONSTRUCTION — minute 5 ≠ minute 1: (1) the journey traverses a
//   scripted long-form arc (exposition → wandering → development → deep dream →
//   the long way home → return); (2) per-memory "warmth" ACCUMULATES with every
//   visit, so the map is lit differently late than early; (3) in the between-space
//   the reservoir runs supercritical (ρ past the edge of chaos) with injected
//   noise and is NEVER reset, so its trajectory is genuinely path-dependent and
//   never repeats. See reservoir.ts.
//
//   Substrate: Canvas2D. Warm ember phosphor on charcoal — a remembering mind.
//   Deterministic (fixed seed + step counter): with no mic and no interaction it
//   seeds three phrases and auto-runs the dream. A first interaction hands over.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MedleyReservoir,
  makeSeedTarget,
  type TargetStep,
} from "./reservoir";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── Engine constants ──────────────────────────────────────────────────────────
const SEED = 12976;
const N_UNITS = 150;
const STEPS_PER_LOOP = 96;
const STEP_DT = 1 / 13.5; // seconds per reservoir step → ~7.1s per loop (slow dream)
const RECORD_SECONDS = 4;
const MAX_MEMORIES = 4;
const ATTN_TEMP = 0.09; // attention softness over the memory field
const MEMORY_NAMES = ["A", "B", "C", "D"];
// Distinct seeds → genuinely different seeded phrases for the muted medley.
const SEED_PHRASE_SEEDS = [10984, 11376, 12976];

// Art palette — raw hex allowed ONLY inside the canvas art. Warm ember phosphor on
// near-black charcoal; a cool ash counter-accent for the dream / chaos pole.
const HEX_GROUND = "#0c0a09";
const HEX_EMBER = "#e8a04b";
const HEX_GLOW = "#f0c27a";
const HEX_ASH = "#8a9ba8";
const HEX_FAINT = "#2a231c";

type Pt = [number, number];

function pitchToFreq(pitch: number): number {
  // pitch ∈ [-1,1] → ±1 octave around middle C.
  return 261.63 * Math.pow(2, pitch);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Mix two hex colors → "rgb(r,g,b)" (canvas art only).
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255,
    ag = (pa >> 8) & 255,
    ab = pa & 255;
  const br = (pb >> 16) & 255,
    bg = (pb >> 8) & 255,
    bb = pb & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `rgb(${r},${g},${bl})`;
}

// ── Journey ────────────────────────────────────────────────────────────────────
type Movement = {
  name: string;
  tStart: number; // in loops
  tEnd: number;
  evalAt: (t: number) => { x: number; y: number; dream: number };
  charDream: number; // characteristic dream (for the timeline tint)
};
type Journey = { movements: Movement[]; totalLoops: number };

// Anchors on a circle, top-first, clockwise, radius 0.6 in unit map space.
function layoutAnchors(m: number): Pt[] {
  const R = 0.6;
  const out: Pt[] = [];
  for (let k = 0; k < m; k++) {
    const a = (k / m) * Math.PI * 2;
    out.push([R * Math.sin(a), -R * Math.cos(a)]);
  }
  return out;
}

// Build the long-form arc from the current memory anchors. Chains movements so
// each begins where the previous ended (continuous cursor path).
function buildJourney(anchors: Pt[], names: string[]): Journey {
  const M = anchors.length;
  const center: Pt = [0, 0];
  const movements: Movement[] = [];
  let from: Pt = anchors[0];
  let fromDream = 0.04;
  let tl = 0;

  const push = (
    name: string,
    loops: number,
    evalAt: (t: number) => { x: number; y: number; dream: number },
    endPos: Pt,
    endDream: number,
  ) => {
    movements.push({
      name,
      tStart: tl,
      tEnd: tl + loops,
      evalAt,
      charDream: evalAt(0.5).dream,
    });
    tl += loops;
    from = endPos;
    fromDream = endDream;
  };

  const hold = (at: Pt, name: string, loops: number, dream: number) => {
    const f = from;
    const fd = fromDream;
    push(
      name,
      loops,
      (t) => {
        const s = smooth(Math.min(1, t / 0.25));
        return {
          x: lerp(f[0], at[0], s),
          y: lerp(f[1], at[1], s),
          dream: lerp(fd, dream, s),
        };
      },
      at,
      dream,
    );
  };

  const travel = (
    to: Pt,
    name: string,
    loops: number,
    peakDream: number,
    endDream: number,
  ) => {
    const f = from;
    const fd = fromDream;
    push(
      name,
      loops,
      (t) => {
        const s = smooth(t);
        const base = lerp(fd, endDream, s);
        const hump = Math.sin(Math.PI * t) * Math.max(0, peakDream - Math.max(fd, endDream));
        return {
          x: lerp(f[0], to[0], s),
          y: lerp(f[1], to[1], s),
          dream: clamp01(base + hump),
        };
      },
      to,
      endDream,
    );
  };

  const orbit = (
    c2: Pt,
    name: string,
    loops: number,
    radius: number,
    turns: number,
    dream: number,
  ) => {
    const f = from;
    const fd = fromDream;
    const a0 = Math.atan2(f[1] - c2[1], f[0] - c2[0]);
    const r0 = Math.hypot(f[0] - c2[0], f[1] - c2[1]);
    const endAng = a0 + 2 * Math.PI * turns;
    const endPos: Pt = [c2[0] + radius * Math.cos(endAng), c2[1] + radius * Math.sin(endAng)];
    push(
      name,
      loops,
      (t) => {
        const r = lerp(r0, radius, smooth(Math.min(1, t / 0.3)));
        const ang = a0 + 2 * Math.PI * turns * t;
        const d = lerp(fd, dream, smooth(Math.min(1, t / 0.3))) + 0.08 * Math.sin(t * Math.PI * turns * 2);
        return { x: c2[0] + r * Math.cos(ang), y: c2[1] + r * Math.sin(ang), dream: clamp01(d) };
      },
      endPos,
      dream,
    );
  };

  const lissajous = (c2: Pt, name: string, loops: number, dream: number) => {
    const f = from;
    const fd = fromDream;
    const rx = 0.42;
    const ry = 0.3;
    const evalAt = (t: number) => {
      const lx = c2[0] + rx * Math.sin(2 * Math.PI * 3 * t);
      const ly = c2[1] + ry * Math.sin(2 * Math.PI * 2 * t + 1.0);
      const blend = smooth(Math.min(1, t / 0.2));
      return { x: lerp(f[0], lx, blend), y: lerp(f[1], ly, blend), dream: lerp(fd, dream, blend) };
    };
    const ep = evalAt(1);
    push(name, loops, evalAt, [ep.x, ep.y], dream);
  };

  // ── Compose the medley ──
  hold(anchors[0], `Exposition · ${names[0]}`, 5, 0.04);
  for (let k = 1; k < M; k++) {
    const mid: Pt = [
      lerp(anchors[k - 1][0], anchors[k][0], 0.5) * 0.7,
      lerp(anchors[k - 1][1], anchors[k][1], 0.5) * 0.7,
    ];
    travel(mid, `Between ${names[k - 1]} · ${names[k]}`, 4, 0.85, 0.5);
    travel(anchors[k], `Recall · ${names[k]}`, 3, 0.5, 0.04);
    hold(anchors[k], `Dwelling · ${names[k]}`, 4, 0.05);
  }
  orbit(anchors[M - 1], "Development", 7, 0.22, 2, 0.5);
  lissajous(center, "Deep dream", 5, 0.95);
  travel([anchors[0][0] * 1.25, anchors[0][1] * 1.25], "The long way home", 6, 0.7, 0.35);
  travel(anchors[0], `Return · ${names[0]}`, 4, 0.35, 0.04);
  hold(anchors[0], `Rest · ${names[0]}`, 3, 0.04);

  return { movements, totalLoops: tl };
}

function sampleJourney(
  j: Journey,
  tauLoops: number,
): { x: number; y: number; dream: number; index: number; name: string; progress: number } {
  const tt = ((tauLoops % j.totalLoops) + j.totalLoops) % j.totalLoops;
  let m = j.movements[j.movements.length - 1];
  let idx = j.movements.length - 1;
  for (let i = 0; i < j.movements.length; i++) {
    if (tt >= j.movements[i].tStart && tt < j.movements[i].tEnd) {
      m = j.movements[i];
      idx = i;
      break;
    }
  }
  const localT = (tt - m.tStart) / Math.max(1e-6, m.tEnd - m.tStart);
  const p = m.evalAt(localT);
  return { x: p.x, y: p.y, dream: p.dream, index: idx, name: m.name, progress: tt / j.totalLoops };
}

// ── A recorded song-note in the scrolling voice ribbon ──────────────────────────
type SongNote = { step: number; pitch: number; vel: number; dream: number };
type TrailPt = { x: number; y: number; dream: number };

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export default function DreamMedleyPage() {
  const [soundOn, setSoundOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [depth, setDepth] = useState(0.6);
  const [recording, setRecording] = useState(false);
  const [canvasOk, setCanvasOk] = useState(true);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [memCount, setMemCount] = useState(SEED_PHRASE_SEEDS.length);
  const [userTook, setUserTook] = useState(false);
  const [hud, setHud] = useState({
    movement: "Exposition",
    nearest: "A",
    dream: 0.04,
    elapsed: 0,
    total: 0,
    progress: 0,
  });

  // ── Refs the animation loop reads (never React state in the hot path) ─────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resRef = useRef<MedleyReservoir | null>(null);
  const rafRef = useRef<number | null>(null);
  const depthRef = useRef(0.6);
  const soundOnRef = useRef(false);

  const anchorsRef = useRef<Pt[]>([]);
  const namesRef = useRef<string[]>([]);
  const journeyRef = useRef<Journey | null>(null);
  const warmthRef = useRef<number[]>([]);
  const stepCountRef = useRef(0);
  const cursorRef = useRef<Pt>([0, -0.6]);
  const trailRef = useRef<TrailPt[]>([]);
  const notesRef = useRef<SongNote[]>([]);

  // Steering (post-interaction nudge toward a chosen memory).
  const steerTargetRef = useRef<Pt | null>(null);
  const steerStrengthRef = useRef(0);

  // Audio refs.
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const droneRef = useRef<DroneBank | null>(null);
  const voicesRef = useRef<Set<OscillatorNode>>(new Set());

  // Mic recording buffers.
  const recStartStepRef = useRef(0);
  const recCentroidRef = useRef<number[]>([]);
  const recOnsetRef = useRef<number[]>([]);
  const recordingRef = useRef(false);

  const mic = useMicAnalyser({ smoothing: 0.6 });
  const getFrameRef = useRef(mic.getFrame);
  getFrameRef.current = mic.getFrame;

  // ── One voice (glassy 2-op FM) ────────────────────────────────────────────────
  const playNote = useCallback((freq: number, vel: number, ash: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    // Slightly detuned modulator; a touch more inharmonic in the dream (ash) zone.
    mod.frequency.value = freq * (2.001 + ash * 0.5);
    const mg = ctx.createGain();
    mg.gain.value = freq * (1.2 + ash * 0.8) * (0.4 + vel);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    const dur = 1.5 + ash * 0.8;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.15 * (0.5 + vel), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
    car.connect(g);
    g.connect(master.input);
    car.start(now);
    mod.start(now);
    car.stop(now + dur + 0.1);
    mod.stop(now + dur + 0.1);
    voicesRef.current.add(car);
    voicesRef.current.add(mod);
    const drop = () => {
      voicesRef.current.delete(car);
      voicesRef.current.delete(mod);
    };
    car.onended = drop;
    mod.onended = drop;
  }, []);

  // ── Rebuild anchors + journey for the current memory count ─────────────────────
  const rebuildJourney = useCallback(() => {
    const res = resRef.current;
    if (!res) return;
    const m = Math.max(2, res.memoryCount);
    const anchors = layoutAnchors(m);
    const names = MEMORY_NAMES.slice(0, m);
    anchorsRef.current = anchors;
    namesRef.current = names;
    journeyRef.current = buildJourney(anchors, names);
    const warmth = warmthRef.current;
    while (warmth.length < m) warmth.push(0);
    warmthRef.current = warmth.slice(0, m);
  }, []);

  // ── Build a training target from a recorded phrase (recallorbit's approach) ────
  const buildRecordedTarget = useCallback((): TargetStep[] | null => {
    const centroids = recCentroidRef.current;
    const onsets = recOnsetRef.current;
    if (onsets.length < 2) return null;
    const target: TargetStep[] = Array.from({ length: STEPS_PER_LOOP }, () => ({
      pitch: 0,
      gate: 0,
    }));
    let held = 0;
    for (let s = 0; s < STEPS_PER_LOOP; s++) {
      const c = centroids[s];
      if (c && c > 40) held = Math.max(-1, Math.min(1, Math.log2(c / 220) / 1.25));
      target[s].pitch = held;
    }
    const pre = 2;
    const post = 3;
    for (const stepIdx of onsets) {
      for (let o = -pre; o <= post; o++) {
        const s = stepIdx + o;
        if (s < 0 || s >= STEPS_PER_LOOP) continue;
        const env = 0.5 + 0.5 * Math.cos((Math.PI * o) / (o <= 0 ? pre + 1 : post + 1));
        if (env > target[s].gate) target[s].gate = env;
      }
    }
    return target;
  }, []);

  // ── Start recording a new phrase from the mic ──────────────────────────────────
  const startRecording = useCallback(async () => {
    const res = resRef.current;
    if (recordingRef.current || !res) return;
    if (res.memoryCount >= MAX_MEMORIES) {
      setMicNote("The mind is holding four songs already — its slots are full.");
      return;
    }
    setUserTook(true);
    setMicNote(null);
    await mic.start();
    if (mic.error) {
      setMicNote(mic.error);
      return;
    }
    recCentroidRef.current = new Array(STEPS_PER_LOOP).fill(0);
    recOnsetRef.current = [];
    recStartStepRef.current = stepCountRef.current;
    recordingRef.current = true;
    setRecording(true);
  }, [mic]);

  useEffect(() => {
    if (mic.error) {
      setMicNote(mic.error);
      recordingRef.current = false;
      setRecording(false);
    }
  }, [mic.error]);

  // ── Sound gate (created on the Begin gesture) ─────────────────────────────────
  const toggleSound = useCallback(() => {
    setUserTook(true);
    if (soundOnRef.current) {
      soundOnRef.current = false;
      setSoundOn(false);
      droneRef.current?.stop();
      droneRef.current = null;
      voicesRef.current.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voicesRef.current.clear();
      masterRef.current?.disconnect();
      masterRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      return;
    }
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const master = createSafeMaster(ctx, { gain: 0.5 });
      const drone = startDroneBank(ctx, master.input, {
        root: 98,
        ratios: [1, 3 / 2, 2, 3],
        peakGain: 0.09,
        cutoffLow: 160,
        cutoffHigh: 1300,
      });
      drone.setDrive(0.2);
      ctxRef.current = ctx;
      masterRef.current = master;
      droneRef.current = drone;
      soundOnRef.current = true;
      setSoundOn(true);
    } catch {
      setMicNote("Audio unavailable in this browser.");
    }
  }, []);

  const onDepthInput = useCallback((v: number) => {
    setUserTook(true);
    depthRef.current = v;
    setDepth(v);
  }, []);

  // ── Steering: click the field to nudge the cursor toward the nearest memory ────
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const anchors = anchorsRef.current;
    if (!canvas || anchors.length === 0) return;
    setUserTook(true);
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Map click px → unit space using the same layout the renderer uses.
    const w = rect.width;
    const mapH = rect.height * 0.6;
    if (py > mapH) return; // only the map field steers
    const cx = w / 2;
    const cy = mapH / 2;
    const scale = Math.min(w, mapH) * 0.42;
    const ux = (px - cx) / scale;
    const uy = (py - cy) / scale;
    // Nearest anchor to the click.
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < anchors.length; k++) {
      const d = (anchors[k][0] - ux) ** 2 + (anchors[k][1] - uy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    steerTargetRef.current = anchors[best];
    steerStrengthRef.current = 1;
  }, []);

  // ── Main effect: build reservoir + Canvas2D + animation loop ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCanvasOk(false);
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Build the reservoir + train the three seeded phrases (self-demo, no mic).
    const res = new MedleyReservoir(SEED, N_UNITS, STEPS_PER_LOOP, 0.12);
    for (let i = 0; i < SEED_PHRASE_SEEDS.length; i++) {
      res.trainMemory(MEMORY_NAMES[i], makeSeedTarget(STEPS_PER_LOOP, SEED_PHRASE_SEEDS[i]));
    }
    resRef.current = res;
    rebuildJourney();
    warmthRef.current = new Array(res.memoryCount).fill(0);
    // Warm the opening memory a little so the map reads immediately.
    warmthRef.current[0] = 0.35;
    cursorRef.current = anchorsRef.current[0] ?? [0, -0.6];

    // DPR-aware sizing.
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width || 640;
      cssH = rect.height || 420;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Simulation step (pure function of the step counter → deterministic) ──────
    const runStep = () => {
      const j = journeyRef.current;
      const anchors = anchorsRef.current;
      if (!j || anchors.length === 0) return;
      stepCountRef.current += 1;
      const stepCount = stepCountRef.current;
      const tau = stepCount / STEPS_PER_LOOP;
      const s = sampleJourney(j, tau);

      // Cursor = scripted position, optionally pulled by a decaying steer.
      let cx = s.x;
      let cy = s.y;
      const steer = steerTargetRef.current;
      if (steer && steerStrengthRef.current > 0.001) {
        const k = steerStrengthRef.current * 0.85;
        cx = lerp(s.x, steer[0], k);
        cy = lerp(s.y, steer[1], k);
        steerStrengthRef.current *= 0.985;
      }
      cursorRef.current = [cx, cy];

      // Attention over the memory slots from cursor distance (Echo-State-Transformer read).
      const weights: number[] = [];
      for (let kk = 0; kk < anchors.length; kk++) {
        const d2 = (anchors[kk][0] - cx) ** 2 + (anchors[kk][1] - cy) ** 2;
        weights.push(Math.exp(-d2 / ATTN_TEMP));
      }
      res.setAttention(weights);

      // Warmth ACCUMULATES with each visit (persistent state → minute 5 ≠ minute 1).
      const warmth = warmthRef.current;
      for (let kk = 0; kk < warmth.length; kk++) {
        const d2 = (anchors[kk][0] - cx) ** 2 + (anchors[kk][1] - cy) ** 2;
        const prox = Math.exp(-d2 / 0.02);
        warmth[kk] = clamp01(warmth[kk] + prox * 0.02 * (1 - warmth[kk]));
        warmth[kk] *= 0.99992; // very slow cool so the field keeps breathing
      }

      // Depth biases how far the between-space strays into chaos vs. faithful recall.
      const eff = clamp01(s.dream * (0.45 + 0.55 * depthRef.current));
      res.setDream(eff);

      const r = res.stepGenerate();
      if (r.noteOn) {
        const vel = Math.min(1, Math.max(0.15, r.gate));
        // Supercritical dream dynamics can drive the readout past ±1; clamp to a
        // musical ±1.6-octave range so recall is untouched but reverie stays sane.
        const mp = Math.max(-1.6, Math.min(1.6, r.pitch));
        notesRef.current.push({ step: stepCount, pitch: mp, vel, dream: eff });
        if (soundOnRef.current) playNote(pitchToFreq(mp), vel, eff);
      }
      // Prune scrolled-off notes (keep ~10 loops of history).
      const cutoff = stepCount - STEPS_PER_LOOP * 10;
      const notes = notesRef.current;
      while (notes.length > 0 && notes[0].step < cutoff) notes.shift();

      // Cursor trail.
      const trail = trailRef.current;
      trail.push({ x: cx, y: cy, dream: eff });
      if (trail.length > 220) trail.shift();

      droneRef.current?.setDrive(0.15 + 0.5 * eff);

      // Mic recording: sample centroid/onset into per-step slots, then teach a slot.
      if (recordingRef.current) {
        const elapsed = (stepCount - recStartStepRef.current) * STEP_DT;
        const slot = Math.min(
          STEPS_PER_LOOP - 1,
          Math.floor((elapsed / RECORD_SECONDS) * STEPS_PER_LOOP),
        );
        const frame = getFrameRef.current();
        if (frame) {
          recCentroidRef.current[slot] = frame.centroid;
          if (frame.onset) {
            const arr = recOnsetRef.current;
            if (arr[arr.length - 1] !== slot) arr.push(slot);
          }
        }
        if (elapsed >= RECORD_SECONDS) {
          recordingRef.current = false;
          const tgt = buildRecordedTarget();
          if (tgt) {
            const idx = res.trainMemory(MEMORY_NAMES[res.memoryCount] ?? "?", tgt);
            rebuildJourney();
            setMemCount(res.memoryCount);
            setMicNote(
              `Learned your song as memory ${MEMORY_NAMES[idx]} — the dream now weaves it in.`,
            );
          } else {
            setMicNote("Didn't catch a clear phrase — kept the songs it knows.");
          }
          mic.stop();
          setRecording(false);
        }
      }
    };

    // ── Drawing ──────────────────────────────────────────────────────────────────
    const unitToPx = (u: number, v: number, cxp: number, cyp: number, scale: number): Pt => [
      cxp + u * scale,
      cyp + v * scale,
    ];

    const drawScene = () => {
      const W = cssW;
      const H = cssH;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const mapH = H * 0.6;
      const songTop = mapH;
      const songH = H * 0.16;
      const timeTop = mapH + songH;
      const timeH = H - timeTop;

      const anchors = anchorsRef.current;
      const names = namesRef.current;
      const warmth = warmthRef.current;
      const cursor = cursorRef.current;
      const attn = res.attentionVec;
      const stepCount = stepCountRef.current;
      const spin = reduceMotion ? 0 : (stepCount * 0.0015) % (Math.PI * 2);

      // ── Ground + vignette ──
      ctx.fillStyle = HEX_GROUND;
      ctx.fillRect(0, 0, W, H);
      const cxp = W / 2;
      const cyp = mapH / 2;
      const scale = Math.min(W, mapH) * 0.42;
      const vg = ctx.createRadialGradient(cxp, cyp, scale * 0.2, cxp, cyp, scale * 1.9);
      vg.addColorStop(0, "rgba(232,160,75,0.05)");
      vg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, mapH);

      // ── Constellation rings ──
      ctx.strokeStyle = "rgba(42,35,28,0.9)";
      ctx.lineWidth = 1;
      for (let ri = 1; ri <= 3; ri++) {
        ctx.beginPath();
        ctx.arc(cxp, cyp, scale * 0.2 * ri, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Filaments between anchors (the latent web) ──
      ctx.strokeStyle = mixHex(HEX_FAINT, HEX_EMBER, 0.15);
      ctx.lineWidth = 1;
      for (let a = 0; a < anchors.length; a++) {
        for (let b = a + 1; b < anchors.length; b++) {
          const pa = unitToPx(anchors[a][0], anchors[a][1], cxp, cyp, scale);
          const pb = unitToPx(anchors[b][0], anchors[b][1], cxp, cyp, scale);
          ctx.beginPath();
          ctx.moveTo(pa[0], pa[1]);
          ctx.lineTo(pb[0], pb[1]);
          ctx.stroke();
        }
      }

      const curPx = unitToPx(cursor[0], cursor[1], cxp, cyp, scale);

      // ── Attention filaments: cursor → each memory, opacity ∝ attention ──
      ctx.lineWidth = 1.5;
      for (let k = 0; k < anchors.length; k++) {
        const a = attn[k] ?? 0;
        if (a < 0.02) continue;
        const ap = unitToPx(anchors[k][0], anchors[k][1], cxp, cyp, scale);
        ctx.strokeStyle = `rgba(240,194,122,${(a * 0.6).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(curPx[0], curPx[1]);
        ctx.lineTo(ap[0], ap[1]);
        ctx.stroke();
      }

      // ── Cursor comet trail ──
      const trail = trailRef.current;
      ctx.lineWidth = 2;
      for (let i = 1; i < trail.length; i++) {
        const p0 = unitToPx(trail[i - 1].x, trail[i - 1].y, cxp, cyp, scale);
        const p1 = unitToPx(trail[i].x, trail[i].y, cxp, cyp, scale);
        const f = i / trail.length;
        const col = mixHex(HEX_EMBER, HEX_ASH, trail[i].dream);
        ctx.strokeStyle = col
          .replace("rgb", "rgba")
          .replace(")", `,${(f * 0.55).toFixed(3)})`);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }

      // ── Memory anchors ──
      for (let k = 0; k < anchors.length; k++) {
        const ap = unitToPx(anchors[k][0], anchors[k][1], cxp, cyp, scale);
        const a = attn[k] ?? 0;
        const warm = warmth[k] ?? 0;
        const isNear = a > 0.5;
        // Warmth + attention halo.
        const haloR = scale * (0.06 + warm * 0.1 + a * 0.14);
        const g = ctx.createRadialGradient(ap[0], ap[1], 0, ap[0], ap[1], haloR);
        const glowCol = mixHex(HEX_EMBER, HEX_GLOW, a);
        g.addColorStop(0, glowCol.replace("rgb", "rgba").replace(")", `,${(0.25 + warm * 0.3 + a * 0.4).toFixed(3)})`));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ap[0], ap[1], haloR, 0, Math.PI * 2);
        ctx.fill();
        // Ring.
        ctx.strokeStyle = mixHex(HEX_FAINT, HEX_EMBER, 0.5 + warm * 0.5);
        ctx.lineWidth = isNear ? 2 : 1;
        ctx.beginPath();
        ctx.arc(ap[0], ap[1], scale * 0.05, spin, spin + Math.PI * 2);
        ctx.stroke();
        // Core.
        ctx.fillStyle = mixHex(HEX_EMBER, HEX_GLOW, a);
        ctx.beginPath();
        ctx.arc(ap[0], ap[1], scale * (0.012 + a * 0.02), 0, Math.PI * 2);
        ctx.fill();
        // Label.
        ctx.fillStyle = mixHex(HEX_ASH, HEX_GLOW, 0.3 + a * 0.7);
        ctx.font = `600 ${Math.round(scale * 0.07)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(names[k] ?? "", ap[0], ap[1] - scale * 0.11);
      }

      // ── Cursor head (the dreaming attention) ──
      const cursorDream = trail.length ? trail[trail.length - 1].dream : 0;
      const headCol = mixHex(HEX_GLOW, HEX_ASH, cursorDream);
      const energy = Math.min(1, res.energy() * 2.2);
      const hr = scale * (0.03 + energy * 0.03);
      const hg = ctx.createRadialGradient(curPx[0], curPx[1], 0, curPx[0], curPx[1], scale * 0.16);
      hg.addColorStop(0, headCol.replace("rgb", "rgba").replace(")", ",0.9)"));
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(curPx[0], curPx[1], scale * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = headCol;
      ctx.beginPath();
      ctx.arc(curPx[0], curPx[1], hr, 0, Math.PI * 2);
      ctx.fill();

      // ── Song-line ribbon (the actual melody, scrolling) ──
      ctx.fillStyle = "rgba(12,10,9,1)";
      ctx.fillRect(0, songTop, W, songH);
      ctx.strokeStyle = "rgba(42,35,28,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, songTop + songH / 2);
      ctx.lineTo(W, songTop + songH / 2);
      ctx.stroke();
      const notes = notesRef.current;
      const visibleSteps = STEPS_PER_LOOP * 8;
      const pxPerStep = W / visibleSteps;
      const midY = songTop + songH / 2;
      const halfH = songH * 0.4;
      for (let i = 0; i < notes.length; i++) {
        const nn = notes[i];
        const age = stepCount - nn.step;
        const x = W - age * pxPerStep;
        if (x < 0) continue;
        const y = Math.max(songTop + 3, Math.min(songTop + songH - 3, midY - nn.pitch * halfH));
        const alpha = clamp01(1 - age / visibleSteps) * 0.9;
        const rad = 1.5 + nn.vel * 4;
        const col = mixHex(HEX_EMBER, HEX_ASH, nn.dream);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
        gg.addColorStop(0, col.replace("rgb", "rgba").replace(")", `,${(alpha * 0.7).toFixed(3)})`));
        gg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, rad * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.replace("rgb", "rgba").replace(")", `,${alpha.toFixed(3)})`);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Timeline arc (segmented by movement, tinted by dream, with a marker) ──
      const j = journeyRef.current;
      if (j) {
        const barY = timeTop + timeH * 0.5;
        const barH = Math.max(6, timeH * 0.22);
        const mx = W * 0.06;
        const barW = W - mx * 2;
        // Track.
        ctx.fillStyle = "rgba(42,35,28,0.6)";
        ctx.fillRect(mx, barY - barH / 2, barW, barH);
        // Movement segments.
        for (const mv of j.movements) {
          const x0 = mx + (mv.tStart / j.totalLoops) * barW;
          const x1 = mx + (mv.tEnd / j.totalLoops) * barW;
          ctx.fillStyle = mixHex(HEX_EMBER, HEX_ASH, mv.charDream)
            .replace("rgb", "rgba")
            .replace(")", ",0.55)");
          ctx.fillRect(x0 + 0.5, barY - barH / 2, Math.max(1, x1 - x0 - 1), barH);
        }
        // Progress marker.
        const tau = stepCount / STEPS_PER_LOOP;
        const prog = ((tau % j.totalLoops) + j.totalLoops) % j.totalLoops / j.totalLoops;
        const mxk = mx + prog * barW;
        ctx.fillStyle = HEX_GLOW;
        ctx.fillRect(mxk - 1.5, barY - barH / 2 - 3, 3, barH + 6);
        const mg = ctx.createRadialGradient(mxk, barY, 0, mxk, barY, barH);
        mg.addColorStop(0, "rgba(240,194,122,0.5)");
        mg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mxk, barY, barH, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    // ── Animation loop ───────────────────────────────────────────────────────────
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      let frameDt = (now - last) / 1000;
      last = now;
      if (frameDt > 0.1) frameDt = 0.1;
      acc += frameDt;

      let steps = 0;
      while (acc >= STEP_DT && steps < 8) {
        acc -= STEP_DT;
        runStep();
        steps++;
      }

      drawScene();

      hudTimer += frameDt;
      if (hudTimer > 0.2) {
        hudTimer = 0;
        const j = journeyRef.current;
        const anchors = anchorsRef.current;
        const names = namesRef.current;
        if (j && anchors.length) {
          const tau = stepCountRef.current / STEPS_PER_LOOP;
          const s = sampleJourney(j, tau);
          const attn = res.attentionVec;
          let nearest = 0;
          let bw = -1;
          for (let k = 0; k < attn.length; k++) {
            if ((attn[k] ?? 0) > bw) {
              bw = attn[k] ?? 0;
              nearest = k;
            }
          }
          setHud({
            movement: s.name,
            nearest: names[nearest] ?? "?",
            dream: clamp01(s.dream * (0.45 + 0.55 * depthRef.current)),
            elapsed: stepCountRef.current * STEP_DT,
            total: j.totalLoops * STEPS_PER_LOOP * STEP_DT,
            progress: s.progress,
          });
        }
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    // ── Teardown ─────────────────────────────────────────────────────────────────
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      resRef.current = null;
    };
    // Run once on mount; live values are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio + mic teardown on unmount (separate from the render effect).
  const micStop = mic.stop;
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      droneRef.current?.stop();
      voices.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voices.clear();
      masterRef.current?.disconnect();
      void ctxRef.current?.close();
      micStop();
    };
  }, [micStop]);

  const pct = Math.round(hud.progress * 100);

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <PrototypeNav slugs={["12976-dreammedley"]} />

      <header className="mb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · cycle 3 · reservoir lineage
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Dream Medley
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          The songs you sing become a long, slow dream. A single echo-state mind
          learns each phrase as its own memory, then a cursor wanders the space
          between them — recalling each song exactly, drifting into the{" "}
          <span className="text-foreground">edge-of-chaos</span> hybrids between,
          developing fragments, and finding its way home. It is different at minute
          five than at minute one.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border">
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="block aspect-[16/10] w-full cursor-pointer bg-background"
          aria-label="Latent memory map and journey timeline of the reservoir"
        />
        {!canvasOk && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-base text-muted-foreground">
              This view needs a 2D canvas, which is unavailable in this browser. The
              reservoir still runs its dream underneath.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="absolute right-3 top-3 rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
        {!userTook && (
          <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            auto-dreaming · click the field to steer · Begin for sound
          </p>
        )}
      </div>

      {/* Journey readout */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            movement
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{hud.movement}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            nearest memory
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{hud.nearest}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dream depth (live)
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
            {hud.dream.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            journey
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
            {formatTime(hud.elapsed)} / {formatTime(hud.total)} · {pct}%
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="depth" className="text-sm font-medium text-foreground">
              recall <span className="text-muted-foreground">⟷</span> dream depth
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {depth.toFixed(2)}
            </span>
          </div>
          <input
            id="depth"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={depth}
            onChange={(e) => onDepthInput(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-primary"
          />
          <p className="text-sm text-muted-foreground">
            Low depth keeps the between-space close to faithful recall; high depth
            lets the cursor stray far into the edge-of-chaos hybrids. Click the map
            to steer the dream toward a chosen song.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={toggleSound}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {soundOn ? "Sound off" : "Begin (sound on)"}
          </button>
          <button
            type="button"
            onClick={startRecording}
            disabled={recording || memCount >= MAX_MEMORIES}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {recording
              ? "Listening…"
              : memCount >= MAX_MEMORIES
                ? "Memory slots full"
                : "Sing / play a song"}
          </button>
          <span className="flex items-center text-sm text-muted-foreground">
            {memCount} songs held
          </span>
        </div>

        {micNote && (
          <p className={`text-sm ${mic.error ? "text-destructive" : "text-muted-foreground"}`}>
            {micNote}
          </p>
        )}
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One genuine <span className="text-foreground">Echo-State Network</span>{" "}
                (Jaeger 2001) — 150 units under a fixed sparse recurrent matrix,
                driven only by a phase clock — holds several songs at once. Each song
                is a separate readout trained by ridge / Tikhonov regression
                (Lukoševičius &amp; Jaeger 2009), solved with Cholesky, so every one
                is reproduced <span className="text-foreground">exactly</span>.
              </p>
              <p>
                The songs are treated as memory slots and{" "}
                <span className="text-foreground">attended over</span> — the design of
                the <span className="text-foreground">Echo State Transformer</span>{" "}
                (arXiv:2507.02917). Because all readouts were trained on the same
                clock-driven cycle, a blend of two of them is a blend of the two
                melodies — a genuine hybrid. Attention on one slot with dream ≈ 0 is
                faithful recall; attention spread with dream &gt; 0, ρ pushed past the
                edge of chaos and state noise injected, is the wandering between-space.
              </p>
              <p>
                A slow cursor auto-navigates that latent space over a five-minute arc:
                exposition, the spaces between, development, deep dream, the long way
                home, return. <span className="text-foreground">Minute five differs
                from minute one</span> because the arc genuinely progresses, because
                each memory&apos;s warmth accumulates with every visit, and because the
                reservoir is never reset — supercritical and noise-driven between
                memories, its trajectory never repeats.
              </p>
              <p>
                Lineage: 10984-echofold (drift only) → 11376-recallorbit (one exact
                phrase) → 12976-dreammedley (many songs, one long dream). Sing a phrase
                to add it as a new memory; the dream weaves it in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
