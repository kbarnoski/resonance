"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20640-mouthvalve — sing the SHAPE, not the note.
//
// ONE question: what if you could conduct Karel's piano with the SHAPE of your
// MOUTH? His real recording loops; your mouth is the valve it pours through.
//
// The whole piece turns on TWO scalars — aperture and width — and, BY
// CONSTRUCTION, the SAME two scalars drive BOTH the sound and the picture, so
// what you SEE is exactly what you HEAR:
//   · APERTURE (vertical lip gap) → a "valve" on his piano: a lowpass cutoff
//     (~300 Hz → ~6 kHz) AND a gain gate (~0.15 → ~1.0). Closed mouth = dark,
//     muffled, held-in; wide-open = bright, full, the music pours out. The same
//     aperture sets how far the drawn mouth opens and how brightly the luminous
//     stream issues from it.
//   · WIDTH (corner-to-corner) → a bright↔round timbre TILT via two fixed
//     peaking biquads whose balance shifts (a high peak ~2.8 kHz against a low
//     peak ~500 Hz). The same width sets the stream's spread and violet hue.
//
// POINTER-FIRST: the pointer is a genuine first-class control — pointer Y →
// aperture, pointer X → width — driving the IDENTICAL audio+visual chain with
// NO webcam. Arrow keys nudge the two scalars. The webcam (face mouth-landmarks)
// is the richer layer ON TOP: the piece is fully experienceable with no camera.
// Idle (no input) breathes gently and the stream keeps flowing — never blank.
//
// Visual is Canvas2D ONLY: a drawn mouth-aperture at center from which a
// luminous filament streams, brightness/width/turbulence tracking the tamed
// analyser RMS + aperture. Violet + bone on near-black. No green, no overlay.
//
// Audio = Karel's REAL catalog (ONE AudioBufferSourceNode, filtered — zero
// oscillators), terminating ONLY at createSafeMaster.input, never destination.
//
// Reference: Handel (contra.com, 2026-10-02), a browser toy mapping recognized
// hand SHAPES to sound events; this piece generalizes that shape→sound idea
// from the hand to the mouth — you sing the shape, not the note.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
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

// ── small math helpers (NOT hooks) ────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── MediaPipe FaceMesh (468-pt) mouth / eye indices ──────────────────────────
const LIP_UPPER = 13; // inner upper-lip center
const LIP_LOWER = 14; // inner lower-lip center
const CORNER_L = 61; // left mouth corner
const CORNER_R = 291; // right mouth corner
const EYE_L = 33; // left outer eye corner  (scale reference)
const EYE_R = 263; // right outer eye corner (scale reference)

// aperture / width are read as ratios against the inter-ocular distance so they
// are distance-invariant, then mapped into [0,1] across these empirical bounds.
const AP_LO = 0.04;
const AP_HI = 0.7;
const W_LO = 0.42;
const W_HI = 0.68;

interface Mouth {
  aperture: number; // 0 (shut) … 1 (wide)
  width: number; // 0 (pursed/round) … 1 (spread/bright)
}

function computeMouth(res: FaceResult): Mouth | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const eyeDist =
    Math.hypot(lm[EYE_R].x - lm[EYE_L].x, lm[EYE_R].y - lm[EYE_L].y) + 1e-4;
  const apRatio =
    Math.hypot(lm[LIP_LOWER].x - lm[LIP_UPPER].x, lm[LIP_LOWER].y - lm[LIP_UPPER].y) /
    eyeDist;
  const wRatio =
    Math.hypot(lm[CORNER_R].x - lm[CORNER_L].x, lm[CORNER_R].y - lm[CORNER_L].y) /
    eyeDist;
  return {
    aperture: clamp01((apRatio - AP_LO) / (AP_HI - AP_LO)),
    width: clamp01((wRatio - W_LO) / (W_HI - W_LO)),
  };
}

