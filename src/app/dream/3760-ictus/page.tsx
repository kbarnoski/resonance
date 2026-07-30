"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 3760 · Ictus
// "What if your whole BODY conducts the beat — the moment your hand or foot
//  strikes a virtual surface places a downbeat on the bar grid, and between
//  strikes your limb positions morph the timbre?"
//
// Contact-aware metric placement (after MotionBeat, ICASSP 2026): a bodily
// CONTACT carries the beat. Each strike is quantised onto a fixed 90-BPM bar
// grid. Land on-grid → it LOCKS into a looping pattern that plays back and
// pulses; land off-grid → it FLAMS/ghosts and is rejected. Your timing is the
// stakes. Between strikes, torso lean / arm spread / hand height sculpt the pad.
//
// Six wired subsystems:
//   1. Camera capture           — getUserMedia → hidden <video>
//   2. MediaPipe PoseLandmarker — wrists + ankles, CDN at runtime
//   3. Strike detection         — downward-velocity spikes crossing a plane
//   4. Metric grid + loop store  — quantise contacts, lock/flam, replay
//   5. Web Audio instrument      — 4 strike voices + body-shaped pad + click
//   6. three.js scene            — bar-grid ring, playhead, blooming markers
//
// Degrades gracefully: no camera? keyboard (1-4 / f g h j / space) and pointer
// place strikes against the same grid, so the timing game is fully playable on
// a desktop with sound + visuals.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { IctusAudio } from "./audio";
import {
  createPoseLandmarker,
  LIMB_LABELS,
  type PoseLandmarkerInst,
} from "./poseLoader";
import {
  GrooveMeter,
  Loop,
  makeGrid,
  quantize,
  type Grid,
} from "./sequencer";
import { IctusScene, type LimbView } from "./scene";
import {
  computeTimbre,
  readStrikeLimbs,
  StrikeTracker,
  type LimbPoint,
} from "./strike";

const BPM = 90;
const TOL = 0.1; // on-grid window (seconds) — ±100 ms at 90 BPM eighth grid
const KEY_LIMB: Record<string, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3,
  f: 0, g: 1, h: 2, j: 3,
  " ": 0,
};

type CamStatus = "off" | "requesting" | "on" | "denied" | "unavailable";

interface Readout {
  beat: number; // 1..4
  groove: number; // 0..1
  contacts: number;
  last: { onGrid: boolean; errorMs: number; limb: number } | null;
  live: boolean;
}

