"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

// ─────────────────────────────────────────────────────────────────────────────
// 18196-breathtide-flow · "Conduct your own piano recording with your BREATH."
//
//   Karel's real take loops. Your webcam watches your chest rise and fall — a
//   pose landmarker finds the shoulder line, a chest region-of-interest just
//   below it is sampled for frame-to-frame vertical motion, and that slow signal
//   is band-limited into a breath waveform. INHALE swells + opens + brightens the
//   music into a reverberant bloom built from his own sound; EXHALE settles it
//   dry, warm and quiet. Depth scales the bloom, rate paces a tidal tremolo.
//
//   Audio is ALWAYS his recording (dual dry/wet path, convolver IR sliced from
//   his own buffer). The camera never generates sound — it only shapes his.
//   Detection approach B: chest-ROI motion, landmark-light.
// ─────────────────────────────────────────────────────────────────────────────

const WELCOME_HOME = COLLECTIONS[0].tracks;

// ── art palette — cool tidal, canvas strings only (never in className) ────────
const ART = {
  bg0: "#04060f",
  bg1: "#081426",
  aqua: "#5fe3d6",
  cyan: "#67c9ff",
  pale: "#d9f7ff",
  indigo: "#2a3d8f",
  deep: "#0a1533",
} as const;

// ── breath detection constants ────────────────────────────────────────────────
const OFF_W = 96;
const OFF_H = 72;
const DRIFT_HZ = 0.1; // remove drift below this (high-pass corner)
const BREATH_HZ = 0.5; // resolved breath ceiling (low-pass corner)
const DETECT_MS = 40; // pose detection cadence (~25 Hz); ROI sampled every frame
const HOLD_MS = 900; // hold last good estimate this long when tracking drops
const MOTION_FLOOR = 0.6; // ROI motion energy below this = low signal
const DEMO_PERIOD = 4.6; // seconds per synthetic breath (~13 bpm)

type Mode = "idle" | "demo" | "camera" | "pointer";
type Tracking = "demo" | "live" | "low" | "lost" | "pointer";

interface BandState {
  slow: number; // one-pole low estimate of drift
  fast: number; // one-pole low-pass of the high-passed signal
  init: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Build a reverb impulse response from a decaying slice of HIS OWN buffer.
function buildImpulseResponse(
  ctx: AudioContext,
  buffer: AudioBuffer,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(2.0 * rate));
  const ir = ctx.createBuffer(2, len, rate);
  const start = Math.floor(buffer.length * 0.34);
  for (let ch = 0; ch < 2; ch++) {
    const out = ir.getChannelData(ch);
    const src = buffer.getChannelData(
      Math.min(ch, buffer.numberOfChannels - 1),
    );
    for (let i = 0; i < len; i++) {
      const env = Math.exp((-3.4 * i) / len);
      const attack = i < 480 ? i / 480 : 1;
      const s = start + i < buffer.length ? src[start + i] : 0;
      out[i] = s * env * attack;
    }
  }
  return ir;
}

// Estimate a vertical shift (rows) between two row-luminance profiles by
// minimizing SAD over a small search range — a coarse optical-flow proxy for
// the chest ROI rising / falling.
function estimateVerticalShift(
  prev: Float32Array,
  cur: Float32Array,
): number {
  const n = prev.length;
  if (n < 6) return 0;
  const R = 3;
  let best = 0;
  let bestErr = Infinity;
  for (let s = -R; s <= R; s++) {
    let err = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const j = i + s;
      if (j < 0 || j >= n) continue;
      const d = cur[i] - prev[j];
      err += d < 0 ? -d : d;
      count++;
    }
    if (count > 0) {
      err /= count;
      if (err < bestErr) {
        bestErr = err;
        best = s;
      }
    }
  }
  return best;
}

