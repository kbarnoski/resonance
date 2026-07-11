"use client";

// 606-piano-vivisection — take Karel's OWN recorded piano apart into the singing
// strings (harmonic) vs. the hammer / key noise (percussive) via median-filter
// HPSS, and remix the two layers live. Off-glass control (keyboard / device
// tilt). WebGL2 spectral "vivisection" field.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioSourceKind,
  fetchPianoBuffer,
  renderFallbackBuffer,
} from "./audio";
import { decompose, HpssResult } from "./hpss";
import { createScene, GlScene } from "./gl";

type Phase = "idle" | "loading" | "ready" | "error";

// Live mixer state held in a ref so the audio/render loops read it without
// re-rendering React on every frame.
interface MixState {
  balance: number; // 0 = strings only, 1 = hammers only
  gain: number; // overall 0..1.4
  muteH: boolean;
  muteP: boolean;
  playing: boolean;
  // Auto-demo bookkeeping.
  lastInteract: number;
  demoActive: boolean;
}

export default function PianoVivisectionPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  // Mirror of mix state for the on-screen readout (updated ~10fps).
  const [ui, setUi] = useState({ balance: 0.5, gain: 0.9, muteH: false, muteP: false, playing: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<GlScene | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const hpssRef = useRef<HpssResult | null>(null);

  // Audio graph nodes (rebuilt per play).
  const masterRef = useRef<GainNode | null>(null);
  const harmGainRef = useRef<GainNode | null>(null);
  const percGainRef = useRef<GainNode | null>(null);
  const harmSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const percSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const loopDurRef = useRef(1);

  const mixRef = useRef<MixState>({
    balance: 0.5,
    gain: 0.9,
    muteH: false,
    muteP: false,
    playing: false,
    lastInteract: 0,
    demoActive: false,
  });
  const rafRef = useRef(0);

  // ─── Audio context (built inside a user gesture) ───────────────────────────
  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  // Apply the live mix to the gain nodes (called whenever mix changes / per tick).
  const applyMix = useCallback(() => {
    const m = mixRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !masterRef.current || !harmGainRef.current || !percGainRef.current) return;
    const t = ctx.currentTime;
    // Equal-power-ish crossfade from balance.
    const wH = Math.cos((m.balance * Math.PI) / 2);
    const wP = Math.sin((m.balance * Math.PI) / 2);
    const hTarget = m.muteH ? 0 : wH;
    const pTarget = m.muteP ? 0 : wP;
    harmGainRef.current.gain.setTargetAtTime(hTarget, t, 0.03);
    percGainRef.current.gain.setTargetAtTime(pTarget, t, 0.03);
    masterRef.current.gain.setTargetAtTime(m.gain, t, 0.04);
  }, []);

  // Build the playback graph from the decomposed buffers and start looping.
  const startPlayback = useCallback(() => {
    const ctx = ctxRef.current;
    const res = hpssRef.current;
    if (!ctx || !res) return;
    // Tear down any existing sources.
    try { harmSrcRef.current?.stop(); } catch { /* already stopped */ }
    try { percSrcRef.current?.stop(); } catch { /* already stopped */ }

    const mkBuffer = (pcm: Float32Array): AudioBuffer => {
      const b = ctx.createBuffer(1, pcm.length, res.sampleRate);
      b.getChannelData(0).set(pcm);
      return b;
    };
    const harmBuf = mkBuffer(res.harmonic);
    const percBuf = mkBuffer(res.percussive);
    loopDurRef.current = harmBuf.duration;

    const harmSrc = ctx.createBufferSource();
    harmSrc.buffer = harmBuf;
    harmSrc.loop = true;
    const percSrc = ctx.createBufferSource();
    percSrc.buffer = percBuf;
    percSrc.loop = true;

    const harmGain = ctx.createGain();
    const percGain = ctx.createGain();
    const master = ctx.createGain();
    master.gain.value = mixRef.current.gain;

    // Master chain: gain -> gentle limiter -> destination.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;

    harmSrc.connect(harmGain).connect(master);
    percSrc.connect(percGain).connect(master);
    master.connect(comp).connect(ctx.destination);

    harmGainRef.current = harmGain;
    percGainRef.current = percGain;
    masterRef.current = master;
    harmSrcRef.current = harmSrc;
    percSrcRef.current = percSrc;

    const startAt = ctx.currentTime + 0.02;
    harmSrc.start(startAt);
    percSrc.start(startAt);
    startTimeRef.current = startAt;
    mixRef.current.playing = true;
    applyMix();
  }, [applyMix]);

  const stopPlayback = useCallback(() => {
    try { harmSrcRef.current?.stop(); } catch { /* already stopped */ }
    try { percSrcRef.current?.stop(); } catch { /* already stopped */ }
    harmSrcRef.current = null;
    percSrcRef.current = null;
    mixRef.current.playing = false;
  }, []);

  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (mixRef.current.playing) stopPlayback();
    else startPlayback();
  }, [startPlayback, stopPlayback]);

  // Mark real user interaction (preempts auto-demo).
  const markInteract = useCallback(() => {
    mixRef.current.lastInteract = performance.now();
    mixRef.current.demoActive = false;
  }, []);

  // ─── Load + decompose ──────────────────────────────────────────────────────
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
      setErrorMsg("Could not reach Karel's recording — using a synthesized piano fallback.");
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

    // 2. Run HPSS (chunked, with progress).
    try {
      const res = await decompose(buffer, (frac, label) => {
        setProgress(frac);
        setProgressLabel(label);
      });
      hpssRef.current = res;
    } catch (e) {
      setPhase("error");
      setErrorMsg("Decomposition failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    // 3. Upload spectrograms to the WebGL scene.
    const scene = sceneRef.current;
    if (scene && hpssRef.current) {
      scene.setSpectrograms(
        hpssRef.current.harmonicSpec,
        hpssRef.current.percussiveSpec,
        hpssRef.current.specFrames,
        hpssRef.current.specBins,
      );
    }

    setPhase("ready");
    // Arm the auto-demo: start playback muted-in and let the demo sweep run.
    mixRef.current.lastInteract = performance.now() - 5000; // allow demo soon
    mixRef.current.demoActive = false;
    startPlayback();
  }, [phase, ensureContext, startPlayback]);

  // ─── WebGL scene init ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      sceneRef.current = createScene(canvas);
    } catch (e) {
      setWebglError(
        "WebGL2 unavailable: " + (e instanceof Error ? e.message : String(e)) +
        " — this instrument needs WebGL2.",
      );
      return;
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
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const scene = sceneRef.current;
      const ctx = ctxRef.current;
      const m = mixRef.current;
      const now = performance.now();

      // Auto-demo: ~2.5s after load with no interaction, gently sweep balance.
      if (phase === "ready") {
        const idle = now - m.lastInteract;
        if (!m.demoActive && idle > 2500) {
          m.demoActive = true;
          if (!m.playing) startPlayback();
        }
        if (m.demoActive && idle > 2500) {
          // Slow triangle/sine sweep across the full balance range.
          const sweep = 0.5 + 0.5 * Math.sin((now - m.lastInteract) * 0.00045);
          m.balance = sweep;
          applyMix();
        }
      }

      // Playhead from audio clock.
      let playhead = 0;
      if (ctx && m.playing) {
        const elapsed = (ctx.currentTime - startTimeRef.current);
        playhead = (elapsed % loopDurRef.current) / loopDurRef.current;
        if (playhead < 0) playhead = 0;
      }

      if (scene) scene.render(m.balance, playhead, now * 0.001);

      // Throttle the React readout to ~10fps.
      if (now - uiTick > 100) {
        uiTick = now;
        setUi({
          balance: m.balance,
          gain: m.gain,
          muteH: m.muteH,
          muteP: m.muteP,
          playing: m.playing,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, applyMix, startPlayback]);

  // ─── Keyboard control (primary, off-glass) ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "ready") return;
      const m = mixRef.current;
      let handled = true;
      switch (e.key) {
        case "1":
          m.muteH = !m.muteH;
          break;
        case "2":
          m.muteP = !m.muteP;
          break;
        case "ArrowLeft":
          m.balance = Math.max(0, m.balance - 0.05);
          break;
        case "ArrowRight":
          m.balance = Math.min(1, m.balance + 0.05);
          break;
        case "ArrowUp":
          m.gain = Math.min(1.4, m.gain + 0.06);
          break;
        case "ArrowDown":
          m.gain = Math.max(0, m.gain - 0.06);
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

  // ─── Device tilt (mobile, off-glass) ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("DeviceOrientationEvent" in window) setTiltAvailable(true);
  }, []);

  const enableTilt = useCallback(async () => {
    markInteract();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setErrorMsg("Tilt permission denied — keyboard control still works.");
          return;
        }
      } catch {
        setErrorMsg("Tilt unavailable — keyboard control still works.");
        return;
      }
    }
    const onTilt = (ev: DeviceOrientationEvent) => {
      const gamma = ev.gamma ?? 0; // left/right tilt, -90..90
      const b = Math.min(1, Math.max(0, (gamma + 45) / 90));
      mixRef.current.balance = b;
      markInteract();
      applyMix();
    };
    window.addEventListener("deviceorientation", onTilt);
    setTiltOn(true);
  }, [markInteract, applyMix]);

  // Secondary fallback faders.
  const onFaderBalance = useCallback((v: number) => {
    mixRef.current.balance = v;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);
  const onFaderGain = useCallback((v: number) => {
    mixRef.current.gain = v;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);
  const toggleMuteH = useCallback(() => {
    mixRef.current.muteH = !mixRef.current.muteH;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);
  const toggleMuteP = useCallback(() => {
    mixRef.current.muteP = !mixRef.current.muteP;
    markInteract();
    applyMix();
  }, [markInteract, applyMix]);

  const balancePct = Math.round(ui.balance * 100);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06080c] text-foreground">
      {/* WebGL2 vivisection field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Design-notes link (corner) */}
      <a
        href="/dream/606-piano-vivisection/README.md"
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
            Piano Vivisection
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Take Karel&apos;s own recorded piano apart into the singing strings and the
            hammer / key noise — then remix the two layers live.
          </p>

          {sourceKind && (
            <p className="mt-2 font-mono text-sm">
              source:{" "}
              <span className={sourceKind === "piano" ? "text-violet-300/90" : "text-violet-300/90"}>
                {sourceKind === "piano" ? "Karel's piano (real recording)" : "synthesized fallback"}
              </span>
            </p>
          )}

          {webglError && <p className="mt-2 text-base text-violet-300">{webglError}</p>}
          {errorMsg && <p className="mt-2 text-base text-violet-300">{errorMsg}</p>}
        </header>

        {/* Center: load / progress */}
        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void load()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Load Karel&apos;s piano · Start
            </button>
          )}

          {phase === "loading" && (
            <div className="w-full max-w-md">
              <p className="font-mono text-sm text-muted-foreground">
                dissecting… {progressLabel} ({Math.round(progress * 100)}%)
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-violet-400 to-violet-400 transition-[width] duration-150"
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
            {/* Live readout */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm text-muted-foreground">
              <span>
                balance{" "}
                <span className="text-violet-300">strings {100 - balancePct}%</span>
                {" / "}
                <span className="text-violet-300">hammers {balancePct}%</span>
              </span>
              <span>gain {ui.gain.toFixed(2)}</span>
              <span className={ui.muteH ? "text-violet-300" : "text-violet-300"}>
                strings {ui.muteH ? "MUTED" : "on"}
              </span>
              <span className={ui.muteP ? "text-violet-300" : "text-violet-300"}>
                hammers {ui.muteP ? "MUTED" : "on"}
              </span>
              <span>{ui.playing ? "▶ playing (looping)" : "⏸ paused"}</span>
            </div>

            {/* Keyboard map (primary) */}
            <div className="font-mono text-sm text-muted-foreground">
              <span className="text-foreground">keyboard (primary):</span>{" "}
              <kbd className="text-violet-200">1</kbd> strings ·{" "}
              <kbd className="text-violet-200">2</kbd> hammers ·{" "}
              <kbd>←/→</kbd> balance · <kbd>↑/↓</kbd> gain ·{" "}
              <kbd>space</kbd> play/pause
            </div>

            {/* Tilt (mobile) */}
            {tiltAvailable && !tiltOn && (
              <button
                onClick={() => void enableTilt()}
                className="min-h-[44px] w-fit rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                Enable device tilt → balance (mobile)
              </button>
            )}
            {tiltOn && (
              <p className="font-mono text-sm text-violet-300/90">tilt active — lean left/right to morph the mix</p>
            )}

            {/* Secondary on-screen faders */}
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer text-muted-foreground">on-screen faders (secondary fallback)</summary>
              <div className="mt-3 flex flex-col gap-3 md:max-w-md">
                <label className="flex items-center gap-3">
                  <span className="w-20 font-mono text-violet-300">strings</span>
                  <input
                    type="range" min={0} max={1} step={0.01} value={ui.balance}
                    onChange={(e) => onFaderBalance(parseFloat(e.target.value))}
                    className="flex-1 accent-violet-400"
                  />
                  <span className="w-20 text-right font-mono text-violet-300">hammers</span>
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-20 font-mono">gain</span>
                  <input
                    type="range" min={0} max={1.4} step={0.01} value={ui.gain}
                    onChange={(e) => onFaderGain(parseFloat(e.target.value))}
                    className="flex-1 accent-violet-400"
                  />
                  <span className="w-20" />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={toggleMuteH}
                    className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${ui.muteH ? "bg-violet-500/25 text-violet-100" : "bg-violet-500/15 text-violet-100"}`}
                  >
                    {ui.muteH ? "unmute strings" : "mute strings"}
                  </button>
                  <button
                    onClick={toggleMuteP}
                    className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${ui.muteP ? "bg-violet-500/25 text-violet-100" : "bg-violet-500/15 text-violet-100"}`}
                  >
                    {ui.muteP ? "unmute hammers" : "mute hammers"}
                  </button>
                  <button
                    onClick={() => { markInteract(); togglePlay(); }}
                    className="min-h-[44px] rounded-md bg-muted px-4 py-2.5 text-base text-foreground"
                  >
                    {ui.playing ? "pause" : "play"}
                  </button>
                </div>
              </div>
            </details>
          </footer>
        )}
      </div>
    </main>
  );
}
