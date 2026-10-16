"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 21120-datum — "What if you could pull Karel's piano recording apart into its
// raw spectral DATA — a stark Ikeda-style datamatics grid of magnitude AND
// phase — and reach your hand in to time-stretch, freeze and smear it in real
// time, watching the actual STFT matrix bend as you conduct?"
//
// An anti-glow, Ryoji-Ikeda datamatics piece: black / white / red data
// geometry, hard-quantized raster cells, scanlines, monospace readouts. NO
// glow, NO bloom, NO gradients-as-decoration.
//
// The novel core is a REAL-TIME PHASE VOCODER running inside an
// AudioWorkletProcessor (loaded from a self-contained Blob URL, FFT written by
// hand inside the worklet). It performs a true STFT with phase propagation so
// the piece can:
//   · time-stretch independently of pitch (hand X → 0.25×…4×),
//   · spectral-freeze (dwell / fist → read-head halts, phases keep advancing
//     at bin-center so the frame SHIMMERS instead of buzzing),
//   · phase-blur / scramble (hand openness / pointer-press → random per-bin
//     phase rotation → the take smears and ghosts while harmony stays).
// The worklet posts its OWN live magnitude + phase matrix back to the main
// thread, so the on-screen grid IS the real STFT — not a faked AnalyserNode.
//
// References: Ryoji Ikeda, data-verse / data.gram (2026) — datamatics as a
// data display; and SpectroFX (2025), which treats the STFT spectrogram as an
// editable canvas with non-iterative phase-vocoder reconstruction.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  HAND_LM,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── small math ───────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

// ── matrix geometry ──────────────────────────────────────────────────────────
const COLS = 360; // recent analysis frames across the stage
const ROWS = 240; // frequency bins shown (low bins = most of the music)
const FFT_N = 1024; // must match the worklet
const HALF = FFT_N / 2; // 512 posted bins

// stretch mapping: X in [0,1] → 0.25×…4× (log)
const stretchFromX = (x: number) => 0.25 * Math.pow(16, clamp01(x));

