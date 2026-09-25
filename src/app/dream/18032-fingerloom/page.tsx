"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18032-fingerloom — your ten fingers each hold a strand of your own recording.
//
// A per-FINGER orchestration conductor. One of Karel's real piano takes loops,
// split into 10 parallel band/voice paths spanning bass → air. Each of your ten
// fingers articulates ONE independent voice: curl a finger to silence its
// strand, extend it to let that strand bloom. Two open hands orchestrate the
// full spectral texture; a closing fist collapses the piece to a single quiet
// core voice that is always alive.
//
// The conducted MUSICAL parameter is ORCHESTRATION / voice-articulation density
// — which strands of the recording sound, and how brightly — driven by the
// flexion of each of the 10 fingers, read independently from MediaPipe's 21
// keypoints per hand (finger-straightness + thumb-abduction, NOT the shared
// whole-hand openness scalar).
//
// INPUT  webcam · MediaPipe HandLandmarker (numHands=2) · per-finger curl reader
// AUDIO  Karel's real take → 10 bandpass voices + a quiet core → createSafeMaster
// OUTPUT Canvas2D loom of 10 luminous filaments · COOL BIOLUMINESCENT palette
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  type HandLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";

// ── Voice / finger model ─────────────────────────────────────────────────────

const VOICE_COUNT = 10; // 5 fingers × 2 hands (thumb·index·middle·ring·pinky)

// The default take: "Welcome Home" (thematically apt), with a small menu.
const WELCOME_HOME = COLLECTIONS[0].tracks;
const DEFAULT_TRACK =
  WELCOME_HOME.find((t) => t.title === "Welcome Home") ?? WELCOME_HOME[0];
const TRACK_MENU = [
  DEFAULT_TRACK,
  WELCOME_HOME.find((t) => t.title === "Interplay"),
  WELCOME_HOME.find((t) => t.title === "Isolation"),
  WELCOME_HOME.find((t) => t.title === "Rolling"),
].filter((t): t is (typeof WELCOME_HOME)[number] => Boolean(t));

// 21-keypoint finger topology (MCP/PIP/DIP/TIP per finger; thumb CMC/MCP/IP/TIP).
const FINGER_JOINTS: readonly (readonly [number, number, number, number])[] = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // pinky
] as const;

