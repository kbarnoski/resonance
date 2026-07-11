"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";

// ─── constants ─────────────────────────────────────────────────────────────
const GRID_W = 20;
const GRID_H = 15;
const THUMB_W = 320;
const THUMB_H = 240;
const C4_HZ = 261.63;
const EMA_A = 0.12; // smoothing factor for flow EMA

// C major pentatonic semitone offsets (±2 octaves from C4)
const PENTA: readonly number[] = [
  -24, -22, -20, -17, -15,
  -12, -10, -8, -5, -3,
  0, 2, 4, 7, 9,
  12, 14, 16, 19, 21, 24,
];

// Same palette as 1-live
const BAND_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [88,  32,  192],
  [32,  168, 220],
  [80,  220, 100],
  [240, 220,  70],
  [255, 150,  40],
  [255,  60,  120],
];

// ─── pure helpers (no "use" prefix) ────────────────────────────────────────

function toGray(data: Uint8ClampedArray): Float32Array {
  const n = data.length >> 2;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i << 2;
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
  }
  return gray;
}

interface FlowResult {
  cells: Array<{ mag: number; dx: number; dy: number }>;
  totalMag: number;  // 0..1
  hBias: number;     // -1..1, rightward positive
  vBias: number;     // -1..1, downward positive
}

function extractFlow(curr: Float32Array, prev: Float32Array): FlowResult {
  const cells: FlowResult["cells"] = [];
  const cw = THUMB_W / GRID_W;
  const ch = THUMB_H / GRID_H;
  let sumMag = 0, sumDx = 0, sumDy = 0;

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor(gx * cw);
      const y0 = Math.floor(gy * ch);
      const x1 = Math.min(Math.floor((gx + 1) * cw), THUMB_W);
      const y1 = Math.min(Math.floor((gy + 1) * ch), THUMB_H);
      const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
      let mag = 0, dx = 0, dy = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const d = curr[y * THUMB_W + x] - prev[y * THUMB_W + x];
          mag += Math.abs(d);
          dx += x >= midX ? d : -d;
          dy += y >= midY ? d : -d;
          n++;
        }
      }
      if (n > 0) { mag /= n; dx /= n; dy /= n; }
      cells.push({ mag, dx, dy });
      sumMag += mag;
      sumDx += dx;
      sumDy += dy;
    }
  }

  const nc = GRID_W * GRID_H;
  return {
    cells,
    totalMag: Math.min(1, (sumMag / nc) * 10),
    hBias: Math.max(-1, Math.min(1, (sumDx / nc) * 8)),
    vBias: Math.max(-1, Math.min(1, (sumDy / nc) * 8)),
  };
}

function pitchFromBias(hBias: number): number {
  const target = hBias * 19;
  const snapped = PENTA.reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
  return C4_HZ * Math.pow(2, snapped / 12);
}

function noteNameFromHz(hz: number): string {
  const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const midi = Math.round(12 * Math.log2(hz / 440) + 69);
  const oct = Math.floor(midi / 12) - 1;
  return `${NAMES[((midi % 12) + 12) % 12]}${oct}`;
}

