"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ─── Room acoustic simulation ──────────────────────────────────────────────
// Image-source method for a rectangular room:
//   - Enumerate mirror sources up to ORDER reflections (2^ORDER × 2^ORDER quadrants)
//   - Each mirror source contributes an early reflection at delay = distance/speed_of_sound
//   - Attenuation per bounce = (1 - absorption_coeff)^0.5 × distance falloff
//   - Output: impulse response buffer (IR) → ConvolverNode
// Reference: Allen & Berkley (1979), Barron "Concert Hall Acoustics" (2010)
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const SPEED_OF_SOUND = 343; // m/s
const IR_DURATION = 4.0;   // seconds — covers RT60 up to ~3.5s
const MAX_ORDER = 3;       // reflection order (3rd-order = 8 reflections per wall path)

interface RoomMaterial {
  name: string;
  absorption: number; // Sabine absorption coefficient 0–1
  color: string;
}

const MATERIALS: RoomMaterial[] = [
  { name: "Stone",    absorption: 0.03, color: "#94a3b8" },
  { name: "Concrete", absorption: 0.05, color: "#78716c" },
  { name: "Wood",     absorption: 0.15, color: "#a16207" },
  { name: "Glass",    absorption: 0.04, color: "#67e8f9" },
  { name: "Carpet",   absorption: 0.40, color: "#7c3aed" },
];

interface RoomPreset {
  label: string;
  width: number;   // meters
  depth: number;   // meters
  wallMat: number; // MATERIALS index
  floorMat: number;
  ceilMat: number;
}

const PRESETS: RoomPreset[] = [
  { label: "Closet",           width: 1.5,  depth: 2.0,  wallMat: 4, floorMat: 4, ceilMat: 4 },
  { label: "Bedroom",          width: 4.0,  depth: 3.5,  wallMat: 4, floorMat: 4, ceilMat: 1 },
  { label: "Studio",           width: 7.0,  depth: 5.5,  wallMat: 4, floorMat: 2, ceilMat: 4 },
  { label: "Hall",             width: 20.0, depth: 14.0, wallMat: 2, floorMat: 2, ceilMat: 2 },
  { label: "Concert Hall",     width: 30.0, depth: 22.0, wallMat: 2, floorMat: 3, ceilMat: 2 },
  { label: "Cathedral",        width: 28.0, depth: 60.0, wallMat: 0, floorMat: 0, ceilMat: 0 },
  { label: "Cave",             width: 18.0, depth: 30.0, wallMat: 0, floorMat: 0, ceilMat: 0 },
  { label: "Stone Chamber",    width: 10.0, depth: 8.0,  wallMat: 0, floorMat: 0, ceilMat: 0 },
  { label: "Forest Clearing",  width: 40.0, depth: 40.0, wallMat: 4, floorMat: 4, ceilMat: 4 },
];

