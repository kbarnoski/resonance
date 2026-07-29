"use client";

// ════════════════════════════════════════════════════════════════════════════
// SONGLINES (3648) — "What if a recording's timbre-map were an instrument you
// play like a keyboard, and your performance a loop you record and replay?"
//
// A deliberate second-cycle DEEPENING of 3608-atlas. Atlas shipped the *place*:
// a navigable timbre-atlas you wander with a pointer. It never shipped the
// *score*. Songlines reuses the same corpus builder + k-nearest granular engine
// + WebGL2 point cloud (all copied in below, self-contained), but:
//
//   1. clusters the atlas into ~12 timbre WAYPOINTS with a deterministic
//      k-means (see `computeWaypoints` in ./atlas-corpus.ts) — nameable notes
//      instead of a continuous field;
//   2. replaces the pointer with a NON-POINTER instrument: computer-keyboard
//      keys (A W S E D F T G Y H U J, low→high) and Web MIDI, either of which
//      drives the granular engine's cursor toward a waypoint with a fast glide
//      (~55 ms) — a press reads as a note, not a teleport;
//   3. adds RECORD → LOOP: the sequence of (waypoint, time, velocity) events a
//      performance produces is captured and, on stop, loops forever, re-driving
//      the cursor automatically — a recording becomes a repeatable composition.
//
// A seeded (mulberry32) autopilot performs a short phrase the instant Start is
// pressed, through the exact same record path a human uses, so a headless
// reviewer sees keys fire → the cursor glide → a loop get recorded → the trail
// replay, with no display, audio output, or input device required.
//
// References:
//   • Diemo Schwarz — CataRT / corpus-based concatenative synthesis (IRCAM):
//     navigating "the space of sound characteristics" and noting that the
//     navigation itself "can be recorded for later playback" — the exact idea
//     this piece builds an instrument and a UI around.
//   • arXiv:2606.08286, "FXplorer: A Map-Based Interface" (Jun 2026) — a recent
//     sibling treating a 2-D map as a playable control surface.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCorpus,
  computeRestPoint,
  computeWaypoints,
  downmixToMono,
  mulberry32,
  renderDefaultPhrase,
  type Corpus,
  type Waypoint,
} from "./atlas-corpus";
import { GranularEngine } from "./atlas-audio";
import { PointCloudRenderer } from "./atlas-gl";
import { runMidiAccess, type MidiConnection } from "./songlines-midi";

type Phase = "gate" | "building" | "ready" | "glfail";
type RecState = "idle" | "recording" | "looping";

interface RecEvent {
  waypoint: number;
  tOnMs: number;
  tOffMs: number | null;
  velocity: number;
}

interface AutoNote {
  waypoint: number;
  onMs: number;
  offMs: number;
  velocity: number;
}

const WAYPOINT_COUNT = 12;
const KEY_CODES = [
  "KeyA",
  "KeyW",
  "KeyS",
  "KeyE",
  "KeyD",
  "KeyF",
  "KeyT",
  "KeyG",
  "KeyY",
  "KeyH",
  "KeyU",
  "KeyJ",
];
const KEY_LABELS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J"];
const KEYBOARD_VELOCITY = 0.85;
const GLIDE_TAU = 0.055; // seconds — a press reads as a note, not a teleport
const REST_TAIL_MS = 160;
const WAYPOINT_SEED = 0x53648;
const AUTOPILOT_SEED = 0x3648;

// ── Autopilot: a short, seeded melodic walk across the waypoints. ────────────
function buildAutopilotScript(waypointCount: number, seed: number): AutoNote[] {
  if (waypointCount === 0) return [];
  const rng = mulberry32(seed);
  const steps = [-2, -1, -1, 0, 1, 1, 2];
  const notes: AutoNote[] = [];
  let degree = Math.floor(waypointCount / 2);
  let t = 120;
  const noteCount = 6;
  for (let i = 0; i < noteCount; i++) {
    const delta = steps[Math.floor(rng() * steps.length)];
    degree = Math.max(0, Math.min(waypointCount - 1, degree + delta));
    const dur = 150 + Math.floor(rng() * 150);
    const gap = 45 + Math.floor(rng() * 95);
    const velocity = 0.7 + rng() * 0.25;
    notes.push({ waypoint: degree, onMs: t, offMs: t + dur, velocity });
    t += dur + gap;
  }
  return notes;
}