// ── the phase-vocoder AudioWorklet (self-contained; FFT written inline) ───────
// NOTE: kept free of `${` so it can live safely inside a template literal.
const WORKLET_SRC = `
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const aR = re[i + k], aI = im[i + k];
        const bR = re[i + k + h], bI = im[i + k + h];
        const tR = bR * cr - bI * ci, tI = bR * ci + bI * cr;
        re[i + k] = aR + tR; im[i + k] = aI + tI;
        re[i + k + h] = aR - tR; im[i + k + h] = aI - tI;
        const ncr = cr * wr - ci * wi, nci = cr * wi + ci * wr;
        cr = ncr; ci = nci;
      }
    }
  }
  if (inverse) { for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; } }
}

const TWO_PI = Math.PI * 2;

class PV extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'stretch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
      { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'blur', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.N = 1024;
    this.HOP = 256;
    this.half = this.N >> 1;
    this.input = null;
    this.len = 0;
    this.inPos = 0;
    this.ready = false;
    this.hann = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.hann[i] = 0.5 - 0.5 * Math.cos(TWO_PI * i / this.N);
    this.prevPhase = new Float32Array(this.half + 1);
    this.sumPhase = new Float32Array(this.half + 1);
    this.dispMag = new Float32Array(this.half);
    this.dispPhase = new Float32Array(this.half);
    this.ola = new Float32Array(this.N);
    this.re = new Float32Array(this.N);
    this.im = new Float32Array(this.N);
    this.outRing = new Float32Array(this.N * 4);
    this.outHead = 0;
    this.outTail = 0;
    this.outCount = 0;
    this.frameCounter = 0;
    this.postEvery = 3;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.channel) {
        this.input = d.channel;
        this.len = d.channel.length;
        this.inPos = 0;
        this.ready = this.len > this.N;
      }
    };
  }
  synth(stretch, freeze, blur) {
    const N = this.N, half = this.half, hann = this.hann, re = this.re, im = this.im;
    const input = this.input, len = this.len;
    const base = Math.round(this.inPos);
    for (let i = 0; i < N; i++) {
      let idx = base + i;
      idx = idx % len; if (idx < 0) idx += len;
      re[i] = input[idx] * hann[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const sp = this.sumPhase, pp = this.prevPhase;
    const Ha = freeze > 0.999 ? 0 : (this.HOP / stretch) * (1 - freeze);
    let cohSum = 0, maxM = 0, maxK = 0;
    for (let k = 0; k <= half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const phase = Math.atan2(im[k], re[k]);
      const expected = TWO_PI * k / N * Ha;
      let dphi = phase - pp[k] - expected;
      dphi = dphi - TWO_PI * Math.round(dphi / TWO_PI);
      pp[k] = phase;
      // phaseOut += omega + (measuredPhaseDelta - expectedPhaseDelta)
      let inc = TWO_PI * k / N * this.HOP + dphi * stretch;
      if (blur > 0.0001) inc += (Math.random() * 2 - 1) * blur * Math.PI;
      let s = sp[k] + inc;
      s = s - TWO_PI * Math.round(s / TWO_PI);
      sp[k] = s;
      if (k < half) {
        this.dispMag[k] = mag;
        this.dispPhase[k] = phase;
        cohSum += Math.abs(dphi);
        if (mag > maxM) { maxM = mag; maxK = k; }
      }
      re[k] = mag * Math.cos(s);
      im[k] = mag * Math.sin(s);
    }
    for (let k = 1; k < half; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    im[0] = 0; im[half] = 0;
    fft(re, im, true);
    const norm = (1 / 1.5) * 0.6; // Hann^2 / 75% overlap, with headroom
    for (let i = 0; i < N; i++) this.ola[i] += re[i] * hann[i];
    for (let i = 0; i < this.HOP; i++) {
      this.outRing[this.outTail] = this.ola[i] * norm;
      this.outTail = (this.outTail + 1) % this.outRing.length;
      this.outCount++;
    }
    for (let i = 0; i < N - this.HOP; i++) this.ola[i] = this.ola[i + this.HOP];
    for (let i = N - this.HOP; i < N; i++) this.ola[i] = 0;
    this.inPos += Ha;
    if (this.inPos >= len) this.inPos -= len;
    this.frameCounter++;
    if (this.frameCounter % this.postEvery === 0) {
      const m = new Float32Array(half);
      const ph = new Float32Array(half);
      m.set(this.dispMag);
      ph.set(this.dispPhase);
      const coherence = Math.max(0, 1 - (cohSum / half) / Math.PI);
      this.port.postMessage(
        { mag: m, phase: ph, coherence: coherence, dominantBin: maxK },
        [m.buffer, ph.buffer]
      );
    }
  }
  process(inputs, outputs, parameters) {
    const out = outputs[0];
    const ch0 = out[0];
    const n = ch0.length;
    if (!this.ready) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      return true;
    }
    const stretch = parameters.stretch[0];
    const freeze = parameters.freeze[0];
    const blur = parameters.blur[0];
    let guard = 0;
    while (this.outCount < n && guard++ < 16) this.synth(stretch, freeze, blur);
    for (let i = 0; i < n; i++) {
      const v = this.outRing[this.outHead];
      this.outHead = (this.outHead + 1) % this.outRing.length;
      if (this.outCount > 0) this.outCount--;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
    }
    return true;
  }
}
registerProcessor('pv', PV);
`;

// ── posted-frame type ─────────────────────────────────────────────────────────
interface SpecFrame {
  mag: Float32Array;
  phase: Float32Array;
  coherence: number;
  dominantBin: number;
}

// ── per-viewer control state (refs, never async in the control path) ──────────
interface Cursor {
  x: number;
  y: number;
  active: boolean;
  pressed: boolean;
}

// ── the live column matrix (mag + phase), newest on the right ─────────────────
interface Column {
  mag: Float32Array; // length HALF
  phase: Float32Array; // length HALF
}

type Mode = "pv" | "fallback";
type CamStatus = "off" | "loading" | "live" | "lost" | "denied";

const PRIMARY_BTN =
  "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const GHOST_BTN =
  "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const MONO = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

