"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 23120-sever — REACH INTO THE PIANO AND PULL ITS RINGING APART FROM ITS HAMMERS.
//
//   THE ONE QUESTION: What if you could physically reach into Karel's piano and
//   pull its ringing RESONANCE apart from its hammer ATTACKS — separating one
//   recording into two living layers you re-balance and re-time with two hands?
//
//   At load we run median-filter harmonic/percussive source separation (HPSS —
//   Fitzgerald, DAFx 2010; the decomposition idea of D-Composer, arXiv:2610.22535)
//   ONCE, offline, on a real Karel take: STFT → time-median (harmonic) +
//   freq-median (percussive) → Wiener soft-masks → inverse STFT into two mono
//   AudioBuffers. Both loop in lockstep; the two-hand SPAN re-balances them and
//   drifts the hammer layer's timing, hand HEIGHT brightens the ringing. The split
//   is made visible as a GPGPU Gray-Scott reaction-diffusion field on raw WebGL2.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  COLLECTIONS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
} from "../_shared/cameraTracking";
import { runHpss, type HpssResult } from "./hpss";
import { createRenderer, type Renderer, type Injection } from "./gl";

const DEFAULT_TRACK = "8dafed88-4761-4dd3-a0f4-93f310441093"; // Welcome Home
const DEFAULT_TITLE =
  WELCOME_HOME_TRACKS.find((t) => t.id === DEFAULT_TRACK)?.title ?? "Welcome Home";

type Phase = "intro" | "separating" | "ready" | "error";
type TrackState = "two" | "one" | "pointer" | "lost" | "init";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface Controls {
  /** 0 = hands fused (original), 1 = hands fully apart (layers severed). */
  span: number;
  /** 0 bottom … 1 top → harmonic brightness. */
  height: number;
}