// ── the audio valve ──────────────────────────────────────────────────────────
// src → lowpass (aperture → cutoff) → lowPeak (~500Hz) → highPeak (~2.8kHz)
//     → valveGain (aperture → gate) → safeMaster.input.
// width shifts the balance of the two peaks (round ↔ bright). No oscillators.
interface Engine {
  src: AudioBufferSourceNode;
  valveFilter: BiquadFilterNode;
  lowPeak: BiquadFilterNode;
  highPeak: BiquadFilterNode;
  valveGain: GainNode;
  wave: Uint8Array<ArrayBuffer>;
}

function applyAudio(ctx: AudioContext, eng: Engine, aperture: number, width: number) {
  const now = ctx.currentTime;
  const tc = 0.12; // matches the visual smoothing
  // aperture → lowpass cutoff, exponential 300 Hz → ~6 kHz (reads as a valve)
  const cutoff = 300 * Math.pow(6000 / 300, aperture);
  eng.valveFilter.frequency.setTargetAtTime(cutoff, now, tc);
  // aperture → gain gate 0.15 → 1.0 (music "held in" when shut)
  eng.valveGain.gain.setTargetAtTime(0.15 + aperture * 0.85, now, tc);
  // width → timbre tilt: round (low boosted, high cut) ↔ bright (reverse)
  eng.lowPeak.gain.setTargetAtTime(6 - width * 12, now, tc); // +6 … −6 dB
  eng.highPeak.gain.setTargetAtTime(-6 + width * 12, now, tc); // −6 … +6 dB
}

// ── the luminous stream + drawn mouth (Canvas2D only) ────────────────────────
function cutoffHz(aperture: number): number {
  return 300 * Math.pow(6000 / 300, aperture);
}

