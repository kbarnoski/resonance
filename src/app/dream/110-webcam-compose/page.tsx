"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// --- Constants ---

const CHORD_INTERVALS: Record<string, number[]> = {
  major:      [0, 4, 7],
  minor:      [0, 3, 7],
  suspended:  [0, 5, 7],
  diminished: [0, 3, 6],
  augmented:  [0, 4, 8],
};

const CHORD_COLORS: Record<string, string> = {
  major:      "#fbbf24", // amber — warm, open
  minor:      "#60a5fa", // blue — cool, introspective
  suspended:  "#34d399", // emerald — floating, unresolved
  diminished: "#a78bfa", // violet — tense, mysterious
  augmented:  "#fb7185", // rose — surreal, unstable
};

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88,  32,  192],
  [32,  168, 220],
  [80,  220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60,  120],
];

// Incommensurable LFO speeds for demo mode
const DEMO_LFO_SPEEDS = [0.09, 0.14, 0.21] as const;

// --- Audio helpers ---

function semisToHz(semis: number, rootHz: number): number {
  return rootHz * Math.pow(2, semis / 12);
}

function brightnessToRootHz(brightness: number): number {
  // Dark = C2 (65.41 Hz), bright = C4 (261.63 Hz)
  const clamp = Math.max(0, Math.min(1, brightness));
  return 65.41 * Math.pow(261.63 / 65.41, clamp);
}

// --- Image analysis helpers ---

function sampleZoneRgb(
  data: Uint8ClampedArray,
  imgW: number,
  x0: number, y0: number,
  zw: number, zh: number,
): [number, number, number] {
  const step = Math.max(4, Math.floor(Math.min(zw, zh) / 16));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y0 + zh; y += step) {
    for (let x = x0; x < x0 + zw; x += step) {
      const i = (y * imgW + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      n++;
    }
  }
  if (!n) return [0, 0, 0];
  return [r / n, g / n, b / n];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hueToChord(hue: number): string {
  if (hue <  60) return "major";
  if (hue < 120) return "suspended";
  if (hue < 200) return "minor";
  if (hue < 280) return "diminished";
  return "augmented";
}

// --- Synth types & management ---

type OscVoice = { osc: OscillatorNode; gain: GainNode };

type SynthState = {
  voices: OscVoice[];
  master: GainNode;
  analyser: AnalyserNode;
  ctx: AudioContext;
};

function buildSynth(
  ctx: AudioContext,
  chordName: string,
  rootHz: number,
  numVoices: number,
): SynthState {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.6);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  master.connect(analyser);
  analyser.connect(ctx.destination);

  const intervals = CHORD_INTERVALS[chordName] ?? [0, 4, 7];
  const tones = Math.min(intervals.length, 3);
  const voiceGain = 0.38 / (tones * numVoices);
  const voices: OscVoice[] = [];

  for (let i = 0; i < tones; i++) {
    for (let v = 0; v < numVoices; v++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(semisToHz(intervals[i], rootHz), ctx.currentTime);
      const detune = v === 0 ? 0 : v % 2 === 1 ? 5 * Math.ceil(v / 2) : -5 * Math.ceil(v / 2);
      osc.detune.setValueAtTime(detune, ctx.currentTime);

      const g = ctx.createGain();
      g.gain.setValueAtTime(voiceGain, ctx.currentTime);
      osc.connect(g);
      g.connect(master);
      osc.start();
      voices.push({ osc, gain: g });
    }
  }

  return { voices, master, analyser, ctx };
}

function updateSynthFreqs(synth: SynthState, chordName: string, rootHz: number) {
  const intervals = CHORD_INTERVALS[chordName] ?? [0, 4, 7];
  const now = synth.ctx.currentTime;
  const tones = Math.min(intervals.length, 3);
  const vpTone = Math.max(1, Math.floor(synth.voices.length / tones));

  for (let i = 0; i < tones; i++) {
    const targetHz = semisToHz(intervals[i], rootHz);
    for (let v = 0; v < vpTone; v++) {
      const idx = i * vpTone + v;
      if (idx < synth.voices.length) {
        synth.voices[idx].osc.frequency.setTargetAtTime(targetHz, now, 0.25);
      }
    }
  }
}

