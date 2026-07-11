"use client";

// 630-piano-refract — "Piano Refract". A cycle-2 deepening of 606-piano-vivisection.
// First refract Karel's solo piano through median-filter HPSS into its sustained
// STRINGS (harmonic) vs. its HAMMER attacks (percussive). Then fan the STRINGS
// layer through register-seeded NMF into 4 pitched register voices — Low /
// Low-mid / High-mid / High — that you can solo, mute, and re-mix live. Five
// voices total (hammers + 4 strings registers), all looped & sample-aligned so
// solo/mute is instant. Off-glass control (keyboard / device tilt). WebGL2 prism
// visual with a real Canvas2D fallback.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioSourceKind,
  fetchPianoBuffer,
  renderFallbackBuffer,
} from "./audio";
import { decompose, stft } from "./hpss";
import { runNmf, NmfResult } from "./nmf";
import { createPrismScene, PrismScene, VOICE_COUNT, VOICE_COLORS } from "./gl";

type Phase = "idle" | "loading" | "ready" | "error";

// Voice 0 = hammers (HPSS percussive); voices 1..4 = NMF register components.
const VOICE_LABELS = ["Hammers", "Low", "Low-mid", "High-mid", "High"] as const;

// Per-voice live mixer state, held in a ref so the audio/render loops read it
// without re-rendering React every frame.
interface MixState {
  gains: number[]; // per-voice user gain 0..1.4 (length VOICE_COUNT)
  muted: boolean[]; // per-voice mute toggle
  soloed: number; // index of soloed voice, or -1
  selected: number; // currently selected voice (for keyboard ↑/↓)
  playing: boolean;
  // Auto-demo bookkeeping.
  lastInteract: number;
  demoActive: boolean;
  demoPhase: number; // which voice the auto-demo is currently soloing
  demoNextAt: number;
}

const cssColor = (i: number): string => {
  const [r, g, b] = VOICE_COLORS[i];
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
};

