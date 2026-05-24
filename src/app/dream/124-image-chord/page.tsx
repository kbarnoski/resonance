"use client";

import { useEffect, useRef, useState } from "react";

// ─── constants ────────────────────────────────────────────────────────────────

const BAND_COLORS: [number, number, number][] = [
  [88, 32, 192],   // sub-bass — violet
  [32, 168, 220],  // bass — cyan
  [80, 220, 100],  // low-mid — green
  [240, 220, 70],  // mid — yellow
  [255, 150, 40],  // high-mid — orange
  [255, 60, 120],  // high — magenta
];

const BAND_HZ = [
  [20, 60], [60, 250], [250, 500],
  [500, 2000], [2000, 4000], [4000, 20000],
] as const;

// Journey-theme palette swatches — precomputed HSL from hex colors
const SWATCHES = [
  { name: "Cosmic",    hex: "#2d0f5e", h: 267, s: 0.72, l: 0.21 },
  { name: "Earth",     hex: "#78350f", h: 22,  s: 0.78, l: 0.26 },
  { name: "Sanctuary", hex: "#14532d", h: 148, s: 0.61, l: 0.20 },
  { name: "Ocean",     hex: "#0c4a6e", h: 205, s: 0.80, l: 0.24 },
  { name: "Snowflake", hex: "#dde6ff", h: 226, s: 1.00, l: 0.93 },
  { name: "Ghost",     hex: "#374151", h: 213, s: 0.19, l: 0.27 },
  { name: "Fire",      hex: "#92400e", h: 24,  s: 0.82, l: 0.31 },
  { name: "Mycelium",  hex: "#1a3a1a", h: 121, s: 0.38, l: 0.16 },
] as const;

// Chord quality: [semitone intervals from C, display label]
// Hue ranges 0–360 divided into 6 × 60° slots:
//   0–60  warm reds/oranges → major
//   60–120 yellows/limes   → dominant 7th
//   120–180 greens         → minor
//   180–240 cyans/blues    → minor 7th
//   240–300 blue/violets   → major 7th
//   300–360 magenta/purple → diminished
const QUALITIES = [
  { semis: [0, 4, 7],     label: ""    },  // major
  { semis: [0, 4, 7, 10], label: "7"   },  // dominant 7th
  { semis: [0, 3, 7],     label: "m"   },  // minor
  { semis: [0, 3, 7, 10], label: "m7"  },  // minor 7th
  { semis: [0, 4, 7, 11], label: "maj7"},  // major 7th
  { semis: [0, 3, 6],     label: "dim" },  // diminished
] as const;

// ─── helper functions (no "use" prefix) ──────────────────────────────────────

function convertToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = 0;
  if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (mx === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function extractDominantHSL(src: string): Promise<{ h: number; s: number; l: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const cx = c.getContext("2d");
      if (!cx) { reject(new Error("canvas2d unavailable")); return; }
      cx.drawImage(img, 0, 0, size, size);
      const px = cx.getImageData(0, 0, size, size).data;
      // 36-bin hue histogram, weighted by saturation
      const bins = new Float64Array(36);
      let totalS = 0, totalL = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 64) continue; // skip near-transparent pixels
        const [hDeg, sat, lit] = convertToHsl(px[i], px[i + 1], px[i + 2]);
        const weight = 0.15 + sat * 0.85; // saturated pixels contribute more to hue
        bins[Math.floor(hDeg / 10) % 36] += weight;
        totalS += sat;
        totalL += lit;
        n++;
      }
      let peakVal = 0, peakBin = 0;
      for (let i = 0; i < 36; i++) if (bins[i] > peakVal) { peakVal = bins[i]; peakBin = i; }
      resolve({
        h: peakBin * 10 + 5,
        s: n > 0 ? totalS / n : 0.5,
        l: n > 0 ? totalL / n : 0.5,
      });
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function buildChord(h: number, s: number, l: number) {
  const qi = Math.min(5, Math.floor(h / 60));
  const q = QUALITIES[qi];
  // Root pitch and arpeggio tempo from brightness
  const rootHz = l < 0.3 ? 65.41 : l < 0.5 ? 130.81 : l < 0.7 ? 261.63 : 523.25;
  const bpm    = l < 0.3 ? 35    : l < 0.5 ? 55     : l < 0.7 ? 75     : 120;
  // Harmonic richness from saturation: desaturated = pure sine, vivid = 4 harmonics + detuning
  const voices = s < 0.2 ? 1 : s < 0.5 ? 2 : s < 0.7 ? 3 : 4;
  const freqs = q.semis.map((semi) => rootHz * Math.pow(2, semi / 12));
  const name = `C${q.label}`;
  return { freqs, bpm, voices, name };
}

