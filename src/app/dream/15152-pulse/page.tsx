"use client";

/*
 * 15152-pulse — "Pulse"
 *
 * The lab's first interoceptive / biosignal piece. A visitor rests a fingertip
 * over the camera lens (torch on where the device allows). The camera sees the
 * light modulated by capillary blood flow — a photoplethysmography (PPG) signal
 * riding in the average RED-channel brightness of the frame, oscillating at the
 * heart rate. We read that, detect each beat, and use it to ENTRAIN one of
 * Karel's real sustained piano takes to the visitor's own heart: on every beat
 * we swell his recording and briefly carve a "felt heartbeat" throb out of HIS
 * own low end (a low-shelf boost, NOT a synth tone).
 *
 * ZERO synthesis: 100% of audible sound is Karel's catalog. The PPG signal and
 * the resting-clock fallback are CONTROL signals only, never audio sources.
 *
 * The offscreen canvas here is used ONLY to sample camera pixels (getImageData)
 * for the PPG mean-red computation. The visible ART surface is inline SVG — a
 * scrolling cardiac trace, a big BPM readout, and a soft beat bloom.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REAL_TRACKS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── tuning constants ─────────────────────────────────────────────────────────
const SAMPLE_W = 48; // offscreen sampling canvas — tiny, cheap
const SAMPLE_H = 36;
const BUFFER_SECONDS = 10; // rolling PPG history
const DETREND_WINDOW = 0.9; // moving-average window (s) for detrending
const MIN_IBI = 0.33; // refractory: 0.33 s ⇒ ≤ ~182 BPM
const MAX_IBI = 1.45; // ⇒ ≥ ~41 BPM
const REST_BPM = 62; // resting fallback clock
const REST_PERIOD = 60 / REST_BPM; // seconds per beat
const TRACE_POINTS = 220; // SVG trace resolution
const STABILITY_GRACE = 6; // s of camera before we give up on a live pulse
const STABILITY_HOLD = 4; // s a stable pulse survives a quality dip

// A synthetic PPG waveform shape (systolic upstroke + dicrotic notch), used to
// draw the trace when there is no camera signal. This is drawn, never heard.
function computePpgShape(phase: number): number {
  const p = phase - Math.floor(phase);
  const systolic = Math.exp(-Math.pow((p - 0.16) / 0.09, 2));
  const dicrotic = 0.42 * Math.exp(-Math.pow((p - 0.46) / 0.12, 2));
  return (systolic + dicrotic) * 1.6 - 0.7;
}

function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Phase = "idle" | "loading" | "live" | "error";
type BeatSource = "camera" | "resting";

interface Sample {
  t: number;
  raw: number;
}

export default function PulsePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tracePathRef = useRef<SVGPolylineElement | null>(null);
  const bloomRef = useRef<SVGCircleElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const swellRef = useRef<GainNode | null>(null);
  const shelfRef = useRef<BiquadFilterNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // PPG detection state (all in refs — the loop must not re-render React)
  const samplesRef = useRef<Sample[]>([]);
  const peakEnvRef = useRef<number>(0); // decaying |detrended| envelope
  const prevDetrendRef = useRef<number>(0);
  const lastBeatRef = useRef<number>(0);
  const beatTimesRef = useRef<number[]>([]);
  const bpmRef = useRef<number>(REST_BPM);
  const traceBufRef = useRef<Float32Array>(new Float32Array(TRACE_POINTS));
  const bloomLevelRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // driver arbitration
  const hasCameraRef = useRef<boolean>(false);
  const beatSourceRef = useRef<BeatSource>("resting");
  const restNextBeatRef = useRef<number>(0);
  const lastStableRef = useRef<number>(-999);
  const camStartRef = useRef<number>(0);

  // throttled UI mirror
  const uiTickRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [bpm, setBpm] = useState<number>(REST_BPM);
  const [quality, setQuality] = useState<number>(0);
  const [beatSource, setBeatSource] = useState<BeatSource>("resting");
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  // ── full teardown ──────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const s = srcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* */
      }
      srcRef.current = null;
    }
    try {
      swellRef.current?.disconnect();
    } catch {
      /* */
    }
    try {
      shelfRef.current?.disconnect();
    } catch {
      /* */
    }
    masterRef.current?.disconnect();
    masterRef.current = null;
    // stop camera + turn torch off
    const stream = streamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        try {
          // best-effort torch-off before stopping
          (
            track as MediaStreamTrack & {
              applyConstraints: (c: unknown) => Promise<void>;
            }
          )
            .applyConstraints({ advanced: [{ torch: false }] })
            .catch(() => {});
        } catch {
          /* torch unsupported */
        }
      });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") {
      setTimeout(() => c.close().catch(() => {}), 400);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── the "felt heartbeat": swell his take + carve a low throb from HIS bass ───
  const applyBeat = useCallback((atTime: number, strength: number) => {
    const ctx = ctxRef.current;
    const swell = swellRef.current;
    const shelf = shelfRef.current;
    if (!ctx || !swell || !shelf) return;
    const t = Math.max(atTime, ctx.currentTime);
    const s = Math.min(1, Math.max(0.35, strength));

    // amplitude swell — a gentle breath on his recording, not a click
    const base = 0.82;
    const peak = base + 0.16 * s;
    swell.gain.cancelScheduledValues(t);
    swell.gain.setValueAtTime(swell.gain.value, t);
    swell.gain.linearRampToValueAtTime(peak, t + 0.09);
    swell.gain.setTargetAtTime(base, t + 0.11, 0.22);

    // low-shelf throb — briefly boost his own low end so a cardiac pulse is
    // FELT rising out of the music. No tone is added; only his bass is lifted.
    const boost = 7 * s;
    shelf.gain.cancelScheduledValues(t);
    shelf.gain.setValueAtTime(shelf.gain.value, t);
    shelf.gain.linearRampToValueAtTime(boost, t + 0.06);
    shelf.gain.setTargetAtTime(0, t + 0.08, 0.18);

    // visual bloom
    bloomLevelRef.current = 1;
  }, []);

  // ── the single animation/detection loop ──────────────────────────────────────
  const frame = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. sample the camera's mean red channel (if live)
    let haveSample = false;
    if (hasCameraRef.current) {
      const video = videoRef.current;
      const off = offscreenRef.current;
      if (video && off && video.readyState >= 2) {
        const octx = off.getContext("2d", { willReadFrequently: true });
        if (octx) {
          octx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
          const data = octx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
          let redSum = 0;
          for (let i = 0; i < data.length; i += 4) redSum += data[i];
          const meanRed = redSum / (data.length / 4) / 255; // 0..1
          samplesRef.current.push({ t: now, raw: meanRed });
          haveSample = true;
        }
      }
    }

    // trim history
    const buf = samplesRef.current;
    const cutoff = now - BUFFER_SECONDS;
    while (buf.length && buf[0].t < cutoff) buf.shift();

    // 2. detrend + peak-detect on the newest sample
    let displayVal = 0;
    let cameraStableNow = false;
    if (haveSample && buf.length > 8) {
      const last = buf[buf.length - 1];
      // moving average over DETREND_WINDOW
      let sum = 0;
      let n = 0;
      const wStart = now - DETREND_WINDOW;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t < wStart) break;
        sum += buf[i].raw;
        n++;
      }
      const avg = n ? sum / n : last.raw;
      const detrended = last.raw - avg;

      // decaying amplitude envelope of the oscillation
      const absd = Math.abs(detrended);
      peakEnvRef.current = Math.max(absd, peakEnvRef.current * 0.985);
      const env = peakEnvRef.current;
      displayVal = env > 1e-5 ? Math.max(-1, Math.min(1, detrended / env)) : 0;

      // upward threshold crossing = a beat (with refractory + noise floor)
      const thr = 0.42 * env;
      const noiseFloor = 0.0025; // mean-red units; below this = no finger
      if (
        env > noiseFloor &&
        prevDetrendRef.current < thr &&
        detrended >= thr &&
        now - lastBeatRef.current > MIN_IBI
      ) {
        const ibi = now - lastBeatRef.current;
        lastBeatRef.current = now;
        if (ibi >= MIN_IBI && ibi <= MAX_IBI) {
          const bt = beatTimesRef.current;
          bt.push(now);
          while (bt.length > 8) bt.shift();
        }
        // if the camera is the active beat source, THIS is the down-beat
        if (beatSourceRef.current === "camera") applyBeat(now, 0.9);
      }
      prevDetrendRef.current = detrended;

      // regularity → BPM + stability
      const bt = beatTimesRef.current;
      if (bt.length >= 4) {
        const ibis: number[] = [];
        for (let i = 1; i < bt.length; i++) ibis.push(bt[i] - bt[i - 1]);
        const med = computeMedian(ibis);
        const mean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
        const varc =
          ibis.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ibis.length;
        const cov = mean > 0 ? Math.sqrt(varc) / mean : 1;
        const inRange = med >= MIN_IBI && med <= MAX_IBI;
        const ampOk = env > 0.004;
        if (inRange) {
          const measured = 60 / med;
          bpmRef.current = bpmRef.current * 0.85 + measured * 0.15;
          const reg = Math.max(0, 1 - cov / 0.3);
          const amp = Math.min(1, (env - noiseFloor) / 0.02);
          setQualityThrottled(Math.max(0, Math.min(1, reg * 0.6 + amp * 0.4)));
          cameraStableNow = inRange && ampOk && cov < 0.3;
        }
      } else if (buf.length > 40) {
        // finger present but no rhythm yet → low quality
        setQualityThrottled(Math.min(0.35, (peakEnvRef.current / 0.02) * 0.35));
      }
    }

    // 3. arbitrate beat source (camera vs resting clock) with hysteresis
    if (cameraStableNow) lastStableRef.current = now;
    const stableRecently = now - lastStableRef.current < STABILITY_HOLD;
    let source: BeatSource = "resting";
    if (hasCameraRef.current && stableRecently) source = "camera";
    if (source !== beatSourceRef.current) {
      beatSourceRef.current = source;
      if (source === "resting") restNextBeatRef.current = now + 0.15;
      setBeatSourceThrottled(source);
    }

    // camera note: attempted but never locked
    if (
      hasCameraRef.current &&
      source === "resting" &&
      now - camStartRef.current > STABILITY_GRACE &&
      lastStableRef.current < 0
    ) {
      setCameraNoteOnce(
        "no pulse detected — rest a fingertip fully over the lens, or enjoy the resting ~62 bpm",
      );
    }

    // 4. resting clock drives beats + BPM when it's the active source
    if (source === "resting") {
      bpmRef.current = bpmRef.current * 0.9 + REST_BPM * 0.1;
      if (restNextBeatRef.current === 0) restNextBeatRef.current = now + 0.15;
      while (now >= restNextBeatRef.current) {
        applyBeat(restNextBeatRef.current, 0.75);
        restNextBeatRef.current += REST_PERIOD;
      }
    }

    // 5. the trace value: live signal if we have a finger, else synthetic PPG
    let traceVal: number;
    if (haveSample && peakEnvRef.current > 0.003) {
      traceVal = displayVal;
    } else {
      // synthetic waveform from the resting clock phase
      const phase =
        1 - (restNextBeatRef.current - now) / REST_PERIOD;
      traceVal = computePpgShape(phase);
    }
    const tbuf = traceBufRef.current;
    tbuf.copyWithin(0, 1);
    tbuf[tbuf.length - 1] = traceVal;

    // 6. paint the SVG trace (direct DOM, no React re-render)
    const poly = tracePathRef.current;
    if (poly) {
      let pts = "";
      for (let i = 0; i < tbuf.length; i++) {
        const x = (i / (tbuf.length - 1)) * 600;
        const y = 100 - tbuf[i] * 66;
        pts += `${x.toFixed(1)},${y.toFixed(1)} `;
      }
      poly.setAttribute("points", pts);
    }

    // 7. bloom decay
    const bloom = bloomRef.current;
    if (bloom) {
      const lvl = bloomLevelRef.current;
      const swing = reducedRef.current ? 0.35 : 1;
      const r = 30 + lvl * 46 * swing;
      const op = 0.08 + lvl * 0.45 * swing;
      bloom.setAttribute("r", r.toFixed(1));
      bloom.setAttribute("opacity", op.toFixed(3));
      bloomLevelRef.current = lvl * (reducedRef.current ? 0.9 : 0.93);
    }

    // 8. throttled UI mirror (~5 Hz)
    if (now - uiTickRef.current > 0.2) {
      uiTickRef.current = now;
      setBpm(Math.round(bpmRef.current));
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [applyBeat]);

  // small throttled setters to avoid churn (defined as refs-of-time inside frame)
  const qTickRef = useRef(0);
  const setQualityThrottled = (q: number) => {
    const now = ctxRef.current?.currentTime ?? 0;
    if (now - qTickRef.current > 0.25) {
      qTickRef.current = now;
      setQuality(q);
    }
  };
  const setBeatSourceThrottled = (s: BeatSource) => setBeatSource(s);
  const noteSetRef = useRef(false);
  const setCameraNoteOnce = (msg: string) => {
    if (!noteSetRef.current) {
      noteSetRef.current = true;
      setCameraNote(msg);
    }
  };

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "loading" || phase === "live") return;
    setPhase("loading");
    setCameraNote(null);
    setAudioNote(null);
    noteSetRef.current = false;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // 1. AudioContext (inside the user gesture)
    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      await ctx.resume().catch(() => {});
    } catch {
      setPhase("error");
      setAudioNote("Audio could not start in this browser.");
      return;
    }
    ctxRef.current = ctx;
    const master = createSafeMaster(ctx, { gain: 0.9 });
    masterRef.current = master;

    // 2. load one of Karel's real sustained takes (warm/low: "Bath")
    const preferred = WELCOME_HOME_TRACKS[1]?.id ?? WELCOME_HOME_TRACKS[0].id;
    const trackId = REAL_TRACKS.find((t) => t.id === preferred)?.id ?? preferred;
    let buffer: AudioBuffer;
    let title: string;
    try {
      const loaded = await loadRealTrackBuffer(ctx, trackId);
      buffer = loaded.buffer;
      title = loaded.title;
    } catch {
      teardown();
      setPhase("error");
      setAudioNote(
        "Karel's recording could not be loaded — check the connection and try again.",
      );
      return;
    }
    setTrackTitle(title);

    // 3. audio graph: source → low-shelf (throb) → swell gain → safe master
    const shelf = ctx.createBiquadFilter();
    shelf.type = "lowshelf";
    shelf.frequency.value = 150;
    shelf.gain.value = 0;
    shelfRef.current = shelf;

    const swell = ctx.createGain();
    swell.gain.value = 0.82;
    swellRef.current = swell;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(shelf);
    shelf.connect(swell);
    swell.connect(master.input); // ear-safety bus, never ctx.destination
    srcRef.current = src;
    src.start(ctx.currentTime + 0.05);

    // 4. seed the resting clock so the piece is alive immediately
    restNextBeatRef.current = ctx.currentTime + 0.3;

    // 5. try the camera (optional — the piece is complete without it)
    offscreenRef.current = document.createElement("canvas");
    offscreenRef.current.width = SAMPLE_W;
    offscreenRef.current.height = SAMPLE_H;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      // torch on where supported (never let it throw)
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await (
            track as MediaStreamTrack & {
              applyConstraints: (c: unknown) => Promise<void>;
            }
          ).applyConstraints({ advanced: [{ torch: true }] });
        } catch {
          /* torch unsupported on this device */
        }
      }
      hasCameraRef.current = true;
      camStartRef.current = ctx.currentTime;
    } catch {
      hasCameraRef.current = false;
      setCameraNote(
        "no camera available — showing a resting ~62 bpm from an internal clock",
      );
    }

    setPhase("live");
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, frame, teardown]);

  const liveCam = beatSource === "camera";
  const qualityPct = Math.round(quality * 100);

  return (
    <main className="min-h-screen w-full bg-background px-5 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Pulse
          </h1>
          <p className="text-base text-muted-foreground">
            Rest a fingertip over your camera lens and Karel&apos;s recording
            breathes in your body&apos;s time — the music entrained to your own
            heartbeat, read optically from the blush of blood under your skin.
          </p>
        </header>

        {/* the cardiac readout — inline SVG art surface */}
        <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[#04070b]">
          <svg
            viewBox="0 0 600 200"
            preserveAspectRatio="none"
            className="block h-56 w-full"
            role="img"
            aria-label="Live heartbeat trace"
          >
            <defs>
              <linearGradient id="pulse-fade" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#0891b2" stopOpacity="0" />
                <stop offset="0.15" stopColor="#22d3ee" stopOpacity="0.9" />
                <stop offset="1" stopColor="#818cf8" stopOpacity="1" />
              </linearGradient>
              <radialGradient id="pulse-bloom" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#22d3ee" stopOpacity="0.9" />
                <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* baseline */}
            <line
              x1="0"
              y1="100"
              x2="600"
              y2="100"
              stroke="#123244"
              strokeWidth="1"
            />
            {/* soft beat bloom, anchored at the leading edge of the trace */}
            <circle
              ref={bloomRef}
              cx="560"
              cy="100"
              r="30"
              fill="url(#pulse-bloom)"
              opacity="0.1"
            />
            {/* the scrolling PPG waveform */}
            <polyline
              ref={tracePathRef}
              fill="none"
              stroke="url(#pulse-fade)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points=""
            />
          </svg>

          {/* big BPM readout */}
          <div className="pointer-events-none absolute left-4 top-3 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-[#67e8f9]">
              {phase === "live" ? bpm : "––"}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              bpm
            </span>
          </div>

          {/* live vs resting badge + signal quality */}
          {phase === "live" && (
            <div className="pointer-events-none absolute right-4 top-3 flex flex-col items-end gap-1.5">
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                  liveCam ? "text-[#67e8f9]" : "text-destructive"
                }`}
              >
                {liveCam ? "live · fingertip pulse" : "resting ~62 bpm"}
              </span>
              <span
                className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/15"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${liveCam ? qualityPct : 0}%`,
                    backgroundColor: "#22d3ee",
                  }}
                />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                signal {liveCam ? `${qualityPct}%` : "—"}
              </span>
            </div>
          )}

          {phase !== "live" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
              <button
                type="button"
                onClick={start}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {phase === "loading" ? "Listening for your pulse…" : "Feel my pulse"}
              </button>
            </div>
          )}
        </div>

        {phase === "live" && (
          <p className="text-base text-muted-foreground">
            Cover the lens fully with the pad of a finger — hold still and warm.
            Within a few seconds the trace should find your pulse, and each beat
            swells Karel&apos;s take and lifts a felt throb out of its own low
            end. No finger? The piece keeps breathing at a resting ~62 bpm.
          </p>
        )}

        {trackTitle && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            entraining: Karel — {trackTitle}
          </p>
        )}
        {cameraNote && <p className="text-sm text-destructive">{cameraNote}</p>}
        {audioNote && <p className="text-sm text-destructive">{audioNote}</p>}

        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="self-start font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* hidden capture video — pixels only, never displayed */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The lab&apos;s first interoceptive piece: instead of you
                listening to the music, the music listens to your body. A
                fingertip on the camera makes the lens see light modulated by
                the blood pulsing through your capillaries —
                photoplethysmography (PPG). We read the average red-channel
                brightness of each frame, keep a ~10-second rolling buffer,
                detrend it against a moving average, and detect each beat as an
                upward threshold crossing with a refractory gap (≥ 0.33 s ⇒ ≤
                ~182 bpm). The median inter-beat interval gives the bpm; its
                regularity plus the oscillation amplitude give a signal-quality
                score.
              </p>
              <p>
                Every beat entrains Karel&apos;s real sustained take to your
                heart: a gentle amplitude swell on his recording, and a brief
                low-shelf boost that carves a <em>felt</em> cardiac throb out of
                his own low end — never a synthesized tone. All audible sound is
                100% his catalog; the PPG signal (and the fallback clock) are
                control signals only.
              </p>
              <p>
                Honest limits: real PPG needs a real finger and a real camera —
                ideally with the torch on, which many phones expose but most
                laptops do not. When no camera is granted, or no stable pulse
                locks within a few seconds, everything falls back to a clean
                internal ~62 bpm resting clock (a control signal, not audio) and
                the trace draws a synthetic PPG waveform — the path validated in
                the browser without a sensor. The beat bloom is a soft swell,
                capped and further gentled under{" "}
                <span className="font-mono">prefers-reduced-motion</span>.
              </p>
              <p className="text-xs">
                References: <em>Heartbeat Resonance</em> (ACM CHI 2025) — a felt
                heartbeat conjured from ~78 Hz low-frequency sound; and{" "}
                <em>
                  Sensory processing reallocation from auditory to cardiac
                  signals in REM sleep
                </em>{" "}
                (Current Biology, 2026).
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

      <PrototypeNav slugs={["15152-pulse"]} />
    </main>
  );
}
