"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FREQ_MIN,
  FREQ_MAX,
  POP_INIT,
  createOrganism,
  stepSim,
  buildReverbIR,
  attachAudio,
  updateAudio,
  detachAudio,
  type Organism,
  type SimState,
} from "./engine";

// ── Constants ──────────────────────────────────────────────────────────────────

const SVG_W = 800;
const SVG_H = 560;
const SIM_INTERVAL_MS = 50;   // ~20 Hz sim tick
const MAX_CONNECTIONS = 30;    // max consonant-pair threads drawn
const CONSONANCE_LINK_THRESH = 0.15;

// Colour palette for organisms (violet → blue → teal → green → amber)
const PETAL_COLORS = [
  "#a78bfa", "#8b5cf6", "#7c3aed", // violets
  "#60a5fa", "#3b82f6", "#2563eb", // blues
  "#34d399", "#10b981", "#059669", // teals
  "#fbbf24", "#f59e0b", "#d97706", // ambers
  "#f472b6", "#ec4899", "#db2777", // pinks
];

function pickColor(id: number): string {
  return PETAL_COLORS[id % PETAL_COLORS.length];
}

// ── Frequency → Y coordinate mapping ─────────────────────────────────────────

function freqToSvgY(freq: number): number {
  const logMin = Math.log2(FREQ_MIN);
  const logMax = Math.log2(FREQ_MAX);
  const t = (Math.log2(freq) - logMin) / (logMax - logMin);
  // High freq = top (small y), low freq = bottom (large y)
  return SVG_H * 0.08 + (1 - t) * (SVG_H * 0.84);
}

// ── SVG drawing helpers ────────────────────────────────────────────────────────

function drawStem(x: number, bottomY: number, topY: number, health: number, color: string, sway: number): string {
  // Stable per-organism bow (no per-frame jitter); gentle sway from Kuramoto phase
  const midX = x + sway;
  const cp1Y = bottomY - (bottomY - topY) * 0.3;
  const cp2Y = bottomY - (bottomY - topY) * 0.7;
  const opacity = Math.max(0.15, Math.min(0.85, health));
  const strokeWidth = 1.2 + health * 1.8;
  return `<path d="M${x},${bottomY} C${midX},${cp1Y} ${x},${cp2Y} ${x},${topY}" stroke="${color}" stroke-width="${strokeWidth.toFixed(1)}" stroke-opacity="${opacity.toFixed(2)}" fill="none" stroke-linecap="round"/>`;
}