function startArpeggio(
  actx: AudioContext,
  analyser: AnalyserNode,
  freqs: number[],
  bpm: number,
  voices: number,
): () => void {
  const beat = 60 / bpm;
  const noteLen = beat * 0.80;
  let idx = 0;
  let nextBeat = actx.currentTime + 0.05;

  const schedule = () => {
    while (nextBeat < actx.currentTime + 0.40) {
      const freq = freqs[idx % freqs.length];
      idx++;
      for (let v = 0; v < voices; v++) {
        const osc = actx.createOscillator();
        const g = actx.createGain();
        osc.type = voices === 1 ? "sine" : "triangle";
        osc.frequency.value = freq;
        if (v > 0) osc.detune.value = (v % 2 === 1 ? 1 : -1) * v * 6;
        const vol = 0.14 / voices;
        g.gain.setValueAtTime(0, nextBeat);
        g.gain.linearRampToValueAtTime(vol, nextBeat + 0.022);
        g.gain.setValueAtTime(vol * 0.82, nextBeat + noteLen * 0.68);
        g.gain.linearRampToValueAtTime(0, nextBeat + noteLen);
        osc.connect(g);
        g.connect(analyser);
        osc.start(nextBeat);
        osc.stop(nextBeat + noteLen + 0.02);
        osc.onended = () => { osc.disconnect(); g.disconnect(); };
      }
      nextBeat += beat;
    }
  };

  const timerId = window.setInterval(schedule, 100);
  schedule();
  return () => window.clearInterval(timerId);
}