export default function SeverPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const harmSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const percSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const harmGainRef = useRef<GainNode | null>(null);
  const percGainRef = useRef<GainNode | null>(null);
  const harmLpRef = useRef<BiquadFilterNode | null>(null);
  const harmAnRef = useRef<AnalyserNode | null>(null);
  const percAnRef = useRef<AnalyserNode | null>(null);

  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<Awaited<ReturnType<typeof createHandTracker>> | null>(null);
  const trackerBusyRef = useRef(false);

  const controlsRef = useRef<Controls>({ span: 0, height: 0.5 });
  const smoothRef = useRef<Controls>({ span: 0, height: 0.5 });
  const pointerTimeRef = useRef(0);
  const lastDetectRef = useRef(0);
  const startPerfRef = useRef(0);
  const lastFrameRef = useRef(0);

  // onset detection state (percussive layer)
  const percBaseRef = useRef(0);
  const onsetCdRef = useRef(0);
  const rndRef = useRef(0x5e7e);

  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TITLE);
  const [glOk, setGlOk] = useState(true);
  const [status, setStatus] = useState<TrackState>("init");
  const [cameraOn, setCameraOn] = useState(false);
  const cameraOnRef = useRef(false);
  const [severPct, setSeverPct] = useState(0);
  const severThrottleRef = useRef(0);
  const { immersive, toggle } = useImmersive();

  // Read + decode + separate, then wire the playback graph and start.
  const start = useCallback(async () => {
    setError(null);
    setPhase("separating");
    setProgress(0);
    setProgressLabel("starting");

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      await ctx.resume();
    } catch {
      setError("Audio is unavailable in this browser.");
      setPhase("error");
      return;
    }
    ctxRef.current = ctx;

    let decoded;
    try {
      decoded = await loadRealTrackBuffer(ctx, trackId);
    } catch {
      setError(
        "Could not load Karel's recording (network or audio service). Please retry.",
      );
      setPhase("error");
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      return;
    }
    setTrackTitle(decoded.title);

    let hpss: HpssResult;
    try {
      hpss = await runHpss(ctx, decoded.buffer, (frac, label) => {
        setProgress(frac);
        setProgressLabel(label);
      });
    } catch {
      setError("The separation pass failed. Please retry.");
      setPhase("error");
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      return;
    }

    // Build the playback graph → safeMaster.
    const master = createSafeMaster(ctx);
    masterRef.current = master;

    const harmGain = ctx.createGain();
    const percGain = ctx.createGain();
    harmGain.gain.value = 0.9;
    percGain.gain.value = 0.85;

    const harmLp = ctx.createBiquadFilter();
    harmLp.type = "lowpass";
    harmLp.frequency.value = 4000;
    harmLp.Q.value = 0.5;

    const harmAn = ctx.createAnalyser();
    harmAn.fftSize = 1024;
    harmAn.smoothingTimeConstant = 0.7;
    const percAn = ctx.createAnalyser();
    percAn.fftSize = 1024;
    percAn.smoothingTimeConstant = 0.4;

    const harmSrc = ctx.createBufferSource();
    harmSrc.buffer = hpss.harmonic;
    harmSrc.loop = true;
    const percSrc = ctx.createBufferSource();
    percSrc.buffer = hpss.percussive;
    percSrc.loop = true;

    // harmonic: src → lowpass → gain → (analyser tap) → master
    harmSrc.connect(harmLp);
    harmLp.connect(harmGain);
    harmGain.connect(harmAn);
    harmGain.connect(master.input);
    // percussive: src → gain → (analyser tap) → master
    percSrc.connect(percGain);
    percGain.connect(percAn);
    percGain.connect(master.input);

    const t0 = ctx.currentTime + 0.08;
    harmSrc.start(t0, 0);
    percSrc.start(t0, 0);

    harmSrcRef.current = harmSrc;
    percSrcRef.current = percSrc;
    harmGainRef.current = harmGain;
    percGainRef.current = percGain;
    harmLpRef.current = harmLp;
    harmAnRef.current = harmAn;
    percAnRef.current = percAn;

    setPhase("ready");
  }, [trackId]);

  // Camera attempt — runs after ready. Pointer fallback is always live.
  useEffect(() => {
    if (phase !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const video = videoRef.current;
        if (!video) throw new Error("no video element");
        const stream = await startCamera(video);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const tracker = await createHandTracker(2);
        if (cancelled) {
          tracker.close();
          return;
        }
        trackerRef.current = tracker;
        cameraOnRef.current = true;
        setCameraOn(true);
        setStatus("lost");
      } catch {
        // No camera / permission denied — pointer fallback carries the piece.
        cameraOnRef.current = false;
        setCameraOn(false);
        setStatus("pointer");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Main render + control loop.
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
    setGlOk(renderer !== null);
    if (!renderer) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    const onResize = () => {
      const r = rendererRef.current;
      const c = canvasRef.current;
      if (r && c) {
        r.resize(c.clientWidth, c.clientHeight, Math.min(2, window.devicePixelRatio || 1));
      }
    };
    window.addEventListener("resize", onResize);

    startPerfRef.current = performance.now();
    lastFrameRef.current = startPerfRef.current;

    const harmBuf = new Float32Array(1024);
    const percBuf = new Float32Array(1024);

    const rnd = () => {
      rndRef.current = (rndRef.current * 1664525 + 1013904223) >>> 0;
      return rndRef.current / 4294967296;
    };

    const rms = (an: AnalyserNode | null, buf: Float32Array<ArrayBuffer>): number => {
      if (!an) return 0;
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };

    const runDetect = (now: number) => {
      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (!tracker || !video || video.readyState < 2) return;
      if (trackerBusyRef.current) return;
      if (now - lastDetectRef.current < 60) return;
      lastDetectRef.current = now;
      trackerBusyRef.current = true;
      try {
        const res = tracker.detectForVideo(video, now);
        const hands = res.landmarks ?? [];
        if (hands.length >= 2) {
          const a = computeHandFeatures(hands[0]);
          const b = computeHandFeatures(hands[1]);
          const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy); // ~0..2.4
          controlsRef.current.span = clamp01(dist / 1.7);
          controlsRef.current.height = clamp01((a.height + b.height) / 2);
          setStatus("two");
        } else if (hands.length === 1) {
          const a = computeHandFeatures(hands[0]);
          controlsRef.current.span = clamp01(a.open);
          controlsRef.current.height = clamp01(a.height);
          setStatus("one");
        } else {
          // No hands this frame: keep last values, but fall back to pointer
          // if the pointer was used recently; otherwise flag lost.
          if (now - pointerTimeRef.current < 2500) setStatus("pointer");
          else setStatus(cameraOnRef.current ? "lost" : "pointer");
        }
      } catch {
        /* detection hiccup — ignore this frame */
      } finally {
        trackerBusyRef.current = false;
      }
    };

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const ctx = ctxRef.current;
      runDetect(now);

      // Smooth the control struct (same struct whether from hands or pointer).
      const tgt = controlsRef.current;
      const sm = smoothRef.current;
      sm.span += (tgt.span - sm.span) * 0.12;
      sm.height += (tgt.height - sm.height) * 0.12;

      if (now - severThrottleRef.current > 140) {
        severThrottleRef.current = now;
        setSeverPct(Math.round(sm.span * 100));
      }

      // ── Audio: re-balance + re-time with the split; brighten with height.
      if (ctx) {
        const s = sm.span;
        const tc = 0.12;
        const tNow = ctx.currentTime;
        harmGainRef.current?.gain.setTargetAtTime(0.9, tNow, tc);
        percGainRef.current?.gain.setTargetAtTime(0.8 + 0.5 * s, tNow, tc);
        // Percussive layer drifts in time against the harmony as hands part.
        percSrcRef.current?.playbackRate.setTargetAtTime(1 + 0.05 * s, tNow, tc);
        // Harmonic bed gets brighter the higher the hands reach.
        const freq = 400 * Math.pow(40, sm.height); // 400 Hz … 16 kHz
        harmLpRef.current?.frequency.setTargetAtTime(freq, tNow, tc);
      }

      // ── Levels for the viz.
      const harmR = Math.min(1, rms(harmAnRef.current, harmBuf) * 4.5);
      const percR = Math.min(1, rms(percAnRef.current, percBuf) * 5.5);

      // Percussive onset → inject a burst in the transient territory.
      const injections: Injection[] = [];
      percBaseRef.current += (percR - percBaseRef.current) * 0.08;
      if (
        now - onsetCdRef.current > 85 &&
        percR > percBaseRef.current * 1.5 + 0.015
      ) {
        onsetCdRef.current = now;
        const s = sm.span;
        const x = clamp01(0.5 + s * 0.28 + (rnd() - 0.5) * 0.3);
        const y = clamp01(rnd());
        injections.push({ x, y, amp: 0.35 + 0.5 * percR });
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;
      rendererRef.current?.frame({
        dt,
        time: (now - startPerfRef.current) / 1000,
        harm: harmR,
        perc: percR,
        split: sm.span,
        height: sm.height,
        injections,
      });
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // Loop is (re)created only when phase flips to "ready"; live values are read
    // through refs, so no other deps are needed.
  }, [phase]);

  // Pointer fallback — writes the IDENTICAL control struct (X→span, Y→height).
  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const y = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    controlsRef.current.span = x; // left = fused, right = severed
    controlsRef.current.height = 1 - y; // top = brighter
    pointerTimeRef.current = performance.now();
    if (status !== "two" && status !== "one") setStatus("pointer");
  }, [status]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        harmSrcRef.current?.stop();
      } catch {
        /* not started */
      }
      try {
        percSrcRef.current?.stop();
      } catch {
        /* not started */
      }
      harmSrcRef.current?.disconnect();
      percSrcRef.current?.disconnect();
      harmGainRef.current?.disconnect();
      percGainRef.current?.disconnect();
      harmLpRef.current?.disconnect();
      harmAnRef.current?.disconnect();
      percAnRef.current?.disconnect();
      masterRef.current?.disconnect();
      trackerRef.current?.close();
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* already closing */
        });
      }
    };
  }, []);

  const statusLine = (() => {
    switch (status) {
      case "two":
        return { text: "two hands · tracking · live", bad: false };
      case "one":
        return { text: "one hand · tracking · live", bad: false };
      case "pointer":
        return {
          text: cameraOn ? "pointer control · drag to sever" : "pointer control · camera off · drag to sever",
          bad: false,
        };
      case "lost":
        return { text: "hands lost — show both hands, waist-up", bad: true };
      default:
        return { text: "awaiting input", bad: false };
    }
  })();

  // ── Intro / loading / error overlays ───────────────────────────────────────
  if (phase === "intro" || phase === "separating" || phase === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            23120 · sever
          </p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Reach in and pull the ringing apart from the hammers
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            One real take of Karel&rsquo;s piano is separated — once, offline — into
            two living layers: the sustained <em>resonance</em> and the hammer{" "}
            <em>attacks</em>. Then you re-balance and re-time them with your two
            hands, and watch the split cleave a reaction-diffusion field in two.
          </p>

          {phase === "intro" && (
            <>
              <div className="mt-6">
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Take
                </label>
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="mt-2 block w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-base text-foreground"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={start}
                className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Separate &amp; play
              </button>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                The separation is a heavy one-time pass (a few seconds). Allow the
                camera for two-hand control, or use a mouse — both work.
              </p>
            </>
          )}

          {phase === "separating" && (
            <div className="mt-8">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                separating… {progressLabel}
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-md border border-border bg-background">
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {Math.round(progress * 100)}% — median-filter HPSS on {trackTitle}
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-8">
              <p className="text-base leading-relaxed text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => setPhase("intro")}
                className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Back
              </button>
            </div>
          )}
        </div>
        <PrototypeNav slugs={["23120-sever"]} />
      </main>
    );
  }

  // ── Ready: viz-first, fullscreen canvas + light overlay strip ──────────────
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <div
        className="fixed inset-0 touch-none"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* hidden camera feed for hand tracking */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {!glOk && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/90 px-6">
          <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
            This view needs WebGL2 with float render targets, which this browser
            doesn&rsquo;t provide. The audio separation still plays — the
            reaction-diffusion field cannot be shown here.
          </p>
        </div>
      )}

      {/* status line (always visible, never faked) */}
      <div className="pointer-events-none fixed left-4 top-4 z-40">
        <p
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            statusLine.bad ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {statusLine.text}
        </p>
      </div>

      {!immersive && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center px-4">
          <div className="pointer-events-auto max-w-md rounded-md border border-border/50 bg-background/50 px-4 py-3 backdrop-blur-sm">
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                sever · {trackTitle}
              </span>
              <br />
              Pull your hands apart (or drag right) to cleave the ringing from the
              hammers. Raise your hands (or drag up) to brighten the resonance.
            </p>
          </div>
        </div>
      )}

      <div className="fixed right-4 top-4 z-40 flex gap-2">
        {!immersive && (
          <span className="rounded-md border border-border/50 bg-background/50 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            {severPct}% severed
          </span>
        )}
      </div>

      <div className="fixed bottom-4 left-4 z-40">
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Sever"
          description="Karel's piano, separated by median-filter HPSS into sustained resonance and hammer attacks, re-balanced and re-timed with two hands over a Gray-Scott reaction-diffusion field."
          howTo={[
            "Allow the camera and show both hands (waist-up), or use a mouse",
            "Pull your hands apart to cleave the ringing from the hammers",
            "Raise your hands to brighten the resonance",
          ]}
        />
      </div>

      {!immersive && <PrototypeNav slugs={["23120-sever"]} />}
    </main>
  );
}
