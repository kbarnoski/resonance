"use client";

// 9864 · Handroom
// "What if instead of walking a room, you stood still and CONDUCTED it — reached
//  your bare hands into a binaural 3-D field and grabbed, lifted, and placed the
//  just-intonation voices around your own head, sculpting the spatial chord?"
//
// You (the AudioListener) are FIXED at the origin. Six HRTF voices float on a
// sphere around your head. Your hands are grabbers: bring a hand near a voice
// and pinch to grab, then move it — near swells, far recedes, height brightens.
//
// Degrade ladder: MediaPipe Hands → frame-diff blob → pointer drag → a seeded
// synthetic conductor that plays the room by itself. The VISUAL auto-demo runs
// from frame one; audio starts on the first user gesture.

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { HandroomAudio } from "./audio";
import {
  makeHandLandmarker,
  readMediaPipeHands,
  FrameDiffTracker,
  Conductor,
  cameraSupported,
  type HandLandmarkerLike,
  type HandObservation,
} from "./hands";
import {
  N_SOURCES,
  RATIO_LABELS,
  homePosition,
  handToTarget,
  project,
  heightNorm,
  type Vec3,
  type Projected,
} from "./field";

// Canvas-art palette (raw hex allowed ONLY here).
const INK = "#e8e8e8";
const DIM = "#3a3a3a";
const BG = "#050505";
const RED = "#ff2200"; // the one Ikeda accent — held / active

type Mode = "auto" | "pointer" | "camera";

interface Source {
  pos: Vec3;
  held: boolean;
}
interface HandSlot {
  active: boolean;
  x: number; // normalized 0..1 screen
  y: number;
  grab: boolean;
  grabLatch: boolean;
  heldSource: number; // -1 = none
}
interface Readout {
  mode: Mode;
  tracker: "mediapipe" | "frame-diff" | "none";
  heldCount: number;
  activeIdx: number;
  pos: Vec3 | null;
  gain: number;
}

const GRAB_RADIUS = 70; // css px

