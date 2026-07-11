"use client";

/**
 * 422 · Shatter Piano
 * "What if you took a calm, consonant piano phrase and REFUSED to let it
 *  resolve — shattering it into a granular, time-frozen cloud?"
 *
 * A gentle ascending/descending piano phrase is rendered into an AudioBuffer
 * via OfflineAudioContext, then disassembled into overlapping Hann-windowed
 * grains that loop, freeze on a moment, reverse, detune, and smear in time.
 * The familiar resolving figure becomes an unresolved, suspended texture.
 *
 * Visualisation: a frequency-bin × time-glitch grid of absolutely-positioned
 * <div>s animated via CSS transforms/opacity/filter from live AnalyserNode data.
 * Pure DOM — no canvas, no SVG, no WebGL.
 *
 * References: see README.md
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────

const GRID_COLS = 32;   // frequency axis
const GRID_ROWS = 16;   // time-smear axis
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 512 cells

const FFT_SIZE = 2048;
const ANALYSER_SMOOTH = 0.6;

// Synthesised phrase: C4 D4 E4 G4 E4 D4 — wants to resolve to C4 but won't
const PHRASE_NOTES = [
  { freq: 261.63, start: 0.0,  dur: 0.7 },   // C4
  { freq: 293.66, start: 0.55, dur: 0.7 },   // D4
  { freq: 329.63, start: 1.1,  dur: 0.7 },   // E4
  { freq: 392.00, start: 1.65, dur: 0.9 },   // G4
  { freq: 329.63, start: 2.5,  dur: 0.7 },   // E4 (descending)
  { freq: 293.66, start: 3.05, dur: 0.8 },   // D4 — hangs, NEVER lands on C4
];
const PHRASE_DURATION = 4.2; // seconds — phrase duration (no resolution)

// ── Types ──────────────────────────────────────────────────────────────────────

interface GrainParams {
  densityHz: number;      // grains per second
  grainMs: number;        // grain duration ms
  detuneSpread: number;   // detune spread in cents
  reverseProb: number;    // 0..1 probability of reversed grain
  position: number;       // 0..1 read-head position in source buffer
  freezeDrift: number;    // 0..1 how much the freeze-head drifts
}

interface ActiveGrain {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  endTime: number; // audioContext time
}

type Phase = "idle" | "clean" | "shattering" | "frozen";

// ── Pure helpers (never start with "use") ──────────────────────────────────────

/** Build a Hann window into a Float32Array */
function makeHannWindow(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return w;
}

/**
 * Synthesise a short gentle piano-ish phrase into an OfflineAudioContext.
 * Returns a promise resolving to an AudioBuffer.
 */
async function makeSynthPhrase(sampleRate: number): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(PHRASE_DURATION * sampleRate), sampleRate);

  for (const note of PHRASE_NOTES) {
    const osc = offline.createOscillator();
    osc.type = "triangle"; // warmer than sine, piano-ish

    // Add a couple of harmonics via a second osc
    const osc2 = offline.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = note.freq * 2;

    const osc3 = offline.createOscillator();
    osc3.type = "sine";
    osc3.frequency.value = note.freq * 3;

    osc.frequency.value = note.freq;

    const noteGain = offline.createGain();
    // Attack
    noteGain.gain.setValueAtTime(0, note.start);
    noteGain.gain.linearRampToValueAtTime(0.22, note.start + 0.02);
    // Decay to sustain
    noteGain.gain.exponentialRampToValueAtTime(0.10, note.start + 0.15);
    // Release
    noteGain.gain.exponentialRampToValueAtTime(0.0001, note.start + note.dur);

    const noteGain2 = offline.createGain();
    noteGain2.gain.setValueAtTime(0, note.start);
    noteGain2.gain.linearRampToValueAtTime(0.07, note.start + 0.02);
    noteGain2.gain.exponentialRampToValueAtTime(0.03, note.start + 0.15);
    noteGain2.gain.exponentialRampToValueAtTime(0.0001, note.start + note.dur);

    const noteGain3 = offline.createGain();
    noteGain3.gain.setValueAtTime(0, note.start);
    noteGain3.gain.linearRampToValueAtTime(0.04, note.start + 0.02);
    noteGain3.gain.exponentialRampToValueAtTime(0.015, note.start + 0.15);
    noteGain3.gain.exponentialRampToValueAtTime(0.0001, note.start + note.dur);

    osc.connect(noteGain).connect(offline.destination);
    osc2.connect(noteGain2).connect(offline.destination);
    osc3.connect(noteGain3).connect(offline.destination);

    osc.start(note.start);
    osc.stop(note.start + note.dur + 0.05);
    osc2.start(note.start);
    osc2.stop(note.start + note.dur + 0.05);
    osc3.start(note.start);
    osc3.stop(note.start + note.dur + 0.05);
  }

  return offline.startRendering();
}

