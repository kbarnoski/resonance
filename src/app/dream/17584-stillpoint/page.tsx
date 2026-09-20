"use client";

/* ── 17584 · Stillpoint ──────────────────────────────────────────────────────
 *
 *  THE ONE QUESTION: what if the instrument were STILLNESS? One of Karel's real
 *  piano takes plays whole and present ONLY when you hold your body still — the
 *  quieter your motion, the clearer and closer the music. Any movement scatters
 *  it: the recording granulates, a low-pass closes down, a reverb wash widens
 *  and the level drops, so it recedes into a blurred distant whisper.
 *
 *  An inversion of "conduct the music with big gestures": here your job is to
 *  become still, and the reward is the music arriving intact.
 *
 *  INPUT:  camera → MediaPipe PoseLandmarker (shoulders gate; motion energy from
 *          shoulders + nose/wrists when visible) → stillness ∈ [0,1].
 *  AUDIO:  Karel's real solo-piano recording — a CLEAN looping buffer crossfaded
 *          against a GRANULAR reader over the SAME decoded buffer. Both paths end
 *          in createSafeMaster (never ctx.destination). No synth, no oscillator.
 *  OUTPUT: a nearly bare Canvas2D halo that contracts to a still point as you
 *          quiet down, plus one small stillness readout. The sound is the star.
 *
 *  See README.md for the full technique writeup and references.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";

// Default track: "Bath" — a calm one, fitting for stillness.
const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Motion → stillness tuning ────────────────────────────────────────────────
// Frame-to-frame normalized-coordinate displacement of the tracked points, low-
// pass smoothed ASYMMETRICALLY: motion rises fast (a twitch drops stillness at
// once) and decays slow (a held pose settles toward still over ~1–2 s).
const MOTION_FLOOR = 0.0016; // sensor jitter of a genuinely still seated person
const MOTION_FULL = 0.014; // displacement/frame that reads as fully "moving"
const ATTACK_K = 0.55; // fast rise on new motion
const RELEASE_K = 0.016; // slow decay (~1–2 s to settle)

// ── Granular reader tuning ───────────────────────────────────────────────────
const GRAIN_LEN = 0.14; // seconds per grain
const GRAIN_INTERVAL = 0.05; // seconds between grain onsets (~3× overlap)
const GRAIN_LOOKAHEAD = 0.12; // schedule this far ahead of ctx.currentTime
const GRAIN_SKIP_STILL = 0.985; // above this stillness, stop spawning grains (clean only)

// Raised-cosine (Hann) grain envelope, precomputed once.
const GRAIN_ENV = (() => {
  const n = 96;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return a;
})();

function makeImpulse(ac: AudioContext, seconds = 3.0): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
  }
  return buf;
}

// ── Audio engine (refs only; never re-renders) ───────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  cleanSrc: AudioBufferSourceNode;
  cleanGain: GainNode;
  grainBus: GainNode;
  scatterLP: BiquadFilterNode;
  scatterLevel: GainNode;
  reverbWet: GainNode;
  freq: Uint8Array<ArrayBuffer>;
  readHead: number; // seconds; loosely follows the clean playback position
  nextGrainTime: number; // ctx-time of the next grain to schedule
  lastMs: number;
}

type Mode = "idle" | "loading" | "running";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";
type Control = "demo" | "live" | "pointer";

export default function StillpointPage() {
  const { immersive, toggle } = useImmersive();
  const [mode, setMode] = useState<Mode>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [control, setControl] = useState<Control>("demo");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>(
    REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? "Bath",
  );
  const [stillPct, setStillPct] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const camWantRef = useRef(false);
  const lastPoseRef = useRef(0); // ts of last frame with both shoulders visible
  const prevLmRef = useRef<Record<number, { x: number; y: number }>>({});
  const motionSmoothRef = useRef(0);
  const stillnessRef = useRef(0); // final value driving audio + visual
  const controlRef = useRef<Control>("demo");
  const pointerRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    lastMove: number;
  }>({ active: false, x: 0.5, y: 0.5, lastX: 0.5, lastY: 0.5, lastMove: 0 });
  const uiTickRef = useRef(0);

  // ── canvas sizing (DPR-aware) ──────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    const box = c?.parentElement;
    if (!c || !box) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(2, Math.floor(box.clientWidth * dpr));
    c.height = Math.max(2, Math.floor(box.clientHeight * dpr));
  }, []);

  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    const t = window.setTimeout(onResize, 60); // immersive relayout
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [mode, immersive, sizeCanvas]);

  // ── measure motion from a pose result → instantaneous displacement/frame ───
  const measurePoseMotion = useCallback((lm: Landmark[]): number | null => {
    const ls = lm[POSE_LM.leftShoulder];
    const rs = lm[POSE_LM.rightShoulder];
    // Gate ONLY on the two shoulders (a seated laptop webcam sees waist-up).
    if (
      !ls ||
      !rs ||
      (ls.visibility ?? 0) <= 0.5 ||
      (rs.visibility ?? 0) <= 0.5
    ) {
      return null;
    }
    // Shoulders always count; nose + wrists add detail when visible.
    const pts: number[] = [POSE_LM.leftShoulder, POSE_LM.rightShoulder];
    for (const idx of [POSE_LM.nose, POSE_LM.leftWrist, POSE_LM.rightWrist]) {
      if ((lm[idx]?.visibility ?? 0) > 0.5) pts.push(idx);
    }
    const prev = prevLmRef.current;
    const next: Record<number, { x: number; y: number }> = {};
    let sum = 0;
    let n = 0;
    for (const idx of pts) {
      const p = lm[idx];
      next[idx] = { x: p.x, y: p.y };
      const q = prev[idx];
      if (q) {
        sum += Math.hypot(p.x - q.x, p.y - q.y);
        n += 1;
      }
    }
    prevLmRef.current = next; // reappearing points get no phantom spike
    return n > 0 ? sum / n : 0;
  }, []);

  // ── control + audio + render loop (synchronous on rAF, no async hops) ───────
  const runFrame = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const now = performance.now();
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;

      // 1. establish stillness from the active control source ------------------
      let ctrl: Control = "demo";
      let motionInput: number | null = null;
      let directStill: number | null = null;

      if (camWantRef.current && trackerRef.current && videoRef.current) {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          try {
            const res = trackerRef.current.detectForVideo(video, now);
            const lm = res.landmarks?.[0];
            const m = lm ? measurePoseMotion(lm) : null;
            if (m !== null) {
              lastPoseRef.current = now;
              motionInput = m;
              ctrl = "live";
            } else if (now - lastPoseRef.current > 900) {
              ctrl = "live"; // still "live" mode, but flagged lost below via camState
              setCamState((s) => (s === "lost" ? s : "lost"));
              motionInput = null; // hold — let stillness decay toward still
            } else {
              ctrl = "live";
              setCamState((s) => (s === "live" ? s : "live"));
              motionInput = null;
            }
            if (m !== null) setCamState((s) => (s === "live" ? s : "live"));
          } catch {
            motionInput = null;
            ctrl = "live";
          }
        } else {
          ctrl = "live";
        }
      } else if (pointerRef.current.active) {
        ctrl = "pointer";
        // pointer velocity since last frame → motion; idle pointer decays to still
        const p = pointerRef.current;
        const idle = now - p.lastMove > 140;
        motionInput = idle ? 0 : Math.hypot(p.x - p.lastX, p.y - p.lastY);
        p.lastX = p.x;
        p.lastY = p.y;
      } else {
        // AUTO-DEMO — stillness slowly breathes moving → still → moving so the
        // coalesce/dissolve is audible & visible at a glance. Period ~15 s.
        ctrl = "demo";
        const t = now / 1000;
        directStill = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 15);
      }

      controlRef.current = ctrl;
      setControl((c) => (c === ctrl ? c : ctrl));

      // 2. resolve stillness ---------------------------------------------------
      let stillness: number;
      if (directStill !== null) {
        // demo drives stillness directly (already smooth)
        stillness = stillnessRef.current + (directStill - stillnessRef.current) * 0.08;
      } else {
        // asymmetric low-pass on motion: fast attack, slow release
        const inst = motionInput ?? 0;
        const ms = motionSmoothRef.current;
        const k = inst > ms ? ATTACK_K : RELEASE_K;
        motionSmoothRef.current = ms + (inst - ms) * k;
        const norm = clamp01(
          (motionSmoothRef.current - MOTION_FLOOR) / (MOTION_FULL - MOTION_FLOOR),
        );
        const target = 1 - norm;
        // light final smoothing so the halo & audio never step
        stillness = stillnessRef.current + (target - stillnessRef.current) * 0.3;
      }
      stillness = clamp01(stillness);
      stillnessRef.current = stillness;

      // 3. push to audio (equal-power crossfade clean ⇄ scatter) --------------
      const s = stillness;
      const t0 = eng.ac.currentTime;
      const TC = 0.15;
      const cleanG = Math.sin((s * Math.PI) / 2); // →1 at still
      const scatterG = Math.cos((s * Math.PI) / 2) * 0.6; // →0.6 when moving (recedes)
      eng.cleanGain.gain.setTargetAtTime(cleanG, t0, TC);
      eng.scatterLevel.gain.setTargetAtTime(scatterG, t0, TC);
      // moving → close the low-pass down toward a muffled distance
      eng.scatterLP.frequency.setTargetAtTime(500 + s * 9000, t0, 0.18);
      // moving → widen the reverb wash
      eng.reverbWet.gain.setTargetAtTime((1 - s) * 0.7, t0, 0.2);

      // 4. granular scheduler (spawns short jittered grains of the SAME buffer)
      eng.readHead = (eng.readHead + dt) % eng.buffer.duration;
      if (s < GRAIN_SKIP_STILL) {
        const dur = eng.buffer.duration;
        const maxOffset = Math.max(0.001, dur - (GRAIN_LEN * 1.1 + 0.02));
        const posJitter = (1 - s) * 0.32; // seconds of read-head scatter
        const rateJitter = (1 - s) * 0.05;
        if (eng.nextGrainTime < t0) eng.nextGrainTime = t0 + 0.01;
        while (eng.nextGrainTime < t0 + GRAIN_LOOKAHEAD) {
          const gt = eng.nextGrainTime;
          let off = eng.readHead + (Math.random() * 2 - 1) * posJitter;
          off = ((off % dur) + dur) % dur;
          if (off > maxOffset) off = Math.random() * maxOffset;
          const rate = 1 + (Math.random() * 2 - 1) * rateJitter;
          const src = eng.ac.createBufferSource();
          src.buffer = eng.buffer;
          src.playbackRate.value = rate;
          const g = eng.ac.createGain();
          g.gain.setValueCurveAtTime(GRAIN_ENV, gt, GRAIN_LEN);
          src.connect(g);
          g.connect(eng.grainBus);
          try {
            src.start(gt, off, GRAIN_LEN * rate + 0.02);
            src.stop(gt + GRAIN_LEN + 0.05);
          } catch {
            /* ctx closing */
          }
          eng.nextGrainTime += GRAIN_INTERVAL;
        }
      } else {
        // keep the scheduler cursor near current time so it resumes cleanly
        eng.nextGrainTime = t0 + 0.01;
      }

      // 5. render the halo -----------------------------------------------------
      eng.master.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let i = 0; i < eng.freq.length; i++) sum += eng.freq[i];
      const rms = sum / eng.freq.length / 255;
      drawHalo(canvasRef.current, s, rms, now / 1000);

      // 6. UI mirrors ~8 Hz ----------------------------------------------------
      if (now - uiTickRef.current > 120) {
        uiTickRef.current = now;
        setStillPct((prev) => {
          const v = Math.round(s * 100);
          return prev === v ? prev : v;
        });
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [measurePoseMotion],
  );

  // ── start audio + visuals (user gesture) ───────────────────────────────────
  const handleStart = useCallback(async () => {
    if (mode !== "idle") return;
    setMode("loading");
    setLoadError(null);

    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setLoadError("Web Audio is unavailable in this browser.");
      setMode("idle");
      return;
    }

    let buffer: AudioBuffer;
    let title: string;
    try {
      const loaded = await loadRealTrackBuffer(ac, trackId);
      buffer = loaded.buffer;
      title = loaded.title;
    } catch {
      setLoadError(
        "Could not load the recording — check your connection and retry.",
      );
      void ac.close();
      setMode("idle");
      return;
    }
    setTrackTitle(title);

    const master = createSafeMaster(ac);

    // clean path: looping buffer at unity — the recording arriving intact.
    const cleanSrc = ac.createBufferSource();
    cleanSrc.buffer = buffer;
    cleanSrc.loop = true;
    const cleanGain = ac.createGain();
    cleanGain.gain.value = 0; // starts scattered; crossfades up with stillness
    cleanSrc.connect(cleanGain);
    cleanGain.connect(master.input);

    // scattered path: granular reader over the SAME buffer → low-pass → wash.
    const grainBus = ac.createGain();
    grainBus.gain.value = 1;
    const scatterLP = ac.createBiquadFilter();
    scatterLP.type = "lowpass";
    scatterLP.frequency.value = 700;
    scatterLP.Q.value = 0.7;
    const scatterLevel = ac.createGain();
    scatterLevel.gain.value = 0.6;
    const convolver = ac.createConvolver();
    convolver.buffer = makeImpulse(ac);
    const reverbWet = ac.createGain();
    reverbWet.gain.value = 0.5;

    grainBus.connect(scatterLP);
    scatterLP.connect(scatterLevel);
    scatterLevel.connect(master.input); // dry scatter (carries the crossfade)
    scatterLevel.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(master.input); // reverb wash

    cleanSrc.start();

    engineRef.current = {
      ac,
      master,
      buffer,
      cleanSrc,
      cleanGain,
      grainBus,
      scatterLP,
      scatterLevel,
      reverbWet,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      readHead: 0,
      nextGrainTime: ac.currentTime + 0.05,
      lastMs: 0,
    };

    // reset control state
    motionSmoothRef.current = MOTION_FULL; // start "moving" so demo begins blurred
    stillnessRef.current = 0;
    prevLmRef.current = {};

    sizeCanvas();
    setMode("running");
    rafRef.current = requestAnimationFrame(runFrame);
  }, [mode, trackId, sizeCanvas, runFrame]);

  // ── enable camera (separate opt-in for the permission prompt) ──────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createPoseTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastPoseRef.current = performance.now();
      prevLmRef.current = {};
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback ───────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camWantRef.current) return; // live pose wins
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = pointerRef.current;
    p.active = true;
    p.x = clamp01((e.clientX - r.left) / r.width);
    p.y = clamp01((e.clientY - r.top) / r.height);
    p.lastMove = performance.now();
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const eng = engineRef.current;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      trackerRef.current?.close();
    } catch {
      /* noop */
    }
    trackerRef.current = null;
    camWantRef.current = false;
    if (eng) {
      try {
        eng.cleanSrc.stop();
      } catch {
        /* already stopped */
      }
      eng.master.disconnect();
      const ac = eng.ac;
      if (ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 300);
      }
      engineRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setCamState("off");
    setControl("demo");
    setStillPct(0);
  }, [stopEverything]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  // status line content
  const statusLost = camState === "lost";
  const camBad = camState === "denied" || camState === "failed";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── art layer ── */}
      <div
        ref={wrapRef}
        className="fixed inset-0 z-0 bg-black"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {/* hidden camera feed — MediaPipe reads from it */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* ── stillness readout + tracking status (visible whenever running) ── */}
      {running && (
        <div className="pointer-events-none fixed left-4 top-4 z-30 space-y-1">
          <div className="font-mono text-xs uppercase tracking-[0.18em]">
            {control === "live" ? (
              statusLost ? (
                <span className="text-destructive">
                  pose lost · sit back so both shoulders are in frame
                </span>
              ) : (
                <span className="text-primary">tracking · live</span>
              )
            ) : control === "pointer" ? (
              <span className="text-muted-foreground">
                pointer · hold still to gather the music, move to scatter it
              </span>
            ) : (
              <span className="text-muted-foreground">
                demo · stillness is breathing on its own
              </span>
            )}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            stillness {String(stillPct).padStart(2, "0")}
            <span className="ml-2 inline-block h-1 w-24 align-middle overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${stillPct}%` }}
              />
            </span>
          </div>
        </div>
      )}

      {/* ── chrome (hidden while immersive) ── */}
      {!immersive && (
        <>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="fixed right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>

          <div className="relative z-20 mx-auto max-w-3xl px-5 py-8 sm:px-8">
            <Link
              href="/dream"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← back to the dream lab
            </Link>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Stillpoint
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground">
              What if the instrument were stillness? One of Karel&apos;s piano
              takes plays whole and present only when you hold your body still.
              The quieter your motion, the clearer and closer the music arrives;
              any movement scatters it toward a distant whisper. Your job is to
              become still — and the reward is the recording, intact.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={loading}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Loading Karel's recording…" : "Begin (demo plays first)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}
              {running && camState !== "live" && (
                <button
                  type="button"
                  onClick={() => void enableCamera()}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting"
                    ? "starting camera…"
                    : "Enable camera"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            {/* fallback / degradation notices */}
            {running && camBad && (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
                {camState === "denied"
                  ? "camera denied · "
                  : "camera unavailable · "}
                <span className="text-muted-foreground">
                  running the auto-demo — or hold the pointer still over the field
                </span>
              </p>
            )}
            {running && camState === "off" && (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                auto-demo running · enable the camera to control stillness with
                your body, or hold the pointer still over the field
              </p>
            )}

            {/* track selector */}
            {!running && (
              <div className="mt-6">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  take
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLLECTIONS.map((c) => (
                    <div key={c.name} className="flex flex-wrap gap-2">
                      {c.tracks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTrackId(t.id)}
                          className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                            trackId === t.id
                              ? "border-primary bg-primary/15 text-foreground"
                              : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadError && (
              <p className="mt-4 text-base leading-relaxed text-destructive">
                {loadError}
              </p>
            )}

            <p className="mt-8 text-sm text-muted-foreground">
              input: MediaPipe PoseLandmarker (shoulder-gated motion energy →
              stillness) · audio: {trackTitle} — Karel&apos;s recording, a clean
              loop crossfaded against a granular reader of the same take ·
              output: a single breathing halo
            </p>
          </div>
        </>
      )}

      {/* exit pill lives in ImmersiveToggle while immersive */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {/* ── design notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Stillpoint</span> inverts the
                whole idea of conducting music with big gestures. Here the
                instrument is <span className="text-foreground">stillness</span>:
                one of Karel&apos;s real piano takes plays whole and present only
                when you quiet your body. Motion is the enemy of the sound, not
                its source.
              </p>
              <p>
                A full-body pose is tracked, but the piece gates only on the two{" "}
                <span className="text-foreground">shoulders</span> — a seated
                laptop webcam sees you waist-up, so requiring hips or ankles
                would silently drop you into the demo. Frame-to-frame
                displacement of the shoulders (plus nose and wrists when visible)
                is low-pass smoothed <em>asymmetrically</em>: it rises fast so a
                twitch drops stillness at once, and decays slow so a held pose
                settles toward still over one to two seconds.
              </p>
              <p>
                Stillness ∈ [0,1] crossfades two versions of the{" "}
                <em>same recording</em>. Near 1 you hear the{" "}
                <span className="text-foreground">clean loop</span> — dry,
                full-band, close, unity gain. Near 0 a{" "}
                <span className="text-foreground">granular reader</span> of the
                same decoded buffer takes over: the read-head scatters, grain
                pitch jitters, a low-pass closes down and a reverb wash widens as
                the level drops, so the piece recedes into a blurred distant
                whisper. Every parameter is smoothed with{" "}
                <code>setTargetAtTime</code> (~0.15 s) and the control path is
                synchronous on <code>requestAnimationFrame</code> — no async
                hops. Both paths terminate in the shared ear-safety master;
                nothing touches the raw destination.
              </p>
              <p>
                The screen stays nearly bare: a single soft halo that contracts
                to a still point as you quiet down, breathing gently with the
                music&apos;s energy, scattering into ghosted offset rings as you
                move. The sound is the star; the restraint is the point.
              </p>
              <p>
                An <span className="text-foreground">auto-demo</span> runs before
                the camera is enabled — stillness breathes moving → still →
                moving on its own so the coalesce/dissolve is audible at a
                glance. With no camera, a denial, or a model-load failure, that
                demo continues and a pointer fallback lets you hold still (gather)
                or move fast (scatter). Fallbacks are always labeled and never
                pose as live tracking.
              </p>
              <p>
                References: the phenomenology of meditative quiescence, and the{" "}
                <span className="text-foreground">
                  Embodied groove–synchrony model
                </span>{" "}
                (Frontiers in Psychology, fpsyg 2026.1803480, 15 May 2026) — that
                movement context reshapes auditory–motor coupling — here{" "}
                <em>inverted</em>, since the absence of movement is the control.
                In the stillness-as-presence art lineage it stands with{" "}
                <span className="text-foreground">Éliane Radigue</span>, whose
                slow, sustained electronic drones treat prolonged stillness and
                attention as the medium itself.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── the halo (Canvas2D) ─────────────────────────────────────────────────────
// Still (→1): a small, crisp, bright still point. Moving (→0): a large, diffuse
// halo scattered into ghosted offset rings — the recording blurred and far.
function drawHalo(
  canvas: HTMLCanvasElement | null,
  stillness: number,
  rms: number,
  time: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // gentle trail fade for a breathing, meditative feel (no grain overlay)
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(4, 3, 10, 0.28)";
  ctx.fillRect(0, 0, w, h);

  const s = clamp01(stillness);
  const move = 1 - s;
  // breathing pulse from the music's energy
  const pulse = 1 + rms * 0.35 + 0.03 * Math.sin(time * 0.9);
  // radius: contracts to a still point as s → 1
  const baseR = minDim * (0.045 + move * 0.30) * pulse;

  ctx.globalCompositeOperation = "lighter";

  // color: cool indigo when scattered → warm violet-white when gathered/still
  const hue = 250 - s * 22; // 250 (indigo) → 228
  const light = 42 + s * 40; // brighter as it gathers
  const sat = 70 - s * 18;

  // scattered ghost rings (granulation made visible) — collapse to center as s→1
  const ghosts = Math.round(move * 6);
  for (let i = 0; i < ghosts; i++) {
    const a = (i / Math.max(1, ghosts)) * Math.PI * 2 + time * 0.25;
    const spread = minDim * 0.16 * move * (0.5 + 0.5 * Math.sin(time * 0.5 + i));
    const gx = cx + Math.cos(a) * spread;
    const gy = cy + Math.sin(a) * spread;
    const gr = baseR * (0.55 + 0.25 * Math.sin(time + i));
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${0.10 * move})`);
    grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  // main halo
  const mainR = baseR * (1 + move * 0.2);
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, mainR);
  const coreA = 0.22 + s * 0.5; // clearer & closer as still
  halo.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 22}%, ${coreA})`);
  halo.addColorStop(0.4, `hsla(${hue}, ${sat}%, ${light}%, ${coreA * 0.5})`);
  halo.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, mainR, 0, Math.PI * 2);
  ctx.fill();

  // the still point: a crisp bright core that only fully resolves near s = 1
  const pointA = Math.pow(s, 2.2);
  if (pointA > 0.01) {
    const pr = minDim * (0.006 + 0.02 * s) * pulse;
    const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr * 3);
    pg.addColorStop(0, `hsla(${hue}, ${sat - 20}%, 92%, ${0.9 * pointA})`);
    pg.addColorStop(0.5, `hsla(${hue}, ${sat}%, 70%, ${0.5 * pointA})`);
    pg.addColorStop(1, `hsla(${hue}, ${sat}%, 60%, 0)`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(cx, cy, pr * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
