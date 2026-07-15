"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";
import { BreathEstimator, ParticleNimbus, type BreathState } from "./sim";
import {
  makeGLRig,
  makeCanvas2DRig,
  type GLRig,
  type Canvas2DRig,
} from "./glrig";
import { startAudio, type NimbusAudio } from "./audio";

// ── Fixed constants (determinism) ─────────────────────────────────────────────
const BREATH_HZ = 0.1; // ~6 breaths/min resonance target
const SEED = 0x1722b3ea; // fixed mote seed — never Math.random
const GL_MOTES = 60000; // raw WebGL2 point-sprite count
const CANVAS_MOTES = 4000; // lighter Canvas2D fallback
const SCALE = 0.72; // sim-space → clip scale

type MicStatus = "off" | "requesting" | "on" | "denied";

interface Readout {
  phase: string;
  bpm: number;
  coherence: number;
  motes: number;
  source: "mic" | "demo";
}

export default function BreathNimbusPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [usingFallback, setUsingFallback] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    phase: "—",
    bpm: NaN,
    coherence: 0,
    motes: GL_MOTES,
    source: "demo",
  });

  // Mutable engine state (kept in refs so the rAF loop never goes stale).
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const nimbusRef = useRef<ParticleNimbus | null>(null);
  const estimatorRef = useRef<BreathEstimator | null>(null);
  const glRef = useRef<GLRig | null>(null);
  const canvasRigRef = useRef<Canvas2DRig | null>(null);
  const audioRef = useRef<NimbusAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<"mic" | "demo">("demo");
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3 })); // gate, off by default
  const reducedRef = useRef(false);
  const dprRef = useRef(1);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dprRef.current = dpr;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // One animation frame. Uses ONLY the integer frame counter for time —
  // never performance.now / Date.now — so the headless render is deterministic.
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const nimbus = nimbusRef.current;
    const est = estimatorRef.current;
    if (!canvas || !nimbus || !est) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const frame = frameRef.current;

    // 1. Breath envelope: real mic RMS, or the deterministic synthetic ghost.
    let raw: number;
    if (sourceRef.current === "mic" && analyserRef.current && timeBufRef.current) {
      const a = analyserRef.current;
      const buf = timeBufRef.current;
      a.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Lift into a comfortable envelope range; the estimator self-calibrates.
      raw = Math.min(1, rms * 3.2);
    } else {
      // Deterministic synthetic breath — pure sine of the integer frame counter.
      raw = 0.5 + 0.5 * Math.sin((frame / 60) * 2 * Math.PI * BREATH_HZ);
    }

    const breath: BreathState = est.update(raw, frame);
    const coh = breath.coherence;

    // 2. Peak-inhale luminance bloom (the "boundary-dissolving veil"). This is a
    //    slow ~0.1 Hz swell, well below any flicker hazard; still multiplied
    //    through the SafeFlicker gate (=1 when disabled) and eased for
    //    reduced-motion users.
    let bloom = Math.max(0, (breath.amp - 0.72) / 0.28);
    bloom *= flickerRef.current.value(frame / 60);
    if (reducedRef.current) bloom *= 0.4;
    const gather01 = breath.amp; // 0 dispersed … 1 gathered

    // 3. Advance the mote sim.
    nimbus.step(breath, coh);

    // 4. Render.
    resize();
    const res: [number, number] = [canvas.width, canvas.height];
    if (glRef.current) {
      glRef.current.render(
        nimbus.pos,
        res,
        SCALE,
        2.1 * dprRef.current,
        gather01,
        bloom,
        coh,
      );
    } else if (canvasRigRef.current) {
      canvasRigRef.current.render(
        nimbus.pos,
        nimbus.seed,
        res,
        SCALE,
        gather01,
        bloom,
        coh,
      );
    }

    // 5. Audio swell follows the very same breath phase.
    audioRef.current?.setBreath(breath.amp, coh);

    // 6. Throttled UI readout.
    if (frame % 12 === 0) {
      setReadout({
        phase: breath.inhaling ? "inhale ◀ gather" : "exhale ▶ disperse",
        bpm: breath.bpm,
        coherence: coh,
        motes: nimbus.count,
        source: sourceRef.current,
      });
    }

    frameRef.current = frame + 1;
    rafRef.current = requestAnimationFrame(loop);
  }, [resize]);

  // Build the renderer + sim once, and start the ghost loop immediately so the
  // page is NEVER blank — even headless with no mic and no interaction.
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    resize();

    // Try WebGL2 first (60k motes); fall back to Canvas2D (fewer motes).
    const glNimbus = new ParticleNimbus({ count: GL_MOTES, seed: SEED });
    const rig = makeGLRig(canvas, glNimbus.seed);
    if (rig) {
      nimbusRef.current = glNimbus;
      glRef.current = rig;
    }
    if (!glRef.current) {
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        setUsingFallback(true);
        nimbusRef.current = new ParticleNimbus({ count: CANVAS_MOTES, seed: SEED });
        canvasRigRef.current = makeCanvas2DRig(ctx2d);
      }
    }
    estimatorRef.current = new BreathEstimator();

    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      glRef.current?.dispose();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort silent-safety: bring audio up. Called from user gestures, and
  // attempted once on mount (headless autoplay may permit it; a real browser
  // will keep it suspended until a gesture, which the buttons provide).
  const ensureAudio = useCallback(async () => {
    if (!acRef.current) {
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext;
        const ac = new Ctx();
        acRef.current = ac;
        audioRef.current = startAudio(ac);
      } catch {
        /* audio unavailable — visuals still run */
      }
    }
    if (acRef.current?.state === "suspended") {
      try {
        await acRef.current.resume();
      } catch {
        /* stays suspended until a real gesture */
      }
    }
  }, []);

  const startMic = useCallback(async () => {
    await ensureAudio();
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ac = acRef.current;
      if (!ac) {
        setMicStatus("denied");
        return;
      }
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      // ── SAFETY: mic connects to the analyser ONLY. It is NEVER connected to
      //    ctx.destination or any node that reaches output — no howl-round. ──
      source.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      sourceRef.current = "mic";
      setMicStatus("on");
    } catch {
      // Denied or unavailable → fall back to the deterministic ghost.
      sourceRef.current = "demo";
      setMicStatus("denied");
    }
  }, [ensureAudio]);

  const startDemo = useCallback(async () => {
    await ensureAudio();
    // Detach any mic and drive the nimbus from the synthetic breath.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    sourceRef.current = "demo";
    if (micStatus === "on") setMicStatus("off");
  }, [ensureAudio, micStatus]);

  // Try audio once on mount (headless-friendly); harmless if it stays suspended.
  useEffect(() => {
    void ensureAudio();
  }, [ensureAudio]);

  // Full teardown.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1600);
      }
      acRef.current = null;
    };
  }, []);

  const bpmLabel = Number.isFinite(readout.bpm)
    ? readout.bpm.toFixed(1)
    : "—";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          cosmic-ambient · breath biofeedback
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Breath Nimbus
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Tens of thousands of luminous motes gather toward you as you inhale and
          disperse to a boundless veil as you exhale — steered by your real
          breath. Slow, steady breathing near six breaths a minute phase-locks
          them into one calm, coherent cloud.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            onClick={startMic}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {micStatus === "on"
              ? "Breathing live"
              : micStatus === "requesting"
                ? "Requesting mic…"
                : "Start — breathe"}
          </button>
          <button
            onClick={startDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Breathe for me (demo)
          </button>
        </div>

        {micStatus === "denied" && (
          <p className="mt-3 max-w-sm text-base text-destructive">
            No microphone access — running the synthetic breath demo instead. The
            nimbus still gathers and disperses on its own.
          </p>
        )}

        {readout.source === "demo" && micStatus !== "denied" && (
          <p className="mt-3 text-base text-muted-foreground">
            A synthetic ~0.1 Hz breath is driving the cloud. Press
            <span className="text-foreground"> Start — breathe </span>
            to steer it with your own breathing.
          </p>
        )}

        {usingFallback && (
          <p className="mt-3 max-w-sm text-base text-muted-foreground">
            WebGL2 is unavailable here, so this is a lighter Canvas2D nimbus with
            fewer motes. The breath, the gathering and the audio still play.
          </p>
        )}

        {/* Live readout. */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>phase</dt>
            <dd className="text-foreground">{readout.phase}</dd>
          </div>
          <div className="flex justify-between">
            <dt>breaths/min</dt>
            <dd className="text-foreground">{bpmLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt>coherence</dt>
            <dd className="text-foreground">
              {(readout.coherence * 100).toFixed(0)}%
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>motes</dt>
            <dd className="text-foreground">{readout.motes.toLocaleString()}</dd>
          </div>
        </dl>

        <details className="mt-4 max-w-sm text-sm text-muted-foreground">
          <summary className="cursor-pointer text-primary hover:text-primary/80">
            Design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              The mic feeds an <span className="font-mono">AnalyserNode</span>{" "}
              only — never the speakers. A self-calibrating envelope estimates
              breath phase and period; a coherence score rewards slow, steady
              ~0.1 Hz breathing. Motes advect on a divergence-free curl-noise
              field with a breath-driven radial force; coherence tightens them
              into a phase-locked ring. Full notes and references in{" "}
              <span className="font-mono">README.md</span>.
            </p>
            <p>Phenomenology, not medicine. Slow luminance drift only; no strobe.</p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1722-breath-nimbus"]} />
    </main>
  );
}
