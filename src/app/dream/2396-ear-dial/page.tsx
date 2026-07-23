"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

/* ------------------------------------------------------------------ *
 * Perfect Ear — a listen-first pitch-memory game.
 *
 * LISTEN: the game plays a short sequence of soft tones. No touching.
 * RECALL: silence. Re-dial each remembered pitch with ONE big knob,
 *         hunting by ear via a live preview tone, then lock it in.
 *         Accuracy is scored in cents. Rounds escalate.
 *
 * Determinism: a seeded mulberry32 PRNG (0x2396) drives every sequence
 * AND a visual auto-demo that self-plays one round on idle load, so a
 * silent glance shows the whole loop. No Math.random / Date anywhere.
 * ------------------------------------------------------------------ */

const SEED = 0x2396;
const LISTEN_GAP_MS = 150;
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Seeded PRNG — deterministic across runs so review + demo are stable. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function midiToName(m: number) {
  const r = Math.round(m);
  const name = NOTE_NAMES[((r % 12) + 12) % 12];
  const oct = Math.floor(r / 12) - 1;
  return `${name}${oct}`;
}

/** Per-note score from absolute pitch error in cents. */
function computeScore(errCents: number) {
  const perfect = 15;
  const zeroAt = 160;
  if (errCents <= perfect) return 100;
  if (errCents >= zeroAt) return 0;
  return Math.round(100 * (1 - (errCents - perfect) / (zeroAt - perfect)));
}

type NoteResult = { err: number; sc: number };

type RoundSpec = {
  targets: number[]; // integer MIDI notes
  minMidi: number;
  maxMidi: number;
  listenDur: number; // seconds per listen tone
};

/** Build a deterministic round. Difficulty escalates with `round`. */
function buildRound(rng: () => number, round: number): RoundSpec {
  const noteCount = Math.min(2 + Math.floor((round - 1) / 2), 6);
  const span = Math.min(12 + (round - 1) * 3, 30);
  const center = 62; // D4
  const minMidi = center - span / 2;
  const maxMidi = center + span / 2;
  const listenDur = Math.max(0.32, 0.6 - (round - 1) * 0.04);

  // Diatonic pool (C major set) inside the range — pleasant, still a test.
  const pool: number[] = [];
  const majorSet = [0, 2, 4, 5, 7, 9, 11];
  for (let m = Math.ceil(minMidi); m <= Math.floor(maxMidi); m++) {
    if (majorSet.includes(((m % 12) + 12) % 12)) pool.push(m);
  }
  const targets: number[] = [];
  let prev = -1;
  for (let i = 0; i < noteCount; i++) {
    let pick = prev;
    let guard = 0;
    while (pick === prev && guard < 8) {
      pick = pool[Math.floor(rng() * pool.length)];
      guard++;
    }
    prev = pick;
    targets.push(pick);
  }
  return { targets, minMidi, maxMidi, listenDur };
}

type Phase = "intro" | "listen" | "recall" | "score";

type Pulse = { idx: number; midi: number; t: number } | null;

type GS = {
  phase: Phase;
  round: number;
  targets: number[];
  minMidi: number;
  maxMidi: number;
  listenDur: number;
  phaseStart: number; // performance.now ms
  lastTone: number; // last listen tone index triggered
  pulse: Pulse;
  demo: boolean;
  demoT: number[]; // demo target dial positions (0..1) with seeded error
  settle: number;
  noteIndex: number;
  dialT: number; // 0..1 current dial position
  locked: number[]; // committed dial MIDI values
  noteScores: NoteResult[];
  roundScore: number;
  roundAvg: number;
  streak: number;
  best: number;
};

type View = {
  phase: Phase;
  round: number;
  noteIndex: number;
  noteCount: number;
  lockedCount: number;
  dialMidi: number;
  dialFreq: number;
  noteName: string;
  streak: number;
  best: number;
  roundScore: number;
  roundAvg: number;
  noteScores: NoteResult[];
  targets: number[];
  locked: number[];
  demo: boolean;
};

