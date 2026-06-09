"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Piano Phrase Painter (448)
//
// THE ONE QUESTION: What if Karel's ACTUAL recorded piano could paint itself —
// but the painting is driven by MUSICAL STRUCTURE, not raw spectrum?
//
// A closed audio→image→audio loop that is MUSICALLY AWARE:
//   Onset / phrase detection + harmonic (chroma/key) color + dynamics envelope
//   drive when a new image is dreamed and what it depicts; the returning image's
//   color then bends the real piano playback back.
//
// Three audio paths (in priority order):
//   1. Karel's real recording via /api/audio/…
//   2. User's own audio file drop
//   3. Warm synthesized piano stand-in (resolves on purpose)
//
// References: Refik Anadol *Unsupervised*; Memo Akten *Learning to See*;
//   spectral-flux onset detection (Bello et al. 2005).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAnalyser, buildMusicalPrompt, PC_NAMES_C, type MusicalFrame } from "./analysis";
import { initField, type FieldRenderer } from "./field";
import { buildSynthEngine, type SynthEngine } from "./synth";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = "idle" | "loading" | "running" | "error";
type AudioMode = "real" | "synth";
type ImageStatus = "none" | "live" | "fallback";

interface XfadeState {
  imgA: HTMLImageElement | null;
  imgB: HTMLImageElement | null;
  alpha: number;
  transitioning: boolean;
  panX: number;
  panY: number;
  scale: number;
  targetPanX: number;
  targetPanY: number;
  targetScale: number;
  kbTimer: number;
}

// ── Sample image color for audio feedback ─────────────────────────────────────
function sampleImageColor(
  img: HTMLImageElement
): { brightness: number; hue: number; warmth: number } | null {
  try {
    const tiny = document.createElement("canvas");
    tiny.width = 8;
    tiny.height = 6;
    const g = tiny.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 8, 6);
    const data = g.getImageData(0, 0, 8, 6).data;
    let sumR = 0, sumG = 0, sumB = 0;
    const px = 8 * 6;
    for (let i = 0; i < px; i++) {
      sumR += data[i * 4];
      sumG += data[i * 4 + 1];
      sumB += data[i * 4 + 2];
    }
    const r = sumR / px / 255;
    const g2 = sumG / px / 255;
    const b = sumB / px / 255;
    const brightness = 0.299 * r + 0.587 * g2 + 0.114 * b;
    let hue = 0;
    const mn = Math.min(r, g2, b);
    if (r >= g2 && r >= b) {
      hue = (60 * ((g2 - b) / Math.max(r - mn, 0.001)) + 360) % 360;
    } else if (g2 >= r && g2 >= b) {
      hue = 60 * ((b - r) / Math.max(g2 - mn, 0.001)) + 120;
    } else {
      hue = 60 * ((r - g2) / Math.max(b - mn, 0.001)) + 240;
    }
    if (hue < 0) hue += 360;
    const warmth = r > b ? r - b : 0;
    return { brightness, hue, warmth };
  } catch {
    return null;
  }
}

// ── Audio feedback — adjusts real audio or synth ──────────────────────────────
interface FeedbackTarget {
  lowpass: BiquadFilterNode;
  reverbGain: GainNode;
  masterGain: GainNode;
}

function applyAudioFeedback(
  targets: FeedbackTarget | null,
  brightness: number,
  hue: number,
  warmth: number,
  ctx: AudioContext
): void {
  if (!targets) return;
  const t = ctx.currentTime;
  const cutoff = 800 + brightness * 6000;
  targets.lowpass.frequency.setTargetAtTime(cutoff, t, 1.2);
  const revWet = 0.28 + warmth * 0.45;
  targets.reverbGain.gain.setTargetAtTime(revWet, t, 1.5);
  // Cool hue (blues) → shimmer boost
  const hN = hue / 360;
  const shimmerBoost = hN > 0.55 && hN < 0.85 ? 0.06 : 0;
  targets.masterGain.gain.setTargetAtTime(0.72 + shimmerBoost, t, 2.0);
}

