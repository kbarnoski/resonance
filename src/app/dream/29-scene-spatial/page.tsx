"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Pos3 = [number, number, number]; // Web Audio: x=right, y=up, z=-(forward)

type SrcType =
  | "piano-loop"
  | "perc-loop"
  | "drone"
  | "noise-wind"
  | "noise-water"
  | "bird-loop"
  | "pad";

interface SceneSrc {
  label: string;
  color: string;
  pos: Pos3;
  type: SrcType;
  freq: number;
}

interface Scene {
  id: string;
  name: string;
  tagline: string;
  reverbDur: number;
  reverbDecay: number;
  sources: SceneSrc[];
}

interface DisplaySource {
  label: string;
  color: string;
  pos: Pos3;
  panner?: PannerNode;
}

interface AudioCleanup {
  oscs: OscillatorNode[];
  noiseSrcs: AudioBufferSourceNode[];
  timers: ReturnType<typeof setInterval>[];
}

// ── Scene definitions ─────────────────────────────────────────────────────────

const SCENES: Scene[] = [
  {
    id: "stone-chamber",
    name: "Stone Chamber",
    tagline: "Ancient space — single piano, weight of stone",
    reverbDur: 3.5,
    reverbDecay: 3,
    sources: [
      { label: "Piano",      color: "#a78bfa", pos: [-0.6,  0.1, -0.8], type: "piano-loop", freq: 280 },
      { label: "Percussion", color: "#c4b5fd", pos: [ 0,    0.9,  0.1], type: "perc-loop",  freq: 180 },
      { label: "Resonance",  color: "#4c1d95", pos: [ 0,   -0.3,  0.5], type: "drone",      freq: 65  },
    ],
  },
  {
    id: "root-portal",
    name: "Root Portal",
    tagline: "Earth drone below — forest ambience ahead",
    reverbDur: 2.0,
    reverbDecay: 2,
    sources: [
      { label: "Earth",    color: "#065f46", pos: [ 0,   -0.95,  0   ], type: "drone",      freq: 41   },
      { label: "Forest",   color: "#34d399", pos: [ 0,    0,    -0.95], type: "noise-wind", freq: 300  },
      { label: "Birdsong", color: "#6ee7b7", pos: [ 0.3,  0.7,  -0.6 ], type: "bird-loop",  freq: 2400 },
    ],
  },
  {
    id: "underground-pool",
    name: "Underground Pool",
    tagline: "Trickling water right — vast cave resonance below",
    reverbDur: 5.0,
    reverbDecay: 2,
    sources: [
      { label: "Trickle", color: "#0ea5e9", pos: [ 0.9,  0.1, -0.4], type: "noise-water", freq: 800 },
      { label: "Cave",    color: "#075985", pos: [ 0,   -0.9,  0   ], type: "drone",       freq: 38  },
      { label: "Echo",    color: "#0284c7", pos: [-0.5,  0.4,  0.7 ], type: "pad",         freq: 110 },
    ],
  },
  {
    id: "tiny-planet",
    name: "Tiny Planet",
    tagline: "Wind from all sides — birds calling above",
    reverbDur: 1.2,
    reverbDecay: 1.5,
    sources: [
      { label: "Wind L", color: "#d97706", pos: [-0.95,  0,    0   ], type: "noise-wind", freq: 200  },
      { label: "Wind R", color: "#f59e0b", pos: [ 0.95,  0,    0   ], type: "noise-wind", freq: 200  },
      { label: "Bird A", color: "#fde68a", pos: [ 0.4,   0.8, -0.4 ], type: "bird-loop",  freq: 3200 },
      { label: "Bird B", color: "#fbbf24", pos: [-0.4,   0.8, -0.2 ], type: "bird-loop",  freq: 2800 },
    ],
  },
  {
    id: "forest-dawn",
    name: "Forest Dawn",
    tagline: "Canopy birds above — stream left — piano right",
    reverbDur: 2.0,
    reverbDecay: 2,
    sources: [
      { label: "Canopy", color: "#86efac", pos: [ 0,    0.85, -0.5 ], type: "bird-loop",   freq: 2800 },
      { label: "Stream", color: "#67e8f9", pos: [-0.7, -0.2,  -0.7 ], type: "noise-water", freq: 600  },
      { label: "Piano",  color: "#d8b4fe", pos: [ 0.7,  0,    -0.7 ], type: "piano-loop",  freq: 330  },
    ],
  },
  {
    id: "cosmic-ascension",
    name: "Cosmic Ascension",
    tagline: "Rising harmonics — vast reverb — final frontier",
    reverbDur: 6.0,
    reverbDecay: 1.5,
    sources: [
      { label: "Root",      color: "#818cf8", pos: [0,  0,    -1   ], type: "pad", freq: 55  },
      { label: "Harmonics", color: "#a5b4fc", pos: [0,  0.7,   0   ], type: "pad", freq: 110 },
      { label: "Ascent",    color: "#c7d2fe", pos: [0,  0.95, -0.3 ], type: "pad", freq: 220 },
    ],
  },
];

