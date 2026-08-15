"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackChord } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  ModalEngine,
  KIND_ORDER,
  KINDS,
  chordToMidis,
  midisFromPcs,
  midiToFreq,
  midiName,
  pcName,
  type StrikeKind,
} from "./synth";
import { README_TEXT } from "./readme-text";

// ─────────────────────────────────────────────────────────────────────────────
// 13488-striketemple · "Play a duet with Karel."
//
//   His real recording plays. A ring of touchable objects — bells, singing
//   bowls, metal rods — are physically-modeled MODAL resonators that RETUNE in
//   real time to the chord currently sounding in his recording. Tap or drag one
//   and it rings in his key, over his playing: a modal-percussion duet locked to
//   his live harmony.
// ─────────────────────────────────────────────────────────────────────────────

const N_OBJ = 7;
const KEY_LABELS = ["1", "2", "3", "4", "5", "6", "7"];
const AUTOPILOT_IDLE_MS = 9000;
const DEMO_PROGRESSION = ["Am7", "Dm7", "G7", "Cmaj7"];
const DEMO_CHORD_SEC = 2.4;

// ART palette (canvas only — never in className). Violet ramp on near-black.
const BG: [number, number, number] = [11, 7, 19]; // VIOLET[950]
const RAMP: Array<[number, number, number]> = [
  [36, 17, 71], // 800 deep
  [99, 102, 241], // indigo
  [139, 92, 246], // violet 500
  [176, 67, 224], // magenta
  [196, 181, 253], // 300 soft
  [237, 233, 254], // 100 light
];
// per-kind hue nudge within the violet world (bell cool, bowl warm, rod bright).
const KIND_TINT: Record<StrikeKind, number> = { bell: -0.12, bowl: 0.14, rod: 0.0 };

function ramp(t: number): [number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = x * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(f));
  const k = f - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

interface TempleObj {
  angle: number;
  targetMidi: number;
  displayMidi: number;
  energy: number; // strike glow, decays
  retune: number; // reassignment glow, decays
  ripple: number; // 0..1 expanding ring
  // laid out each frame in CSS px for hit-testing:
  x: number;
  y: number;
  r: number;
}

type Phase = "idle" | "loading" | "playing";

// ── analyser fallback: read a rough chord from the live spectrum ──────────────
function pcsFromSpectrum(
  analyser: AnalyserNode,
  buf: Uint8Array,
  sampleRate: number,
): number[] {
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
  const binHz = sampleRate / analyser.fftSize;
  const weights = new Float32Array(12);
  const loBin = Math.max(1, Math.floor(80 / binHz));
  const hiBin = Math.min(buf.length - 1, Math.floor(2000 / binHz));
  let any = 0;
  for (let b = loBin; b <= hiBin; b++) {
    const v = buf[b];
    if (v < 60) continue; // ignore the noise floor
    // local peak only, so we count fundamentals not smear
    if (v < buf[b - 1] || v < buf[b + 1]) continue;
    const freq = b * binHz;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    weights[pc] += v * v;
    any += v * v;
  }
  if (any === 0) return [];
  const ranked = [...weights.keys()]
    .sort((a, b) => weights[b] - weights[a])
    .filter((pc) => weights[pc] > 0)
    .slice(0, 4);
  return ranked;
}