function buildIR(actx: AudioContext): AudioBuffer {
  const len = Math.floor(actx.sampleRate * 1.4);
  const buf = actx.createBuffer(2, len, actx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  return buf;
}

// Arrow direction → blended RGBA color
function dirColor(dx: number, dy: number, mag: number): string {
  const len = Math.sqrt(dx * dx + dy * dy) + 1e-9;
  const nx = dx / len;
  const ny = dy / len;
  const rW = Math.max(0,  nx);  // rightward → amber
  const lW = Math.max(0, -nx);  // leftward  → violet
  const uW = Math.max(0, -ny);  // upward    → teal
  const dW = Math.max(0,  ny);  // downward  → rose
  const s = rW + lW + uW + dW + 1e-9;
  const r = Math.round((rW * 245 + lW * 109 + uW * 20  + dW * 244) / s);
  const g = Math.round((rW * 158 + lW * 40  + uW * 184 + dW * 63 ) / s);
  const b = Math.round((rW * 11  + lW * 217 + uW * 166 + dW * 94 ) / s);
  const a = Math.min(1, mag * 12).toFixed(2);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Demo animation blobs ───────────────────────────────────────────────────
interface Blob { x: number; y: number; vx: number; vy: number; r: number; hue: number; }

function initBlobs(): Blob[] {
  return [
    { x: 100, y: 100, vx: 38, vy: 25,  r: 55, hue: 270 },
    { x: 220, y: 140, vx: -32, vy: 40, r: 48, hue: 185 },
    { x: 160, y: 60,  vx: 26,  vy: -36, r: 42, hue: 44  },
  ];
}

function stepBlobs(blobs: Blob[], dt: number): void {
  for (const b of blobs) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x - b.r < 0 || b.x + b.r > THUMB_W) {
      b.vx = -b.vx;
      b.x = Math.max(b.r, Math.min(THUMB_W - b.r, b.x));
    }
    if (b.y - b.r < 0 || b.y + b.r > THUMB_H) {
      b.vy = -b.vy;
      b.y = Math.max(b.r, Math.min(THUMB_H - b.r, b.y));
    }
  }
}