function drawScene(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  aperture: number,
  width: number,
  wave: Uint8Array<ArrayBuffer> | null,
  rms: number,
  t: number,
) {
  // phosphor persistence — fade the previous frame toward near-black violet.
  c2d.globalCompositeOperation = "source-over";
  c2d.fillStyle = "rgba(6, 4, 14, 0.24)";
  c2d.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const unit = Math.min(w, h);
  const hue = 262 + width * 22; // 262 (round/violet) … 284 (bright/violet)
  const n = wave ? wave.length : 256;

  // sample the (tamed) waveform, or a gentle synthetic breath when silent, so
  // the stream is NEVER frozen even before Play.
  const sampleAt = (f: number): number => {
    if (wave) {
      const i = Math.min(n - 1, Math.max(0, Math.floor(f * (n - 1))));
      return (wave[i] - 128) / 128;
    }
    return 0.35 * Math.sin(f * 7 + t * 0.0016) * Math.sin(t * 0.0009);
  };

  c2d.globalCompositeOperation = "lighter";
  c2d.lineJoin = "round";
  c2d.lineCap = "round";

  // the stream issues from the mouth and flows to both edges. It is ANCHORED at
  // the mouth (displacement 0 at center, growing outward) so it reads as pouring
  // out. Thickness grows with aperture; turbulence + brightness grow with RMS.
  const steps = 120;
  const turb = 10 + rms * 150 + aperture * 70;
  const thick = (3 + aperture * 36) * (0.55 + rms * 1.1);
  for (const side of [1, -1] as const) {
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = cx + side * f * (w * 0.5 + 40);
      const samp = sampleAt(f);
      const yc = cy + samp * turb * f;
      const th = thick * (1 - 0.28 * f) * (0.4 + 0.6 * Math.sin(Math.PI * clamp01(f * 1.1)));
      top.push([x, yc - th]);
      bot.push([x, yc + th]);
    }
    // soft wide halo
    c2d.beginPath();
    c2d.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < top.length; i++) c2d.lineTo(top[i][0], top[i][1]);
    for (let i = bot.length - 1; i >= 0; i--) c2d.lineTo(bot[i][0], bot[i][1]);
    c2d.closePath();
    const light = clamp(46 + rms * 34 + aperture * 16, 40, 90);
    c2d.fillStyle = `hsla(${hue}, 88%, ${light}%, ${0.1 + aperture * 0.18})`;
    c2d.fill();

    // bright hot core line along the centerline
    c2d.beginPath();
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = cx + side * f * (w * 0.5 + 40);
      const yc = cy + sampleAt(f) * turb * f;
      if (i === 0) c2d.moveTo(x, yc);
      else c2d.lineTo(x, yc);
    }
    c2d.strokeStyle = `hsla(${Math.min(288, hue + 4)}, 92%, ${clamp(light + 22, 50, 96)}%, ${0.3 + aperture * 0.4})`;
    c2d.lineWidth = Math.max(0.8, 0.8 + aperture * 2.2);
    c2d.shadowColor = `hsla(${hue}, 90%, 70%, 0.9)`;
    c2d.shadowBlur = 8 + aperture * 26 + rms * 20;
    c2d.stroke();
    c2d.shadowBlur = 0;
  }

  // ── the drawn mouth-aperture at center — mirrors the live mouth scalars ──
  const halfW = unit * (0.055 + width * 0.11);
  const gap = unit * (0.004 + aperture * 0.14);

  // inner opening: a lens that brightens as it opens (the light pours from here)
  c2d.globalCompositeOperation = "lighter";
  c2d.beginPath();
  c2d.moveTo(cx - halfW, cy);
  c2d.quadraticCurveTo(cx, cy - gap, cx + halfW, cy);
  c2d.quadraticCurveTo(cx, cy + gap, cx - halfW, cy);
  c2d.closePath();
  const grad = c2d.createRadialGradient(cx, cy, 1, cx, cy, Math.max(halfW, gap) + 2);
  grad.addColorStop(0, `hsla(${Math.min(288, hue + 4)}, 70%, 92%, ${0.2 + aperture * 0.65})`);
  grad.addColorStop(1, `hsla(${hue}, 85%, 60%, ${0.04 + aperture * 0.22})`);
  c2d.fillStyle = grad;
  c2d.shadowColor = `hsla(${hue}, 90%, 72%, 0.85)`;
  c2d.shadowBlur = 14 + aperture * 40;
  c2d.fill();
  c2d.shadowBlur = 0;

  // lip lines — bone/off-white, giving the aperture definition
  c2d.strokeStyle = `rgba(238, 234, 246, ${0.3 + aperture * 0.35})`;
  c2d.lineWidth = Math.max(1, unit * 0.0022);
  c2d.beginPath();
  c2d.moveTo(cx - halfW, cy);
  c2d.quadraticCurveTo(cx, cy - gap - unit * 0.012, cx + halfW, cy);
  c2d.stroke();
  c2d.beginPath();
  c2d.moveTo(cx - halfW, cy);
  c2d.quadraticCurveTo(cx, cy + gap + unit * 0.012, cx + halfW, cy);
  c2d.stroke();

  c2d.globalCompositeOperation = "source-over";
}

type AudioPhase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "denied" | "failed";

const DESCRIPTION =
  "Conduct Karel's real piano with the SHAPE of your mouth — sing the shape, not the note. Opening your mouth opens a valve on his recording: closed is dark and held-in, wide-open pours the music out bright and full. The width of your mouth tilts the timbre from round to bright. The very same two measurements draw the glowing mouth and the luminous stream that issues from it, so what you see is exactly what you hear. No camera needed — your pointer or the arrow keys drive the identical chain.";

const HOW_TO = [
  "Press Play to sound Karel's piano, then conduct it",
  "No camera? Move your pointer: up/down opens the valve, left/right tilts the timbre",
  "Arrow keys nudge the two controls too",
  "Allow the camera for the richer layer: open your mouth to let the music pour out",
  "Widen your mouth (or move right) for a brighter tone; purse it (or move left) for a rounder one",
];

