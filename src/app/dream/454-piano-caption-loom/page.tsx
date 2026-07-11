"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Piano Caption Loom (454)
//
// THE ONE QUESTION: What if the caption a latent image is dreamed from were not
// written in one shot, but refined across visible rounds — a draft proposed from
// a real piano's music, then a critic agent pushes back, the agents revise, and
// you watch the caption sharpen before the image regenerates?
//
// Cycle 2 of "The Latent Piano Room" spine. Cycle 1 (448) used a single
// one-shot template. This cycle introduces the CAPTION LOOM: a multi-agent
// propose → critique → revise loop (2-3 rounds) run at every phrase boundary,
// emotion-aligned via valence × arousal (Russell 1980 circumplex).
//
// References:
//   arXiv 2507.20536 "T2I-Copilot" — multi-agent prompt refinement
//   arXiv 2511.11483 "ImAgent" — iterative prompt improvement loop
//   arXiv 2512.23320 — music-derived captions + valence-arousal emotion align
//   Russell (1980) circumplex model of affect
//   Bello et al. (2005) spectral-flux onset detection
//   Refik Anadol (Machine Hallucinations), Memo Akten (Learning to See)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAnalyser, type MusicalFrame, PC_NAMES_C, PC_HUE_DEG } from "./analysis";
import { buildSynthEngine, type SynthEngine } from "./synth";
import { runLoom, type LoomResult, type LoomRound } from "./loom";
import { initField, type FieldRenderer } from "./field";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = "idle" | "loading" | "running" | "error";
type AudioMode = "real" | "synth";
type ImageStatus = "none" | "synthesized" | "live";

interface FeedbackTargets {
  lowpass: BiquadFilterNode;
  reverbGain: GainNode;
  masterGain: GainNode;
}

interface XfadeState {
  imgA: HTMLImageElement | null;
  imgB: HTMLImageElement | null;
  alpha: number;
  transitioning: boolean;
  panX: number; panY: number; scale: number;
  targetPanX: number; targetPanY: number; targetScale: number;
  kbTimer: number;
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

// ── Build real-audio processing chain ────────────────────────────────────────

function buildRealChain(
  ctx: AudioContext,
  audioEl: HTMLAudioElement
): { analyser: AnalyserNode; targets: FeedbackTargets; stop: () => void } {
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
      source.disconnect(); analyser.disconnect(); dryGain.disconnect();
      convolver.disconnect(); reverbGain.disconnect(); lowpass.disconnect();
      masterGain.disconnect(); compressor.disconnect();
    } catch { /* ok */ }
  }

  return { analyser, targets: { lowpass, reverbGain, masterGain }, stop };
}

// ── Sample image for audio loopback ──────────────────────────────────────────

function sampleImage(img: HTMLImageElement): { brightness: number; hue: number; warmth: number } | null {
  try {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 6;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 8, 6);
    const data = g.getImageData(0, 0, 8, 6).data;
    let sR = 0, sG = 0, sB = 0;
    const px = 48;
    for (let i = 0; i < px; i++) { sR += data[i * 4]; sG += data[i * 4 + 1]; sB += data[i * 4 + 2]; }
    const r = sR / px / 255, gn = sG / px / 255, b = sB / px / 255;
    const brightness = 0.299 * r + 0.587 * gn + 0.114 * b;
    const mn = Math.min(r, gn, b);
    let hue = 0;
    if (r >= gn && r >= b) hue = (60 * ((gn - b) / Math.max(r - mn, 0.001)) + 360) % 360;
    else if (gn >= r && gn >= b) hue = 60 * ((b - r) / Math.max(gn - mn, 0.001)) + 120;
    else hue = 60 * ((r - gn) / Math.max(b - mn, 0.001)) + 240;
    if (hue < 0) hue += 360;
    return { brightness, hue, warmth: r > b ? r - b : 0 };
  } catch { return null; }
}