// ── Reverb impulse ────────────────────────────────────────────────────────────
function buildReverbBuffer(ctx: AudioContext, decaySec: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * decaySec);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  return buf;
}

// ── Build real-audio processing chain ─────────────────────────────────────────
function buildRealAudioChain(
  ctx: AudioContext,
  audioEl: HTMLAudioElement
): { source: MediaElementAudioSourceNode; analyser: AnalyserNode; targets: FeedbackTarget; stop: () => void } {
  const source = ctx.createMediaElementSource(audioEl);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(4200, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.7, ctx.currentTime);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.72, ctx.currentTime);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, ctx.currentTime);
  compressor.knee.setValueAtTime(6, ctx.currentTime);
  compressor.ratio.setValueAtTime(4, ctx.currentTime);
  compressor.attack.setValueAtTime(0.005, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverbBuffer(ctx, 3.5);

  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.30, ctx.currentTime);

  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(0.72, ctx.currentTime);

  source.connect(analyser);
  analyser.connect(dryGain);
  analyser.connect(convolver);
  convolver.connect(reverbGain);
  dryGain.connect(lowpass);
  reverbGain.connect(lowpass);
  lowpass.connect(masterGain);
  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  function stop(): void {
    try {
      source.disconnect();
      analyser.disconnect();
      dryGain.disconnect();
      convolver.disconnect();
      reverbGain.disconnect();
      lowpass.disconnect();
      masterGain.disconnect();
      compressor.disconnect();
    } catch { /* ok */ }
  }

  return { source, analyser, targets: { lowpass, reverbGain, masterGain }, stop };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function PianoPhraseParinter() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [audioMode, setAudioMode] = useState<AudioMode>("real");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("none");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showHud, setShowHud] = useState(true);

  // HUD state (updated 8×/s)
  const [hudPhrase, setHudPhrase] = useState("—");
  const [hudOpm, setHudOpm] = useState(0);
  const [hudFlux, setHudFlux] = useState(0);
  const [hudDyn, setHudDyn] = useState("—");
  const [hudKey, setHudKey] = useState("—");
  const [currentPrompt, setCurrentPrompt] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const fileUrlRef = useRef<string | null>(null);

  // Audio context + nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const feedbackTargetsRef = useRef<FeedbackTarget | null>(null);
  const realChainStopRef = useRef<(() => void) | null>(null);
  const synthEngineRef = useRef<SynthEngine | null>(null);

  // Analysis
  const analyserRef = useRef<ReturnType<typeof buildAnalyser> | null>(null);
  const frameRef = useRef<MusicalFrame | null>(null);

  // Visuals
  const fieldRef = useRef<FieldRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef(0);

  // Image pipeline
  const xfadeRef = useRef<XfadeState>({
    imgA: null, imgB: null, alpha: 0, transitioning: false,
    panX: 0, panY: 0, scale: 1,
    targetPanX: 0, targetPanY: 0, targetScale: 1.04, kbTimer: 0,
  });
  const inFlightRef = useRef(false);
  const lastRequestRef = useRef(0);
  const MIN_REQUEST_INTERVAL_MS = 7000;

  // Onset-driven request logic
  const onsetCountRef = useRef(0);
  const lastOnsetTriggerRef = useRef(0);

  // Abort controller for in-flight image fetch
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch AI image ───────────────────────────────────────────────────────
  const fetchImage = useCallback(async (prompt: string) => {
    if (inFlightRef.current) return;
    const now = performance.now();
    if (now - lastRequestRef.current < MIN_REQUEST_INTERVAL_MS) return;

    inFlightRef.current = true;
    lastRequestRef.current = now;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/dream/448-piano-phrase-painter/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        setImageStatus("fallback");
        return;
      }

      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) {
        setImageStatus("fallback");
        return;
      }

      // Preload image (crossOrigin before src — required for CORS + canvas sampling)
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = json.url as string;
      });

      // Install as next frame in crossfade
      const xf = xfadeRef.current;
      xf.imgB = img;
      xf.alpha = 0;
      xf.transitioning = true;

      // Sample image color for audio loop-back
      const color = sampleImageColor(img);
      if (color && audioCtxRef.current && feedbackTargetsRef.current) {
        applyAudioFeedback(
          feedbackTargetsRef.current,
          color.brightness,
          color.hue,
          color.warmth,
          audioCtxRef.current
        );
      } else if (color && audioCtxRef.current && synthEngineRef.current) {
        synthEngineRef.current.applyImageFeedback(
          color.brightness,
          color.hue,
          color.warmth
        );
      }

      // Add bloom at a random position (triggered by image arrival)
      if (fieldRef.current && canvasRef.current) {
        const W = canvasRef.current.width;
        const H = canvasRef.current.height;
        const bx = W * (0.2 + Math.random() * 0.6);
        const by = H * (0.2 + Math.random() * 0.6);
        const fr = frameRef.current;
        const hue = fr ? (fr.dominantPc * 30 + 120) % 360 : 220;
        fieldRef.current.addOnsetPulse(bx, by, hue);
      }

      setImageStatus("live");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setImageStatus("fallback");
      }
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
    }
  }, []);

  // ── Draw AI image layer ──────────────────────────────────────────────────
  const drawAiLayer = useCallback((
    canvas: HTMLCanvasElement,
    dt: number,
    frame: MusicalFrame | null
  ) => {
    const ctx2dOrNull = canvas.getContext("2d");
    if (!ctx2dOrNull) return;
    const ctx2d: CanvasRenderingContext2D = ctx2dOrNull;
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;
    const xf = xfadeRef.current;

    // Ken-Burns drift
    xf.kbTimer -= dt;
    if (xf.kbTimer <= 0) {
      xf.targetPanX = (Math.random() - 0.5) * W * 0.06;
      xf.targetPanY = (Math.random() - 0.5) * H * 0.06;
      xf.targetScale = 1.03 + Math.random() * 0.05;
      xf.kbTimer = 10 + Math.random() * 8;
    }
    xf.panX += (xf.targetPanX - xf.panX) * dt * 0.12;
    xf.panY += (xf.targetPanY - xf.panY) * dt * 0.12;
    xf.scale += (xf.targetScale - xf.scale) * dt * 0.1;

    // Crossfade progress (~2.5s)
    if (xf.transitioning) {
      xf.alpha = Math.min(1, xf.alpha + dt * 0.4);
      if (xf.alpha >= 1) {
        xf.imgA = xf.imgB;
        xf.imgB = null;
        xf.alpha = 1;
        xf.transitioning = false;
      }
    }

    ctx2d.fillStyle = "#050510";
    ctx2d.fillRect(0, 0, W, H);

    function drawImg(img: HTMLImageElement, alpha: number): void {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const aspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = W / H;
      let dw: number, dh: number;
      if (aspect > canvasAspect) {
        dh = H * xf.scale;
        dw = dh * aspect;
      } else {
        dw = W * xf.scale;
        dh = dw / aspect;
      }
      const dx = (W - dw) / 2 + xf.panX;
      const dy = (H - dh) / 2 + xf.panY;
      ctx2d.save();
      ctx2d.globalAlpha = alpha;
      ctx2d.drawImage(img, dx, dy, dw, dh);
      ctx2d.restore();
    }

    if (xf.imgA) drawImg(xf.imgA, xf.transitioning ? 1 - xf.alpha * 0.55 : 1);
    if (xf.imgB && xf.transitioning) drawImg(xf.imgB, xf.alpha);

    // Vignette
    const vg = ctx2d.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx2d.fillStyle = vg;
    ctx2d.fillRect(0, 0, W, H);

    // Draw onset bloom overlays on top of image
    if (fieldRef.current && frame) {
      fieldRef.current.drawOnsetLayer(frame, performance.now(), dt);
    }
  }, []);

  // ── Main rAF loop ─────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTRef.current) / 1000) || 0.016;
    lastTRef.current = now;

    const canvas = canvasRef.current;
    const analyserNode = analyserNodeRef.current;
    const musAnalyser = analyserRef.current;
    const ctx = audioCtxRef.current;

    if (canvas && analyserNode && musAnalyser && ctx) {
      // Resize canvas
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = Math.max(1, W);
        canvas.height = Math.max(1, H);
      }

      const frame = musAnalyser.tick(ctx.currentTime);
      frameRef.current = frame;

      // ── Onset-driven image trigger ────────────────────────────────────
      if (frame.onsetNow || frame.phraseBoundaryNow) {
        onsetCountRef.current++;
        const sinceLastTrigger = now - lastOnsetTriggerRef.current;
        // Trigger on phrase boundary OR every ~8 onsets if > 7s since last
        const shouldTrigger =
          (frame.phraseBoundaryNow && sinceLastTrigger > MIN_REQUEST_INTERVAL_MS) ||
          (onsetCountRef.current >= 8 && sinceLastTrigger > MIN_REQUEST_INTERVAL_MS);

        if (shouldTrigger && !inFlightRef.current) {
          onsetCountRef.current = 0;
          lastOnsetTriggerRef.current = now;
          const prompt = buildMusicalPrompt(frame);
          setCurrentPrompt(prompt);
          void fetchImage(prompt);
        }

        // Bloom at onset position (center ± some offset)
        if (frame.onsetNow && fieldRef.current) {
          const cW = canvas.width;
          const cH = canvas.height;
          const bx = cW * (0.3 + Math.random() * 0.4);
          const by = cH * (0.25 + Math.random() * 0.5);
          const hue = (frame.dominantPc * 30 + 120) % 360;
          fieldRef.current.addOnsetPulse(bx, by, hue);
        }
      }

      // ── Render ────────────────────────────────────────────────────────
      const hasAiImage = xfadeRef.current.imgA !== null || xfadeRef.current.imgB !== null;
      if (hasAiImage) {
        drawAiLayer(canvas, dt, frame);
      } else if (fieldRef.current) {
        fieldRef.current.drawField(frame, now, dt);
      }

      // ── HUD throttled to ~8Hz ──────────────────────────────────────────
      if ((now | 0) % 125 < 18) {
        setHudPhrase(frame.phraseLabel);
        setHudOpm(Math.round(frame.onsetsPerMin));
        setHudFlux(Math.round(frame.flux * 1000));
        setHudDyn(frame.dynamicsLabel);
        setHudKey(`${PC_NAMES_C[frame.dominantPc]}${frame.modality === "major" ? "" : frame.modality === "minor" ? "m" : "chr"}`);
      }
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [drawAiLayer, fetchImage]);

  // ── Start rAF loop when running ──────────────────────────────────────────
  useEffect(() => {
    if (appStatus !== "running") return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [appStatus, runLoop]);

  // ── Teardown ──────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (realChainStopRef.current) {
      realChainStopRef.current();
      realChainStopRef.current = null;
    }
    if (synthEngineRef.current) {
      synthEngineRef.current.stop();
      synthEngineRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
      audioElRef.current = null;
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (fieldRef.current) {
      fieldRef.current.destroy();
      fieldRef.current = null;
    }
    analyserRef.current = null;
    analyserNodeRef.current = null;
    feedbackTargetsRef.current = null;
    frameRef.current = null;
    inFlightRef.current = false;
    onsetCountRef.current = 0;
    lastOnsetTriggerRef.current = 0;
    xfadeRef.current = {
      imgA: null, imgB: null, alpha: 0, transitioning: false,
      panX: 0, panY: 0, scale: 1,
      targetPanX: 0, targetPanY: 0, targetScale: 1.04, kbTimer: 0,
    };
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Activate real audio from element ─────────────────────────────────────
  const activateRealAudio = useCallback(async (
    ctx: AudioContext,
    audioEl: HTMLAudioElement
  ): Promise<{ analyser: AnalyserNode; targets: FeedbackTarget }> => {
    await ctx.resume();
    const chain = buildRealAudioChain(ctx, audioEl);
    realChainStopRef.current = chain.stop;
    feedbackTargetsRef.current = chain.targets;
    return { analyser: chain.analyser, targets: chain.targets };
  }, []);

  // ── Fall back to synth ────────────────────────────────────────────────────
  const activateSynth = useCallback((ctx: AudioContext): AnalyserNode => {
    const eng = buildSynthEngine(ctx);
    synthEngineRef.current = eng;
    // Build FeedbackTarget proxy for synth
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4000, ctx.currentTime);
    const rv = ctx.createGain();
    rv.gain.setValueAtTime(0.3, ctx.currentTime);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.72, ctx.currentTime);
    feedbackTargetsRef.current = { lowpass: lp, reverbGain: rv, masterGain: mg };
    return eng.analyser;
  }, []);

  // ── Begin (tap gesture — creates/resumes AudioContext) ────────────────────
  const handleBegin = useCallback(async () => {
    if (appStatus === "loading" || appStatus === "running") return;
    setAppStatus("loading");
    setErrorMsg(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;

      // Init canvas field renderer
      if (canvasRef.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasRef.current.width = Math.max(1, Math.round(canvasRef.current.clientWidth * dpr));
        canvasRef.current.height = Math.max(1, Math.round(canvasRef.current.clientHeight * dpr));
        fieldRef.current = initField(canvasRef.current);
      }

      let analyserNode: AnalyserNode;
      let usedMode: AudioMode = "real";

      // Try Karel's recording first
      try {
        const res = await fetch("/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81");
        if (!res.ok) throw new Error(`audio API ${res.status}`);
        const json = (await res.json()) as { url?: string };
        if (!json.url) throw new Error("no url in audio API response");

        const audioEl = new Audio();
        audioEl.crossOrigin = "anonymous";
        audioEl.src = json.url;
        audioEl.loop = true;
        audioElRef.current = audioEl;

        // Connect before play, play inside gesture
        const result = await activateRealAudio(ctx, audioEl);
        analyserNode = result.analyser;
        await audioEl.play();

        // Check for CORS taint: analyser all-zero means tainted
        const testBuf = new Uint8Array(analyserNode.frequencyBinCount);
        await new Promise<void>(r => setTimeout(r, 350));
        analyserNode.getByteFrequencyData(testBuf);
        const sum = testBuf.reduce((a, b) => a + b, 0);
        if (sum === 0) {
          // Tainted — fall back to synth
          audioEl.pause();
          if (realChainStopRef.current) { realChainStopRef.current(); realChainStopRef.current = null; }
          throw new Error("analyser tainted (sum=0)");
        }

        usedMode = "real";
        setStatusMsg("");
      } catch (audioErr) {
        // Synth fallback
        await ctx.resume();
        analyserNode = activateSynth(ctx);
        usedMode = "synth";
        const errStr = audioErr instanceof Error ? audioErr.message : String(audioErr);
        const isMissing = errStr.includes("404") || errStr.includes("no url") || errStr.includes("audio API 4");
        setStatusMsg(
          isMissing
            ? "couldn't load the recording — playing a synthesized stand-in; drop an audio file to use real music."
            : `couldn't load the recording (${errStr.slice(0, 60)}) — synthesized stand-in playing; drop a file to use real music.`
        );
      }

      analyserNodeRef.current = analyserNode;
      analyserRef.current = buildAnalyser(analyserNode, ctx.sampleRate);
      setAudioMode(usedMode);
      setAppStatus("running");
      setImageStatus("fallback");

      // Kick first image after 1.2s to get initial analysis frame
      setTimeout(() => {
        const fr = frameRef.current;
        if (fr) {
          const prompt = buildMusicalPrompt(fr);
          setCurrentPrompt(prompt);
          void fetchImage(prompt);
        }
      }, 1200);

    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to start");
      setAppStatus("error");
      teardown();
    }
  }, [appStatus, activateRealAudio, activateSynth, teardown, fetchImage]);

  // ── Handle file drop / file input ─────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i)) {
      setErrorMsg("Please drop an audio file (mp3, wav, ogg, m4a, flac, opus)");
      return;
    }

    // If already running, swap the audio source
    if (appStatus === "running") {
      // Stop old audio
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = "";
      }
      if (realChainStopRef.current) {
        realChainStopRef.current();
        realChainStopRef.current = null;
      }
      if (synthEngineRef.current) {
        synthEngineRef.current.stop();
        synthEngineRef.current = null;
      }
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;

      const audioEl = new Audio();
      // No crossOrigin needed for object URLs
      audioEl.src = url;
      audioEl.loop = true;
      audioElRef.current = audioEl;

      const result = await activateRealAudio(ctx, audioEl);
      analyserNodeRef.current = result.analyser;
      analyserRef.current = buildAnalyser(result.analyser, ctx.sampleRate);
      await audioEl.play();

      setAudioMode("real");
      setStatusMsg("");
      setErrorMsg(null);
    } else {
      // Not running yet — store file to use on Begin
      // Just begin with the file immediately
      setAppStatus("loading");
      setErrorMsg(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        await ctx.resume();

        if (canvasRef.current) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvasRef.current.width = Math.max(1, Math.round(canvasRef.current.clientWidth * dpr));
          canvasRef.current.height = Math.max(1, Math.round(canvasRef.current.clientHeight * dpr));
          fieldRef.current = initField(canvasRef.current);
        }

        const url = URL.createObjectURL(file);
        fileUrlRef.current = url;

        const audioEl = new Audio();
        audioEl.src = url;
        audioEl.loop = true;
        audioElRef.current = audioEl;

        const result = await activateRealAudio(ctx, audioEl);
        analyserNodeRef.current = result.analyser;
        analyserRef.current = buildAnalyser(result.analyser, ctx.sampleRate);
        await audioEl.play();

        setAudioMode("real");
        setStatusMsg("");
        setAppStatus("running");
        setImageStatus("fallback");

        setTimeout(() => {
          const fr = frameRef.current;
          if (fr) {
            const prompt = buildMusicalPrompt(fr);
            setCurrentPrompt(prompt);
            void fetchImage(prompt);
          }
        }, 1200);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to start with file");
        setAppStatus("error");
        teardown();
      }
    }
  }, [appStatus, activateRealAudio, teardown, fetchImage]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleStop = useCallback(() => {
    teardown();
    setAppStatus("idle");
    setImageStatus("none");
    setStatusMsg("");
    setErrorMsg(null);
    setCurrentPrompt("");
  }, [teardown]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isRunning = appStatus === "running";
  const isLoading = appStatus === "loading";

  const statusColor =
    appStatus === "error" ? "text-rose-300" :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "text-emerald-400" :
    (isRunning && audioMode === "real") ? "text-emerald-300/80" :
    isRunning ? "text-amber-300" : "text-white/55";

  const statusDot =
    appStatus === "error" ? "bg-rose-400" :
    (isRunning && imageStatus === "live") ? "bg-emerald-400 animate-pulse" :
    isRunning ? "bg-amber-400 animate-pulse" :
    "bg-white/20";

  const statusLabel =
    appStatus === "error" ? (errorMsg ?? "Error") :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "dreaming live · real piano" :
    (isRunning && audioMode === "real") ? "listening · real piano · awaiting image…" :
    (isRunning && imageStatus === "live") ? "dreaming live · synthesized stand-in" :
    isRunning ? "listening · synthesized stand-in" :
    isLoading ? "loading…" : "ready";

  return (
    <div
      className="relative w-full min-h-screen bg-black flex flex-col overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Full-bleed canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: isRunning ? "block" : "none" }}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 border-4 border-violet-400/70 border-dashed">
          <p className="text-2xl font-serif text-violet-300 drop-shadow-lg">Drop audio file here</p>
        </div>
      )}

      {/* ── Hero / idle screen ───────────────────────────────────────────── */}
      {!isRunning && !isLoading && (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
          {/* Background gradient for idle state */}
          <div className="absolute inset-0 bg-gradient-to-b from-black via-indigo-950/40 to-black pointer-events-none" />

          <div className="relative z-10 max-w-xl flex flex-col items-center gap-6">
            <h1 className="text-3xl font-serif font-bold text-white tracking-tight leading-snug">
              Piano Phrase Painter
            </h1>
            <p className="text-base text-white/75 leading-relaxed">
              Karel&apos;s real piano recording listens to itself — onset detection, harmonic
              chromagram, and phrase-boundary analysis drive when a new image is dreamed and
              what it depicts. The returning image bends the piano back. A closed
              audio&nbsp;→&nbsp;image&nbsp;→&nbsp;audio loop that follows musical structure.
            </p>

            {/* Status / error message */}
            {(statusMsg || errorMsg) && (
              <p className={`text-sm ${errorMsg ? "text-rose-300" : "text-amber-300"} max-w-md`}>
                {errorMsg ?? statusMsg}
              </p>
            )}

            {/* Begin button */}
            <button
              onClick={() => void handleBegin()}
              disabled={isLoading}
              className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/50"
            >
              Begin
            </button>

            {/* File drop zone */}
            <div className="w-full border border-white/20 rounded-xl p-5 text-center bg-white/5 hover:bg-white/8 transition-colors">
              <p className="text-white/75 text-base mb-3">
                Drop a <em>Welcome Home</em> track (or any audio file)
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileInput}
                />
                <span className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-lg border border-white/30 text-white/75 text-base hover:border-violet-400/60 hover:text-white transition-colors">
                  Choose audio file
                </span>
              </label>
              <p className="text-white/55 text-sm mt-2">mp3 · wav · ogg · m4a · flac</p>
            </div>

            <p className="text-white/55 text-sm max-w-md leading-relaxed">
              No audio file? Begin plays Karel&apos;s Ghost-journey recording (when logged in) or a warm synthesized piano that resolves on purpose — both drive real musical analysis.
            </p>
          </div>
        </div>
      )}

      {/* ── Loading screen ───────────────────────────────────────────────── */}
      {isLoading && (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          <p className="text-white/75 text-base">Loading audio…</p>
        </div>
      )}

      {/* ── Running overlay UI ──────────────────────────────────────────── */}
      {isRunning && (
        <>
          {/* Status bar */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 max-w-[70%]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
              <span className={`text-xs ${statusColor} truncate`}>{statusLabel}</span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setShowHud(v => !v)}
                className="min-h-[36px] px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white/75 text-xs hover:text-white transition-colors"
                title="Toggle HUD"
              >
                HUD
              </button>
              <button
                onClick={handleStop}
                className="min-h-[36px] px-4 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white/75 text-xs hover:text-rose-300 transition-colors"
              >
                Stop
              </button>
            </div>
          </div>

          {/* Synth fallback warning */}
          {statusMsg && (
            <div className="absolute top-14 left-4 right-4 z-20 pointer-events-none">
              <div className="bg-black/55 backdrop-blur-sm rounded-lg px-4 py-2.5 max-w-lg">
                <p className="text-amber-300 text-xs leading-relaxed">{statusMsg}</p>
              </div>
            </div>
          )}

          {/* Musical HUD */}
          {showHud && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 space-y-1 min-w-[200px]">
                <p className="text-white/55 text-xs uppercase tracking-wider mb-1.5">Musical State</p>
                <div className="flex justify-between gap-4">
                  <span className="text-white/55 text-xs">Key / Mode</span>
                  <span className="text-violet-300 text-xs font-mono">{hudKey}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-white/55 text-xs">Phrase</span>
                  <span className="text-white/75 text-xs font-mono">{hudPhrase}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-white/55 text-xs">Dynamics</span>
                  <span className="text-white/75 text-xs font-mono">{hudDyn}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-white/55 text-xs">Onsets/min</span>
                  <span className="text-white/75 text-xs font-mono">{hudOpm}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-white/55 text-xs">Flux ×1000</span>
                  <span className="text-white/75 text-xs font-mono">{hudFlux}</span>
                </div>
              </div>
            </div>
          )}

          {/* Current prompt (bottom right) */}
          {currentPrompt && (
            <div className="absolute bottom-4 right-4 z-20 max-w-xs pointer-events-none">
              <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2">
                <p className="text-white/55 text-xs leading-snug line-clamp-3">{currentPrompt}</p>
              </div>
            </div>
          )}

          {/* File drop zone (compact, always visible while running) */}
          <div className="absolute top-14 right-4 z-20">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileInput}
              />
              <span className="min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white/55 text-xs hover:text-white/90 transition-colors border border-white/15 hover:border-violet-400/40">
                Swap audio file
              </span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
