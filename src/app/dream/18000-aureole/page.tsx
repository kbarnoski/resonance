"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18000-aureole — conduct the acoustic SPACE your recording lives in, with your
// face.
//
// Lean IN and Karel's real piano comes close and dry — a bright direct sound at
// arm's length. Lean BACK and it dissolves into a vast reverberant cathedral:
// quieter, darker, all long tail. Your face SCALE (inter-ocular distance) is the
// direct-to-reverberant ratio — the auditory distance cue (Blesser & Salter,
// "Spaces Speak, Are You Listening?"). Open your mouth to breathe the space open
// (a swell + high-shelf shimmer); tilt your head to pan the room.
//
// The reverberant "cathedral" is literally made of Karel's own recording: the
// ConvolverNode's impulse response is a decaying slice of his OWN decoded buffer
// — never white-noise reverb.
//
// INPUT  webcam FACE + breath (MediaPipe FaceLandmarker + blendshapes)
// OUTPUT Canvas2D — a rigorously ACHROMATIC additive "aureole" (halo / corona)
// AUDIO  Karel's real catalog via loadRealTrackBuffer → dry/wet crossfade with a
//        convolver made of his own buffer → createSafeMaster (never destination)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  loadRealTrackBuffer,
  WELCOME_HOME_TRACKS,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
  type FaceResult,
  type Landmark,
} from "../_shared/cameraTracking";

// A short menu of Karel's real tracks; Welcome Home leads (thematically apt).
const TRACK_MENU = [
  WELCOME_HOME_TRACKS[2], // Welcome Home
  WELCOME_HOME_TRACKS[0], // Interplay
  WELCOME_HOME_TRACKS[7], // Isolation
  WELCOME_HOME_TRACKS[4], // 2019
].filter(Boolean);

// ── The feature vector read from the face each frame ────────────────────────
interface FaceFeatures {
  /** 0 = near / leaning in (dry, close) … 1 = far / leaning back (reverberant). */
  dist: number;
  /** jawOpen blendshape 0..1 — breathes the space open (swell + shimmer). */
  jaw: number;
  /** browInnerUp blendshape 0..1 — an extra brightness lift. */
  brow: number;
  /** head roll in radians (tilt) — pans the room + tilts the halo. */
  roll: number;
}

const NEUTRAL: FaceFeatures = { dist: 0.42, jaw: 0, brow: 0, roll: 0 };

// Inter-ocular scale (outer eye corners) calibrated for a seated laptop-webcam
// user: ~0.28 leaning in close, ~0.11 leaned right back. dist maps NEAR→0, FAR→1.
const IOD_NEAR = 0.28;
const IOD_FAR = 0.11;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// MediaPipe FaceLandmarker gives 468 base mesh landmarks (+iris when refined).
// We gate ONLY on the base mesh so a seated user always works. Indices used:
//   left eye outer corner 33 · right eye outer corner 263 (inter-ocular + roll)
function computeFaceFeatures(res: FaceResult): FaceFeatures | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;

  const bs = res.faceBlendshapes?.[0]?.categories ?? [];
  const score = (name: string): number =>
    bs.find((c) => c.categoryName === name)?.score ?? 0;

  const eyeL = lm[33];
  const eyeR = lm[263];

  // Face scale from inter-ocular distance (bigger = closer). Primary control.
  const iod = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y);
  const dist = clamp01((IOD_NEAR - iod) / (IOD_NEAR - IOD_FAR));

  // Head roll: tilt of the eye line.
  const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);

  const jaw = clamp01(score("jawOpen"));
  const brow = clamp01(score("browInnerUp"));

  return { dist, jaw, brow, roll: clamp(roll, -0.5, 0.5) };
}

// ── Build the reverb impulse from Karel's OWN decoded buffer ─────────────────
// Take a ~2.2s slice of his recording, apply an exponential decay envelope, and
// hand it to the ConvolverNode. The "cathedral" is literally made of his piano.
function buildImpulseFromBuffer(
  ctx: AudioContext,
  src: AudioBuffer,
): AudioBuffer {
  const sr = src.sampleRate;
  const len = Math.min(Math.floor(sr * 2.2), src.length);
  const start = Math.min(
    Math.floor(src.length * 0.3),
    Math.max(0, src.length - len),
  );
  const ir = ctx.createBuffer(2, len, sr);
  const fadeIn = Math.max(1, Math.floor(sr * 0.005)); // 5ms fade-in, no click
  for (let ch = 0; ch < 2; ch++) {
    const from = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
    const to = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // exponential decay to ~e^-3.4 (≈0.033) over the tail
      const env = Math.exp((-3.4 * i) / len);
      const win = i < fadeIn ? i / fadeIn : 1;
      to[i] = from[start + i] * env * win;
    }
  }
  return ir;
}