// ── the canvas render ────────────────────────────────────────────────────────
function drawTemple(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  objs: TempleObj[],
  kind: StrikeKind,
  level: number,
  reduced: boolean,
): void {
  g.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.33;
  const baseR = Math.max(16, Math.min(w, h) * 0.052);
  const tint = KIND_TINT[kind];

  // center breath — reacts to Karel's amplitude
  const centerGlow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
  centerGlow.addColorStop(0, `rgba(139,92,246,${0.1 + level * 0.22})`);
  centerGlow.addColorStop(0.5, `rgba(99,102,241,${0.05 + level * 0.1})`);
  centerGlow.addColorStop(1, "rgba(11,7,19,0)");
  g.fillStyle = centerGlow;
  g.beginPath();
  g.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
  g.fill();

  // faint ring guide
  g.strokeStyle = "rgba(196,181,253,0.10)";
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();

  // lay out + draw connective spokes
  for (const o of objs) {
    o.x = cx + Math.cos(o.angle) * R;
    o.y = cy + Math.sin(o.angle) * R;
    o.r = baseR * (1 + o.energy * 0.28);
    const spoke = 0.04 + o.energy * 0.3;
    g.strokeStyle = `rgba(167,139,250,${spoke})`;
    g.lineWidth = 1 + o.energy * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(o.x, o.y);
    g.stroke();
  }

  for (const o of objs) {
    const pitchT = (o.displayMidi - 45) / (84 - 45);
    const [cr, cg, cb] = ramp(pitchT + tint);
    const glow = Math.min(1, o.energy + o.retune * 0.5);

    // expanding ripple on strike
    if (o.ripple > 0.001 && !reduced) {
      const rr = o.r * (1 + o.ripple * 2.6);
      g.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(1 - o.ripple) * 0.5})`;
      g.lineWidth = 2 * (1 - o.ripple);
      g.beginPath();
      g.arc(o.x, o.y, rr, 0, Math.PI * 2);
      g.stroke();
    }

    // soft glow halo
    const halo = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.6);
    halo.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${0.28 + glow * 0.55})`);
    halo.addColorStop(1, "rgba(11,7,19,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(o.x, o.y, o.r * 2.6, 0, Math.PI * 2);
    g.fill();

    // retune ring — glows when the object has just been re-tuned to a new tone
    if (o.retune > 0.001) {
      g.strokeStyle = `rgba(237,233,254,${o.retune * 0.7})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(o.x, o.y, o.r * 1.5, 0, Math.PI * 2);
      g.stroke();
    }

    // body — shape depends on the current material
    const lit = 0.55 + glow * 0.45;
    const body = `rgba(${(cr * lit) | 0},${(cg * lit) | 0},${(cb * lit) | 0},0.95)`;
    g.fillStyle = body;
    g.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},0.95)`;
    g.lineWidth = 2;

    if (kind === "rod") {
      const rw = o.r * 0.7;
      const rh = o.r * 2.1;
      roundRect(g, o.x - rw / 2, o.y - rh / 2, rw, rh, rw / 2);
      g.fill();
      g.stroke();
    } else {
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (kind === "bowl") {
        // open rim highlight (a cup seen slightly from above)
        g.strokeStyle = `rgba(237,233,254,${0.35 + glow * 0.4})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(o.x, o.y - o.r * 0.42, o.r * 0.82, o.r * 0.3, 0, 0, Math.PI * 2);
        g.stroke();
      } else {
        // bell clapper dot
        g.fillStyle = `rgba(237,233,254,${0.4 + glow * 0.5})`;
        g.beginPath();
        g.arc(o.x, o.y + o.r * 0.18, o.r * 0.16, 0, Math.PI * 2);
        g.fill();
      }
    }

    // pitch label
    const outward = o.r + 16;
    const lx = o.x + Math.cos(o.angle) * outward;
    const ly = o.y + Math.sin(o.angle) * outward;
    g.fillStyle = `rgba(221,214,254,${0.55 + glow * 0.4})`;
    g.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(midiName(o.displayMidi), lx, ly);
  }
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export default function StrikeTemplePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [material, setMaterial] = useState<StrikeKind>("bell");
  const [currentChord, setCurrentChord] = useState<string>("Am7");
  const [autopilot, setAutopilot] = useState(false);
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<ModalEngine | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const specBufRef = useRef<Uint8Array | null>(null);

  // musical state
  const objsRef = useRef<TempleObj[]>([]);
  const chordsRef = useRef<TrackChord[]>([]);
  const chordCursorRef = useRef(0);
  const currentSymbolRef = useRef("Am7");

  // clocks / loop
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const materialRef = useRef<StrikeKind>("bell");
  const reducedRef = useRef(false);
  const levelRef = useRef(0);
  const demoClockRef = useRef(0);
  const fallbackTimerRef = useRef(0);

  // interaction / autopilot
  const lastInteractRef = useRef(0);
  const autopilotRef = useRef(false);
  const autoTimerRef = useRef(0);
  const pointersRef = useRef<Map<number, { x: number; y: number; t: number; obj: number }>>(
    new Map(),
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // build the ring once
  if (objsRef.current.length === 0) {
    const midis = chordToMidis("Am7", N_OBJ);
    objsRef.current = Array.from({ length: N_OBJ }, (_, i) => ({
      angle: -Math.PI / 2 + (i / N_OBJ) * Math.PI * 2,
      targetMidi: midis[i],
      displayMidi: midis[i],
      energy: 0,
      retune: 0,
      ripple: 0,
      x: 0,
      y: 0,
      r: 0,
    }));
  }

  // ── strike plumbing ─────────────────────────────────────────────────────────
  const strikeObj = useCallback((idx: number, velocity: number) => {
    const objs = objsRef.current;
    if (idx < 0 || idx >= objs.length) return;
    const o = objs[idx];
    const eng = engineRef.current;
    if (eng) eng.strike(midiToFreq(o.targetMidi), materialRef.current, velocity);
    o.energy = Math.min(1, o.energy + 0.35 + velocity * 0.6);
    o.ripple = 0.0001;
  }, []);

  // find the object under a CSS-space point, or -1
  const hitTest = useCallback((px: number, py: number): number => {
    const objs = objsRef.current;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const d = Math.hypot(px - o.x, py - o.y);
      if (d < o.r * 1.7 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }, []);

  // re-voice the ring to a new chord (symbol path or explicit pcs)
  const revoice = useCallback((label: string, pcs: number[] | null) => {
    if (label === currentSymbolRef.current) return;
    currentSymbolRef.current = label;
    const midis = pcs ? midisFromPcs(pcs, N_OBJ) : chordToMidis(label, N_OBJ);
    const objs = objsRef.current;
    for (let i = 0; i < objs.length; i++) {
      if (objs[i].targetMidi !== midis[i]) objs[i].retune = 1;
      objs[i].targetMidi = midis[i];
    }
    setCurrentChord(label);
  }, []);

  // ── main loop ───────────────────────────────────────────────────────────────
  const frame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const g = canvas.getContext("2d");
      if (!g) return;

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt <= 0 || dt > 0.05) dt = 0.016;

      // ── decide the current chord ────────────────────────────────────────────
      const playing = phaseRef.current === "playing" && ctxRef.current;
      const chords = chordsRef.current;
      if (playing && chords.length > 0) {
        const t = ctxRef.current!.currentTime - startedAtRef.current;
        let c = chordCursorRef.current;
        if (c >= chords.length || chords[c].time > t) c = 0; // clock wrapped
        while (c + 1 < chords.length && chords[c + 1].time <= t) c++;
        chordCursorRef.current = c;
        revoice(chords[c].chord || "Am7", null);
      } else if (playing && masterRef.current && specBufRef.current) {
        // no published chord track → follow the live spectrum, refreshed slowly
        fallbackTimerRef.current += dt;
        if (fallbackTimerRef.current >= 0.5) {
          fallbackTimerRef.current = 0;
          const pcs = pcsFromSpectrum(
            masterRef.current.analyser,
            specBufRef.current,
            ctxRef.current!.sampleRate,
          );
          if (pcs.length > 0) {
            const label = "≈ " + pcs.map(pcName).join(" ");
            revoice(label, pcs);
          }
        }
      } else {
        // not playing → a gentle demo progression so the temple has a key
        demoClockRef.current += dt;
        const idx =
          Math.floor(demoClockRef.current / DEMO_CHORD_SEC) % DEMO_PROGRESSION.length;
        revoice(DEMO_PROGRESSION[idx], null);
      }

      // ── audio level for the visuals ─────────────────────────────────────────
      let level = 0;
      if (masterRef.current && specBufRef.current) {
        const buf = specBufRef.current;
        masterRef.current.analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        level = sum / (buf.length * 255);
      }
      levelRef.current += (level - levelRef.current) * Math.min(1, dt * 8);

      // ── autopilot after idle ────────────────────────────────────────────────
      const now = performance.now();
      if (now - lastInteractRef.current > AUTOPILOT_IDLE_MS) {
        if (!autopilotRef.current) {
          autopilotRef.current = true;
          setAutopilot(true);
        }
        autoTimerRef.current += dt;
        if (autoTimerRef.current >= 0.85) {
          autoTimerRef.current = 0;
          const i = Math.floor(Math.random() * N_OBJ);
          strikeObj(i, 0.3 + Math.random() * 0.4);
          if (Math.random() > 0.6) {
            const j = (i + 2 + Math.floor(Math.random() * 3)) % N_OBJ;
            strikeObj(j, 0.25 + Math.random() * 0.3);
          }
        }
      } else if (autopilotRef.current) {
        autopilotRef.current = false;
        setAutopilot(false);
      }

      // ── integrate object state ──────────────────────────────────────────────
      for (const o of objsRef.current) {
        o.displayMidi += (o.targetMidi - o.displayMidi) * Math.min(1, dt * 4.5);
        o.energy *= Math.pow(0.16, dt);
        o.retune *= Math.pow(0.1, dt);
        if (o.ripple > 0) {
          o.ripple += dt * 1.4;
          if (o.ripple >= 1) o.ripple = 0;
        }
      }

      // ── draw ────────────────────────────────────────────────────────────────
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const W = Math.max(1, Math.floor(cssW * dpr));
      const H = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTemple(
        g,
        cssW,
        cssH,
        objsRef.current,
        materialRef.current,
        levelRef.current,
        reducedRef.current,
      );
    },
    [revoice, strikeObj],
  );

  // boot the render loop + reduced-motion probe
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reducedRef.current = mq.matches;
      const onChange = () => {
        reducedRef.current = mq.matches;
      };
      mq.addEventListener?.("change", onChange);
      lastInteractRef.current = performance.now();
      rafRef.current = requestAnimationFrame(frame);
      return () => {
        mq.removeEventListener?.("change", onChange);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }
    lastInteractRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frame]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      engineRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  // ── pointer play ────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      lastInteractRef.current = performance.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const idx = hitTest(px, py);
      pointersRef.current.set(e.pointerId, {
        x: px,
        y: py,
        t: performance.now(),
        obj: idx,
      });
      if (idx >= 0) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        strikeObj(idx, 0.7);
      }
    },
    [hitTest, strikeObj],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return; // only track drags that began with a press
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const now = performance.now();
      const dtp = Math.max(1, now - p.t);
      const speed = Math.hypot(px - p.x, py - p.y) / dtp; // px per ms
      p.x = px;
      p.y = py;
      p.t = now;
      lastInteractRef.current = now;
      const idx = hitTest(px, py);
      if (idx >= 0 && idx !== p.obj) {
        p.obj = idx;
        const vel = Math.min(1, 0.28 + speed * 0.9);
        strikeObj(idx, vel);
      } else if (idx < 0) {
        p.obj = -1;
      }
    },
    [hitTest, strikeObj],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
  }, []);

  // keyboard play: number keys 1..7
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = KEY_LABELS.indexOf(e.key);
      if (idx === -1) return;
      e.preventDefault();
      lastInteractRef.current = performance.now();
      if (!e.repeat) strikeObj(idx, 0.72);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strikeObj]);

  // ── transport ───────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    setPhase("idle");
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setPhase("loading");
    lastInteractRef.current = performance.now();
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
        specBufRef.current = new Uint8Array(master.analyser.frequencyBinCount);
      }
      if (!engineRef.current) engineRef.current = new ModalEngine(ctx, master.input);

      // fetch analysis (chords) + audio in parallel
      const [analysis, wh] = await Promise.all([
        loadTrackAnalysis(track.id).catch(() => null),
        loadRealTrackBuffer(ctx, track.id),
      ]);

      if (analysis && analysis.chords.length > 0) {
        chordsRef.current = analysis.chords;
        setAnalysisMissing(false);
      } else {
        chordsRef.current = [];
        setAnalysisMissing(true);
      }
      chordCursorRef.current = 0;
      currentSymbolRef.current = "__reset__"; // force a revoice on first frame

      try {
        sourceRef.current?.stop();
      } catch {
        /* none */
      }
      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.connect(master.input);
      src.onended = () => {
        if (sourceRef.current === src) stopAudio();
      };
      startedAtRef.current = ctx.currentTime;
      src.start();
      sourceRef.current = src;
      setPhase("playing");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Audio could not load (${err.message}). You can still strike the temple — it rings in a default key.`
          : "Audio could not load. You can still strike the temple.",
      );
      chordsRef.current = [];
      setPhase("idle");
    }
  }, [track, stopAudio]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stopAudio();
      chordsRef.current = [];
    },
    [stopAudio],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* chrome */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6 pt-14">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            13488 · striketemple · modal resonators
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            A duet with Karel
          </h1>
          <p className="text-base text-muted-foreground">
            His recording plays. Strike the bells and bowls — each is a modeled
            modal resonator that retunes, live, to the chord he&apos;s playing
            right now. Tap or drag the ring (drag faster to hit harder), or use
            the number keys.
          </p>
        </header>
      </div>

      {/* current chord read-out */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          now sounding
        </p>
        <p className="text-xl font-semibold tracking-tight text-primary">
          {currentChord}
        </p>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {analysisMissing && !error && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            No published chord track for this piece — the ring is following the
            live spectrum of his recording instead.
          </p>
        )}
        <p className="text-sm text-primary">{KINDS[material].blurb}</p>
        <p className="text-sm text-muted-foreground">
          {autopilot
            ? "temple playing itself within his chord — tap the ring to take over"
            : "tap or drag the ring · keys 1–7 · retune follows his live harmony"}
        </p>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={track.id}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {phase !== "playing" ? (
            <button
              onClick={() => void play()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading…" : "Play his recording"}
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              material
            </span>
            <div className="flex gap-2">
              {KIND_ORDER.map((id) => {
                const active = id === material;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      lastInteractRef.current = performance.now();
                      setMaterial(id);
                    }}
                    className={
                      active
                        ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    }
                  >
                    {KINDS[id].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README_TEXT.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
