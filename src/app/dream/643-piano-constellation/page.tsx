"use client";

// 643-piano-constellation — "Piano Constellation". Cycle-3 of the piano-decomposition
// arc (606 vivisection → 630 refract → 643 constellation). First split Karel's solo
// piano into sustained STRINGS vs HAMMERS via median-filter HPSS, then go FINER than
// register bands: attribute the harmonic layer to the 12 PITCH CLASSES (notes) via a
// salience function + soft harmonic-comb masks (a partition of unity → phase
// preserved), ISTFT → 12 isolated pitch-class buffers + the hammers buffer. All 13
// always loop, sample-aligned; solo/mute/gain are instant.
//
// THE CYCLE-3 DEEPENING — REPLAY: tap a note-orb or press a key (A S D F … mapped to
// the 12 chromas) to RE-TRIGGER that pitch class's isolated material as a short
// granular grain — so the recording becomes an instrument made of Karel's own touch.
// Multiple taps layer. Rendered as 12 orbiting star-constellations in three.js that
// brighten/expand when a note sounds and FLARE when you replay it.

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioSourceKind, fetchPianoBuffer, renderFallbackBuffer } from "./audio";
import { decompose, stft } from "./hpss";
import { CHROMA_COUNT, CHROMA_NAMES, isolateChromas, ChromaResult } from "./chroma";
import { createConstellationScene, ConstellationScene } from "./scene";

type Phase = "idle" | "loading" | "ready" | "error";

// Cluster indices: 0..11 = chromas C..B, 12 = hammers.
const HAMMER = CHROMA_COUNT; // 12
const VOICE_COUNT = CHROMA_COUNT + 1; // 13

// Keyboard map: home-row-ish run of 12 keys → the 12 chromas (white+black mixed).
const KEY_TO_CHROMA: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
};

const HUE = [0.0, 0.07, 0.13, 0.2, 0.3, 0.42, 0.5, 0.58, 0.66, 0.74, 0.84, 0.92];
const chromaCss = (i: number): string => {
  if (i === HAMMER) return "rgb(180,196,242)";
  const h = HUE[i] * 360;
  return `hsl(${h}, 70%, 62%)`;
};

interface MixState {
  gains: number[]; // length VOICE_COUNT
  muted: boolean[];
  soloed: number; // index or -1
  selected: number;
  playing: boolean;
  lastInteract: number;
  demoActive: boolean;
  demoPhase: number;
  demoNextAt: number;
}

