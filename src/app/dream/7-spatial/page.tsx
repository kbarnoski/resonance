"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Band definitions ──────────────────────────────────────────────────────

const BANDS = [
  { label: "Sub-bass", hz: 40,    q: 0.8, color: "#7c3aed" },
  { label: "Bass",     hz: 125,   q: 0.8, color: "#0891b2" },
  { label: "Low-mid",  hz: 350,   q: 0.8, color: "#16a34a" },
  { label: "Mid",      hz: 1000,  q: 0.8, color: "#ca8a04" },
  { label: "High-mid", hz: 3000,  q: 0.8, color: "#ea580c" },
  { label: "High",     hz: 10000, q: 0.8, color: "#db2777" },
] as const;

type Pos3 = [number, number, number]; // x=right, y=up, z=neg-front (Web Audio convention)

// Default positions — spread around the listener's sphere.
// z < 0 = in front, z > 0 = behind.
const DEFAULT_POS: Pos3[] = [
  [0, -1, 0],          // sub-bass: directly below
  [-0.707, 0, -0.707], // bass: front-left
  [0, 0, -1],          // low-mid: directly in front
  [0.707, 0, -0.707],  // mid: front-right
  [0.707, 0.707, 0],   // high-mid: right-above
  [0, 1, 0],           // high: directly above
];

// ── 3D projection ─────────────────────────────────────────────────────────
// Camera is at +Z looking toward -Z, tilted VIEW_TILT downward around X.
// We flip z so that audio-front (z<0) appears at the visual front of the sphere.

const VIEW_TILT = 0.42; // ~24° — slight downward tilt for depth
const COS_T = Math.cos(VIEW_TILT);
const SIN_T = Math.sin(VIEW_TILT);

function project(
  x: number, y: number, z: number,
  cx: number, cy: number, r: number
): { sx: number; sy: number; depth: number } {
  const mz = -z; // flip: audio front (z<0) → visual near (mz>0)
  const ry = y * COS_T - mz * SIN_T;
  const rz = y * SIN_T + mz * COS_T;
  return { sx: cx + x * r, sy: cy - ry * r, depth: rz };
}

// Map a canvas click back to a unit-sphere position in audio coordinates.
function unproject(sx: number, sy: number, cx: number, cy: number, r: number): Pos3 | null {
  const nx = (sx - cx) / r;
  const mry = -(sy - cy) / r; // = ry from project
  const d2 = nx * nx + mry * mry;
  if (d2 > 1) return null;
  const mrz = Math.sqrt(1 - d2); // front hemisphere of rotated sphere
  // Invert rotX: wy = mry*cos + mrz*sin, wmz = -mry*sin + mrz*cos
  const wy = mry * COS_T + mrz * SIN_T;
  const wmz = -mry * SIN_T + mrz * COS_T; // wmz = mz = -audio_z
  const len = Math.sqrt(nx * nx + wy * wy + wmz * wmz) || 1;
  return [nx / len, wy / len, -wmz / len]; // un-flip z back to audio convention
}

// ── Audio rig (module-level — no hooks) ──────────────────────────────────

interface Rig {
  ctx: AudioContext;
  panners: PannerNode[];
  analysers: AnalyserNode[];
  source?: AudioBufferSourceNode;
  stream?: MediaStream;
  oscillators?: OscillatorNode[];
}

function buildRig(ctx: AudioContext, positions: Pos3[]): Rig {
  const panners: PannerNode[] = [];
  const analysers: AnalyserNode[] = [];
  for (let i = 0; i < 6; i++) {
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.refDistance = 1;
    panner.maxDistance = 10;
    panner.rolloffFactor = 0; // equal volume at all positions
    const [px, py, pz] = positions[i];
    panner.positionX.value = px;
    panner.positionY.value = py;
    panner.positionZ.value = pz;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    analyser.connect(panner);
    panner.connect(ctx.destination);

    panners.push(panner);
    analysers.push(analyser);
  }
  return { ctx, panners, analysers };
}