export default function HandroomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<HandroomAudio | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const frameDiffRef = useRef<FrameDiffTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const conductorRef = useRef<Conductor | null>(null);

  const rafRef = useRef<number | null>(null);
  const startMsRef = useRef<number>(0);
  const prevMsRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const monoRef = useRef<number>(0);
  const orbitRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const dprRef = useRef<number>(1);

  const modeRef = useRef<Mode>("auto");
  const trackerRef = useRef<"mediapipe" | "frame-diff" | "none">("none");
  const cameraLiveRef = useRef<boolean>(false);
  const pointerDownRef = useRef<boolean>(false);
  const camObsRef = useRef<HandObservation[]>([]);

  const sourcesRef = useRef<Source[]>(
    Array.from({ length: N_SOURCES }, (_, i) => ({
      pos: { ...homePosition(i) },
      held: false,
    })),
  );
  const projRef = useRef<Projected[]>(new Array(N_SOURCES));
  const slotsRef = useRef<HandSlot[]>([
    { active: false, x: 0.4, y: 0.5, grab: false, grabLatch: false, heldSource: -1 },
    { active: false, x: 0.6, y: 0.5, grab: false, grabLatch: false, heldSource: -1 },
  ]);
  const ghostRef = useRef<{ x: number; y: number; grab: boolean }>({
    x: 0.5,
    y: 0.5,
    grab: false,
  });
  const readoutRef = useRef<Readout>({
    mode: "auto",
    tracker: "none",
    heldCount: 0,
    activeIdx: -1,
    pos: null,
    gain: 0,
  });

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">("off");
  const [note, setNote] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>(readoutRef.current);
  const [hasCamera] = useState<boolean>(() =>
    typeof window === "undefined" ? true : cameraSupported(),
  );

  // ── Read camera hands (MediaPipe or frame-diff), null = no fresh frame ──────
  const readCamera = useCallback((nowMs: number): HandObservation[] | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    if (video.currentTime === lastVideoTimeRef.current) return null;
    lastVideoTimeRef.current = video.currentTime;

    const lm = landmarkerRef.current;
    if (lm) {
      monoRef.current = Math.max(monoRef.current + 1, nowMs);
      try {
        return readMediaPipeHands(lm, video, monoRef.current);
      } catch {
        return null;
      }
    }
    const fd = frameDiffRef.current;
    if (fd) {
      const obs = fd.sample(video, nowMs);
      return obs ? [obs] : [];
    }
    return null;
  }, []);

  // ── The frame loop ──────────────────────────────────────────────────────────
  const runFrame = useCallback(
    (nowMs: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (startMsRef.current === 0) startMsRef.current = nowMs;
      const t = (nowMs - startMsRef.current) / 1000;
      let dt = (nowMs - prevMsRef.current) / 1000;
      prevMsRef.current = nowMs;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      const reduced = reducedRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const audio = audioRef.current;
      const sources = sourcesRef.current;

      // Slow orbit keeps the field visibly alive even muted.
      orbitRef.current += dt * (reduced ? 0.04 : 0.11);
      const orbit = orbitRef.current;

      // Project every source now — used for grab-picking + drawing.
      const proj = projRef.current;
      for (let i = 0; i < N_SOURCES; i++) {
        proj[i] = project(sources[i].pos, orbit, w, h);
      }

      // Determine the active mode.
      let mode: Mode;
      if (cameraLiveRef.current) mode = "camera";
      else if (pointerDownRef.current) mode = "pointer";
      else mode = "auto";
      modeRef.current = mode;

      // Build the set of held targets: sourceIndex → target Vec3.
      const targets = new Map<number, Vec3>();

      if (mode === "camera" || mode === "pointer") {
        let obs: HandObservation[] | null;
        if (mode === "camera") {
          const fresh = readCamera(nowMs);
          if (fresh !== null) camObsRef.current = fresh;
          obs = camObsRef.current;
        } else {
          const s = slotsRef.current[0];
          obs = pointerDownRef.current
            ? [{ x: s.x, y: s.y, grab: true }]
            : [];
        }
        const slots = slotsRef.current;
        const nHands = mode === "pointer" ? 1 : 2;
        for (let i = 0; i < nHands; i++) {
          const slot = slots[i];
          const o = obs[i];
          if (!o) {
            slot.active = false;
            slot.grab = false;
            slot.grabLatch = false;
            slot.heldSource = -1;
            continue;
          }
          slot.active = true;
          const k = reduced ? 0.35 : 0.55;
          slot.x += (o.x - slot.x) * (mode === "pointer" ? 1 : k);
          slot.y += (o.y - slot.y) * (mode === "pointer" ? 1 : k);
          // grab rising edge → latch nearest source in screen space
          if (o.grab && !slot.grabLatch) {
            slot.grabLatch = true;
            const hx = slot.x * w;
            const hy = slot.y * h;
            let best = -1;
            let bestD = GRAB_RADIUS;
            for (let s = 0; s < N_SOURCES; s++) {
              if (targets.has(s)) continue;
              const d = Math.hypot(proj[s].sx - hx, proj[s].sy - hy);
              if (d < bestD) {
                bestD = d;
                best = s;
              }
            }
            slot.heldSource = best;
          } else if (!o.grab) {
            slot.grabLatch = false;
            slot.heldSource = -1;
          }
          slot.grab = o.grab;
          if (slot.heldSource >= 0) {
            targets.set(slot.heldSource, handToTarget(slot.x, slot.y));
          }
        }
      } else {
        // auto — the seeded conductor plays the room by itself.
        const cmd = conductorRef.current?.step(t) ?? { heldIndex: -1, target: null };
        if (cmd.heldIndex >= 0 && cmd.target) {
          targets.set(cmd.heldIndex, cmd.target);
          // Ghost hand hovers over the held voice.
          const p = proj[cmd.heldIndex];
          ghostRef.current.x += (p.sx / w - ghostRef.current.x) * 0.2;
          ghostRef.current.y += (p.sy / h - ghostRef.current.y) * 0.2;
          ghostRef.current.grab = true;
        } else {
          ghostRef.current.grab = false;
        }
      }

      // Integrate sources toward their target (held) or home (free).
      for (let i = 0; i < N_SOURCES; i++) {
        const src = sources[i];
        const tgt = targets.get(i);
        src.held = tgt !== undefined;
        const goal = tgt ?? homePosition(i);
        const k = src.held ? (reduced ? 0.12 : 0.2) : reduced ? 0.03 : 0.05;
        src.pos.x += (goal.x - src.pos.x) * k;
        src.pos.y += (goal.y - src.pos.y) * k;
        src.pos.z += (goal.z - src.pos.z) * k;
        audio?.setSource(i, src.pos, src.held);
      }

      // Re-project after integration for a tight draw.
      for (let i = 0; i < N_SOURCES; i++) {
        proj[i] = project(sources[i].pos, orbit, w, h);
      }

      draw(ctx, w, h, sources, proj, orbit, mode, slotsRef.current, ghostRef.current);

      // Publish readout.
      let activeIdx = -1;
      let heldCount = 0;
      for (let i = 0; i < N_SOURCES; i++) {
        if (sources[i].held) {
          heldCount++;
          if (activeIdx < 0) activeIdx = i;
        }
      }
      readoutRef.current = {
        mode,
        tracker: trackerRef.current,
        heldCount,
        activeIdx,
        pos: activeIdx >= 0 ? { ...sources[activeIdx].pos } : null,
        gain: activeIdx >= 0 && audio ? audio.displayGain[activeIdx] : 0,
      };
    },
    [readCamera],
  );

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    conductorRef.current = new Conductor(reducedRef.current);

    const canvas = canvasRef.current;
    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    prevMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);

    const hud = window.setInterval(() => {
      setReadout({ ...readoutRef.current });
    }, 160);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      window.removeEventListener("resize", resize);
      audioRef.current?.stop();
      audioRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      frameDiffRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
    // runFrame is stable; intentional one-shot mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Audio (first user gesture) ──────────────────────────────────────────────
  const beginAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = new HandroomAudio();
      await audio.start();
      audioRef.current = audio;
      setAudioOn(true);
      if (!audio.hrtf) {
        setNote(
          "HRTF panning isn't supported here — using equal-power stereo. The chord still moves around you.",
        );
      }
    } catch (err) {
      setNote(
        "Web Audio could not start on this device — the visual room keeps running silently. " +
          (err instanceof Error ? err.message : ""),
      );
    }
  }, []);

  // ── Camera (opt-in) + degrade ───────────────────────────────────────────────
  const enableCamera = useCallback(async () => {
    if (cameraStatus === "loading" || cameraStatus === "on") return;
    if (!hasCamera) {
      setNote(
        "No camera API in this browser — drag the voices with the pointer, or just watch the room conduct itself.",
      );
      return;
    }
    setNote(null);
    setCameraStatus("loading");
    if (!audioRef.current) await beginAudio();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCameraStatus("off");
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setNote(
        denied
          ? "Camera permission was denied — the room keeps conducting itself; you can also drag voices with the pointer."
          : "The camera couldn't open — the room keeps conducting itself; drag voices with the pointer instead.",
      );
      return;
    }

    // Tier 1: try MediaPipe; Tier 2: fall to frame-diff on any failure.
    try {
      const lm = await makeHandLandmarker();
      landmarkerRef.current = lm;
      trackerRef.current = "mediapipe";
    } catch {
      try {
        frameDiffRef.current = new FrameDiffTracker();
        trackerRef.current = "frame-diff";
        setNote(
          "MediaPipe Hands couldn't load (needs network + WebGL/WASM) — falling back to motion tracking: hold your hand still over a voice to grab it.",
        );
      } catch {
        // Tier 3: no tracking at all — release the camera, keep pointer + auto.
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setCameraStatus("off");
        trackerRef.current = "none";
        setNote(
          "Hand tracking is unavailable here — drag the voices with the pointer, or watch the room conduct itself.",
        );
        return;
      }
    }
    cameraLiveRef.current = true;
    setCameraStatus("on");
  }, [beginAudio, cameraStatus, hasCamera]);

  // ── Pointer fallback (Tier 3) ───────────────────────────────────────────────
  const pointerPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (cameraLiveRef.current) return;
      if (!audioRef.current) void beginAudio();
      const p = pointerPos(e);
      const s = slotsRef.current[0];
      s.x = p.x;
      s.y = p.y;
      s.active = true;
      s.grabLatch = false; // rising edge next frame grabs nearest
      pointerDownRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [beginAudio, pointerPos],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerDownRef.current) return;
      const p = pointerPos(e);
      const s = slotsRef.current[0];
      s.x = p.x;
      s.y = p.y;
    },
    [pointerPos],
  );
  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
    const s = slotsRef.current[0];
    s.active = false;
    s.grab = false;
    s.grabLatch = false;
    s.heldSource = -1;
  }, []);

  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        {/* Top */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              9864 · Handroom
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Conduct the room with your hands
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              You stand still at the center of a binaural chord. Reach in, grab a
              voice, and place it around your head — pull it close to swell it,
              lift it to make it bloom.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Bottom */}
        <div className="flex flex-col gap-4">
          {note && (
            <p className="max-w-xl text-sm leading-relaxed text-destructive">{note}</p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={hasCamera ? enableCamera : beginAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {hasCamera ? "Start camera — reach in" : "Start the sound"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={cameraStatus === "on" || cameraStatus === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {cameraStatus === "loading"
                    ? "Loading hand tracking…"
                    : cameraStatus === "on"
                      ? "Camera live — grab a voice"
                      : "Enable camera"}
                </button>
              )}
              {!audioOn && (
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  or drag a voice with the pointer
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                mode:{" "}
                {readout.mode === "auto"
                  ? "auto-conductor"
                  : readout.mode === "camera"
                    ? `camera · ${readout.tracker}`
                    : "pointer"}
              </span>
              <span>held: {readout.heldCount}</span>
              {readout.activeIdx >= 0 && readout.pos ? (
                <>
                  <span>
                    voice {readout.activeIdx + 1} · {RATIO_LABELS[readout.activeIdx]}
                  </span>
                  <span>
                    xyz [{fmt(readout.pos.x)} {fmt(readout.pos.y)} {fmt(readout.pos.z)}]
                  </span>
                  <span>gain {readout.gain.toFixed(2)}</span>
                </>
              ) : (
                <span>no voice held</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Handroom
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The listener never moves. Six voices — a just-intonation chord
              (1/1, 9/8, 5/4, 3/2, 5/3, 15/8) over a ~131&nbsp;Hz fundamental —
              each run through their own HRTF <code>PannerNode</code> in 3-D space
              around your head. Grab one and it pulls in close and swells; lift it
              and a per-voice lowpass opens so it blooms brighter.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Input degrades in four tiers: MediaPipe Hands (pinch to grab) →
              webcam frame-difference blob (hold still to grab) → pointer drag →
              a seeded synthetic conductor that grabs and orbits the voices by
              itself, so the room is alive before you touch anything. Audio starts
              on your first gesture; the visual conducts from frame one.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              After the spatial-sound lineage of Bernhard Leitner and Maryanne
              Amacher, and the browser hand-tracking instruments of 2026: the
              chord as a sculpture you shape in the air around your own head.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9864-handroom"]} />
    </div>
  );
}

// ── Canvas2D render (raw hex art only) ────────────────────────────────────────
function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sources: Source[],
  proj: Projected[],
  orbit: number,
  mode: Mode,
  slots: HandSlot[],
  ghost: { x: number; y: number; grab: boolean },
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Faint sphere scaffold: a few orbit rings projected around the head.
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 3; ring++) {
    const rr = 2.4;
    const yLevel = (ring - 1) * 0.9;
    ctx.beginPath();
    for (let a = 0; a <= 48; a++) {
      const az = (a / 48) * Math.PI * 2;
      const p = project({ x: rr * Math.sin(az), y: yLevel, z: rr * Math.cos(az) }, orbit, w, h);
      if (a === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Sort sources far→near for painter's algorithm.
  const order = sources.map((_, i) => i).sort((a, b) => proj[a].z - proj[b].z);

  for (const i of order) {
    const p = proj[i];
    const src = sources[i];
    const scale = Math.max(0.35, Math.min(2.2, p.scale));
    // Radial tether from head to voice.
    ctx.strokeStyle = src.held ? RED : DIM;
    ctx.globalAlpha = src.held ? 0.5 : 0.22;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.sx, p.sy);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const bright = heightNorm(src.pos.y); // brighter when lifted
    const rad = 5 + scale * 9 + bright * 5;

    // Glow.
    const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad * 2.4);
    glow.addColorStop(0, src.held ? RED : INK);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.18 + 0.24 * scale * (0.4 + bright * 0.6);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, rad * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Core.
    ctx.fillStyle = src.held ? RED : INK;
    ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, scale);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Held ring.
    if (src.held) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, rad + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ratio label.
    ctx.fillStyle = src.held ? RED : INK;
    ctx.globalAlpha = 0.75;
    ctx.font = `${Math.round(9 + scale * 3)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(RATIO_LABELS[i], p.sx, p.sy - rad - 10);
    ctx.globalAlpha = 1;
  }

  // Central head marker — "you", the fixed listener.
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy + 20);
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawHands(ctx, w, h, mode, slots, ghost);
}

function drawHands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: Mode,
  slots: HandSlot[],
  ghost: { x: number; y: number; grab: boolean },
): void {
  const cursors: { x: number; y: number; grab: boolean; ghost: boolean }[] = [];
  if (mode === "camera") {
    for (const s of slots) {
      if (s.active) cursors.push({ x: s.x, y: s.y, grab: s.grab, ghost: false });
    }
  } else if (mode === "pointer") {
    const s = slots[0];
    if (s.active) cursors.push({ x: s.x, y: s.y, grab: s.grab, ghost: false });
  } else {
    cursors.push({ x: ghost.x, y: ghost.y, grab: ghost.grab, ghost: true });
  }

  for (const c of cursors) {
    const px = c.x * w;
    const py = c.y * h;
    ctx.strokeStyle = c.grab ? RED : INK;
    ctx.lineWidth = c.ghost ? 1.5 : 2;
    if (c.ghost) ctx.setLineDash([4, 4]);
    ctx.globalAlpha = c.ghost ? 0.6 : 0.9;
    // open hand = ring; grab = smaller filled-accent ring + crosshair
    ctx.beginPath();
    ctx.arc(px, py, c.grab ? 14 : 22, 0, Math.PI * 2);
    ctx.stroke();
    if (c.grab) {
      ctx.fillStyle = RED;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(px - 8, py);
      ctx.lineTo(px + 8, py);
      ctx.moveTo(px, py - 8);
      ctx.lineTo(px, py + 8);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