export default function MouthValvePage() {
  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camWantRef = useRef(false);
  const camStateRef = useRef<CamState>("off");

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const lastFaceRef = useRef(0);

  // the two scalars: smoothed (what actually drives) + raw target this frame.
  const apRef = useRef(0.4);
  const wRef = useRef(0.5);
  const apTargetRef = useRef(0.4);
  const wTargetRef = useRef(0.5);
  // pointer control (first-class): x → width, y → aperture.
  const pointerActiveRef = useRef(false);
  const pointerApRef = useRef(0.4);
  const pointerWRef = useRef(0.5);
  // keyboard nudges land here and persist as a pointer-equivalent control.
  const keyActiveRef = useRef(false);

  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [phase, setPhase] = useState<AudioPhase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [faceSeen, setFaceSeen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState({ ap: 0.4, w: 0.5, hz: 0 });
  const readoutRef = useRef(readout);

  camStateRef.current = camState;

  // ── canvas sizing (DPR-aware) ───────────────────────────────────────────────
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const wpx = cv.clientWidth || window.innerWidth;
    const hpx = cv.clientHeight || window.innerHeight;
    cv.width = Math.max(1, Math.round(wpx * dpr));
    cv.height = Math.max(1, Math.round(hpx * dpr));
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the frame loop — camera / pointer / idle all converge on two scalars ────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const prev = lastTimeRef.current || now;
    const dt = Math.min(0.1, (now - prev) / 1000);
    lastTimeRef.current = now;

    // 1. resolve the control target this frame (camera > pointer/keys > idle).
    let haveFace = false;
    const usingCam = camWantRef.current && camStateRef.current === "live";
    if (usingCam && trackerRef.current && videoRef.current && videoRef.current.readyState >= 2) {
      try {
        const res = trackerRef.current.detectForVideo(videoRef.current, now);
        const m = computeMouth(res);
        if (m) {
          apTargetRef.current = m.aperture;
          wTargetRef.current = m.width;
          lastFaceRef.current = now;
          haveFace = true;
        }
      } catch {
        /* a dropped detect frame is harmless */
      }
      const live = now - lastFaceRef.current < 500;
      if (live !== faceSeen) setFaceSeen(live);
    } else if (pointerActiveRef.current || keyActiveRef.current) {
      apTargetRef.current = pointerApRef.current;
      wTargetRef.current = pointerWRef.current;
    } else {
      // idle: the mouth breathes gently, the stream keeps flowing.
      apTargetRef.current = 0.34 + 0.22 * (0.5 + 0.5 * Math.sin(now * 0.00085));
      wTargetRef.current = 0.5 + 0.18 * Math.sin(now * 0.00052);
    }

    // 2. smooth toward the target (~0.12s easing — conducting, not twitching).
    const a = 1 - Math.exp(-dt / 0.12);
    apRef.current += (apTargetRef.current - apRef.current) * a;
    wRef.current += (wTargetRef.current - wRef.current) * a;
    const aperture = apRef.current;
    const width = wRef.current;

    // 3. drive the sound with the SAME two scalars.
    const ctx = ctxRef.current;
    const eng = engineRef.current;
    let rms = 0;
    let wave: Uint8Array<ArrayBuffer> | null = null;
    if (ctx && eng && masterRef.current) {
      applyAudio(ctx, eng, aperture, width);
      masterRef.current.analyser.getByteTimeDomainData(eng.wave);
      wave = eng.wave;
      // RMS from the tamed time-domain signal
      let sum = 0;
      for (let i = 0; i < eng.wave.length; i++) {
        const v = (eng.wave[i] - 128) / 128;
        sum += v * v;
      }
      rms = clamp01(Math.sqrt(sum / eng.wave.length) * 2.2);
      freqRef.current = eng.wave;
    }

    // 4. draw with the SAME two scalars → see == hear, guaranteed.
    const cv = canvasRef.current;
    const c2d = cv?.getContext("2d");
    if (cv && c2d) drawScene(c2d, cv.width, cv.height, aperture, width, wave, rms, now);

    // 5. live readout (throttled on change) — makes the coupling explicit.
    const hz = Math.round(cutoffHz(aperture));
    const prevR = readoutRef.current;
    if (
      Math.abs(prevR.ap - aperture) > 0.02 ||
      Math.abs(prevR.w - width) > 0.02 ||
      Math.abs(prevR.hz - hz) > 40
    ) {
      const next = { ap: aperture, w: width, hz };
      readoutRef.current = next;
      setReadout(next);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, [faceSeen]);

  // keep one rAF running for the whole lifetime so idle is always alive.
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [runFrame]);

  // ── start the audio (works with no camera — pointer drives it) ─────────────
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

      let loaded;
      try {
        loaded = await loadRealTrackBuffer(ctx, trackId);
      } catch {
        setErrMsg(
          "Karel's recording could not load — check the connection and press Play again.",
        );
        master.disconnect();
        await ctx.close();
        ctxRef.current = null;
        masterRef.current = null;
        setPhase("error");
        return;
      }
      setTrackTitle(loaded.title);

      // ── the valve: ONE source of HIS buffer, filtered. No oscillators. ──
      const src = ctx.createBufferSource();
      src.buffer = loaded.buffer;
      src.loop = true;
      src.playbackRate.value = 1.0;

      const valveFilter = ctx.createBiquadFilter();
      valveFilter.type = "lowpass";
      valveFilter.frequency.value = 1200;
      valveFilter.Q.value = 0.9;

      const lowPeak = ctx.createBiquadFilter();
      lowPeak.type = "peaking";
      lowPeak.frequency.value = 500;
      lowPeak.Q.value = 0.9;
      lowPeak.gain.value = 0;

      const highPeak = ctx.createBiquadFilter();
      highPeak.type = "peaking";
      highPeak.frequency.value = 2800;
      highPeak.Q.value = 0.9;
      highPeak.gain.value = 0;

      const valveGain = ctx.createGain();
      valveGain.gain.value = 0.5;

      src.connect(valveFilter);
      valveFilter.connect(lowPeak);
      lowPeak.connect(highPeak);
      highPeak.connect(valveGain);
      valveGain.connect(master.input);

      engineRef.current = {
        src,
        valveFilter,
        lowPeak,
        highPeak,
        valveGain,
        wave: new Uint8Array(master.analyser.fftSize),
      };

      src.start();
      setPhase("running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Web Audio is unavailable in this browser.");
      setPhase("error");
    }
  }, [phase, trackId]);

  // ── camera opt-in: the richer layer on top of the pointer ──────────────────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    if (!videoRef.current) return;
    setCamState("requesting");
    setErrMsg("");
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
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  const disableCamera = useCallback(() => {
    camWantRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      trackerRef.current?.close();
    } catch {
      /* noop */
    }
    trackerRef.current = null;
    setFaceSeen(false);
    setCamState("off");
  }, []);

  // ── pointer control (first-class): x → width, y → aperture ─────────────────
  const pointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const ny = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    pointerWRef.current = nx; // left = round, right = bright
    pointerApRef.current = 1 - ny; // top = open, bottom = closed
    pointerActiveRef.current = true;
  }, []);
  const pointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camStateRef.current === "live") return;
      pointerMove(e);
    },
    [pointerMove],
  );
  const pointerLeave = useCallback(() => {
    pointerActiveRef.current = false;
  }, []);

  // ── keyboard conducting (a11y) — same two scalars as the pointer ───────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
      )
        return;
      if (camStateRef.current === "live") return;
      let handled = false;
      if (e.key === "ArrowUp") {
        pointerApRef.current = clamp01(pointerApRef.current + 0.05);
        handled = true;
      } else if (e.key === "ArrowDown") {
        pointerApRef.current = clamp01(pointerApRef.current - 0.05);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pointerWRef.current = clamp01(pointerWRef.current + 0.05);
        handled = true;
      } else if (e.key === "ArrowLeft") {
        pointerWRef.current = clamp01(pointerWRef.current - 0.05);
        handled = true;
      }
      if (handled) {
        keyActiveRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        const nodes: AudioNode[] = [
          eng.src,
          eng.valveFilter,
          eng.lowPeak,
          eng.highPeak,
          eng.valveGain,
        ];
        for (const nd of nodes) {
          try {
            nd.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── derived UI state ───────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && faceSeen;
  const camLost = camState === "live" && !faceSeen;
  const camBad = camState === "denied" || camState === "failed";
  const usingPointer = camState !== "live";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "no mouth — face the camera, mouth in frame"
      : usingPointer && running
        ? "pointer · live — move to conduct (no camera needed)"
        : usingPointer
          ? "pointer · ready — move to conduct, or press Play"
          : "";

  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the stream IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#06040e", cursor: usingPointer ? "crosshair" : "default" }}
        onPointerMove={usingPointer ? pointerMove : undefined}
        onPointerDown={usingPointer ? pointerDown : undefined}
        onPointerLeave={usingPointer ? pointerLeave : undefined}
      />

      {/* mirrored camera preview — small, corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {/* live readout — the see==hear coupling, made explicit */}
      <div className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}>
        aperture {readout.ap.toFixed(2)} · width {readout.w.toFixed(2)} · valve {readout.hz} Hz
      </div>

      {/* tracking / fallback status — functional, stays in immersive too */}
      {statusText && (
        <div
          className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}
      {phase === "error" && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — conducting with the
          pointer (move) or arrow keys instead.
        </div>
      )}

      {/* FULL write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className={labelCls}>Mouth-shape · resonant valve</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Mouthvalve
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Conduct Karel&rsquo;s piano with the shape of your mouth — sing the shape, not the
                note. Open to let it pour out bright; close to hold it in, dark and muffled.
                {running && (
                  <span className="text-muted-foreground/70"> Now playing: {trackTitle}.</span>
                )}
              </p>
            </div>
            <button type="button" onClick={() => setNotesOpen(true)} className={`${btnGhost} shrink-0`}>
              Read the design notes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button type="button" onClick={begin} className={btnPrimary} disabled={phase === "loading"}>
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · {trackTitle}</span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting"}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera (mouth)"}
              </button>
            ) : (
              <button type="button" onClick={disableCamera} className={btnGhost}>
                camera · live — switch off
              </button>
            )}

            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.tracks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Mouthvalve"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* While immersive: only art + status + HUD. A minimal Play if not sounding. */}
      {immersive && !running && phase !== "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={begin} className={btnPrimary}>
            Play
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Mouthvalve"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal (mirrors README.md) */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Mouthvalve — design notes
              </h2>
              <button type="button" onClick={() => setNotesOpen(false)} className={btnGhost} aria-label="Close">
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The one question: what if you could conduct Karel&rsquo;s piano with the{" "}
                <span className="text-foreground">shape of your mouth</span> — sing the shape, not
                the note? His recording loops; your mouth is the valve it pours through.
              </p>
              <p>
                Two scalars run everything.{" "}
                <span className="text-foreground">Aperture</span> (vertical lip gap) opens a valve
                on his piano: a lowpass cutoff from ~300&nbsp;Hz to ~6&nbsp;kHz and a gain gate from
                ~0.15 to ~1.0. Closed is dark, muffled, held-in; wide-open pours the music out
                bright and full. <span className="text-foreground">Width</span> (corner-to-corner)
                tilts the timbre between two fixed peaking filters — a low peak near 500&nbsp;Hz
                (round) against a high peak near 2.8&nbsp;kHz (bright).
              </p>
              <p>
                The coupling is <span className="text-foreground">by construction</span>: the same
                two scalars that filter the sound also draw the glowing mouth-aperture at center and
                the luminous stream that issues from it. So what you see is exactly what you hear —
                there is no second path to drift out of sync.
              </p>
              <p>
                It is <span className="text-foreground">pointer-first</span>: the pointer is a
                genuine first-class control — up/down is aperture, left/right is width — driving the
                identical audio and visual chain with no webcam, and arrow keys nudge the same two
                scalars. The camera (face mouth-landmarks 13/14 for aperture, 61/291 for width,
                normalized by the outer-eye distance) is the richer layer on top. Camera denied or
                failed degrades to a visible notice; idle lets the mouth breathe so the screen is
                never blank.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Reference
              </p>
              <p>
                The lab&rsquo;s first mouth-driven piece, after{" "}
                <span className="text-foreground">Handel</span> (contra.com, 2026-10-02), a browser
                toy mapping recognized hand shapes to sound events. Mouthvalve generalizes that
                shape&rarr;sound idea from the hand to the mouth.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
