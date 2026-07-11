"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Piano Image Duet (457)
//
// THE ONE QUESTION: What if the dreamed image did not merely filter the piano
// (color → lowpass/reverb as in cycles 1–2) but actively RE-COMPOSED it —
// generating new musical material by being READ AS A SCORE?
//
// Cycle 3 of "The Latent Piano Room" spine. A glowing scan-line sweeps the
// AI-dreamed image left→right, treating it as a spectrogram. Each column's
// vertical brightness profile is sampled and mapped to an additive partial
// bank (Y → frequency in the detected key, brightness → amplitude). The
// result is a shimmer/choir voice that DUETS Karel's real piano — the picture
// is literally singing along.
//
// When no FAL_KEY is present, a synthesized plasma/gradient field is generated
// on canvas from the same musical features, and the scan runs over THAT — so
// the piece is complete with zero API calls.
//
// References:
//   Xenakis UPIC (1977) — image-drawn waveforms as score
//   MetaSynth (Wenger & Spiegel 1997) — spectral image painting → sound
//   Art2Mus (arXiv 2602.17599, Feb 2026) — direct visual→music conditioning
//   Bello et al. (2005) spectral-flux onset detection
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAnalyser, type MusicalFrame, PC_NAMES, PC_HUE } from "./analysis";
import { buildSynthEngine } from "./synth";
import { initField, type FieldRenderer } from "./field";
import {
  buildFrequencyGrid,
  buildAdditiveVoice,
  sampleColumn,
  makeScanState,
  PARTIAL_COUNT,
  type AdditiveVoice,
  type ScanState,
} from "./scanner";

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

// ── Module-level helpers (never start with "use") ─────────────────────────────

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

function applyFeedback(
  targets: FeedbackTargets,
  brightness: number,
  hue: number,
  warmth: number,
  ctx: AudioContext
): void {
  const t = ctx.currentTime;
  targets.lowpass.frequency.setTargetAtTime(800 + brightness * 6000, t, 1.2);
  targets.reverbGain.gain.setTargetAtTime(0.28 + warmth * 0.45, t, 1.5);
  const hN = hue / 360;
  targets.masterGain.gain.setTargetAtTime(
    0.72 + (hN > 0.55 && hN < 0.85 ? 0.06 : 0),
    t, 2.0
  );
}

function sampleImageColor(
  img: HTMLImageElement
): { brightness: number; hue: number; warmth: number } | null {
  try {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 6;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 8, 6);
    const data = g.getImageData(0, 0, 8, 6).data;
    let sR = 0, sG = 0, sB = 0;
    const px = 48;
    for (let i = 0; i < px; i++) {
      sR += data[i * 4];
      sG += data[i * 4 + 1];
      sB += data[i * 4 + 2];
    }
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

function getImageDataFromImg(img: HTMLImageElement, W: number, H: number): ImageData | null {
  try {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, W, H);
    return g.getImageData(0, 0, W, H);
  } catch { return null; }
}

function buildImagePrompt(frame: MusicalFrame): string {
  const keyName = PC_NAMES[frame.keyPc] ?? "C";
  const modeWord = frame.modality === "major" ? "luminous radiant warm"
                 : frame.modality === "minor" ? "deep moody shadowed"
                 : "chromatic iridescent";
  const dynWord = (frame.dynamicsLabel === "ppp" || frame.dynamicsLabel === "pp")
    ? "whispered delicate"
    : frame.dynamicsLabel === "p" ? "soft glowing"
    : frame.dynamicsLabel === "mp" ? "gentle volumetric"
    : frame.dynamicsLabel === "mf" ? "resonant vivid"
    : "intensely luminous";
  return (
    `abstract volumetric light sculpture in key of ${keyName}, ${modeWord}, ${dynWord}, ` +
    `soft caustics, Refik-Anadol data-pigment latent dreamscape, spectral harmonic, ` +
    `cinematic wide-angle, diffuse glow, rich deep tones, 4k photorealistic, no text`
  );
}