// ── Impulse response computation (image-source method, rectangular room) ──
// The room is 2D (width × depth). We ignore height for simplicity and treat
// it as a third dimension with the average of floor/ceiling absorption.
// Source at (sx, sz), listener at (lx, lz). Height h = 3m nominal.
function computeIR(
  Lx: number, Lz: number,  // room dimensions (metres)
  sx: number, sz: number,  // source position (metres)
  lx: number, lz: number,  // listener position
  absWall: number,         // wall absorption (same all 4 walls for simplicity)
  absFloorCeil: number,    // floor+ceiling absorption
  height: number = 3.0
): Float32Array {
  const irLen = Math.ceil(IR_DURATION * SAMPLE_RATE);
  const ir = new Float32Array(irLen);

  // Direct sound (0th order)
  const dx0 = lx - sx, dz0 = lz - sz;
  const r0 = Math.sqrt(dx0 * dx0 + dz0 * dz0);
  if (r0 > 0.01) {
    const d0 = Math.round((r0 / SPEED_OF_SOUND) * SAMPLE_RATE);
    if (d0 < irLen) ir[d0] += 1.0 / Math.max(r0, 0.1);
  }

  // Image sources: enumerate mirror indices (p, q) for 2D plane reflections
  // plus r for vertical reflections
  const wallEnergy = 1 - absWall;
  const fcEnergy   = 1 - absFloorCeil;

  for (let p = -MAX_ORDER; p <= MAX_ORDER; p++) {
    for (let q = -MAX_ORDER; q <= MAX_ORDER; q++) {
      if (p === 0 && q === 0) continue;
      // Total wall bounces in x: |p| reflections, in z: |q| reflections
      const wallBounces = Math.abs(p) + Math.abs(q);
      if (wallBounces > MAX_ORDER) continue; // skip high-order combos

      // Mirror source position in 2D
      let imgX: number, imgZ: number;
      if (p % 2 === 0) {
        imgX = p * Lx + sx;
      } else {
        imgX = p * Lx + (Lx - sx);
      }
      if (q % 2 === 0) {
        imgZ = q * Lz + sz;
      } else {
        imgZ = q * Lz + (Lz - sz);
      }

      // Include a vertical reflection (1 floor+ceiling bounce per 2 orders)
      for (let vert = 0; vert <= 1; vert++) {
        let imgY: number;
        if (vert === 0) {
          imgY = 1.5; // source height
        } else {
          imgY = -1.5; // one floor reflection
        }
        const vertBounces = vert;

        const dx = lx - imgX;
        const dz = lz - imgZ;
        const dy = 1.5 - imgY; // listener height 1.5m
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);

        const delay = Math.round((dist / SPEED_OF_SOUND) * SAMPLE_RATE);
        if (delay >= irLen) continue;

        const attn =
          (Math.pow(wallEnergy, wallBounces * 0.5) *
           Math.pow(fcEnergy, vertBounces * 0.5)) /
          Math.max(dist, 0.5);

        if (attn > 1e-5) {
          ir[delay] += attn;
        }
      }
    }
  }

  // Normalize
  let peak = 0;
  for (let i = 0; i < irLen; i++) if (ir[i] > peak) peak = ir[i];
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < irLen; i++) ir[i] *= scale;
  }

  return ir;
}

// Estimate RT60 from absorption using Sabine formula: RT60 = 0.161 * V / (A_total)
function estimateRT60(Lx: number, Lz: number, wallAbs: number, fcAbs: number, height = 3.0) {
  const V = Lx * Lz * height;
  const wallArea = 2 * (Lx + Lz) * height;
  const floorCeilArea = 2 * Lx * Lz;
  const A = wallArea * wallAbs + floorCeilArea * fcAbs;
  if (A <= 0) return Infinity;
  return (0.161 * V) / A;
}

// ── Piano chord synthesis (C major: C3 E3 G3 C4) ──────────────────────────
// Each note: triangle oscillator + ADSR + slight vibrato
function synthChord(actx: AudioContext, dest: AudioNode) {
  const notes = [130.81, 164.81, 196.00, 261.63]; // C3 E3 G3 C4
  const now = actx.currentTime;

  notes.forEach((freq) => {
    const osc = actx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    // Light vibrato
    const lfo = actx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = actx.createGain();
    lfoGain.gain.value = 1.2;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now);
    lfo.stop(now + 2.5);

    const env = actx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.14, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.06, now + 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

    osc.connect(env);
    env.connect(dest);
    osc.start(now);
    osc.stop(now + 2.6);
  });
}

// ─── Canvas room rendering ─────────────────────────────────────────────────
const PAD = 40;          // px padding inside canvas
const HANDLE_R = 10;     // corner handle radius px

function roomToCanvas(
  rx: number, ry: number,
  Lx: number, Lz: number,
  cw: number, ch: number
) {
  const scaleX = (cw - PAD * 2) / Lx;
  const scaleZ = (ch - PAD * 2) / Lz;
  return {
    cx: PAD + rx * scaleX,
    cy: PAD + ry * scaleZ,
  };
}

function canvasToRoom(
  cx: number, cy: number,
  Lx: number, Lz: number,
  cw: number, ch: number
) {
  const scaleX = (cw - PAD * 2) / Lx;
  const scaleZ = (ch - PAD * 2) / Lz;
  return {
    rx: (cx - PAD) / scaleX,
    rz: (cy - PAD) / scaleZ,
  };
}