/**
 * Schedule one grain from srcBuffer onto the audio graph.
 * Returns an ActiveGrain for lifecycle tracking.
 */
function scheduleGrain(
  actx: AudioContext,
  srcBuffer: AudioBuffer,
  params: GrainParams,
  destination: AudioNode,
  freezePos: number,
  isFrozen: boolean,
): ActiveGrain {
  const sr = actx.sampleRate;
  const grainSamples = Math.max(256, Math.round((params.grainMs / 1000) * sr));
  const bufLen = srcBuffer.length;

  // Determine grain read position
  let centerPos: number;
  if (isFrozen) {
    // Freeze: drift slowly around the freeze position
    const drift = (Math.random() - 0.5) * 0.04 * params.freezeDrift;
    centerPos = Math.max(0, Math.min(1, freezePos + drift));
  } else {
    // Scatter around the playback head
    const jitter = (Math.random() - 0.5) * 0.18;
    centerPos = Math.max(0, Math.min(1, params.position + jitter));
  }

  const startSample = Math.max(0, Math.min(bufLen - grainSamples, Math.floor(centerPos * bufLen)));

  // Extract and window grain
  const grainData = new Float32Array(grainSamples);
  const channelData = srcBuffer.getChannelData(0);
  const isReversed = Math.random() < params.reverseProb;

  if (isReversed) {
    for (let i = 0; i < grainSamples; i++) {
      grainData[i] = channelData[startSample + (grainSamples - 1 - i)] ?? 0;
    }
  } else {
    for (let i = 0; i < grainSamples; i++) {
      grainData[i] = channelData[startSample + i] ?? 0;
    }
  }

  // Apply Hann window
  const window = makeHannWindow(grainSamples);
  for (let i = 0; i < grainSamples; i++) {
    grainData[i] *= window[i];
  }

  const grainBuf = actx.createBuffer(1, grainSamples, sr);
  grainBuf.copyToChannel(grainData, 0);

  const srcNode = actx.createBufferSource();
  srcNode.buffer = grainBuf;

  const detuneCents = (Math.random() - 0.5) * 2 * params.detuneSpread;
  srcNode.detune.value = detuneCents;

  const gainNode = actx.createGain();
  // Scale amplitude: quieter at higher densities to prevent clipping
  const amp = 0.18 / Math.max(1, Math.sqrt(params.densityHz / 12));
  gainNode.gain.value = amp;

  const pan = actx.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 1.4;

  srcNode.connect(gainNode);
  gainNode.connect(pan);
  pan.connect(destination);

  const grainDurSec = params.grainMs / 1000;
  const startTime = actx.currentTime;
  srcNode.start(startTime);
  srcNode.stop(startTime + grainDurSec + 0.01);

  return {
    sourceNode: srcNode,
    gainNode,
    endTime: actx.currentTime + grainDurSec + 0.02,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShatterPianoPage() {
  // ── State ──────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<Phase>("idle");
  const [isFrozen, setIsFrozen] = useState(false);
  const [grainParams, setGrainParams] = useState<GrainParams>({
    densityHz: 18,
    grainMs: 60,
    detuneSpread: 180,
    reverseProb: 0.25,
    position: 0.0,
    freezeDrift: 0.5,
  });
  const [sourceLabel, setSourceLabel] = useState("synthesized phrase");
  const [optionalId, setOptionalId] = useState("");
  const [optError, setOptError] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const grainBusRef = useRef<GainNode | null>(null);
  const srcBufferRef = useRef<AudioBuffer | null>(null);
  const cleanSrcRef = useRef<AudioBufferSourceNode | null>(null);

  const freqDataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number>(0);
  const activeGrainsRef = useRef<ActiveGrain[]>([]);
  const lastGrainTimeRef = useRef<number>(0);

  // Freeze position drifts slowly
  const freezePosRef = useRef<number>(0.4);
  const freezeDriftDirRef = useRef<number>(1);

  // DOM grid cells ref array
  const cellsRef = useRef<HTMLDivElement[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const grainParamsRef = useRef(grainParams);
  grainParamsRef.current = grainParams;

  const isFrozenRef = useRef(isFrozen);
  isFrozenRef.current = isFrozen;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Demo automation refs
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Audio teardown ─────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];

    // Stop grains
    for (const g of activeGrainsRef.current) {
      try { g.sourceNode.stop(); } catch { /* already stopped */ }
      try { g.sourceNode.disconnect(); } catch { /* ok */ }
    }
    activeGrainsRef.current = [];

    // Stop clean source
    try { cleanSrcRef.current?.stop(); } catch { /* ok */ }
    cleanSrcRef.current = null;

    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    compressorRef.current = null;
    grainBusRef.current = null;
    freqDataRef.current = null;
    lastGrainTimeRef.current = 0;
    setPhase("idle");
    setIsFrozen(false);
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── Build audio graph ──────────────────────────────────────────────────────

  function buildGraph(actx: AudioContext): { grainBus: GainNode; analyser: AnalyserNode } {
    const compressor = actx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 3;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.1;
    compressor.connect(actx.destination);
    compressorRef.current = compressor;

    const analyser = actx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = ANALYSER_SMOOTH;
    analyser.connect(compressor);
    analyserRef.current = analyser;

    const grainBus = actx.createGain();
    grainBus.gain.value = 1.0;
    grainBus.connect(analyser);
    grainBusRef.current = grainBus;

    freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    return { grainBus, analyser };
  }

  // ── Load optional source ───────────────────────────────────────────────────

  async function loadOptionalId(id: string, actx: AudioContext): Promise<AudioBuffer | null> {
    try {
      const res = await fetch("/api/audio/" + encodeURIComponent(id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return await actx.decodeAudioData(ab);
    } catch {
      return null;
    }
  }

  // ── Start: load buffer, build graph, begin grain loop ─────────────────────

  const startShatter = useCallback(async () => {
    if (phase !== "idle") return;

    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    ctxRef.current = actx;

    buildGraph(actx);

    // Synthesise the default phrase
    let srcBuffer: AudioBuffer = await makeSynthPhrase(actx.sampleRate);
    let label = "synthesized phrase";

    // Optional ID door
    if (optionalId.trim()) {
      const loaded = await loadOptionalId(optionalId.trim(), actx);
      if (loaded) {
        srcBuffer = loaded;
        label = `track: ${optionalId.trim()}`;
      } else {
        setOptError("Could not load — using synthesized phrase");
      }
    }

    srcBufferRef.current = srcBuffer;
    setSourceLabel(label);
    setPhase("frozen"); // start frozen, user can unfreeze
    phaseRef.current = "frozen";
    setIsFrozen(false);
    isFrozenRef.current = false;
    freezePosRef.current = 0.0;
  }, [phase, optionalId]);

  // ── Demo: play clean phrase, then shatter ─────────────────────────────────

  const startAutoDemo = useCallback(async () => {
    if (phase !== "idle") return;

    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    ctxRef.current = actx;

    const { grainBus } = buildGraph(actx);

    let srcBuffer: AudioBuffer = await makeSynthPhrase(actx.sampleRate);
    let label = "synthesized phrase";

    if (optionalId.trim()) {
      const loaded = await loadOptionalId(optionalId.trim(), actx);
      if (loaded) {
        srcBuffer = loaded;
        label = `track: ${optionalId.trim()}`;
      }
    }

    srcBufferRef.current = srcBuffer;
    setSourceLabel(label);

    // 1. Play the clean phrase once
    setPhase("clean");
    phaseRef.current = "clean";

    const cleanSrc = actx.createBufferSource();
    cleanSrc.buffer = srcBuffer;
    const cleanGain = actx.createGain();
    cleanGain.gain.value = 0.7;
    cleanSrc.connect(cleanGain);
    cleanGain.connect(analyserRef.current!);
    cleanSrc.start();
    cleanSrcRef.current = cleanSrc;

    // 2. After ~2s: begin shattering — position scrubs forward
    const t1 = setTimeout(() => {
      setPhase("shattering");
      phaseRef.current = "shattering";
      grainParamsRef.current = {
        ...grainParamsRef.current,
        densityHz: 8,
        detuneSpread: 40,
        reverseProb: 0.05,
        position: 0.0,
      };
      setGrainParams((prev) => ({
        ...prev,
        densityHz: 8,
        detuneSpread: 40,
        reverseProb: 0.05,
        position: 0.0,
      }));
      // Stop clean source
      try { cleanSrc.stop(); } catch { /* ok */ }
      cleanSrcRef.current = null;
      freezePosRef.current = 0.0;
    }, 2200);
    demoTimersRef.current.push(t1);

    // 3. After ~5s: ramp up chaos
    const t2 = setTimeout(() => {
      grainParamsRef.current = {
        ...grainParamsRef.current,
        densityHz: 22,
        detuneSpread: 160,
        reverseProb: 0.35,
        grainMs: 80,
      };
      setGrainParams((prev) => ({
        ...prev,
        densityHz: 22,
        detuneSpread: 160,
        reverseProb: 0.35,
        grainMs: 80,
      }));
    }, 5000);
    demoTimersRef.current.push(t2);

    // 4. After ~8s: full freeze
    const t3 = setTimeout(() => {
      setPhase("frozen");
      phaseRef.current = "frozen";
      setIsFrozen(true);
      isFrozenRef.current = true;
      freezePosRef.current = grainParamsRef.current.position;
      grainParamsRef.current = {
        ...grainParamsRef.current,
        densityHz: 28,
        detuneSpread: 260,
        reverseProb: 0.45,
        grainMs: 110,
        freezeDrift: 0.6,
      };
      setGrainParams((prev) => ({
        ...prev,
        densityHz: 28,
        detuneSpread: 260,
        reverseProb: 0.45,
        grainMs: 110,
        freezeDrift: 0.6,
      }));
    }, 8200);
    demoTimersRef.current.push(t3);

    // Grain bus was built — start grain loop via rAF
    void grainBus; // already connected
  }, [phase, optionalId]);

  // ── File drop / pick ───────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFile = useCallback(async (file: File) => {
    setOptError(null);
    try {
      const actx = ctxRef.current;
      if (!actx) { setOptError("Start the engine first, then load a file."); return; }
      const ab = await file.arrayBuffer();
      const buf = await actx.decodeAudioData(ab);
      srcBufferRef.current = buf;
      setSourceLabel(`file: ${file.name}`);
    } catch {
      setOptError("Could not decode audio file — keeping current source.");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  }, [loadFile]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  }, [loadFile]);

  // ── Toggle freeze ──────────────────────────────────────────────────────────

  const toggleFreeze = useCallback(() => {
    const nowFrozen = !isFrozenRef.current;
    setIsFrozen(nowFrozen);
    isFrozenRef.current = nowFrozen;
    if (nowFrozen) {
      freezePosRef.current = grainParamsRef.current.position;
    }
  }, []);

  // ── Grain scheduling loop + DOM animation ─────────────────────────────────

  useEffect(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase === "idle") return;

    const grid = gridRef.current;
    if (!grid) return;

    // Build DOM cells once
    if (cellsRef.current.length === 0) {
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = document.createElement("div");
        cell.style.cssText = [
          "position:absolute",
          "box-sizing:border-box",
          "will-change:transform,opacity,filter",
          "border:1px solid transparent",
          "border-radius:1px",
        ].join(";");
        grid.appendChild(cell);
        cellsRef.current.push(cell);
      }
    }

    let rafId = 0;

    const drawFrame = (now: number) => {
      const actx = ctxRef.current;
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      const srcBuffer = srcBufferRef.current;

      if (!actx || !analyser || !freqData) {
        rafId = requestAnimationFrame(drawFrame);
        rafRef.current = rafId;
        return;
      }

      analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);

      // ── Grain scheduling ────────────────────────────────────────────────
      const p = grainParamsRef.current;
      const frozen = isFrozenRef.current;
      const curPhase = phaseRef.current;

      // Advance position during shattering
      if (curPhase === "shattering" && srcBuffer && !frozen) {
        const elapsed = now * 0.001; // rough seconds counter
        const newPos = (elapsed * 0.12) % 1.0;
        grainParamsRef.current = { ...p, position: newPos };
        setGrainParams((prev) => ({ ...prev, position: newPos }));
      }

      // Drift freeze position slowly
      if (frozen) {
        freezePosRef.current += 0.00008 * freezeDriftDirRef.current;
        if (freezePosRef.current > 0.85 || freezePosRef.current < 0.1) {
          freezeDriftDirRef.current *= -1;
        }
      }

      if (srcBuffer && curPhase !== "clean" && curPhase !== "idle") {
        const intervalMs = 1000 / p.densityHz;
        const grainBus = grainBusRef.current;
        if (grainBus) {
          let cap = 0;
          while (now - lastGrainTimeRef.current >= intervalMs && cap < 8) {
            const grain = scheduleGrain(actx, srcBuffer, p, grainBus, freezePosRef.current, frozen);
            activeGrainsRef.current.push(grain);
            lastGrainTimeRef.current += intervalMs;
            cap++;
          }
        }

        // Prune ended grains
        const nowAudio = actx.currentTime;
        activeGrainsRef.current = activeGrainsRef.current.filter(
          (g) => g.endTime > nowAudio
        );
        if (activeGrainsRef.current.length > 300) {
          activeGrainsRef.current = activeGrainsRef.current.slice(-300);
        }
      }

      // ── DOM grid update ──────────────────────────────────────────────────
      const gridEl = gridRef.current;
      if (!gridEl) {
        rafId = requestAnimationFrame(drawFrame);
        rafRef.current = rafId;
        return;
      }

      const W = gridEl.clientWidth;
      const H = gridEl.clientHeight;
      const cellW = W / GRID_COLS;
      const cellH = H / GRID_ROWS;
      const binStep = Math.floor(freqData.length / GRID_COLS);

      const frozenIntensity = frozen ? 1 : 0;
      const shatterIntensity = curPhase === "shattering" ? 0.6 : 0;
      const glitchIntensity = frozenIntensity * 0.7 + shatterIntensity;

      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const idx = row * GRID_COLS + col;
          const cell = cellsRef.current[idx];
          if (!cell) continue;

          // Map row → time smear offset, col → frequency bin
          const binIdx = col * binStep;
          const rawAmp = (freqData[binIdx] ?? 0) / 255;

          // Time-smear: older rows show decayed signal
          const rowDecay = 1 - (row / GRID_ROWS) * 0.75;
          const amp = rawAmp * rowDecay;

          // Base position
          const baseX = col * cellW;
          const baseY = row * cellH;

          // Glitch displacement: frozen state smears cells harder
          const glitchX = glitchIntensity > 0
            ? (Math.sin(now * 0.003 + idx * 0.31) * glitchIntensity * cellW * 0.7 +
               (Math.random() - 0.5) * glitchIntensity * cellW * 0.5)
            : 0;
          const glitchY = glitchIntensity > 0
            ? (Math.cos(now * 0.002 + idx * 0.17) * glitchIntensity * cellH * 0.5 +
               (Math.random() - 0.5) * glitchIntensity * cellH * 0.3)
            : 0;

          const scaleX = 0.85 + amp * 0.5 + glitchIntensity * (Math.random() * 0.4);
          const scaleY = 0.85 + amp * 0.35 + glitchIntensity * (Math.random() * 0.3);

          cell.style.left = `${baseX}px`;
          cell.style.top = `${baseY}px`;
          cell.style.width = `${cellW - 1}px`;
          cell.style.height = `${cellH - 1}px`;
          cell.style.transform = `translate(${glitchX.toFixed(1)}px,${glitchY.toFixed(1)}px) scale(${scaleX.toFixed(3)},${scaleY.toFixed(3)})`;
          cell.style.opacity = (0.08 + amp * 0.85 + glitchIntensity * 0.12).toFixed(3);

          // Color: freq-dependent hue, frozen grains push toward cold violet/blue
          const hue = frozen
            ? (240 - col * 2.5 + Math.random() * 30).toFixed(0)
            : (200 - col * 3.5 + row * 4).toFixed(0);
          const sat = frozen ? "70%" : "55%";
          const lit = (40 + amp * 45).toFixed(0) + "%";
          const alpha = (0.15 + amp * 0.75 + glitchIntensity * 0.1).toFixed(3);

          cell.style.backgroundColor = `hsla(${hue},${sat},${lit},${alpha})`;

          // Blur on high-energy frozen bins for smear feel
          if (frozen && amp > 0.5) {
            cell.style.filter = `blur(${(amp * 2 * glitchIntensity).toFixed(1)}px)`;
          } else {
            cell.style.filter = "none";
          }

          // Glowing border on active bins
          if (amp > 0.55) {
            cell.style.borderColor = `hsla(${hue},80%,75%,${(amp * 0.6).toFixed(2)})`;
          } else {
            cell.style.borderColor = "transparent";
          }
        }
      }

      rafId = requestAnimationFrame(drawFrame);
      rafRef.current = rafId;
    };

    if (lastGrainTimeRef.current === 0) {
      lastGrainTimeRef.current = performance.now();
    }

    rafId = requestAnimationFrame(drawFrame);
    rafRef.current = rafId;

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [phase]); // Re-run when phase changes

  // ── Cleanup DOM cells on stop ─────────────────────────────────────────────

  useEffect(() => {
    if (phase === "idle") {
      const grid = gridRef.current;
      if (grid) {
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        cellsRef.current = [];
      }
    }
  }, [phase]);

  // ── Derive UI labels ───────────────────────────────────────────────────────

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    clean: "PLAYING CLEAN PHRASE",
    shattering: "SHATTERING...",
    frozen: isFrozen ? "FROZEN — REFUSES TO RESOLVE" : "GRANULAR CLOUD",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)", background: "#08080f" }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* DOM grid */}
      <div
        ref={gridRef}
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
      />

      {/* Idle splash */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <h1 className="text-3xl md:text-4xl font-light tracking-widest text-foreground mb-2">
            SHATTER
          </h1>
          <p className="text-base text-muted-foreground max-w-lg mb-1 leading-relaxed">
            A calm, consonant piano phrase — refused its resolution. Shattered
            into a granular, time-frozen cloud that hangs, smears, and reverses.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Tap <em>Shatter it</em> for the full arc: resolve → denied.
          </p>

          {/* Primary actions */}
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            <button
              onClick={() => void startAutoDemo()}
              className="min-h-[44px] px-6 py-2.5 text-sm tracking-widest uppercase border border-violet-400/60 text-violet-300/95 rounded hover:bg-violet-400/10 transition font-mono"
            >
              ✦ Shatter it
            </button>
            <button
              onClick={() => void startShatter()}
              className="min-h-[44px] px-5 py-2.5 text-sm tracking-wider uppercase border border-border text-muted-foreground rounded hover:bg-accent hover:border-border transition font-mono"
            >
              Open engine
            </button>
          </div>

          {/* Optional source panel */}
          <div className="w-full max-w-sm bg-muted border border-border rounded-lg p-4 text-left">
            <p className="text-xs text-violet-300/95 mb-3 font-mono tracking-wide">
              OPTIONAL: load your own audio source
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Recording ID"
                value={optionalId}
                onChange={(e) => setOptionalId(e.target.value)}
                className="flex-1 min-h-[36px] px-3 text-sm bg-muted border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-border font-mono"
              />
              <button
                onClick={() => void startShatter()}
                className="min-h-[36px] px-3 text-xs uppercase border border-border text-muted-foreground rounded hover:bg-accent font-mono"
              >
                Load
              </button>
            </div>
            <p className="text-xs text-muted-foreground/70 mb-2">
              — or drag &amp; drop / pick an audio file below —
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[36px] w-full text-xs uppercase border border-border text-muted-foreground rounded hover:bg-accent font-mono"
            >
              Browse file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFilePick}
            />
            <p className="text-xs text-muted-foreground/70 mt-2">
              All optional — falls back to synth phrase automatically.
            </p>
            {optError && (
              <p className="text-xs text-violet-300/95 mt-2">{optError}</p>
            )}
          </div>

          <Link
            href="/dream"
            className="mt-8 text-xs text-muted-foreground/70 hover:text-muted-foreground font-mono"
          >
            ← dream lab
          </Link>
        </div>
      )}

      {/* Active HUD */}
      {phase !== "idle" && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 z-10 bg-black/30 backdrop-blur-sm">
            <div>
              <span className="text-xs font-mono tracking-widest text-foreground">
                SHATTER
              </span>
              <span className="ml-3 text-xs font-mono text-muted-foreground">
                {phaseLabel[phase]}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground/70">
                src: {sourceLabel}
              </span>
              <button
                onClick={stopAudio}
                className="min-h-[32px] px-3 py-1 text-xs uppercase font-mono border border-border text-muted-foreground rounded hover:bg-accent"
              >
                stop
              </button>
            </div>
          </div>

          {/* Controls panel */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/50 backdrop-blur-sm border-t border-border px-4 py-3">
            <div className="flex flex-wrap gap-3 items-end justify-between">

              {/* Left: action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={toggleFreeze}
                  className={[
                    "min-h-[44px] px-4 py-2.5 text-sm font-mono tracking-widest uppercase rounded border transition",
                    isFrozen
                      ? "border-violet-400/80 text-violet-300/95 bg-violet-900/30"
                      : "border-border text-muted-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  {isFrozen ? "◼ Frozen" : "❄ Freeze"}
                </button>

                <button
                    onClick={() => {
                      // Snap to a random position for instant chaos
                      const pos = Math.random() * 0.9;
                      grainParamsRef.current = { ...grainParamsRef.current, position: pos };
                      setGrainParams((prev) => ({ ...prev, position: pos }));
                    }}
                    className="min-h-[44px] px-4 py-2.5 text-sm font-mono tracking-wide uppercase rounded border border-border text-muted-foreground hover:bg-accent"
                  >
                    Jump
                  </button>
              </div>

              {/* Center: sliders */}
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(
                  [
                    ["DENSITY", "densityHz", 4, 40, 1, (v: number) => `${v}Hz`],
                    ["GRAIN", "grainMs", 20, 160, 5, (v: number) => `${v}ms`],
                    ["DETUNE", "detuneSpread", 0, 400, 10, (v: number) => `±${v}¢`],
                    ["REVERSE", "reverseProb", 0, 1, 0.05, (v: number) => `${Math.round(v * 100)}%`],
                    ["POSITION", "position", 0, 1, 0.01, (v: number) => v.toFixed(2)],
                    ["DRIFT", "freezeDrift", 0, 1, 0.05, (v: number) => v.toFixed(2)],
                  ] as const
                ).map(([label, key, min, max, step, fmt]) => (
                  <label key={key} className="flex flex-col gap-0.5 text-[10px] font-mono tracking-wider text-muted-foreground">
                    <span>
                      {label}{" "}
                      <span className="text-foreground">{fmt(grainParams[key])}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={grainParams[key]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setGrainParams((prev) => ({ ...prev, [key]: val }));
                        grainParamsRef.current = { ...grainParamsRef.current, [key]: val };
                      }}
                      className="w-24 accent-violet-400"
                    />
                  </label>
                ))}
              </div>

              {/* Right: nav */}
              <div className="flex flex-col items-end gap-1">
                <Link href="/dream" className="text-xs font-mono text-muted-foreground/70 hover:text-muted-foreground">
                  ← dream lab
                </Link>
                <a
                  href="/dream/422-shatter-piano/README.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-mono text-muted-foreground/70 hover:text-muted-foreground"
                >
                  notes ↗
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