// ── Audio helpers ─────────────────────────────────────────────────────────────

function buildImpulse(ctx: AudioContext, dur: number, decay: number): AudioBuffer {
  const sr  = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * dur));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function buildNoiseBuf(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function buildSrcAudio(
  ctx: AudioContext,
  src: SceneSrc,
  dryDest: AudioNode,
  wetDest: AudioNode,
): AudioCleanup {
  const oscs: OscillatorNode[]           = [];
  const noiseSrcs: AudioBufferSourceNode[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];

  const route = (node: AudioNode, dryVol: number, wetVol: number) => {
    const d = ctx.createGain(); d.gain.value = dryVol;
    const w = ctx.createGain(); w.gain.value = wetVol;
    node.connect(d); d.connect(dryDest);
    node.connect(w); w.connect(wetDest);
  };

  switch (src.type) {
    case "drone": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = src.freq;
      const g = ctx.createGain(); g.gain.value = 0.15;
      osc.connect(g); route(g, 0.7, 0.3);
      osc.start(); oscs.push(osc);
      break;
    }

    case "pad": {
      [1, 2, 3, 5].forEach((h, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = src.freq * h;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.07 / (i + 1), ctx.currentTime + 2.0);
        osc.connect(g); route(g, 0.5, 0.5);
        osc.start(); oscs.push(osc);
      });
      break;
    }

    case "piano-loop": {
      const playNote = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = src.freq * (Math.random() > 0.7 ? 1.5 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.28, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        osc.connect(g); route(g, 0.65, 0.35);
        osc.start(now); osc.stop(now + 2.2);
      };
      playNote();
      const t = setInterval(playNote, 3200 + Math.random() * 2000);
      timers.push(t);
      break;
    }

    case "perc-loop": {
      const playHit = () => {
        const now  = ctx.currentTime;
        const nBuf = buildNoiseBuf(ctx, 0.2);
        const ns   = ctx.createBufferSource();
        ns.buffer  = nBuf;
        const bp   = ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = src.freq; bp.Q.value = 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        ns.connect(bp); bp.connect(g); route(g, 0.5, 0.5);
        ns.start(now);
      };
      playHit();
      const t = setInterval(playHit, 2000 + Math.random() * 2500);
      timers.push(t);
      break;
    }

    case "noise-wind": {
      const nBuf = buildNoiseBuf(ctx, 3);
      const ns   = ctx.createBufferSource(); ns.buffer = nBuf; ns.loop = true;
      const lp   = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = src.freq;
      const g    = ctx.createGain(); g.gain.value = 0.12;
      ns.connect(lp); lp.connect(g); route(g, 0.8, 0.2);
      ns.start(); noiseSrcs.push(ns);
      break;
    }

    case "noise-water": {
      const nBuf = buildNoiseBuf(ctx, 2);
      const ns   = ctx.createBufferSource(); ns.buffer = nBuf; ns.loop = true;
      const hp   = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = src.freq * 0.5;
      const bp   = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = src.freq; bp.Q.value = 1.2;
      const g    = ctx.createGain(); g.gain.value = 0.09;
      ns.connect(hp); hp.connect(bp); bp.connect(g); route(g, 0.75, 0.25);
      ns.start(); noiseSrcs.push(ns);
      break;
    }

    case "bird-loop": {
      const carrier = ctx.createOscillator();
      const modOsc  = ctx.createOscillator();
      const modGain = ctx.createGain();
      const amp     = ctx.createGain();
      const gate    = ctx.createGain();
      carrier.type = "sine"; carrier.frequency.value = src.freq;
      modOsc.type  = "sine"; modOsc.frequency.value  = 9;
      modGain.gain.value = src.freq * 0.08;
      amp.gain.value = 0.18; gate.gain.value = 0;
      modOsc.connect(modGain); modGain.connect(carrier.frequency);
      carrier.connect(amp); amp.connect(gate); route(gate, 0.7, 0.3);
      carrier.start(); modOsc.start(); oscs.push(carrier, modOsc);
      const chirp = () => {
        const now = ctx.currentTime;
        gate.gain.cancelScheduledValues(now);
        gate.gain.setValueAtTime(0, now);
        gate.gain.linearRampToValueAtTime(1, now + 0.04);
        gate.gain.setValueAtTime(1, now + 0.14);
        gate.gain.linearRampToValueAtTime(0, now + 0.22);
        if (Math.random() > 0.5) {
          gate.gain.setValueAtTime(0, now + 0.36);
          gate.gain.linearRampToValueAtTime(1, now + 0.40);
          gate.gain.setValueAtTime(1, now + 0.52);
          gate.gain.linearRampToValueAtTime(0, now + 0.60);
        }
      };
      chirp();
      const t = setInterval(chirp, 2500 + Math.random() * 3000);
      timers.push(t);
      break;
    }
  }

  return { oscs, noiseSrcs, timers };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Status = "idle" | "running";