export default function PianoRefractPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [backend, setBackend] = useState<"webgl2" | "canvas2d" | null>(null);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  // Mirror of mix state for the on-screen rows (updated ~10fps).
  const [ui, setUi] = useState({
    gains: [0.9, 0.9, 0.9, 0.9, 0.9],
    muted: [false, false, false, false, false],
    soloed: -1,
    selected: 0,
    playing: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<PrismScene | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nmfRef = useRef<NmfResult | null>(null);

  // Audio graph nodes (rebuilt per play).
  const masterRef = useRef<GainNode | null>(null);
  const voiceGainsRef = useRef<(GainNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const voiceSrcRef = useRef<(AudioBufferSourceNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const analysersRef = useRef<(AnalyserNode | null)[]>(new Array(VOICE_COUNT).fill(null));
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const hammersPcmRef = useRef<Float32Array | null>(null);
  // Reused per-frame typed arrays for the scene.
  const levelsRef = useRef(new Float32Array(VOICE_COUNT));
  const gainsArrRef = useRef(new Float32Array(VOICE_COUNT));

  const mixRef = useRef<MixState>({
    gains: [0.9, 0.9, 0.9, 0.9, 0.9],
    muted: [false, false, false, false, false],
    soloed: -1,
    selected: 0,
    playing: false,
    lastInteract: 0,
    demoActive: false,
    demoPhase: 0,
    demoNextAt: 0,
  });
  const rafRef = useRef(0);

  // ─── Audio context (built inside the Begin gesture) ────────────────────────
  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  // Compute the EFFECTIVE gain for a voice given solo/mute, then ramp it.
  // Solo/mute are instant because every buffer is always playing & looped; we
  // only adjust gains.
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
    masterRef.current.gain.setTargetAtTime(0.95, t, 0.04);
  }, []);

  // Build the playback graph from the 5 buffers and start them all in sync.
  const startPlayback = useCallback(() => {
    const ctx = ctxRef.current;
    const nmf = nmfRef.current;
    if (!ctx || !nmf) return;
    // Tear down any existing sources.
    for (let i = 0; i < VOICE_COUNT; i++) {
      try { voiceSrcRef.current[i]?.stop(); } catch { /* already stopped */ }
    }

    // Pad/trim all 5 PCM buffers to the SHORTEST length so they loop in sync.
    const pcms: Float32Array[] = [];
    // voice 0 = hammers (percussive); 1..4 = nmf components.
    // We stored hammers PCM on the nmf result via a side channel below.
    pcms.push(hammersPcmRef.current ?? new Float32Array(1));
    for (let k = 0; k < nmf.components.length; k++) pcms.push(nmf.components[k].pcm);
    let minLen = Infinity;
    for (const p of pcms) minLen = Math.min(minLen, p.length);
    if (!isFinite(minLen) || minLen < 1) minLen = 1;

    const mkBuffer = (pcm: Float32Array): AudioBuffer => {
      const b = ctx.createBuffer(1, minLen, nmf.sampleRate);
      b.getChannelData(0).set(pcm.subarray(0, minLen));
      return b;
    };

    const master = ctx.createGain();
    master.gain.value = 0.95;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    masterRef.current = master;

    const startAt = ctx.currentTime + 0.04;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const src = ctx.createBufferSource();
      src.buffer = mkBuffer(pcms[i]);
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0; // applyMix ramps to target.
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

  const markInteract = useCallback(() => {
    mixRef.current.lastInteract = performance.now();
    mixRef.current.demoActive = false;
  }, []);

  // ─── Load → HPSS → NMF ─────────────────────────────────────────────────────
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

    // 1. Try Karel's real piano; else synthesize a fallback.
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

    // 2. HPSS: split into harmonic (strings) + percussive (hammers).
    let hpss;
    try {
      hpss = await decompose(buffer, (frac, label) => {
        setProgress(frac * 0.5); // first half of the bar is HPSS.
        setProgressLabel("HPSS · " + label);
      });
    } catch (e) {
      setPhase("error");
      setErrorMsg("HPSS failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    hammersPcmRef.current = hpss.percussive;

    // 3. Re-STFT the harmonic PCM to get fresh complex re/im/mag for NMF masking.
    setProgressLabel("NMF · re-analyzing strings");
    await new Promise((r) => setTimeout(r, 0));
    const hSpec = stft(hpss.harmonic);

    // 4. Register-seeded NMF on the harmonic magnitude spectrogram.
    try {
      const nmf = await runNmf(
        hSpec.mag,
        hSpec.re,
        hSpec.im,
        hSpec.frames,
        hSpec.bins,
        hpss.harmonic.length,
        (frac, label) => {
          setProgress(0.5 + frac * 0.5); // second half of the bar is NMF.
          setProgressLabel("NMF · " + label);
        },
      );
      nmfRef.current = nmf;
    } catch (e) {
      setPhase("error");
      setErrorMsg("NMF failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    // 5. Upload the 5 voice spectral profiles to the prism scene.
    const scene = sceneRef.current;
    const nmf = nmfRef.current;
    if (scene && nmf) {
      const bins = nmf.bins;
      // Hammer spectrum: average the percussive spectrogram over time.
      const hammerProfile = new Float32Array(bins);
      for (let f = 0; f < hpss.specFrames; f++) {
        for (let b = 0; b < hpss.specBins; b++) {
          hammerProfile[b] += hpss.percussiveSpec[f * hpss.specBins + b];
        }
      }
      const profiles: Float32Array[] = [hammerProfile];
      for (const c of nmf.components) profiles.push(c.basis);
      scene.setProfiles(profiles, bins);
    }

    setPhase("ready");
    // Arm the auto-demo soon (cycles which voice is soloed).
    mixRef.current.lastInteract = performance.now() - 5000;
    mixRef.current.demoActive = false;
    mixRef.current.demoPhase = 0;
    mixRef.current.demoNextAt = 0;
    startPlayback();
  }, [phase, ensureContext, startPlayback]);

  // ─── Prism scene init (idle animation starts immediately on mount) ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: PrismScene;
    try {
      scene = createPrismScene(canvas);
    } catch (e) {
      setErrorMsg("Visual backend failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    sceneRef.current = scene;
    setBackend(scene.backend);
    // Seed flat placeholder profiles so the idle prism has structure pre-load.
    const placeholder: Float32Array[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      const p = new Float32Array(64);
      for (let x = 0; x < 64; x++) p[x] = 0.4 + 0.6 * Math.abs(Math.sin((x / 64) * Math.PI * (i + 1)));
      placeholder.push(p);
    }
    scene.setProfiles(placeholder, 64);

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
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const scene = sceneRef.current;
      const m = mixRef.current;
      const now = performance.now();
      const levels = levelsRef.current;
      const gainsArr = gainsArrRef.current;

      // Auto-demo: ~2.5s idle → cycle which voice is soloed (real interaction
      // preempts instantly via markInteract resetting lastInteract).
      if (phase === "ready") {
        const idle = now - m.lastInteract;
        if (!m.demoActive && idle > 2500) {
          m.demoActive = true;
          m.demoPhase = 0;
          m.demoNextAt = now;
        }
        if (m.demoActive && idle > 2500) {
          if (now >= m.demoNextAt) {
            m.soloed = m.demoPhase % VOICE_COUNT;
            m.demoPhase++;
            m.demoNextAt = now + 1600;
            applyMix();
          }
        }
      }

      // Per-voice live level from analysers.
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
          const rms = Math.sqrt(sum / aBuf.length);
          levels[i] = Math.min(1, rms * 3.2);
        } else {
          // Idle shimmer so a silent glance still reads as alive.
          levels[i] = 0.25 + 0.2 * Math.abs(Math.sin(now * 0.001 + i * 0.9));
        }
        // Effective gain (after solo/mute) for the visual dim/glow.
        let g = m.gains[i];
        if (m.muted[i]) g = 0;
        if (m.soloed >= 0 && m.soloed !== i) g = 0;
        gainsArr[i] = Math.min(1, g);
      }

      if (scene) scene.render(levels, gainsArr, m.soloed, now * 0.001);

      // Throttle the React readout to ~10fps.
      if (now - uiTick > 100) {
        uiTick = now;
        setUi({
          gains: [...m.gains],
          muted: [...m.muted],
          soloed: m.soloed,
          selected: m.selected,
          playing: m.playing,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, applyMix]);

  // ─── Voice actions ─────────────────────────────────────────────────────────
  const soloVoice = useCallback((i: number) => {
    const m = mixRef.current;
    m.soloed = m.soloed === i ? -1 : i; // toggle.
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

  const setVoiceGain = useCallback((i: number, v: number) => {
    mixRef.current.gains[i] = v;
    mixRef.current.selected = i;
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

  // ─── Keyboard control (primary, off-glass) ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "ready") return;
      const m = mixRef.current;
      let handled = true;
      switch (e.key) {
        case "1": case "2": case "3": case "4": case "5": {
          const idx = parseInt(e.key, 10) - 1;
          m.soloed = m.soloed === idx ? -1 : idx;
          m.selected = idx;
          break;
        }
        case "0":
          m.soloed = -1;
          for (let i = 0; i < VOICE_COUNT; i++) m.muted[i] = false;
          break;
        case "m": case "M":
          m.muted[m.selected] = !m.muted[m.selected];
          break;
        case "ArrowLeft":
          m.selected = (m.selected - 1 + VOICE_COUNT) % VOICE_COUNT;
          break;
        case "ArrowRight":
          m.selected = (m.selected + 1) % VOICE_COUNT;
          break;
        case "ArrowUp":
          m.gains[m.selected] = Math.min(1.4, m.gains[m.selected] + 0.06);
          break;
        case "ArrowDown":
          m.gains[m.selected] = Math.max(0, m.gains[m.selected] - 0.06);
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
  }, [phase, applyMix, markInteract, togglePlay]);

  // ─── Device tilt availability ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("DeviceOrientationEvent" in window) setTiltAvailable(true);
  }, []);

  // Tilt = "spectral spotlight": lean left/right to SELECT + solo a voice.
  const enableTilt = useCallback(async () => {
    markInteract();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setSensorMsg("Tilt permission denied — keyboard control still works.");
          return;
        }
      } catch {
        setSensorMsg("Tilt unavailable — keyboard control still works.");
        return;
      }
    }
    const onTilt = (ev: DeviceOrientationEvent) => {
      const gamma = ev.gamma ?? 0; // -90..90 left/right tilt.
      const frac = Math.min(0.999, Math.max(0, (gamma + 45) / 90));
      const idx = Math.floor(frac * VOICE_COUNT);
      const m = mixRef.current;
      m.selected = idx;
      m.soloed = idx; // spotlight that voice.
      markInteract();
      applyMix();
    };
    window.addEventListener("deviceorientation", onTilt);
    setTiltOn(true);
    setSensorMsg(null);
  }, [markInteract, applyMix]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06080c] text-foreground">
      {/* WebGL2 / Canvas2D prism */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Backend badge */}
      {backend && (
        <span className="absolute left-4 top-4 z-20 rounded-md bg-black/40 px-3 py-1.5 font-mono text-sm text-muted-foreground">
          {backend === "webgl2" ? "WebGL2" : "Canvas2D"}
        </span>
      )}

      {/* Design-notes link (corner) */}
      <a
        href="/dream/630-piano-refract/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes ↗
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Piano Refract
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Refract Karel&apos;s solo piano through a prism — split it into sustained
            strings vs. hammer attacks, then fan the strings into four pitched
            register voices you can solo, mute, and re-mix.
          </p>

          {sourceKind && (
            <p className="mt-2 font-mono text-sm">
              source:{" "}
              <span className={sourceKind === "piano" ? "text-violet-300/90" : "text-violet-300/90"}>
                {sourceKind === "piano" ? "Karel's piano (real recording)" : "synthesized piano — recording unavailable"}
              </span>
            </p>
          )}

          {errorMsg && <p className="mt-2 text-base text-violet-300/90">{errorMsg}</p>}
          {sensorMsg && <p className="mt-2 text-base text-violet-300">{sensorMsg}</p>}
        </header>

        {/* Center: Begin / progress */}
        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void load()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Begin · refract Karel&apos;s piano
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
              onClick={() => { setPhase("idle"); }}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Try again
            </button>
          )}
        </section>

        {/* Footer: controls */}
        {phase === "ready" && (
          <footer className="flex flex-col gap-4">
            {/* Keyboard map (primary) */}
            <div className="font-mono text-sm text-muted-foreground">
              <span className="text-foreground">keyboard (primary):</span>{" "}
              <kbd className="text-foreground">1</kbd>–<kbd className="text-foreground">5</kbd> solo ·{" "}
              <kbd className="text-foreground">0</kbd> reset ·{" "}
              <kbd className="text-foreground">m</kbd> mute selected ·{" "}
              <kbd className="text-foreground">←/→</kbd> select ·{" "}
              <kbd className="text-foreground">↑/↓</kbd> gain ·{" "}
              <kbd className="text-foreground">space</kbd> play/pause
              {!ui.playing && <span className="ml-2 text-violet-300/90">⏸ paused</span>}
            </div>

            {/* Five voice rows */}
            <div className="flex flex-col gap-2 md:max-w-2xl">
              {VOICE_LABELS.map((label, i) => {
                const isSelected = ui.selected === i;
                const isSoloed = ui.soloed === i;
                const isMuted = ui.muted[i];
                const dimmed = ui.soloed >= 0 && ui.soloed !== i;
                return (
                  <div
                    key={label}
                    className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${
                      isSelected ? "border-border bg-muted" : "border-border bg-black/30"
                    } ${dimmed ? "opacity-60" : "opacity-100"}`}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: cssColor(i) }}
                    />
                    <span className="w-24 font-mono text-base text-foreground">
                      {i + 1}. {label}
                    </span>
                    <button
                      onClick={() => soloVoice(i)}
                      className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
                        isSoloed ? "bg-muted text-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {isSoloed ? "soloed" : "solo"}
                    </button>
                    <button
                      onClick={() => muteVoice(i)}
                      className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
                        isMuted ? "bg-violet-500/30 text-violet-100" : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {isMuted ? "muted" : "mute"}
                    </button>
                    <label className="flex flex-1 items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">gain</span>
                      <input
                        type="range" min={0} max={1.4} step={0.01} value={ui.gains[i]}
                        onChange={(e) => setVoiceGain(i, parseFloat(e.target.value))}
                        className="min-w-[120px] flex-1"
                        style={{ accentColor: cssColor(i) }}
                      />
                      <span className="w-10 text-right font-mono text-sm text-muted-foreground">
                        {ui.gains[i].toFixed(2)}
                      </span>
                    </label>
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
              {tiltAvailable && !tiltOn && (
                <button
                  onClick={() => void enableTilt()}
                  className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
                >
                  Enable tilt spotlight (mobile)
                </button>
              )}
              {tiltOn && (
                <span className="font-mono text-sm text-violet-300/90">
                  tilt active — lean left/right to spotlight a voice
                </span>
              )}
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