function teardownSynth(synth: SynthState) {
  const now = synth.ctx.currentTime;
  synth.master.gain.setValueAtTime(synth.master.gain.value, now);
  synth.master.gain.linearRampToValueAtTime(0, now + 0.35);
  setTimeout(() => {
    synth.voices.forEach(({ osc }) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
  }, 450);
}

// --- Visual state ---

type VisInfo = {
  chordName: string;
  rootHz: number;
  numVoices: number;
  isArpeggio: boolean;
  frameDelta: number;
  zoneColors: [string, string, string, string];
  dominantHue: number;
};

const DEFAULT_VIS: VisInfo = {
  chordName: "major",
  rootHz: 130.81,
  numVoices: 2,
  isArpeggio: false,
  frameDelta: 0,
  zoneColors: ["#555", "#555", "#555", "#555"],
  dominantHue: 30,
};

// --- Component ---

export default function WebcamCompose() {
  const [phase, setPhase] = useState<"idle" | "running" | "demo" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [vis, setVis] = useState<VisInfo>(DEFAULT_VIS);
  const visRef = useRef<VisInfo>(DEFAULT_VIS);

  const videoRef    = useRef<HTMLVideoElement | null>(null);
  const camRef      = useRef<HTMLCanvasElement | null>(null);
  const bloomRef    = useRef<HTMLCanvasElement | null>(null);
  const offRef      = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthRef    = useRef<SynthState | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLumRef  = useRef(0.5);
  const demoTRef    = useRef(0);

  // Keep visRef in sync for read-only use inside RAF loops
  useEffect(() => { visRef.current = vis; }, [vis]);

  async function openCamera() {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      synthRef.current = buildSynth(ctx, "major", 130.81, 2);
      setPhase("running");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Camera unavailable");
      setPhase("error");
    }
  }

  function openDemo() {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    synthRef.current = buildSynth(ctx, "major", 130.81, 2);
    demoTRef.current = 0;
    setPhase("demo");
  }

  function closeAll() {
    if (analysisRef.current) { clearInterval(analysisRef.current); analysisRef.current = null; }
    if (demoRef.current)     { clearInterval(demoRef.current);     demoRef.current = null; }
    if (synthRef.current)    { teardownSynth(synthRef.current);    synthRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close();        audioCtxRef.current = null; }
    setPhase("idle");
  }

  // --- Camera analysis loop ---
  useEffect(() => {
    if (phase !== "running") return;
    const video = videoRef.current!;
    if (!offRef.current) offRef.current = document.createElement("canvas");
    const off    = offRef.current;
    const offCtx = off.getContext("2d", { willReadFrequently: true })!;

    function analyze() {
      if (video.readyState < 2) return;
      const vw = video.videoWidth  || 320;
      const vh = video.videoHeight || 240;
      off.width = vw; off.height = vh;

      offCtx.save();
      offCtx.scale(-1, 1);
      offCtx.drawImage(video, -vw, 0, vw, vh);
      offCtx.restore();

      const d  = offCtx.getImageData(0, 0, vw, vh);
      const hw = Math.floor(vw / 2);
      const hh = Math.floor(vh / 2);

      const zoneRgb: [number, number, number][] = [
        sampleZoneRgb(d.data, vw,  0,  0, hw, hh),
        sampleZoneRgb(d.data, vw, hw,  0, hw, hh),
        sampleZoneRgb(d.data, vw,  0, hh, hw, hh),
        sampleZoneRgb(d.data, vw, hw, hh, hw, hh),
      ];
      const hslZ = zoneRgb.map(([r, g, b]) => rgbToHsl(r, g, b));

      const avgHue = hslZ.reduce((s, [h]) => s + h, 0) / 4;
      const avgLum = hslZ.reduce((s, [, , l]) => s + l, 0) / 4;
      const avgSat = hslZ.reduce((s, [, sat]) => s + sat, 0) / 4;
      const delta  = Math.abs(avgLum - prevLumRef.current);
      prevLumRef.current = avgLum * 0.6 + prevLumRef.current * 0.4;

      const chordName  = hueToChord(avgHue);
      const rootHz     = brightnessToRootHz(avgLum);
      const numVoices  = Math.max(1, Math.min(3, Math.round(avgSat * 3 + 0.5)));
      const isArpeggio = delta > 0.04;

      const fmt = (hsl: [number, number, number]) =>
        `hsl(${hsl[0].toFixed(0)},${(hsl[1] * 100).toFixed(0)}%,${(hsl[2] * 100).toFixed(0)}%)`;
      const zoneColors: [string, string, string, string] = [
        fmt(hslZ[0]), fmt(hslZ[1]), fmt(hslZ[2]), fmt(hslZ[3]),
      ];

      if (synthRef.current) updateSynthFreqs(synthRef.current, chordName, rootHz);

      const next: VisInfo = { chordName, rootHz, numVoices, isArpeggio, frameDelta: delta, zoneColors, dominantHue: avgHue };
      visRef.current = next;
      setVis(next);
    }

    analysisRef.current = setInterval(analyze, 150);
    return () => { if (analysisRef.current) clearInterval(analysisRef.current); };
  }, [phase]);

  // --- Demo LFO loop ---
  useEffect(() => {
    if (phase !== "demo") return;
    const chords = ["major", "minor", "suspended", "diminished", "augmented"];
    let ci = 0;

    demoRef.current = setInterval(() => {
      demoTRef.current += 0.15;
      const t   = demoTRef.current;
      const hue = (Math.sin(t * DEMO_LFO_SPEEDS[0] * Math.PI * 2) * 0.5 + 0.5) * 360;
      const lum = Math.sin(t * DEMO_LFO_SPEEDS[1] * Math.PI * 2) * 0.2 + 0.5;
      const sat = Math.sin(t * DEMO_LFO_SPEEDS[2] * Math.PI * 2) * 0.2 + 0.55;

      if (Math.floor(t / 6) !== Math.floor((t - 0.15) / 6)) {
        ci = (ci + 1) % chords.length;
      }

      const chordName = chords[ci];
      const rootHz    = brightnessToRootHz(lum);
      if (synthRef.current) updateSynthFreqs(synthRef.current, chordName, rootHz);

      const zoneColors: [string, string, string, string] = [
        `hsl(${hue.toFixed(0)},${(sat * 100).toFixed(0)}%,${(lum * 100).toFixed(0)}%)`,
        `hsl(${((hue + 90)  % 360).toFixed(0)},${(sat * 100).toFixed(0)}%,${(lum * 100).toFixed(0)}%)`,
        `hsl(${((hue + 180) % 360).toFixed(0)},${(sat * 100).toFixed(0)}%,${(lum * 100).toFixed(0)}%)`,
        `hsl(${((hue + 270) % 360).toFixed(0)},${(sat * 100).toFixed(0)}%,${(lum * 100).toFixed(0)}%)`,
      ];

      const next: VisInfo = { chordName, rootHz, numVoices: 2, isArpeggio: false, frameDelta: 0, zoneColors, dominantHue: hue };
      visRef.current = next;
      setVis(next);
    }, 150);

    return () => { if (demoRef.current) clearInterval(demoRef.current); };
  }, [phase]);

  // --- Camera canvas: draw mirrored video + zone borders ---
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = camRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let rafId = 0;
    function drawCam() {
      if (!canvas || !ctx2d || !video) return;
      if (video.readyState >= 2) {
        const w = canvas.width;
        const h = canvas.height;
        ctx2d.save();
        ctx2d.scale(-1, 1);
        ctx2d.drawImage(video, -w, 0, w, h);
        ctx2d.restore();

        const hw = w / 2, hh = h / 2;
        const colors = visRef.current.zoneColors;
        ([[0, 0], [hw, 0], [0, hh], [hw, hh]] as [number, number][]).forEach(([x, y], idx) => {
          ctx2d.strokeStyle = colors[idx] ?? "#fff";
          ctx2d.lineWidth = 2;
          ctx2d.strokeRect(x + 1, y + 1, hw - 2, hh - 2);
        });

        ctx2d.strokeStyle = "rgba(255,255,255,0.22)";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.moveTo(hw, 0); ctx2d.lineTo(hw, h);
        ctx2d.moveTo(0, hh); ctx2d.lineTo(w, hh);
        ctx2d.stroke();
      }
      rafId = requestAnimationFrame(drawCam);
    }
    rafId = requestAnimationFrame(drawCam);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  // --- Bloom canvas: synth AnalyserNode → radial rings ---
  useEffect(() => {
    if (phase !== "running" && phase !== "demo") return;
    const canvas = bloomRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      w = rect.width  || 400;
      h = rect.height || 400;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx2d!.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    const fftData = new Uint8Array(128);
    let rafId = 0;

    function drawBloom() {
      const analyser = synthRef.current?.analyser;
      if (!analyser) { rafId = requestAnimationFrame(drawBloom); return; }

      analyser.getByteFrequencyData(fftData);

      ctx2d!.fillStyle = "rgba(0,0,0,0.2)";
      ctx2d!.fillRect(0, 0, w, h);

      const cx   = w / 2;
      const cy   = h / 2;
      const maxR = Math.min(w, h) * 0.46;
      const len  = fftData.length;

      // Map fft bins to 6 perceptual bands
      const splits = [
        0,
        Math.max(1, Math.floor(len * 0.02)),
        Math.max(2, Math.floor(len * 0.06)),
        Math.max(3, Math.floor(len * 0.13)),
        Math.max(4, Math.floor(len * 0.27)),
        Math.max(5, Math.floor(len * 0.52)),
        len,
      ];
      const bands: number[] = [];
      for (let bi = 0; bi < 6; bi++) {
        let sum = 0;
        const lo = splits[bi], hi = splits[bi + 1];
        for (let k = lo; k < hi; k++) sum += fftData[k];
        bands.push(sum / (255 * Math.max(1, hi - lo)));
      }

      ctx2d!.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const e = bands[i];
        if (e < 0.01) continue;
        const ro = maxR * (1 - i / 6);
        const ri = maxR * (1 - (i + 1) / 6);
        const col = BAND_COLORS[i];
        if (!col) continue;
        const [cr, cg, cb] = col;
        const alpha = Math.min(0.95, 0.15 + e * 1.5);
        const grad = ctx2d!.createRadialGradient(
          cx, cy, ri * (0.6 + 0.4 * e),
          cx, cy, ro * (1 + 0.15 * e),
        );
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx2d!.fillStyle = grad;
        ctx2d!.beginPath();
        ctx2d!.arc(cx, cy, ro * (1 + 0.15 * e), 0, Math.PI * 2);
        ctx2d!.fill();
      }
      ctx2d!.globalCompositeOperation = "source-over";

      rafId = requestAnimationFrame(drawBloom);
    }
    rafId = requestAnimationFrame(drawBloom);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analysisRef.current) clearInterval(analysisRef.current);
      if (demoRef.current)     clearInterval(demoRef.current);
      if (synthRef.current)    teardownSynth(synthRef.current);
      if (streamRef.current)   streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const isActive = phase === "running" || phase === "demo";
  const chordColor = CHORD_COLORS[vis.chordName] ?? "#ffffff";

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)", background: "#06060f" }}
    >
      {/* Hidden video element for camera stream */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* ── Idle / Error ── */}
      {(phase === "idle" || phase === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-5">
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-white/95">
            Webcam Compose
          </h1>
          <p className="text-base text-white/75 max-w-sm leading-relaxed">
            Point your camera at anything — colors become chords. Warm reds play major,
            cool blues play minor, motion adds arpeggios.
          </p>
          <p className="text-sm text-white/55 max-w-xs">
            No mic · No API · No ML — image pixels → synthesizer, directly.
          </p>

          {phase === "error" && (
            <p className="text-rose-300 text-sm">Camera error: {errorMsg}</p>
          )}

          <div className="flex gap-3 flex-wrap justify-center mt-1">
            <button
              onClick={openCamera}
              className="px-6 py-3 text-base bg-violet-600 hover:bg-violet-500 text-white rounded-xl min-h-[48px] font-medium transition"
            >
              Open camera
            </button>
            <button
              onClick={openDemo}
              className="px-6 py-3 text-base border border-white/25 hover:border-white/50 text-white/80 hover:text-white rounded-xl min-h-[48px] transition"
            >
              Demo mode
            </button>
          </div>

          <Link href="/dream" className="mt-8 text-xs text-white/30 hover:text-white/60">
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* ── Active: split view ── */}
      {isActive && (
        <div className="absolute inset-0 flex flex-col sm:flex-row">

          {/* LEFT — camera feed or demo quadrants */}
          <div className="relative flex-1 bg-black min-h-0">
            {phase === "running" ? (
              <canvas
                ref={camRef}
                className="absolute inset-0 w-full h-full"
                width={640}
                height={480}
              />
            ) : (
              /* Demo: animated colored quadrants */
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                {vis.zoneColors.map((color, i) => (
                  <div
                    key={i}
                    style={{ background: color, opacity: 0.28, transition: "background 250ms" }}
                  />
                ))}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-white/20 text-xs tracking-widest uppercase">demo mode</span>
                </div>
                {/* Crosshair */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10" />
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
                </div>
              </div>
            )}

            {/* Zone corner arrows */}
            {(["↖", "↗", "↙", "↘"] as const).map((arrow, i) => (
              <div
                key={i}
                className="absolute text-[10px] text-white/35 pointer-events-none leading-none select-none"
                style={{
                  top:  i < 2 ? 7 : "calc(50% + 7px)",
                  left: i % 2 === 0 ? 7 : "calc(50% + 7px)",
                }}
              >
                {arrow}
              </div>
            ))}

            {/* Chord info bar */}
            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
              <div className="flex items-end justify-between">
                <div>
                  <div
                    className="text-2xl font-light capitalize tracking-wide leading-tight"
                    style={{ color: chordColor }}
                  >
                    {vis.chordName}
                  </div>
                  <div className="text-xs text-white/55 mt-0.5">
                    {vis.rootHz.toFixed(0)} Hz ·{" "}
                    {vis.numVoices} voice{vis.numVoices !== 1 ? "s" : ""} ·{" "}
                    {vis.isArpeggio ? "arpeggiated" : "pad"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-white/40 leading-snug">
                  <div>hue {vis.dominantHue.toFixed(0)}°</div>
                  <div>Δ {(vis.frameDelta * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — bloom visualizer (synth output) */}
          <div className="relative flex-1 bg-black min-h-0">
            <canvas ref={bloomRef} className="absolute inset-0 w-full h-full" />
            <div className="absolute top-3 right-3 text-[9px] text-white/30 tracking-wider text-right pointer-events-none select-none">
              SYNTH OUTPUT
            </div>
          </div>
        </div>
      )}

      {/* Controls (shown when active) */}
      {isActive && (
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
          <button
            onClick={closeAll}
            className="text-[10px] tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1.5 rounded transition"
          >
            stop
          </button>
          <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
            ← dream
          </Link>
        </div>
      )}
    </div>
  );
}