function renderBlobs(ctx: CanvasRenderingContext2D, blobs: Blob[], t: number): void {
  ctx.fillStyle = "#040010";
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  for (const b of blobs) {
    const rr = b.r * (0.88 + 0.12 * Math.sin(t * 1.4 + b.hue * 0.05));
    const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
    grd.addColorStop(0,   `hsla(${b.hue},88%,78%,0.95)`);
    grd.addColorStop(0.55, `hsla(${b.hue},85%,55%,0.50)`);
    grd.addColorStop(1,   `hsla(${b.hue},80%,40%,0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function OpticalFlowMusic() {
  const mainCanvasRef  = useRef<HTMLCanvasElement>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef       = useRef<HTMLVideoElement | null>(null);
  const animRef        = useRef(0);
  const prevGrayRef    = useRef<Float32Array | null>(null);
  const blobsRef       = useRef<Blob[]>(initBlobs());
  const tRef           = useRef(0); // elapsed demo time (s)
  const lastRafRef     = useRef(0);

  // Smoothed flow (EMA)
  const magSmRef = useRef(0);
  const hSmRef   = useRef(0);
  const vSmRef   = useRef(0);

  // Audio nodes
  const actxRef     = useRef<AudioContext | null>(null);
  const oscRef      = useRef<OscillatorNode | null>(null);
  const filterRef   = useRef<BiquadFilterNode | null>(null);
  const masterRef   = useRef<GainNode | null>(null);
  const wetRef      = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef  = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Arpeggiation
  const nextNoteRef = useRef(0);
  const lastPitchRef = useRef(C4_HZ);

  const [mode, setMode] = useState<"idle" | "demo" | "camera">("idle");
  const [camErr, setCamErr] = useState<string | null>(null);
  const [hudNote, setHudNote] = useState("—");
  const [hudMag,  setHudMag]  = useState(0);

  // ─── audio setup ──────────────────────────────────────────────────────────
  function setupAudio(): void {
    if (actxRef.current) return;
    const actx = new AudioContext();

    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = C4_HZ;

    const filter = actx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 1.2;

    const master = actx.createGain();
    master.gain.value = 0.02;

    const convolver = actx.createConvolver();
    convolver.buffer = buildIR(actx);

    const wet = actx.createGain();
    wet.gain.value = 0;

    const dry = actx.createGain();
    dry.gain.value = 0.7;

    const analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    // osc → filter → dry ──→ master → analyser → dest
    //              → convolver → wet ↗
    osc.connect(filter);
    filter.connect(dry);
    filter.connect(convolver);
    convolver.connect(wet);
    dry.connect(master);
    wet.connect(master);
    master.connect(analyser);
    analyser.connect(actx.destination);

    osc.start();

    actxRef.current   = actx;
    oscRef.current    = osc;
    filterRef.current = filter;
    masterRef.current = master;
    wetRef.current    = wet;
    analyserRef.current = analyser;
    freqBufRef.current  = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }

  // ─── frame processing ─────────────────────────────────────────────────────
  function processFrame(
    thumbCtx: CanvasRenderingContext2D,
    mainCtx: CanvasRenderingContext2D,
    mW: number,
    mH: number,
  ): void {
    const imageData = thumbCtx.getImageData(0, 0, THUMB_W, THUMB_H);
    const currGray  = toGray(imageData.data);
    const prev = prevGrayRef.current;
    prevGrayRef.current = currGray;

    if (!prev) return; // first frame — no flow yet

    const flow = extractFlow(currGray, prev);

    // EMA smoothing
    magSmRef.current = magSmRef.current * (1 - EMA_A) + flow.totalMag * EMA_A;
    hSmRef.current   = hSmRef.current   * (1 - EMA_A) + flow.hBias   * EMA_A;
    vSmRef.current   = vSmRef.current   * (1 - EMA_A) + flow.vBias   * EMA_A;

    const magSm = magSmRef.current;
    const hSm   = hSmRef.current;
    const vSm   = vSmRef.current;

    // ── Update audio ────────────────────────────────────────────────────────
    const actx = actxRef.current;
    const osc = oscRef.current;
    const fil = filterRef.current;
    const mst = masterRef.current;
    const wet = wetRef.current;

    if (actx && osc && fil && mst && wet) {
      const now = actx.currentTime;

      // Filter cutoff: 400–6000 Hz tracked by motion magnitude
      const cutoff = 400 + magSm * 5600;
      fil.frequency.setTargetAtTime(cutoff, now, 0.08);

      // Wet reverb: downward motion (vSm > 0) → more reverb
      const wGain = Math.max(0, vSm * 0.18);
      wet.gain.setTargetAtTime(wGain, now, 0.15);

      // Arpeggiation: trigger note on schedule
      if (now >= nextNoteRef.current) {
        const targetPitch = pitchFromBias(hSm);
        if (Math.abs(targetPitch - lastPitchRef.current) > 2) {
          osc.frequency.setTargetAtTime(targetPitch, now, 0.04);
          lastPitchRef.current = targetPitch;
        }

        // Envelope: rise to gain, then settle
        const peak = 0.04 + magSm * 0.22;
        mst.gain.setValueAtTime(peak, now);
        mst.gain.setTargetAtTime(0.015 + magSm * 0.04, now + 0.03, 0.14);

        // Next note interval: 800ms still → 60ms fast
        const interval = Math.max(0.06, 0.8 - magSm * 0.74);
        nextNoteRef.current = now + interval;
      }
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    // Scale THUMB → main canvas (letterboxed)
    const scaleX = mW / THUMB_W;
    const scaleY = mH / THUMB_H;
    const scale  = Math.max(scaleX, scaleY);
    const offX = (mW - THUMB_W * scale) / 2;
    const offY = (mH - THUMB_H * scale) / 2;

    // Draw the captured frame (webcam/demo) at 40% opacity
    mainCtx.save();
    mainCtx.globalAlpha = 0.42;
    mainCtx.drawImage(
      thumbCtx.canvas,
      offX, offY, THUMB_W * scale, THUMB_H * scale,
    );
    mainCtx.restore();

    // Draw flow arrows
    const cellW = (THUMB_W * scale) / GRID_W;
    const cellH = (THUMB_H * scale) / GRID_H;
    const maxArrow = Math.min(cellW, cellH) * 0.9;

    mainCtx.lineWidth = Math.max(1.5, cellW * 0.08);
    mainCtx.lineCap = "round";

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const cell = flow.cells[gy * GRID_W + gx];
        if (cell.mag < 0.002) continue;

        const cx = offX + (gx + 0.5) * cellW;
        const cy = offY + (gy + 0.5) * cellH;
        const len = Math.min(maxArrow, cell.mag * maxArrow * 20);
        const ex = cx + cell.dx * len;
        const ey = cy + cell.dy * len;

        mainCtx.strokeStyle = dirColor(cell.dx, cell.dy, cell.mag);
        mainCtx.shadowColor  = mainCtx.strokeStyle;
        mainCtx.shadowBlur   = 6;
        mainCtx.beginPath();
        mainCtx.moveTo(cx, cy);
        mainCtx.lineTo(ex, ey);
        mainCtx.stroke();
      }
    }
    mainCtx.shadowBlur = 0;

    // ── Spectrum bar at bottom ───────────────────────────────────────────────
    const analyser = analyserRef.current;
    const freqBuf  = freqBufRef.current;
    if (analyser && freqBuf) {
      analyser.getByteFrequencyData(freqBuf);
      const barH = Math.round(mH * 0.06);
      const barY = mH - barH;
      const barW = mW / 6;

      // Band ranges (indices in freqBuf)
      const binHz = actxRef.current!.sampleRate / (analyser.fftSize);
      const bands = [[20,80],[80,250],[250,500],[500,2000],[2000,4000],[4000,20000]];

      for (let bi = 0; bi < 6; bi++) {
        const [lo, hi] = bands[bi];
        const lo_bin = Math.max(0, Math.floor(lo / binHz));
        const hi_bin = Math.min(freqBuf.length - 1, Math.floor(hi / binHz));
        let sum = 0;
        for (let k = lo_bin; k <= hi_bin; k++) sum += freqBuf[k];
        const avg = hi_bin > lo_bin ? sum / (hi_bin - lo_bin + 1) : 0;
        const norm = avg / 255;

        const [r, g, b] = BAND_COLORS[bi];
        mainCtx.fillStyle = `rgba(${r},${g},${b},0.15)`;
        mainCtx.fillRect(bi * barW, barY, barW, barH);
        mainCtx.fillStyle = `rgba(${r},${g},${b},0.9)`;
        mainCtx.fillRect(bi * barW, barY + barH * (1 - norm), barW, barH * norm);
      }
    }

    // ── HUD update (throttled) ───────────────────────────────────────────────
    if (Math.random() < 0.05) {
      setHudNote(noteNameFromHz(lastPitchRef.current));
      setHudMag(Math.round(magSm * 100));
    }
  }

  // ─── animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;

    const mainCtxRaw = mainCanvas.getContext("2d");
    if (!mainCtxRaw) return;
    const mainCtx: CanvasRenderingContext2D = mainCtxRaw;

    // Thumb (offscreen capture canvas)
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width  = THUMB_W;
    thumbCanvas.height = THUMB_H;
    const thumbCtxRaw = thumbCanvas.getContext("2d");
    if (!thumbCtxRaw) return;
    const thumbCtx: CanvasRenderingContext2D = thumbCtxRaw;
    thumbCanvasRef.current = thumbCanvas;

    // DPR-aware main canvas sizing
    let mW = 0, mH = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      mW = window.innerWidth;
      mH = window.innerHeight;
      mainCanvas.width  = mW * dpr;
      mainCanvas.height = mH * dpr;
      mainCanvas.style.width  = `${mW}px`;
      mainCanvas.style.height = `${mH}px`;
      mainCtx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    setupAudio();

    let stopped = false;
    const video = videoRef.current;

    const loop = (nowMs: number) => {
      if (stopped) return;
      const dt = Math.min((nowMs - lastRafRef.current) / 1000, 0.05);
      lastRafRef.current = nowMs;

      // Clear main canvas
      mainCtx.fillStyle = "#07001a";
      mainCtx.fillRect(0, 0, mW, mH);

      if (mode === "demo") {
        tRef.current += dt;
        stepBlobs(blobsRef.current, dt);
        renderBlobs(thumbCtx, blobsRef.current, tRef.current);
      } else if (video && video.readyState >= 2) {
        // Mirror horizontally for selfie-mode
        thumbCtx.save();
        thumbCtx.translate(THUMB_W, 0);
        thumbCtx.scale(-1, 1);
        thumbCtx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        thumbCtx.restore();
      }

      processFrame(thumbCtx, mainCtx, mW, mH);
      animRef.current = requestAnimationFrame(loop);
    };

    lastRafRef.current = performance.now();
    animRef.current = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      actxRef.current?.close();
      actxRef.current   = null;
      oscRef.current    = null;
      filterRef.current = null;
      masterRef.current = null;
      wetRef.current    = null;
      analyserRef.current = null;
      freqBufRef.current  = null;
      prevGrayRef.current = null;
      nextNoteRef.current = 0;
      lastPitchRef.current = C4_HZ;
      magSmRef.current = 0;
      hSmRef.current   = 0;
      vSmRef.current   = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── camera setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "camera") return;

    let stream: MediaStream | null = null;

    const startCam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });
        const vid = document.createElement("video");
        vid.srcObject = stream;
        vid.playsInline = true;
        vid.muted = true;
        await vid.play();
        videoRef.current = vid;
        setCamErr(null);
      } catch {
        setCamErr("Camera unavailable — running in demo mode.");
        setMode("demo");
      }
    };

    startCam();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      videoRef.current = null;
    };
  }, [mode]);

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-[#07001a] overflow-hidden">
      <canvas
        ref={mainCanvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: mode === "idle" ? "none" : "block" }}
      />

      {/* Start screen */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
          <div>
            <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight">
              Optical Flow Music
            </h1>
            <p className="mt-3 text-base text-muted-foreground max-w-sm mx-auto">
              Move in front of the camera — the motion becomes music.
              Flow direction shifts pitch; speed opens the filter; downward
              motion deepens the reverb.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setMode("camera")}
              className="min-h-[52px] px-6 py-3 rounded-xl bg-violet-600/90 hover:bg-violet-500
                         text-foreground text-base font-semibold transition-colors"
            >
              🎥 Use Camera
            </button>
            <button
              onClick={() => setMode("demo")}
              className="min-h-[52px] px-6 py-3 rounded-xl bg-muted hover:bg-accent
                         text-foreground text-base font-semibold transition-colors border border-border"
            >
              ▶ Demo mode
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            No audio data is sent anywhere · camera never leaves your device
          </p>
        </div>
      )}

      {/* HUD overlay (active state) */}
      {mode !== "idle" && (
        <>
          {/* Top-left info */}
          <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
            <div className="text-2xl font-mono font-bold text-foreground">
              {hudNote}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              motion {hudMag}% · {mode === "demo" ? "demo" : "camera"}
            </div>
          </div>

          {/* Stop button */}
          <button
            onClick={() => {
              setMode("idle");
              setCamErr(null);
            }}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg
                       bg-muted hover:bg-accent text-foreground text-sm transition-colors"
          >
            ✕ Stop
          </button>

          {/* Camera error banner */}
          {camErr && (
            <div className="absolute top-16 left-0 right-0 mx-auto w-fit
                            px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40
                            text-violet-300 text-sm text-center">
              {camErr}
            </div>
          )}

          {/* Legend: direction colors */}
          <div className="absolute bottom-12 right-4 flex flex-col gap-1 pointer-events-none">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-[#f59e0b] inline-block rounded" />
              right → higher pitch
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-[#7c3aed] inline-block rounded" />
              left → lower pitch
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-[#14b8a6] inline-block rounded" />
              up → brighter filter
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-0.5 bg-[#f43f5e] inline-block rounded" />
              down → deeper reverb
            </div>
          </div>
        </>
      )}

      {/* Design notes link */}
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/221-optical-flow-music/README.md"
        target="_blank"
        className="absolute bottom-2 left-3 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        design notes
      </Link>
    </div>
  );
}
