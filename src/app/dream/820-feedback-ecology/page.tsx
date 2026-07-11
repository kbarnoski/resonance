"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * 820 · FEEDBACK ECOLOGY
 *
 * A network of coupled resonator nodes that self-organize into emergent drones
 * and polyrhythmic instabilities. No samples. No prerecorded sound. All audio
 * emerges from feedback between high-Q BiquadFilter → DelayNode → GainNode
 * loops woven into a small-world coupling graph.
 *
 * Technique: coupled dynamical-system / feedback network. Each node is a
 * damped nonlinear resonator. Coupling above a threshold drives bifurcations:
 * isolated pings → mutual entrainment → emergent polyrhythm → roaring drone.
 *
 * References:
 *   - "Musicking with dynamical systems" (ACM NIME 2024)
 *     dl.acm.org/doi/10.1145/3678299.3678302
 *   - David Tudor: Rainforest, Pulsers (feedback ecosystems, 1968–)
 *   - Toshimaru Nakamura: no-input mixing board lineage
 *   - Body Synths Laboratory self-oscillating feedback synth,
 *     Superbooth 2026, Berlin, May 7–9 2026
 *
 * Ear-safety: every signal path ends in a DynamicsCompressorNode brick-wall
 * limiter before the master gain (default 0.25). Per-node feedback gains are
 * hard-clamped. Audio does not start until an explicit user gesture.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface ResonatorNode {
  id: number;
  freq: number;   // Hz
  q: number;      // filter Q
  x: number;      // canvas position [0,1]
  y: number;
  hue: number;    // color hue (degrees)
  energy: number; // running envelope for visualizer [0,1]
  phase: number;  // phase tracker for Lissajous
}

interface Edge {
  from: number;
  to: number;
  weight: number; // [0,1] base coupling weight
}

interface AudioNodes {
  ctx: AudioContext;
  // per-node chains
  filters: BiquadFilterNode[];
  delays: DelayNode[];
  feedbackGains: GainNode[];
  outputGains: GainNode[];
  analysers: AnalyserNode[];
  // coupling gains[from][to]
  couplingGains: GainNode[][];
  // impulse source per node
  impulseGains: GainNode[];
  // master chain
  masterGain: GainNode;
  limiter: DynamicsCompressorNode;
}

type Phase = "idle" | "running" | "noaudio";

// ── Scale presets (just-intonation ratios on a fundamental) ─────────────────

const ROOT_HZ = 55; // A1 — low fundamental keeps system thumpy

const SCALE_PRESETS: Record<string, number[]> = {
  // Just-intonation overtone series (partials 1–9 on A1)
  overtone: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ROOT_HZ * n),
  // Subharmonic / utonal – feel different from overtone
  subharmonic: [1, 2, 3, 4, 6, 8, 12].map((n) => (ROOT_HZ * 12) / n),
  // Cluster (tight ratios near unison — maximal beating/interference)
  cluster: [1.0, 1.04, 1.09, 1.14, 1.19, 1.26, 1.33, 1.41, 1.5].map(
    (r) => ROOT_HZ * 4 * r
  ),
};

// Number of resonator nodes in the network
const NODE_COUNT = 8;

// Small-world graph adjacency weights: ring backbone + some cross-links
// (indices refer to the sorted node list)
function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    // ring backbone
    const next = (i + 1) % NODE_COUNT;
    edges.push({ from: i, to: next, weight: 0.7 });
    edges.push({ from: next, to: i, weight: 0.7 });
  }
  // cross-links (small-world shortcuts)
  const shortcuts: [number, number][] = [
    [0, 3],
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 0],
    [5, 2],
    [6, 1],
    [7, 4],
  ];
  for (const [a, b] of shortcuts) {
    edges.push({ from: a, to: b, weight: 0.4 });
    edges.push({ from: b, to: a, weight: 0.4 });
  }
  return edges;
}

// ── Circular node layout ─────────────────────────────────────────────────────

function buildNodes(freqs: number[]): ResonatorNode[] {
  const hues = [260, 200, 160, 300, 30, 180, 330, 80];
  return freqs.map((freq, i) => {
    const angle = (i / NODE_COUNT) * Math.PI * 2 - Math.PI / 2;
    return {
      id: i,
      freq,
      q: 28 + Math.random() * 20,
      x: 0.5 + 0.38 * Math.cos(angle),
      y: 0.5 + 0.38 * Math.sin(angle),
      hue: hues[i % hues.length],
      energy: 0,
      phase: 0,
    };
  });
}