export default function IctusPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // engine objects (stable across renders)
  const gridRef = useRef<Grid>(makeGrid(BPM));
  const loopRef = useRef<Loop>(new Loop());
  const grooveRef = useRef<GrooveMeter>(new GrooveMeter());
  const trackerRef = useRef<StrikeTracker>(new StrikeTracker());
  const sceneRef = useRef<IctusScene | null>(null);
  const audioRef = useRef<IctusAudio | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastMsRef = useRef<number>(0);
  const startMsRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const camOnRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);
  const lastPoseTimeRef = useRef<number>(0);

  const limbPtsRef = useRef<LimbPoint[] | null>(null);
  const timbreRef = useRef({ lean: 0.5, spread: 0.4, height: 0.4 });
  const timbreTargetRef = useRef({ lean: 0.5, spread: 0.4, height: 0.4 });
  const limbFlashRef = useRef<number[]>([0, 0, 0, 0]);
  const downEnvRef = useRef<number>(0);
  const lastHitRef = useRef<Readout["last"]>(null);
  const hitCountRef = useRef<number>(0);
  const liveRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [camStatus, setCamStatus] = useState<CamStatus>("off");
  const [webglError, setWebglError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    beat: 1,
    groove: 0,
    contacts: 0,
    last: null,
    live: false,
  });

  const currentElapsed = useCallback((): number => {
    if (!playingRef.current) return 0;
    return (performance.now() - startMsRef.current) / 1000;
  }, []);

  // ── register one contact against the grid: lock (on-grid) or flam (off) ──
  const registerStrike = useCallback(
    (limb: number, strength: number, elapsed: number) => {
      if (!playingRef.current) return;
      const grid = gridRef.current;
      const barTime =
        ((elapsed % grid.barPeriod) + grid.barPeriod) % grid.barPeriod;
      const q = quantize(barTime, grid, TOL);
      grooveRef.current.onHit(q.onGrid, q.errorFrac);
      limbFlashRef.current[limb] = 1;
      sceneRef.current?.onStrike(limb);
      if (q.onGrid) {
        loopRef.current.lock(q.slot, limb, strength);
        sceneRef.current?.onLock(q.slot, limb, strength);
        audioRef.current?.hit(limb, strength);
      } else {
        audioRef.current?.flam(limb, strength);
        sceneRef.current?.onGhost(q.barFrac);
      }
      lastHitRef.current = {
        onGrid: q.onGrid,
        errorMs: q.errorSec * 1000,
        limb,
      };
      hitCountRef.current++;
    },
    [],
  );

  // ── read pose, track limbs, detect strikes, update timbre target ──
  const runPose = useCallback(
    (elapsed: number) => {
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (!lm || !video || video.readyState < 2) return;
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;
      monoRef.current = Math.max(monoRef.current + 1, performance.now());
      let result;
      try {
        result = lm.detectForVideo(video, monoRef.current);
      } catch {
        return;
      }
      const first = result.landmarks[0];
      if (!first) {
        liveRef.current = false;
        limbPtsRef.current = null;
        return;
      }
      liveRef.current = true;
      const limbs = readStrikeLimbs(first);
      limbPtsRef.current = limbs;
      timbreTargetRef.current = computeTimbre(first);

      const poseDt =
        lastPoseTimeRef.current > 0 ? elapsed - lastPoseTimeRef.current : 0.033;
      lastPoseTimeRef.current = elapsed;
      const ys = limbs.map((p) => (p.present ? p.yRaw : null));
      const strikes = trackerRef.current.update(ys, elapsed, poseDt);
      for (const s of strikes) registerStrike(s.limb, s.strength, elapsed);
    },
    [registerStrike],
  );

  // ── the render + beat loop — runs from mount, silent until "Start" ──
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    if (mountRef.current) {
      try {
        sceneRef.current = new IctusScene(mountRef.current, reducedRef.current);
      } catch {
        setWebglError(true);
      }
    }

    lastMsRef.current = performance.now();
    let readoutAcc = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const nowMs = performance.now();
      let dt = (nowMs - lastMsRef.current) / 1000;
      lastMsRef.current = nowMs;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const grid = gridRef.current;
      const elapsed = playingRef.current
        ? (nowMs - startMsRef.current) / 1000
        : 0;

      // pose / strike input
      if (camOnRef.current) runPose(elapsed);

      // continuous timbre → audio (smoothed toward target)
      const tg = timbreTargetRef.current;
      const cur = timbreRef.current;
      const k = Math.min(1, dt * 6);
      cur.lean += (tg.lean - cur.lean) * k;
      cur.spread += (tg.spread - cur.spread) * k;
      cur.height += (tg.height - cur.height) * k;
      audioRef.current?.setTimbre(cur.lean, cur.spread, cur.height);

      // advance the grid: metronome clicks + looped playback
      if (playingRef.current) {
        const events = loopRef.current.advance(elapsed, grid);
        for (const e of events) {
          audioRef.current?.click(e.isDownbeat ? 2 : e.isBeat ? 1 : 0);
          if (e.isDownbeat) downEnvRef.current = 1;
          for (const hit of e.hits) {
            audioRef.current?.hit(hit.limb, hit.strength);
            sceneRef.current?.onPulse(e.slot, hit.limb);
          }
        }
      }

      // decay envelopes
      downEnvRef.current = Math.max(0, downEnvRef.current - dt * 3);
      for (let i = 0; i < 4; i++) {
        limbFlashRef.current[i] = Math.max(0, limbFlashRef.current[i] - dt * 3);
      }
      grooveRef.current.decay(dt);

      // build limb views for the scene
      const pts = limbPtsRef.current;
      const limbViews: LimbView[] = [];
      for (let l = 0; l < 4; l++) {
        const p = pts?.[l];
        limbViews.push({
          x: p?.x ?? 0,
          y: p?.y ?? 0,
          present: camOnRef.current && liveRef.current && !!p?.present,
          flash: limbFlashRef.current[l],
        });
      }

      const phaseFrac = playingRef.current
        ? (elapsed % grid.barPeriod) / grid.barPeriod
        : 0;

      sceneRef.current?.update(
        {
          limbs: limbViews,
          phase: phaseFrac,
          downbeatPulse: downEnvRef.current,
          groove: grooveRef.current.score,
          lean: cur.lean,
        },
        dt,
      );

      // throttled readout
      readoutAcc += dt;
      if (readoutAcc > 0.1) {
        readoutAcc = 0;
        const beat =
          playingRef.current
            ? (Math.floor((elapsed % grid.barPeriod) / grid.beatPeriod) % 4) + 1
            : 1;
        setReadout({
          beat,
          groove: grooveRef.current.score,
          contacts: loopRef.current.count(),
          last: lastHitRef.current,
          live: camOnRef.current && liveRef.current,
        });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    const onKey = (ev: KeyboardEvent) => {
      const limb = KEY_LIMB[ev.key];
      if (limb === undefined) return;
      if (!playingRef.current) return;
      if (ev.key === " ") ev.preventDefault();
      registerStrike(limb, 0.9, currentElapsed());
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // runPose / registerStrike / currentElapsed are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── primary action: start audio + the grid clock ──
  const start = useCallback(async () => {
    if (playingRef.current) return;
    try {
      const audio = new IctusAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      // Audio failed to start (rare); the grid + scene still run silently.
      audioRef.current = null;
    }
    startMsRef.current = performance.now();
    playingRef.current = true;
    setPhase("playing");
  }, []);

  // ── secondary: request camera + load the pose model ──
  const enableCamera = useCallback(async () => {
    if (camOnRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus("unavailable");
      return;
    }
    if (!playingRef.current) await start();
    setCamStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      landmarkerRef.current = await createPoseLandmarker();
      trackerRef.current.reset();
      camOnRef.current = true;
      setCamStatus("on");
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      camOnRef.current = false;
      setCamStatus("denied");
    }
  }, [start]);

  // ── pointer fallback: move = timbre, tap = strike a zone-mapped limb ──
  const onPointerMove = useCallback((ev: React.PointerEvent) => {
    if (camOnRef.current) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    timbreTargetRef.current = {
      lean: Math.max(0, Math.min(1, x)),
      spread: Math.max(0, Math.min(1, Math.abs(x - 0.5) * 2)),
      height: Math.max(0, Math.min(1, 1 - y)),
    };
  }, []);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      if (!playingRef.current || camOnRef.current) return;
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      const limb = Math.max(0, Math.min(3, Math.floor(x * 4)));
      registerStrike(limb, 0.9, currentElapsed());
    },
    [registerStrike, currentElapsed],
  );

  const clearLoop = useCallback(() => {
    loopRef.current.clear();
    sceneRef.current?.clearMarkers();
    hitCountRef.current = 0;
    lastHitRef.current = null;
  }, []);

  const groovePct = Math.round(readout.groove * 100);
  const locked = readout.groove > 0.6;

  return (
    <main
      className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
    >
      {/* three.js output */}
      <div ref={mountRef} className="absolute inset-0" />

      {webglError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-base text-destructive">
            WebGL is unavailable, so the ring can&apos;t render — the grid and
            sound still run. Use 1-4 / f g h j to strike on the beat.
          </p>
        </div>
      )}

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto max-w-md">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  readout.live
                    ? "bg-primary/20 text-primary"
                    : "bg-accent text-muted-foreground"
                }`}
              >
                {readout.live ? "● Body" : "◐ Keys / Pointer"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                3760 · ictus
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Your body conducts the beat
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Strike a virtual surface with a hand or foot on the beat and it
              locks into a loop; miss and it flams. Between strikes, your lean,
              arm spread, and hand height sculpt the sound.
            </p>
          </div>

          <Link
            href="/dream"
            className="pointer-events-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream
          </Link>
        </div>
      </div>

      {/* live video thumbnail (frames stay local) */}
      <video
        ref={videoRef}
        className={`absolute right-5 top-28 h-20 w-28 -scale-x-100 rounded-md border border-border object-cover opacity-60 sm:top-32 ${
          camStatus === "on" ? "block" : "hidden"
        }`}
        muted
        playsInline
      />

      {/* bottom chrome: readouts + meter + controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 sm:p-7">
        {/* readout row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            <span className="text-foreground">{BPM}</span> bpm
          </span>
          <span className="flex items-center gap-1">
            beat
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={
                  n === readout.beat && phase === "playing"
                    ? "text-primary"
                    : "text-muted-foreground/40"
                }
              >
                {n}
              </span>
            ))}
          </span>
          <span>
            locked <span className="text-foreground">{readout.contacts}</span>
          </span>
          {readout.last && (
            <span className={readout.last.onGrid ? "text-primary" : "text-destructive"}>
              {readout.last.onGrid ? "lock" : "flam"} ·{" "}
              {LIMB_LABELS[readout.last.limb]} ·{" "}
              {readout.last.errorMs >= 0 ? "+" : ""}
              {Math.round(readout.last.errorMs)}ms
            </span>
          )}
        </div>

        {/* groove-lock meter — the stakes */}
        <div className="max-w-xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              groove lock
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                locked ? "text-primary" : "text-muted-foreground/50"
              }`}
            >
              {locked ? "in the pocket" : "find the beat"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.max(2, groovePct)}%` }}
            />
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the grid
            </button>
          ) : (
            <button
              onClick={enableCamera}
              disabled={camStatus === "on" || camStatus === "requesting"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              {camStatus === "on"
                ? "Camera on — strike with your body"
                : camStatus === "requesting"
                  ? "Loading pose model…"
                  : "Use my camera"}
            </button>
          )}

          {phase === "playing" && (
            <button
              onClick={clearLoop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear loop
            </button>
          )}

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>

          {(camStatus === "denied" || camStatus === "unavailable") && (
            <span className="text-sm text-destructive">
              {camStatus === "denied"
                ? "Camera unavailable — play with 1-4 / f g h j / space, or tap the scene."
                : "No camera here — play with 1-4 / f g h j / space, or tap the scene."}
            </span>
          )}
          {phase === "playing" && camStatus !== "on" && (
            <span className="text-sm text-muted-foreground">
              Tap keys <span className="text-foreground">1 2 3 4</span> (or f g h
              j) on the beat. Move the pointer to shape the pad.
            </span>
          )}
        </div>

        <p className="max-w-xl font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Camera frames run the pose model on-device only — never uploaded, never
          stored.
        </p>
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}

      <PrototypeNav slugs={["3760-ictus"]} />
    </main>
  );
}

// ── design-notes overlay (non-hook helper) ──────────────────────────────────

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold tracking-tight">
          Ictus — design notes
        </h2>
        <div className="mt-3 space-y-3 text-base leading-relaxed text-muted-foreground">
          <p>
            An <em>ictus</em> is the instant of a conductor&apos;s beat. Here
            your body makes it: a hand or foot driven sharply downward through
            its virtual strike plane is a <em>contact</em>, and each contact is
            quantised onto a fixed 90-BPM eighth-note grid.
          </p>
          <p>
            Land within ±100 ms of a slot and the contact <em>locks</em> — it
            joins a one-bar loop, plays a clean voice, and blooms a glowing post
            on the ring that pulses every time the playhead comes around. Land
            outside the window and it <em>flams</em>: a darker, doubled hit and a
            red ghost that drifts off the ring. Your timing is the instrument.
          </p>
          <p>
            Between strikes your pose is a continuous controller — torso lean
            opens the filter, arm spread widens the chord voicing, and hand
            height lifts the register.
          </p>
          <p>
            Borrows the <em>contact-as-beat</em> framing from{" "}
            <strong>MotionBeat: Motion-Aligned Music Representation via
            Embodied Contrastive Learning</strong> (ICASSP 2026) — the insight
            that bodily contacts, not continuous motion, are the natural
            carriers of musical beat and downbeat. This is an interaction
            grammar, not their model.
          </p>
          <p className="text-muted-foreground/80">
            Pose sensing: MediaPipe Tasks-Vision PoseLandmarker, loaded from a
            CDN at runtime and run entirely on-device. No camera? Keys 1-4 / f g
            h j / space and the pointer place strikes against the same grid, so
            the timing game is fully playable on a desktop.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
