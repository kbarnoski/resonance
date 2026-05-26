"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── constants ─────────────────────────────────────────────────────────────
const SZ = 300; // internal canvas resolution (square)

type CMode = { m: number; n: number };

// 25 Chladni modes in order of rising eigenfrequency sqrt(m²+n²)
const MODES: CMode[] = [
  { m: 1, n: 1 }, { m: 1, n: 2 }, { m: 2, n: 1 }, { m: 2, n: 2 },
  { m: 1, n: 3 }, { m: 3, n: 1 }, { m: 2, n: 3 }, { m: 3, n: 2 }, { m: 3, n: 3 },
  { m: 1, n: 4 }, { m: 4, n: 1 }, { m: 2, n: 4 }, { m: 4, n: 2 },
  { m: 3, n: 4 }, { m: 4, n: 3 }, { m: 4, n: 4 },
  { m: 1, n: 5 }, { m: 5, n: 1 }, { m: 2, n: 5 }, { m: 5, n: 2 },
  { m: 5, n: 3 }, { m: 3, n: 5 }, { m: 5, n: 4 }, { m: 4, n: 5 }, { m: 5, n: 5 },
];

const BASE_HZ = 55; // Hz mapping to mode (1,1)
const DEMO_SECS_PER_MODE = 3.5;

// 6-band palette: sub-bass→violet, bass→cyan, lo-mid→emerald, mid→yellow, hi-mid→orange, high→rose
const BAND_RGB: readonly [number, number, number][] = [
  [139, 92, 246],
  [34, 211, 238],
  [52, 211, 153],
  [250, 204, 21],
  [251, 146, 60],
  [244, 63, 94],
];

const BAND_RANGES: readonly [number, number][] = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

// ── pure helpers ──────────────────────────────────────────────────────────

function calcEigen(m: number, n: number): number {
  return Math.sqrt(m * m + n * n);
}

// Precompute normalized |Z(x,y)| for mode (m,n) using symmetric combination
// Z = sin(mπx)sin(nπy) + sin(nπx)sin(mπy)
// Nodal lines where |Z|≈0 become the dark Chladni lines
function buildPattern(m: number, n: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(SZ * SZ) as Float32Array<ArrayBuffer>;
  let max = 0;
  for (let py = 0; py < SZ; py++) {
    const y = py / (SZ - 1);
    for (let px = 0; px < SZ; px++) {
      const x = px / (SZ - 1);
      const v = Math.abs(
        Math.sin(m * Math.PI * x) * Math.sin(n * Math.PI * y) +
        Math.sin(n * Math.PI * x) * Math.sin(m * Math.PI * y),
      );
      data[py * SZ + px] = v;
      if (v > max) max = v;
    }
  }
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] /= max;
  return data;
}

// Map audio dominant frequency to nearest Chladni eigenmode
function findMode(hz: number): CMode {
  const baseE = calcEigen(1, 1);
  let best = MODES[0];
  let bestDist = Infinity;
  for (const mode of MODES) {
    const modeHz = BASE_HZ * calcEigen(mode.m, mode.n) / baseE;
    const dist = Math.abs(Math.log(Math.max(hz, 1) / modeHz));
    if (dist < bestDist) { bestDist = dist; best = mode; }
  }
  return best;
}

// Band energies from float frequency data (dBFS → linear power)
function calcBandEnergies(freqBuf: Float32Array<ArrayBuffer>, sampleRate: number): number[] {
  const fftSize = freqBuf.length * 2;
  return BAND_RANGES.map(([lo, hi]) => {
    let sum = 0;
    let cnt = 0;
    for (let b = 1; b < freqBuf.length; b++) {
      const f = (b / fftSize) * sampleRate;
      if (f >= lo && f < hi) {
        const lin = Math.pow(10, freqBuf[b] / 20);
        sum += lin * lin;
        cnt++;
      }
    }
    return cnt ? Math.min(Math.sqrt(sum / cnt) * 5, 1) : 0;
  });
}

// Find peak frequency bin (for mode selection)
function findPeakHz(byteBuf: Uint8Array<ArrayBuffer>, sampleRate: number): number {
  const fftSize = byteBuf.length * 2;
  let max = 0;
  let peak = 4;
  for (let i = 4; i < byteBuf.length; i++) {
    if (byteBuf[i] > max) { max = byteBuf[i]; peak = i; }
  }
  return (peak / fftSize) * sampleRate;
}

// Paint Chladni pattern into ImageData and flush to canvas
function paintChladni(
  ctx2d: CanvasRenderingContext2D,
  imageData: ImageData,
  pattern: Float32Array<ArrayBuffer>,
  bandEnergies: number[],
  amplitude: number,
) {
  let maxE = 0;
  let dominantBand = 2;
  for (let b = 0; b < bandEnergies.length; b++) {
    if (bandEnergies[b] > maxE) { maxE = bandEnergies[b]; dominantBand = b; }
  }
  const [cr, cg, cb] = BAND_RGB[dominantBand];
  const amp = Math.min(amplitude * 3.5, 1.0);
  const d = imageData.data;
  for (let i = 0; i < pattern.length; i++) {
    const mag = pattern[i];
    const brightness = mag * mag * amp; // squared = sharper nodal lines
    const idx = i * 4;
    d[idx]     = Math.round(cr * brightness);
    d[idx + 1] = Math.round(cg * brightness);
    d[idx + 2] = Math.round(cb * brightness);
    d[idx + 3] = 255;
  }
  ctx2d.putImageData(imageData, 0, 0);
}