// ── The achromatic Canvas2D aureole (halo / corona) ─────────────────────────
// Concentric luminous rings. RADIUS reads perceived distance (near = tight
// bright core; far = wide dim expanding rings); brightness / thickness read the
// direct-to-reverberant ratio. Head roll tilts the halo. Pulse off analyser
// energy. Bone / silver / graphite grayscale ONLY — equal RGB channels.
function drawAureole(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: FaceFeatures,
  energy: number,
  time: number,
): void {
  // gentle afterglow (motion, not grain): near-black wash each frame
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(8,8,8,0.30)";
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // direct-to-reverberant ratio: near = high (bright, thick, tight)
  const drr = 1 - f.dist;
  // base radius grows as the source recedes (far = wide expanding rings)
  const R0 = minDim * (0.06 + f.dist * 0.34 + energy * 0.05);
  const pulse = 1 + energy * 0.5;

  g.save();
  g.translate(cx, cy);
  g.rotate(f.roll); // halo tilts with head roll
  g.globalCompositeOperation = "lighter";

  // central corona glow — brightness reads the direct sound
  const coreR = R0 * pulse * (0.9 + f.jaw * 0.25);
  const coreV = Math.round(120 + drr * 130 + energy * 40);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.8);
  grad.addColorStop(0, `rgba(${coreV},${coreV},${coreV},${0.22 + drr * 0.5})`);
  grad.addColorStop(0.5, `rgba(${coreV},${coreV},${coreV},${0.06 + drr * 0.16})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, coreR * 1.8, 0, Math.PI * 2);
  g.fill();

  // concentric rings — spread wider and dimmer as the space grows reverberant
  const RINGS = 7;
  const spacing = R0 * (0.16 + f.dist * 0.26);
  for (let i = 1; i <= RINGS; i++) {
    const wobble = 1 + 0.03 * Math.sin(time * 0.6 + i * 1.3);
    const r = (coreR + i * spacing) * wobble * pulse;
    if (r > minDim * 1.1) break;
    // brightness falls off with ring index and with distance; drr thickens them
    const fade = Math.pow(0.72, i - 1);
    const v = Math.round((70 + drr * 150) * fade + energy * 30);
    const a = clamp01((0.10 + drr * 0.42) * fade + energy * 0.06);
    g.lineWidth = Math.max(0.5, (0.6 + drr * 3.4) * fade);
    g.strokeStyle = `rgba(${v},${v},${v},${a})`;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }

  // a bright bone rim on the core when very near (the dry, present sound)
  if (drr > 0.35) {
    const rimV = Math.round(180 + drr * 60);
    g.lineWidth = 0.8 + drr * 2.2;
    g.strokeStyle = `rgba(${rimV},${rimV},${rimV},${(drr - 0.35) * 0.9})`;
    g.beginPath();
    g.arc(0, 0, coreR, 0, Math.PI * 2);
    g.stroke();
  }

  g.restore();
}

// ── The piece ───────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

interface AudioNodes {
  dryGain: GainNode;
  distanceLowpass: BiquadFilterNode;
  dryPanner: StereoPannerNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  wetTone: BiquadFilterNode;
  shimmer: BiquadFilterNode;
}

export default function Aureole() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [controlLabel, setControlLabel] = useState("demo");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[2].id);
  const [trackTitle, setTrackTitle] = useState<string>(
    WELCOME_HOME_TRACKS[2].title,
  );
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // audio + tracking refs (never trigger re-render)
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const nodesRef = useRef<AudioNodes | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const featRef = useRef<FaceFeatures>({ ...NEUTRAL });
  const camWantRef = useRef(false);
  const lastFaceRef = useRef<number>(0);
  const pointerRef = useRef<{ active: boolean; dist: number }>({
    active: false,
    dist: 0.5,
  });

  // ── canvas sizing (DPR-aware, capped) ─────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the control + render loop ──────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const ctx = ctxRef.current;
    const nodes = nodesRef.current;
    const master = masterRef.current;

    // 1. establish the target feature vector from the active control source
    const target: FaceFeatures = { ...NEUTRAL };
    let label = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      try {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          const res = trackerRef.current.detectForVideo(video, now);
          const f = computeFaceFeatures(res);
          if (f) {
            lastFaceRef.current = now;
            Object.assign(target, f);
            label = "live";
            setCamState((s) => (s === "live" ? s : "live"));
          } else if (now - lastFaceRef.current > 900) {
            label = "lost";
            setCamState((s) => (s === "lost" ? s : "lost"));
            Object.assign(target, featRef.current);
          } else {
            Object.assign(target, featRef.current);
            label = "live";
          }
        } else {
          Object.assign(target, featRef.current);
        }
      } catch {
        Object.assign(target, featRef.current);
      }
    } else if (pointerRef.current.active) {
      target.dist = pointerRef.current.dist;
      label = "pointer";
    } else {
      // autonomous slow drift of DISTANCE — a self-demo, clearly not live.
      const t = now / 1000;
      target.dist = 0.5 + 0.45 * Math.sin(t * 0.16);
      target.jaw = 0.12 * (0.5 + 0.5 * Math.sin(t * 0.33 + 1.1));
      target.roll = 0.14 * Math.sin(t * 0.11);
      label = "demo";
    }
    setControlLabel((c) => (c === label ? c : label));

    // 2. smooth features (visual lerp; audio smoothed by setTargetAtTime)
    const cur = featRef.current;
    const k = 0.14; // heavy smoothing — the room dissolves, never lurches
    cur.dist += (target.dist - cur.dist) * k;
    cur.jaw += (target.jaw - cur.jaw) * k;
    cur.brow += (target.brow - cur.brow) * k;
    cur.roll += (target.roll - cur.roll) * k;

    // 3. push to audio params (smoothed ~0.12s → the space breathes slowly)
    if (ctx && nodes && master) {
      const tc = 0.12;
      const t0 = ctx.currentTime;
      const d = cur.dist;

      // equal-power dry/wet crossfade: near = dry/direct, far = wet/reverberant
      const dryLevel = Math.cos((d * Math.PI) / 2);
      const wetLevel = Math.sin((d * Math.PI) / 2);
      const overall = 1 - d * 0.4; // far is quieter (auditory distance)
      const swell = 1 + cur.jaw * 0.5; // jaw open → a swell
      nodes.dryGain.gain.setTargetAtTime(dryLevel * overall * swell * 0.95, t0, tc);
      nodes.wetGain.gain.setTargetAtTime(wetLevel * overall * swell * 1.25, t0, tc);

      // distance low-pass: near opens toward ~16k, far closes toward ~500 Hz;
      // browInnerUp lifts the brightness further.
      const dryF = clamp(
        500 * Math.pow(32, 1 - d) * (1 + cur.brow * 0.8),
        400,
        16000,
      );
      nodes.distanceLowpass.frequency.setTargetAtTime(dryF, t0, tc);

      // the reverb tail darkens with distance (a big hall is dark), brow lifts it
      const wetF = clamp(
        900 * Math.pow(8, 1 - d) * (1 + cur.brow * 0.6),
        700,
        9000,
      );
      nodes.wetTone.frequency.setTargetAtTime(wetF, t0, tc);

      // jawOpen → high-shelf shimmer (opening the mouth breathes the space open)
      nodes.shimmer.gain.setTargetAtTime(cur.jaw * 7 + cur.brow * 2, t0, tc);

      // head roll → StereoPanner azimuth on the DIRECT sound
      nodes.dryPanner.pan.setTargetAtTime(
        clamp(Math.sin(cur.roll) * 2.2, -0.95, 0.95),
        t0,
        tc,
      );
    }

    // 4. analyser energy → 5. draw the aureole
    const c = canvasRef.current;
    if (c && master && freqRef.current) {
      master.analyser.getByteFrequencyData(freqRef.current);
      const bins = freqRef.current;
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      const energy = clamp01(sum / bins.length / 190);
      const g = c.getContext("2d");
      if (g) drawAureole(g, c.width, c.height, cur, energy, now / 1000);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start audio + visuals (user gesture) ───────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;
      freqRef.current = new Uint8Array(master.analyser.frequencyBinCount);

      // load Karel's real track (decode once — reused for playback AND the IR)
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // ── DRY path: source → dryGain → distanceLowpass → dryPanner → shimmer
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.9;
      const distanceLowpass = ctx.createBiquadFilter();
      distanceLowpass.type = "lowpass";
      distanceLowpass.frequency.value = 12000;
      distanceLowpass.Q.value = 0.6;
      const dryPanner = ctx.createStereoPanner();
      dryPanner.pan.value = 0;

      // ── WET path: source → wetGain → convolver → wetTone → shimmer
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.2;
      const convolver = ctx.createConvolver();
      convolver.normalize = true;
      convolver.buffer = buildImpulseFromBuffer(ctx, buffer); // Karel's own tail
      const wetTone = ctx.createBiquadFilter();
      wetTone.type = "lowpass";
      wetTone.frequency.value = 3200;
      wetTone.Q.value = 0.5;

      // shared jaw/brow shimmer high-shelf → safe master (the ONLY sink)
      const shimmer = ctx.createBiquadFilter();
      shimmer.type = "highshelf";
      shimmer.frequency.value = 4200;
      shimmer.gain.value = 0;

      dryGain.connect(distanceLowpass);
      distanceLowpass.connect(dryPanner);
      dryPanner.connect(shimmer);

      wetGain.connect(convolver);
      convolver.connect(wetTone);
      wetTone.connect(shimmer);

      shimmer.connect(master.input);

      nodesRef.current = {
        dryGain,
        distanceLowpass,
        dryPanner,
        wetGain,
        convolver,
        wetTone,
        shimmer,
      };

      // ── the single looping source feeds both paths ──────────────────────────
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(dryGain);
      src.connect(wetGain);
      src.start();
      srcRef.current = src;

      resize();
      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start");
      setPhase("error");
    }
  }, [phase, trackId, resize, runFrame]);

  // ── enable camera (separate opt-in for the permission prompt) ──────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createFaceTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastFaceRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback: drag up / down = distance ────────────────────────────
  const readPointer = useCallback((clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // top of frame = near (lean in), bottom = far (lean back)
    pointerRef.current.dist = clamp01((clientY - r.top) / r.height);
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current) return; // live face wins
      pointerRef.current.active = true;
      readPointer(e.clientY);
    },
    [readPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current || !pointerRef.current.active) return;
      readPointer(e.clientY);
    },
    [readPointer],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      const n = nodesRef.current;
      if (n) {
        for (const node of Object.values(n)) {
          try {
            node.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";
  const running = phase === "running";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* hidden camera feed — MediaPipe reads from it */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              conduct the acoustic space with your face
            </p>
            <h1 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground">
              Lean in, the piano comes close and dry. Lean back, it dissolves
              into a cathedral.
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {TRACK_MENU.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrackId(t.id)}
                  className={
                    "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                    (trackId === t.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                  }
                >
                  {t.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "loading Karel's recording…" : "Begin"}
            </button>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking status line — visible whenever running */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camLive && controlLabel === "live" ? (
              <span className="text-muted-foreground">tracking · live</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                face lost · face the camera, come into frame
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">
                  drag up / down to conduct distance
                </span>
              </span>
            ) : controlLabel === "pointer" ? (
              <span className="text-muted-foreground">
                pointer · drag up = near, down = far
              </span>
            ) : (
              <span className="text-muted-foreground">
                demo · autonomous — enable camera to conduct
              </span>
            )}
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {running && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
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

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                18000 · aureole — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Lean in for a close, dry piano · lean back to dissolve into a
                vast reverberant hall · open your mouth to breathe the space open
                · tilt your head to pan the room.
              </p>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </>
        )}

        {/* immersive HUD (only while running + immersive) */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Aureole"
            description="Conduct the acoustic space your recording lives in with your face. Face scale is the direct-to-reverberant ratio: lean in and Karel's real piano comes close and dry; lean back and it dissolves into a vast reverberant cathedral made of his own recording."
            howTo={[
              "Lean in to bring the piano close and dry",
              "Lean back to let it dissolve into a vast reverberant hall",
              "Open your mouth to breathe the space open",
              "Tilt your head to pan the room",
            ]}
          />
        )}

        {/* design-notes modal */}
        {showNotes && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                aureole — conducting the acoustic space
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings loops. Your face
                  SCALE — how close you lean — is the primary control: it sets
                  the direct-to-reverberant ratio, the auditory cue we use to
                  judge distance to a sound. Lean in and the piano is close,
                  loud, dry and bright; lean back and it recedes into a vast,
                  dark, reverberant cathedral.
                </p>
                <p>
                  The reverberant tail is not synthetic. The ConvolverNode&apos;s
                  impulse response is a decaying slice of Karel&apos;s OWN decoded
                  buffer, so the cathedral is literally built from his recording.
                  A single looping source feeds a dry path (distance low-pass +
                  stereo pan) and a wet path (his-own-tail convolver), crossfaded
                  equal-power by distance and smoothed with a ~0.12s time
                  constant so the room breathes rather than lurches.
                </p>
                <p>
                  Open your mouth (jawOpen) for a swell and a high-shelf shimmer
                  — breathing the space open; raise your inner brows for an extra
                  brightness lift; tilt your head to pan the direct sound. The
                  visual is a rigorously achromatic aureole — a halo of
                  concentric silver rings whose radius reads perceived distance
                  and whose brightness reads the direct-to-reverberant ratio.
                </p>
                <p>
                  With no camera, permission denied, or a model-load failure, an
                  autonomous slow drift keeps the piece alive and audible (always
                  labelled, never masquerading as live), and dragging up / down
                  conducts distance by hand.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {!immersive && (
        <PrototypeNav slugs={["17968-cantormap", "17904-reharmonize", "15824-canon"]} />
      )}
    </main>
  );
}