/**
 * Draw the glowing vertical scan-line and active partial dots.
 * Module-level so it can be called from both the AI-image and synth-field paths.
 */
function drawScanLine(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  scanX: number,
  amps: Float32Array
): void {
  const sx = Math.round(scanX * W);

  // Glow halo
  const grad = c.createLinearGradient(sx - 8, 0, sx + 8, 0);
  grad.addColorStop(0, "rgba(180,220,255,0)");
  grad.addColorStop(0.5, "rgba(180,220,255,0.55)");
  grad.addColorStop(1, "rgba(180,220,255,0)");
  c.fillStyle = grad;
  c.fillRect(sx - 8, 0, 16, H);

  // Bright core line
  c.save();
  c.globalAlpha = 0.75;
  c.strokeStyle = "rgba(200,230,255,0.9)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(sx, 0);
  c.lineTo(sx, H);
  c.stroke();
  c.restore();

  // Active partial dots — show which frequencies the image is singing
  c.save();
  c.globalCompositeOperation = "screen";
  for (let i = 0; i < PARTIAL_COUNT; i++) {
    const amp = amps[i];
    if (amp < 0.05) continue;
    // Bottom = low freq, top = high freq (UPIC convention)
    const normY = 1.0 - Math.pow(i / (PARTIAL_COUNT - 1), 0.7);
    const y = Math.round(normY * H);
    const radius = 2 + amp * 8;
    const alpha = 0.25 + amp * 0.65;
    const hue = 180 + (i / PARTIAL_COUNT) * 120;
    const rg = c.createRadialGradient(sx, y, 0, sx, y, radius * 2);
    rg.addColorStop(0, `hsla(${hue}, 90%, 85%, ${alpha})`);
    rg.addColorStop(0.5, `hsla(${hue}, 80%, 65%, ${alpha * 0.5})`);
    rg.addColorStop(1, `hsla(${hue}, 70%, 50%, 0)`);
    c.fillStyle = rg;
    c.beginPath();
    c.arc(sx, y, radius * 2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // Leading-edge glow
  c.save();
  c.globalCompositeOperation = "screen";
  const leadGrad = c.createRadialGradient(sx, H * 0.5, 0, sx, H * 0.5, 24);
  leadGrad.addColorStop(0, "rgba(210,240,255,0.4)");
  leadGrad.addColorStop(1, "rgba(210,240,255,0)");
  c.fillStyle = leadGrad;
  c.fillRect(sx - 24, 0, 48, H);
  c.restore();
}

/**
 * Draw the AI image (with Ken-Burns) + vignette + scan-line onto canvas.
 */
function drawAiImageLayer(
  canvas: HTMLCanvasElement,
  dt: number,
  xf: XfadeState,
  scanX: number,
  lastAmps: Float32Array
): void {
  const c = canvas.getContext("2d");
  if (!c) return;
  const W = canvas.width, H = canvas.height;
  if (W === 0 || H === 0) return;

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

  // Vignette
  const vg = c.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);

  drawScanLine(c, W, H, scanX, lastAmps);
}

// ── Page component ────────────────────────────────────────────────────────────

export default function PianoImageDuet() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [audioMode, setAudioMode] = useState<AudioMode>("real");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("none");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showHud, setShowHud] = useState(true);

  // HUD values (throttled ~8Hz)
  const [hudKey, setHudKey] = useState("—");
  const [hudDyn, setHudDyn] = useState("—");
  const [hudScan, setHudScan] = useState(0);
  const [hudPartials, setHudPartials] = useState<Float32Array>(new Float32Array(PARTIAL_COUNT));

  // Refs: canvas + audio
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const feedbackRef = useRef<FeedbackTargets | null>(null);
  const realStopRef = useRef<(() => void) | null>(null);
  const musAnalyserRef = useRef<ReturnType<typeof buildAnalyser> | null>(null);
  const fieldRef = useRef<FieldRenderer | null>(null);
  const frameRef = useRef<MusicalFrame | null>(null);

  // Additive voice + scan state
  const additiveVoiceRef = useRef<AdditiveVoice | null>(null);
  const scanRef = useRef<ScanState>(makeScanState(8));

  // Image data snapshot for scanner (from AI image or synth field)
  const imageDataRef = useRef<ImageData | null>(null);

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

  // Abort + timers
  const abortRef = useRef<AbortController | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch real image ───────────────────────────────────────────────────────

  const fetchImage = useCallback(async (frame: MusicalFrame) => {
    if (inFlightRef.current) return;
    const now = performance.now();
    if (now - lastReqRef.current < MIN_REQ_MS) return;
    inFlightRef.current = true;
    lastReqRef.current = now;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const prompt = buildImagePrompt(frame);

    try {
      const res = await fetch("/dream/457-piano-image-duet/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        setImageStatus("synthesized");
        return;
      }

      const json = (await res.json()) as { url?: string };
      if (!json.url) { setImageStatus("synthesized"); return; }

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img load failed"));
        img.src = json.url as string;
      });

      // Update crossfade
      const xf = xfRef.current;
      xf.imgB = img;
      xf.alpha = 0;
      xf.transitioning = true;

      // Color feedback on filter chain
      const color = sampleImageColor(img);
      const actx = audioCtxRef.current;
      if (color && actx && feedbackRef.current) {
        applyFeedback(feedbackRef.current, color.brightness, color.hue, color.warmth, actx);
      }

      // Snapshot image data for the scanner (scaled down to reasonable size)
      const snapshotW = Math.min(img.naturalWidth, 400);
      const snapshotH = Math.min(img.naturalHeight, 300);
      const snapshot = getImageDataFromImg(img, snapshotW, snapshotH);
      if (snapshot) {
        imageDataRef.current = snapshot;
      }

      setImageStatus("live");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setImageStatus("synthesized");
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
    }
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
      // Sync canvas size
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = Math.max(1, W);
        canvas.height = Math.max(1, H);
      }

      const frame = musAnalyser.tick(actx.currentTime);
      frameRef.current = frame;

      // ── Onset-triggered image fetch ───────────────────────────────────
      if (frame.onsetNow || frame.phraseBoundaryNow) {
        onsetCountRef.current++;
        const sinceLastTrigger = now - lastTriggerRef.current;
        const shouldTrigger =
          (frame.phraseBoundaryNow && sinceLastTrigger > MIN_REQ_MS) ||
          (onsetCountRef.current >= 8 && sinceLastTrigger > MIN_REQ_MS);

        if (shouldTrigger && !inFlightRef.current) {
          onsetCountRef.current = 0;
          lastTriggerRef.current = now;
          void fetchImage(frame);
        }
      }

      // ── Sweep speed derived from musical phrase period ────────────────
      const opm = Math.max(20, frame.onsetsPerMin);
      const sweepSec = Math.max(4, Math.min(12, 480 / opm));
      scanRef.current.sweepDurationSec = sweepSec;

      // Advance scan-line
      const scan = scanRef.current;
      scan.x += dt / scan.sweepDurationSec;
      if (scan.x >= 1) scan.x -= 1;

      // ── Sample image column → set partial amplitudes ──────────────────
      const voice = additiveVoiceRef.current;
      if (voice) {
        // Retune to current key on phrase boundary
        if (frame.phraseBoundaryNow) {
          const newGrid = buildFrequencyGrid(frame.keyPc, frame.modality);
          voice.retune(newGrid, actx.currentTime);
        }

        // Get image data: prefer AI image snapshot, fall back to synth field
        let imgData: ImageData | null = null;
        const hasAiImage = xfRef.current.imgA !== null;

        if (hasAiImage && imageDataRef.current) {
          imgData = imageDataRef.current;
        } else if (fieldRef.current) {
          imgData = fieldRef.current.readImageData();
        }

        if (imgData) {
          const amps = sampleColumn(imgData, scan.x);
          scan.lastAmps = amps;
          // 0.3 smoothing = responsive but not jittery
          voice.setAmplitudes(amps, 0.3);
          // Scale voice gain with dynamics
          voice.setMasterGain(0.3 + frame.rms * 1.2, actx.currentTime);
        }

        // HUD throttle ~8Hz
        if ((now | 0) % 125 < 18) {
          setHudScan(parseFloat(scan.x.toFixed(2)));
          setHudPartials(new Float32Array(scan.lastAmps));
        }
      }

      // ── Render ────────────────────────────────────────────────────────
      const hasAiImg = xfRef.current.imgA !== null || xfRef.current.imgB !== null;

      if (hasAiImg) {
        drawAiImageLayer(canvas, dt, xfRef.current, scan.x, scan.lastAmps);
        // Bloom on onset
        if (frame.onsetNow && fieldRef.current) {
          const hue = PC_HUE[frame.dominantPc] ?? 220;
          fieldRef.current.addBloom(
            canvas.width * (0.3 + Math.random() * 0.4),
            canvas.height * (0.25 + Math.random() * 0.5),
            hue
          );
        }
      } else if (fieldRef.current) {
        fieldRef.current.drawField(frame, now, dt);
        // Bloom on onset
        if (frame.onsetNow) {
          const hue = PC_HUE[frame.dominantPc] ?? 220;
          fieldRef.current.addBloom(
            canvas.width * (0.3 + Math.random() * 0.4),
            canvas.height * (0.25 + Math.random() * 0.5),
            hue
          );
        }
        // Overlay scan-line on synth field
        const c = canvas.getContext("2d");
        if (c) drawScanLine(c, canvas.width, canvas.height, scan.x, scan.lastAmps);
      }

      // HUD key + dynamics
      if ((now | 0) % 125 < 18) {
        const keyName = PC_NAMES[frame.keyPc] ?? "C";
        const modSuffix = frame.modality === "major" ? "" : frame.modality === "minor" ? "m" : " chr";
        setHudKey(`${keyName}${modSuffix}`);
        setHudDyn(frame.dynamicsLabel);
      }
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [fetchImage]);

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
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
    if (additiveVoiceRef.current) { additiveVoiceRef.current.destroy(); additiveVoiceRef.current = null; }
    // Note: synth stored in synthRef is tracked via analyser; stop via SynthEngine ref
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; audioElRef.current = null; }
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
    if (audioCtxRef.current) { void audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (fieldRef.current) { fieldRef.current.destroy(); fieldRef.current = null; }
    musAnalyserRef.current = null;
    analyserNodeRef.current = null;
    feedbackRef.current = null;
    frameRef.current = null;
    imageDataRef.current = null;
    inFlightRef.current = false;
    onsetCountRef.current = 0;
    lastTriggerRef.current = 0;
    scanRef.current = makeScanState(8);
    xfRef.current = {
      imgA: null, imgB: null, alpha: 0, transitioning: false,
      panX: 0, panY: 0, scale: 1,
      targetPanX: 0, targetPanY: 0, targetScale: 1.04, kbTimer: 0,
    };
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Shared audio startup ──────────────────────────────────────────────────

  const startAudio = useCallback(async (actx: AudioContext): Promise<{
    analyserNode: AnalyserNode;
    mode: AudioMode;
    statusMessage: string;
  }> => {
    let analyserNode: AnalyserNode;
    let mode: AudioMode = "real";
    let statusMessage = "";

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

      await actx.resume();
      const chain = buildRealChain(actx, audioEl);
      realStopRef.current = chain.stop;
      feedbackRef.current = chain.targets;
      analyserNode = chain.analyser;

      await audioEl.play();

      // CORS taint check: all-zero analyser means tainted
      const testBuf = new Uint8Array(analyserNode.frequencyBinCount);
      await new Promise<void>(r => setTimeout(r, 350));
      analyserNode.getByteFrequencyData(testBuf);
      const sum = testBuf.reduce((a, b) => a + b, 0);
      if (sum === 0) {
        audioEl.pause();
        if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
        throw new Error("analyser all-zero (CORS taint)");
      }
    } catch (audioErr) {
      await actx.resume();
      const eng = buildSynthEngine(actx);
      // Track synth stop via a closure stored on realStopRef
      const synthStopFn = eng.stop;
      realStopRef.current = synthStopFn;
      analyserNode = eng.analyser;
      mode = "synth";
      const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
      const isMissing = msg.includes("404") || msg.includes("no url") || msg.includes("audio API 4");
      statusMessage = isMissing
        ? "Karel's recording unavailable — warm synthesized piano playing. Drop an audio file to use real music."
        : `Audio fallback (${msg.slice(0, 60)}) — warm synthesized stand-in playing.`;
    }

    return { analyserNode, mode, statusMessage };
  }, []);

  // ── Initialize additive voice ─────────────────────────────────────────────

  const initAdditiveVoice = useCallback((actx: AudioContext, frame: MusicalFrame | null) => {
    if (additiveVoiceRef.current) { additiveVoiceRef.current.destroy(); additiveVoiceRef.current = null; }
    const keyPc = frame?.keyPc ?? 0;
    const modality = frame?.modality ?? "major";
    const grid = buildFrequencyGrid(keyPc, modality);
    additiveVoiceRef.current = buildAdditiveVoice(actx, grid);
  }, []);

  // ── Begin ─────────────────────────────────────────────────────────────────

  const handleBegin = useCallback(async () => {
    if (appStatus === "loading" || appStatus === "running") return;
    setAppStatus("loading");
    setErrorMsg(null);

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

      const { analyserNode, mode, statusMessage } = await startAudio(actx);
      analyserNodeRef.current = analyserNode;
      musAnalyserRef.current = buildAnalyser(analyserNode, actx.sampleRate);
      setAudioMode(mode);
      setStatusMsg(statusMessage);

      initAdditiveVoice(actx, null);

      setAppStatus("running");
      setImageStatus("synthesized");

      // Initial image request after 1.5s
      autoTimerRef.current = setTimeout(() => {
        const fr = frameRef.current;
        void fetchImage(fr ?? {
          rms: 0.2, rawRms: 0.2,
          chroma: new Float32Array(12),
          dominantPc: 0, keyPc: 0, modality: "major",
          consonance: 0.7, onsetNow: false, phraseBoundaryNow: false,
          flux: 0.01, onsetsPerMin: 60, dynamicsLabel: "mp",
        });
      }, 1500);

    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to start");
      setAppStatus("error");
      teardown();
    }
  }, [appStatus, startAudio, initAdditiveVoice, teardown, fetchImage]);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i)) {
      setErrorMsg("Please drop an audio file (mp3, wav, ogg, m4a, flac, opus)");
      return;
    }

    if (appStatus === "running") {
      // Swap audio source while running
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; }
      if (realStopRef.current) { realStopRef.current(); realStopRef.current = null; }
      if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }

      const actx = audioCtxRef.current;
      if (!actx) return;

      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      const audioEl = new Audio();
      audioEl.src = url;
      audioEl.loop = true;
      audioElRef.current = audioEl;

      const chain = buildRealChain(actx, audioEl);
      realStopRef.current = chain.stop;
      feedbackRef.current = chain.targets;
      analyserNodeRef.current = chain.analyser;
      musAnalyserRef.current = buildAnalyser(chain.analyser, actx.sampleRate);
      await audioEl.play();

      setAudioMode("real");
      setStatusMsg("");
      setErrorMsg(null);
    } else {
      setAppStatus("loading");
      setErrorMsg(null);

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

        const chain = buildRealChain(actx, audioEl);
        realStopRef.current = chain.stop;
        feedbackRef.current = chain.targets;
        analyserNodeRef.current = chain.analyser;
        musAnalyserRef.current = buildAnalyser(chain.analyser, actx.sampleRate);
        await audioEl.play();

        initAdditiveVoice(actx, null);

        setAudioMode("real");
        setStatusMsg("");
        setAppStatus("running");
        setImageStatus("synthesized");

        autoTimerRef.current = setTimeout(() => {
          const fr = frameRef.current;
          void fetchImage(fr ?? {
            rms: 0.2, rawRms: 0.2,
            chroma: new Float32Array(12),
            dominantPc: 0, keyPc: 0, modality: "major",
            consonance: 0.7, onsetNow: false, phraseBoundaryNow: false,
            flux: 0.01, onsetsPerMin: 60, dynamicsLabel: "mp",
          });
        }, 1500);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to start with file");
        setAppStatus("error");
        teardown();
      }
    }
  }, [appStatus, initAdditiveVoice, teardown, fetchImage]);

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
  }, [teardown]);

  // ── Auto-demo: start after 10s ────────────────────────────────────────────

  useEffect(() => {
    if (appStatus !== "idle") return;
    const t = setTimeout(() => { void handleBegin(); }, 10000);
    return () => clearTimeout(t);
  }, [appStatus, handleBegin]);

  // ── Computed status ────────────────────────────────────────────────────────

  const isRunning = appStatus === "running";
  const isLoading = appStatus === "loading";

  const statusDot =
    appStatus === "error" ? "bg-violet-400" :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "bg-violet-400 animate-pulse" :
    isRunning ? "bg-violet-400 animate-pulse" : "bg-muted";

  const statusLabel =
    appStatus === "error" ? (errorMsg ?? "Error") :
    (isRunning && audioMode === "real" && imageStatus === "live") ? "dreaming live · real piano · scanning image" :
    (isRunning && audioMode === "real") ? "listening · real piano · synthesized field" :
    (isRunning && imageStatus === "live") ? "dreaming live · synthesized stand-in" :
    isRunning ? "synthesized field (no image key) · scanning field" :
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
          <div className="absolute inset-0 bg-gradient-to-b from-black via-violet-950/20 to-black pointer-events-none" />

          <div className="relative z-10 max-w-xl flex flex-col items-center gap-6">
            <h1 className="text-3xl font-semibold font-bold text-foreground tracking-tight leading-snug">
              Piano Image Duet
            </h1>
            <p className="text-base text-foreground leading-relaxed">
              A dreamed image that doesn&apos;t just filter the piano — it{" "}
              <em className="text-violet-300">re-composes it</em>. A glowing scan-line reads the
              AI image as a spectral score, singing new partial harmonics that duet Karel&apos;s
              real piano. Cycle 3 of <em>The Latent Piano Room</em>.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Image-as-spectrogram resynthesis · additive partial bank quantised to detected key ·
              Xenakis UPIC / MetaSynth lineage · Art2Mus arXiv 2602.17599
            </p>

            {(statusMsg || errorMsg) && (
              <p className={`text-sm max-w-md ${errorMsg ? "text-violet-300" : "text-violet-300/95"}`}>
                {errorMsg ?? statusMsg}
              </p>
            )}

            <p className="text-muted-foreground text-xs">Auto-starting in ~10s…</p>

            <button
              onClick={() => void handleBegin()}
              disabled={isLoading}
              className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-700 hover:bg-violet-600 active:bg-violet-800 text-foreground font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/50"
            >
              Begin the duet
            </button>

            {/* File drop zone */}
            <div className="w-full border border-border rounded-xl p-5 text-center bg-muted hover:bg-accent transition-colors">
              <p className="text-muted-foreground text-base mb-3">
                Drop your own audio to replace Karel&apos;s piano
              </p>
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden" onChange={handleFileInput} />
                <span className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-lg border border-border text-muted-foreground text-base hover:border-violet-400/60 hover:text-foreground transition-colors">
                  Choose audio file
                </span>
              </label>
              <p className="text-muted-foreground text-sm mt-2">mp3 · wav · ogg · m4a · flac</p>
            </div>

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
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 max-w-[60%]">
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
                <p className="text-violet-300/95 text-xs">synthesized field (no image key)</p>
              </div>
            </div>
          )}

          {/* Musical + Scanner HUD */}
          {showHud && (
            <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
              <div className="bg-black/65 backdrop-blur-sm rounded-xl px-3 py-2.5 space-y-1.5 min-w-[170px]">
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Duet</p>

                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Key</span>
                  <span className="text-violet-300 text-xs font-mono">{hudKey}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Dyn</span>
                  <span className="text-muted-foreground text-xs font-mono">{hudDyn}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Scan</span>
                  <span className="text-violet-300/80 text-xs font-mono">{Math.round(hudScan * 100)}%</span>
                </div>

                {/* Live partial visualizer */}
                <div className="mt-1">
                  <p className="text-muted-foreground/70 text-xs mb-1">partials singing</p>
                  <div className="flex items-end gap-px h-8">
                    {Array.from({ length: PARTIAL_COUNT }).map((_, i) => {
                      const amp = hudPartials[i] ?? 0;
                      const hue = 180 + (i / PARTIAL_COUNT) * 120;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm"
                          style={{
                            height: `${Math.max(2, amp * 100)}%`,
                            background: `hsla(${hue}, 80%, 65%, ${0.4 + amp * 0.6})`,
                            transition: "height 0.08s ease",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Title overlay */}
          {showHud && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
              <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2">
                <p className="text-muted-foreground font-semibold text-sm italic">Piano Image Duet</p>
                <p className="text-muted-foreground/70 text-xs">cycle 3 · latent piano room</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Design notes ────────────────────────────────────────────────── */}
      <div id="design-notes" className="relative z-10 mt-auto px-6 py-12 max-w-2xl mx-auto">
        <div className="bg-black/80 backdrop-blur-sm rounded-2xl border border-border px-6 py-5 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Design Notes</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300">The new move (cycle 3):</strong> Prior cycles used the
            dreamed image only to FILTER the piano (color → lowpass cutoff, brightness → reverb wet).
            Here the image RE-COMPOSES it. A scan-line sweeps the image as a spectrogram: each
            column&apos;s vertical brightness profile is sampled at{" "}
            <code className="text-violet-300/80 text-xs">{PARTIAL_COUNT}</code> log-spaced Y positions,
            each mapped to a frequency in the detected key (diatonic scale degrees across 3 octaves,
            quantised so every partial is consonant). Brightness → that partial&apos;s amplitude. The
            result is an additive shimmer/choir voice that duets the real piano.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300/95">Musical quantisation (stays warm):</strong> The
            partial frequency grid is rebuilt at every phrase boundary using the chromagram&apos;s
            best-fit key (major diatonic: 0,2,4,5,7,9,11 semitones; minor: 0,2,3,5,7,8,10; chromatic
            fallback: pentatonic). Every partial is IN KEY — never atonal. The image is constrained to
            sing consonant harmonics.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-violet-300/95">No-key fallback (complete without API):</strong> When
            FAL_KEY is absent, the route returns 501 and the UI generates a plasma / gradient blob field
            on canvas from the same musical features. The scanner still sweeps THAT synthesized field —
            so you hear the generated blobs sing back to the piano. Status: amber &ldquo;synthesized field
            (no image key)&rdquo; vs. emerald &ldquo;dreaming live&rdquo; when real images arrive.
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Subsystems: audio fetch + CORS-taint check + warm synth fallback (C–Am–F–G7–Cmaj9) ·
            FFT 2048 chromagram + spectral-flux onset + phrase-boundary heuristic · FAL flux/schnell
            image gen + Ken-Burns crossfade · image-as-spectrogram additive resynthesis (UPIC /
            MetaSynth / Art2Mus) · synthesized plasma field fallback · scan-line partial-bar HUD.
          </p>
          <p className="text-muted-foreground/70 text-xs">
            References: Xenakis UPIC (1977) · MetaSynth (Wenger &amp; Spiegel 1997) · Art2Mus arXiv
            2602.17599 (Feb 2026) · Bello et al. 2005 onset detection · Russell 1980 circumplex ·
            Refik Anadol (Machine Hallucinations) · Memo Akten (Learning to See)
          </p>
        </div>
      </div>
    </div>
  );
}