interface Reflection {
  x: number; z: number; attn: number;
}

function getReflections(
  Lx: number, Lz: number,
  sx: number, sz: number,
  lx: number, lz: number,
  wallAbs: number
): Reflection[] {
  const refs: Reflection[] = [];
  const wallE = 1 - wallAbs;
  for (let p = -2; p <= 2; p++) {
    for (let q = -2; q <= 2; q++) {
      if (p === 0 && q === 0) continue;
      const wallBounces = Math.abs(p) + Math.abs(q);
      if (wallBounces > 2) continue;
      let imgX: number, imgZ: number;
      if (p % 2 === 0) imgX = p * Lx + sx; else imgX = p * Lx + (Lx - sx);
      if (q % 2 === 0) imgZ = q * Lz + sz; else imgZ = q * Lz + (Lz - sz);
      const dx = lx - imgX, dz = lz - imgZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const attn = Math.pow(wallE, wallBounces * 0.5) / Math.max(dist, 0.5);
      if (attn > 0.008) refs.push({ x: imgX, z: imgZ, attn });
    }
  }
  return refs;
}

// ─── Component ────────────────────────────────────────────────────────────

interface AudioState {
  ctx: AudioContext;
  convolver: ConvolverNode;
  masterGain: GainNode;
  currentPreset: string;
}

