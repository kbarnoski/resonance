"use client";

// 1300-carrier-bloom — "Carrier Bloom".
// Karel's own recorded piano is the CARRIER WAVE for a drug-free psychedelic
// melt you push your hands into. His real solo piano (Welcome Home) is FFT'd
// every frame and fed into the Bressloff–Cowan log-polar form-constant engine:
// plane-wave stripes / a hex lattice in cortical space, warped back to the
// screen by exp(), so one shader breathes tunnels → spirals → honeycombs. An
// entropy arc (REBUS "priors relax") reorganizes the geometry over the piece,
// and pointer-drag / device-tilt PERTURBATION steers the trip — you feel like
// you're playing it, not watching it. A single-performer echo of Refik Anadol's
// DATALAND, but the "data" is one man's piano.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioSourceKind,
  Bands,
  computeBands,
  fetchPianoBuffer,
  renderFallbackBuffer,
} from "./audio";
import { createMeltScene, MeltScene } from "./gl";
import {
  entropyNoiseOctaves,
  entropySymmetryJitter,
  entropyToForm,
  makeEntropy,
  stepEntropy,
  EntropyState,
} from "./entropy";
import { FORM_LABEL } from "../_shared/psych/logpolar";
import { createSafeFlicker, SafeFlicker } from "../_shared/psych/safeFlicker";
import { startShepard, ShepardEngine } from "../_shared/psych/shepard";

type Phase = "idle" | "loading" | "ready" | "error";

// Live perturbation state (mutated by DOM listeners, read by the render loop).
interface Pert {
  cxTarget: number;
  cyTarget: number;
  cx: number;
  cy: number;
  active: boolean;
  energy: number; // 0..1 push from drag/tilt speed (decays)
  formBias: number; // -1 (order/tunnel) .. +1 (complex/honeycomb)
  lastX: number;
  lastY: number;
  autoPhase: number; // idle drift so a hands-off view still melts
}

