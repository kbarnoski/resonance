"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10472 · Inkscore — drop a piece of recorded music and watch it auto-compose
// itself into a living GRAPHIC SCORE in the Cage / Feldman / Xenakis notation
// tradition, then re-perform it by scrubbing the drawn marks.
//
//   ONE QUESTION
//   What if recorded sound could write its own hand-drawn graphic score —
//   Feldman grid-boxes, Xenakis glissando sheaves, Cage scatter-clusters,
//   Cardew-Treatise contour lines — that you could then re-sound by dragging
//   a playhead across the ink?
//
//   INPUT   an audio file (drag-drop OR file picker). No file → press Start and
//           a SEEDED inharmonic/modal phrase synthesises itself, and the score
//           draws from THAT.
//   OUTPUT  SVG-DOM — the score is built from real <path>/<line>/<rect>/<circle>
//           elements (never canvas, never WebGL), scrolling left-to-right on
//           ink-on-parchment.
//   VERB    analyse (spectral-flux onset + spectral centroid + loudness) →
//           classify → lay out abstracted notation → sweep a playhead →
//           re-sound the marks the playhead crosses when you scrub.
//
//   Named reference — Playmodes, *FORMS* (Santi Vilanova / Eloi Maduell, 2026),
//   a generative graphic-scoring bot that turns notation INTO sound. Inkscore is
//   its inverse: sound → notation. Lineage: John Cage, Morton Feldman, Iannis
//   Xenakis, Cornelius Cardew (*Treatise*), Vera Molnár.
//
//   Degrade ladder: dropped file → decoded & analysed live; decode fails →
//   text-destructive notice + the seeded phrase; no file at all → the seeded
//   phrase on Start. MUTED PHONE: the audio graph still runs, so the score
//   still draws, scrolls and reads as an evolving notation image with sound off
//   — that legibility is the whole point. Seed 0x10472; time from ctx clock /
//   performance.now(); no Math.random / Date.now / new Date anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── seeded PRNG (no Math.random anywhere) ────────────────────────────────────
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x10472);

// ── art palette: archival ink on warm-neutral parchment ──────────────────────
const PAPER_A = "#e9e2d1"; // parchment ground
const PAPER_B = "#e2dac6"; // faint tint band
const INK = "#1c1810"; // graphite ink, primary marks
const INK_SOFT = "#4a4234"; // lighter graphite, secondary marks
const STAFF = "#c7bda2"; // faint ruled staff / grid
const PLAY = "#7a2f1c"; // dried-sienna playhead (a single restrained accent)

// ── score geometry ───────────────────────────────────────────────────────────
const SVG_W = 1120;
const SVG_H = 460;
const PAD_TOP = 44;
const STAFF_H = 372;
const PX_PER_SEC = 92;
const HEAD_LIVE = 0.82 * SVG_W; // writing head x while playing
const HEAD_DONE = 0.5 * SVG_W; // fixed playhead x while scrubbing
const HZ_MIN = 90;
const HZ_MAX = 5200;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function yFromHz(hz: number): number {
  const lo = Math.log(HZ_MIN);
  const hi = Math.log(HZ_MAX);
  const n = (Math.log(clamp(hz, HZ_MIN, HZ_MAX)) - lo) / (hi - lo);
  return PAD_TOP + (1 - n) * STAFF_H; // higher pitch → higher on the staff
}

type Kind = "box" | "sheaf" | "cluster" | "stroke" | "dot";

interface Mark {
  id: number;
  t: number; // onset time, seconds since analysis start
  x: number; // worldX = t * PX_PER_SEC
  y: number; // register
  size: number; // 0..1 loudness → boldness
  pitchHz: number;
  kind: Kind;
  len: number; // world px length for box / stroke / sheaf
  glissDy: number; // sheaf vertical fan
  seed: number; // per-mark deterministic scatter seed
}

// inharmonic partial ratios shared by the fallback voice + scrub grains
const PARTIALS = [1, 2.0, 3.01, 4.03, 5.06];
const PARTIAL_GAINS = [1, 0.5, 0.3, 0.18, 0.1];