function drawBloom(org: Organism, svgX: number, svgY: number, color: string): string {
  const health = org.health;
  const consonance = org.consonance;

  // Bloom size grows with health
  const baseR = 8 + health * 22;
  // Petals open as health rises above 0.3
  const petalOpen = Math.max(0, (health - 0.25) / 0.75);
  // Phase-driven breathing pulse
  const pulse = 1 + 0.12 * Math.sin(org.phase) * health;
  const r = baseR * pulse;

  const nPetals = 5 + Math.floor(health * 3); // 5–8 petals
  const petalR = r * 0.65 * petalOpen;
  const glowR = r * 1.6;
  const gradId = `g${org.id}`;
  const glowId = `gw${org.id}`;

  // Wilt: dull & closed; Bloom: bright & open
  const brightness = 0.4 + health * 0.6;
  const alpha = Math.max(0.1, Math.min(1, health * 1.3));

  let out = `<defs>
    <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${(alpha * brightness).toFixed(2)}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${(alpha * 0.25).toFixed(2)}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  // Outer glow aura
  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${glowR.toFixed(1)}" fill="url(#${glowId})"/>`;

  // Petals
  if (petalOpen > 0.05) {
    for (let p = 0; p < nPetals; p++) {
      const angle = (p / nPetals) * Math.PI * 2 + org.phase * 0.15;
      const px = svgX + Math.cos(angle) * petalR;
      const py = svgY + Math.sin(angle) * petalR;
      const pr = petalR * 0.6 * petalOpen;
      out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${pr.toFixed(1)}" ry="${(pr * 0.65).toFixed(1)}" fill="${color}" fill-opacity="${(alpha * brightness * 0.7).toFixed(2)}" transform="rotate(${(angle * 180 / Math.PI).toFixed(1)},${px.toFixed(1)},${py.toFixed(1)})"/>`;
    }
  }

  // Core
  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${(r * 0.45).toFixed(1)}" fill="url(#${gradId})"/>`;

  // Small bright center dot
  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${(3 + health * 5).toFixed(1)}" fill="${color}" fill-opacity="${(alpha * 0.9).toFixed(2)}"/>`;

  // Dissonance indicator: dim red ring when consonance < -0.1
  if (consonance < -0.1) {
    const disR = r * 1.2;
    const disAlpha = Math.min(0.6, Math.abs(consonance) * 0.8);
    out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${disR.toFixed(1)}" fill="none" stroke="#ef4444" stroke-opacity="${disAlpha.toFixed(2)}" stroke-width="1.5"/>`;
  }

  return out;
}

function drawConnectionThreads(organisms: Organism[], xMap: Map<number, number>): string {
  const living = organisms.filter((o) => o.alive);
  const pairs: Array<{ a: Organism; b: Organism; score: number }> = [];

  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const a = living[i];
      const b = living[j];
      // Rough consonance heuristic: both positive consonance
      const score = (a.consonance + b.consonance) / 2;
      if (score > CONSONANCE_LINK_THRESH) {
        pairs.push({ a, b, score });
      }
    }
  }

  // Sort by score desc, cap
  pairs.sort((p, q) => q.score - p.score);
  pairs.splice(MAX_CONNECTIONS);

  return pairs.map(({ a, b, score }) => {
    const ax = xMap.get(a.id) ?? SVG_W / 2;
    const ay = freqToSvgY(a.freq);
    const bx = xMap.get(b.id) ?? SVG_W / 2;
    const by = freqToSvgY(b.freq);

    // Phase coupling pulse
    const phaseDiff = Math.abs(Math.sin((a.phase - b.phase) / 2));
    const pulseOpacity = 0.06 + score * 0.18 * (1 - phaseDiff * 0.5);
    const strokeW = 0.8 + score * 1.5;

    const color = pickColor(a.id);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2 - 20;

    return `<path d="M${ax.toFixed(0)},${ay.toFixed(0)} Q${cx.toFixed(0)},${cy.toFixed(0)} ${bx.toFixed(0)},${by.toFixed(0)}" stroke="${color}" stroke-opacity="${pulseOpacity.toFixed(3)}" stroke-width="${strokeW.toFixed(1)}" fill="none"/>`;
  }).join("");
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtHz(f: number): string {
  return f < 1000 ? `${f.toFixed(1)} Hz` : `${(f / 1000).toFixed(2)} kHz`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ConchordalGarden() {
  const [running, setRunning] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [stats, setStats] = useState({ elapsed: 0, pop: 0, meanC: 0 });

  // Refs holding mutable sim state
  const stateRef = useRef<SimState>({
    organisms: [],
    time: 0,
    elapsed: 0,
    meanConsonance: 0,
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const xPosRef = useRef<Map<number, number>>(new Map());

  // Stable x position per organism id
  const getOrgX = useCallback((org: Organism): number => {
    const xm = xPosRef.current;
    if (!xm.has(org.id)) {
      xm.set(org.id, 40 + Math.random() * (SVG_W - 80));
    }
    return xm.get(org.id)!;
  }, []);

  // ── SVG render (called from rAF) ────────────────────────────────────────────

  const renderSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const state = stateRef.current;
    const living = state.organisms.filter((o) => o.alive);

    // Build SVG innerHTML
    let html = "";

    // Background gradient
    html += `<defs>
      <radialGradient id="bgGrad" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#0f0a1e"/>
        <stop offset="100%" stop-color="#050308"/>
      </radialGradient>
      <filter id="blur1" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      <filter id="blur2" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="8"/>
      </filter>
    </defs>`;

    html += `<rect width="${SVG_W}" height="${SVG_H}" fill="url(#bgGrad)"/>`;

    // Frequency guide lines (subtle)
    const guideFreqs = [130, 174, 220, 261, 330, 440, 523, 659, 780];
    for (const gf of guideFreqs) {
      if (gf < FREQ_MIN || gf > FREQ_MAX) continue;
      const gy = freqToSvgY(gf);
      html += `<line x1="0" y1="${gy.toFixed(0)}" x2="${SVG_W}" y2="${gy.toFixed(0)}" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>`;
      html += `<text x="6" y="${(gy - 3).toFixed(0)}" fill="#ffffff" fill-opacity="0.18" font-size="9" font-family="monospace">${fmtHz(gf)}</text>`;
    }

    // Connection threads between consonant pairs
    html += drawConnectionThreads(living, xPosRef.current);

    // Draw organisms
    for (const org of living) {
      const sx = getOrgX(org);
      const sy = freqToSvgY(org.freq);
      const groundY = SVG_H * 0.95;
      const color = pickColor(org.id);

      // Stem (gentle breathing sway from Kuramoto phase — stable, no jitter)
      if (org.health > 0.08) {
        const sway = Math.sin(org.phase) * 6 * org.health;
        html += drawStem(sx, groundY, sy, org.health, color, sway);
      }

      // Bloom
      html += drawBloom(org, sx, sy, color);
    }

    // Ground line
    html += `<line x1="0" y1="${(SVG_H * 0.95).toFixed(0)}" x2="${SVG_W}" y2="${(SVG_H * 0.95).toFixed(0)}" stroke="#3d2060" stroke-opacity="0.5" stroke-width="1.5"/>`;

    svg.innerHTML = html;
  }, [getOrgX]);

  // ── Animation loop ──────────────────────────────────────────────────────────

  const animLoop = useCallback(() => {
    const state = stateRef.current;
    const ctx = ctxRef.current;

    if (ctx && ctx.state !== "closed") {
      const living = state.organisms.filter((o) => o.alive);
      for (const org of living) {
        updateAudio(org, ctx);
      }
    }

    renderSvg();

    setStats({
      elapsed: state.elapsed,
      pop: state.organisms.filter((o) => o.alive).length,
      meanC: state.meanConsonance,
    });

    rafRef.current = requestAnimationFrame(animLoop);
  }, [renderSvg]);

  // ── Sim tick (runs at ~20 Hz) ───────────────────────────────────────────────

  const runSimTick = useCallback(() => {
    const state = stateRef.current;
    const ctx = ctxRef.current;
    const masterGain = masterGainRef.current;
    const dt = SIM_INTERVAL_MS / 1000;

    const dead = stepSim(state, dt);

    // Detach audio for dead organisms
    if (ctx && masterGain) {
      for (const d of dead) {
        detachAudio(d, ctx);
      }

      // Attach audio for new organisms that don't have it yet
      for (const org of state.organisms.filter((o) => o.alive && !o.oscs)) {
        attachAudio(org, ctx, masterGain);
      }
    }
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (running) return;

    // Init organisms
    const organisms: Organism[] = [];
    for (let i = 0; i < POP_INIT; i++) {
      organisms.push(createOrganism());
    }
    stateRef.current = {
      organisms,
      time: 0,
      elapsed: 0,
      meanConsonance: 0,
    };
    xPosRef.current = new Map();

    // Web Audio
    let audioWorking = true;
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGainRef.current = masterGain;

      // Reverb
      try {
        const reverb = ctx.createConvolver();
        reverb.buffer = buildReverbIR(ctx);
        const reverbGain = ctx.createGain();
        reverbGain.gain.value = 0.3;
        masterGain.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(ctx.destination);
      } catch {
        // no reverb fallback
      }

      // Dry path
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.02;
      comp.release.value = 0.3;
      masterGain.connect(dryGain);
      dryGain.connect(comp);
      comp.connect(ctx.destination);

      // Attach audio for initial organisms
      for (const org of organisms) {
        attachAudio(org, ctx, masterGain);
      }
    } catch {
      audioWorking = false;
      setAudioOk(false);
    }

    setAudioOk(audioWorking);
    setRunning(true);

    // Sim timer
    simTimerRef.current = setInterval(runSimTick, SIM_INTERVAL_MS);

    // Animation loop
    rafRef.current = requestAnimationFrame(animLoop);
  }, [running, animLoop, runSimTick]);

  // ── Stop ────────────────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (!running) return;

    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const ctx = ctxRef.current;
    if (ctx) {
      for (const org of stateRef.current.organisms) {
        detachAudio(org, ctx);
      }
      ctx.close().catch(() => { /* ignore */ });
      ctxRef.current = null;
      masterGainRef.current = null;
    }

    setRunning(false);
  }, [running]);

  // ── Plant seed on click ──────────────────────────────────────────────────────

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!running) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    // Map y back to frequency (inverse of freqToSvgY)
    // relY = 0.08 + (1-t)*0.84 → t = 1 - (relY - 0.08) / 0.84
    const t = 1 - (relY - 0.08) / 0.84;
    const logMin = Math.log2(FREQ_MIN);
    const logMax = Math.log2(FREQ_MAX);
    const freq = Math.pow(2, logMin + t * (logMax - logMin));
    const clamped = Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq));

    const state = stateRef.current;
    if (state.organisms.filter((o) => o.alive).length < 40) {
      const newOrg = createOrganism(clamped);
      const relX = (e.clientX - rect.left) / rect.width;
      xPosRef.current.set(newOrg.id, 40 + relX * (SVG_W - 80));
      state.organisms.push(newOrg);

      const ctx = ctxRef.current;
      const mg = masterGainRef.current;
      if (ctx && mg) {
        attachAudio(newOrg, ctx, mg);
      }
    }
  }, [running]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => { /* ignore */ });
      }
    };
  }, []);

  // ── Mean consonance bar colour ───────────────────────────────────────────────

  const cScore = stats.meanC;
  const cPct = Math.round(Math.max(0, Math.min(1, (cScore + 0.5) / 1)) * 100);
  const cColor =
    cScore > 0.2 ? "bg-violet-400" : cScore > 0 ? "bg-violet-400" : "bg-violet-400";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#05030a] text-foreground flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Conchordal Garden
        </h1>
        <p className="text-base text-muted-foreground mt-1 max-w-2xl">
          A living ecosystem of sound-organisms that drift through pitch space
          hunting consonance — no scale, no conductor, just emergent harmony.
        </p>
      </div>

      {/* Audio warning */}
      {!audioOk && (
        <p className="px-4 py-2 text-violet-300 text-base">
          Web Audio unavailable — visual simulation running without sound.
        </p>
      )}

      {/* SVG garden */}
      <div className="flex-1 px-4 py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full max-w-4xl mx-auto block rounded-xl border border-border bg-[#050308] cursor-crosshair"
          style={{ aspectRatio: `${SVG_W}/${SVG_H}` }}
          onClick={handleSvgClick}
          aria-label="Conchordal Garden — click to plant a seed"
        >
          {/* Placeholder before start */}
          {!running && (
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              fill="#a78bfa"
              fillOpacity="0.6"
              fontSize="18"
              fontFamily="monospace"
            >
              Press Start to grow the garden
            </text>
          )}
        </svg>
      </div>

      {/* Stats bar */}
      <div className="px-4 pb-2 flex flex-wrap gap-6 items-center text-base font-mono text-muted-foreground">
        <span>
          <span className="text-violet-300">time</span>{" "}
          <span className="text-foreground">{fmtTime(stats.elapsed)}</span>
        </span>
        <span>
          <span className="text-violet-300">pop</span>{" "}
          <span className="text-foreground">{stats.pop}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-violet-300">consonance</span>
          <span
            className={`inline-block h-2 rounded-full transition-all ${cColor}`}
            style={{ width: `${Math.max(4, cPct)}px` }}
          />
          <span className="text-foreground">{cScore.toFixed(2)}</span>
        </span>
      </div>

      {/* Controls */}
      <div className="px-4 pb-6 flex gap-3 flex-wrap">
        {!running ? (
          <button
            onClick={handleStart}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-foreground text-base font-semibold transition-colors"
          >
            Start Garden
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-muted hover:bg-accent text-foreground text-base font-semibold transition-colors"
          >
            Stop
          </button>
        )}
        <span className="text-muted-foreground text-base self-center">
          {running ? "Click garden to plant a seed" : ""}
        </span>
      </div>

      {/* Legend */}
      <div className="px-4 pb-8 text-muted-foreground text-base max-w-2xl space-y-1">
        <p>
          <span className="text-violet-300 font-mono">bloom</span> — consonant
          organisms glow and open petals; dissonant ones wilt with a red ring.
        </p>
        <p>
          <span className="text-violet-300 font-mono">threads</span> — arcs
          connect strongly consonant pairs; they pulse with shared Kuramoto
          phase.
        </p>
        <p>
          <span className="text-violet-300 font-mono">vertical axis</span> —
          pitch (log scale, {FREQ_MIN}–{FREQ_MAX} Hz, low at bottom).
        </p>
      </div>
    </div>
  );
}