// ── canvas art palette (raw strings are allowed inside the canvas) ────────────
const ART_WHITE = "#f4f4f4";
const ART_RED = "#ff2b2b";

// quantize a magnitude to a hard 0..1 step ladder (Ikeda: no smoothing)
const LEVELS = 6;
function quantMag(mag: number): number {
  const v = clamp01(Math.log10(1 + mag * 12) / 2.4);
  return Math.round(v * (LEVELS - 1)) / (LEVELS - 1);
}

// ── build the scrolling raster into a small offscreen grid canvas ─────────────
function drawGrid(
  img: ImageData,
  cols: Column[],
  cursorBin: number,
): void {
  const data = img.data;
  const n = cols.length;
  for (let c = 0; c < COLS; c++) {
    const j = c - (COLS - n); // index into cols (right-aligned)
    const col = j >= 0 && j < n ? cols[j] : null;
    for (let r = 0; r < ROWS; r++) {
      const bin = ROWS - 1 - r; // low freq at the bottom
      const idx = (r * COLS + c) * 4;
      let R = 0, G = 0, B = 0;
      if (col) {
        const lvl = quantMag(col.mag[bin] || 0);
        const ph = col.phase[bin] || 0;
        // phase channel: sparse red where the phase crosses a tight band and
        // there is real energy — the data's PHASE made visible, not magnitude.
        const red = lvl > 0.25 && Math.abs(Math.sin(ph)) > 0.86;
        if (red) {
          R = 255; G = 43; B = 43;
        } else {
          const g = Math.round(lvl * 255);
          R = g; G = g; B = g;
        }
      }
      // thin red rule at the spectral cursor row
      if (bin === cursorBin) { R = 150; G = 20; B = 20; }
      data[idx] = R; data[idx + 1] = G; data[idx + 2] = B; data[idx + 3] = 255;
    }
  }
}