export default function PianoConstellationPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [backend, setBackend] = useState<"webgl" | "none" | null>(null);
  const [ui, setUi] = useState({
    soloed: -1,
    selected: 0,
    muted: new Array<boolean>(VOICE_COUNT).fill(false),
    playing: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<ConstellationScene | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chromaRef = useRef<ChromaResult | null>(null);
  const hammerPcmRef = useRef<Float32Array | null>(null);
  const audioBuffersRef = useRef<AudioBuffer[]>([]); // per-voice loop buffers (for replay grains too)

  // Persistent audio graph.
  const masterRef = useRef<GainNode | null>(null);
  const replayBusRef = useRef<GainNode | null>(null);
  const voiceGainsRef = useRef<(GainNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const voiceSrcRef = useRef<(AudioBufferSourceNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const analysersRef = useRef<(AnalyserNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Per-frame scratch for the scene.
  const levelsRef = useRef(new Float32Array(VOICE_COUNT));
  const effGainRef = useRef(new Float32Array(VOICE_COUNT));
  const flaresRef = useRef(new Float32Array(VOICE_COUNT)); // replay flares, decay each frame

  const mixRef = useRef<MixState>({
    gains: new Array(VOICE_COUNT).fill(0.9),
    muted: new Array(VOICE_COUNT).fill(false),
    soloed: -1,
    selected: 0,
    playing: false,
    lastInteract: 0,
    demoActive: false,
    demoPhase: 0,
    demoNextAt: 0,
  });
  const rafRef = useRef(0);

  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  const applyMix = useCallback(() => {
    const m = mixRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !masterRef.current) return;
    const t = ctx.currentTime;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const node = voiceGainsRef.current[i];
      if (!node) continue;
      let target = m.gains[i];
      if (m.muted[i]) target = 0;
      if (m.soloed >= 0 && m.soloed !== i) target = 0;
      node.gain.setTargetAtTime(target, t, 0.02);
    }
  }, []);

  const markInteract = useCallback(() => {
    mixRef.current.lastInteract = performance.now();
    mixRef.current.demoActive = false;
  }, []);

  // ─── REPLAY: granular re-trigger of a pitch class's isolated material ────────
  const replayChroma = useCallback((idx: number) => {
    const ctx = ctxRef.current;
    const buffers = audioBuffersRef.current;
    const replayBus = replayBusRef.current;
    if (!ctx || !replayBus || idx < 0 || idx >= buffers.length) return;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = buffers[idx];
    if (!buf || buf.length < 2) return;

    // Pluck a short grain window from a salient region of that note's buffer.
    const grainSecs = 0.34;
    const dur = buf.duration;
    const maxStart = Math.max(0, dur - grainSecs);
    const offset = Math.random() * maxStart;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Slight random pitch shimmer so layered taps don't phase-cancel.
    src.playbackRate.value = 0.98 + Math.random() * 0.05;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const peak = 0.9;
    // Hann-ish envelope: fast attack, smooth release (click-free grain).
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.setValueAtTime(peak, now + grainSecs * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0008, now + grainSecs);

    src.connect(g);
    g.connect(replayBus);
    src.start(now, offset, grainSecs + 0.02);
    src.stop(now + grainSecs + 0.05);
    src.onended = () => {
      try { src.disconnect(); } catch { /* noop */ }
      try { g.disconnect(); } catch { /* noop */ }
    };

    // Visual flare on that cluster (decays in the render loop).
    flaresRef.current[idx] = Math.min(1.4, flaresRef.current[idx] + 1.0);
    mixRef.current.selected = idx;
    markInteract();
  }, [markInteract]);

  // ─── Build the always-on looping voice graph ───────────────────────────────
  const startPlayback = useCallback(() => {
    const ctx = ctxRef.current;
    const chroma = chromaRef.current;
    if (!ctx || !chroma) return;
    for (let i = 0; i < VOICE_COUNT; i++) {
      try { voiceSrcRef.current[i]?.stop(); } catch { /* already stopped */ }
    }

    // Assemble PCM list: 0..11 chromas, 12 hammers. Pad/trim to shortest.
    const pcms: Float32Array[] = [...chroma.buffers];
    pcms.push(hammerPcmRef.current ?? new Float32Array(1));
    let minLen = Infinity;
    for (const p of pcms) minLen = Math.min(minLen, p.length);
    if (!isFinite(minLen) || minLen < 1) minLen = 1;

    const buffers: AudioBuffer[] = [];
    const mkBuffer = (pcm: Float32Array): AudioBuffer => {
      const b = ctx.createBuffer(1, minLen, chroma.sampleRate);
      b.getChannelData(0).set(pcm.subarray(0, minLen));
      return b;
    };
    for (let i = 0; i < VOICE_COUNT; i++) buffers.push(mkBuffer(pcms[i]));
    audioBuffersRef.current = buffers;

    const master = ctx.createGain();
    master.gain.value = 0.95;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 16;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    masterRef.current = master;

    // Replay grains share their own bus → master (so they ride the compressor too).
    const replayBus = ctx.createGain();
    replayBus.gain.value = 0.9;
    replayBus.connect(master);
    replayBusRef.current = replayBus;

    const startAt = ctx.currentTime + 0.05;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[i];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.6;
      src.connect(g);
      g.connect(an);
      an.connect(master);
      src.start(startAt);
      voiceSrcRef.current[i] = src;
      voiceGainsRef.current[i] = g;
      analysersRef.current[i] = an;
    }
    analyserBufRef.current = new Uint8Array(new ArrayBuffer(256));

    mixRef.current.playing = true;
    applyMix();
  }, [applyMix]);

  const stopPlayback = useCallback(() => {
    for (let i = 0; i < VOICE_COUNT; i++) {
      try { voiceSrcRef.current[i]?.stop(); } catch { /* already stopped */ }
      voiceSrcRef.current[i] = null;
    }
    mixRef.current.playing = false;
  }, []);

  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (mixRef.current.playing) stopPlayback();
    else startPlayback();
  }, [startPlayback, stopPlayback]);

  // ─── Load → HPSS → chroma isolation ────────────────────────────────────────
  const load = useCallback(async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorMsg(null);
    setProgress(0);
    setProgressLabel("opening audio context");

    const ctx = ensureContext();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* gesture should cover this */ }
    }

    let buffer: AudioBuffer | null = null;
    let kind: AudioSourceKind = "fallback";
    try {
      buffer = await fetchPianoBuffer(ctx);
      if (buffer) kind = "piano";
    } catch {
      buffer = null;
    }
    if (!buffer) {
      setErrorMsg("synthesized piano — recording unavailable");
      try {
        buffer = await renderFallbackBuffer(ctx.sampleRate);
        kind = "fallback";
      } catch {
        setPhase("error");
        setErrorMsg("Audio synthesis failed — your browser may not support OfflineAudioContext.");
        return;
      }
    }
    setSourceKind(kind);

    // 1. HPSS → harmonic (strings) + percussive (hammers).
    let hpss;
    try {
      hpss = await decompose(buffer, (frac, label) => {
        setProgress(frac * 0.4);
        setProgressLabel("HPSS · " + label);
      });
    } catch (e) {
      setPhase("error");
      setErrorMsg("HPSS failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    hammerPcmRef.current = hpss.percussive;

    // 2. Re-STFT the harmonic PCM for fresh complex re/im to mask.
    setProgressLabel("chroma · re-analyzing strings");
    await new Promise((r) => setTimeout(r, 0));
    const hSpec = stft(hpss.harmonic);

    // 3. Isolate the 12 pitch classes via salience + comb partition-of-unity masks.
    try {
      const chroma = await isolateChromas(
        hSpec.re,
        hSpec.im,
        hSpec.mag,
        hSpec.frames,
        hSpec.bins,
        hpss.harmonic.length,
        (frac, label) => {
          setProgress(0.4 + frac * 0.6);
          setProgressLabel("chroma · " + label);
        },
      );
      chromaRef.current = chroma;
    } catch (e) {
      setPhase("error");
      setErrorMsg("Chroma isolation failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    setPhase("ready");
    mixRef.current.lastInteract = performance.now() - 5000;
    mixRef.current.demoActive = false;
    mixRef.current.demoPhase = 0;
    mixRef.current.demoNextAt = 0;
    startPlayback();
  }, [phase, ensureContext, startPlayback]);

  // ─── Scene init — animates immediately on mount ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: ConstellationScene;
    try {
      scene = createConstellationScene(canvas);
    } catch (e) {
      setBackend("none");
      setNoticeMsg("Visual backend failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    sceneRef.current = scene;
    setBackend(scene.backend);
    if (scene.backend === "none") {
      setNoticeMsg("WebGL unavailable — visuals disabled, audio still fully playable.");
    }
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ─── Render + auto-demo loop ───────────────────────────────────────────────
  useEffect(() => {
    let uiTick = 0;
    let lastT = performance.now();
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const scene = sceneRef.current;
      const m = mixRef.current;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const levels = levelsRef.current;
      const effGain = effGainRef.current;
      const flares = flaresRef.current;

      // Auto-demo after ~2.5s idle: cycle the soloed note AND replay it.
      if (phase === "ready") {
        const idle = now - m.lastInteract;
        if (!m.demoActive && idle > 2500) {
          m.demoActive = true;
          m.demoPhase = 0;
          m.demoNextAt = now;
        }
        if (m.demoActive && idle > 2500 && now >= m.demoNextAt) {
          const idx = m.demoPhase % CHROMA_COUNT;
          m.soloed = idx;
          // Replay the soloed note as a grain so the demo also shows the REPLAY layer.
          replayChromaInternal(idx);
          m.demoPhase++;
          m.demoNextAt = now + 1100;
          applyMix();
        }
      }

      // Decay flares.
      for (let i = 0; i < VOICE_COUNT; i++) {
        flares[i] = Math.max(0, flares[i] - dt * 2.6);
      }

      const aBuf = analyserBufRef.current;
      for (let i = 0; i < VOICE_COUNT; i++) {
        const an = analysersRef.current[i];
        if (an && aBuf && m.playing) {
          an.getByteTimeDomainData(aBuf);
          let sum = 0;
          for (let n = 0; n < aBuf.length; n++) {
            const v = (aBuf[n] - 128) / 128;
            sum += v * v;
          }
          levels[i] = Math.min(1, Math.sqrt(sum / aBuf.length) * 3.4);
        } else {
          levels[i] = 0.18 + 0.16 * Math.abs(Math.sin(now * 0.001 + i * 0.7));
        }
        let g = m.gains[i];
        if (m.muted[i]) g = 0;
        if (m.soloed >= 0 && m.soloed !== i) g = 0;
        effGain[i] = Math.min(1, g);
      }

      if (scene) scene.render(levels, effGain, flares, m.soloed, now * 0.001);

      if (now - uiTick > 100) {
        uiTick = now;
        setUi({
          soloed: m.soloed,
          selected: m.selected,
          muted: [...m.muted],
          playing: m.playing,
        });
      }
    };
    // Internal replay so the loop can call it without a dep cycle.
    const replayChromaInternal = (idx: number) => {
      const ctx = ctxRef.current;
      const buffers = audioBuffersRef.current;
      const replayBus = replayBusRef.current;
      if (!ctx || !replayBus || idx < 0 || idx >= buffers.length) return;
      const buf = buffers[idx];
      if (!buf || buf.length < 2) return;
      const grainSecs = 0.34;
      const maxStart = Math.max(0, buf.duration - grainSecs);
      const offset = Math.random() * maxStart;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.98 + Math.random() * 0.05;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      const peak = 0.85;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.setValueAtTime(peak, t0 + grainSecs * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + grainSecs);
      src.connect(g);
      g.connect(replayBus);
      src.start(t0, offset, grainSecs + 0.02);
      src.stop(t0 + grainSecs + 0.05);
      src.onended = () => {
        try { src.disconnect(); } catch { /* noop */ }
        try { g.disconnect(); } catch { /* noop */ }
      };
      flaresRef.current[idx] = Math.min(1.4, flaresRef.current[idx] + 1.0);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, applyMix]);

  // ─── Voice actions ─────────────────────────────────────────────────────────
  const soloVoice = useCallback((i: number) => {
    const m = mixRef.current;
    m.soloed = m.soloed === i ? -1 : i;
    m.selected = i;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);

  const muteVoice = useCallback((i: number) => {
    const m = mixRef.current;
    m.muted[i] = !m.muted[i];
    m.selected = i;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);

  const resetAll = useCallback(() => {
    const m = mixRef.current;
    m.soloed = -1;
    for (let i = 0; i < VOICE_COUNT; i++) m.muted[i] = false;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);

  // ─── Keyboard: A W S E D F T G Y H U J = replay the 12 chromas ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "ready") return;
      const k = e.key.toLowerCase();
      if (k in KEY_TO_CHROMA) {
        replayChroma(KEY_TO_CHROMA[k]);
        e.preventDefault();
        return;
      }
      const m = mixRef.current;
      let handled = true;
      switch (e.key) {
        case "Enter":
          soloVoice(m.selected);
          return;
        case "ArrowLeft":
          m.selected = (m.selected - 1 + VOICE_COUNT) % VOICE_COUNT;
          break;
        case "ArrowRight":
          m.selected = (m.selected + 1) % VOICE_COUNT;
          break;
        case "x": case "X":
          replayChroma(HAMMER);
          break;
        case "0":
          m.soloed = -1;
          for (let i = 0; i < VOICE_COUNT; i++) m.muted[i] = false;
          break;
        case "m": case "M":
          m.muted[m.selected] = !m.muted[m.selected];
          break;
        case " ":
          togglePlay();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        markInteract();
        applyMix();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, applyMix, markInteract, togglePlay, replayChroma, soloVoice]);

  const voiceLabel = (i: number): string => (i === HAMMER ? "Hammers" : CHROMA_NAMES[i]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06080c] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {backend && (
        <span className="absolute left-4 top-4 z-20 rounded-md bg-black/40 px-3 py-1.5 font-mono text-sm text-muted-foreground">
          {backend === "webgl" ? "three.js / WebGL" : "no WebGL"}
        </span>
      )}

      <a
        href="/dream/643-piano-constellation/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes ↗
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Piano Constellation
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Take Karel&apos;s solo piano apart down to its 12 notes — isolate each pitch
            class from the recording, then <span className="text-violet-300">play it back as an instrument</span>{" "}
            made of his own touch. Tap a constellation or press a key to re-fire that
            note&apos;s isolated material as a grain.
          </p>

          {sourceKind && (
            <p className="mt-2 font-mono text-sm">
              source:{" "}
              <span className={sourceKind === "piano" ? "text-violet-300/95" : "text-violet-300/95"}>
                {sourceKind === "piano" ? "Karel's piano (real recording)" : "synthesized piano — recording unavailable"}
              </span>
            </p>
          )}

          {errorMsg && <p className="mt-2 text-base text-violet-300/95">{errorMsg}</p>}
          {noticeMsg && <p className="mt-2 text-base text-violet-300">{noticeMsg}</p>}
        </header>

        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void load()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Begin · isolate Karel&apos;s 12 notes
            </button>
          )}

          {phase === "loading" && (
            <div className="w-full max-w-md">
              <p className="font-mono text-sm text-muted-foreground">
                {progressLabel} ({Math.round(progress * 100)}%)
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-violet-400 via-violet-400 to-violet-400 transition-[width] duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {phase === "error" && (
            <button
              onClick={() => setPhase("idle")}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Try again
            </button>
          )}
        </section>

        {phase === "ready" && (
          <footer className="flex flex-col gap-4">
            <div className="font-mono text-sm text-muted-foreground">
              <span className="text-violet-300">replay</span> (tap a note or press a key):{" "}
              <kbd className="text-foreground">A W S E D F T G Y H U J</kbd> → 12 notes ·{" "}
              <kbd className="text-foreground">X</kbd> hammers ·{" "}
              <kbd className="text-foreground">←/→</kbd> select ·{" "}
              <kbd className="text-foreground">Enter</kbd> solo ·{" "}
              <kbd className="text-foreground">m</kbd> mute ·{" "}
              <kbd className="text-foreground">0</kbd> reset ·{" "}
              <kbd className="text-foreground">space</kbd> play/pause
              {!ui.playing && <span className="ml-2 text-violet-300/95">paused</span>}
            </div>

            {/* 13 note-orbs: tap = REPLAY grain; long-press buttons below for solo/mute */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: VOICE_COUNT }, (_, i) => {
                const isSolo = ui.soloed === i;
                const isMuted = ui.muted[i];
                const dimmed = ui.soloed >= 0 && !isSolo;
                return (
                  <div key={i} className="flex flex-col items-stretch gap-1">
                    <button
                      onClick={() => replayChroma(i)}
                      aria-label={`replay ${voiceLabel(i)}`}
                      className={`flex min-h-[44px] min-w-[52px] items-center justify-center rounded-md border px-4 py-2.5 text-base font-medium transition ${
                        ui.selected === i ? "border-border" : "border-border"
                      } ${dimmed ? "opacity-50" : "opacity-100"} ${isMuted ? "line-through" : ""}`}
                      style={{
                        backgroundColor: `${chromaCss(i)}22`,
                        color: chromaCss(i),
                        boxShadow: isSolo ? `0 0 14px ${chromaCss(i)}` : "none",
                      }}
                    >
                      {voiceLabel(i)}
                    </button>
                    <div className="flex gap-1">
                      <button
                        onClick={() => soloVoice(i)}
                        className={`min-h-[28px] flex-1 rounded px-2 py-1 font-mono text-sm ${
                          isSolo ? "bg-muted text-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {isSolo ? "solo*" : "solo"}
                      </button>
                      <button
                        onClick={() => muteVoice(i)}
                        className={`min-h-[28px] flex-1 rounded px-2 py-1 font-mono text-sm ${
                          isMuted ? "bg-violet-500/30 text-violet-100" : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {isMuted ? "mute*" : "mute"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={resetAll}
                className="min-h-[44px] rounded-md bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                reset (all on)
              </button>
              <button
                onClick={() => { markInteract(); togglePlay(); }}
                className="min-h-[44px] rounded-md bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                {ui.playing ? "pause" : "play"}
              </button>
              <span className="font-mono text-sm text-muted-foreground">
                tap any note to <span className="text-violet-300">replay</span> Karel&apos;s touch · layers stack
              </span>
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