export default function BreathtideFlow() {
  const { immersive, toggle } = useImmersive();

  // ── UI-facing state ──────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [canvasOk, setCanvasOk] = useState(true);
  const [mode, setMode] = useState<Mode>("idle");
  const [tracking, setTracking] = useState<Tracking>("demo");
  const [bpm, setBpm] = useState(0);
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(WELCOME_HOME[0].title);
  const [camBusy, setCamBusy] = useState(false);

  // ── canvas / loop refs ─────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number>(0);

  // ── audio refs ─────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const preGainRef = useRef<GainNode | null>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);
  const tremGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const audioReadyRef = useRef(false);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // ── camera / detection refs ────────────────────────────────────────────────
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const offCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const prevProfileRef = useRef<Float32Array | null>(null);
  const roiPosRef = useRef(0); // leaky-integrated ROI vertical position
  const roiBoxRef = useRef<[number, number, number, number] | null>(null); // nx,ny,nw,nh
  const lastDetectRef = useRef(0);
  const lastGoodRef = useRef(0); // timestamp of last confident pose
  const bandRef = useRef<BandState>({ slow: 0, fast: 0, init: false });
  const envMaxRef = useRef(0.05);
  const envMinRef = useRef(-0.05);
  const slopeRef = useRef(0);
  const prevBreathRef = useRef(0.5);
  const lastPeakTimeRef = useRef(0);
  const wasRisingRef = useRef(false);
  const bpmRef = useRef(0);

  // ── shared breath outputs (read by the render loop + audio mapping) ──────────
  const breath01Ref = useRef(0.5); // 0 = fully exhaled … 1 = fully inhaled
  const depthRef = useRef(0.5);
  const inhalingRef = useRef(false);
  const trackingRef = useRef<Tracking>("demo");
  const modeRef = useRef<Mode>("idle");
  const lfoPhaseRef = useRef(0);
  const lastTsRef = useRef(0);

  // ── pointer / spacebar fallback ──────────────────────────────────────────────
  const holdRef = useRef(false);
  const pointerBreathRef = useRef(0.5);

  // status throttle
  const statusTickRef = useRef(0);

  // Keep mode ref in sync.
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── audio graph ──────────────────────────────────────────────────────────
  const startSource = useCallback((ctx: AudioContext, buffer: AudioBuffer) => {
    const pre = preGainRef.current;
    if (!pre) return;
    if (srcRef.current) {
      try {
        srcRef.current.stop();
        srcRef.current.disconnect();
      } catch {
        /* already stopped */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(pre);
    src.start();
    srcRef.current = src;
  }, []);

  const startAudio = useCallback(async () => {
    if (started || loading) return;
    setLoading(true);
    setAudioError(null);
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;
      freqDataRef.current = new Uint8Array(
        new ArrayBuffer(master.analyser.frequencyBinCount),
      );

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      bufferRef.current = buffer;
      setTrackTitle(title);

      // Dual path: source → preGain → lowShelf → highShelf → tremGain → {dry, wet}.
      const pre = ctx.createGain();
      pre.gain.value = 0.85;
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 320;
      low.gain.value = 3;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 2600;
      high.gain.value = 0;
      const trem = ctx.createGain();
      trem.gain.value = 1;

      const dry = ctx.createGain();
      dry.gain.value = 0.9;
      const wet = ctx.createGain();
      wet.gain.value = 0.12;
      const conv = ctx.createConvolver();
      conv.buffer = buildImpulseResponse(ctx, buffer);

      pre.connect(low);
      low.connect(high);
      high.connect(trem);
      trem.connect(dry);
      trem.connect(conv);
      conv.connect(wet);
      dry.connect(master.input);
      wet.connect(master.input);

      preGainRef.current = pre;
      lowShelfRef.current = low;
      highShelfRef.current = high;
      tremGainRef.current = trem;
      dryGainRef.current = dry;
      wetGainRef.current = wet;
      convolverRef.current = conv;

      startSource(ctx, buffer);
      audioReadyRef.current = true;
      setStarted(true);
      setMode("demo");
      modeRef.current = "demo";
      setLoading(false);
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : "Could not load the recording.",
      );
      setLoading(false);
    }
  }, [started, loading, trackId, startSource]);

  // Change track while playing (reload buffer, rebuild source + IR).
  const changeTrack = useCallback(
    async (id: string) => {
      setTrackId(id);
      const ctx = ctxRef.current;
      if (!ctx || !audioReadyRef.current) return;
      setLoading(true);
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        bufferRef.current = buffer;
        setTrackTitle(title);
        if (convolverRef.current) {
          convolverRef.current.buffer = buildImpulseResponse(ctx, buffer);
        }
        startSource(ctx, buffer);
        setLoading(false);
      } catch (err) {
        setAudioError(
          err instanceof Error ? err.message : "Could not load the recording.",
        );
        setLoading(false);
      }
    },
    [startSource],
  );

  // ── camera control ──────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (trackerRef.current) {
      try {
        trackerRef.current.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    prevProfileRef.current = null;
    roiBoxRef.current = null;
    bandRef.current = { slow: 0, fast: 0, init: false };
  }, []);

  const enableCamera = useCallback(async () => {
    if (camBusy) return;
    setCamBusy(true);
    setCamNotice(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const tracker = await createPoseTracker(1);
      const stream = await startCamera(video);
      trackerRef.current = tracker;
      streamRef.current = stream;
      lastGoodRef.current = performance.now();
      setMode("camera");
      modeRef.current = "camera";
    } catch {
      stopCamera();
      setCamNotice(
        "Camera or model unavailable. Falling back — hold Spacebar (or press and hold) to inhale, release to exhale.",
      );
      setMode("pointer");
      modeRef.current = "pointer";
    } finally {
      setCamBusy(false);
    }
  }, [camBusy, stopCamera]);

  const backToDemo = useCallback(() => {
    stopCamera();
    setCamNotice(null);
    setMode("demo");
    modeRef.current = "demo";
  }, [stopCamera]);

  const switchToPointer = useCallback(() => {
    stopCamera();
    setMode("pointer");
    modeRef.current = "pointer";
  }, [stopCamera]);

  // ── pointer / spacebar listeners ──────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (modeRef.current === "pointer") {
        e.preventDefault();
        holdRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") holdRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = useCallback(() => {
    if (modeRef.current === "pointer") holdRef.current = true;
  }, []);
  const onPointerUp = useCallback(() => {
    holdRef.current = false;
  }, []);

  // ── ROI sampling + breath extraction (called each frame in camera mode) ──────
  const runCameraSample = useCallback((now: number, dt: number) => {
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!video || !tracker || video.readyState < 2) return;

    let off = offRef.current;
    let octx = offCtxRef.current;
    if (!off) {
      off = document.createElement("canvas");
      off.width = OFF_W;
      off.height = OFF_H;
      offRef.current = off;
      octx = off.getContext("2d", { willReadFrequently: true });
      offCtxRef.current = octx;
    }
    if (!octx) return;

    // Draw the mirrored video small so pixel reads stay cheap.
    octx.save();
    octx.translate(OFF_W, 0);
    octx.scale(-1, 1);
    octx.drawImage(video, 0, 0, OFF_W, OFF_H);
    octx.restore();

    // Throttled pose detection to place the chest ROI (mirrored coords).
    if (now - lastDetectRef.current > DETECT_MS) {
      lastDetectRef.current = now;
      try {
        const res = tracker.detectForVideo(video, now);
        const lm = res.landmarks?.[0];
        const ls = lm?.[POSE_LM.leftShoulder];
        const rs = lm?.[POSE_LM.rightShoulder];
        if (
          ls &&
          rs &&
          (ls.visibility ?? 1) > 0.4 &&
          (rs.visibility ?? 1) > 0.4
        ) {
          const mx = 1 - (ls.x + rs.x) / 2; // mirror x to match the offscreen draw
          const my = (ls.y + rs.y) / 2;
          const sw = Math.abs(ls.x - rs.x);
          const w = clamp01(sw * 1.15);
          const h = 0.3;
          const nx = clamp01(mx - w / 2);
          const ny = clamp01(my + 0.05);
          roiBoxRef.current = [nx, ny, w, Math.min(h, 1 - ny)];
          lastGoodRef.current = now;
        }
      } catch {
        /* detection hiccup — keep last ROI */
      }
    }

    // Fallback centered chest ROI when shoulders are not (yet) found.
    if (!roiBoxRef.current) {
      roiBoxRef.current = [0.3, 0.42, 0.4, 0.32];
    }
    const [nx, ny, nw, nh] = roiBoxRef.current;
    const x0 = Math.max(0, Math.floor(nx * OFF_W));
    const y0 = Math.max(0, Math.floor(ny * OFF_H));
    const x1 = Math.min(OFF_W, Math.ceil((nx + nw) * OFF_W));
    const y1 = Math.min(OFF_H, Math.ceil((ny + nh) * OFF_H));
    const rw = Math.max(1, x1 - x0);
    const rh = Math.max(1, y1 - y0);

    const img = octx.getImageData(x0, y0, rw, rh).data;
    // Row luminance profile + motion energy vs. previous frame.
    const profile = new Float32Array(rh);
    let energy = 0;
    const prev = prevProfileRef.current;
    for (let r = 0; r < rh; r++) {
      let sum = 0;
      for (let c = 0; c < rw; c++) {
        const i = (r * rw + c) * 4;
        sum += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      }
      profile[r] = sum / rw;
    }
    if (prev && prev.length === rh) {
      for (let r = 0; r < rh; r++) energy += Math.abs(profile[r] - prev[r]);
      energy /= rh;
    }

    // Vertical flow → leaky-integrated chest position; blend with shoulder rise.
    const shift = prev && prev.length === rh
      ? estimateVerticalShift(prev, profile)
      : 0;
    prevProfileRef.current = profile;
    // Up in the frame (smaller y / negative shift) reads as expansion/inhale.
    roiPosRef.current = roiPosRef.current * 0.94 - shift;
    const roiComponent = roiPosRef.current * 0.6;
    // ny tracks just below the last good shoulder line: inhale lifts it (smaller y).
    const shoulderComponent = (0.5 - ny) * 12;
    const raw = roiComponent + shoulderComponent;

    // Band-limit: high-pass (remove drift) then low-pass (~0.1–0.5 Hz).
    const b = bandRef.current;
    if (!b.init) {
      b.slow = raw;
      b.fast = 0;
      b.init = true;
    }
    const aSlow = clamp01((2 * Math.PI * DRIFT_HZ * dt) / (1 + 2 * Math.PI * DRIFT_HZ * dt));
    const aFast = clamp01((2 * Math.PI * BREATH_HZ * dt) / (1 + 2 * Math.PI * BREATH_HZ * dt));
    b.slow += aSlow * (raw - b.slow);
    const hp = raw - b.slow;
    b.fast += aFast * (hp - b.fast);
    const breath = b.fast;

    // Adaptive envelope → normalized breath position 0..1.
    if (breath > envMaxRef.current) envMaxRef.current += 0.5 * (breath - envMaxRef.current);
    else envMaxRef.current += 0.01 * (breath - envMaxRef.current);
    if (breath < envMinRef.current) envMinRef.current += 0.5 * (breath - envMinRef.current);
    else envMinRef.current += 0.01 * (breath - envMinRef.current);
    const range = envMaxRef.current - envMinRef.current;
    const norm = range > 1e-3 ? clamp01((breath - envMinRef.current) / range) : 0.5;

    // Motion / signal confidence.
    const hasSignal = energy > MOTION_FLOOR && range > 0.15;
    const trackAlive = now - lastGoodRef.current < 4000;

    if (hasSignal) {
      breath01Ref.current += 0.35 * (norm - breath01Ref.current);
      depthRef.current += 0.05 * (clamp01(range / 3.5) - depthRef.current);
      trackingRef.current = "live";
    } else if (now - lastGoodRef.current < HOLD_MS && trackAlive) {
      // Hold the last good estimate briefly rather than snapping to zero.
      trackingRef.current = "live";
    } else {
      trackingRef.current = trackAlive ? "low" : "lost";
      // decay gently toward neutral so it settles rather than freezes
      breath01Ref.current += 0.02 * (0.5 - breath01Ref.current);
      depthRef.current += 0.02 * (0.25 - depthRef.current);
    }

    // Slope → inhaling; peak detection → bpm.
    const slope = breath01Ref.current - prevBreathRef.current;
    slopeRef.current += 0.3 * (slope - slopeRef.current);
    prevBreathRef.current = breath01Ref.current;
    const rising = slopeRef.current > 0.0015;
    inhalingRef.current = rising;
    if (wasRisingRef.current && !rising && breath01Ref.current > 0.55) {
      const period = (now - lastPeakTimeRef.current) / 1000;
      if (lastPeakTimeRef.current > 0 && period > 1.5 && period < 15) {
        const inst = 60 / period;
        bpmRef.current = bpmRef.current > 0 ? bpmRef.current * 0.6 + inst * 0.4 : inst;
      }
      lastPeakTimeRef.current = now;
    }
    wasRisingRef.current = rising;
  }, []);

  // ── main render + audio-mapping loop (runs from mount for live visuals) ──────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      setCanvasOk(false);
      return;
    }

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const last = lastTsRef.current || now;
      let dt = (now - last) / 1000;
      lastTsRef.current = now;
      if (dt <= 0 || dt > 0.25) dt = 1 / 60;

      const m = modeRef.current;

      // ── derive breath by mode ──
      if (m === "camera") {
        runCameraSample(now, dt);
      } else if (m === "pointer") {
        const target = holdRef.current ? 1 : 0;
        pointerBreathRef.current += (holdRef.current ? 0.9 : 0.55) * dt *
          (target - pointerBreathRef.current) * 6;
        pointerBreathRef.current = clamp01(pointerBreathRef.current);
        const slope = pointerBreathRef.current - breath01Ref.current;
        breath01Ref.current = pointerBreathRef.current;
        depthRef.current = 0.85;
        inhalingRef.current = slope > 0.001;
        trackingRef.current = "pointer";
        bpmRef.current = 10;
      } else {
        // demo (or idle before audio) — a slow autonomous breath curve.
        const t = now / 1000;
        const period = DEMO_PERIOD + 0.9 * Math.sin(t * 0.05);
        const phase = (t % period) / period;
        const v = 0.5 - 0.46 * Math.cos(phase * Math.PI * 2);
        const prev = breath01Ref.current;
        breath01Ref.current = v;
        depthRef.current = 0.7;
        inhalingRef.current = v - prev > 0;
        trackingRef.current = "demo";
        bpmRef.current = Math.round(60 / period);
      }

      const breath01 = breath01Ref.current;
      const depth = depthRef.current;
      const inhaling = inhalingRef.current;
      const bloom = clamp01(depth * breath01 + 0.05);

      // ── audio mapping ──
      const ctx = ctxRef.current;
      if (audioReadyRef.current && ctx) {
        const tc = 0.16;
        const t = ctx.currentTime;
        // equal-power dry/wet crossfade toward wet on inhale
        const mix = 0.12 + 0.82 * bloom;
        const wet = Math.sin((mix * Math.PI) / 2);
        const dryv = Math.cos((mix * Math.PI) / 2);
        wetGainRef.current?.gain.setTargetAtTime(0.15 + 0.85 * wet, t, tc);
        dryGainRef.current?.gain.setTargetAtTime(0.35 + 0.7 * dryv, t, tc);
        highShelfRef.current?.gain.setTargetAtTime(-2 + 10 * bloom, t, tc);
        lowShelfRef.current?.gain.setTargetAtTime(1.5 + 5 * (1 - bloom), t, tc);
        preGainRef.current?.gain.setTargetAtTime(0.7 + 0.4 * bloom, t, tc);
        masterRef.current?.setGain(0.5 + 0.4 * bloom);
        // tidal tremolo paced by breath rate
        const rateHz = Math.max(0.08, Math.min(0.4, (bpmRef.current || 12) / 60));
        lfoPhaseRef.current += dt * rateHz;
        const tremDepth = 0.1 + 0.12 * depth;
        const trem = 1 - tremDepth * (0.5 - 0.5 * Math.cos(lfoPhaseRef.current * Math.PI * 2));
        tremGainRef.current?.gain.setTargetAtTime(trem, t, 0.05);
      }

      // ── analyser energy for the visuals ──
      let lowE = 0;
      let midE = 0;
      let hiE = 0;
      const master = masterRef.current;
      const freq = freqDataRef.current;
      if (master && freq) {
        master.analyser.getByteFrequencyData(freq);
        const n = freq.length;
        const a = Math.floor(n * 0.12);
        const b2 = Math.floor(n * 0.45);
        for (let i = 0; i < a; i++) lowE += freq[i];
        for (let i = a; i < b2; i++) midE += freq[i];
        for (let i = b2; i < n; i++) hiE += freq[i];
        lowE = lowE / (a * 255 || 1);
        midE = midE / ((b2 - a) * 255 || 1);
        hiE = hiE / ((n - b2) * 255 || 1);
      }

      drawStage(ctx2d, canvas.width, canvas.height, now / 1000, {
        breath01,
        depth,
        inhaling,
        lowE,
        midE,
        hiE,
        tracking: trackingRef.current,
        roiBox: modeRef.current === "camera" ? roiBoxRef.current : null,
      });

      // ── throttled status → React ──
      if (now - statusTickRef.current > 220) {
        statusTickRef.current = now;
        setTracking((prev) =>
          prev === trackingRef.current ? prev : trackingRef.current,
        );
        const nb = Math.round(bpmRef.current || 0);
        setBpm((prev) => (prev === nb ? prev : nb));
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [runCameraSample]);

  // ── unmount teardown ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopCamera();
      try {
        srcRef.current?.stop();
      } catch {
        /* noop */
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* noop */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [stopCamera]);

  const liveStatus = tracking === "live";
  const bpmText = bpm > 0 ? `${bpm} breaths/min` : "measuring…";

  const statusLine = (() => {
    if (mode === "demo")
      return { text: `demo · autonomous breath · ${bpmText}`, bad: false };
    if (mode === "pointer")
      return { text: `pointer breath · hold to inhale`, bad: false };
    if (tracking === "live")
      return { text: `breathing · live · ${bpmText}`, bad: false };
    if (tracking === "low")
      return {
        text: "low signal · sit back so your chest fills the frame · increase lighting",
        bad: true,
      };
    if (tracking === "lost")
      return {
        text: "tracking lost · sit so your head and shoulders are in view",
        bad: true,
      };
    return { text: "starting camera…", bad: false };
  })();

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden webcam feed */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* viewport-filling stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* canvas-unavailable notice */}
      {!canvasOk && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <p className="max-w-md rounded-lg border border-border bg-background/90 p-6 text-base leading-relaxed text-destructive shadow-lg">
            This browser could not open a 2D canvas, so the visualization
            can&apos;t run here.
          </p>
        </div>
      )}

      {/* tracking status — visible whenever the piece is live */}
      {started && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              statusLine.bad ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {liveStatus && !statusLine.bad ? "● " : ""}
            {statusLine.text}
          </span>
        </div>
      )}

      {/* start overlay */}
      {!started && canvasOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/80 p-6 text-center shadow-lg backdrop-blur-sm">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Breathtide
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Conduct one of Karel&apos;s piano recordings with your breath.
              Inhale to open and swell the music; exhale to let it settle. The
              field is already breathing on its own — press begin to hear it,
              then let your webcam watch your chest rise and fall.
            </p>
            {audioError && (
              <p className="mt-4 text-sm leading-relaxed text-destructive">
                {audioError}
              </p>
            )}
            <button
              type="button"
              onClick={startAudio}
              disabled={loading}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Begin"}
            </button>
          </div>
        </div>
      )}

      {/* control strip + write-up chrome (hidden while immersive) */}
      {!immersive && started && (
        <>
          <div className="absolute left-4 top-4 z-30 max-w-sm">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Breathtide{" "}
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                flow
              </span>
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {trackTitle} — conducted by your breath.
            </p>
          </div>

          <div className="absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-4">
            <label className="sr-only" htmlFor="track">
              Track
            </label>
            <select
              id="track"
              value={trackId}
              onChange={(e) => changeTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {WELCOME_HOME.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>

            {mode !== "camera" ? (
              <button
                type="button"
                onClick={enableCamera}
                disabled={camBusy}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {camBusy ? "Starting camera…" : "Enable camera"}
              </button>
            ) : (
              <button
                type="button"
                onClick={backToDemo}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop camera
              </button>
            )}

            {mode !== "pointer" && (
              <button
                type="button"
                onClick={switchToPointer}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Use spacebar / tap
              </button>
            )}

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Breathtide"
              description="Conduct Karel's piano recording with your breath — inhale to open and swell the music into a reverberant bloom, exhale to let it settle warm and quiet. A webcam watches your chest rise and fall."
              howTo={[
                "Breathe slowly and deeply — inhale to open the music, exhale to let it settle",
                "Sit so your head and shoulders fill the camera frame",
                "No camera? Hold Spacebar or press and hold to inhale, release to exhale",
                "Press F for fullscreen, i for info",
              ]}
            />
          </div>

          {camNotice && (
            <div className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 px-4">
              <p className="max-w-md rounded-md border border-border bg-background/80 px-4 py-2 text-sm leading-relaxed text-muted-foreground">
                {camNotice}
              </p>
            </div>
          )}

          {audioError && (
            <div className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 px-4">
              <p className="max-w-md rounded-md border border-border bg-background/80 px-4 py-2 text-sm leading-relaxed text-destructive">
                {audioError}
              </p>
            </div>
          )}

          <PrototypeNav slugs={["18196-breathtide-flow"]} />
        </>
      )}

      {/* immersive HUD when chrome is hidden but piece running */}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Breathtide"
          description="Conduct Karel's piano recording with your breath — inhale to open and swell the music into a reverberant bloom, exhale to let it settle warm and quiet."
          howTo={[
            "Breathe slowly and deeply — inhale to open the music, exhale to let it settle",
            "Sit so your head and shoulders fill the camera frame",
            "Press F for fullscreen, i for info",
          ]}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// drawStage — cool tidal aurora field that inhales (rises/brightens/opens) and
// exhales (falls/dims/warms) with the breath, layered with analyser energy.
// Motion trails via a translucent wash (never grain).
// ─────────────────────────────────────────────────────────────────────────────
interface StageState {
  breath01: number;
  depth: number;
  inhaling: boolean;
  lowE: number;
  midE: number;
  hiE: number;
  tracking: Tracking;
  roiBox: [number, number, number, number] | null;
}

function drawStage(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  s: StageState,
) {
  const b = s.breath01;
  const energy = clamp01(s.lowE * 0.6 + s.midE * 0.5 + s.hiE * 0.3);

  // afterglow wash (trails, not grain)
  const wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, "rgba(4,6,15,0.30)");
  wash.addColorStop(1, "rgba(8,20,38,0.34)");
  g.fillStyle = wash;
  g.globalCompositeOperation = "source-over";
  g.fillRect(0, 0, W, H);

  // deep field wash on inhale — the space opens up
  g.globalCompositeOperation = "lighter";

  const cx = W / 2;
  // horizon rises with the breath
  const horizon = H * (0.72 - 0.16 * b);
  const radius = Math.min(W, H) * (0.28 + 0.42 * b + 0.06 * energy);

  // central tidal swell
  const glow = g.createRadialGradient(cx, horizon, 0, cx, horizon, radius);
  const alpha = 0.1 + 0.34 * b + 0.15 * energy;
  glow.addColorStop(0, hexA(ART.pale, alpha * 0.9));
  glow.addColorStop(0.35, hexA(ART.aqua, alpha * 0.7));
  glow.addColorStop(0.7, hexA(ART.cyan, alpha * 0.4));
  glow.addColorStop(1, "rgba(10,21,51,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, horizon, radius, 0, Math.PI * 2);
  g.fill();

  // layered aurora ribbons riding the horizon
  const ribbons = 4;
  for (let i = 0; i < ribbons; i++) {
    const fi = i / (ribbons - 1);
    const amp = (H * 0.05 + H * 0.11 * b) * (1 - fi * 0.4);
    const speed = 0.15 + fi * 0.25;
    const yBase = horizon - i * H * 0.045 * (0.6 + b);
    const width = 1.5 + 3 * b + 3 * (i === 0 ? energy : 0);
    // warm the palette slightly on exhale, cool + pale on inhale
    const col = mixHex(ART.indigo, s.inhaling ? ART.pale : ART.aqua, clamp01(0.2 + 0.7 * b));
    g.strokeStyle = hexA(col, 0.12 + 0.28 * b + (i === 0 ? 0.12 * energy : 0));
    g.lineWidth = width;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const nx = x / W;
      const y =
        yBase +
        Math.sin(nx * Math.PI * (2 + i) + t * speed + fi * 3) * amp * (0.5 + 0.5 * Math.sin(nx * Math.PI)) +
        Math.sin(nx * Math.PI * 5 + t * (0.4 + fi)) * amp * 0.18 * energy;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // rising motes on inhale
  const motes = 46;
  for (let i = 0; i < motes; i++) {
    const seed = i * 12.9898;
    const px = (Math.sin(seed) * 0.5 + 0.5) * W;
    const drift = ((t * (8 + (i % 5) * 5) * (0.4 + b)) % (H + 60)) - 30;
    const py = H - drift - (Math.cos(seed) * 0.5 + 0.5) * 40;
    const r = (0.6 + 1.8 * b) * (0.5 + 0.5 * Math.sin(seed * 3));
    g.fillStyle = hexA(ART.pale, 0.05 + 0.22 * b);
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
  }

  g.globalCompositeOperation = "source-over";

  // optional chest-ROI overlay so the person sees what's being watched
  if (s.roiBox) {
    const [nx, ny, nw, nh] = s.roiBox;
    // ROI was sampled in a mirrored 96x72 space; show it small, top-right.
    const boxW = W * 0.16;
    const boxH = boxW * (OFF_H / OFF_W);
    const ox = W - boxW - 18;
    const oy = 54;
    g.strokeStyle = hexA(ART.cyan, 0.45);
    g.lineWidth = 1;
    g.strokeRect(ox, oy, boxW, boxH);
    g.strokeStyle = hexA(s.tracking === "live" ? ART.aqua : ART.indigo, 0.85);
    g.lineWidth = 2;
    g.strokeRect(ox + nx * boxW, oy + ny * boxH, nw * boxW, nh * boxH);
  }
}

// ── small color helpers (canvas strings) ──────────────────────────────────────
function hexA(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}
function mixHex(h1: string, h2: string, m: number): string {
  const a = parseHex(h1);
  const b = parseHex(h2);
  const mm = clamp01(m);
  const r = Math.round(a.r + (b.r - a.r) * mm);
  const g = Math.round(a.g + (b.g - a.g) * mm);
  const bb = Math.round(a.b + (b.b - a.b) * mm);
  return `rgb(${r},${g},${bb})`;
}
function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