export default function CarrierBloomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [backend, setBackend] = useState<"webgl2" | "canvas2d" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);
  const [ui, setUi] = useState({
    entropy: 0.05,
    form: "Tunnels / funnels",
    bass: 0,
    mid: 0,
    high: 0,
    push: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<MeltScene | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const compRef = useRef<DynamicsCompressorNode | null>(null);
  const shepardRef = useRef<ShepardEngine | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const playingRef = useRef(false);

  const entropyRef = useRef<EntropyState>(makeEntropy());
  const flickerRef = useRef<SafeFlicker | null>(null);
  const pertRef = useRef<Pert>({
    cxTarget: 0,
    cyTarget: 0,
    cx: 0,
    cy: 0,
    active: false,
    energy: 0,
    formBias: 0,
    lastX: 0,
    lastY: 0,
    autoPhase: 0,
  });
  const bloomRef = useRef(0);
  const prevTotalRef = useRef(0);
  const bandSmoothRef = useRef({ bass: 0, mid: 0, high: 0 });
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  // ─── Audio context (built inside the Begin gesture) ────────────────────────
  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  // ─── Load Karel's piano (or fallback) and start the carrier. ───────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "ready") return;
    setPhase("loading");
    setErrorMsg(null);

    const ctx = ensureContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* the Begin gesture should cover this */
      }
    }

    // 1. Try Karel's real piano; else synthesize a solo-piano-like carrier.
    let buffer: AudioBuffer | null = null;
    let kind: AudioSourceKind = "fallback";
    try {
      buffer = await fetchPianoBuffer(ctx);
      if (buffer) kind = "piano";
    } catch {
      buffer = null;
    }
    if (!buffer) {
      try {
        buffer = await renderFallbackBuffer(ctx.sampleRate);
        kind = "fallback";
        setErrorMsg("Recording unavailable — using a synthesized piano carrier.");
      } catch {
        setPhase("error");
        setErrorMsg("Audio failed — your browser may not support OfflineAudioContext.");
        return;
      }
    }
    setSourceKind(kind);

    // 2. Playback graph: source → analyser → master(≤0.3, fade-in) → limiter → out
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 1.2);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    src.connect(analyser);
    analyser.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    src.start();

    // 3. A faint Shepard undertow beneath the piano, scaled by push energy.
    const shepard = startShepard(ctx, master, {
      peakGain: 0.1,
      driveRate: 0.14,
      dir: 1,
    });

    srcRef.current = src;
    analyserRef.current = analyser;
    masterRef.current = master;
    compRef.current = comp;
    shepardRef.current = shepard;
    freqBufRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    playingRef.current = true;

    // Reset the entropy arc so the come-up starts now.
    entropyRef.current = makeEntropy();
    setPhase("ready");
  }, [phase, ensureContext]);

  // ─── Scene init + the always-on render loop ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: MeltScene;
    try {
      scene = createMeltScene(canvas);
    } catch (e) {
      setErrorMsg("Visual backend failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    sceneRef.current = scene;
    setBackend(scene.backend);
    if (!flickerRef.current) flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 1.4 });

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    let uiTick = 0;
    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const s = sceneRef.current;
      if (!s) return;
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      lastTsRef.current = ts;
      const tSec = ts / 1000;

      // ── Read the carrier's FFT (or a gentle idle drift pre-Begin). ──
      let bands: Bands;
      const analyser = analyserRef.current;
      const buf = freqBufRef.current;
      if (playingRef.current && analyser && buf) {
        analyser.getByteFrequencyData(buf);
        const r = computeBands(buf, ctxRef.current?.sampleRate ?? 44100, prevTotalRef.current);
        bands = r.bands;
        prevTotalRef.current = r.total;
      } else {
        // Pre-Begin: a slow synthetic breath so the melt reads as alive.
        bands = {
          bass: 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(tSec * 0.3)),
          mid: 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(tSec * 0.5 + 1)),
          high: 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(tSec * 0.9 + 2)),
          onset: 0,
        };
      }
      // Smooth the bands a touch beyond the analyser's own smoothing.
      const bs = bandSmoothRef.current;
      const bk = 1 - Math.exp(-dt / 0.08);
      bs.bass += (bands.bass - bs.bass) * bk;
      bs.mid += (bands.mid - bs.mid) * bk;
      bs.high += (bands.high - bs.high) * bk;

      // Onset → decaying center-out bloom pulse.
      bloomRef.current *= Math.exp(-dt / 0.4);
      if (bands.onset > bloomRef.current) bloomRef.current = bands.onset;

      // ── Perturbation: smooth the warp center, decay push energy. ──
      const p = pertRef.current;
      p.energy *= Math.exp(-dt / 1.4);
      if (!p.active) {
        // Hands off: a slow Lissajous drift so a headless view still melts.
        p.autoPhase += dt * 0.2;
        p.cxTarget = 0.22 * Math.sin(p.autoPhase);
        p.cyTarget = 0.18 * Math.sin(p.autoPhase * 0.73 + 1.3);
        p.formBias += (0 - p.formBias) * (1 - Math.exp(-dt / 2.5));
      }
      const ck = 1 - Math.exp(-dt / (p.active ? 0.12 : 0.6));
      p.cx += (p.cxTarget - p.cx) * ck;
      p.cy += (p.cyTarget - p.cy) * ck;

      // ── Entropy arc: pushed deeper by the player's energy. ──
      stepEntropy(entropyRef.current, dt, p.energy * 0.8);
      const e = entropyRef.current.value;
      const form = entropyToForm(e, p.formBias);
      const jitter = entropySymmetryJitter(e);
      const noiseOct = entropyNoiseOctaves(e);

      // Shepard undertow rides the push energy.
      if (shepardRef.current) {
        shepardRef.current.setDrive(p.energy);
        shepardRef.current.step(dt);
      }

      const flick = flickerRef.current ? flickerRef.current.value(tSec) : 1;

      s.render({
        time: tSec,
        bass: bs.bass,
        mid: bs.mid,
        high: bs.high,
        onset: bands.onset,
        bloom: bloomRef.current,
        wTunnel: form.tunnel,
        wSpiral: form.spiral,
        wHoney: form.honeycomb,
        entropy: e,
        jitter,
        flick,
        noiseOct,
        centerX: p.cx,
        centerY: p.cy,
      });

      // Throttle the React readout to ~10fps.
      if (ts - uiTick > 100) {
        uiTick = ts;
        const dom =
          form.honeycomb >= form.tunnel && form.honeycomb >= form.spiral
            ? FORM_LABEL.honeycomb
            : form.spiral >= form.tunnel
              ? FORM_LABEL.spiral
              : FORM_LABEL.tunnel;
        setUi({ entropy: e, form: dom, bass: bs.bass, mid: bs.mid, high: bs.high, push: p.energy });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ─── Pointer drag = push your hands into the melt. ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setFromClient = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = ((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      const p = pertRef.current;
      const speed = Math.hypot(nx - p.lastX, ny - p.lastY);
      p.energy = Math.min(1, p.energy + speed * 3.5);
      p.cxTarget = nx * aspect * 0.9;
      p.cyTarget = -ny * 0.9; // flip: screen-down → melt-up
      p.formBias = Math.max(-1, Math.min(1, -ny)); // top → honeycomb, bottom → tunnel
      p.lastX = nx;
      p.lastY = ny;
    };

    const onDown = (ev: PointerEvent) => {
      pertRef.current.active = true;
      const rect = canvas.getBoundingClientRect();
      pertRef.current.lastX = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pertRef.current.lastY = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      setFromClient(ev.clientX, ev.clientY);
      canvas.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      if (!pertRef.current.active) return;
      setFromClient(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      pertRef.current.active = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onUp);
    };
  }, []);

  // ─── Device tilt availability ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("DeviceOrientationEvent" in window) setTiltAvailable(true);
  }, []);

  const enableTilt = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setSensorMsg("Tilt permission denied — drag with a pointer instead.");
          return;
        }
      } catch {
        setSensorMsg("Tilt unavailable — drag with a pointer instead.");
        return;
      }
    }
    const onTilt = (ev: DeviceOrientationEvent) => {
      const gamma = ev.gamma ?? 0; // -90..90 left/right
      const beta = ev.beta ?? 0; // -180..180 front/back
      const p = pertRef.current;
      p.active = true;
      const nx = Math.max(-1, Math.min(1, gamma / 45));
      const ny = Math.max(-1, Math.min(1, (beta - 45) / 45));
      const speed = Math.hypot(nx - p.lastX, ny - p.lastY);
      p.energy = Math.min(1, p.energy + speed * 2.5);
      p.cxTarget = nx * 0.9;
      p.cyTarget = -ny * 0.9;
      p.formBias = Math.max(-1, Math.min(1, -ny));
      p.lastX = nx;
      p.lastY = ny;
    };
    window.addEventListener("deviceorientation", onTilt);
    setTiltOn(true);
    setSensorMsg(null);
  }, []);

  // ─── Flicker toggle (opt-in, SafeFlicker-gated, instant kill). ─────────────
  const toggleFlicker = useCallback(() => {
    const f = flickerRef.current;
    if (!f) return;
    if (f.enabled) {
      f.kill();
      setFlickerOn(false);
    } else {
      f.enable();
      setFlickerOn(true);
    }
  }, []);

  // ─── Full teardown on unmount. ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        shepardRef.current?.stop();
      } catch {
        /* ctx may be closing */
      }
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      try {
        srcRef.current?.disconnect();
        analyserRef.current?.disconnect();
        masterRef.current?.disconnect();
        compRef.current?.disconnect();
      } catch {
        /* nodes may be gone */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
      ctxRef.current = null;
    };
  }, []);

  const pct = (x: number) => Math.round(x * 100);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04050a] text-foreground">
      {/* WebGL2 / Canvas2D melt (also the drag surface) */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* Backend badge */}
      {backend && (
        <span className="absolute left-4 top-4 z-20 rounded-md bg-black/45 px-3 py-1.5 font-mono text-sm text-muted-foreground">
          {backend === "webgl2" ? "WebGL2" : "Canvas2D"}
        </span>
      )}
      {backend === "canvas2d" && (
        <span className="absolute left-4 top-14 z-20 rounded-md bg-black/45 px-3 py-1.5 font-mono text-sm text-violet-300">
          WebGL2 unavailable — Canvas2D fallback
        </span>
      )}

      <a
        href="/dream/1300-carrier-bloom/README.md"
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
            Carrier Bloom
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Karel&apos;s own recorded piano is the carrier wave for a drug-free
            psychedelic melt — a log-polar form-constant field driven by his real{" "}
            <span className="text-violet-300">Welcome Home</span> piano. Drag your
            hands into it (or tilt on mobile) to steer the trip; the geometry
            reorganizes itself, tunnels to honeycombs, as the piece unfolds.
          </p>

          {sourceKind && (
            <p className="mt-3 font-mono text-sm">
              source:{" "}
              <span
                className={
                  sourceKind === "piano"
                    ? "rounded bg-violet-500/15 px-2 py-0.5 text-violet-300"
                    : "rounded bg-violet-500/15 px-2 py-0.5 text-violet-300"
                }
              >
                {sourceKind === "piano" ? "real piano" : "fallback (synth carrier)"}
              </span>
            </p>
          )}

          {errorMsg && <p className="mt-2 text-base text-violet-300">{errorMsg}</p>}
          {sensorMsg && <p className="mt-2 text-base text-violet-300">{sensorMsg}</p>}
        </header>

        {/* Center: Begin / loading */}
        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void begin()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Begin · bloom Karel&apos;s piano
            </button>
          )}
          {phase === "loading" && (
            <p className="font-mono text-base text-muted-foreground">loading the carrier…</p>
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

        {/* Footer: live readout + controls */}
        {phase === "ready" && (
          <footer className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-muted-foreground">
              <span>
                entropy arc <span className="text-violet-300">{pct(ui.entropy)}%</span>
              </span>
              <span>
                geometry <span className="text-foreground">{ui.form}</span>
              </span>
              <span>
                push <span className="text-violet-300">{pct(ui.push)}%</span>
              </span>
              <span className="text-muted-foreground">
                bass {pct(ui.bass)} · mid {pct(ui.mid)} · high {pct(ui.high)}
              </span>
            </div>

            <p className="max-w-2xl text-base text-muted-foreground">
              Drag anywhere on the field to push the warp center under your hand —
              faster drags deepen the trip and lift a Shepard undertow. Slide up for
              honeycomb, down for tunnels. Let go and it drifts on its own.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleFlicker}
                className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
                  flickerOn
                    ? "bg-muted text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {flickerOn ? "flicker on (≤3 Hz) — tap to kill" : "add gentle flicker (≤3 Hz)"}
              </button>
              {tiltAvailable && !tiltOn && (
                <button
                  onClick={() => void enableTilt()}
                  className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
                >
                  Enable tilt steering (mobile)
                </button>
              )}
              {tiltOn && (
                <span className="font-mono text-sm text-violet-300">
                  tilt active — lean to steer the melt
                </span>
              )}
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