// Log-spaced band centres, bass → air (kept below the 14 kHz safety cap).
const BAND_CENTERS: number[] = Array.from({ length: VOICE_COUNT }, (_, i) =>
  Math.round(100 * Math.pow(8600 / 100, i / (VOICE_COUNT - 1))),
);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function dist2(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Per-finger curl / extension reader (this is the heart of the piece) ───────
// For the four fingers we use a scale-invariant *straightness* ratio: the direct
// MCP→TIP distance over the summed joint-segment path. A straight (extended)
// finger ≈ 1; a folded (curled) finger drops toward ~0.5. For the thumb we use
// its abduction: tip-to-index-MCP distance normalised by palm size (tucked
// thumb sits close to the index knuckle, splayed thumb reaches far out).
// Returns five values in 0..1 (0 = fully curled, 1 = fully extended).
function readFingerExtensions(lm: Landmark[]): number[] {
  const palm = dist2(lm[0], lm[9]) + 1e-4; // wrist → middle MCP
  const out: number[] = new Array(5);

  for (let f = 1; f < 5; f++) {
    const [j0, j1, j2, j3] = FINGER_JOINTS[f];
    const direct = dist2(lm[j0], lm[j3]);
    const path =
      dist2(lm[j0], lm[j1]) + dist2(lm[j1], lm[j2]) + dist2(lm[j2], lm[j3]) +
      1e-4;
    const ratio = direct / path; // ~0.42 curled … ~0.98 extended
    out[f] = clamp01((ratio - 0.66) / (0.97 - 0.66));
  }

  // thumb: abduction distance tip(4) → index MCP(5), normalised by palm.
  const dThumb = dist2(lm[4], lm[5]) / palm;
  out[0] = clamp01((dThumb - 0.52) / (1.12 - 0.52));

  return out;
}

// ── Audio engine types ───────────────────────────────────────────────────────

interface VoiceNode {
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  src: AudioBufferSourceNode;
  voices: VoiceNode[]; // 10 bandpass strands
  coreGain: GainNode; // always-on dark bed
  freq: Uint8Array<ArrayBuffer>;
}

// ── Cool-bioluminescent strand palette (raw hsl in the art only) ─────────────
// Deep-sea → aurora register: teal-cyan filaments to pale-bone highlights on
// near-black. No violet, no amber.
function strandColor(i: number, gain: number, energy: number, alpha: number): string {
  const hue = 188 - (i / (VOICE_COUNT - 1)) * 26; // 188 (teal) … 162 (green-cyan)
  const sat = Math.round(78 - gain * 26);
  const light = Math.round(38 + gain * 48 + energy * 8);
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

const BG_DEEP = "#03080c";
const BONE = "234, 255, 248"; // pale-bone highlight, rgb for the brightest cores

// ── The woven loom of ten filaments ──────────────────────────────────────────
function drawLoom(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  ext: number[],
  energy: number,
  time: number,
): void {
  // afterglow wash (motion trails, not grain)
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(3, 9, 13, 0.30)";
  g.fillRect(0, 0, w, h);

  const marginX = w * 0.09;
  const usable = w - marginX * 2;
  const P = 46; // samples per warp strand
  const strandX: number[][] = []; // cached geometry for the weft

  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.lineJoin = "round";

  for (let i = 0; i < VOICE_COUNT; i++) {
    const gain = ext[i];
    const baseX = marginX + (usable * i) / (VOICE_COUNT - 1);
    const phase = i * 0.74;
    const speed = 0.4 + i * 0.045;
    // bloom: a bright, extended finger's strand widens and turns turbulent
    const amp = (w * 0.008) + gain * (w * 0.05) + energy * (w * 0.012);
    const turb = gain * 0.9 + energy * 0.5;

    const xs: number[] = new Array(P);
    const ys: number[] = new Array(P);
    for (let p = 0; p < P; p++) {
      const t = p / (P - 1);
      const y = t * h;
      const wave =
        Math.sin(y * 0.011 + time * speed + phase) +
        turb * 0.5 * Math.sin(y * 0.027 - time * (speed * 1.7) + phase * 2.1) +
        turb * 0.25 * Math.sin(y * 0.05 + time * (speed * 0.6));
      // envelope so strands gather slightly toward the loom's vertical spine
      const env = 0.55 + 0.45 * Math.sin(t * Math.PI);
      xs[p] = baseX + amp * wave * env;
      ys[p] = y;
    }
    strandX.push(xs);

    const drawPass = (width: number, color: string) => {
      g.lineWidth = width;
      g.strokeStyle = color;
      g.beginPath();
      g.moveTo(xs[0], ys[0]);
      for (let p = 1; p < P; p++) {
        const mx = (xs[p - 1] + xs[p]) / 2;
        const my = (ys[p - 1] + ys[p]) / 2;
        g.quadraticCurveTo(xs[p - 1], ys[p - 1], mx, my);
      }
      g.stroke();
    };

    // three layered passes → soft bloom without any grain/noise overlay
    const glow = 0.06 + gain * 0.18;
    drawPass(3 + gain * 22, strandColor(i, gain, energy, glow * 0.6));
    drawPass(1.4 + gain * 8, strandColor(i, gain, energy, 0.14 + gain * 0.4));
    // bright pale-bone core only where the strand is truly bloomed
    if (gain > 0.12) {
      drawPass(
        0.8 + gain * 2.4,
        `rgba(${BONE}, ${0.1 + gain * 0.7})`,
      );
    }
  }

  // ── weft: faint woven cross-threads linking the warp strands ───────────────
  const WEFT = 9;
  for (let r = 1; r < WEFT; r++) {
    const t = r / WEFT;
    const y = t * h;
    const p = Math.min(P - 1, Math.round(t * (P - 1)));
    // brightness of a weft row = mean of the strand gains it crosses
    let sum = 0;
    for (let i = 0; i < VOICE_COUNT; i++) sum += ext[i];
    const mean = sum / VOICE_COUNT;
    const drift = Math.sin(y * 0.02 + time * 0.5) * 4;
    g.lineWidth = 0.6 + mean * 1.6;
    g.strokeStyle = `hsla(180, 60%, ${Math.round(46 + mean * 34)}%, ${0.04 + mean * 0.18})`;
    g.beginPath();
    g.moveTo(strandX[0][p], y + drift);
    for (let i = 1; i < VOICE_COUNT; i++) {
      const x0 = strandX[i - 1][p];
      const x1 = strandX[i][p];
      const mx = (x0 + x1) / 2;
      g.quadraticCurveTo(x0, y + drift, mx, y + drift);
    }
    g.stroke();

    // luminous knots where an active warp crosses the weft
    for (let i = 0; i < VOICE_COUNT; i++) {
      const gk = ext[i];
      if (gk < 0.18) continue;
      const kx = strandX[i][p];
      const rad = 1 + gk * 3.4 + energy * 1.5;
      const rg = g.createRadialGradient(kx, y + drift, 0, kx, y + drift, rad * 2.4);
      rg.addColorStop(0, `rgba(${BONE}, ${0.25 + gk * 0.5})`);
      rg.addColorStop(0.5, strandColor(i, gk, energy, 0.18 + gk * 0.28));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(kx, y + drift, rad * 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ── the always-on core voice: a low breathing glow along the bottom edge ───
  const coreGlow = g.createLinearGradient(0, h, 0, h * 0.68);
  const coreA = 0.14 + energy * 0.22;
  coreGlow.addColorStop(0, `hsla(190, 70%, 30%, ${coreA})`);
  coreGlow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = coreGlow;
  g.fillRect(0, h * 0.68, w, h * 0.32);

  // ── functional readout: 10 tiny strand-level bars (always-visible feedback) ─
  g.globalCompositeOperation = "source-over";
  const barW = 5;
  const barGap = 4;
  const bx0 = 18;
  const by0 = h - 20;
  const barMax = 44;
  for (let i = 0; i < VOICE_COUNT; i++) {
    const x = bx0 + i * (barW + barGap);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(x, by0 - barMax, barW, barMax);
    const bh = Math.max(1, ext[i] * barMax);
    g.fillStyle = strandColor(i, ext[i], energy, 0.5 + ext[i] * 0.5);
    g.fillRect(x, by0 - bh, barW, bh);
  }
}

// ── Component state ──────────────────────────────────────────────────────────

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

export default function Fingerloom() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [controlLabel, setControlLabel] = useState<
    "demo" | "live" | "pointer" | "lost"
  >("demo");
  const [handsSeen, setHandsSeen] = useState(0);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK.id);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TRACK.title);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  // smoothed per-voice extension + target
  const extRef = useRef<number[]>(new Array(VOICE_COUNT).fill(0));
  const camWantRef = useRef(false);
  const lastHandRef = useRef<number>(0);
  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0.5,
    y: 0.4,
  });

  // ── canvas sizing (DPR-aware, capped) ──────────────────────────────────────
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

  // ── the single control + render loop (no async hops) ───────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const eng = engineRef.current;

    // 1. establish target per-voice extensions from the active control source
    const target: number[] = new Array(VOICE_COUNT).fill(0);
    let label: "demo" | "live" | "pointer" | "lost" = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      const video = videoRef.current;
      let sawHands = 0;
      if (video.readyState >= 2) {
        try {
          const res = trackerRef.current.detectForVideo(video, now);
          const hands = res.landmarks ?? [];
          const handed = res.handednesses ?? res.handedness ?? [];
          const usedSlots = new Set<number>();
          for (let hi = 0; hi < hands.length; hi++) {
            const lm = hands[hi];
            if (!lm || lm.length < 21) continue;
            const name =
              handed[hi]?.[0]?.categoryName ?? (hi === 0 ? "Left" : "Right");
            let slot = name === "Right" ? 1 : 0;
            if (usedSlots.has(slot)) slot = 1 - slot;
            usedSlots.add(slot);
            const fex = readFingerExtensions(lm);
            for (let f = 0; f < 5; f++) target[slot * 5 + f] = fex[f];
            sawHands++;
          }
        } catch {
          /* transient detector hiccup — hold last frame */
        }
      }
      if (sawHands > 0) {
        lastHandRef.current = now;
        label = "live";
        setCamState((s) => (s === "live" ? s : "live"));
      } else if (now - lastHandRef.current > 900) {
        label = "lost";
        setCamState((s) => (s === "lost" ? s : "lost"));
        // let all strands fall to rest (their voices fade toward the core)
      } else {
        label = "live";
        for (let i = 0; i < VOICE_COUNT; i++) target[i] = extRef.current[i];
      }
      setHandsSeen((n) => (n === sawHands ? n : sawHands));
    } else if (pointerRef.current.active) {
      // pointer fallback: a "bloom cursor" — voices near the cursor column
      // open, far ones close; drag down widens the bloom across more strands.
      const centerCol = pointerRef.current.x * (VOICE_COUNT - 1);
      const sigma = 0.9 + pointerRef.current.y * 4.5;
      for (let i = 0; i < VOICE_COUNT; i++) {
        const d = i - centerCol;
        target[i] = Math.exp(-(d * d) / (2 * sigma * sigma));
      }
      label = "pointer";
    } else {
      // autonomous idle demo — each strand breathes on its own phase/rate.
      // Deliberately continuous & obviously self-driven; always labelled.
      const t = now / 1000;
      for (let i = 0; i < VOICE_COUNT; i++) {
        target[i] =
          0.5 + 0.46 * Math.sin(t * (0.22 + i * 0.05) + i * 0.7);
      }
      label = "demo";
    }
    setControlLabel((c) => (c === label ? c : label));

    // 2. smooth (light — a finger curl reads in ~0.1–0.15s)
    const ext = extRef.current;
    const k = 0.32;
    for (let i = 0; i < VOICE_COUNT; i++) {
      ext[i] += (target[i] - ext[i]) * k;
    }

    // 3. push to audio (setTargetAtTime ~0.12s → no clicks)
    let energy = 0;
    if (eng) {
      const t0 = eng.ctx.currentTime;
      const tc = 0.12;
      for (let i = 0; i < VOICE_COUNT; i++) {
        // higher (brighter) bands scaled up so extending them adds real air;
        // curled fingers pull their band to silence.
        const g = clamp01(ext[i]) * (0.5 + i * 0.13);
        eng.voices[i].gain.gain.setTargetAtTime(g, t0, tc);
      }
      // 4. analyser energy
      eng.master.analyser.getByteFrequencyData(eng.freq);
      const bins = eng.freq;
      let sum = 0;
      for (let b = 0; b < bins.length; b++) sum += bins[b];
      energy = clamp01(sum / bins.length / 170);
    }

    // 5. draw
    const c = canvasRef.current;
    if (c) {
      const gtx = c.getContext("2d");
      if (gtx) drawLoom(gtx, c.width, c.height, ext, energy, now / 1000);
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

      const master = createSafeMaster(ctx);

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // one looping source → 10 bandpass voices + a quiet lowpassed core
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const voices: VoiceNode[] = [];
      for (let i = 0; i < VOICE_COUNT; i++) {
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = BAND_CENTERS[i];
        filter.Q.value = 1.1 + i * 0.32; // tighter bands toward the top
        const gain = ctx.createGain();
        gain.gain.value = 0; // starts silent; extension blooms each strand
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master.input);
        voices.push({ filter, gain });
      }

      // always-on dark core bed — keeps the piece alive under a full fist
      const coreLp = ctx.createBiquadFilter();
      coreLp.type = "lowpass";
      coreLp.frequency.value = 420;
      coreLp.Q.value = 0.6;
      const coreGain = ctx.createGain();
      coreGain.gain.value = 0.16;
      src.connect(coreLp);
      coreLp.connect(coreGain);
      coreGain.connect(master.input);

      src.start();

      engineRef.current = {
        ctx,
        master,
        src,
        voices,
        coreGain,
        freq: new Uint8Array(master.analyser.frequencyBinCount),
      };

      resize();
      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start audio");
      setPhase("error");
    }
  }, [phase, trackId, resize, runFrame]);

  // ── enable camera (separate opt-in for the permission prompt) ──────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastHandRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback ───────────────────────────────────────────────────────
  const readPointer = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointerRef.current.x = clamp01((clientX - r.left) / r.width);
    pointerRef.current.y = clamp01((clientY - r.top) / r.height);
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current) return; // live hands win
      pointerRef.current.active = true;
      readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (camWantRef.current || !pointerRef.current.active) return;
      readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      try {
        eng?.src.stop();
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      if (eng) {
        for (const v of eng.voices) {
          try {
            v.filter.disconnect();
            v.gain.disconnect();
          } catch {
            /* noop */
          }
        }
        try {
          eng.coreGain.disconnect();
        } catch {
          /* noop */
        }
        eng.master.disconnect();
        if (eng.ctx.state !== "closed") eng.ctx.close().catch(() => {});
      }
    };
  }, []);

  const running = phase === "running";
  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
        style={{ backgroundColor: BG_DEEP }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              ten fingers · ten strands of your own recording
            </p>
            <h1 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground">
              Each finger holds one voice of Karel&apos;s take. Curl to silence
              its strand, extend to let it bloom.
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
              <span className="text-muted-foreground">
                tracking · live · {handsSeen} hand{handsSeen === 1 ? "" : "s"}
              </span>
            ) : controlLabel === "lost" ? (
              <span className="text-destructive">
                hands lost · show your hands to the camera
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">
                  drag to open / close voices
                </span>
              </span>
            ) : controlLabel === "pointer" ? (
              <span className="text-muted-foreground">
                pointer · drag across strands · down = wider bloom
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
                18032 · fingerloom — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Open all ten fingers to bloom every strand · curl a finger to
                silence its voice · left hand weaves the low strands, right hand
                the bright ones · a fist collapses to one quiet core voice.
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

        {/* immersive HUD */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Fingerloom"
            description="Your ten fingers each articulate one independent voice of Karel's real recording. The take is split into ten band/voice strands from bass to air; each finger's flexion sets its strand's gain and brightness, so your two open hands orchestrate the full texture and a closing fist collapses the piece to a single quiet core voice."
            howTo={[
              "Allow the camera and hold both hands up near the lens",
              "Open all ten fingers to bloom every strand of the recording",
              "Curl a finger to silence its one voice — left hand is the low strands, right the bright ones",
              "Make a fist to collapse to one core voice; open again to re-weave",
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
              className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                fingerloom — a per-finger orchestration conductor
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano takes loops and is split into
                  ten parallel bandpass voices spanning bass to air. Each of your
                  ten fingers articulates ONE of those voices independently:
                  extend a finger and its strand blooms — louder and, for the
                  upper fingers, brighter; curl it and that band fades toward
                  silence. Two open hands orchestrate the full spectral texture.
                </p>
                <p>
                  Each finger&apos;s flexion is read from MediaPipe&apos;s 21
                  keypoints per hand, NOT the whole-hand openness scalar. For the
                  four fingers we use a scale-invariant straightness ratio (the
                  direct knuckle-to-tip distance over the summed joint path); for
                  the thumb, its abduction from the index knuckle. Ten values,
                  each smoothed to read a curl within about a tenth of a second
                  and ramped with <code>setTargetAtTime(…, 0.12)</code> so
                  nothing clicks.
                </p>
                <p>
                  A quiet, low-passed core voice is always on, so a closing fist
                  never kills the piece — it collapses the orchestration to a
                  single dark bed you can re-bloom by opening your hands. Every
                  audible node terminates in the shared ear-safety master, never
                  the raw destination.
                </p>
                <p>
                  The visual is a loom of ten luminous filaments in a cool
                  deep-sea / aurora register. Each warp strand&apos;s brightness,
                  thickness and turbulence track its voice&apos;s gain; woven
                  weft threads and the knots where they cross the active warps
                  brighten with the orchestration, and overall motion energy is
                  driven by the safe-master analyser.
                </p>
                <p>
                  With no camera, permission denied, or a model-load failure, an
                  autonomous demo keeps the strands breathing (always labelled,
                  never masquerading as live), and dragging a &ldquo;bloom
                  cursor&rdquo; opens and closes voices by hand.
                </p>
                <p className="text-muted-foreground/80">
                  Reference: IJFMR 2026, &ldquo;Real-Time Gesture Recognition for
                  Virtual Musical Instruments&rdquo;, and the per-finger,
                  21-keypoint realtime hand-tracking pipeline.
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

      {!immersive && <PrototypeNav slugs={["18032-fingerloom"]} />}
    </main>
  );
}
