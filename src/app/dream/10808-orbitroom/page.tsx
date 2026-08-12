"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10808 · orbit•room — move through a room and hear the music orbit your body.
//
//   ONE QUESTION
//   What if you could physically move through a room and hear the music orbit
//   your body in binaural 3-D?
//
//   The lab's first embodied body-position → HRTF spatial-audio room. The front
//   camera reads the visitor as a moving SILHOUETTE CENTROID — model-free (no
//   MediaPipe, no TensorFlow, no network): frames are grabbed to a tiny 160×120
//   canvas, a slow running background mean is kept per pixel, |luma − mean| is
//   thresholded into a foreground mask, and its centroid (x,y) + area is taken
//   each frame. That gives horizontal position, vertical position and closeness.
//
//   Body position MOVES the WebAudio AudioListener through a virtual room ringed
//   with five soft inharmonic voices, each on a PannerNode in HRTF mode. Walk
//   left and the chord swings right; step toward the camera and you move deeper
//   into the ring — genuine binaural 3-D on headphones. Setters prefer
//   setTargetAtTime (~50 ms) so localisation doesn't smear under pose jitter.
//
//   OUTPUT is a Canvas2D top-down room map: a dark room, faint distance rings
//   around a bright you-dot, and the source-dots ringed around you — each dot
//   breathing with its gain, a line drawn to each showing its left/right
//   placement. The pan is SEEN even when a phone speaker can't render binaural.
//
//   FALLBACK — before "Begin", and whenever the camera is denied, a deterministic
//   seeded virtual performer drifts the body along a slow Lissajous orbit, so the
//   map animates and the sources orbit on their own (muted until the gesture).
//
//   REF  HRTF PannerNode binaural spatialisation + Google Omnitone /
//   Resonance-Audio ambisonic panning — the living web-spatial-audio technique
//   being ported — with a front camera standing in for a headset IMU as the pose
//   source (computer-vision → spatial-audio).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  makeOrbitAudio,
  sourceLayout,
  type OrbitAudio,
  type SourceView,
} from "./audio";
import {
  startSilhouette,
  makeVirtualRig,
  type SilhouetteRig,
  type SilhouetteMode,
} from "./silhouette";

const PERFORMER_SEED = 0x10808;

// Room half-extent (metres) drawn on the map; listener travel stays inside it.
const ROOM_HALF = 3.4;
const LISTENER_X = 1.7; // max lateral travel
const LISTENER_Z = 1.5; // max depth travel

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Phase = "idle" | "running" | "failed";