export default function SceneSpatialPage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [status,   setStatus]   = useState<Status>("idle");
  const [err,      setErr]      = useState<string | null>(null);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const displayRef = useRef<DisplaySource[]>([]);
  const cleanupRef = useRef<AudioCleanup>({ oscs: [], noiseSrcs: [], timers: [] });
  const drawRafRef = useRef(0);
  const dragRef    = useRef<{ idx: number } | null>(null);

  // Initialize display from scene spec (preview when idle)
  useEffect(() => {
    if (status === "idle") {
      displayRef.current = SCENES[sceneIdx].sources.map(s => ({
        label: s.label, color: s.color, pos: [...s.pos] as Pos3,
      }));
    }
  }, [sceneIdx, status]);

  // ── teardown audio ────────────────────────────────────────────────────────

  const teardownAudio = useCallback(() => {
    const cl = cleanupRef.current;
    cl.timers.forEach(t => clearInterval(t));
    cl.oscs.forEach(o => { try { o.stop(); } catch (_) {} });
    cl.noiseSrcs.forEach(n => { try { n.stop(); } catch (_) {} });
    cleanupRef.current = { oscs: [], noiseSrcs: [], timers: [] };
    void actxRef.current?.close();
    actxRef.current = null;
  }, []);

  // ── start scene ───────────────────────────────────────────────────────────

  const startScene = useCallback((idx: number) => {
    teardownAudio();
    setErr(null);
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      actxRef.current = ctx;

      const scene  = SCENES[idx];
      const reverb = ctx.createConvolver();
      reverb.buffer = buildImpulse(ctx, scene.reverbDur, scene.reverbDecay);
      reverb.connect(ctx.destination);

      const allCl: AudioCleanup = { oscs: [], noiseSrcs: [], timers: [] };

      const newDisplay: DisplaySource[] = scene.sources.map(srcDef => {
        const panner = ctx.createPanner();
        panner.panningModel  = "HRTF";
        panner.distanceModel = "linear";
        panner.refDistance   = 1;
        panner.maxDistance   = 10;
        panner.rolloffFactor = 0;
        panner.positionX.value = srcDef.pos[0];
        panner.positionY.value = srcDef.pos[1];
        panner.positionZ.value = srcDef.pos[2];
        panner.connect(ctx.destination);

        const wetSend = ctx.createGain();
        wetSend.gain.value = 0.22;
        wetSend.connect(reverb);

        const cl = buildSrcAudio(ctx, srcDef, panner, wetSend);
        allCl.oscs.push(...cl.oscs);
        allCl.noiseSrcs.push(...cl.noiseSrcs);
        allCl.timers.push(...cl.timers);

        return { label: srcDef.label, color: srcDef.color, pos: [...srcDef.pos] as Pos3, panner };
      });

      displayRef.current = newDisplay;
      cleanupRef.current = allCl;
      setStatus("running");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Audio error");
    }
  }, [teardownAudio]);

  const stop = useCallback(() => {
    teardownAudio();
    displayRef.current = SCENES[sceneIdx].sources.map(s => ({
      label: s.label, color: s.color, pos: [...s.pos] as Pos3,
    }));
    setStatus("idle");
  }, [teardownAudio, sceneIdx]);

  // ── canvas draw loop (always running) ────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      drawRafRef.current = requestAnimationFrame(draw);
      const c2d = canvas.getContext("2d");
      if (!c2d) return;
      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H) return;
      const cx = W / 2;
      const cy = H / 2;
      const R  = Math.min(cx, cy) * 0.76;

      c2d.fillStyle = "#05050f";
      c2d.fillRect(0, 0, W, H);

      // Room circle
      c2d.beginPath();
      c2d.arc(cx, cy, R, 0, Math.PI * 2);
      c2d.strokeStyle = "rgba(80,80,150,0.35)";
      c2d.lineWidth = 1;
      c2d.stroke();

      // Inner rings
      [0.5, 0.25].forEach(f => {
        c2d.beginPath();
        c2d.arc(cx, cy, R * f, 0, Math.PI * 2);
        c2d.strokeStyle = "rgba(60,60,100,0.18)";
        c2d.lineWidth = 1;
        c2d.stroke();
      });

      // Cross-hairs
      c2d.strokeStyle = "rgba(60,60,100,0.14)";
      c2d.lineWidth = 1;
      c2d.beginPath(); c2d.moveTo(cx, cy - R); c2d.lineTo(cx, cy + R); c2d.stroke();
      c2d.beginPath(); c2d.moveTo(cx - R, cy); c2d.lineTo(cx + R, cy); c2d.stroke();

      // Compass labels
      const lbls: [string, number, number][] = [
        ["F", cx, cy - R - 14],
        ["B", cx, cy + R + 14],
        ["L", cx - R - 14, cy],
        ["R", cx + R + 14, cy],
      ];
      c2d.font = "10px monospace";
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      c2d.fillStyle = "rgba(80,80,150,0.45)";
      for (const [t, x, y] of lbls) c2d.fillText(t, x, y);

      // Listener head
      c2d.beginPath(); c2d.arc(cx, cy, 10, 0, Math.PI * 2);
      c2d.fillStyle = "#1a1a3a"; c2d.fill();
      c2d.strokeStyle = "rgba(140,140,220,0.6)"; c2d.lineWidth = 1.5; c2d.stroke();
      c2d.beginPath(); c2d.moveTo(cx, cy - 10); c2d.lineTo(cx, cy - 17);
      c2d.strokeStyle = "rgba(140,140,220,0.4)"; c2d.stroke();

      // Sound sources
      const srcs = displayRef.current;
      for (const s of srcs) {
        const sx = cx + s.pos[0] * R;
        const sy = cy + s.pos[2] * R;          // z<0=front=canvas-top
        const ev = (s.pos[1] + 1) / 2;        // 0..1 elevation
        const dotR = 7 + ev * 5;

        c2d.shadowColor = s.color;
        c2d.shadowBlur  = 14 + ev * 10;
        c2d.beginPath(); c2d.arc(sx, sy, dotR, 0, Math.PI * 2);
        c2d.fillStyle = s.color; c2d.fill();
        c2d.shadowBlur = 0;

        c2d.font = "9px monospace";
        c2d.textAlign = "center";
        c2d.textBaseline = "bottom";
        c2d.fillStyle = "rgba(210,210,235,0.85)";
        c2d.fillText(s.label, sx, sy - dotR - 2);

        const elSym = s.pos[1] > 0.4 ? "▲" : s.pos[1] < -0.4 ? "▼" : "";
        if (elSym) {
          c2d.font = "8px monospace";
          c2d.fillStyle = "rgba(160,160,220,0.5)";
          c2d.fillText(elSym, sx, sy - dotR - 13);
        }
      }
    };

    drawRafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(drawRafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const w = Math.min(canvas.parentElement?.clientWidth ?? 340, 360);
      canvas.width = w; canvas.height = w;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  // ── drag — mouse ──────────────────────────────────────────────────────────

  const hitTest = useCallback((mx: number, my: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const cx = canvas.width / 2; const cy = canvas.height / 2;
    const R  = Math.min(cx, cy) * 0.76;
    for (let i = 0; i < displayRef.current.length; i++) {
      const s  = displayRef.current[i];
      const sx = cx + s.pos[0] * R;
      const sy = cy + s.pos[2] * R;
      if (Math.hypot(mx - sx, my - sy) < 22) return i;
    }
    return -1;
  }, []);

  const applyDrag = useCallback((mx: number, my: number) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2; const cy = canvas.height / 2;
    const R  = Math.min(cx, cy) * 0.76;
    let ndx = (mx - cx) / R;
    let ndz = (my - cy) / R;
    const d = Math.hypot(ndx, ndz);
    if (d > 0.97) { ndx /= d; ndz /= d; }
    const src = displayRef.current[dragRef.current.idx];
    src.pos[0] = ndx; src.pos[2] = ndz;
    if (src.panner) {
      src.panner.positionX.value = ndx;
      src.panner.positionZ.value = ndz;
    }
  }, []);

  const canvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return [
        (e.clientX - rect.left) * (canvas.width / rect.width),
        (e.clientY - rect.top)  * (canvas.height / rect.height),
      ];
    },
    [],
  );

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const [mx, my] = canvasCoords(e);
    const idx = hitTest(mx, my);
    if (idx >= 0) dragRef.current = { idx };
  }, [canvasCoords, hitTest]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const [mx, my] = canvasCoords(e);
    applyDrag(mx, my);
  }, [canvasCoords, applyDrag]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  // ── drag — touch ──────────────────────────────────────────────────────────

  const touchCoords = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>): [number, number] | null => {
      const canvas = canvasRef.current;
      if (!canvas || !e.touches[0]) return null;
      const rect = canvas.getBoundingClientRect();
      return [
        (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        (e.touches[0].clientY - rect.top)  * (canvas.height / rect.height),
      ];
    },
    [],
  );

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const coords = touchCoords(e);
    if (!coords) return;
    const idx = hitTest(coords[0], coords[1]);
    if (idx >= 0) { e.preventDefault(); dragRef.current = { idx }; }
  }, [touchCoords, hitTest]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const coords = touchCoords(e);
    if (!coords) return;
    e.preventDefault();
    applyDrag(coords[0], coords[1]);
  }, [touchCoords, applyDrag]);

  const onTouchEnd = useCallback(() => { dragRef.current = null; }, []);

  // ── cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  // ── render ────────────────────────────────────────────────────────────────

  const scene = SCENES[sceneIdx];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050510",
      color: "#dcdcf0",
      fontFamily: "monospace",
      padding: "24px 20px",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 3, color: "#b8b8e0" }}>SCENE SPATIAL</h1>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#484880", letterSpacing: 1 }}>
            GHOST SCENES AS 3D SPATIAL AUDIO — WEAR HEADPHONES
          </p>
        </div>
        <Link href="/dream" style={{ fontSize: 11, color: "#2e2e60", textDecoration: "none" }}>← dream</Link>
      </div>

      {/* Scene selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              setSceneIdx(i);
              if (status === "running") startScene(i);
            }}
            style={{
              background: i === sceneIdx ? "rgba(80,80,180,0.22)" : "transparent",
              border: i === sceneIdx ? "1px solid #5050b0" : "1px solid #1e1e40",
              color: i === sceneIdx ? "#a0a0e0" : "#404070",
              padding: "6px 11px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Tagline */}
      <div style={{ marginBottom: 16, fontSize: 12, color: "#5050a0" }}>{scene.tagline}</div>

      {/* Canvas */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ cursor: "crosshair", borderRadius: 4 }}
        />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {status === "idle" && (
          <button
            onClick={() => startScene(sceneIdx)}
            style={{
              background: "transparent",
              border: "1px solid #3a3a90",
              color: "#8888c8",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            START SCENE
          </button>
        )}
        {status === "running" && (
          <button
            onClick={stop}
            style={{
              background: "transparent",
              border: "1px solid #602020",
              color: "#905050",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            STOP
          </button>
        )}
      </div>

      {err && (
        <div style={{ color: "#c04040", fontSize: 12, marginBottom: 12 }}>{err}</div>
      )}

      {status === "running" && (
        <div style={{ fontSize: 10, color: "#333368", letterSpacing: 1, marginBottom: 12 }}>
          ● PLAYING — DRAG COLORED DOTS TO REPOSITION SOUNDS IN 3D SPACE
        </div>
      )}

      {status === "idle" && (
        <div style={{ marginTop: 24, fontSize: 11, color: "#303068", lineHeight: 1.9, maxWidth: 500 }}>
          <div style={{ color: "#4444a0", marginBottom: 6, letterSpacing: 1 }}>HOW IT WORKS</div>
          <div>Six Ghost narrative scenes, each with a hand-authored 3D soundscape.</div>
          <div>Sources placed on a sphere using Web Audio HRTF PannerNode.</div>
          <div>F=front · B=behind · L=left · R=right · ▲=above · ▼=below</div>
          <div>Drag colored dots to reposition while audio plays.</div>
          <div>All sound synthesized — oscillators, filtered noise, FM chirps. No audio files.</div>
          <div style={{ marginTop: 8, color: "#222255" }}>
            Wear headphones. HRTF illusion strongest for high-frequency sources (birds, water).
          </div>
        </div>
      )}
    </div>
  );
}