// ── the seeded fallback phrase: inharmonic / modal, NOT just-intonation ───────
// A stretched phrygian mode (octave stretched to ~1.04) over an inharmonic
// piano-ish voice. Deliberately avoids plain consonant major-triad material.
function fallbackNotes(): { at: number; hz: number; dur: number; vel: number }[] {
  const base = 146.83; // ~D3
  const stretch = 1.041;
  const degrees = [0, 1, 3, 5, 6, 8, 10, 12]; // phrygian-ish, one stretched octave
  const notes: { at: number; hz: number; dur: number; vel: number }[] = [];
  let at = 0.25;
  let deg = 3;
  for (let i = 0; i < 15; i++) {
    // seeded modal walk
    const step = Math.floor(rng() * 5) - 2; // -2..+2
    deg = clamp(deg + step, 0, degrees.length * 2 - 1);
    const octa = deg >= degrees.length ? 1 : 0;
    const d = degrees[deg % degrees.length];
    const semis = d + octa * 12;
    const hz = base * Math.pow(2, (semis * stretch) / 12);
    const dur = 0.42 + rng() * 0.95;
    const vel = 0.4 + rng() * 0.55;
    notes.push({ at, hz, dur, vel });
    at += 0.34 + rng() * 0.62; // seeded, overlapping rhythm
  }
  return notes;
}