// ── mutable animation state (kept outside React render cycle) ─────────────

type AnimState = {
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  freqBuf: Float32Array<ArrayBuffer> | null;
  byteBuf: Uint8Array<ArrayBuffer> | null;
  imageData: ImageData | null;
  pattern: Float32Array<ArrayBuffer>;
  modeKey: string;
  lastModeChange: number;
  raf: number;
  demoStart: number;
  demoIdx: number;
  osc: OscillatorNode | null;
  source: MediaElementAudioSourceNode | null;
};

// ── component ─────────────────────────────────────────────────────────────

export default function CymaticsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef  = useRef<HTMLAudioElement>(null);

  const animRef = useRef<AnimState>({
    ctx: null, analyser: null, freqBuf: null, byteBuf: null,
    imageData: null, pattern: buildPattern(1, 1), modeKey: "1,1",
    lastModeChange: 0, raf: 0, demoStart: 0, demoIdx: 0,
    osc: null, source: null,
  });

  const [uiMode, setUiMode] = useState<"idle" | "demo" | "live">("idle");
  const [currentMode, setCurrentMode] = useState<CMode>({ m: 1, n: 1 });
  const [currentHz, setCurrentHz] = useState(0);
  const [recordingId, setRecordingId] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Paint the initial static mode (1,1) pattern on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const imageData = ctx2d.createImageData(SZ, SZ);
    animRef.current.imageData = imageData;
    paintChladni(ctx2d, imageData, animRef.current.pattern, [0, 0, 0.35, 0, 0, 0], 0.45);
  }, []);

  const stopAll = useCallback(() => {
    const s = animRef.current;
    cancelAnimationFrame(s.raf);
    try { s.osc?.stop(); } catch { /* already stopped */ }
    s.osc?.disconnect();
    s.osc = null;
    s.source?.disconnect();
    s.source = null;
    s.analyser?.disconnect();
    s.analyser = null;
    if (s.ctx && s.ctx.state !== "closed") s.ctx.close();
    s.ctx = null;
    audioRef.current?.pause();
    setUiMode("idle");
  }, []);

  const startLoop = useCallback(
    (analyser: AnalyserNode, sampleRate: number, isDemo: boolean) => {
      const s = animRef.current;
      const binCount = analyser.frequencyBinCount;
      s.freqBuf = new Float32Array(binCount) as Float32Array<ArrayBuffer>;
      s.byteBuf = new Uint8Array(binCount) as Uint8Array<ArrayBuffer>;
      let lastReactUpdate = 0;

      const tick = () => {
        s.raf = requestAnimationFrame(tick);
        if (!s.analyser || !s.ctx || !s.freqBuf || !s.byteBuf || !s.imageData) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return;

        // Demo: advance oscillator frequency through modes on schedule
        if (isDemo && s.osc) {
          const elapsed = s.ctx.currentTime - s.demoStart;
          const idx = Math.floor(elapsed / DEMO_SECS_PER_MODE) % MODES.length;
          if (idx !== s.demoIdx) {
            s.demoIdx = idx;
            const dm = MODES[idx];
            const targetHz = BASE_HZ * calcEigen(dm.m, dm.n) / calcEigen(1, 1);
            s.osc.frequency.linearRampToValueAtTime(targetHz, s.ctx.currentTime + 2.0);
          }
        }

        s.analyser.getFloatFrequencyData(s.freqBuf);
        s.analyser.getByteFrequencyData(s.byteBuf);

        // Amplitude: max byte bin / 255
        let maxBin = 0;
        for (let i = 0; i < s.byteBuf.length; i++) {
          if (s.byteBuf[i] > maxBin) maxBin = s.byteBuf[i];
        }
        const amplitude = maxBin / 255;

        // Dominant Hz → Chladni mode (with 1-second cooldown to avoid jitter)
        const hz = findPeakHz(s.byteBuf, sampleRate);
        const picked = findMode(hz);
        const key = `${picked.m},${picked.n}`;
        const now = performance.now();
        if (key !== s.modeKey && now - s.lastModeChange > 1000) {
          s.modeKey = key;
          s.pattern = buildPattern(picked.m, picked.n);
          s.lastModeChange = now;
        }

        const bandEnergies = calcBandEnergies(s.freqBuf, sampleRate);
        paintChladni(ctx2d, s.imageData, s.pattern, bandEnergies, amplitude);

        // Throttle React state updates to 4Hz
        if (now - lastReactUpdate > 250) {
          lastReactUpdate = now;
          setCurrentMode(picked);
          setCurrentHz(Math.round(hz));
        }
      };
      tick();
    },
    [],
  );

  const startDemo = useCallback(() => {
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = BASE_HZ;

    // osc → analyser (full amplitude for analysis) → soft gain → speakers
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.07;
    osc.connect(analyser);
    analyser.connect(masterGain);
    masterGain.connect(ctx.destination);
    osc.start();

    const s = animRef.current;
    s.ctx = ctx;
    s.analyser = analyser;
    s.osc = osc;
    s.demoStart = ctx.currentTime;
    s.demoIdx = 0;
    s.lastModeChange = 0;

    setUiMode("demo");
    startLoop(analyser, ctx.sampleRate, true);
  }, [stopAll, startLoop]);

  const loadRecordingUrl = useCallback(async () => {
    const id = recordingId.trim();
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url: string };
      setAudioUrl(data.url);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  const startLive = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const s = animRef.current;
    s.ctx = ctx;
    s.analyser = analyser;
    s.source = source;
    s.lastModeChange = 0;

    setUiMode("live");
    audio.play().catch(() => null);
    startLoop(analyser, ctx.sampleRate, false);
  }, [audioUrl, stopAll, startLoop]);

  useEffect(() => {
    if (audioUrl && audioRef.current) audioRef.current.src = audioUrl;
  }, [audioUrl]);

  useEffect(() => () => stopAll(), [stopAll]);

  const modeLabel = `(${currentMode.m},${currentMode.n})`;

  return (
    <div className="min-h-screen bg-[#04040c] text-white flex flex-col">
      {/* Canvas */}
      <div className="flex justify-center px-4 pt-5">
        <div className="relative w-full max-w-[480px]">
          <canvas
            ref={canvasRef}
            width={SZ}
            height={SZ}
            className="w-full aspect-square block rounded-2xl"
            style={{ imageRendering: "pixelated" }}
          />
          {/* mode overlay */}
          {uiMode !== "idle" && (
            <div className="absolute bottom-3 left-3 font-mono text-xs text-white/55 bg-black/30 px-2 py-1 rounded">
              mode {modeLabel} · {currentHz} Hz
            </div>
          )}
          {uiMode === "demo" && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-xs text-white/55">demo</span>
            </div>
          )}
          {uiMode === "live" && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white/55">live</span>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-start justify-between max-w-lg mx-auto w-full">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cymatics</h1>
          <p className="text-base text-white/75 mt-1">
            Chladni plate patterns from sound — each frequency resonates a unique standing-wave shape
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/40 hover:text-white/70 transition-colors ml-4 mt-1 shrink-0"
        >
          ← dreams
        </Link>
      </div>

      {/* Controls */}
      <div className="px-5 pb-10 space-y-4 max-w-lg mx-auto w-full">
        <button
          onClick={uiMode === "demo" ? stopAll : startDemo}
          className="w-full py-3 rounded-xl font-medium text-base transition-colors"
          style={{
            background: uiMode === "demo" ? "#1e1040" : "#3b1fa8",
            color: "white",
            minHeight: 44,
          }}
        >
          {uiMode === "demo" ? "■  Stop demo" : "▶  Demo — sweep through 25 modes"}
        </button>
        <p className="text-sm text-white/55 text-center -mt-2">
          Slowly cycles through resonant modes (1,1) → (5,5) · watch patterns transform
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-sm text-white/40">or use Karel&apos;s recordings</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-white/75">Recording ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={recordingId}
              onChange={(e) => setRecordingId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRecordingUrl()}
              placeholder="paste a recording UUID…"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-base text-white placeholder-white/25 focus:outline-none focus:border-white/40"
              style={{ minHeight: 44 }}
            />
            <button
              onClick={loadRecordingUrl}
              disabled={loading || !recordingId.trim()}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "#1a3a5c", color: "white", minHeight: 44 }}
            >
              {loading ? "…" : "Load"}
            </button>
          </div>
          {loadError && <p className="text-sm text-rose-300">{loadError}</p>}
          {audioUrl && !loadError && (
            <p className="text-sm text-emerald-300/95">Recording loaded ✓</p>
          )}
        </div>

        {audioUrl && (
          <div>
            <audio ref={audioRef} crossOrigin="anonymous" className="hidden" />
            <button
              onClick={uiMode === "live" ? stopAll : startLive}
              className="w-full py-3 rounded-xl font-medium text-base transition-colors"
              style={{
                background: uiMode === "live" ? "#0e2e14" : "#145c24",
                color: "white",
                minHeight: 44,
              }}
            >
              {uiMode === "live" ? "■  Stop" : "▶  Visualize recording"}
            </button>
          </div>
        )}

        <p className="text-sm text-white/55 leading-relaxed">
          Chladni figures are the standing-wave node patterns on a vibrating plate — literally what
          gives Resonance its name. Each frequency excites a distinct mode; as pitch rises the
          patterns grow more intricate. The symmetry you see is physical law.
        </p>

        <p className="text-xs text-white/30">
          <Link
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/165-cymatics/README.md"
            target="_blank"
            className="underline underline-offset-2 hover:text-white/50"
          >
            design notes
          </Link>
        </p>
      </div>
    </div>
  );
}