function renderBloom(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  fbuf: Uint8Array<ArrayBuffer>,
  w: number,
  h: number,
) {
  analyser.getByteFrequencyData(fbuf);
  const nyquist = analyser.context.sampleRate / 2;
  const bins = fbuf.length;

  const energies = BAND_HZ.map(([lo, hi]) => {
    const loI = Math.round((lo / nyquist) * bins);
    const hiI = Math.round((hi / nyquist) * bins);
    let sum = 0;
    for (let i = loI; i < Math.min(hiI, bins); i++) sum += fbuf[i];
    return sum / Math.max(1, hiI - loI) / 255;
  });

  // Soft background fade — preserves bloom trails
  ctx.fillStyle = "rgba(3, 0, 8, 0.16)";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const baseR = Math.min(w, h) * 0.06;
  const maxR  = Math.min(w, h) * 0.44;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let b = 0; b < 6; b++) {
    const energy = Math.min(1, energies[b] * 3.0);
    if (energy < 0.008) continue;
    const radius = baseR + (maxR - baseR) * energy;
    const [cr, cg, cb] = BAND_COLORS[b];
    const angle = (b / 6) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius * 0.30;
    const py = cy + Math.sin(angle) * radius * 0.30;

    const grd = ctx.createRadialGradient(cx, cy, 0, px, py, radius);
    grd.addColorStop(0,    `rgba(${cr},${cg},${cb},${energy * 0.88})`);
    grd.addColorStop(0.50, `rgba(${cr},${cg},${cb},${energy * 0.28})`);
    grd.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  ctx.restore();
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ImageChord() {
  const [chordName, setChordName] = useState("—");
  const [analysis, setAnalysis] = useState<{ h: number; s: number; l: number } | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actxRef      = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const fbufRef      = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const cleanupRef   = useRef<(() => void) | null>(null);
  const animRef      = useRef(0);

  // Bloom animation loop — runs for the lifetime of the component
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0, ch = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.offsetWidth;
      ch = canvas.offsetHeight;
      canvas.width  = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width  = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      if (analyserRef.current && fbufRef.current) {
        renderBloom(ctx, analyserRef.current, fbufRef.current, cw, ch);
      } else {
        ctx.fillStyle = "rgb(3, 0, 8)";
        ctx.fillRect(0, 0, cw, ch);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Teardown audio on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      actxRef.current?.close();
    };
  }, []);

  // Apply HSL values: build chord, restart arpeggio, update UI
  const applyHSL = (h: number, s: number, l: number, src?: string) => {
    setAnalysis({ h, s, l });
    if (src !== undefined) setImgSrc(src);

    // Create AudioContext lazily (requires user gesture)
    if (!actxRef.current) {
      actxRef.current = new AudioContext();
    }
    const actx = actxRef.current;
    if (actx.state === "suspended") actx.resume();

    // Create analyser once
    if (!analyserRef.current) {
      const an = actx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.82;
      an.connect(actx.destination);
      analyserRef.current = an;
      fbufRef.current = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
    }

    // Stop previous arpeggio
    cleanupRef.current?.();

    // Build and schedule new arpeggio
    const chord = buildChord(h, s, l);
    setChordName(chord.name);
    cleanupRef.current = startArpeggio(actx, analyserRef.current, chord.freqs, chord.bpm, chord.voices);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const src = ev.target?.result as string;
      try {
        const { h, s, l } = await extractDominantHSL(src);
        applyHSL(h, s, l, src);
      } catch (_err) {
        // Silently ignore extraction errors
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const src = ev.target?.result as string;
      try {
        const { h, s, l } = await extractDominantHSL(src);
        applyHSL(h, s, l, src);
      } catch (_err) {
        // Silently ignore extraction errors
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const handleSwatchClick = (sw: (typeof SWATCHES)[number]) => {
    setImgSrc(null);
    applyHSL(sw.h, sw.s, sw.l);
  };

  return (
    <div className="min-h-screen bg-[#030008] flex flex-col text-white select-none">
      {/* ── header ── */}
      <div className="px-5 pt-5 pb-2 shrink-0">
        <h1 className="text-2xl font-mono text-white/95 tracking-tight">Image Chord</h1>
        <p className="text-base text-white/75 mt-1">
          Drop a photo — its palette becomes music.
        </p>
      </div>

      {/* ── image drop zone ── */}
      <div className="px-4 pb-3 shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop an image or tap to choose"
          className={`rounded-xl border-2 border-dashed transition-colors duration-150 min-h-[120px] flex items-center justify-center overflow-hidden cursor-pointer ${
            isDragging
              ? "border-violet-400/80 bg-violet-500/10"
              : "border-white/20 hover:border-white/35"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="Analyzed"
              className="max-h-[108px] max-w-full object-contain rounded-lg"
            />
          ) : (
            <span className="text-white/40 text-base font-mono px-6 text-center leading-relaxed">
              {isDragging ? "Release to analyze" : "Drop an image or tap to choose"}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── journey palette swatches ── */}
      <div className="px-4 pb-3 shrink-0">
        <p className="text-xs font-mono text-white/45 mb-2 tracking-wide">Journey palettes</p>
        <div className="grid grid-cols-4 gap-1.5">
          {SWATCHES.map((sw) => (
            <button
              key={sw.name}
              onClick={() => handleSwatchClick(sw)}
              style={{ backgroundColor: sw.hex }}
              className={`min-h-[44px] rounded-lg text-xs font-mono transition-opacity hover:opacity-85 active:opacity-70 ${
                sw.l > 0.65 ? "text-gray-900/80" : "text-white/80"
              }`}
            >
              {sw.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── bloom canvas + chord overlay ── */}
      <div className="flex-1 relative min-h-[200px]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Chord name + analysis readout — centered overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
          <span
            className="text-5xl font-mono text-white/95 tracking-tight"
            style={{ textShadow: "0 0 16px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,1)" }}
          >
            {chordName}
          </span>
          {analysis ? (
            <span
              className="text-xs font-mono text-white/55"
              style={{ textShadow: "0 0 8px rgba(0,0,0,1)" }}
            >
              H {Math.round(analysis.h)}° · S {Math.round(analysis.s * 100)}% · L {Math.round(analysis.l * 100)}%
            </span>
          ) : (
            <span
              className="text-sm font-mono text-white/35"
              style={{ textShadow: "0 0 8px rgba(0,0,0,1)" }}
            >
              tap a swatch or drop a photo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