export default function InkscorePage() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<string>("—");
  const [showNotes, setShowNotes] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scrubActive, setScrubActive] = useState(false);

  // ── loop / audio owned refs (never read React state inside rAF) ────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const rafRef = useRef(0);
  const startClockRef = useRef(0); // ctx.currentTime at analysis start
  const totalDurRef = useRef(12);
  const liveSourcesRef = useRef<AudioNode[]>([]);
  const grainsRef = useRef<Set<AudioNode>>(new Set());

  // analysis state
  const analyserRef = useRef<AnalyserNode | null>(null);
  const specRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const prevSpecRef = useRef<Float32Array | null>(null);
  const fluxHistRef = useRef<number[]>([]);
  const centHistRef = useRef<number[]>([]);
  const lastOnsetRef = useRef(-1);
  const loudMaxRef = useRef(0.001);
  const smoothCentRef = useRef(600);

  // marks (ref mirrors state so the loop can read without re-renders)
  const marksRef = useRef<Mark[]>([]);
  const idRef = useRef(0);

  // svg / camera
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const contourRef = useRef<SVGPolylineElement | null>(null);
  const playheadRef = useRef<SVGGElement | null>(null);
  const contourPtsRef = useRef<string[]>([]);

  // scrub state
  const scrubTimeRef = useRef(0);
  const dragRef = useRef<{ startX: number; startT: number } | null>(null);
  const modeRef = useRef<"idle" | "running" | "done">("idle");

  // ── camera / playhead placement ────────────────────────────────────────────
  const applyCamera = useCallback((cameraX: number, headX: number) => {
    if (groupRef.current)
      groupRef.current.setAttribute("transform", `translate(${-cameraX},0)`);
    if (playheadRef.current)
      playheadRef.current.setAttribute("transform", `translate(${headX},0)`);
  }, []);

  // ── additive/granular re-sound of a single mark (for scrub) ─────────────────
  const soundMark = useCallback((m: Mark) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const dur = clamp(0.12 + m.size * 0.55, 0.1, 0.7);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.14 + m.size * 0.5, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    env.connect(master.input);
    grainsRef.current.add(env);

    const nP = m.kind === "cluster" ? 2 : PARTIALS.length;
    for (let k = 0; k < nP; k++) {
      const o = ctx.createOscillator();
      o.type = k === 0 ? "triangle" : "sine";
      // slight inharmonic stretch on upper partials
      const ratio = PARTIALS[k] * (1 + 0.0009 * k * k);
      o.frequency.value = clamp(m.pitchHz * ratio, 30, 8000);
      const g = ctx.createGain();
      g.gain.value = PARTIAL_GAINS[k];
      o.connect(g).connect(env);
      o.start(now);
      o.stop(now + dur + 0.03);
      o.onended = () => {
        try {
          o.disconnect();
          g.disconnect();
          if (k === 0) {
            env.disconnect();
            grainsRef.current.delete(env);
          }
        } catch {
          /* closing */
        }
      };
    }
    // percussive/cluster hits get a short noise chiff
    if (m.kind === "cluster") {
      const len = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const nr = mulberry32(0x10472 ^ (m.id * 2654435761));
      for (let i = 0; i < len; i++)
        data[i] = (nr() * 2 - 1) * (1 - i / len);
      const n = ctx.createBufferSource();
      n.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = clamp(m.pitchHz * 2, 200, 5000);
      bp.Q.value = 0.7;
      n.connect(bp).connect(env);
      n.start(now);
    }
  }, []);

  // ── classify + emit one mark from current features ──────────────────────────
  const emitMark = useCallback(
    (t: number, loud: number, centHz: number, flat: number, slope: number, peakHz: number) => {
      const size = clamp(loud, 0, 1);
      let kind: Kind;
      const aSlope = Math.abs(slope);
      if (flat > 0.42 && loud < 0.72) kind = "cluster"; // noisy/percussive → Cage scatter
      else if (aSlope > 0.16) kind = "sheaf"; // pitch moving → Xenakis gliss sheaf
      else if (loud > 0.62) kind = "stroke"; // strong & steady → sustained tone
      else if (loud > 0.3) kind = "box"; // Feldman grid box
      else kind = "dot"; // Cage/Feldman point
      const y = yFromHz(centHz);
      const len =
        kind === "stroke"
          ? (0.5 + size * 1.7) * PX_PER_SEC
          : kind === "box"
            ? (0.28 + size * 0.7) * PX_PER_SEC
            : kind === "sheaf"
              ? (0.4 + size) * PX_PER_SEC
              : 0;
      const m: Mark = {
        id: idRef.current++,
        t,
        x: t * PX_PER_SEC,
        y,
        size,
        pitchHz: peakHz,
        kind,
        len,
        glissDy: -slope * STAFF_H * 0.9,
        seed: rng(),
      };
      marksRef.current.push(m);
      if (marksRef.current.length > 520) marksRef.current.shift();
      setMarks(marksRef.current.slice());
    },
    [],
  );

  // ── the analysis + drawing frame ─────────────────────────────────────────────
  const frame = useCallback(() => {
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    const spec = specRef.current;
    if (!ctx || !analyser || !spec) return;
    const now = ctx.currentTime - startClockRef.current;

    analyser.getByteFrequencyData(spec);
    const N = spec.length;
    const binHz = ctx.sampleRate / (analyser.fftSize || 1024);

    // features: loudness, centroid, flatness, peak, spectral flux
    let sum = 0;
    let wsum = 0;
    let logsum = 0;
    let flux = 0;
    let peakMag = 0;
    let peakBin = 1;
    const prev = prevSpecRef.current;
    for (let i = 1; i < N; i++) {
      const v = spec[i];
      sum += v;
      wsum += v * i;
      logsum += Math.log(v + 1);
      if (v > peakMag) {
        peakMag = v;
        peakBin = i;
      }
      if (prev) {
        const d = v - prev[i];
        if (d > 0) flux += d;
      }
      if (prev) prev[i] = v;
    }
    const loudRaw = sum / (N * 255);
    loudMaxRef.current = Math.max(loudMaxRef.current * 0.9995, loudRaw, 0.001);
    const loud = clamp(loudRaw / loudMaxRef.current, 0, 1);
    const centHz = sum > 1 ? (wsum / sum) * binHz : 600;
    const flatness = sum > 1 ? Math.exp(logsum / N) / (sum / N + 1) : 0;
    const peakHz = peakBin * binHz;

    // smoothed centroid + slope (rising/falling pitch → sheaf)
    const cprev = smoothCentRef.current;
    smoothCentRef.current = cprev * 0.8 + centHz * 0.2;
    const ch = centHistRef.current;
    ch.push(Math.log(clamp(smoothCentRef.current, HZ_MIN, HZ_MAX)));
    if (ch.length > 8) ch.shift();
    const slopeNorm =
      ch.length >= 6
        ? (ch[ch.length - 1] - ch[0]) / (Math.log(HZ_MAX) - Math.log(HZ_MIN))
        : 0;

    // adaptive spectral-flux onset threshold (running mean + k·std)
    const fh = fluxHistRef.current;
    fh.push(flux);
    if (fh.length > 43) fh.shift();
    let mean = 0;
    for (const f of fh) mean += f;
    mean /= fh.length || 1;
    let vr = 0;
    for (const f of fh) vr += (f - mean) * (f - mean);
    const std = Math.sqrt(vr / (fh.length || 1));
    const thresh = mean + 1.6 * std + 30;
    const refractory = now - lastOnsetRef.current > 0.09;
    if (prev && flux > thresh && refractory && loud > 0.12) {
      lastOnsetRef.current = now;
      emitMark(now, loud, centHz, flatness, slopeNorm, peakHz);
    }

    // continuous Cardew-Treatise contour: the centroid trajectory
    const cx = now * PX_PER_SEC;
    const cy = yFromHz(smoothCentRef.current);
    const pts = contourPtsRef.current;
    pts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
    if (pts.length > 1400) pts.shift();
    if (contourRef.current)
      contourRef.current.setAttribute("points", pts.join(" "));

    // camera follows the writing head
    applyCamera(now * PX_PER_SEC - HEAD_LIVE, HEAD_LIVE);

    // end of playback?
    if (now >= totalDurRef.current + 0.4) {
      finishRef.current();
      return;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [applyCamera, emitMark]);

  // ── finish → enter scrub (done) mode ─────────────────────────────────────────
  const finishRef = useRef<() => void>(() => {});
  finishRef.current = () => {
    cancelAnimationFrame(rafRef.current);
    // stop any live sources
    for (const s of liveSourcesRef.current) {
      try {
        (s as OscillatorNode | AudioBufferSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* closing */
      }
    }
    liveSourcesRef.current = [];
    modeRef.current = "done";
    setPhase("done");
    scrubTimeRef.current = clamp(totalDurRef.current * 0.02, 0, totalDurRef.current);
    applyCamera(scrubTimeRef.current * PX_PER_SEC - HEAD_DONE, HEAD_DONE);
  };

  // ── build/resume the audio context + master ──────────────────────────────────
  const ensureCtx = useCallback(async () => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const master = createSafeMaster(ctx, { gain: 0.2 });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      // tap the tamed master for analysis
      master.analyser.connect(analyser);
      ctxRef.current = ctx;
      masterRef.current = master;
      analyserRef.current = analyser;
      specRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      prevSpecRef.current = new Float32Array(analyser.frequencyBinCount);
    }
    if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // reset per-run analysis state
  const resetAnalysis = useCallback(() => {
    marksRef.current = [];
    setMarks([]);
    idRef.current = 0;
    fluxHistRef.current = [];
    centHistRef.current = [];
    contourPtsRef.current = [];
    lastOnsetRef.current = -1;
    loudMaxRef.current = 0.001;
    smoothCentRef.current = 600;
    if (prevSpecRef.current) prevSpecRef.current.fill(0);
    if (contourRef.current) contourRef.current.setAttribute("points", "");
    setNotice(null);
  }, []);

  // ── schedule the seeded fallback voice through the master ────────────────────
  const startFallback = useCallback(async () => {
    const ctx = await ensureCtx();
    const master = masterRef.current!;
    resetAnalysis();
    const notes = fallbackNotes();
    const t0 = ctx.currentTime + 0.12;
    let end = 0;
    for (const nt of notes) {
      const on = t0 + nt.at;
      end = Math.max(end, nt.at + nt.dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, on);
      env.gain.exponentialRampToValueAtTime(0.16 * nt.vel + 0.02, on + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0006, on + nt.dur);
      env.connect(master.input);
      liveSourcesRef.current.push(env);
      for (let k = 0; k < PARTIALS.length; k++) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? "triangle" : "sine";
        const ratio = PARTIALS[k] * (1 + 0.0011 * k * k);
        o.frequency.value = clamp(nt.hz * ratio, 30, 8000);
        const g = ctx.createGain();
        g.gain.value = PARTIAL_GAINS[k];
        o.connect(g).connect(env);
        o.start(on);
        o.stop(on + nt.dur + 0.03);
        liveSourcesRef.current.push(o);
      }
      // a short hammer/key chiff → crisp onset for the flux detector
      const len = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const nr = mulberry32(0x10472 ^ Math.floor(nt.hz * 7 + nt.at * 131));
      for (let i = 0; i < len; i++) data[i] = (nr() * 2 - 1) * (1 - i / len);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = clamp(nt.hz * 3, 400, 6000);
      const ng = ctx.createGain();
      ng.gain.value = 0.05 * nt.vel;
      noise.connect(hp).connect(ng).connect(master.input);
      noise.start(on);
      liveSourcesRef.current.push(noise);
    }
    totalDurRef.current = end + 0.4;
    startClockRef.current = t0;
    modeRef.current = "running";
    setSource("seeded phrase");
    setPhase("running");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }, [ensureCtx, resetAnalysis, frame]);

  // ── play + analyse a decoded audio buffer through the master ─────────────────
  const startBuffer = useCallback(
    async (buffer: AudioBuffer, name: string) => {
      const ctx = await ensureCtx();
      const master = masterRef.current!;
      resetAnalysis();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(master.input);
      const t0 = ctx.currentTime + 0.08;
      src.start(t0);
      liveSourcesRef.current.push(src);
      totalDurRef.current = buffer.duration;
      startClockRef.current = t0;
      modeRef.current = "running";
      setSource(name);
      setPhase("running");
      src.onended = () => {
        if (modeRef.current === "running") finishRef.current();
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(frame);
    },
    [ensureCtx, resetAnalysis, frame],
  );

  // ── decode a dropped/picked file ─────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      try {
        const ctx = await ensureCtx();
        const buf = await file.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        await startBuffer(audio, file.name);
      } catch {
        setNotice(
          "Could not decode that file — playing the seeded phrase instead.",
        );
        await startFallback();
      }
    },
    [ensureCtx, startBuffer, startFallback],
  );

  // ── scrub interaction (done mode): drag the paper under the playhead ─────────
  const svgX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const r = svg.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * SVG_W;
  };

  const onScrubDown = useCallback(
    (e: React.PointerEvent) => {
      if (modeRef.current !== "done") return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { startX: svgX(e.clientX), startT: scrubTimeRef.current };
      setScrubActive(true);
    },
    [],
  );

  const onScrubMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || modeRef.current !== "done") return;
      const dx = svgX(e.clientX) - d.startX;
      const nt = clamp(d.startT - dx / PX_PER_SEC, 0, totalDurRef.current);
      const prev = scrubTimeRef.current;
      // re-sound every mark the playhead crosses this move (throttled)
      const lo = Math.min(prev, nt);
      const hi = Math.max(prev, nt);
      let fired = 0;
      for (const m of marksRef.current) {
        if (m.t > lo && m.t <= hi && fired < 6) {
          soundMark(m);
          fired++;
        }
      }
      scrubTimeRef.current = nt;
      applyCamera(nt * PX_PER_SEC - HEAD_DONE, HEAD_DONE);
    },
    [applyCamera, soundMark],
  );

  const onScrubUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setScrubActive(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  // ── file input + drop wiring ─────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const grains = grainsRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const s of liveSourcesRef.current) {
        try {
          (s as OscillatorNode).stop?.();
        } catch {
          /* */
        }
        try {
          s.disconnect();
        } catch {
          /* */
        }
      }
      liveSourcesRef.current = [];
      for (const g of grains) {
        try {
          g.disconnect();
        } catch {
          /* */
        }
      }
      grains.clear();
      try {
        masterRef.current?.disconnect();
      } catch {
        /* */
      }
      const c = ctxRef.current;
      if (c && c.state !== "closed") c.close().catch(() => {});
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <PrototypeNav slugs={["10472-inkscore"]} />

      <div className="mx-auto max-w-6xl">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              10472 · Inkscore
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Recorded sound, writing its own graphic score
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Drop a piece of music (or just press Start). Inkscore listens with
              spectral-flux onset detection, centroid pitch and loudness, then
              auto-composes an abstracted, hand-drawn-feeling graphic score — then
              scrub the ink to re-perform it.
            </p>
          </div>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {/* controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => startFallback()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {phase === "idle" ? "Start (seeded phrase)" : "Restart seeded phrase"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Choose an audio file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {phase === "idle"
              ? "idle"
              : phase === "running"
                ? `analysing · ${source}`
                : `scrub the ink · ${source}`}
          </span>
        </div>

        {notice && (
          <p className="mt-3 text-sm text-destructive">{notice}</p>
        )}

        {/* the score + drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-5 overflow-hidden rounded-lg border transition-colors ${
            dragOver ? "border-primary" : "border-border"
          }`}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            className={`block w-full ${
              phase === "done" ? "cursor-ew-resize" : "cursor-default"
            } ${scrubActive ? "select-none" : ""}`}
            style={{ touchAction: "none" }}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubUp}
          >
            <defs>
              <linearGradient id="ink-paper" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={PAPER_A} />
                <stop offset="1" stopColor={PAPER_B} />
              </linearGradient>
            </defs>

            {/* parchment ground */}
            <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#ink-paper)" />

            {/* fixed faint staff (5 ruled lines) */}
            {[0, 1, 2, 3, 4].map((i) => {
              const y = PAD_TOP + 40 + (i * STAFF_H) / 6;
              return (
                <line
                  key={`staff-${i}`}
                  x1="0"
                  x2={SVG_W}
                  y1={y}
                  y2={y}
                  stroke={STAFF}
                  strokeWidth="1"
                  opacity="0.55"
                />
              );
            })}

            {/* scrolling score group (marks + time grid + contour live inside) */}
            <g ref={groupRef}>
              {/* faint per-second time grid (Feldman) */}
              {marks.length > 0 &&
                Array.from({ length: Math.ceil(totalDurRef.current) + 2 }).map(
                  (_, s) => (
                    <line
                      key={`grid-${s}`}
                      x1={s * PX_PER_SEC}
                      x2={s * PX_PER_SEC}
                      y1={PAD_TOP}
                      y2={PAD_TOP + STAFF_H}
                      stroke={STAFF}
                      strokeWidth="0.75"
                      opacity="0.3"
                    />
                  ),
                )}

              {/* Cardew-Treatise centroid contour */}
              <polyline
                ref={contourRef}
                fill="none"
                stroke={INK_SOFT}
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.5"
                points=""
              />

              {/* the notation marks */}
              {marks.map((m) => (
                <MarkGlyph key={m.id} m={m} />
              ))}
            </g>

            {/* playhead (screen-fixed; camera moves the paper) */}
            <g
              ref={playheadRef}
              transform={`translate(${phase === "done" ? HEAD_DONE : HEAD_LIVE},0)`}
            >
              <line
                x1="0"
                x2="0"
                y1={PAD_TOP - 8}
                y2={PAD_TOP + STAFF_H + 8}
                stroke={PLAY}
                strokeWidth="1.4"
                opacity={phase === "idle" ? 0.25 : 0.85}
              />
              <path
                d="M -6 34 L 6 34 L 0 46 Z"
                fill={PLAY}
                opacity={phase === "idle" ? 0.25 : 0.9}
              />
            </g>

            {/* idle hint drawn on the paper */}
            {phase === "idle" && (
              <text
                x={SVG_W / 2}
                y={SVG_H / 2}
                textAnchor="middle"
                fill={INK_SOFT}
                opacity="0.5"
                fontSize="17"
                fontFamily="system-ui, sans-serif"
              >
                drop an audio file here — or press Start
              </text>
            )}
          </svg>
        </div>

        {/* footer legend / status */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            {phase === "done"
              ? "Drag left/right across the score to re-sound the marks under the playhead."
              : phase === "running"
                ? "Onsets → marks; higher pitch sits higher; louder is bolder."
                : "Ink-on-parchment graphic notation in the Cage / Feldman / Xenakis idiom."}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {marks.length} marks
          </span>
        </div>

        {/* design notes panel */}
        {showNotes && (
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if
                recorded music could write its own living graphic score — in the
                twentieth-century notation tradition — that you could then
                re-perform by scrubbing the drawn marks?
              </p>
              <p>
                <span className="text-foreground">Named reference.</span> This is
                the inverse of Playmodes&rsquo; <em>FORMS</em> (Santi Vilanova /
                Eloi Maduell, 2026), a generative graphic-scoring bot that turns
                notation <em>into</em> sound. Inkscore runs the arrow the other
                way — sound into notation — in the lineage of John Cage, Morton
                Feldman, Iannis Xenakis, Cornelius Cardew&rsquo;s <em>Treatise</em>
                , and Vera Molnár.
              </p>
              <p>
                <span className="text-foreground">Sound → marks.</span> A
                spectral-flux onset detector (adaptive mean + std threshold)
                triggers marks; spectral centroid sets the vertical register
                (higher pitch, higher on the staff); loudness sets boldness and
                size; spectral flatness and centroid slope choose the glyph —
                noisy hits become Cage scatter-clusters, moving pitch becomes a
                Xenakis glissando sheaf, strong steady tones become sustained
                strokes, mid onsets become Feldman grid-boxes, and quiet events
                become dots. A continuous centroid contour draws the
                Cardew-Treatise line under everything.
              </p>
              <p>
                <span className="text-foreground">Re-performance.</span> Every
                mark stores its pitch and character, so dragging the playhead
                re-sounds the marks it crosses with a short inharmonic additive
                grain (clusters add a noise chiff) — the drawn score is genuinely
                playable, not a picture.
              </p>
              <p>
                <span className="text-foreground">Degrade ladder.</span> Dropped
                file decoded and analysed live; decode failure shows a notice and
                falls back to a seeded inharmonic/modal phrase; no file at all
                plays that phrase on Start. On a muted phone the audio graph still
                runs, so the score still draws, scrolls and reads as an evolving
                notation image — that legibility with sound off is the point.
              </p>
              <p>
                <span className="text-foreground">Next.</span> True offline
                pre-analysis for an instant full-page score, per-voice separation
                so polyphony fans into parallel staves, and export of the SVG as a
                printable plate.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── one notation glyph, drawn per its kind ─────────────────────────────────────
function MarkGlyph({ m }: { m: Mark }) {
  const nr = mulberry32(0x10472 ^ (m.id * 40503));
  if (m.kind === "dot") {
    const r = 2.4 + m.size * 4;
    return <circle cx={m.x} cy={m.y} r={r} fill={INK} opacity={0.85} />;
  }
  if (m.kind === "box") {
    const h = 9 + m.size * 26;
    return (
      <rect
        x={m.x}
        y={m.y - h / 2}
        width={Math.max(6, m.len)}
        height={h}
        fill={INK}
        fillOpacity={0.1 + m.size * 0.16}
        stroke={INK}
        strokeWidth={0.9 + m.size * 1.4}
      />
    );
  }
  if (m.kind === "stroke") {
    return (
      <line
        x1={m.x}
        y1={m.y}
        x2={m.x + Math.max(10, m.len)}
        y2={m.y}
        stroke={INK}
        strokeWidth={1.6 + m.size * 4.2}
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  }
  if (m.kind === "sheaf") {
    // Xenakis fan of glissando lines
    const n = 4 + Math.floor(m.size * 4);
    const spread = 8 + m.size * 26;
    const lines = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5;
      const y1 = m.y + f * spread * 0.4;
      const y2 = m.y + m.glissDy + f * spread;
      lines.push(
        <line
          key={i}
          x1={m.x}
          y1={y1}
          x2={m.x + Math.max(14, m.len)}
          y2={y2}
          stroke={i % 2 === 0 ? INK : INK_SOFT}
          strokeWidth={0.8 + m.size * 1.3}
          opacity={0.8}
        />,
      );
    }
    return <g>{lines}</g>;
  }
  // cluster — Cage/Xenakis scatter of points
  const n = 5 + Math.floor(m.size * 10);
  const spreadX = 10 + m.size * 26;
  const spreadY = 18 + m.size * 44;
  const dots = [];
  for (let i = 0; i < n; i++) {
    const dx = (nr() - 0.5) * spreadX * 2;
    const dy = (nr() - 0.5) * spreadY;
    const r = 1.2 + nr() * (1.4 + m.size * 2.4);
    dots.push(
      <circle
        key={i}
        cx={m.x + dx}
        cy={m.y + dy}
        r={r}
        fill={i % 3 === 0 ? INK_SOFT : INK}
        opacity={0.7 + nr() * 0.25}
      />,
    );
  }
  return <g>{dots}</g>;
}
