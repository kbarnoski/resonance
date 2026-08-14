"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom — A ROOM THAT RECORDS AND LOOPS YOUR MOVING BODY.
//
//   "What if a room recorded and looped your moving body — so you fill an empty,
//    silent space with a spatial canon of your own past selves?"
//
//   The load-bearing verb is RECORD + LOOP + LAYER. You move; the room captures a
//   gesture; that gesture keeps looping as an HRTF-placed voice standing where
//   your body was — while you record another over it. Over a couple of minutes an
//   empty, silent room fills with a polyphonic canon of your looping past selves.
//   Minute 2 ≠ minute 0.
//
//   Four wired subsystems:
//     1. Camera capture   — getUserMedia → hidden <video>
//     2. Pose model       — MediaPipe Tasks-Vision PoseLandmarker (CDN runtime)
//     3. Spatial audio    — one HRTF PannerNode voice per body; motion → sound
//     4. Canvas2D room    — warm room + live skeleton + accumulating ghost-loops
//
//   Degrades gracefully: a seeded scripted demo dancer records and loops from
//   mount with NO camera and NO audio, so the canon is visible in ~2s. If the
//   MediaPipe CDN or the camera fails, the demo keeps running and a notice shows.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makePoseLandmarker, type PoseLandmarkerLike } from "./poseLoader";
import { LoomAudio } from "./audio";
import { DemoDancer } from "./demo";
import {
  frameFromLandmarks,
  frameMotion,
  wristHeight,
  bodyCentreX,
  sequenceMotion,
  N_JOINTS,
  type Frame,
} from "./body";
import {
  drawRoom,
  drawBody,
  projectFrame,
  GHOST_TINTS,
  LIVE_TINT,
} from "./render";
import { SEED, clamp, clamp01, lerp } from "./prng";

const REC_FPS = 24;
const DT_REC = 1 / REC_FPS;
const MAX_FRAMES = 144; // 6 s at 24 fps — the recording ceiling
const MIN_FRAMES = 10;
const STILL_THRESH = 0.012; // reject a recording with no real motion
const MAX_LOOPS = 8;
const DEMO_FIRST = 1.4; // first demo commit — a ghost by ~1.4 s
const DEMO_EVERY = 3.2;
const DEMO_WINDOW = Math.round(DEMO_EVERY * REC_FPS);

// Deterministic floor slots the canon fills, spread across the room in depth.
const SLOTS: Array<{ x: number; z: number }> = [
  { x: -0.55, z: 0.12 },
  { x: 0.6, z: 0.18 },
  { x: -0.3, z: 0.5 },
  { x: 0.38, z: 0.56 },
  { x: -0.72, z: 0.34 },
  { x: 0.74, z: 0.4 },
  { x: 0.0, z: 0.72 },
  { x: 0.48, z: 0.85 },
];

interface Loop {
  id: number;
  frames: Frame[];
  energies: number[];
  heights: number[];
  roomX: number;
  roomZ: number;
  tint: number;
  bornAt: number;
  frameCount: number;
}

interface Metrics {
  joints: number;
  loops: number;
  mode: "demo" | "camera";
  recording: boolean;
}