export default function DatumPage() {
  const { immersive, toggle } = useImmersive();

  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [camStatus, setCamStatus] = useState<CamStatus>("off");
  const [notesOpen, setNotesOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // offscreen grid
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridImgRef = useRef<ImageData | null>(null);

  // control state
  const cursorRef = useRef<Cursor>({ x: 0.5, y: 0.5, active: false, pressed: false });
  const lastPosRef = useRef({ x: 0.5, y: 0.5, t: 0 });
  const dwellFreezeRef = useRef(false);

  // audio
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const fallbackSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const fallbackDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const modeRef = useRef<Mode | null>(null);
  const sampleRateRef = useRef(48000);

  // live matrix + telemetry
  const colsRef = useRef<Column[]>([]);
  const frameIdxRef = useRef(0);
  const coherenceRef = useRef(0);
  const dominantHzRef = useRef(0);
  const stretchRef = useRef(1);
  const freezeRef = useRef(false);
  const blurRef = useRef(0);
  const lastIdleRef = useRef(0);

  // camera
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef(0);

  // ── push a column into the ring (shared by pv, fallback and idle) ──────────
  const pushColumn = useCallback((mag: Float32Array, phase: Float32Array) => {
    const cols = colsRef.current;
    cols.push({ mag, phase });
    if (cols.length > COLS) cols.shift();
  }, []);

  // ── canvas sizing + offscreen grid allocation ──────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (!gridCanvasRef.current) {
      const g = document.createElement("canvas");
      g.width = COLS;
      g.height = ROWS;
      gridCanvasRef.current = g;
      const gctx = g.getContext("2d");
      if (gctx) gridImgRef.current = gctx.createImageData(COLS, ROWS);
    }
  }, []);

  // ── render loop (always on; alive before any audio) ────────────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const now = performance.now();
    const t = now / 1000;

    // ── camera tracking (overrides pointer when a hand is seen) ──
    const tracker = trackerRef.current;
    const video = videoRef.current;
    let camOpen = -1;
    let camFist = false;
    if (tracker && video && video.readyState >= 2) {
      try {
        const res = tracker.detectForVideo(video, now);
        const lm = res.landmarks?.[0];
        if (lm && lm[HAND_LM.indexTip]) {
          const tip = lm[HAND_LM.indexTip];
          cursorRef.current.x = clamp01(1 - tip.x); // MIRROR x (user-facing cam)
          cursorRef.current.y = clamp01(tip.y);
          cursorRef.current.active = true;
          const feat = computeHandFeatures(lm);
          camOpen = feat.open;
          camFist = feat.fist;
          setCamStatus("live");
        } else {
          setCamStatus("lost");
        }
      } catch {
        /* skip a frame */
      }
    }

    const cur = cursorRef.current;

    // ── dwell detection → freeze ──
    const lp = lastPosRef.current;
    const moved = Math.hypot(cur.x - lp.x, cur.y - lp.y);
    if (moved > 0.012) {
      lp.x = cur.x; lp.y = cur.y; lp.t = now;
      dwellFreezeRef.current = false;
    } else if (now - lp.t > 600) {
      dwellFreezeRef.current = true;
    }

    // ── map controls → targets ──
    const stretch = stretchFromX(cur.x);
    const freeze = (camFist || dwellFreezeRef.current) && cur.active ? 1 : 0;
    const blur = cur.pressed ? 0.7 : camOpen >= 0 ? clamp01(camOpen) * 0.9 : 0;
    stretchRef.current = stretch;
    freezeRef.current = freeze > 0.5;
    blurRef.current = blur;

    // apply to the engine, smoothed on the audio thread (~0.12 s)
    const node = nodeRef.current;
    const ac = acRef.current;
    if (node && ac && modeRef.current === "pv") {
      const at = ac.currentTime;
      node.parameters.get("stretch")?.setTargetAtTime(stretch, at, 0.12);
      node.parameters.get("freeze")?.setTargetAtTime(freeze, at, 0.14);
      node.parameters.get("blur")?.setTargetAtTime(blur, at, 0.12);
    } else if (modeRef.current === "fallback") {
      const src = fallbackSrcRef.current;
      if (src && ac) src.playbackRate.setTargetAtTime(1 / stretch, ac.currentTime, 0.12);
      // fallback columns from the analyser (magnitude only; phase = 0)
      const data = fallbackDataRef.current;
      const master = masterRef.current;
      if (data && master && now - lastIdleRef.current > 28) {
        lastIdleRef.current = now;
        master.analyser.getByteFrequencyData(data);
        const mag = new Float32Array(HALF);
        const phase = new Float32Array(HALF);
        let maxV = 0, maxK = 0;
        for (let k = 0; k < HALF; k++) {
          const v = (data[k] || 0) / 255;
          mag[k] = v * v * 3.5;
          if (v > maxV) { maxV = v; maxK = k; }
        }
        dominantHzRef.current = (maxK * sampleRateRef.current) / FFT_N;
        frameIdxRef.current++;
        pushColumn(mag, phase);
      }
    }

    // ── idle: keep the datamatics ALIVE when nothing is playing ──
    if (!modeRef.current && now - lastIdleRef.current > 30) {
      lastIdleRef.current = now;
      const mag = new Float32Array(HALF);
      const phase = new Float32Array(HALF);
      const bandCenter = 90 + 70 * Math.sin(t * 0.37);
      for (let k = 0; k < HALF; k++) {
        const bg = 0.1 + 0.08 * Math.sin(k * 0.08 + t * 1.2);
        const band = Math.exp(-Math.pow((k - bandCenter) / 34, 2)) * 0.75;
        const spike = Math.random() < 0.004 ? 0.9 : 0;
        mag[k] = Math.max(0, bg + band + spike);
        phase[k] = Math.sin(k * 0.31 + t * 1.6);
      }
      frameIdxRef.current++;
      pushColumn(mag, phase);
    }

    // ── paint ──
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const cursorBin = Math.round((1 - clamp01(cur.y)) * (ROWS - 1));
    const gridCanvas = gridCanvasRef.current;
    const gimg = gridImgRef.current;
    if (gridCanvas && gimg) {
      drawGrid(gimg, colsRef.current, cursorBin);
      const gctx = gridCanvas.getContext("2d");
      if (gctx) {
        gctx.putImageData(gimg, 0, 0);
        ctx.imageSmoothingEnabled = false; // crisp hard cells, no blur
        ctx.drawImage(gridCanvas, 0, 0, w, h);
      }
    }

    // scanlines (structural raster, NOT grain) — every 3 css px, faint
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

    // red scan-line marking the newest frame column (right edge)
    ctx.fillStyle = ART_RED;
    ctx.fillRect(w - 2, 0, 2, h);

    // red crosshair at the hand/pointer position mapped onto the matrix
    if (cur.active) {
      const cx = cur.x * w;
      const cy = cur.y * h;
      ctx.strokeStyle = ART_RED;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.strokeStyle = ART_WHITE;
      ctx.strokeRect(cx - 7, cy - 7, 14, 14);
    }

    // ── monospace data readouts (corners) ──
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "top";
    const curHz = ((ROWS - 1 - cursorBin) * sampleRateRef.current) / FFT_N;
    const lines: string[] = [
      "FRAME " + String(frameIdxRef.current).padStart(7, "0"),
      "STRETCH " + stretchRef.current.toFixed(2) + "x",
      "BIN " + Math.round(curHz) + " Hz",
      "DOM " + Math.round(dominantHzRef.current) + " Hz",
      "COHERENCE " + coherenceRef.current.toFixed(3),
    ];
    ctx.fillStyle = ART_WHITE;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 10, 10 + i * 15);

    // state flags, bottom-left, red when engaged
    const flags: Array<[string, boolean]> = [
      ["FREEZE", freezeRef.current],
      ["BLUR " + Math.round(blurRef.current * 100), blurRef.current > 0.02],
      [modeRef.current === "pv" ? "STFT·LIVE" : modeRef.current === "fallback" ? "SPECTRUM" : "IDLE", true],
    ];
    for (let i = 0; i < flags.length; i++) {
      const [label, on] = flags[i];
      ctx.fillStyle = on && i < 2 ? ART_RED : ART_WHITE;
      ctx.fillText(label, 10, h - 16 - (flags.length - 1 - i) * 15);
    }

    // axis hint, bottom-right
    ctx.fillStyle = ART_WHITE;
    ctx.textAlign = "right";
    ctx.fillText("X stretch  ·  Y bin  ·  hold still / fist freeze  ·  press / open blur", w - 10, h - 16);
    ctx.textAlign = "left";
  }, [pushColumn]);

  // mount: start the render loop
  useEffect(() => {
    sizeCanvas();
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderLoop, sizeCanvas]);

  // ── worklet frame handler ───────────────────────────────────────────────────
  const onWorkletMessage = useCallback(
    (e: MessageEvent) => {
      const d = e.data as SpecFrame;
      if (!d || !d.mag) return;
      coherenceRef.current = d.coherence;
      dominantHzRef.current = (d.dominantBin * sampleRateRef.current) / FFT_N;
      frameIdxRef.current++;
      pushColumn(d.mag, d.phase);
    },
    [pushColumn],
  );

  // ── camera (secondary layer on top of the always-working pointer) ───────────
  const startTracking = useCallback(async () => {
    setCamStatus("loading");
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCamStatus("denied");
      return;
    }
    try {
      streamRef.current = await startCamera(video);
    } catch {
      setCamStatus("denied");
      return;
    }
    try {
      trackerRef.current = await createHandTracker(1);
      setCamStatus("lost");
    } catch {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCamStatus("denied");
    }
  }, []);

  const stopTracking = useCallback(() => {
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCamStatus("off");
  }, []);

  // ── play / stop ─────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (playing || loadingAudio) return;
    setAudioError(null);
    setNotice(null);
    setLoadingAudio(true);

    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioError("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setLoadingAudio(false);
      return;
    }
    acRef.current = ac;
    sampleRateRef.current = ac.sampleRate;

    let buffer: AudioBuffer;
    let title: string;
    try {
      const loaded = await loadRealTrackBuffer(ac, trackId);
      buffer = loaded.buffer;
      title = loaded.title;
    } catch {
      setAudioError("Karel's recording could not load — check the connection and try again.");
      void ac.close();
      acRef.current = null;
      setLoadingAudio(false);
      return;
    }
    setTrackTitle(title);

    const master = createSafeMaster(ac);
    masterRef.current = master;

    // mono mixdown for the vocoder
    const mono = new Float32Array(buffer.length);
    const chCount = buffer.numberOfChannels;
    for (let c = 0; c < chCount; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / chCount;
    }

    // try the phase-vocoder worklet; degrade to a live-spectrum fallback
    let ok = false;
    const hasWorklet =
      typeof AudioWorkletNode !== "undefined" && !!ac.audioWorklet?.addModule;
    if (hasWorklet) {
      let url: string | null = null;
      try {
        url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
        await ac.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ac, "pv", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = onWorkletMessage;
        node.connect(master.input);
        node.port.postMessage({ channel: mono }, [mono.buffer]);
        nodeRef.current = node;
        modeRef.current = "pv";
        ok = true;
      } catch {
        ok = false;
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }

    if (!ok) {
      // fallback: play the take through the safe-master analyser, show spectrum
      try {
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(master.input);
        src.start();
        fallbackSrcRef.current = src;
        fallbackDataRef.current = new Uint8Array(master.analyser.frequencyBinCount);
        modeRef.current = "fallback";
        setNotice("phase-vocoder unavailable — showing live spectrum (pointer stretches playback speed)");
      } catch {
        setAudioError("Audio engine failed to start on this device.");
        try {
          master.disconnect();
        } catch {
          /* closing */
        }
        void ac.close();
        acRef.current = null;
        masterRef.current = null;
        setLoadingAudio(false);
        return;
      }
    }

    colsRef.current = []; // clear idle data so the real STFT scrolls in clean
    setPlaying(true);
    setLoadingAudio(false);
  }, [playing, loadingAudio, trackId, onWorkletMessage]);

  const stop = useCallback(() => {
    setPlaying(false);
    const node = nodeRef.current;
    nodeRef.current = null;
    const src = fallbackSrcRef.current;
    fallbackSrcRef.current = null;
    fallbackDataRef.current = null;
    const master = masterRef.current;
    masterRef.current = null;
    const ac = acRef.current;
    acRef.current = null;
    modeRef.current = null;
    setNotice(null);
    try {
      if (node) {
        node.port.onmessage = null;
        node.disconnect();
      }
      if (src) {
        src.stop();
        src.disconnect();
      }
      master?.disconnect();
    } catch {
      /* already closing */
    }
    if (ac) {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 250);
    }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      trackerRef.current?.close();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        nodeRef.current?.disconnect();
        fallbackSrcRef.current?.stop();
        masterRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  // ── pointer: the first-class control (fully playable with the mouse) ────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    cursorRef.current.x = clamp01((e.clientX - rect.left) / rect.width);
    cursorRef.current.y = clamp01((e.clientY - rect.top) / rect.height);
    cursorRef.current.active = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      cursorRef.current.pressed = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    cursorRef.current.pressed = false;
  }, []);

  // ── tracking status line (mandatory) ────────────────────────────────────────
  const camLine =
    camStatus === "live"
      ? "tracking · live"
      : camStatus === "lost"
        ? "hand lost · show your hand, keep it in frame — or just move your mouse"
        : camStatus === "loading"
          ? "camera · loading model"
          : camStatus === "denied"
            ? "camera off · pointer control (move your mouse)"
            : "pointer control · camera optional";
  const camTone =
    camStatus === "lost" || camStatus === "denied" ? "text-destructive" : "text-muted-foreground";

  const DESCRIPTION =
    "Karel's piano recording pulled apart into its raw STFT — a datamatics grid of magnitude and phase. A real-time phase vocoder lets you reach in to time-stretch, freeze and smear the take while the actual spectral matrix bends under your hand.";
  const HOW_TO = [
    "Press Play (headphones help)",
    "Move your mouse (or hand) left–right to time-stretch — 0.25× to 4×",
    "Hold still, or make a fist, to freeze the spectrum (it shimmers, not buzzes)",
    "Press and hold (or open your hand) to phase-blur the take into ghosts",
    "Press f for fullscreen, i for info",
  ];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      {/* stage — the viz IS the page */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* light overlay strip (hidden while immersive) */}
      {!immersive && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-6">
          <div className="pointer-events-auto max-w-xl">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Datum</h1>
            <p className="mt-1 max-w-md text-base leading-relaxed text-muted-foreground">
              Karel&rsquo;s piano, pulled apart into its raw spectral data. A real-time phase vocoder
              lets you time-stretch, freeze and smear the take while the live STFT matrix of
              magnitude and phase bends under your hand.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!playing ? (
                <button
                  type="button"
                  className={PRIMARY_BTN}
                  onClick={() => void start()}
                  disabled={loadingAudio}
                >
                  {loadingAudio ? "Loading…" : "Play"}
                </button>
              ) : (
                <button type="button" className={GHOST_BTN} onClick={stop}>
                  Stop
                </button>
              )}

              {camStatus === "off" || camStatus === "denied" ? (
                <button type="button" className={GHOST_BTN} onClick={() => void startTracking()}>
                  Use hand camera
                </button>
              ) : (
                <button type="button" className={GHOST_BTN} onClick={stopTracking}>
                  Stop camera
                </button>
              )}

              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={playing}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                aria-label="Choose one of Karel's recordings"
              >
                {REAL_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>
                    {tk.title}
                  </option>
                ))}
              </select>
            </div>

            {audioError && <p className="mt-3 text-sm text-destructive">{audioError}</p>}
            {notice && <p className="mt-3 text-sm text-destructive">{notice}</p>}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <span className={`${MONO} ${camTone}`}>{camLine}</span>
              {playing && <span className={MONO}>decoding · {trackTitle}</span>}
            </div>
          </div>

          <div className="pointer-events-auto flex items-end justify-between">
            <button type="button" onClick={() => setNotesOpen(true)} className={`${GHOST_BTN} px-3`}>
              Read the design notes
            </button>
            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Datum"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* while immersive: only HUD + tracking status + notices */}
      {immersive && (
        <>
          <div className="pointer-events-none fixed left-5 top-5 z-30 flex flex-col gap-1">
            <span className={`${MONO} ${camTone}`}>{camLine}</span>
            {audioError && <span className="text-sm text-destructive">{audioError}</span>}
            {notice && <span className="text-sm text-destructive">{notice}</span>}
          </div>
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Datum"
            description={DESCRIPTION}
            howTo={HOW_TO}
          />
        </>
      )}

      {/* design notes */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Datum — design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Karel&rsquo;s recording is decoded and fed into a real-time{" "}
                <span className="text-foreground">phase vocoder</span> running inside an
                AudioWorklet. It runs a true STFT (1024-point frame, 256 hop, 4&times; overlap,
                Hann window, radix-2 FFT written by hand inside the worklet) and reconstructs with
                non-iterative phase propagation — accumulating each bin&rsquo;s phase from its
                measured instantaneous frequency.
              </p>
              <p>
                That lets three things happen independently of pitch: <em>time-stretch</em> (the
                analysis read-head advances faster or slower than synthesis, 0.25&times;–4&times;),{" "}
                <em>freeze</em> (the read-head halts while phases keep advancing at bin-center, so
                the held frame shimmers instead of buzzing), and <em>phase-blur</em> (a controlled
                random phase rotation per bin smears the take into ghosts while harmony stays put).
              </p>
              <p>
                The grid is the worklet&rsquo;s OWN magnitude and phase frames, posted back every
                few hops — not a faked AnalyserNode. Columns are recent frames, rows are frequency
                bins, cell brightness is hard-quantized magnitude; the sparse red layer is the
                phase channel. Palette is black / white / red only — a deliberate break from the
                lab&rsquo;s violet glow, after Ryoji Ikeda&rsquo;s <em>datamatics</em>.
              </p>
              <p>
                References: Ryoji Ikeda, <span className="text-foreground">data-verse / data.gram</span>{" "}
                (2026); and <span className="text-foreground">SpectroFX</span> (2025), which treats
                the STFT spectrogram as an editable canvas with non-iterative phase-vocoder
                reconstruction. If the worklet is unavailable, the piece falls back to a live
                spectrum of the same take and says so.
              </p>
            </div>
            <button type="button" onClick={() => setNotesOpen(false)} className={`${GHOST_BTN} mt-5`}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