// ── Audio engine ─────────────────────────────────────────────────────────────

function buildAudioEngine(
  freqs: number[],
  edges: Edge[]
): AudioNodes {
  const ctx = new AudioContext();

  // Brick-wall limiter → master
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;

  limiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Per-node structures
  const filters: BiquadFilterNode[] = [];
  const delays: DelayNode[] = [];
  const feedbackGains: GainNode[] = [];
  const outputGains: GainNode[] = [];
  const analysers: AnalyserNode[] = [];
  const impulseGains: GainNode[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freqs[i];
    f.Q.value = 28;

    const delay = ctx.createDelay(0.5);
    // delay tuned to just under one period of the resonant freq → feedback ring
    delay.delayTime.value = Math.min(0.5, 1 / freqs[i]);

    const fbGain = ctx.createGain();
    fbGain.gain.value = 0.0; // filled in later by slider

    const outGain = ctx.createGain();
    outGain.gain.value = 0.55;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    const impulse = ctx.createGain();
    impulse.gain.value = 1;

    // Signal path: impulse → filter → delay → feedbackGain → (back to filter)
    //                                        → outputGain → analyser → limiter
    impulse.connect(f);
    f.connect(delay);
    delay.connect(fbGain);
    fbGain.connect(f); // feedback loop
    f.connect(outGain);
    outGain.connect(analyser);
    analyser.connect(limiter);

    filters.push(f);
    delays.push(delay);
    feedbackGains.push(fbGain);
    outputGains.push(outGain);
    analysers.push(analyser);
    impulseGains.push(impulse);
  }

  // Coupling gains: each edge has its own GainNode
  // couplingGains[from][to] routes filter[from] output → filter[to] input
  const couplingGains: GainNode[][] = Array.from({ length: NODE_COUNT }, () =>
    Array(NODE_COUNT).fill(null)
  );

  for (const edge of edges) {
    const g = ctx.createGain();
    g.gain.value = 0; // filled in later
    filters[edge.from].connect(g);
    g.connect(filters[edge.to]);
    couplingGains[edge.from][edge.to] = g;
  }

  return {
    ctx,
    filters,
    delays,
    feedbackGains,
    outputGains,
    analysers,
    couplingGains,
    impulseGains,
    masterGain,
    limiter,
  };
}

// ── Ear-safety clamped setters ───────────────────────────────────────────────

// Max self-feedback gain — above 0.92 is unstable (intentional at high coupling)
// but we clamp to prevent uncontrolled runaway.
const MAX_FB_GAIN = 0.88;
const MAX_COUPLING = 0.35;

function applyFeedbackGain(audio: AudioNodes, selfFb: number): void {
  const clamped = Math.min(selfFb, MAX_FB_GAIN);
  for (const g of audio.feedbackGains) {
    g.gain.setTargetAtTime(clamped, audio.ctx.currentTime, 0.05);
  }
}

function applyCoupling(
  audio: AudioNodes,
  edges: Edge[],
  coupling: number
): void {
  const clamped = Math.min(coupling, MAX_COUPLING);
  for (const edge of edges) {
    const g = audio.couplingGains[edge.from]?.[edge.to];
    if (g) {
      g.gain.setTargetAtTime(
        clamped * edge.weight,
        audio.ctx.currentTime,
        0.08
      );
    }
  }
}

function applyMasterVolume(audio: AudioNodes, vol: number): void {
  audio.masterGain.gain.setTargetAtTime(vol, audio.ctx.currentTime, 0.05);
}

function applyMute(audio: AudioNodes): void {
  audio.masterGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.01);
}

// Fire a short noise burst into node i — kicks the dynamical system
function injectImpulse(audio: AudioNodes, nodeIdx: number): void {
  const ctx = audio.ctx;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let k = 0; k < data.length; k++) {
    data[k] = (Math.random() * 2 - 1) * 0.6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(audio.impulseGains[nodeIdx]);
  src.start();
}