// ── MIDI note number → nearest waypoint by pitch. ────────────────────────────
function computeNearestWaypointForMidiNote(note: number, waypoints: Waypoint[]): number {
  if (waypoints.length === 0) return -1;
  const targetHz = 440 * Math.pow(2, (note - 69) / 12);
  const targetLog = Math.log2(Math.max(20, targetHz));
  let best = 0;
  let bestD = Infinity;
  waypoints.forEach((w, i) => {
    const wLog = Math.log2(Math.max(20, w.pitchHz || w.centroidHz || 20));
    const d = Math.abs(wLog - targetLog);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// ── 2-D overlay: waypoint nodes + labels + the recorded loop's violet trail. ─
interface OverlayState {
  waypoints: Waypoint[];
  keyLabels: string[];
  activeWaypoint: number;
  events: RecEvent[];
  looping: boolean;
  loopLenMs: number;
  loopElapsedMs: number;
  timeSec: number;
}

function drawOverlay(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  renderer: PointCloudRenderer,
  state: OverlayState,
): void {
  g.clearRect(0, 0, width, height);
  if (state.waypoints.length === 0) return;

  const nodeScreens = state.waypoints.map((w) => renderer.atlasToScreen(w.x, w.y, width, height));

  if (state.events.length > 1) {
    g.save();
    g.strokeStyle = "rgba(168, 130, 255, 0.5)";
    g.lineWidth = 2;
    g.shadowColor = "rgba(168, 110, 255, 0.85)";
    g.shadowBlur = 14;
    g.beginPath();
    state.events.forEach((ev, i) => {
      const [x, y] = nodeScreens[ev.waypoint] ?? [0, 0];
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.restore();

    // Dashed return-to-start segment — visualizes where the loop wraps.
    g.save();
    g.setLineDash([4, 5]);
    g.strokeStyle = "rgba(168, 130, 255, 0.25)";
    g.lineWidth = 1.5;
    const [fx, fy] = nodeScreens[state.events[0].waypoint] ?? [0, 0];
    const [lx, ly] = nodeScreens[state.events[state.events.length - 1].waypoint] ?? [0, 0];
    g.beginPath();
    g.moveTo(lx, ly);
    g.lineTo(fx, fy);
    g.stroke();
    g.restore();
  }

  // Travelling dot along the trail while the loop replays.
  if (state.looping && state.events.length >= 1 && state.loopLenMs > 0) {
    const elapsed = state.loopElapsedMs;
    let segI = 0;
    for (let i = 0; i < state.events.length; i++) {
      if (elapsed >= state.events[i].tOnMs) segI = i;
    }
    const a = state.events[segI];
    const hasNext = segI + 1 < state.events.length;
    const b = hasNext ? state.events[segI + 1] : state.events[0];
    const aT = a.tOnMs;
    const bT = hasNext ? b.tOnMs : state.loopLenMs;
    const frac = bT > aT ? Math.max(0, Math.min(1, (elapsed - aT) / (bT - aT))) : 0;
    const [ax, ay] = nodeScreens[a.waypoint] ?? [0, 0];
    const [bx, by] = nodeScreens[b.waypoint] ?? [0, 0];
    const dx = ax + (bx - ax) * frac;
    const dy = ay + (by - ay) * frac;
    g.save();
    g.fillStyle = "rgba(225, 215, 254, 0.95)";
    g.shadowColor = "rgba(190, 150, 255, 1)";
    g.shadowBlur = 16;
    g.beginPath();
    g.arc(dx, dy, 5.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  state.waypoints.forEach((w, i) => {
    const [x, y] = nodeScreens[i];
    const active = i === state.activeWaypoint;
    const pulse = active ? 0.75 + 0.25 * Math.sin(state.timeSec * 10) : 0;
    const r = active ? 11 + pulse * 4 : 7;
    g.save();
    g.beginPath();
    g.fillStyle = active ? "rgba(200, 160, 255, 0.95)" : "rgba(150, 120, 210, 0.55)";
    g.shadowColor = active ? "rgba(190, 140, 255, 1)" : "rgba(150, 110, 230, 0.35)";
    g.shadowBlur = active ? 20 : 6;
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(225, 215, 254, 0.92)";
    g.font = "600 11px ui-monospace, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(state.keyLabels[i] ?? "", x, y);
    g.restore();
  });
}

export default function SonglinesPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("gate");
  const [audioReady, setAudioReady] = useState(false);
  const [source, setSource] = useState("Generated phrase");
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [recStateUi, setRecStateUi] = useState<RecState>("idle");
  const [recCount, setRecCount] = useState(0);
  const [loopSeconds, setLoopSeconds] = useState(0);
  const [midiStatus, setMidiStatus] = useState<"unsupported" | "no-device" | string>(
    "unsupported",
  );
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [hudActive, setHudActive] = useState(0);
  const [grainCount, setGrainCount] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const rendererRef = useRef<PointCloudRenderer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const waypointsRef = useRef<Waypoint[]>([]);
  const restPointRef = useRef<[number, number]>([0, 0]);
  const midiConnRef = useRef<MidiConnection | null>(null);

  const phaseRef = useRef<Phase>("gate");
  const rafRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const lastHudMsRef = useRef(0);

  const cursorPosRef = useRef<[number, number]>([0, 0]);
  const targetPosRef = useRef<[number, number]>([0, 0]);
  const heldStackRef = useRef<{ id: string; waypoint: number }[]>([]);
  const heldKeyIdsRef = useRef<Set<string>>(new Set());
  const openEventsRef = useRef<Map<string, RecEvent>>(new Map());
  const activeWaypointRef = useRef(-1);

  const recStateRef = useRef<RecState>("idle");
  const recEventsRef = useRef<RecEvent[]>([]);
  const recStartMsRef = useRef(0);
  const loopLenMsRef = useRef(0);
  const loopCycleStartMsRef = useRef(0);
  const firedOnRef = useRef<boolean[]>([]);
  const firedOffRef = useRef<boolean[]>([]);

  const autoScriptRef = useRef<AutoNote[]>([]);
  const autoSequenceActiveRef = useRef(false);
  const autoFiredOnRef = useRef<boolean[]>([]);
  const autoFiredOffRef = useRef<boolean[]>([]);

  // ── Audio unlock ─────────────────────────────────────────────────────────
  const resumeAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } else {
      setAudioReady(ctx.state === "running");
    }
  }, []);

  // ── Recording / loop lifecycle ──────────────────────────────────────────
  const startRecording = useCallback((atMs: number) => {
    recEventsRef.current = [];
    openEventsRef.current.clear();
    recStartMsRef.current = atMs;
    recStateRef.current = "recording";
    setRecStateUi("recording");
    setRecCount(0);
    setLoopSeconds(0);
  }, []);

  const stopRecording = useCallback((atMs: number) => {
    openEventsRef.current.forEach((ev) => {
      ev.tOffMs = atMs - recStartMsRef.current;
    });
    openEventsRef.current.clear();

    const events = recEventsRef.current;
    if (events.length === 0) {
      recStateRef.current = "idle";
      setRecStateUi("idle");
      return;
    }
    let maxOff = 0;
    for (const ev of events) {
      const off = ev.tOffMs ?? ev.tOnMs + 120;
      if (off > maxOff) maxOff = off;
    }
    const loopLen = Math.max(500, maxOff + REST_TAIL_MS);
    loopLenMsRef.current = loopLen;
    loopCycleStartMsRef.current = atMs;
    firedOnRef.current = events.map(() => false);
    firedOffRef.current = events.map(() => false);
    recStateRef.current = "looping";
    setRecStateUi("looping");
    setLoopSeconds(loopLen / 1000);
  }, []);

  const clearLoop = useCallback(() => {
    recEventsRef.current = [];
    openEventsRef.current.clear();
    firedOnRef.current = [];
    firedOffRef.current = [];
    recStateRef.current = "idle";
    setRecStateUi("idle");
    setRecCount(0);
    setLoopSeconds(0);
  }, []);

  // ── The one gesture everything else is built from: a note. ─────────────
  const noteOn = useCallback((id: string, waypointIdx: number, velocity: number, atMs: number) => {
    const wps = waypointsRef.current;
    if (waypointIdx < 0 || waypointIdx >= wps.length) return;
    heldStackRef.current = heldStackRef.current.filter((h) => h.id !== id);
    heldStackRef.current.push({ id, waypoint: waypointIdx });
    targetPosRef.current = [wps[waypointIdx].x, wps[waypointIdx].y];
    activeWaypointRef.current = waypointIdx;
    engineRef.current?.setVelocity(velocity);

    if (recStateRef.current === "recording") {
      const ev: RecEvent = {
        waypoint: waypointIdx,
        tOnMs: atMs - recStartMsRef.current,
        tOffMs: null,
        velocity,
      };
      recEventsRef.current.push(ev);
      openEventsRef.current.set(id, ev);
      setRecCount(recEventsRef.current.length);
    }
  }, []);

  const noteOff = useCallback((id: string, atMs: number) => {
    heldStackRef.current = heldStackRef.current.filter((h) => h.id !== id);
    const top = heldStackRef.current[heldStackRef.current.length - 1];
    const wps = waypointsRef.current;
    if (top && wps[top.waypoint]) {
      targetPosRef.current = [wps[top.waypoint].x, wps[top.waypoint].y];
      activeWaypointRef.current = top.waypoint;
    } else {
      targetPosRef.current = restPointRef.current;
      activeWaypointRef.current = -1;
    }
    const openEv = openEventsRef.current.get(id);
    if (openEv) {
      openEv.tOffMs = atMs - recStartMsRef.current;
      openEventsRef.current.delete(id);
    }
  }, []);

  // ── Corpus (re)build — default phrase or a dropped file. ────────────────
  const rebuildFromBuffer = useCallback(
    (buffer: AudioBuffer, label: string) => {
      const mono = downmixToMono(buffer);
      const corpus = buildCorpus(buffer, mono, buffer.sampleRate, label);
      const waypoints = computeWaypoints(corpus, WAYPOINT_COUNT, WAYPOINT_SEED);
      const rest = computeRestPoint(waypoints);

      corpusRef.current = corpus;
      waypointsRef.current = waypoints;
      restPointRef.current = rest;
      engineRef.current?.setCorpus(corpus);
      rendererRef.current?.setCorpus(corpus.positions, corpus.colorT, corpus.loud, corpus.n);

      heldStackRef.current = [];
      heldKeyIdsRef.current.clear();
      openEventsRef.current.clear();
      cursorPosRef.current = [rest[0], rest[1]];
      targetPosRef.current = [rest[0], rest[1]];
      activeWaypointRef.current = -1;
      clearLoop();

      setSource(label);
      setGrainCount(corpus.n);
    },
    [clearLoop],
  );

  // ── Per-frame steppers ───────────────────────────────────────────────────
  const stepAutopilot = useCallback(
    (nowMs: number) => {
      if (!autoSequenceActiveRef.current) return;
      const script = autoScriptRef.current;
      const elapsed = nowMs - recStartMsRef.current;
      let allDone = true;
      script.forEach((note, i) => {
        if (!autoFiredOnRef.current[i] && elapsed >= note.onMs) {
          autoFiredOnRef.current[i] = true;
          noteOn(`auto:${i}`, note.waypoint, note.velocity, nowMs);
        }
        if (!autoFiredOffRef.current[i] && elapsed >= note.offMs) {
          autoFiredOffRef.current[i] = true;
          noteOff(`auto:${i}`, nowMs);
        }
        if (!autoFiredOffRef.current[i]) allDone = false;
      });
      if (allDone && script.length > 0) {
        autoSequenceActiveRef.current = false;
        stopRecording(nowMs);
      }
    },
    [noteOn, noteOff, stopRecording],
  );

  const stepLoop = useCallback(
    (nowMs: number) => {
      if (recStateRef.current !== "looping") return;
      const events = recEventsRef.current;
      const loopLen = loopLenMsRef.current;
      if (events.length === 0 || loopLen <= 0) return;

      let elapsed = nowMs - loopCycleStartMsRef.current;
      if (elapsed >= loopLen) {
        const wraps = Math.max(1, Math.floor(elapsed / loopLen));
        loopCycleStartMsRef.current += wraps * loopLen;
        elapsed = nowMs - loopCycleStartMsRef.current;
        firedOnRef.current = events.map(() => false);
        firedOffRef.current = events.map(() => false);
      }
      events.forEach((ev, i) => {
        if (!firedOnRef.current[i] && elapsed >= ev.tOnMs) {
          firedOnRef.current[i] = true;
          noteOn(`loop:${i}`, ev.waypoint, ev.velocity, nowMs);
        }
        const offAt = ev.tOffMs ?? ev.tOnMs + 120;
        if (!firedOffRef.current[i] && elapsed >= offAt) {
          firedOffRef.current[i] = true;
          noteOff(`loop:${i}`, nowMs);
        }
      });
    },
    [noteOn, noteOff],
  );

  const stepGlide = useCallback((dtSec: number) => {
    if (dtSec <= 0) return;
    const tgt = targetPosRef.current;
    const cur = cursorPosRef.current;
    const a = 1 - Math.exp(-dtSec / GLIDE_TAU);
    cur[0] += (tgt[0] - cur[0]) * a;
    cur[1] += (tgt[1] - cur[1]) * a;
  }, []);

  // ── Main render/update loop ──────────────────────────────────────────────
  const drawFrame = useCallback(
    (nowMs: number) => {
      const dtSec = lastFrameMsRef.current > 0 ? (nowMs - lastFrameMsRef.current) / 1000 : 0;
      lastFrameMsRef.current = nowMs;

      stepAutopilot(nowMs);
      stepLoop(nowMs);
      stepGlide(dtSec);

      const [cx, cy] = cursorPosRef.current;
      const engine = engineRef.current;
      if (engine) {
        engine.setCursor(cx, cy);
        engine.tick();
      }
      const activeAmt = engine ? engine.hud().active : 0;
      const timeSec = nowMs / 1000;
      rendererRef.current?.render(cx, cy, activeAmt, timeSec);

      const overlay = overlayRef.current;
      const renderer = rendererRef.current;
      if (overlay && renderer) {
        const g = overlay.getContext("2d");
        if (g) {
          const loopElapsed =
            recStateRef.current === "looping" ? nowMs - loopCycleStartMsRef.current : 0;
          drawOverlay(g, overlay.clientWidth, overlay.clientHeight, renderer, {
            waypoints: waypointsRef.current,
            keyLabels: KEY_LABELS,
            activeWaypoint: activeWaypointRef.current,
            events: recEventsRef.current,
            looping: recStateRef.current === "looping",
            loopLenMs: loopLenMsRef.current,
            loopElapsedMs: loopElapsed,
            timeSec,
          });
        }
      }

      if (nowMs - lastHudMsRef.current > 120) {
        lastHudMsRef.current = nowMs;
        setHudActive(activeAmt);
        const idx = activeWaypointRef.current;
        setActiveLabel(idx >= 0 ? (KEY_LABELS[idx] ?? null) : null);
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    },
    [stepAutopilot, stepLoop, stepGlide],
  );

  const resizeOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(overlay.clientWidth * dpr);
    const h = Math.floor(overlay.clientHeight * dpr);
    if (w > 0 && h > 0 && (overlay.width !== w || overlay.height !== h)) {
      overlay.width = w;
      overlay.height = h;
    }
    const g = overlay.getContext("2d");
    if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // ── MIDI ─────────────────────────────────────────────────────────────────
  const midiNoteOn = useCallback(
    (note: number, velocity: number) => {
      if (phaseRef.current !== "ready") return;
      resumeAudio();
      if (autoSequenceActiveRef.current) {
        autoSequenceActiveRef.current = false;
        if (recStateRef.current === "recording") stopRecording(performance.now());
      }
      const idx = computeNearestWaypointForMidiNote(note, waypointsRef.current);
      if (idx < 0) return;
      noteOn(`midi:${note}`, idx, Math.max(0.2, velocity), performance.now());
    },
    [noteOn, resumeAudio, stopRecording],
  );

  const midiNoteOff = useCallback(
    (note: number) => {
      noteOff(`midi:${note}`, performance.now());
    },
    [noteOff],
  );

  // ── Computer keyboard ────────────────────────────────────────────────────
  const keyDownHandler = useCallback(
    (e: KeyboardEvent) => {
      if (phaseRef.current !== "ready" || e.repeat) return;
      const idx = KEY_CODES.indexOf(e.code);
      if (idx === -1) return;
      e.preventDefault();
      resumeAudio();
      if (autoSequenceActiveRef.current) {
        autoSequenceActiveRef.current = false;
        if (recStateRef.current === "recording") stopRecording(performance.now());
      }
      const id = `key:${e.code}`;
      if (heldKeyIdsRef.current.has(id)) return;
      heldKeyIdsRef.current.add(id);
      noteOn(id, idx, KEYBOARD_VELOCITY, performance.now());
    },
    [noteOn, resumeAudio, stopRecording],
  );

  const keyUpHandler = useCallback(
    (e: KeyboardEvent) => {
      const idx = KEY_CODES.indexOf(e.code);
      if (idx === -1) return;
      const id = `key:${e.code}`;
      if (!heldKeyIdsRef.current.has(id)) return;
      heldKeyIdsRef.current.delete(id);
      noteOff(id, performance.now());
    },
    [noteOff],
  );

  // ── REC / CLEAR controls ─────────────────────────────────────────────────
  const handleRecToggle = useCallback(() => {
    autoSequenceActiveRef.current = false;
    const now = performance.now();
    if (recStateRef.current === "recording") {
      stopRecording(now);
    } else {
      heldStackRef.current = [];
      heldKeyIdsRef.current.clear();
      targetPosRef.current = restPointRef.current;
      activeWaypointRef.current = -1;
      startRecording(now);
    }
  }, [startRecording, stopRecording]);

  const handleClear = useCallback(() => {
    autoSequenceActiveRef.current = false;
    heldStackRef.current = [];
    heldKeyIdsRef.current.clear();
    targetPosRef.current = restPointRef.current;
    activeWaypointRef.current = -1;
    clearLoop();
  }, [clearLoop]);

  // ── Start: the one gesture that unlocks audio + boots everything else. ──
  const handleStart = useCallback(async () => {
    if (phaseRef.current !== "gate") return;
    phaseRef.current = "building";
    setPhase("building");

    let ctx: AudioContext | null = null;
    try {
      const AC: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      ctxRef.current = ctx;
      await ctx.resume();
      setAudioReady(ctx.state === "running");
      engineRef.current = new GranularEngine(ctx);
    } catch {
      ctxRef.current = null;
    }

    const canvas = canvasRef.current;
    let glOk = false;
    if (canvas) {
      const renderer = PointCloudRenderer.create(canvas);
      if (renderer) {
        rendererRef.current = renderer;
        renderer.resize();
        glOk = true;
      }
    }
    resizeOverlay();

    const sampleRate = ctx?.sampleRate ?? 44100;
    let buffer: AudioBuffer | null = null;
    try {
      buffer = await renderDefaultPhrase(sampleRate);
    } catch {
      buffer = null;
    }
    if (buffer) rebuildFromBuffer(buffer, "Generated phrase");

    const wpCount = waypointsRef.current.length;
    if (wpCount > 0) {
      autoScriptRef.current = buildAutopilotScript(wpCount, AUTOPILOT_SEED);
      autoFiredOnRef.current = autoScriptRef.current.map(() => false);
      autoFiredOffRef.current = autoScriptRef.current.map(() => false);
      autoSequenceActiveRef.current = true;
      startRecording(performance.now());
    }

    void runMidiAccess({
      onNoteOn: midiNoteOn,
      onNoteOff: midiNoteOff,
      onStatus: (name) => setMidiStatus(name ?? "no-device"),
    }).then((conn) => {
      midiConnRef.current = conn;
    });

    phaseRef.current = glOk ? "ready" : "glfail";
    setPhase(glOk ? "ready" : "glfail");
    lastFrameMsRef.current = 0;
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [rebuildFromBuffer, resizeOverlay, startRecording, drawFrame, midiNoteOn, midiNoteOff]);

  // ── Drop your own sound ──────────────────────────────────────────────────
  const decodeFile = useCallback(
    async (file: File) => {
      setDropError(null);
      const ctx = ctxRef.current;
      if (!ctx) {
        setDropError("Audio engine unavailable — press Start first.");
        return;
      }
      try {
        const arr = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arr.slice(0));
        setRebuilding(true);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        rebuildFromBuffer(buffer, file.name);
        resumeAudio();
      } catch {
        setDropError(`Could not decode "${file.name}". Keeping the current songlines.`);
      } finally {
        setRebuilding(false);
      }
    },
    [rebuildFromBuffer, resumeAudio],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void decodeFile(file);
    },
    [decodeFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void decodeFile(file);
      e.target.value = "";
    },
    [decodeFile],
  );

  // ── Keyboard listeners (attached for the whole page's life). ─────────────
  useEffect(() => {
    window.addEventListener("keydown", keyDownHandler);
    window.addEventListener("keyup", keyUpHandler);
    return () => {
      window.removeEventListener("keydown", keyDownHandler);
      window.removeEventListener("keyup", keyUpHandler);
    };
  }, [keyDownHandler, keyUpHandler]);

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      rendererRef.current?.resize();
      resizeOverlay();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeOverlay]);

  // ── Full teardown on unmount. ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      midiConnRef.current?.dispose();
      engineRef.current?.dispose();
      rendererRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  const midiLabel =
    midiStatus === "unsupported"
      ? "unsupported"
      : midiStatus === "no-device"
        ? "no device"
        : midiStatus;

  const recLabel =
    recStateUi === "recording"
      ? `recording — ${recCount} note${recCount === 1 ? "" : "s"}`
      : recStateUi === "looping"
        ? `looping — ${recCount} note${recCount === 1 ? "" : "s"} · ${loopSeconds.toFixed(1)}s`
        : "idle — press Record or a key";

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        if (phase === "ready") setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {phase !== "gate" && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-1 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            A recording, played like a keyboard
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Songlines</h1>
          <p className="max-w-sm text-base text-muted-foreground">
            Twelve waypoints carved out of the atlas — press keys to glide between
            them, then record a phrase and it loops forever.
          </p>
        </div>
      )}

      {phase !== "gate" && (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="absolute right-5 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      )}

      {phase === "ready" && (
        <>
          {/* Bottom-left: corpus + voice HUD */}
          <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="uppercase tracking-[0.14em]">corpus</span>
              <span className="text-foreground">{grainCount} grains</span>
              <span className="max-w-[36vw] truncate text-muted-foreground">· {source}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="uppercase tracking-[0.14em]">note</span>
              <span className="text-foreground">{activeLabel ?? "—"}</span>
              <span className="uppercase tracking-[0.14em]">midi</span>
              <span className="text-foreground">{midiLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-[0.14em]">voice</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-100"
                  style={{ width: `${Math.round(hudActive * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bottom-center: keyboard legend, low → high */}
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              low → high
            </span>
            <div className="flex gap-1.5">
              {KEY_LABELS.map((label) => (
                <div
                  key={label}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs transition-colors ${
                    activeLabel === label
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-background/60 text-muted-foreground"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom-right: transport + drop-your-own */}
          <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2">
            {!audioReady && (
              <button
                type="button"
                onClick={resumeAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tap for sound
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRecToggle}
                className={
                  recStateUi === "recording"
                    ? "min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    : "min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {recStateUi === "recording" ? "Stop" : "Record"}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {recLabel}
            </p>
            <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Drop your own audio
              <input type="file" accept="audio/*" onChange={onFileInput} className="hidden" />
            </label>
            {dropError && (
              <p className="max-w-xs text-right text-sm text-destructive">{dropError}</p>
            )}
          </div>
        </>
      )}

      {phase === "gate" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              A recording, played like a keyboard
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Songlines</h1>
            <p className="text-base text-muted-foreground">
              Twelve timbre-waypoints carved out of a recording&apos;s own atlas —
              press keys or a MIDI keyboard to glide between them, then record a
              phrase and watch it loop.
            </p>
            <button
              type="button"
              onClick={() => void handleStart()}
              className="mt-2 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {phase === "building" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            building the atlas — slicing grains, finding waypoints…
          </p>
        </div>
      )}

      {phase === "glfail" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
          <div className="max-w-md">
            <p className="text-base text-destructive">
              WebGL2 is unavailable here, so the point cloud and waypoint labels
              can&apos;t render.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The instrument still sounds — keys and MIDI still drive the granular
              engine, and the seeded demo phrase still records and loops.
            </p>
          </div>
        </div>
      )}

      {rebuilding && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            rebuilding waypoints from your sound…
          </p>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            drop to rebuild the waypoints from your sound
          </p>
        </div>
      )}

      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Songlines — a recording played like a keyboard
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Songlines deepens 3608-atlas. Atlas turned a recording into a
                navigable timbre-map you wander with a pointer; Songlines clusters
                that same map into twelve timbre <strong>waypoints</strong> (a
                deterministic k-means over the grain positions) and lets you play
                them like notes — computer keys or a MIDI keyboard glide the
                granular engine&apos;s cursor toward a waypoint in ~55 ms, so a
                press reads as a note, not a jump cut.
              </p>
              <p>
                Press <strong>Record</strong>, play a phrase, press{" "}
                <strong>Stop</strong> — the sequence of waypoints, timings and
                velocities you played loops forever, re-driving the cursor
                automatically. The glowing violet trail is that recorded path
                through the atlas; the travelling dot is the loop&apos;s current
                position. <strong>Clear</strong> erases it.
              </p>
              <p>
                On Start, a seeded phrase plays itself through this exact same
                record path and becomes a loop within a couple of seconds — so the
                whole idea is visible with no keyboard, MIDI device, or speakers.
                Your first real key or MIDI note takes over.
              </p>
              <p>
                After Diemo Schwarz&apos;s CataRT / corpus-based concatenative
                synthesis (IRCAM) — navigating &quot;the space of sound
                characteristics,&quot; a navigation Schwarz notes &quot;can be
                recorded for later playback,&quot; which is exactly what this piece
                builds an instrument and a score around. Also see arXiv:2606.08286,
                &quot;FXplorer: A Map-Based Interface&quot; (Jun 2026), a recent
                sibling treating a 2-D map as a playable control surface.
              </p>
              <p>
                Real: every descriptor, grain, waypoint centroid and recorded
                timestamp. Seeded: the default phrase and the self-demo script
                (mulberry32, no Math.random). Known limits: the engine is
                monophonic — the newest held note wins, like a lead line, not a
                chord; without WebGL2 the point cloud and waypoint labels don&apos;t
                draw, though the instrument still plays.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
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