export default function RoomAcousticPage() {
  // Room geometry (metres)
  const [roomW, setRoomW] = useState(10.0);
  const [roomD, setRoomD] = useState(8.0);
  const [wallMatIdx, setWallMatIdx]  = useState(0); // Stone
  const [floorCeilIdx, setFloorCeilIdx] = useState(2); // Wood
  const [activePreset, setActivePreset] = useState("Stone Chamber");

  // Source/listener positions (metres) — will be kept centered on room change
  const srcRef = useRef({ x: 2.0, z: 4.0 });
  const lstRef = useRef({ x: 8.0, z: 4.0 });

  // UI state
  const [rt60, setRt60] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [building, setBuilding] = useState(false);
  const [showRays, setShowRays] = useState(true);
  const [dragTarget, setDragTarget] = useState<"src" | "lst" | null>(null);

  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const audioRef   = useRef<AudioState | null>(null);
  const irReadyRef = useRef(false);
  const rayAnimRef = useRef(0);
  const rayPhaseRef = useRef(0);

  const wallAbs      = MATERIALS[wallMatIdx].absorption;
  const floorCeilAbs = MATERIALS[floorCeilIdx].absorption;

  // ── Update RT60 whenever room params change ─────────────────────────────
  useEffect(() => {
    const t60 = estimateRT60(roomW, roomD, wallAbs, floorCeilAbs);
    setRt60(Math.min(t60, 12));
  }, [roomW, roomD, wallAbs, floorCeilAbs]);

  // ── Build impulse response ─────────────────────────────────────────────
  const buildIR = useCallback(async () => {
    setBuilding(true);
    irReadyRef.current = false;

    // Use a setTimeout to let React re-render "Building…" before blocking
    await new Promise<void>((res) => setTimeout(res, 30));

    // Clamp source + listener positions inside room
    const src = srcRef.current;
    const lst = lstRef.current;
    src.x = Math.max(0.5, Math.min(roomW - 0.5, src.x));
    src.z = Math.max(0.5, Math.min(roomD - 0.5, src.z));
    lst.x = Math.max(0.5, Math.min(roomW - 0.5, lst.x));
    lst.z = Math.max(0.5, Math.min(roomD - 0.5, lst.z));

    const ir = computeIR(roomW, roomD, src.x, src.z, lst.x, lst.z, wallAbs, floorCeilAbs);

    let as = audioRef.current;
    if (!as) {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const convolver = ctx.createConvolver();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      convolver.connect(masterGain);
      masterGain.connect(ctx.destination);
      as = { ctx, convolver, masterGain, currentPreset: "" };
      audioRef.current = as;
    }

    const buf = as.ctx.createBuffer(1, ir.length, SAMPLE_RATE);
    buf.copyToChannel(ir as Float32Array<ArrayBuffer>, 0);
    as.convolver.buffer = buf;
    irReadyRef.current = true;

    setBuilding(false);
    // Auto-play a chord when IR is fresh
    playChord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomW, roomD, wallAbs, floorCeilAbs]);

  const playChord = useCallback(() => {
    const as = audioRef.current;
    if (!as || !irReadyRef.current) return;
    if (as.ctx.state === "suspended") as.ctx.resume();
    setPlaying(true);
    synthChord(as.ctx, as.convolver);
    setTimeout(() => setPlaying(false), 3000);
  }, []);

  // ── Canvas draw ───────────────────────────────────────────────────────
  const drawRoom = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Room fill
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Room rectangle
    const tl = roomToCanvas(0, 0, roomW, roomD, W, H);
    const br = roomToCanvas(roomW, roomD, roomW, roomD, W, H);
    const rw = br.cx - tl.cx;
    const rh = br.cy - tl.cy;

    ctx.strokeStyle = MATERIALS[wallMatIdx].color;
    ctx.lineWidth = 3;
    ctx.strokeRect(tl.cx, tl.cy, rw, rh);

    // Floor fill
    ctx.fillStyle = MATERIALS[floorCeilIdx].color + "22";
    ctx.fillRect(tl.cx, tl.cy, rw, rh);

    // Wall material label
    ctx.fillStyle = MATERIALS[wallMatIdx].color + "cc";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${MATERIALS[wallMatIdx].name} α=${MATERIALS[wallMatIdx].absorption}`, tl.cx + rw / 2, tl.cy - 10);

    // Dimension labels
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${roomW.toFixed(1)} m`, tl.cx + rw / 2, br.cy + 22);
    ctx.textAlign = "left";
    ctx.save();
    ctx.translate(tl.cx - 22, tl.cy + rh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${roomD.toFixed(1)} m`, 0, 0);
    ctx.restore();

    // Reflection rays
    if (showRays && irReadyRef.current) {
      const refs = getReflections(
        roomW, roomD,
        srcRef.current.x, srcRef.current.z,
        lstRef.current.x, lstRef.current.z,
        wallAbs
      );
      rayPhaseRef.current = (rayPhaseRef.current + 0.015) % (Math.PI * 2);
      const phase = rayPhaseRef.current;

      refs.slice(0, 12).forEach((ref, i) => {
        const brightness = Math.min(ref.attn * 3, 1);
        const alpha = brightness * (0.35 + 0.2 * Math.sin(phase + i * 0.7));
        ctx.strokeStyle = `rgba(139, 92, 246, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -phase * 8;

        // Draw ray: listener → mirror source (clipped to room boundary)
        const srcC  = roomToCanvas(srcRef.current.x, srcRef.current.z, roomW, roomD, W, H);
        const lstC  = roomToCanvas(lstRef.current.x, lstRef.current.z, roomW, roomD, W, H);
        const imgC  = roomToCanvas(ref.x, ref.z, roomW, roomD, W, H);

        ctx.beginPath();
        ctx.moveTo(srcC.cx, srcC.cy);
        ctx.lineTo(lstC.cx, lstC.cy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      });
    }

    // Source dot (amber/orange)
    const srcC = roomToCanvas(srcRef.current.x, srcRef.current.z, roomW, roomD, W, H);
    ctx.beginPath();
    ctx.arc(srcC.cx, srcC.cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪", srcC.cx, srcC.cy);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "10px monospace";
    ctx.fillText("source", srcC.cx, srcC.cy + 18);

    // Listener dot (violet)
    const lstC = roomToCanvas(lstRef.current.x, lstRef.current.z, roomW, roomD, W, H);
    ctx.beginPath();
    ctx.arc(lstC.cx, lstC.cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.fill();
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👂", lstC.cx, lstC.cy);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "10px monospace";
    ctx.fillText("listener", lstC.cx, lstC.cy + 18);

    // Direct sound ray
    ctx.strokeStyle = "rgba(245, 158, 11, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(srcC.cx, srcC.cy);
    ctx.lineTo(lstC.cx, lstC.cy);
    ctx.stroke();
  }, [roomW, roomD, wallMatIdx, floorCeilIdx, showRays, wallAbs]);

  // ── Animation loop for rays ───────────────────────────────────────────
  useEffect(() => {
    let rafId = 0;
    const loop = () => {
      drawRoom();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [drawRoom]);

  // ── Canvas sizing ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Drag: source + listener handles ──────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const srcC = roomToCanvas(srcRef.current.x, srcRef.current.z, roomW, roomD, W, H);
    const lstC = roomToCanvas(lstRef.current.x, lstRef.current.z, roomW, roomD, W, H);

    const dSrc = Math.hypot(cx - srcC.cx, cy - srcC.cy);
    const dLst = Math.hypot(cx - lstC.cx, cy - lstC.cy);

    if (dSrc < 20) {
      setDragTarget("src");
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } else if (dLst < 20) {
      setDragTarget("lst");
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    }
  }, [roomW, roomD]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragTarget) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const pos = canvasToRoom(cx, cy, roomW, roomD, W, H);
    const px = Math.max(0.3, Math.min(roomW - 0.3, pos.rx));
    const pz = Math.max(0.3, Math.min(roomD - 0.3, pos.rz));

    if (dragTarget === "src") {
      srcRef.current = { x: px, z: pz };
    } else {
      lstRef.current = { x: px, z: pz };
    }
  }, [dragTarget, roomW, roomD]);

  const handlePointerUp = useCallback(() => {
    if (dragTarget) {
      setDragTarget(null);
      // Rebuild IR after repositioning
      buildIR();
    }
  }, [dragTarget, buildIR]);

  // ── Apply preset ──────────────────────────────────────────────────────
  const applyPreset = useCallback((preset: RoomPreset) => {
    setRoomW(preset.width);
    setRoomD(preset.depth);
    setWallMatIdx(preset.wallMat);
    setFloorCeilIdx(preset.floorMat);
    setActivePreset(preset.label);
    srcRef.current = { x: preset.width * 0.2,  z: preset.depth * 0.5 };
    lstRef.current = { x: preset.width * 0.65, z: preset.depth * 0.5 };
  }, []);

  // Build IR on mount with defaults
  useEffect(() => {
    buildIR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      audioRef.current?.ctx.close();
    };
  }, []);

  const rt60Color =
    rt60 < 0.5 ? "#34d399"  // emerald — dry/studio
    : rt60 < 1.5 ? "#60a5fa" // blue — room
    : rt60 < 3.0 ? "#a78bfa" // violet — hall
    : "#f59e0b";              // amber — cathedral/cave

  return (
    <div className="min-h-screen bg-[#020817] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-white/95 leading-tight">
            Room Acoustic
          </h1>
          <p className="text-base text-white/75 mt-0.5">
            Draw a room. Hear what it sounds like.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/55 hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4 px-4 pb-5 min-h-0">

        {/* Canvas */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-white/10 bg-[#0a0f1e] min-h-[280px]">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {/* RT60 badge */}
          <div
            className="absolute top-3 left-3 px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: rt60Color + "22", border: `1px solid ${rt60Color}55`, color: rt60Color }}
          >
            RT60 ≈ {rt60.toFixed(2)}s
          </div>
          {/* Drag hint */}
          <div className="absolute bottom-3 right-3 text-xs text-white/40 font-mono">
            drag ♪ source · 👂 listener
          </div>
        </div>

        {/* Controls */}
        <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0">

          {/* RT60 + Play */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: rt60Color }}
              >
                {rt60.toFixed(2)}<span className="text-lg ml-1 text-white/55">s</span>
              </div>
              <div className="text-sm text-white/55">
                <div>Reverberation time</div>
                <div className="text-xs mt-0.5">
                  {rt60 < 0.4 ? "Dead / anechoic"
                  : rt60 < 0.8 ? "Studio / intimate"
                  : rt60 < 1.5 ? "Room / chamber"
                  : rt60 < 2.5 ? "Concert hall"
                  : "Cathedral / cave"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={playChord}
                disabled={building || !irReadyRef.current}
                className="flex-1 min-h-[44px] rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-40"
              >
                {playing ? "♩ ringing…" : "▶ play chord"}
              </button>
              <button
                onClick={buildIR}
                disabled={building}
                className="min-h-[44px] px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white/75 text-sm hover:bg-white/[0.1] transition-colors disabled:opacity-40"
              >
                {building ? "⟳" : "↺"}
              </button>
            </div>
            {building && (
              <div className="mt-2 text-xs text-amber-300/80 font-mono">
                computing impulse response…
              </div>
            )}
          </div>

          {/* Room presets */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm text-white/75 font-medium mb-2">Presets</div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { applyPreset(p); setTimeout(buildIR, 50); }}
                  className={`text-xs py-1.5 px-1 rounded-md border transition-colors ${
                    activePreset === p.label
                      ? "border-violet-400/60 bg-violet-500/20 text-violet-300"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white/80 hover:bg-white/[0.06]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Room size sliders */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm text-white/75 font-medium mb-3">Room size</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-white/55 mb-1">
                  <span>Width</span>
                  <span className="font-mono">{roomW.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min={1.5} max={60} step={0.5} value={roomW}
                  onChange={(e) => setRoomW(parseFloat(e.target.value))}
                  onMouseUp={buildIR} onTouchEnd={() => buildIR()}
                  className="w-full accent-violet-400 h-1.5"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/55 mb-1">
                  <span>Depth</span>
                  <span className="font-mono">{roomD.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min={1.5} max={80} step={0.5} value={roomD}
                  onChange={(e) => setRoomD(parseFloat(e.target.value))}
                  onMouseUp={buildIR} onTouchEnd={() => buildIR()}
                  className="w-full accent-violet-400 h-1.5"
                />
              </div>
            </div>
          </div>

          {/* Material pickers */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm text-white/75 font-medium mb-2">Wall material</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {MATERIALS.map((m, i) => (
                <button
                  key={m.name}
                  onClick={() => { setWallMatIdx(i); setTimeout(buildIR, 50); }}
                  className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    wallMatIdx === i
                      ? "border-white/50 text-white bg-white/10"
                      : "border-white/10 text-white/60 hover:text-white/80"
                  }`}
                  style={wallMatIdx === i ? { borderColor: m.color + "aa", color: m.color } : {}}
                >
                  {m.name} <span className="opacity-60">α={m.absorption}</span>
                </button>
              ))}
            </div>
            <div className="text-sm text-white/75 font-medium mb-2">Floor / ceiling</div>
            <div className="flex flex-wrap gap-1.5">
              {MATERIALS.map((m, i) => (
                <button
                  key={m.name}
                  onClick={() => { setFloorCeilIdx(i); setTimeout(buildIR, 50); }}
                  className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    floorCeilIdx === i
                      ? "border-white/50 text-white bg-white/10"
                      : "border-white/10 text-white/60 hover:text-white/80"
                  }`}
                  style={floorCeilIdx === i ? { borderColor: m.color + "aa", color: m.color } : {}}
                >
                  {m.name} <span className="opacity-60">α={m.absorption}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ray toggle */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setShowRays((v) => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showRays ? "bg-violet-500" : "bg-white/10"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${showRays ? "translate-x-5.5" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm text-white/75">Show reflection rays</span>
            </label>
            <p className="text-xs text-white/40 mt-2 leading-relaxed">
              Dashed lines show early reflections. Brighter = stronger reflection.
            </p>
          </div>

          {/* Design notes */}
          <div className="text-xs text-white/40 px-1 pb-1 leading-relaxed">
            Image-source method · up to 3rd-order reflections ·{" "}
            <Link href="/dream/80-room-acoustic/README.md" className="text-violet-400/70 hover:text-violet-300">
              design notes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