// Read RMS energy from analyser (0→1)
function readEnergy(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = (buf[i] - 128) / 128;
    sum += s * s;
  }
  return Math.sqrt(sum / buf.length);
}

// ── Canvas renderer ──────────────────────────────────────────────────────────

function drawFrame(
  canvas: HTMLCanvasElement,
  nodes: ResonatorNode[],
  edges: Edge[],
  coupling: number,
  phaseHistory: Float32Array[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Dark background
  ctx.fillStyle = "#05060d";
  ctx.fillRect(0, 0, W, H);

  // Draw edges first
  for (const edge of edges) {
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;
    const energyFlow = Math.min((a.energy + b.energy) * 0.5, 1);
    const alpha = 0.08 + energyFlow * 0.45 * coupling * 3;
    const strokeW = 0.5 + energyFlow * edge.weight * coupling * 8;
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${a.hue}, 70%, 55%, ${alpha})`;
    ctx.lineWidth = strokeW;
    ctx.moveTo(a.x * W, a.y * H);
    ctx.lineTo(b.x * W, b.y * H);
    ctx.stroke();
  }

  // Flow particles along edges (animate using sin wave)
  const t = Date.now() / 1000;
  for (const edge of edges) {
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;
    const energy = a.energy;
    if (energy < 0.02) continue;
    // 2–4 particles per edge
    const numP = 2 + Math.floor(coupling * 3);
    for (let p = 0; p < numP; p++) {
      const progress = ((t * (0.4 + energy * 0.8) + p / numP + edge.from * 0.13) % 1 + 1) % 1;
      const px = a.x * W + (b.x - a.x) * W * progress;
      const py = a.y * H + (b.y - a.y) * H * progress;
      const r = 1.5 + energy * 3 * edge.weight;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${a.hue}, 90%, 70%, ${energy * 0.7})`;
      ctx.fill();
    }
  }

  // Draw phase-space mini-traces (Lissajous) inside each node
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const hist = phaseHistory[i];
    if (!hist) continue;
    const cx = node.x * W;
    const cy = node.y * H;
    const r = 22 + node.energy * 28;

    // Draw phase trace inside node circle
    if (node.energy > 0.01 && hist.length >= 4) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      const histLen = hist.length;
      const step = 2;
      for (let j = 0; j < histLen - step; j += step) {
        const x1 = cx + hist[j] * r * 0.85;
        const y1 = cy + hist[j + 1] * r * 0.85;
        if (j === 0) {
          ctx.moveTo(x1, y1);
        } else {
          ctx.lineTo(x1, y1);
        }
      }
      const alpha = Math.min(node.energy * 1.2, 0.55);
      ctx.strokeStyle = `hsla(${node.hue}, 80%, 70%, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Glow rings
    const glowRadius = r + 8 + node.energy * 24;
    const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowRadius);
    grd.addColorStop(0, `hsla(${node.hue}, 80%, 65%, ${0.18 + node.energy * 0.45})`);
    grd.addColorStop(0.5, `hsla(${node.hue}, 70%, 55%, ${node.energy * 0.15})`);
    grd.addColorStop(1, `hsla(${node.hue}, 60%, 45%, 0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Node body
    const bodyGrd = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 1, cx, cy, r);
    const brightness = 35 + node.energy * 40;
    bodyGrd.addColorStop(0, `hsla(${node.hue}, 75%, ${brightness + 20}%, 0.95)`);
    bodyGrd.addColorStop(0.6, `hsla(${node.hue}, 65%, ${brightness}%, 0.85)`);
    bodyGrd.addColorStop(1, `hsla(${node.hue}, 55%, ${brightness - 10}%, 0.7)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrd;
    ctx.fill();

    // Ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${node.hue}, 80%, 75%, ${0.3 + node.energy * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Node label
    ctx.fillStyle = `rgba(255,255,255,${0.55 + node.energy * 0.4})`;
    ctx.font = `bold ${Math.round(10 + node.energy * 4)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1}`, cx, cy);
  }

  // Energy history bar at bottom (mini spectral strip)
  const barH = 4;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const bw = W / nodes.length;
    const alpha = 0.15 + node.energy * 0.7;
    ctx.fillStyle = `hsla(${node.hue}, 75%, 60%, ${alpha})`;
    ctx.fillRect(i * bw, H - barH, bw - 1, barH);
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function FeedbackEcologyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioNodes | null>(null);
  const nodesRef = useRef<ResonatorNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const rafRef = useRef<number>(0);
  const analyserBufRef = useRef<Uint8Array>(new Uint8Array(256));
  // Phase history per node for Lissajous trace: rolling X/Y pairs
  const phaseHistRef = useRef<Float32Array[]>([]);
  const phaseIdxRef = useRef<number[]>([]);
  const HIST_LEN = 64; // pairs → 32 XY points

  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [coupling, setCoupling] = useState(0.18);
  const [selfFeedback, setSelfFeedback] = useState(0.55);
  const [scaleName, setScaleName] = useState<string>("overtone");
  const [showNotes, setShowNotes] = useState(false);

  // Build nodes once on mount and when scale changes
  const rebuildNodes = useCallback((name: string) => {
    const freqs = SCALE_PRESETS[name] ?? SCALE_PRESETS.overtone;
    const nodeFreqs = freqs.slice(0, NODE_COUNT);
    nodesRef.current = buildNodes(nodeFreqs);
    edgesRef.current = buildEdges();
    phaseHistRef.current = Array.from({ length: NODE_COUNT }, () =>
      new Float32Array(HIST_LEN)
    );
    phaseIdxRef.current = Array(NODE_COUNT).fill(0);
  }, []);

  // ── Start audio ──────────────────────────────────────────────────────────

  const startAudio = useCallback(async () => {
    if (!nodesRef.current.length) rebuildNodes(scaleName);
    const freqs = nodesRef.current.map((n) => n.freq);
    const audio = buildAudioEngine(freqs, edgesRef.current);
    audioRef.current = audio;

    try {
      await audio.ctx.resume();
    } catch {
      setPhase("noaudio");
      return;
    }

    // Gentle startup: low coupling + self-feedback
    applyFeedbackGain(audio, 0.0);
    applyCoupling(audio, edgesRef.current, 0.0);
    applyMasterVolume(audio, volume);

    // Ramp to target over 2 s so there's no blast on start
    const rampSteps = 40;
    let step = 0;
    const ramp = setInterval(() => {
      step++;
      const t = step / rampSteps;
      applyFeedbackGain(audio, selfFeedback * t * 0.7);
      applyCoupling(audio, edgesRef.current, coupling * t * 0.6);
      if (step >= rampSteps) {
        clearInterval(ramp);
        applyFeedbackGain(audio, selfFeedback);
        applyCoupling(audio, edgesRef.current, coupling);
        // Seed all nodes with a gentle impulse to kick the system alive
        for (let i = 0; i < NODE_COUNT; i++) {
          setTimeout(() => injectImpulse(audio, i), i * 80);
        }
      }
    }, 50);

    setPhase("running");
  }, [scaleName, volume, coupling, selfFeedback, rebuildNodes]);

  // ── Coupling / feedback slider handlers ─────────────────────────────────

  const handleCoupling = useCallback(
    (val: number) => {
      setCoupling(val);
      if (audioRef.current) {
        applyCoupling(audioRef.current, edgesRef.current, val);
      }
    },
    []
  );

  const handleSelfFeedback = useCallback(
    (val: number) => {
      setSelfFeedback(val);
      if (audioRef.current) {
        applyFeedbackGain(audioRef.current, val);
      }
    },
    []
  );

  const handleVolume = useCallback(
    (val: number) => {
      setVolume(val);
      if (audioRef.current && !muted) {
        applyMasterVolume(audioRef.current, val);
      }
    },
    [muted]
  );

  const handleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (muted) {
      applyMasterVolume(audioRef.current, volume);
      setMuted(false);
    } else {
      applyMute(audioRef.current);
      setMuted(true);
    }
  }, [muted, volume]);

  // ── Scale preset change ──────────────────────────────────────────────────

  const handleScale = useCallback(
    (name: string) => {
      setScaleName(name);
      if (phase === "running" && audioRef.current) {
        // Update filter frequencies in-place
        const freqs = (SCALE_PRESETS[name] ?? SCALE_PRESETS.overtone).slice(0, NODE_COUNT);
        for (let i = 0; i < NODE_COUNT; i++) {
          if (nodesRef.current[i]) nodesRef.current[i].freq = freqs[i];
          if (audioRef.current.filters[i]) {
            audioRef.current.filters[i].frequency.setTargetAtTime(
              freqs[i],
              audioRef.current.ctx.currentTime,
              0.3
            );
          }
        }
      } else {
        rebuildNodes(name);
      }
    },
    [phase, rebuildNodes]
  );

  // ── Canvas tap handler ───────────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (phase !== "running" || !audioRef.current || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const t = e.touches[0] ?? e.changedTouches[0];
        if (!t) return;
        clientX = t.clientX;
        clientY = t.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;

      // Find nearest node within 0.12 radius
      let best = -1;
      let bestDist = 0.12;
      for (let i = 0; i < nodesRef.current.length; i++) {
        const n = nodesRef.current[i];
        const d = Math.hypot(n.x - px, n.y - py);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best >= 0) {
        injectImpulse(audioRef.current, best);
      } else {
        // Tap empty space — inject all nodes weakly
        for (let i = 0; i < NODE_COUNT; i++) {
          setTimeout(() => {
            if (audioRef.current) injectImpulse(audioRef.current, i);
          }, i * 40);
        }
      }
    },
    [phase]
  );

  // ── Animation / analysis loop ────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let W = 0;
    let H = 0;

    const resize = () => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const buf = new Uint8Array(256);
    analyserBufRef.current = buf;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const audio = audioRef.current;
      if (!audio) return;
      const nodes = nodesRef.current;

      // Update energy per node
      for (let i = 0; i < nodes.length; i++) {
        const e = readEnergy(audio.analysers[i], buf);
        // Smooth envelope
        nodes[i].energy = nodes[i].energy * 0.88 + e * 0.12;

        // Build phase-space trace: X = current sample, Y = adjacent delayed sample
        audio.analysers[i].getByteTimeDomainData(buf);
        const xSig = (buf[0] - 128) / 128;
        const ySig = (buf[Math.floor(buf.length / 4)] - 128) / 128;
        const hist = phaseHistRef.current[i];
        const idx = phaseIdxRef.current[i];
        if (hist) {
          hist[idx % HIST_LEN] = xSig;
          hist[(idx + 1) % HIST_LEN] = ySig;
          phaseIdxRef.current[i] = (idx + 2) % HIST_LEN;
        }
      }

      drawFrame(canvas, nodes, edgesRef.current, coupling, phaseHistRef.current);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Draw idle state ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "idle") return;
    rebuildNodes(scaleName);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();

    const emptyHist = Array.from({ length: NODE_COUNT }, () => new Float32Array(HIST_LEN));
    drawFrame(canvas, nodesRef.current, edgesRef.current, 0.18, emptyHist);
  }, [phase, scaleName, rebuildNodes]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        applyMute(audioRef.current);
        setTimeout(() => {
          audioRef.current?.ctx.close().catch(() => undefined);
        }, 200);
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05060d]">
      {/* Header */}
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-2xl font-bold text-foreground">Feedback Ecology</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[36px] rounded px-3 py-1 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:text-foreground"
            >
              {showNotes ? "close notes" : "design notes"}
            </button>
            <Link
              href="/dream"
              className="flex items-center font-mono text-base text-muted-foreground transition hover:text-muted-foreground"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="text-base text-muted-foreground">
          A self-organizing network of feedback resonators — tap nodes to perturb the ecology, watch energy
          circulate and self-organize into emergent drones and polyrhythm.
        </p>
      </header>

      {/* Design notes panel */}
      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 rounded-lg bg-black/60 p-4 font-mono text-base text-muted-foreground backdrop-blur-sm ring-1 ring-border">
          <p className="mb-2">
            <strong className="text-foreground">Technique:</strong> {NODE_COUNT} coupled BiquadFilter (bandpass,
            high-Q) → DelayNode → feedback GainNode loops wired into a small-world graph.
            Coupling above a threshold drives bifurcations: isolated pings → mutual entrainment →
            emergent polyrhythm → roaring drone. The network evolves on its own — minute 2 differs
            from minute 0.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Ear-safety:</strong> DynamicsCompressor brick-wall limiter
            (threshold −8 dB, ratio 20) before master gain (default 0.25). Per-node feedback and
            coupling gains are hard-clamped. Gentle 2-second ramp on start. Panic mute button always
            visible.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Visualization:</strong> Node brightness/size = energy.
            Edge flow particles = coupling × signal transfer. Phase-space Lissajous trace inside each
            node shows limit cycle formation.
          </p>
          <p className="text-muted-foreground">
            Refs: &ldquo;Musicking with dynamical systems&rdquo; (ACM NIME 2024,
            dl.acm.org/doi/10.1145/3678299.3678302); David Tudor&apos;s Rainforest/Pulsers feedback
            ecosystems; Toshimaru Nakamura no-input mixing board; Body Synths Laboratory
            self-oscillating feedback synth, Superbooth 2026 (Berlin, May 7&ndash;9 2026).
          </p>
          <p className="mt-2 text-muted-foreground">
            Next-cycle deepening: add Lorenz-attractor coupling weights that drift over time;
            per-node waveform display; recording/export.
          </p>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair"
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
        />

        {/* Idle overlay */}
        {phase === "idle" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#05060d]/75 backdrop-blur-sm">
            <div className="max-w-sm space-y-3 px-6 text-center">
              <p className="text-base text-muted-foreground">
                Eight resonators feed each other through a small-world coupling graph. Raise coupling and
                the network self-organizes — nodes entrain, energy circulates, rhythmic instabilities emerge.
              </p>
              <p className="font-mono text-base text-violet-300/80">
                Tap nodes to perturb the ecology. Use headphones.
              </p>
            </div>
            <button
              type="button"
              onClick={startAudio}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-8 py-3 font-mono text-xl font-semibold text-violet-300 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30 active:scale-95"
            >
              Awaken the Ecology
            </button>
          </div>
        )}

        {/* No audio notice */}
        {phase === "noaudio" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
            <p className="max-w-sm text-center text-base text-violet-300">
              Web Audio is unavailable in this browser. Try Chrome, Firefox, or Safari with audio
              permissions enabled.
            </p>
          </div>
        )}
      </div>

      {/* Controls panel */}
      {phase === "running" && (
        <div className="relative z-10 flex flex-col gap-3 border-t border-border bg-black/40 px-4 py-3 backdrop-blur-sm">
          {/* Row 1: scale presets + mute */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base text-muted-foreground">tuning:</span>
            {Object.keys(SCALE_PRESETS).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleScale(name)}
                className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base transition ${
                  scaleName === name
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/40"
                    : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-accent"
                }`}
              >
                {name}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={handleMute}
                className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
                  muted
                    ? "bg-violet-500/25 text-violet-300 ring-violet-400/40"
                    : "bg-muted text-muted-foreground ring-border hover:bg-accent"
                }`}
              >
                {muted ? "unmute" : "panic mute"}
              </button>
            </div>
          </div>

          {/* Row 2: sliders */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SliderControl
              label="coupling"
              hint="bifurcation control"
              value={coupling}
              min={0}
              max={1}
              step={0.01}
              onChange={handleCoupling}
              accentColor="violet"
            />
            <SliderControl
              label="self-resonance"
              hint="edge of chaos"
              value={selfFeedback}
              min={0}
              max={0.88}
              step={0.01}
              onChange={handleSelfFeedback}
              accentColor="cyan"
            />
            <SliderControl
              label="master volume"
              hint="always safe"
              value={volume}
              min={0}
              max={0.9}
              step={0.01}
              onChange={handleVolume}
              accentColor="emerald"
            />
          </div>

          <p className="font-mono text-base text-muted-foreground">
            Tap a node to inject energy · tap empty space to seed all nodes
          </p>
        </div>
      )}
    </main>
  );
}

// ── Slider sub-component ─────────────────────────────────────────────────────

interface SliderControlProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accentColor: "violet" | "cyan" | "emerald";
}

const ACCENT_CLASSES: Record<string, string> = {
  violet: "accent-violet-400",
  cyan: "accent-violet-400",
  emerald: "accent-violet-400",
};

function SliderControl({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  accentColor,
}: SliderControlProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-base text-foreground">{label}</span>
        <span className="font-mono text-base text-muted-foreground">{pct}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full cursor-pointer ${ACCENT_CLASSES[accentColor] ?? "accent-violet-400"}`}
      />
      <span className="font-mono text-base text-muted-foreground">{hint}</span>
    </div>
  );
}