export default function OrbitRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<SilhouetteRig | null>(null);
  const audioRef = useRef<OrbitAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);

  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const clockRef = useRef(0);
  const reducedRef = useRef(false);

  // smoothed listener position (metres) for the map dot
  const lxRef = useRef(0);
  const lzRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<SilhouetteMode>("virtual");
  const [audioOn, setAudioOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── canvas sizing (DPR-aware) ───────────────────────────────────────────────
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
  }, []);

  // ── the top-down room map ───────────────────────────────────────────────────
  const drawRoom = useCallback(
    (
      c2d: CanvasRenderingContext2D,
      W: number,
      H: number,
      lx: number,
      lz: number,
      sources: SourceView[],
    ) => {
      // world (metres, −ROOM_HALF..ROOM_HALF) → canvas px. −z is "forward" (up).
      const pad = 0.14 * Math.min(W, H);
      const span = Math.min(W, H) - pad * 2;
      const scale = span / (ROOM_HALF * 2);
      const midX = W / 2;
      const midY = H / 2;
      const wx = (x: number) => midX + x * scale;
      const wy = (z: number) => midY + z * scale;

      // ground — deep near-black-blue
      c2d.fillStyle = "#05070f";
      c2d.fillRect(0, 0, W, H);

      // room border
      c2d.strokeStyle = "rgba(120,150,200,0.14)";
      c2d.lineWidth = Math.max(1, scale * 0.02);
      const r0x = wx(-ROOM_HALF);
      const r0y = wy(-ROOM_HALF);
      c2d.strokeRect(r0x, r0y, ROOM_HALF * 2 * scale, ROOM_HALF * 2 * scale);

      const youX = wx(lx);
      const youY = wy(lz);

      // faint distance rings around YOU (1..3 m) — reads as azimuth/distance
      for (let m = 1; m <= 3; m++) {
        c2d.beginPath();
        c2d.arc(youX, youY, m * scale, 0, Math.PI * 2);
        c2d.strokeStyle = `rgba(120,160,210,${0.11 - m * 0.02})`;
        c2d.lineWidth = 1;
        c2d.stroke();
      }

      // L / R axis through you (binaural pan axis) with tiny glyphs
      c2d.strokeStyle = "rgba(120,160,210,0.10)";
      c2d.beginPath();
      c2d.moveTo(youX - 3.2 * scale, youY);
      c2d.lineTo(youX + 3.2 * scale, youY);
      c2d.moveTo(youX, youY - 3.2 * scale);
      c2d.lineTo(youX, youY + 3.2 * scale);
      c2d.stroke();
      c2d.font = `${Math.round(scale * 0.16)}px ui-monospace, monospace`;
      c2d.fillStyle = "rgba(150,180,220,0.4)";
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      c2d.fillText("L", youX - 3.1 * scale, youY);
      c2d.fillText("R", youX + 3.1 * scale, youY);
      c2d.fillStyle = "rgba(150,180,220,0.28)";
      c2d.fillText("front", youX, youY - 3.05 * scale);
      c2d.fillText("back", youX, youY + 3.05 * scale);

      // sources: line from you → source (alpha by level), then the dot
      for (const s of sources) {
        const sxp = wx(s.x);
        const syp = wy(s.z);
        const lvl = s.level;
        // connecting line — tinted toward the side it sits on relative to you
        const leftish = s.x < lx;
        c2d.strokeStyle = leftish
          ? `rgba(150,200,235,${0.12 + lvl * 0.22})`
          : `rgba(190,160,240,${0.12 + lvl * 0.22})`;
        c2d.lineWidth = 1 + lvl * 1.4;
        c2d.beginPath();
        c2d.moveTo(youX, youY);
        c2d.lineTo(sxp, syp);
        c2d.stroke();

        // soft glow + dot, size & brightness from the breathing level
        const rad = scale * (0.10 + lvl * 0.10);
        const light = 46 + lvl * 26;
        const glow = c2d.createRadialGradient(sxp, syp, 0, sxp, syp, rad * 2.6);
        glow.addColorStop(0, `hsla(${s.hue}, 62%, ${light}%, ${0.5 * lvl + 0.2})`);
        glow.addColorStop(1, `hsla(${s.hue}, 62%, ${light}%, 0)`);
        c2d.fillStyle = glow;
        c2d.beginPath();
        c2d.arc(sxp, syp, rad * 2.6, 0, Math.PI * 2);
        c2d.fill();
        c2d.fillStyle = `hsl(${s.hue}, 68%, ${light}%)`;
        c2d.beginPath();
        c2d.arc(sxp, syp, rad, 0, Math.PI * 2);
        c2d.fill();
      }

      // the you-dot — pale cyan/steel — with a forward tick (facing −z / up)
      const youGlow = c2d.createRadialGradient(
        youX,
        youY,
        0,
        youX,
        youY,
        scale * 0.6,
      );
      youGlow.addColorStop(0, "rgba(190,225,240,0.55)");
      youGlow.addColorStop(1, "rgba(190,225,240,0)");
      c2d.fillStyle = youGlow;
      c2d.beginPath();
      c2d.arc(youX, youY, scale * 0.6, 0, Math.PI * 2);
      c2d.fill();
      c2d.strokeStyle = "rgba(210,235,245,0.7)";
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.moveTo(youX, youY);
      c2d.lineTo(youX, youY - scale * 0.42);
      c2d.stroke();
      c2d.fillStyle = "#dbeef7";
      c2d.beginPath();
      c2d.arc(youX, youY, scale * 0.11, 0, Math.PI * 2);
      c2d.fill();
    },
    [],
  );

  // ── the single loop — starts on mount, self-demos the virtual performer ─────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    // Self-demo immediately with the deterministic seeded performer (no camera
    // prompt, muted). "Begin" later swaps in the live camera rig.
    rigRef.current = makeVirtualRig(PERFORMER_SEED);

    resize();
    window.addEventListener("resize", resize);
    lastRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      if (reducedRef.current) dt *= 0.6; // calm motion under reduced-motion
      clockRef.current += dt;

      const rig = rigRef.current;
      const reading = rig ? rig.read(dt) : { x: 0.5, y: 0.5, area: 0.3 };

      // body centroid → listener position (metres)
      const targetX = (reading.x - 0.5) * 2 * LISTENER_X;
      // closeness (area) → depth: nearer camera moves you FORWARD (−z), deeper
      // into the ring. Area sits ~0.3 at neutral.
      const targetZ = -clamp((reading.area - 0.3) * 5.2, -1, 1) * LISTENER_Z;
      const k = 1 - Math.exp(-dt / 0.12);
      lxRef.current += (targetX - lxRef.current) * k;
      lzRef.current += (targetZ - lzRef.current) * k;

      const audio = audioRef.current;
      let sources: SourceView[];
      if (audio) {
        audio.setListener(lxRef.current, 0, lzRef.current);
        audio.step(dt);
        sources = audio.sources;
      } else {
        // synthetic breathing so the map is alive before audio begins
        const layout = sourceLayout();
        sources = layout.map((s, i) => {
          const lvl =
            0.35 +
            0.65 *
              (0.5 +
                0.5 *
                  Math.sin(
                    clockRef.current * s.lfoHz * Math.PI * 2 + i * 1.3,
                  ));
          return { x: s.x, z: s.z, hue: s.hue, level: lvl };
        });
      }

      const cv = canvasRef.current;
      const c2d = cv?.getContext("2d");
      if (cv && c2d) drawRoom(c2d, cv.width, cv.height, lxRef.current, lzRef.current, sources);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      rigRef.current?.stop();
      rigRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 800);
      }
    };
  }, [resize, drawRoom]);

  // ── begin: build audio inside the gesture, then try the camera ──────────────
  const begin = useCallback(async () => {
    if (audioOn || phase === "running") return;

    // audio (must be created + resumed inside this user gesture)
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        setPhase("failed");
        setNotice("Web Audio is unavailable — the room map still animates.");
        return;
      }
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      const master = createSafeMaster(ctx, { gain: 0.5 });
      const audio = makeOrbitAudio(ctx, master.input);
      ctxRef.current = ctx;
      masterRef.current = master;
      audioRef.current = audio;
      setAudioOn(true);
      setPhase("running");
    } catch {
      setPhase("failed");
      setNotice("Audio failed to start — the room map still animates.");
      return;
    }

    // camera silhouette (falls back to the seeded performer on denial)
    try {
      const { rig, fallbackReason } = await startSilhouette(PERFORMER_SEED);
      rigRef.current?.stop();
      rigRef.current = rig;
      setMode(rig.mode);
      setNotice(fallbackReason); // null clears it when the camera is granted
    } catch {
      setNotice("Camera not available — the virtual performer keeps orbiting.");
    }
  }, [audioOn, phase]);

  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* header / chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              10808 · orbit•room
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Move through the room — hear the music orbit your body.
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              The front camera reads your silhouette as a moving point. It walks
              the listener through a virtual room ringed with five ambient voices,
              spatialised in binaural 3-D. Use headphones — and watch the map: the
              pan is drawn even where a speaker can&apos;t render it.
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-primary flex items-center">
                {mode === "camera"
                  ? "● live silhouette"
                  : "● virtual performer"}
              </span>
            )}
            <button type="button" onClick={() => setShowNotes(true)} className={secondaryBtn}>
              Notes
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {!audioOn && (
            <span className="text-muted-foreground/80">
              muted · virtual performer orbiting — press Begin
            </span>
          )}
          {notice && <span className="text-destructive normal-case tracking-normal">{notice}</span>}
        </div>
      </div>

      {/* notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 px-6 py-16 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                How orbit•room works
              </h2>
              <button type="button" onClick={() => setShowNotes(false)} className={secondaryBtn}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could physically move through a room and hear the music orbit your
                body in binaural 3-D?
              </p>
              <p>
                <span className="text-foreground">Body sensing.</span> Model-free —
                no MediaPipe, no TensorFlow, no network. The front camera is grabbed
                to a 160×120 canvas; a slow running background mean is kept per
                pixel, then <span className="text-foreground">|luma − mean|</span>{" "}
                is thresholded into a foreground mask whose{" "}
                <span className="text-foreground">centroid and area</span> give your
                horizontal position, vertical position and closeness each frame.
              </p>
              <p>
                <span className="text-foreground">Spatial audio.</span> Five soft
                inharmonic voices sit around a virtual room, each on a{" "}
                <span className="text-foreground">PannerNode</span> in HRTF mode. Your
                centroid moves the single <span className="text-foreground">AudioListener</span>:
                walk left and the chord swings right; step toward the camera and you
                move deeper into the ring. Position setters use{" "}
                <span className="text-foreground">setTargetAtTime</span> (~50 ms) so
                localisation doesn&apos;t smear under pose jitter.
              </p>
              <p>
                <span className="text-foreground">The map.</span> A Canvas2D top-down
                room shows faint distance rings around a bright you-dot and the
                source-dots around you — each breathing with its gain, a line to each
                showing its left/right placement — so the spatialisation is visible
                even when a phone speaker can&apos;t render binaural.
              </p>
              <p>
                <span className="text-foreground">Fallback &amp; safety.</span> With
                no camera a deterministic seeded performer drifts along a slow
                Lissajous orbit, so the room is never blank (muted until you press
                Begin). No strobing — every pulse is a slow (&lt;0.1 Hz) level drift;
                reduced-motion is honoured. The camera is read only in your browser to
                sense your silhouette — nothing is recorded or sent anywhere.
              </p>
              <p className="text-muted-foreground/80">
                Reference: HRTF PannerNode binaural spatialisation + Google Omnitone /
                Resonance-Audio ambisonic panning — the living web-spatial-audio
                technique being ported — with a front camera standing in for a headset
                IMU as the pose source.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10808-orbitroom"]} />
    </main>
  );
}