function applyFeedback(targets: FeedbackTargets | null, brightness: number, hue: number, warmth: number, ctx: AudioContext): void {
  if (!targets) return;
  const t = ctx.currentTime;
  targets.lowpass.frequency.setTargetAtTime(800 + brightness * 6000, t, 1.2);
  targets.reverbGain.gain.setTargetAtTime(0.28 + warmth * 0.45, t, 1.5);
  const hN = hue / 360;
  targets.masterGain.gain.setTargetAtTime(0.72 + (hN > 0.55 && hN < 0.85 ? 0.06 : 0), t, 2.0);
}

// ── Loom animation helper ─────────────────────────────────────────────────────

const LOOM_ROUND_MS = 900; // ms between each round appearing

// ── Page component ────────────────────────────────────────────────────────────

export default function PianoCaptionLoom() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [audioMode, setAudioMode] = useState<AudioMode>("real");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("none");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showHud, setShowHud] = useState(true);

  // Loom display state
  const [activeLoom, setActiveLoom] = useState<LoomResult | null>(null);
  const [visibleRounds, setVisibleRounds] = useState<LoomRound[]>([]);
  const [loomAnimating, setLoomAnimating] = useState(false);

  // HUD values (throttled ~8Hz)
  const [hudKey, setHudKey] = useState("—");
  const [hudDyn, setHudDyn] = useState("—");
  const [hudOpm, setHudOpm] = useState(0);
  const [hudValence, setHudValence] = useState(0);
  const [hudArousal, setHudArousal] = useState(0);

  // Canvas + audio refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const feedbackRef = useRef<FeedbackTargets | null>(null);
  const realStopRef = useRef<(() => void) | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const musAnalyserRef = useRef<ReturnType<typeof buildAnalyser> | null>(null);
  const frameRef = useRef<MusicalFrame | null>(null);
  const fieldRef = useRef<FieldRenderer | null>(null);

  // RAF
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef(0);

  // Image crossfade
  const xfRef = useRef<XfadeState>({
    imgA: null, imgB: null, alpha: 0, transitioning: false,
    panX: 0, panY: 0, scale: 1,
    targetPanX: 0, targetPanY: 0, targetScale: 1.04, kbTimer: 0,
  });
  const inFlightRef = useRef(false);
  const lastReqRef = useRef(0);
  const MIN_REQ_MS = 7000;

  // Onset-trigger state
  const onsetCountRef = useRef(0);
  const lastTriggerRef = useRef(0);

  // Loom animation timers
  const loomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller
  const abortRef = useRef<AbortController | null>(null);

  // ── Loom animation ────────────────────────────────────────────────────────

  const animateLoom = useCallback((result: LoomResult) => {
    setActiveLoom(result);
    setVisibleRounds([]);
    setLoomAnimating(true);

    // Reveal one round at a time
    result.rounds.forEach((round, idx) => {
      const timer = setTimeout(() => {
        setVisibleRounds(prev => [...prev, round]);
        if (idx === result.rounds.length - 1) {
          setLoomAnimating(false);
        }
      }, idx * LOOM_ROUND_MS);

      // Track last timer for cleanup
      if (idx === result.rounds.length - 1) {
        loomTimerRef.current = timer;
      }
    });
  }, []);

  // ── Fetch real image ───────────────────────────────────────────────────────

  const fetchImage = useCallback(async (prompt: string, frame: MusicalFrame) => {
    if (inFlightRef.current) return;
    const now = performance.now();
    if (now - lastReqRef.current < MIN_REQ_MS) return;
    inFlightRef.current = true;
    lastReqRef.current = now;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/dream/454-piano-caption-loom/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        // 501 = no FAL_KEY → synthesized mode, not an error
        if (res.status === 501) { setImageStatus("synthesized"); return; }
        setImageStatus("synthesized");
        return;
      }

      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) { setImageStatus("synthesized"); return; }

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img load failed"));
        img.src = json.url as string;
      });

      const xf = xfRef.current;
      xf.imgB = img;
      xf.alpha = 0;
      xf.transitioning = true;

      const color = sampleImage(img);
      const actx = audioCtxRef.current;
      if (color && actx) {
        if (feedbackRef.current) {
          applyFeedback(feedbackRef.current, color.brightness, color.hue, color.warmth, actx);
        } else if (synthRef.current) {
          synthRef.current.applyImageFeedback(color.brightness, color.hue, color.warmth);
        }
      }

      // Bloom on image arrival
      if (fieldRef.current && canvasRef.current) {
        const W = canvasRef.current.width, H = canvasRef.current.height;
        const hue = (PC_HUE_DEG[frame.dominantPc] ?? 220);
        fieldRef.current.addBloom(W * (0.2 + Math.random() * 0.6), H * (0.2 + Math.random() * 0.6), hue);
      }

      setImageStatus("live");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setImageStatus("synthesized");
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
    }
  }, []);

  // ── Trigger a loom + image generation ─────────────────────────────────────

  const triggerRefinement = useCallback((frame: MusicalFrame) => {
    const result = runLoom(frame);
    animateLoom(result);
    void fetchImage(result.finalCaption, frame);
  }, [animateLoom, fetchImage]);

  // ── Draw AI image crossfade layer ─────────────────────────────────────────

  const drawAiLayer = useCallback((canvas: HTMLCanvasElement, dt: number, frame: MusicalFrame | null) => {
    const c = canvas.getContext("2d");
    if (!c) return;
    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) return;
    const xf = xfRef.current;

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

    if (xf.transitioning) {
      xf.alpha = Math.min(1, xf.alpha + dt * 0.4);
      if (xf.alpha >= 1) {
        xf.imgA = xf.imgB; xf.imgB = null;
        xf.alpha = 1; xf.transitioning = false;
      }
    }

    c.fillStyle = "#030312";
    c.fillRect(0, 0, W, H);

    function drawImg(img: HTMLImageElement, alpha: number): void {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const aspect = img.naturalWidth / img.naturalHeight;
      let dw: number, dh: number;
      if (aspect > W / H) { dh = H * xf.scale; dw = dh * aspect; }
      else { dw = W * xf.scale; dh = dw / aspect; }
      c!.save();
      c!.globalAlpha = alpha;
      c!.drawImage(img, (W - dw) / 2 + xf.panX, (H - dh) / 2 + xf.panY, dw, dh);
      c!.restore();
    }

    if (xf.imgA) drawImg(xf.imgA, xf.transitioning ? 1 - xf.alpha * 0.55 : 1);
    if (xf.imgB && xf.transitioning) drawImg(xf.imgB, xf.alpha);

    // Bloom overlays on top of image
    if (fieldRef.current && frame) {
      const hue = PC_HUE_DEG[frame.dominantPc] ?? 220;
      if (frame.onsetNow) {
        fieldRef.current.addBloom(W * (0.3 + Math.random() * 0.4), H * (0.25 + Math.random() * 0.5), hue);
      }
    }

    // Vignette
    const vg = c.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
  }, []);

  // ── rAF loop ──────────────────────────────────────────────────────────────

  const runLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTRef.current) / 1000) || 0.016;
    lastTRef.current = now;

    const canvas = canvasRef.current;
    const analyserNode = analyserNodeRef.current;
    const musAnalyser = musAnalyserRef.current;
    const actx = audioCtxRef.current;

    if (canvas && analyserNode && musAnalyser && actx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = Math.max(1, W);
        canvas.height = Math.max(1, H);
      }

      const frame = musAnalyser.tick(actx.currentTime);
      frameRef.current = frame;

      // ── Onset-driven trigger ──────────────────────────────────────────────
      if (frame.onsetNow || frame.phraseBoundaryNow) {
        onsetCountRef.current++;
        const sinceLastTrigger = now - lastTriggerRef.current;
        const shouldTrigger =
          (frame.phraseBoundaryNow && sinceLastTrigger > MIN_REQ_MS) ||
          (onsetCountRef.current >= 8 && sinceLastTrigger > MIN_REQ_MS);

        if (shouldTrigger && !inFlightRef.current) {
          onsetCountRef.current = 0;
          lastTriggerRef.current = now;
          triggerRefinement(frame);
        }

        // Bloom on onset (field mode)
        if (frame.onsetNow && fieldRef.current) {
          const hue = PC_HUE_DEG[frame.dominantPc] ?? 220;
          fieldRef.current.addBloom(
            canvas.width * (0.3 + Math.random() * 0.4),
            canvas.height * (0.25 + Math.random() * 0.5),
            hue
          );
        }
      }

      // ── Render ────────────────────────────────────────────────────────────
      const hasAi = xfRef.current.imgA !== null || xfRef.current.imgB !== null;
      if (hasAi) {
        drawAiLayer(canvas, dt, frame);
      } else if (fieldRef.current) {
        const caption = activeLoom?.finalCaption ?? "";
        fieldRef.current.drawField(frame, caption, now, dt);
      }

      // ── HUD throttle ~8Hz ──────────────────────────────────────────────
      if ((now | 0) % 125 < 18) {
        const modSuffix = frame.modality === "major" ? "" : frame.modality === "minor" ? "m" : " chr";
        const keyPcIdx = frame.dominantPc;
        setHudKey(`${PC_NAMES_C[keyPcIdx]}${modSuffix}`);
        setHudDyn(frame.dynamicsLabel);
        setHudOpm(Math.round(frame.onsetsPerMin));
        setHudValence(parseFloat(frame.valence.toFixed(2)));
        setHudArousal(parseFloat(frame.arousal.toFixed(2)));
      }
    }

    rafRef.current = requestAnimationFrame(runLoop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawAiLayer, triggerRefinement]);

  // ── Start rAF when running ────────────────────────────────────────────────

  useEffect(() => {
    if (appStatus !== "running") return;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [appStatus, runLoop]);

  // ── Teardown ──────────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (loomTimerRef.current) { clearTimeout(loomTimerRef.current); loomTimerRef.current = null; }
    if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
    if (synthRef.current) { synthRef.current.stop(); synthRef.current = null; }
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; audioElRef.current = null; }
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
    if (audioCtxRef.current) { void audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (fieldRef.current) { fieldRef.current.destroy(); fieldRef.current = null; }
    musAnalyserRef.current = null;
    analyserNodeRef.current = null;
    feedbackRef.current = null;
    frameRef.current = null;
    inFlightRef.current = false;
    onsetCountRef.current = 0;
    lastTriggerRef.current = 0;
    xfRef.current = {
      imgA: null, imgB: null, alpha: 0, transitioning: false,
      panX: 0, panY: 0, scale: 1,
      targetPanX: 0, targetPanY: 0, targetScale: 1.04, kbTimer: 0,
    };
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Activate real audio ────────────────────────────────────────────────────

  const activateReal = useCallback(async (
    actx: AudioContext,
    audioEl: HTMLAudioElement
  ): Promise<AnalyserNode> => {
    await actx.resume();
    const chain = buildRealChain(actx, audioEl);
    realStopRef.current = chain.stop;
    feedbackRef.current = chain.targets;
    return chain.analyser;
  }, []);

  // ── Activate synth ────────────────────────────────────────────────────────

  const activateSynth = useCallback((actx: AudioContext): AnalyserNode => {
    const eng = buildSynthEngine(actx);
    synthRef.current = eng;
    // Proxy feedback targets for synth
    const lp = actx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4000, actx.currentTime);
    const rv = actx.createGain();
    rv.gain.setValueAtTime(0.3, actx.currentTime);
    const mg = actx.createGain();
    mg.gain.setValueAtTime(0.72, actx.currentTime);
    feedbackRef.current = { lowpass: lp, reverbGain: rv, masterGain: mg };
    return eng.analyser;
  }, []);

  // ── Begin ─────────────────────────────────────────────────────────────────

  const handleBegin = useCallback(async () => {
    if (appStatus === "loading" || appStatus === "running") return;
    setAppStatus("loading");
    setErrorMsg(null);
    setActiveLoom(null);
    setVisibleRounds([]);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      const actx = new AC();
      audioCtxRef.current = actx;

      if (canvasRef.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasRef.current.width = Math.max(1, Math.round(canvasRef.current.clientWidth * dpr));
        canvasRef.current.height = Math.max(1, Math.round(canvasRef.current.clientHeight * dpr));
        fieldRef.current = initField(canvasRef.current);
      }

      let analyserNode: AnalyserNode;
      let usedMode: AudioMode = "real";

      try {
        const res = await fetch("/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81");
        if (!res.ok) throw new Error(`audio API ${res.status}`);
        const json = (await res.json()) as { url?: string };
        if (!json.url) throw new Error("no url in audio response");

        const audioEl = new Audio();
        audioEl.crossOrigin = "anonymous";
        audioEl.src = json.url;
        audioEl.loop = true;
        audioElRef.current = audioEl;

        analyserNode = await activateReal(actx, audioEl);
        await audioEl.play();

        // Check for CORS taint (all-zero analyser = tainted)
        const testBuf = new Uint8Array(analyserNode.frequencyBinCount);
        await new Promise<void>(r => setTimeout(r, 350));
        analyserNode.getByteFrequencyData(testBuf);
        const sum = testBuf.reduce((a, b) => a + b, 0);
        if (sum === 0) {
          audioEl.pause();
          if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
          throw new Error("analyser all-zero (CORS taint)");
        }

        usedMode = "real";
        setStatusMsg("");
      } catch (audioErr) {
        await actx.resume();
        analyserNode = activateSynth(actx);
        usedMode = "synth";
        const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
        const isMissing = msg.includes("404") || msg.includes("no url") || msg.includes("audio API 4");
        setStatusMsg(
          isMissing
            ? "Karel's recording unavailable — warm synthesized piano playing. Drop an audio file to use real music."
            : `Audio failed (${msg.slice(0, 60)}) — warm synthesized stand-in playing. Drop a file for real music.`
        );
      }

      analyserNodeRef.current = analyserNode;
      musAnalyserRef.current = buildAnalyser(analyserNode, actx.sampleRate);
      setAudioMode(usedMode);
      setAppStatus("running");
      setImageStatus("synthesized");

      // First loom + image trigger after 1.2s
      setTimeout(() => {
        const fr = frameRef.current;
        if (fr) triggerRefinement(fr);
      }, 1200);

    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to start");
      setAppStatus("error");
      teardown();
    }
  }, [appStatus, activateReal, activateSynth, teardown, triggerRefinement]);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i)) {
      setErrorMsg("Please drop an audio file (mp3, wav, ogg, m4a, flac, opus)");
      return;
    }

    if (appStatus === "running") {
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; }
      if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
      if (synthRef.current) { synthRef.current.stop(); synthRef.current = null; }
      if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }

      const actx = audioCtxRef.current;
      if (!actx) return;

      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      const audioEl = new Audio();
      audioEl.src = url;
      audioEl.loop = true;
      audioElRef.current = audioEl;

      const analyserNode = await activateReal(actx, audioEl);
      analyserNodeRef.current = analyserNode;
      musAnalyserRef.current = buildAnalyser(analyserNode, actx.sampleRate);
      await audioEl.play();

      setAudioMode("real");
      setStatusMsg("");
      setErrorMsg(null);
    } else {
      setAppStatus("loading");
      setErrorMsg(null);
      setActiveLoom(null);
      setVisibleRounds([]);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
        const actx = new AC();
        audioCtxRef.current = actx;
        await actx.resume();

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

        const analyserNode = await activateReal(actx, audioEl);
        analyserNodeRef.current = analyserNode;
        musAnalyserRef.current = buildAnalyser(analyserNode, actx.sampleRate);
        await audioEl.play();

        setAudioMode("real");
        setStatusMsg("");
        setAppStatus("running");
        setImageStatus("synthesized");

        setTimeout(() => {
          const fr = frameRef.current;
          if (fr) triggerRefinement(fr);
        }, 1200);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to start with file");
        setAppStatus("error");
        teardown();
      }
    }
  }, [appStatus, activateReal, teardown, triggerRefinement]);

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
    setActiveLoom(null);
    setVisibleRounds([]);
  }, [teardown]);

  // ── Computed status ────────────────────────────────────────────────────────

  const isRunning = appStatus === "running";
  const isLoading = appStatus === "loading";

  const statusDot =
    appStatus === "error" ? "bg-violet-400" :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "bg-violet-400 animate-pulse" :
    isRunning ? "bg-violet-400 animate-pulse" : "bg-muted";

  const statusLabel =
    appStatus === "error" ? (errorMsg ?? "Error") :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "dreaming live · real piano · loom active" :
    (isRunning && audioMode === "real") ? "listening · real piano · awaiting image…" :
    (isRunning && imageStatus === "live") ? "dreaming live · synthesized stand-in" :
    isRunning ? "listening · synthesized stand-in · loom active" :
    isLoading ? "loading…" : "ready";

  const statusColor =
    appStatus === "error" ? "text-violet-300" :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "text-violet-400" :
    (isRunning && audioMode === "real") ? "text-violet-300/80" :
    isRunning ? "text-violet-300" : "text-muted-foreground";

  // ── Render ─────────────────────────────────────────────────────────────────

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
          <p className="text-2xl font-semibold text-violet-300 drop-shadow-lg">Drop audio file here</p>
        </div>
      )}

      {/* ── Idle screen ──────────────────────────────────────────────────── */}
      {!isRunning && !isLoading && (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-violet-950/35 to-black pointer-events-none" />

          <div className="relative z-10 max-w-xl flex flex-col items-center gap-6">
            <h1 className="text-3xl font-semibold font-bold text-foreground tracking-tight leading-snug">
              Piano Caption Loom
            </h1>
            <p className="text-base text-foreground leading-relaxed">
              What if the caption an image is dreamed from were not written in one shot, but{" "}
              <em className="text-violet-300">refined across visible rounds</em> — a draft proposed
              from Karel&apos;s real piano, then a critic pushes back, the agents revise, and you
              watch the caption sharpen before the image regenerates?
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Multi-agent propose → critique → revise loom. Emotion-aligned via valence × arousal
              (Russell 1980 circumplex). Cycle 2 of <em>The Latent Piano Room</em>.
            </p>

            {(statusMsg || errorMsg) && (
              <p className={`text-sm max-w-md ${errorMsg ? "text-violet-300" : "text-violet-300/95"}`}>
                {errorMsg ?? statusMsg}
              </p>
            )}

            <button
              onClick={() => void handleBegin()}
              disabled={isLoading}
              className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/50"
            >
              Begin
            </button>

            {/* File drop zone */}
            <div className="w-full border border-border rounded-xl p-5 text-center bg-muted hover:bg-accent transition-colors">
              <p className="text-muted-foreground text-base mb-3">
                Drop a <em>Welcome Home</em> track (or any audio file)
              </p>
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden" onChange={handleFileInput} />
                <span className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-lg border border-border text-muted-foreground text-base hover:border-violet-400/60 hover:text-foreground transition-colors">
                  Choose audio file
                </span>
              </label>
              <p className="text-muted-foreground text-sm mt-2">mp3 · wav · ogg · m4a · flac</p>
            </div>

            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              No file? Begin plays Karel&apos;s recording (when logged in) or a warm resolving
              synthesized piano — both drive real musical analysis and the caption loom.
            </p>

            {/* Design notes link */}
            <a
              href="#design-notes"
              className="text-violet-300/80 text-xs underline underline-offset-2 hover:text-violet-300 transition-colors"
            >
              Read the design notes
            </a>
          </div>
        </div>
      )}

      {/* ── Loading screen ──────────────────────────────────────────────── */}
      {isLoading && (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-base">Loading audio…</p>
        </div>
      )}

      {/* ── Running overlay ─────────────────────────────────────────────── */}
      {isRunning && (
        <>
          {/* Top bar */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 max-w-[55%]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
              <span className={`text-xs ${statusColor} truncate`}>{statusLabel}</span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setShowHud(v => !v)}
                className="min-h-[36px] px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                HUD
              </button>
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden" onChange={handleFileInput} />
                <span className="min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-muted-foreground text-xs hover:text-foreground transition-colors border border-border hover:border-violet-400/40">
                  Swap audio
                </span>
              </label>
              <button
                onClick={handleStop}
                className="min-h-[36px] px-4 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-muted-foreground text-xs hover:text-violet-300 transition-colors"
              >
                Stop
              </button>
            </div>
          </div>

          {/* Synth fallback notice */}
          {statusMsg && (
            <div className="absolute top-14 left-4 z-20 pointer-events-none max-w-sm">
              <div className="bg-black/55 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-violet-300/95 text-xs leading-relaxed">{statusMsg}</p>
              </div>
            </div>
          )}

          {/* No-image-key notice */}
          {imageStatus === "synthesized" && !inFlightRef.current && (
            <div className="absolute top-14 right-4 z-20 pointer-events-none">
              <div className="bg-black/55 backdrop-blur-sm rounded-lg px-3 py-1.5">
                <p className="text-violet-300/95 text-xs">synthesized (no image key)</p>
              </div>
            </div>
          )}

          {/* ── Caption Loom HUD (the centerpiece) ─────────────────────── */}
          {showHud && activeLoom && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none" style={{ maxWidth: "min(460px, calc(100vw - 2rem))" }}>
              <div className="bg-black/70 backdrop-blur-md rounded-2xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-widest">Caption Loom</p>
                  {loomAnimating && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  )}
                </div>

                {/* Valence/Arousal bar */}
                <div className="flex gap-4 items-center mb-1">
                  <div className="flex flex-col gap-0.5 flex-1">
                    <span className="text-muted-foreground text-xs">valence</span>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round((activeLoom.valenceTarget + 1) / 2 * 100)}%`,
                          background: activeLoom.valenceTarget > 0 ? "rgb(251,191,36)" : "rgb(129,140,248)",
                        }}
                      />
                    </div>
                    <span className="text-violet-300/80 text-xs font-mono">
                      {activeLoom.valenceTarget > 0 ? "+" : ""}{activeLoom.valenceTarget.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <span className="text-muted-foreground text-xs">arousal</span>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round((activeLoom.arousalTarget + 1) / 2 * 100)}%`,
                          background: activeLoom.arousalTarget > 0 ? "rgb(52,211,153)" : "rgb(148,163,184)",
                        }}
                      />
                    </div>
                    <span className="text-violet-300/95 text-xs font-mono">
                      {activeLoom.arousalTarget > 0 ? "+" : ""}{activeLoom.arousalTarget.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Loom rounds */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5 scrollbar-none">
                  {visibleRounds.map((round, idx) => {
                    const isFinal = round.roundNum === 2;
                    const isLatest = idx === visibleRounds.length - 1;
                    return (
                      <div
                        key={round.roundNum}
                        className={`rounded-xl px-3 py-2 border transition-all ${
                          isFinal
                            ? "border-violet-500/50 bg-violet-950/40"
                            : isLatest
                            ? "border-border bg-muted"
                            : "border-border bg-muted opacity-75"
                        }`}
                      >
                        {/* Round header */}
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${isFinal ? "text-violet-300" : "text-muted-foreground"}`}>
                            Round {round.roundNum + 1} — {round.label}
                          </span>
                          {/* Confidence bar */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">{Math.round(round.confidence * 100)}%</span>
                            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round(round.confidence * 100)}%`,
                                  background: isFinal ? "rgb(167,139,250)" : "rgb(255,255,255,0.4)",
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Caption text — highlight changed clauses */}
                        <p className={`text-xs leading-relaxed ${isFinal ? "text-foreground" : "text-muted-foreground"} font-mono`}>
                          {renderCaptionWithHighlights(round)}
                        </p>

                        {/* Critic notes */}
                        {round.critiques.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {round.critiques.map((c, ci) => (
                              <p key={ci} className="text-violet-300/80 text-xs leading-snug">
                                ↳ {c}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Loom animating pulse */}
                  {loomAnimating && visibleRounds.length < (activeLoom?.rounds.length ?? 0) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      <span className="text-muted-foreground text-xs italic">revising…</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Musical state HUD (compact, right side) */}
          {showHud && (
            <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2.5 space-y-1 min-w-[140px]">
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Music</p>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Key</span>
                  <span className="text-violet-300 text-xs font-mono">{hudKey}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Dyn</span>
                  <span className="text-muted-foreground text-xs font-mono">{hudDyn}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">OPM</span>
                  <span className="text-muted-foreground text-xs font-mono">{hudOpm}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">V</span>
                  <span className="text-violet-300 text-xs font-mono">{hudValence > 0 ? "+" : ""}{hudValence.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">A</span>
                  <span className="text-violet-300/95 text-xs font-mono">{hudArousal > 0 ? "+" : ""}{hudArousal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Design notes (hidden section) ─────────────────────────────── */}
      <div id="design-notes" className="relative z-10 mt-auto px-6 py-12 max-w-2xl mx-auto">
        <div className="bg-black/80 backdrop-blur-sm rounded-2xl border border-border px-6 py-5 space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Design Notes</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300">The Loom:</strong> At each phrase boundary or onset
            cluster (min 7s apart), four specialist agents (Scene, Palette, Motion, Style) propose
            independent clauses from the <code className="text-violet-300 text-xs">MusicalFrame</code>.
            A Critic checks each clause against the valence × arousal emotion target and emits
            concrete fixes. Revisers apply the fixes, producing a sharper caption each round. The
            final round also appends the numeric emotion anchor for maximum image alignment.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300/95">Emotion alignment:</strong> Valence (major +
            consonant → +1, chromatic/dissonant → -1) and Arousal (RMS dynamics + onset density)
            follow Russell&apos;s (1980) circumplex model of affect, as operationalized in arXiv
            2512.23320 for music-to-image generation.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300/95">No-key fallback:</strong> When no FAL_KEY is
            configured, the route returns 501 and the UI switches to synthesized mode — the plasma
            / particle field renders continuously, driven by the same musical features and
            valence-arousal readout. The loom still runs every cycle; you watch captions improve
            even when no image arrives.
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            References: arXiv 2507.20536 (T2I-Copilot) · arXiv 2511.11483 (ImAgent) · arXiv
            2512.23320 (Semantic Emotion Aligned Music→Image) · Russell 1980 circumplex · Bello
            et al. 2005 onset detection · Refik Anadol (Machine Hallucinations) · Memo Akten
            (Learning to See)
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Caption highlight helper ───────────────────────────────────────────────────

function renderCaptionWithHighlights(round: LoomRound): React.ReactNode {
  // Split caption into the clause segments and highlight changed ones
  const { caption, changedKeys, clauses } = round;
  if (changedKeys.length === 0) return caption;

  // Find which text segments correspond to changed clauses and highlight them
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  const remaining = caption;

  const clauseOrder: Array<keyof typeof clauses> = ["scene", "palette", "motion", "style"];
  let pos = 0;
  for (let i = 0; i < clauseOrder.length; i++) {
    const key = clauseOrder[i];
    const clauseText = clauses[key];
    const clauseStart = remaining.indexOf(clauseText, pos);
    if (clauseStart === -1) continue;

    // Any text before this clause
    if (clauseStart > pos) {
      segments.push({ text: remaining.slice(pos, clauseStart), highlighted: false });
    }

    segments.push({ text: clauseText, highlighted: changedKeys.includes(key) });
    pos = clauseStart + clauseText.length;
  }
  if (pos < remaining.length) {
    segments.push({ text: remaining.slice(pos), highlighted: false });
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <span key={i} className="text-violet-300 font-semibold">{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