export default function BodyLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<LoomAudio | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const demoRef = useRef<DemoDancer | null>(null);

  const rafRef = useRef<number | null>(null);
  const startClockRef = useRef<number>(0);
  const lastNowRef = useRef<number>(0);
  const currentAgeRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);

  const reducedRef = useRef<boolean>(false);
  const modeRef = useRef<"demo" | "camera">("demo");
  const audioOnRef = useRef<boolean>(false);
  const recordingRef = useRef<boolean>(false);

  const currentLiveRef = useRef<Frame | null>(null);
  const lastRecFrameRef = useRef<Frame | null>(null);
  const recAccumRef = useRef<number>(0);
  const recBufferRef = useRef<Frame[]>([]);
  const liveEnergyTargetRef = useRef<number>(0);
  const liveEnergyRef = useRef<number>(0);
  const roomLevelRef = useRef<number>(0);
  const demoNextCommitRef = useRef<number>(DEMO_FIRST);

  const loopsRef = useRef<Loop[]>([]);
  const loopIdRef = useRef<number>(0);
  const slotRef = useRef<number>(0);
  const tintRef = useRef<number>(0);

  const metricsRef = useRef<Metrics>({
    joints: 0,
    loops: 0,
    mode: "demo",
    recording: false,
  });

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">(
    "off",
  );
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(metricsRef.current);

  // ── Commit the given frames as a looping ghost-self placed in the room ───────
  const commitLoop = useCallback((frames: Frame[]) => {
    if (frames.length < MIN_FRAMES) return;
    if (sequenceMotion(frames) < STILL_THRESH) return; // a still recording is silent — don't drop it

    const len = frames.length;
    const rawE = new Array<number>(len);
    const heights = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      const prev = frames[(i - 1 + len) % len];
      rawE[i] = frameMotion(prev, frames[i]);
      heights[i] = wristHeight(frames[i]);
    }
    // Light circular smoothing so the looping voice breathes, not stutters.
    const energies = rawE.map(
      (_, i) =>
        (rawE[(i - 1 + len) % len] + rawE[i] * 2 + rawE[(i + 1) % len]) / 4,
    );

    const slot = SLOTS[slotRef.current % SLOTS.length];
    const tint = tintRef.current % GHOST_TINTS.length;
    const id = loopIdRef.current++;
    slotRef.current++;
    tintRef.current++;

    const loop: Loop = {
      id,
      frames,
      energies,
      heights,
      roomX: slot.x,
      roomZ: slot.z,
      tint,
      bornAt: currentAgeRef.current,
      frameCount: len,
    };
    loopsRef.current.push(loop);
    if (audioOnRef.current) {
      audioRef.current?.addLoop(id, slot.x, 0, slot.z, tint);
    }
    while (loopsRef.current.length > MAX_LOOPS) {
      const old = loopsRef.current.shift();
      if (old) audioRef.current?.removeLoop(old.id);
    }
  }, []);

  // ── Finish a live (camera) recording and drop it into the room ───────────────
  const finishRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    const buf = recBufferRef.current;
    if (buf.length >= MIN_FRAMES) commitLoop(buf.slice());
    recBufferRef.current = [];
  }, [commitLoop]);

  // ── Empty the canon ──────────────────────────────────────────────────────────
  const clearRoom = useCallback(() => {
    loopsRef.current = [];
    slotRef.current = 0;
    tintRef.current = 0;
    audioRef.current?.clearLoops();
    if (modeRef.current === "demo") demoNextCommitRef.current = currentAgeRef.current + DEMO_FIRST;
  }, []);

  // ── Read one pose from the live camera; null when there's no fresh frame ─────
  const readCamera = useCallback((): Frame | null => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return null;
    if (video.currentTime === lastVideoTimeRef.current) return null;
    lastVideoTimeRef.current = video.currentTime;
    monoRef.current = Math.max(monoRef.current + 1, performance.now());
    let result;
    try {
      result = lm.detectForVideo(video, monoRef.current);
    } catch {
      return null;
    }
    if (!result.landmarks || result.landmarks.length === 0) return null;
    return frameFromLandmarks(result.landmarks[0]);
  }, []);

  // ── The frame loop ───────────────────────────────────────────────────────────
  const runFrame = useCallback(
    (now: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      if (startClockRef.current === 0) startClockRef.current = now;
      const age = (now - startClockRef.current) / 1000;
      currentAgeRef.current = age;
      let dt = (now - lastNowRef.current) / 1000;
      lastNowRef.current = now;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const reduced = reducedRef.current;

      // ── driver: live camera pose, or the seeded demo dancer ──────────────────
      let joints = metricsRef.current.joints;
      if (modeRef.current === "camera") {
        const f = readCamera();
        if (f) {
          currentLiveRef.current = f;
          let c = 0;
          for (let k = 0; k < N_JOINTS; k++) if (!Number.isNaN(f[2 * k])) c++;
          joints = c;
        }
      } else {
        const f = demoRef.current?.frame(age, reduced) ?? null;
        currentLiveRef.current = f;
        joints = f ? N_JOINTS : 0;
      }

      // ── record cadence: sample the live body at a fixed 24 fps ───────────────
      const cur = currentLiveRef.current;
      if (cur) {
        recAccumRef.current += dt;
        let guard = 0;
        while (recAccumRef.current >= DT_REC && guard++ < 4) {
          recAccumRef.current -= DT_REC;
          liveEnergyTargetRef.current = frameMotion(lastRecFrameRef.current, cur);
          lastRecFrameRef.current = cur;
          const pushing =
            modeRef.current === "demo" ? true : recordingRef.current;
          if (pushing) {
            recBufferRef.current.push(cur.slice());
            if (recBufferRef.current.length > MAX_FRAMES)
              recBufferRef.current.shift();
            if (
              modeRef.current === "camera" &&
              recBufferRef.current.length >= MAX_FRAMES
            ) {
              finishRecording();
            }
          }
        }
      }

      // ── demo auto-commit: the room records itself so the canon builds ────────
      if (modeRef.current === "demo" && age >= demoNextCommitRef.current) {
        const buf = recBufferRef.current;
        const take = buf.slice(Math.max(0, buf.length - DEMO_WINDOW));
        if (take.length >= MIN_FRAMES) commitLoop(take);
        demoNextCommitRef.current = age + DEMO_EVERY;
      }

      // ── smooth the live energy + drive the present-self voice ────────────────
      liveEnergyRef.current +=
        (liveEnergyTargetRef.current - liveEnergyRef.current) * 0.16;
      const liveE = liveEnergyRef.current;
      const liveH = cur ? wristHeight(cur) : 0.5;
      const liveRoomX = cur ? clamp((bodyCentreX(cur) - 0.5) * 1.4, -0.9, 0.9) : 0;
      audioRef.current?.updateLive(liveE, liveH);

      // ── advance + sound every looping past self ──────────────────────────────
      const loops = loopsRef.current;
      let loopEnergy = 0;
      for (const lp of loops) {
        const idx =
          ((Math.floor((age - lp.bornAt) * REC_FPS) % lp.frameCount) +
            lp.frameCount) %
          lp.frameCount;
        const e = lp.energies[idx];
        loopEnergy += e;
        audioRef.current?.updateLoop(lp.id, e, lp.heights[idx]);
      }

      // ── the room glow breathes with the total motion (smooth, no strobe) ─────
      const glowTarget = clamp01(liveE * 0.9 + loopEnergy * 0.1);
      roomLevelRef.current += (glowTarget - roomLevelRef.current) * (reduced ? 0.03 : 0.07);

      // ── draw ─────────────────────────────────────────────────────────────────
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRoom(ctx, w, h, roomLevelRef.current);

      // Ghosts, far → near so nearer selves layer on top.
      const ordered = [...loops].sort((a, b) => b.roomZ - a.roomZ);
      for (const lp of ordered) {
        const idx =
          ((Math.floor((age - lp.bornAt) * REC_FPS) % lp.frameCount) +
            lp.frameCount) %
          lp.frameCount;
        const proj = projectFrame(lp.frames[idx], lp.roomX, lp.roomZ, w, h);
        const e = lp.energies[idx];
        drawBody(ctx, proj, {
          color: GHOST_TINTS[lp.tint],
          alpha: (0.3 + e * 0.24) * (1 - lp.roomZ * 0.35),
          lineWidth: lerp(3.4, 1.7, lp.roomZ),
          glow: e,
          live: false,
        });
      }

      // The present self, bright and near.
      if (cur) {
        const proj = projectFrame(cur, liveRoomX, 0.03, w, h);
        drawBody(ctx, proj, {
          color: LIVE_TINT,
          alpha: 0.94,
          lineWidth: 4,
          glow: Math.max(liveE, 0.08),
          live: true,
        });
      }

      metricsRef.current = {
        joints,
        loops: loops.length,
        mode: modeRef.current,
        recording: recordingRef.current,
      };
    },
    [readCamera, commitLoop, finishRecording],
  );

  // ── mount: renderer + always-on loop (the demo needs no audio, no camera) ────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    demoRef.current = new DemoDancer(SEED);

    lastNowRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);

    const hud = window.setInterval(() => {
      setMetrics({ ...metricsRef.current });
    }, 150);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      audioRef.current?.stop();
      audioRef.current = null;
      audioOnRef.current = false;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // runFrame is stable (useCallback with stable deps); intentional one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── controls ─────────────────────────────────────────────────────────────────
  const beginAudio = useCallback(async () => {
    if (audioOnRef.current) return;
    try {
      const audio = new LoomAudio();
      await audio.start();
      // Give a voice to every ghost already standing in the room.
      for (const lp of loopsRef.current) {
        audio.addLoop(lp.id, lp.roomX, 0, lp.roomZ, lp.tint);
      }
      audioRef.current = audio;
      audioOnRef.current = true;
      setAudioOn(true);
      setNotice(null);
    } catch {
      setNotice("This browser blocked audio — the room keeps looping silently.");
    }
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraStatus === "loading" || cameraStatus === "on") return;
    setNotice(null);
    setCameraStatus("loading");
    if (!audioOnRef.current) await beginAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const landmarker = await makePoseLandmarker();
      landmarkerRef.current = landmarker;
      // Fresh room: the canon should be YOUR past selves, not the demo's.
      clearRoom();
      recBufferRef.current = [];
      lastRecFrameRef.current = null;
      modeRef.current = "camera";
      setCameraStatus("on");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "demo";
      setCameraStatus("off");
      const denied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setNotice(
        denied
          ? "Camera permission was denied — the seeded demo dancer keeps building the canon."
          : "The camera or the MediaPipe pose model couldn't load (needs network + WebGL/WASM). The seeded demo dancer keeps building the canon.",
      );
    }
  }, [beginAudio, cameraStatus, clearRoom]);

  const toggleRecord = useCallback(() => {
    if (recordingRef.current) {
      finishRecording();
    } else {
      recBufferRef.current = [];
      recordingRef.current = true;
      setRecording(true);
    }
  }, [finishRecording]);

  const cameraLive = cameraStatus === "on";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Header chrome — semantic tokens only */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11840-bodyloom
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Bodyloom
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            A room that records and loops your moving body. Each gesture you
            commit keeps looping as a voice placed where you stood — so an empty,
            silent space slowly fills with a spatial canon of your own past
            selves.
          </p>
          {notice ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">
              {notice}
            </p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          {!audioOn ? (
            <button
              type="button"
              onClick={beginAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin · sound the room
            </button>
          ) : !cameraLive ? (
            <button
              type="button"
              onClick={enableCamera}
              disabled={cameraStatus === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {cameraStatus === "loading"
                ? "Waking the camera…"
                : "Use my body (camera)"}
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleRecord}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {recording ? "Commit the loop" : "Record a loop"}
            </button>
          )}

          {(audioOn || cameraLive) && (
            <button
              type="button"
              onClick={clearRoom}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear room
            </button>
          )}
        </div>

        {/* Live readouts */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <span>source: {metrics.mode === "camera" ? "your body" : "demo dancer"}</span>
          <span>joints: {metrics.joints}</span>
          <span>loops in room: {metrics.loops}</span>
          <span>
            state:{" "}
            {metrics.mode === "demo"
              ? "auto-looping"
              : metrics.recording
                ? "recording"
                : "watching"}
          </span>
        </div>
      </div>

      {/* Design notes button */}
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {notesOpen ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              A canon of past selves
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The camera reads your full-body pose through MediaPipe&apos;s
                PoseLandmarker (33 joints). Sound exists only from motion: each
                body — the live one you drive, plus every committed loop — owns a
                single warm voice placed in the room through a real HRTF panner.
                Its loudness follows how fast that body is moving and its pitch
                follows how high your hands are lifted, so a still body falls
                silent.
              </p>
              <p>
                The fresh verb is record → loop → layer. Commit a gesture and it
                becomes a looping ghost-self standing where you stood, still
                singing its recorded motion, while you record another over it.
                An empty, silent room slowly fills with a polyphonic canon —
                minute two never sounds like minute zero.
              </p>
              <p>
                The perception–action loop — move, hear yourself, and let the
                sound shape the next move — is ported from &ldquo;Designing
                Interactive Movement Sonification for Hip-Hop Dance&rdquo; (CHI
                2026). The responsive-room lineage is Myron Krueger&apos;s{" "}
                <em>Videoplace</em> (1975): a space that answers the moving body.
                Here the room does more than answer — it remembers.
              </p>
              <p>
                Degrades gracefully: a seeded, deterministic demo dancer records
                and loops from the moment the page mounts, with no camera and no
                audio, so the whole idea is visible within about two seconds. If
                the MediaPipe CDN or the camera is unavailable, the demo keeps
                dancing and a notice explains. Nothing uses Math.random or the
                wall clock.
              </p>
              <p>
                Safety: motion is smooth and there is no flashing or strobe; the
                room glow only breathes slowly with the overall sound. Reduced
                motion calms the dancer and the glow further.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["11840-bodyloom"]} />
    </main>
  );
}