function attachFilters(ctx: AudioContext, source: AudioNode, analysers: AnalyserNode[]) {
  for (let i = 0; i < 6; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = BANDS[i].hz;
    f.Q.value = BANDS[i].q;
    source.connect(f);
    f.connect(analysers[i]);
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function SpatialPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const posRef = useRef<Pos3[]>(DEFAULT_POS.map((p) => [...p] as Pos3));
  const levelsRef = useRef<Float32Array>(new Float32Array(6));
  const dragIdxRef = useRef<number>(-1);
  const animRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"idle" | "demo" | "mic" | "file">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  // ── stop ─────────────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.oscillators?.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
    try { rig.source?.stop(); } catch { /* already stopped */ }
    rig.stream?.getTracks().forEach((t) => t.stop());
    rig.ctx.close();
    rigRef.current = null;
  }, []);

  // ── sync panner positions ─────────────────────────────────────────────────

  const syncPanners = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    posRef.current.forEach(([x, y, z], i) => {
      rig.panners[i].positionX.value = x;
      rig.panners[i].positionY.value = y;
      rig.panners[i].positionZ.value = z;
    });
  }, []);

  // ── sources ───────────────────────────────────────────────────────────────

  const startDemo = useCallback(async () => {
    stopAudio();
    const ctx = new AudioContext();
    await ctx.resume();
    const rig = buildRig(ctx, posRef.current);
    const oscillators: OscillatorNode[] = [];
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = BANDS[i].hz;
      osc.type = "sine";
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(rig.analysers[i]);
      osc.start();
      oscillators.push(osc);
    }
    rig.oscillators = oscillators;
    rigRef.current = rig;
    setMode("demo");
    setError(null);
  }, [stopAudio]);

  const startMic = useCallback(async () => {
    stopAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      await ctx.resume();
      const rig = buildRig(ctx, posRef.current);
      const source = ctx.createMediaStreamSource(stream);
      attachFilters(ctx, source, rig.analysers);
      rigRef.current = { ...rig, stream };
      setMode("mic");
      setError(null);
    } catch {
      setError("Mic access denied — try Demo mode.");
    }
  }, [stopAudio]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      stopAudio();
      setFileName(file.name);
      try {
        const arrayBuf = await file.arrayBuffer();
        const ctx = new AudioContext();
        await ctx.resume();
        const rig = buildRig(ctx, posRef.current);
        const decoded = await ctx.decodeAudioData(arrayBuf);
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.loop = true;
        attachFilters(ctx, source, rig.analysers);
        source.start();
        rigRef.current = { ...rig, source };
        setMode("file");
        setError(null);
      } catch {
        setError("Could not decode audio file.");
      }
    },
    [stopAudio]
  );

  // ── canvas loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    const frame = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx2.fillStyle = "#090912";
      ctx2.fillRect(0, 0, W, H);

      const CX = W / 2;
      const CY = H / 2;
      const R = Math.min(W, H) * 0.37;

      // sample per-band RMS
      const rig = rigRef.current;
      if (rig) {
        const buf = new Float32Array(128);
        for (let i = 0; i < 6; i++) {
          rig.analysers[i].getFloatTimeDomainData(buf);
          let sum = 0;
          for (let j = 0; j < buf.length; j++) sum += buf[j] * buf[j];
          levelsRef.current[i] = Math.min(1, Math.sqrt(sum / buf.length) * 14);
        }
      } else {
        levelsRef.current.fill(0);
      }

      // sphere wireframe
      ctx2.save();
      ctx2.strokeStyle = "rgba(255,255,255,0.065)";
      ctx2.lineWidth = 0.5;
      for (let lat = -60; lat <= 60; lat += 30) {
        const phi = (lat * Math.PI) / 180;
        ctx2.beginPath();
        for (let lon = 0; lon <= 360; lon += 6) {
          const th = (lon * Math.PI) / 180;
          const { sx, sy } = project(
            Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th),
            CX, CY, R
          );
          lon === 0 ? ctx2.moveTo(sx, sy) : ctx2.lineTo(sx, sy);
        }
        ctx2.stroke();
      }
      for (let lon = 0; lon < 180; lon += 30) {
        const th = (lon * Math.PI) / 180;
        ctx2.beginPath();
        for (let lat = -90; lat <= 90; lat += 6) {
          const phi = (lat * Math.PI) / 180;
          const { sx, sy } = project(
            Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th),
            CX, CY, R
          );
          lat === -90 ? ctx2.moveTo(sx, sy) : ctx2.lineTo(sx, sy);
        }
        ctx2.stroke();
      }
      ctx2.restore();

      // depth-sort and draw bands (back → front)
      const dots = posRef.current
        .map(([x, y, z], i) => ({ ...project(x, y, z, CX, CY, R), i }))
        .sort((a, b) => a.depth - b.depth);

      for (const { sx, sy, depth, i } of dots) {
        const lv = levelsRef.current[i];
        const alpha = 0.3 + 0.7 * ((depth + 1) / 2); // front = fully opaque
        const dotR = 7 + lv * 18;
        const col = BANDS[i].color;

        // spoke from listener
        ctx2.beginPath();
        ctx2.moveTo(CX, CY);
        ctx2.lineTo(sx, sy);
        ctx2.strokeStyle = col + Math.round(alpha * 72).toString(16).padStart(2, "0");
        ctx2.lineWidth = 1;
        ctx2.stroke();

        // glow when audio is active
        if (lv > 0.04) {
          const grd = ctx2.createRadialGradient(sx, sy, 0, sx, sy, dotR * 2.6);
          grd.addColorStop(0, col + "88");
          grd.addColorStop(1, col + "00");
          ctx2.fillStyle = grd;
          ctx2.beginPath();
          ctx2.arc(sx, sy, dotR * 2.6, 0, Math.PI * 2);
          ctx2.fill();
        }

        // dot
        ctx2.globalAlpha = alpha;
        ctx2.fillStyle = col;
        ctx2.beginPath();
        ctx2.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.globalAlpha = 1;

        // label
        ctx2.font = "10px monospace";
        ctx2.fillStyle = `rgba(255,255,255,${(alpha * 0.85).toFixed(2)})`;
        ctx2.fillText(BANDS[i].label, sx + dotR + 3, sy + 4);
      }

      // listener dot
      ctx2.fillStyle = "rgba(255,255,255,0.5)";
      ctx2.beginPath();
      ctx2.arc(CX, CY, 4, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.font = "9px monospace";
      ctx2.fillStyle = "rgba(255,255,255,0.25)";
      ctx2.fillText("you", CX + 7, CY + 4);

      animRef.current = requestAnimationFrame(frame);
    };

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── drag ──────────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const CX = canvas.width / 2;
    const CY = canvas.height / 2;
    const R = Math.min(canvas.width, canvas.height) * 0.37;

    let best = -1, bestD = 28;
    for (let i = 0; i < 6; i++) {
      const [x, y, z] = posRef.current[i];
      const { sx, sy } = project(x, y, z, CX, CY, R);
      const d = Math.hypot(mx - sx, my - sy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      dragIdxRef.current = best;
      canvas.setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragIdxRef.current < 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      const CX = canvas.width / 2;
      const CY = canvas.height / 2;
      const R = Math.min(canvas.width, canvas.height) * 0.37;
      const pos = unproject(mx, my, CX, CY, R);
      if (pos) {
        posRef.current[dragIdxRef.current] = pos;
        syncPanners();
      }
    },
    [syncPanners]
  );

  const handlePointerUp = useCallback(() => {
    dragIdxRef.current = -1;
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopAudio();
      cancelAnimationFrame(animRef.current);
    };
  }, [stopAudio]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#090912] text-white/90 font-mono p-5">
      <div className="max-w-[860px] mx-auto">
        <div className="mb-5">
          <h1 className="text-lg font-bold tracking-widest text-white">7 — Spatial Audio</h1>
          <p className="text-xs text-white/40 mt-1">
            Six frequency bands placed in 3-D space via HRTF. Drag dots to reposition. Wear headphones.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 items-start">
          {/* Sphere canvas */}
          <div>
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              className="block rounded-lg"
              style={{ touchAction: "none", cursor: "grab", maxWidth: "100%" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <p className="text-[10px] text-white/20 mt-1.5 text-center">
              Drag a dot to move that band · brighter = closer to you · center dot = listener
            </p>
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-[200px] flex flex-col gap-5">
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Audio source</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={startDemo}
                  className={`text-left px-3 py-2.5 rounded text-sm border transition ${
                    mode === "demo"
                      ? "bg-violet-700/50 border-violet-500 text-white"
                      : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.08] hover:border-white/25"
                  }`}
                >
                  Demo oscillators{mode === "demo" ? " ▶" : ""}
                </button>
                <button
                  onClick={startMic}
                  className={`text-left px-3 py-2.5 rounded text-sm border transition ${
                    mode === "mic"
                      ? "bg-cyan-800/50 border-cyan-600 text-white"
                      : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.08] hover:border-white/25"
                  }`}
                >
                  Microphone{mode === "mic" ? " ▶" : ""}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`text-left px-3 py-2.5 rounded text-sm border transition truncate ${
                    mode === "file"
                      ? "bg-green-900/50 border-green-700 text-white"
                      : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.08] hover:border-white/25"
                  }`}
                >
                  {fileName ? `File: ${fileName}` : "Upload audio file"}
                  {mode === "file" ? " ▶" : ""}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {mode !== "idle" && (
              <button
                onClick={() => { stopAudio(); setMode("idle"); }}
                className="text-xs text-white/35 hover:text-white/65 border border-white/10 hover:border-white/30 px-3 py-1.5 rounded transition uppercase tracking-wider self-start"
              >
                Stop
              </button>
            )}

            {/* Band legend */}
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Bands</p>
              <div className="flex flex-col gap-1.5">
                {BANDS.map((b) => (
                  <div key={b.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-xs text-white/55 flex-1">{b.label}</span>
                    <span className="text-[10px] text-white/25">
                      {b.hz >= 1000 ? `${b.hz / 1000}kHz` : `${b.hz}Hz`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tip */}
            <div className="bg-white/[0.04] border border-white/[0.07] rounded p-3">
              <p className="text-[11px] text-white/40 leading-relaxed">
                HRTF uses head-related transfer functions — tiny frequency cues your ears learned from a lifetime of locating sounds. Close your eyes and drag high frequencies above your head. The illusion is subtle but real.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 mt-auto">
              <Link
                href="/dream/7-spatial/README.md"
                target="_blank"
                className="text-xs text-violet-400/60 hover:text-violet-300"
              >
                Design notes →
              </Link>
              <Link href="/dream" className="text-xs text-white/20 hover:text-white/55">
                ← dream sandbox
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