type Env = {
  gs: GS;
  rng: () => number;
  ctx: AudioContext | null;
  master: GainNode | null;
  activeOscs: Set<OscillatorNode>;
  previewOsc: OscillatorNode | null;
  previewGain: GainNode | null;
  lastInteract: number;
  dragging: boolean;
  setView: ((v: View) => void) | null;
  lastSig: string;
};

function freshGS(): GS {
  return {
    phase: "intro",
    round: 1,
    targets: [],
    minMidi: 56,
    maxMidi: 68,
    listenDur: 0.55,
    phaseStart: 0,
    lastTone: -1,
    pulse: null,
    demo: false,
    demoT: [],
    settle: 0,
    noteIndex: 0,
    dialT: 0.5,
    locked: [],
    noteScores: [],
    roundScore: 0,
    roundAvg: 0,
    streak: 0,
    best: 0,
  };
}

/* ------------------------------- audio ------------------------------- */

function initAudio(env: Env) {
  if (env.ctx || typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  env.ctx = ctx;
  env.master = master;
  if (ctx.state === "suspended") void ctx.resume();
}

function playTone(env: Env, freq: number, dur: number) {
  const { ctx, master } = env;
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = env.gs.round < 3 ? "sine" : "triangle";
  osc.frequency.value = freq;
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
  g.gain.setValueAtTime(0.14, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  env.activeOscs.add(osc);
  osc.onended = () => {
    env.activeOscs.delete(osc);
    g.disconnect();
  };
}

function startPreview(env: Env) {
  const { ctx, master } = env;
  if (!ctx || !master || env.previewOsc) return;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  osc.connect(g).connect(master);
  osc.start();
  env.previewOsc = osc;
  env.previewGain = g;
}

function stopPreview(env: Env) {
  if (env.previewOsc) {
    try {
      env.previewOsc.stop();
    } catch {
      /* already stopped */
    }
    env.previewOsc.disconnect();
    env.previewOsc = null;
  }
  if (env.previewGain) {
    env.previewGain.disconnect();
    env.previewGain = null;
  }
}

function updatePreview(env: Env, now: number) {
  const { ctx, previewOsc, previewGain } = env;
  if (!ctx || !previewOsc || !previewGain) return;
  const gs = env.gs;
  const midi = gs.minMidi + gs.dialT * (gs.maxMidi - gs.minMidi);
  previewOsc.frequency.setTargetAtTime(midiToFreq(midi), ctx.currentTime, 0.02);
  const active = now - env.lastInteract < 350;
  previewGain.gain.setTargetAtTime(
    active ? 0.05 : 0.0001,
    ctx.currentTime,
    0.05,
  );
}

/* ---------------------------- game logic ---------------------------- */

function startRound(env: Env, round: number, demo: boolean) {
  const gs = env.gs;
  const spec = buildRound(env.rng, round);
  gs.round = round;
  gs.targets = spec.targets;
  gs.minMidi = spec.minMidi;
  gs.maxMidi = spec.maxMidi;
  gs.listenDur = spec.listenDur;
  gs.phase = "listen";
  gs.phaseStart = performance.now();
  gs.lastTone = -1;
  gs.pulse = null;
  gs.demo = demo;
  gs.settle = 0;
  gs.noteIndex = 0;
  gs.dialT = 0.5;
  gs.locked = [];
  gs.noteScores = [];
  gs.roundScore = 0;
  gs.roundAvg = 0;
  stopPreview(env);
  if (demo) {
    const range = spec.maxMidi - spec.minMidi;
    gs.demoT = spec.targets.map((m) => {
      const tt = (m - spec.minMidi) / range;
      const errCents = (env.rng() * 2 - 1) * 35; // realistic near-miss
      return clamp(tt + errCents / 100 / range, 0, 1);
    });
  } else {
    gs.demoT = [];
  }
}

function enterRecall(env: Env) {
  const gs = env.gs;
  gs.phase = "recall";
  gs.phaseStart = performance.now();
  gs.noteIndex = 0;
  gs.dialT = 0.5;
  gs.settle = 0;
  if (!gs.demo) startPreview(env);
}

function commitLock(env: Env) {
  const gs = env.gs;
  if (gs.noteIndex >= gs.targets.length) return;
  const dialMidi = gs.minMidi + gs.dialT * (gs.maxMidi - gs.minMidi);
  const err = Math.abs(dialMidi - gs.targets[gs.noteIndex]) * 100;
  gs.locked.push(dialMidi);
  gs.noteScores.push({ err, sc: computeScore(err) });
  gs.noteIndex++;
  gs.dialT = 0.5;
  gs.settle = 0;
  // Confirmation blip.
  if (!gs.demo) playTone(env, midiToFreq(dialMidi), 0.12);
  if (gs.noteIndex >= gs.targets.length) finishRound(env);
}

function finishRound(env: Env) {
  const gs = env.gs;
  const total = gs.noteScores.reduce((s, n) => s + n.sc, 0);
  const avg = gs.noteScores.length ? total / gs.noteScores.length : 0;
  gs.roundScore = total;
  gs.roundAvg = avg;
  gs.streak = avg >= 60 ? gs.streak + 1 : 0;
  gs.best = Math.max(gs.best, total);
  gs.phase = "score";
  gs.phaseStart = performance.now();
  stopPreview(env);
}

function driveDemo(env: Env, now: number) {
  const gs = env.gs;
  const target = gs.demoT[gs.noteIndex] ?? 0.5;
  gs.dialT += (target - gs.dialT) * 0.12;
  env.lastInteract = now;
  if (Math.abs(gs.dialT - target) < 0.003) {
    gs.settle++;
    if (gs.settle > 22) commitLock(env);
  } else {
    gs.settle = 0;
  }
}

/* ----------------------------- drawing ------------------------------ */

function drawFrame(g: CanvasRenderingContext2D, env: Env, now: number, w: number, h: number) {
  const gs = env.gs;
  g.clearRect(0, 0, w, h);

  // Dark console panel (art layer — raw hex allowed here).
  const bg = g.createRadialGradient(w / 2, h * 0.52, 20, w / 2, h * 0.52, h);
  bg.addColorStop(0, "#12121b");
  bg.addColorStop(1, "#06060b");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.56;
  const R = Math.min(w, h) * 0.32;

  // Sequence dots (top).
  const n = Math.max(gs.targets.length, 2);
  const dotGap = Math.min(34, w / (n + 2));
  const dotY = 30;
  const startX = cx - ((n - 1) * dotGap) / 2;
  for (let i = 0; i < n; i++) {
    const x = startX + i * dotGap;
    let fill = "#2a2a3a";
    let ring = false;
    if (gs.phase === "listen") {
      if (gs.pulse && gs.pulse.idx === i) {
        const age = (now - gs.pulse.t) / (gs.listenDur * 1000);
        const k = clamp(1 - age, 0, 1);
        fill = `rgba(139,92,246,${0.4 + 0.6 * k})`;
        ring = true;
      } else if (i < (gs.lastTone ?? -1)) {
        fill = "#4c3f7a";
      }
    } else if (gs.phase === "recall") {
      if (i < gs.noteIndex) fill = "#7c5cff";
      else if (i === gs.noteIndex) {
        fill = "#8b5cf6";
        ring = true;
      }
    } else if (gs.phase === "score") {
      const s = gs.noteScores[i];
      fill = s ? (s.sc >= 85 ? "#7c5cff" : s.sc >= 45 ? "#5b4b9a" : "#3a3350") : "#2a2a3a";
    }
    if (ring) {
      g.beginPath();
      g.arc(x, dotY, 9, 0, Math.PI * 2);
      g.strokeStyle = "rgba(139,92,246,0.6)";
      g.lineWidth = 2;
      g.stroke();
    }
    g.beginPath();
    g.arc(x, dotY, 5, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  }

  // Dial geometry: sweep -135°..+135° around top, gap at bottom.
  const a0 = (-90 - 135) * (Math.PI / 180);
  const a1 = (-90 + 135) * (Math.PI / 180);
  const angleOf = (t: number) => a0 + t * (a1 - a0);

  // Track.
  g.beginPath();
  g.arc(cx, cy, R, a0, a1);
  g.strokeStyle = "rgba(148,163,184,0.16)";
  g.lineWidth = 10;
  g.lineCap = "round";
  g.stroke();

  // Filled track up to current position (only meaningful when dialing).
  const showDial = gs.phase === "recall" || gs.phase === "score";
  if (showDial) {
    g.beginPath();
    g.arc(cx, cy, R, a0, angleOf(gs.dialT));
    g.strokeStyle = "rgba(139,92,246,0.85)";
    g.lineWidth = 10;
    g.lineCap = "round";
    g.stroke();
  }

  // Ticks.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = angleOf(t);
    const inner = i % 6 === 0 ? R - 20 : R - 12;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
    g.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    g.strokeStyle = "rgba(148,163,184,0.25)";
    g.lineWidth = i % 6 === 0 ? 2 : 1;
    g.stroke();
  }

  // Score phase: reveal target + locked markers.
  if (gs.phase === "score") {
    const range = gs.maxMidi - gs.minMidi;
    for (let i = 0; i < gs.targets.length; i++) {
      const tt = (gs.targets[i] - gs.minMidi) / range;
      const at = angleOf(tt);
      g.beginPath();
      g.moveTo(cx + Math.cos(at) * (R - 24), cy + Math.sin(at) * (R - 24));
      g.lineTo(cx + Math.cos(at) * (R + 8), cy + Math.sin(at) * (R + 8));
      g.strokeStyle = "rgba(124,255,138,0.75)";
      g.lineWidth = 2;
      g.stroke();

      const lm = gs.locked[i];
      if (lm !== undefined) {
        const lt = clamp((lm - gs.minMidi) / range, 0, 1);
        const al = angleOf(lt);
        g.beginPath();
        g.arc(cx + Math.cos(al) * R, cy + Math.sin(al) * R, 4, 0, Math.PI * 2);
        g.fillStyle = "rgba(139,92,246,0.9)";
        g.fill();
      }
    }
  }

  // Needle (dial pointer).
  if (showDial) {
    const a = angleOf(gs.dialT);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
    g.strokeStyle = "#c9b8ff";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.stroke();
  }

  // Listen pulse ring (breathing at tone frequency, visual only).
  if (gs.phase === "listen" && gs.pulse) {
    const age = (now - gs.pulse.t) / (gs.listenDur * 1000);
    const k = clamp(1 - age, 0, 1);
    g.beginPath();
    g.arc(cx, cy, R * (0.55 + 0.12 * Math.sin(now / 90)), 0, Math.PI * 2);
    g.strokeStyle = `rgba(139,92,246,${0.35 * k})`;
    g.lineWidth = 2;
    g.stroke();
  }

  // Center hub.
  g.beginPath();
  g.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
  g.fillStyle = "rgba(139,92,246,0.06)";
  g.fill();

  // Center label.
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (gs.phase === "listen") {
    g.fillStyle = "#e5e2f5";
    g.font = "600 22px ui-sans-serif, system-ui, sans-serif";
    g.fillText("LISTEN", cx, cy - 6);
    g.fillStyle = "rgba(180,175,205,0.7)";
    g.font = "12px ui-monospace, monospace";
    g.fillText("no touching", cx, cy + 16);
  } else if (gs.phase === "recall") {
    const midi = gs.minMidi + gs.dialT * (gs.maxMidi - gs.minMidi);
    g.fillStyle = "#e5e2f5";
    g.font = "600 26px ui-monospace, monospace";
    g.fillText(midiToName(midi), cx, cy - 6);
    g.fillStyle = "rgba(180,175,205,0.7)";
    g.font = "12px ui-monospace, monospace";
    g.fillText(`${midiToFreq(midi).toFixed(1)} Hz`, cx, cy + 16);
  } else if (gs.phase === "score") {
    g.fillStyle = "#e5e2f5";
    g.font = "600 30px ui-monospace, monospace";
    g.fillText(`${gs.roundScore}`, cx, cy - 4);
    g.fillStyle = "rgba(180,175,205,0.7)";
    g.font = "12px ui-monospace, monospace";
    g.fillText("round score", cx, cy + 18);
  } else {
    g.fillStyle = "rgba(180,175,205,0.55)";
    g.font = "12px ui-monospace, monospace";
    g.fillText("press listen", cx, cy + 2);
  }

  if (gs.demo) {
    g.fillStyle = "rgba(139,92,246,0.8)";
    g.textAlign = "left";
    g.font = "11px ui-monospace, monospace";
    g.fillText("AUTO-DEMO", 12, h - 14);
  }
}

/* ----------------------------- component ---------------------------- */

export default function EarDialPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const envRef = useRef<Env | null>(null);
  const rafRef = useRef<number>(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const [view, setView] = useState<View | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Build env once.
  if (!envRef.current) {
    envRef.current = {
      gs: freshGS(),
      rng: mulberry32(SEED),
      ctx: null,
      master: null,
      activeOscs: new Set(),
      previewOsc: null,
      previewGain: null,
      lastInteract: 0,
      dragging: false,
      setView: null,
      lastSig: "",
    };
  }

  // Cancel demo & mark that the user has taken over.
  const takeOver = useCallback(() => {
    startedRef.current = true;
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    const env = envRef.current;
    if (env && env.gs.demo) {
      env.gs.demo = false;
      env.gs.phase = "intro";
    }
  }, []);

  const handleStart = useCallback(() => {
    const env = envRef.current;
    if (!env) return;
    takeOver();
    initAudio(env);
    env.gs.streak = 0;
    startRound(env, 1, false);
  }, [takeOver]);

  const handleLock = useCallback(() => {
    const env = envRef.current;
    if (!env || env.gs.demo || env.gs.phase !== "recall") return;
    env.lastInteract = performance.now();
    commitLock(env);
  }, []);

  const handleNext = useCallback(() => {
    const env = envRef.current;
    if (!env || env.gs.phase !== "score") return;
    startRound(env, env.gs.round + 1, false);
  }, []);

  // Pointer input on the dial (recall only, user mode).
  const pointerFromEvent = useCallback((clientX: number, clientY: number) => {
    const env = envRef.current;
    const canvas = canvasRef.current;
    if (!env || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height * 0.56;
    const deg = Math.atan2(py - cy, px - cx) * (180 / Math.PI);
    // rel to top (-90deg), normalized to (-180,180]
    let rel = deg + 90;
    rel = ((((rel + 180) % 360) + 360) % 360) - 180;
    env.gs.dialT = clamp(0.5 + rel / 270, 0, 1);
    env.lastInteract = performance.now();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const env = envRef.current;
      takeOver();
      if (!env || env.gs.demo || env.gs.phase !== "recall") return;
      env.dragging = true;
      (e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
      pointerFromEvent(e.clientX, e.clientY);
    },
    [takeOver, pointerFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const env = envRef.current;
      if (!env || !env.dragging || env.gs.phase !== "recall") return;
      pointerFromEvent(e.clientX, e.clientY);
    },
    [pointerFromEvent],
  );

  const onPointerUp = useCallback(() => {
    const env = envRef.current;
    if (env) env.dragging = false;
  }, []);

  // Keyboard: arrows nudge, Enter/Space locks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const env = envRef.current;
      if (!env) return;
      if (env.gs.phase !== "recall" || env.gs.demo) return;
      const range = env.gs.maxMidi - env.gs.minMidi;
      const cents = e.shiftKey ? 25 : 5;
      const step = cents / 100 / range;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        env.gs.dialT = clamp(env.gs.dialT + step, 0, 1);
        env.lastInteract = performance.now();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        env.gs.dialT = clamp(env.gs.dialT - step, 0, 1);
        env.lastInteract = performance.now();
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        env.lastInteract = performance.now();
        commitLock(env);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Main loop + demo scheduling + teardown.
  useEffect(() => {
    const env = envRef.current;
    const canvas = canvasRef.current;
    if (!env || !canvas) return;
    env.setView = setView;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const g = canvas.getContext("2d");
      if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Auto-demo after 2s idle (visual-only; no AudioContext without gesture).
    demoTimerRef.current = setTimeout(() => {
      if (!startedRef.current && env.gs.phase === "intro") {
        startRound(env, 1, true);
      }
    }, 2000);

    const tick = (now: number) => {
      const gs = env.gs;

      if (gs.phase === "listen") {
        const el = now - gs.phaseStart;
        const slot = gs.listenDur * 1000 + LISTEN_GAP_MS;
        const idx = Math.floor(el / slot);
        if (idx > gs.lastTone && idx < gs.targets.length) {
          gs.lastTone = idx;
          gs.pulse = { idx, midi: gs.targets[idx], t: now };
          playTone(env, midiToFreq(gs.targets[idx]), gs.listenDur);
        }
        const total = gs.targets.length * slot + 450;
        if (el >= total) enterRecall(env);
      } else if (gs.phase === "recall") {
        if (gs.demo) driveDemo(env, now);
        updatePreview(env, now);
      } else if (gs.phase === "score") {
        if (gs.demo && now - gs.phaseStart > 2000) {
          startRound(env, gs.round >= 4 ? 1 : gs.round + 1, true);
        }
      }

      const rect = canvas.getBoundingClientRect();
      const g = canvas.getContext("2d");
      if (g) drawFrame(g, env, now, rect.width, rect.height);

      // Push a throttled snapshot for the DOM chrome.
      const dialMidi = gs.minMidi + gs.dialT * (gs.maxMidi - gs.minMidi);
      const sig = `${gs.phase}|${gs.round}|${gs.noteIndex}|${gs.locked.length}|${Math.round(dialMidi * 100)}|${gs.streak}|${gs.roundScore}|${gs.demo}`;
      if (sig !== env.lastSig) {
        env.lastSig = sig;
        env.setView?.({
          phase: gs.phase,
          round: gs.round,
          noteIndex: gs.noteIndex,
          noteCount: gs.targets.length,
          lockedCount: gs.locked.length,
          dialMidi,
          dialFreq: midiToFreq(dialMidi),
          noteName: midiToName(dialMidi),
          streak: gs.streak,
          best: gs.best,
          roundScore: gs.roundScore,
          roundAvg: gs.roundAvg,
          noteScores: gs.noteScores.slice(),
          targets: gs.targets.slice(),
          locked: gs.locked.slice(),
          demo: gs.demo,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      stopPreview(env);
      env.activeOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      });
      env.activeOscs.clear();
      if (env.ctx) {
        void env.ctx.close();
        env.ctx = null;
        env.master = null;
      }
    };
  }, []);

  const phase = view?.phase ?? "intro";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <header className="mb-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Perfect Ear · pitch memory
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Perfect Ear
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Listen to a short run of tones, then re-dial each pitch from memory.
            One knob, scored in cents. Listen first — you only hear it once.
          </p>
        </header>

        {/* HUD */}
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            round <span className="text-foreground">{view?.round ?? 1}</span>
          </span>
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            streak <span className="text-primary">{view?.streak ?? 0}</span>
          </span>
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            best <span className="text-foreground">{view?.best ?? 0}</span>
          </span>
          {view?.demo && (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              auto-demo
            </span>
          )}
        </div>

        {/* Game canvas */}
        <div className="rounded-lg border border-border bg-card p-2">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="block h-[380px] w-full touch-none rounded-md"
          />
        </div>

        {/* Phase controls */}
        <div className="mt-4">
          {phase === "intro" && (
            <div className="rounded-lg border border-border bg-background/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                How to play
              </p>
              <ol className="mt-2 space-y-1 text-base text-muted-foreground">
                <li>
                  1. <span className="text-foreground">Listen</span> — the game
                  plays a sequence of soft tones. Hands off.
                </li>
                <li>
                  2. <span className="text-foreground">Recall</span> — silence.
                  Drag the dial (or arrow keys) to hunt each pitch by ear.
                </li>
                <li>
                  3. <span className="text-foreground">Lock</span> each note.
                  Score in cents, build a streak, harder rounds follow.
                </li>
              </ol>
              <button
                onClick={handleStart}
                className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Listen · start round 1
              </button>
              <p className="mt-2 text-sm text-muted-foreground">
                Idle a moment and a silent auto-demo plays the whole loop for
                you.
              </p>
            </div>
          )}

          {phase === "listen" && (
            <div className="rounded-lg border border-border bg-background/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Listen
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                Committing {view?.noteCount ?? 0} tones to memory. You hear the
                sequence once — no replay.
              </p>
            </div>
          )}

          {phase === "recall" && (
            <div className="rounded-lg border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Recall · note {Math.min((view?.noteIndex ?? 0) + 1, view?.noteCount ?? 1)} of{" "}
                  {view?.noteCount ?? 0}
                </p>
                <p className="font-mono text-sm text-foreground">
                  {view?.noteName} ·{" "}
                  <span className="text-muted-foreground">
                    {view?.dialFreq?.toFixed(1)} Hz
                  </span>
                </p>
              </div>
              <p className="mt-2 text-base text-muted-foreground">
                Drag the dial or use ← → (Shift for coarse). A preview tone
                tracks your dial so you can hunt by ear.
              </p>
              <button
                onClick={handleLock}
                disabled={view?.demo}
                className="mt-3 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Lock this note (Enter)
              </button>
            </div>
          )}

          {phase === "score" && (
            <div className="rounded-lg border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Round {view?.round} result
                </p>
                <p className="font-mono text-sm text-foreground">
                  {view?.roundScore} pts · avg {Math.round(view?.roundAvg ?? 0)}
                </p>
              </div>
              <ul className="mt-3 space-y-1">
                {(view?.noteScores ?? []).map((ns, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between font-mono text-sm"
                  >
                    <span className="text-muted-foreground">
                      note {i + 1} · {midiToName(view!.targets[i])}
                    </span>
                    <span
                      className={
                        ns.sc >= 85
                          ? "text-primary"
                          : ns.sc >= 45
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }
                    >
                      {Math.round(ns.err)}¢ off · {ns.sc}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleNext}
                disabled={view?.demo}
                className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Next round →
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {notesOpen ? "Hide design notes" : "Design notes"}
          </button>
        </div>
      </div>

      {notesOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/70 p-4">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-xl font-medium">The listen-first idea</h2>
            <p className="mt-2 text-base text-muted-foreground">
              A player who can tweak a control <em>while</em> the target sounds
              is chasing the needle, not remembering. Separating a locked{" "}
              <span className="text-foreground">listen</span> phase from a silent{" "}
              <span className="text-foreground">recall</span> phase turns this
              into a real test of pitch memory — the mechanic behind the
              &ldquo;dialed sound game&rdquo; finding (dev.to, 2026) and echoing
              Diana Deutsch&rsquo;s work on how fragile short-term pitch memory
              is.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              One expressive control (the dial) is deliberate: a clear goal and
              a single master knob, scored musically in cents. Sequences and the
              auto-demo are driven by a seeded PRNG, so every run is identical.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2396-ear-dial"]} />
    </main>
  );
}
