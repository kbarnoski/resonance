"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
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
  extractFftPeaks,
  detectFundamental,
  scheduleDemoPhrase,
  resetTemperature,
  type Organism,
  type SimState,
  type HeardPartial,
} from "./engine";

// ── Constants ──────────────────────────────────────────────────────────────────

const SVG_W = 900;
const SVG_H = 560;
const SIM_INTERVAL_MS = 50;
const MAX_CONNECTIONS = 28;
const CONSONANCE_LINK_THRESH = 0.12;
const FFT_SIZE = 2048;

// Colour palette
const PETAL_COLORS = [
  "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed",
  "#93c5fd", "#60a5fa", "#3b82f6",
  "#6ee7b7", "#34d399", "#10b981",
  "#fde68a", "#fbbf24", "#f59e0b",
  "#f9a8d4", "#f472b6", "#ec4899",
];

// ── Helpers (non-hook prefix) ─────────────────────────────────────────────────

function pickColor(id: number): string {
  return PETAL_COLORS[id % PETAL_COLORS.length];
}

function freqToSvgY(freq: number): number {
  const logMin = Math.log2(FREQ_MIN);
  const logMax = Math.log2(FREQ_MAX);
  const t = (Math.log2(Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq))) - logMin) / (logMax - logMin);
  return SVG_H * 0.06 + (1 - t) * (SVG_H * 0.86);
}

function freqToNote(hz: number): string {
  const noteNames = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
  const semitones = Math.round(12 * Math.log2(hz / 440));
  const octave = Math.floor((semitones + 57) / 12) + 1;
  const noteIndex = ((semitones % 12) + 12) % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

function fmtHz(f: number): string {
  return f < 1000 ? `${f.toFixed(0)}Hz` : `${(f / 1000).toFixed(2)}kHz`;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── SVG drawing helpers (prefix draw* as required) ────────────────────────────

function drawHeardWells(heard: HeardPartial[]): string {
  if (heard.length === 0) return "";
  let out = "";
  heard.forEach((hp, i) => {
    const wellY = freqToSvgY(hp.freq);
    const wellR = 60 + hp.amp * 80;
    const glowId = `hw${i}`;
    const amp = Math.max(0.05, hp.amp);

    out += `<defs>
      <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fde68a" stop-opacity="${(amp * 0.35).toFixed(3)}"/>
        <stop offset="60%" stop-color="#fbbf24" stop-opacity="${(amp * 0.12).toFixed(3)}"/>
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
      </radialGradient>
    </defs>`;

    // Full-width horizontal sunlight well
    out += `<ellipse cx="${SVG_W / 2}" cy="${wellY.toFixed(1)}" rx="${(SVG_W * 0.48).toFixed(1)}" ry="${wellR.toFixed(1)}" fill="url(#${glowId})"/>`;

    // Bright centre line
    out += `<line x1="0" y1="${wellY.toFixed(1)}" x2="${SVG_W}" y2="${wellY.toFixed(1)}" stroke="#fde68a" stroke-opacity="${(amp * 0.45).toFixed(3)}" stroke-width="${(1 + amp * 2.5).toFixed(1)}"/>`;

    // Label
    out += `<text x="${SVG_W - 6}" y="${(wellY - 4).toFixed(1)}" text-anchor="end" fill="#fde68a" fill-opacity="${(0.55 + amp * 0.45).toFixed(2)}" font-size="10" font-family="monospace">${freqToNote(hp.freq)} ${fmtHz(hp.freq)}</text>`;
  });
  return out;
}

function drawFreqGuides(): string {
  const guideFreqs = [130, 165, 220, 261, 330, 392, 440, 523, 659, 784, 880];
  let out = "";
  for (const gf of guideFreqs) {
    if (gf < FREQ_MIN || gf > FREQ_MAX) continue;
    const gy = freqToSvgY(gf);
    out += `<line x1="0" y1="${gy.toFixed(0)}" x2="${SVG_W}" y2="${gy.toFixed(0)}" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>`;
    out += `<text x="5" y="${(gy - 2).toFixed(0)}" fill="#ffffff" fill-opacity="0.14" font-size="9" font-family="monospace">${fmtHz(gf)}</text>`;
  }
  return out;
}

function drawStem(
  x: number,
  bottomY: number,
  topY: number,
  health: number,
  color: string,
  sway: number,
): string {
  const midX = x + sway;
  const cp1Y = bottomY - (bottomY - topY) * 0.33;
  const cp2Y = bottomY - (bottomY - topY) * 0.67;
  const opacity = Math.max(0.12, Math.min(0.75, health));
  const strokeWidth = 1.0 + health * 1.6;
  return `<path d="M${x},${bottomY} C${midX},${cp1Y} ${x},${cp2Y} ${x},${topY}" stroke="${color}" stroke-width="${strokeWidth.toFixed(1)}" stroke-opacity="${opacity.toFixed(2)}" fill="none" stroke-linecap="round"/>`;
}

function drawBloom(org: Organism, svgX: number, svgY: number, color: string): string {
  const health = org.health;
  const consonance = org.consonance;
  const baseR = 7 + health * 20;
  const petalOpen = Math.max(0, (health - 0.2) / 0.8);
  const pulse = 1 + 0.14 * Math.sin(org.phase) * health;
  const r = baseR * pulse;
  const nPetals = 5 + Math.floor(health * 3);
  const petalR = r * 0.7 * petalOpen;
  const glowR = r * 1.7;
  const gradId = `g${org.id}`;
  const glowId = `gw${org.id}`;
  const brightness = 0.35 + health * 0.65;
  const alpha = Math.max(0.08, Math.min(1, health * 1.4));

  let out = `<defs>
    <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${(alpha * brightness).toFixed(2)}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${(alpha * 0.22).toFixed(2)}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${glowR.toFixed(1)}" fill="url(#${glowId})"/>`;

  if (petalOpen > 0.05) {
    for (let p = 0; p < nPetals; p++) {
      const angle = (p / nPetals) * Math.PI * 2 + org.phase * 0.12;
      const px = svgX + Math.cos(angle) * petalR;
      const py = svgY + Math.sin(angle) * petalR;
      const pr = petalR * 0.55 * petalOpen;
      out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${pr.toFixed(1)}" ry="${(pr * 0.6).toFixed(1)}" fill="${color}" fill-opacity="${(alpha * brightness * 0.65).toFixed(2)}" transform="rotate(${(angle * 180 / Math.PI).toFixed(1)},${px.toFixed(1)},${py.toFixed(1)})"/>`;
    }
  }

  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="url(#${gradId})"/>`;
  out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${(2.5 + health * 4.5).toFixed(1)}" fill="${color}" fill-opacity="${(alpha * 0.85).toFixed(2)}"/>`;

  if (consonance < -0.1) {
    const disR = r * 1.25;
    const disAlpha = Math.min(0.55, Math.abs(consonance) * 0.75);
    out += `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${disR.toFixed(1)}" fill="none" stroke="#f87171" stroke-opacity="${disAlpha.toFixed(2)}" stroke-width="1.2"/>`;
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
      const score = (a.consonance + b.consonance) / 2;
      if (score > CONSONANCE_LINK_THRESH) pairs.push({ a, b, score });
    }
  }

  pairs.sort((p, q) => q.score - p.score);
  pairs.splice(MAX_CONNECTIONS);

  return pairs.map(({ a, b, score }) => {
    const ax = xMap.get(a.id) ?? SVG_W / 2;
    const ay = freqToSvgY(a.freq);
    const bx = xMap.get(b.id) ?? SVG_W / 2;
    const by = freqToSvgY(b.freq);
    const phaseDiff = Math.abs(Math.sin((a.phase - b.phase) / 2));
    const pulseOpacity = 0.05 + score * 0.16 * (1 - phaseDiff * 0.45);
    const strokeW = 0.6 + score * 1.3;
    const color = pickColor(a.id);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2 - 18;
    return `<path d="M${ax.toFixed(0)},${ay.toFixed(0)} Q${cx.toFixed(0)},${cy.toFixed(0)} ${bx.toFixed(0)},${by.toFixed(0)}" stroke="${color}" stroke-opacity="${pulseOpacity.toFixed(3)}" stroke-width="${strokeW.toFixed(1)}" fill="none"/>`;
  }).join("");
}

function drawScene(
  svg: SVGSVGElement,
  organisms: Organism[],
  xMap: Map<number, number>,
  heard: HeardPartial[],
): void {
  const living = organisms.filter((o) => o.alive);
  let html = "";

  // Background
  html += `<defs>
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#110822"/>
      <stop offset="100%" stop-color="#050208"/>
    </radialGradient>
  </defs>
  <rect width="${SVG_W}" height="${SVG_H}" fill="url(#bgGrad)"/>`;

  // Heard sunlight wells (behind everything)
  html += drawHeardWells(heard);

  // Frequency guides
  html += drawFreqGuides();

  // Connection threads
  html += drawConnectionThreads(living, xMap);

  // Organisms
  for (const org of living) {
    const sx = xMap.get(org.id) ?? SVG_W / 2;
    const sy = freqToSvgY(org.freq);
    const groundY = SVG_H * 0.94;
    const color = pickColor(org.id);

    if (org.health > 0.07) {
      const sway = Math.sin(org.phase) * 5 * org.health;
      html += drawStem(sx, groundY, sy, org.health, color, sway);
    }
    html += drawBloom(org, sx, sy, color);
  }

  // Ground
  html += `<line x1="0" y1="${(SVG_H * 0.94).toFixed(0)}" x2="${SVG_W}" y2="${(SVG_H * 0.94).toFixed(0)}" stroke="#3b1f5e" stroke-opacity="0.5" stroke-width="1.5"/>`;

  svg.innerHTML = html;
}

// ── Heard-partials smoothing ──────────────────────────────────────────────────

function smoothHeardPartials(
  prev: HeardPartial[],
  next: HeardPartial[],
  alpha: number,
): HeardPartial[] {
  // Merge by closest frequency; smooth amplitude; drop if no match
  const result: HeardPartial[] = [];
  for (const n of next) {
    const existing = prev.find((p) => Math.abs(Math.log2(p.freq / n.freq)) < 0.1);
    if (existing) {
      result.push({
        freq: existing.freq * (1 - alpha) + n.freq * alpha,
        amp: existing.amp * (1 - alpha) + n.amp * alpha,
      });
    } else {
      result.push({ freq: n.freq, amp: n.amp * alpha });
    }
  }
  // Keep old ones that didn't match with decaying amplitude
  for (const p of prev) {
    if (!result.find((r) => Math.abs(Math.log2(r.freq / p.freq)) < 0.1)) {
      const decayed = { freq: p.freq, amp: p.amp * (1 - alpha) * 0.6 };
      if (decayed.amp > 0.05) result.push(decayed);
    }
  }
  result.sort((a, b) => b.amp - a.amp);
  return result.slice(0, 6);
}

// ── Component ─────────────────────────────────────────────────────────────────

type InputMode = "demo" | "mic" | "recording";
type RunState = "idle" | "running" | "error";

interface AudioState {
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  fftBuf: Float32Array<ArrayBuffer> | null;
  timeBuf: Float32Array<ArrayBuffer> | null;
  masterGain: GainNode | null;
  stopDemo: (() => void) | null;
  micStream: MediaStream | null;
  mediaSource: MediaElementAudioSourceNode | null;
}

export default function ConchordalListen() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("demo");
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [micErr, setMicErr] = useState<string | null>(null);
  const [recordErr, setRecordErr] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState("");
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [stats, setStats] = useState({ elapsed: 0, pop: 0, meanC: 0 });
  const [heardDisplay, setHeardDisplay] = useState<HeardPartial[]>([]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const simState = useRef<SimState>({
    organisms: [],
    time: 0,
    elapsed: 0,
    meanConsonance: 0,
    heardPartials: [],
  });
  const audioState = useRef<AudioState>({
    ctx: null,
    analyser: null,
    fftBuf: null,
    timeBuf: null,
    masterGain: null,
    stopDemo: null,
    micStream: null,
    mediaSource: null,
  });
  const xPosRef = useRef<Map<number, number>>(new Map());
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<HeardPartial[]>([]);
  const frameCountRef = useRef(0);

  // Stable x position per organism id
  const getOrgX = useCallback((org: Organism): number => {
    const xm = xPosRef.current;
    if (!xm.has(org.id)) {
      xm.set(org.id, 40 + Math.random() * (SVG_W - 80));
    }
    return xm.get(org.id)!;
  }, []);

  // ── Build audio graph ─────────────────────────────────────────────────────

  const buildAudioGraph = useCallback((ctx: AudioContext): {
    masterGain: GainNode;
    analyser: AnalyserNode;
  } => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.78;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;

    // Reverb send
    try {
      const reverb = ctx.createConvolver();
      reverb.buffer = buildReverbIR(ctx);
      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.28;
      const reverbOut = ctx.createGain();
      reverbOut.gain.value = 0.7;
      masterGain.connect(reverbSend);
      reverbSend.connect(reverb);
      reverb.connect(reverbOut);
      reverbOut.connect(ctx.destination);
    } catch { /* no reverb fallback */ }

    // Dry path → limiter
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.72;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 2;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.15;

    masterGain.connect(dryGain);
    dryGain.connect(limiter);
    limiter.connect(ctx.destination);

    return { masterGain, analyser };
  }, []);

  // ── Stop everything ───────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    const as = audioState.current;
    if (as.stopDemo) { as.stopDemo(); as.stopDemo = null; }
    if (as.micStream) {
      for (const track of as.micStream.getTracks()) track.stop();
      as.micStream = null;
    }
    for (const org of simState.current.organisms) {
      if (as.ctx) detachAudio(org, as.ctx);
    }
    try { as.ctx?.close(); } catch { /* ok */ }
    as.ctx = null;
    as.analyser = null;
    as.fftBuf = null;
    as.timeBuf = null;
    as.masterGain = null;
    as.mediaSource = null;

    simState.current = { organisms: [], time: 0, elapsed: 0, meanConsonance: 0, heardPartials: [] };
    xPosRef.current = new Map();
    smoothedRef.current = [];
    frameCountRef.current = 0;

    setRunState("idle");
    setStats({ elapsed: 0, pop: 0, meanC: 0 });
    setHeardDisplay([]);
  }, []);

  // ── Extract heard partials from analyser ──────────────────────────────────

  const extractHeardPartials = useCallback((): HeardPartial[] => {
    const as = audioState.current;
    if (!as.analyser || !as.fftBuf || !as.timeBuf || !as.ctx) return [];
    const sr = as.ctx.sampleRate;

    const peaks = extractFftPeaks(as.analyser, as.fftBuf, sr, 4);
    const fund = detectFundamental(as.analyser, as.timeBuf, sr);

    const partials = [...peaks];
    if (fund && fund >= FREQ_MIN && fund <= FREQ_MAX) {
      const exists = peaks.some((p) => Math.abs(Math.log2(p.freq / fund)) < 0.08);
      if (!exists) {
        partials.unshift({ freq: fund, amp: 1.0 });
      }
    }

    return partials.slice(0, 5);
  }, []);

  // ── Simulation tick ───────────────────────────────────────────────────────

  const runSimTick = useCallback(() => {
    const state = simState.current;
    const as = audioState.current;
    const dt = SIM_INTERVAL_MS / 1000;

    // Extract heard partials and smooth
    const raw = extractHeardPartials();
    smoothedRef.current = smoothHeardPartials(smoothedRef.current, raw, 0.25);
    state.heardPartials = smoothedRef.current;

    const dead = stepSim(state, dt);

    if (as.ctx && as.masterGain) {
      for (const d of dead) detachAudio(d, as.ctx);
      for (const org of state.organisms.filter((o) => o.alive && !o.oscs)) {
        attachAudio(org, as.ctx, as.masterGain);
      }
    }
  }, [extractHeardPartials]);

  // ── Animation loop ────────────────────────────────────────────────────────

  const animLoop = useCallback(() => {
    const state = simState.current;
    const as = audioState.current;
    frameCountRef.current++;

    if (as.ctx && as.ctx.state !== "closed") {
      for (const org of state.organisms.filter((o) => o.alive)) {
        updateAudio(org, as.ctx);
      }
    }

    // Ensure xPosRef has entries for all living organisms
    for (const org of state.organisms.filter((o) => o.alive)) {
      getOrgX(org);
    }

    if (svgRef.current) {
      drawScene(svgRef.current, state.organisms, xPosRef.current, state.heardPartials);
    }

    // Update stats every 6 frames
    if (frameCountRef.current % 6 === 0) {
      setStats({
        elapsed: state.elapsed,
        pop: state.organisms.filter((o) => o.alive).length,
        meanC: state.meanConsonance,
      });
      setHeardDisplay([...state.heardPartials]);
    }

    rafRef.current = requestAnimationFrame(animLoop);
  }, [getOrgX]);

  // ── Initialize organisms ──────────────────────────────────────────────────

  const initOrganisms = useCallback((): Organism[] => {
    const orgs: Organism[] = [];
    for (let i = 0; i < POP_INIT; i++) orgs.push(createOrganism());
    return orgs;
  }, []);

  // ── Start Demo ────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    stopAll();
    setAudioErr(null);
    setMicErr(null);
    setRecordErr(null);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      setAudioErr("Web Audio API unavailable in this browser.");
      setRunState("error");
      return;
    }

    const { masterGain, analyser } = buildAudioGraph(ctx);

    // Demo synth routes through analyserNode
    const demoGain = ctx.createGain();
    demoGain.gain.value = 1.0;
    demoGain.connect(analyser);
    analyser.connect(masterGain);

    const stopDemo = scheduleDemoPhrase(ctx, demoGain);

    const organisms = initOrganisms();
    resetTemperature();
    simState.current = { organisms, time: 0, elapsed: 0, meanConsonance: 0, heardPartials: [] };
    xPosRef.current = new Map();
    smoothedRef.current = [];

    const fftBuf = new Float32Array(analyser.frequencyBinCount);
    const timeBuf = new Float32Array(analyser.fftSize);

    audioState.current = {
      ctx,
      analyser,
      fftBuf,
      timeBuf,
      masterGain,
      stopDemo,
      micStream: null,
      mediaSource: null,
    };

    for (const org of organisms) attachAudio(org, ctx, masterGain);

    setRunState("running");
    setInputMode("demo");
    simTimerRef.current = setInterval(runSimTick, SIM_INTERVAL_MS);
    rafRef.current = requestAnimationFrame(animLoop);
  }, [stopAll, buildAudioGraph, initOrganisms, runSimTick, animLoop]);

  // ── Start Mic ─────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    stopAll();
    setAudioErr(null);
    setMicErr(null);
    setRecordErr(null);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      setAudioErr("Web Audio API unavailable in this browser.");
      setRunState("error");
      // Fall back to demo
      startDemo();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      setMicErr(
        `Microphone access denied${err instanceof Error ? ` — ${err.message}` : ""}. Running self-play demo instead.`,
      );
      ctx.close().catch(() => { /* ok */ });
      startDemo();
      return;
    }

    const { masterGain, analyser } = buildAudioGraph(ctx);

    const micSource = ctx.createMediaStreamSource(stream);
    micSource.connect(analyser);
    analyser.connect(masterGain);

    const organisms = initOrganisms();
    resetTemperature();
    simState.current = { organisms, time: 0, elapsed: 0, meanConsonance: 0, heardPartials: [] };
    xPosRef.current = new Map();
    smoothedRef.current = [];

    const fftBuf = new Float32Array(analyser.frequencyBinCount);
    const timeBuf = new Float32Array(analyser.fftSize);

    audioState.current = {
      ctx,
      analyser,
      fftBuf,
      timeBuf,
      masterGain,
      stopDemo: null,
      micStream: stream,
      mediaSource: null,
    };

    for (const org of organisms) attachAudio(org, ctx, masterGain);

    setRunState("running");
    setInputMode("mic");
    simTimerRef.current = setInterval(runSimTick, SIM_INTERVAL_MS);
    rafRef.current = requestAnimationFrame(animLoop);
  }, [stopAll, buildAudioGraph, initOrganisms, runSimTick, animLoop, startDemo]);

  // ── Load recording ────────────────────────────────────────────────────────

  const loadRecording = useCallback(async () => {
    const id = recordingId.trim();
    if (!id) return;
    setRecordLoading(true);
    setRecordErr(null);
    setRecordLoaded(false);

    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url: string };
      const audio = audioRef.current;
      if (audio) {
        audio.src = data.url;
        setRecordLoaded(true);
      }
    } catch (err) {
      setRecordErr(
        `Could not load recording${err instanceof Error ? `: ${err.message}` : ""}. The self-play demo still works.`,
      );
    } finally {
      setRecordLoading(false);
    }
  }, [recordingId]);

  // ── Start Recording ───────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !recordLoaded) return;

    stopAll();
    setAudioErr(null);
    setRecordErr(null);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      setAudioErr("Web Audio API unavailable.");
      setRunState("error");
      return;
    }

    const { masterGain, analyser } = buildAudioGraph(ctx);

    let mediaSource: MediaElementAudioSourceNode;
    try {
      mediaSource = ctx.createMediaElementSource(audio);
    } catch (err) {
      setRecordErr(`Could not attach audio: ${err instanceof Error ? err.message : String(err)}`);
      ctx.close().catch(() => { /* ok */ });
      return;
    }

    mediaSource.connect(analyser);
    analyser.connect(masterGain);

    const organisms = initOrganisms();
    resetTemperature();
    simState.current = { organisms, time: 0, elapsed: 0, meanConsonance: 0, heardPartials: [] };
    xPosRef.current = new Map();
    smoothedRef.current = [];

    const fftBuf = new Float32Array(analyser.frequencyBinCount);
    const timeBuf = new Float32Array(analyser.fftSize);

    audioState.current = {
      ctx,
      analyser,
      fftBuf,
      timeBuf,
      masterGain,
      stopDemo: null,
      micStream: null,
      mediaSource,
    };

    for (const org of organisms) attachAudio(org, ctx, masterGain);

    audio.play().catch((err) => {
      setRecordErr(`Playback failed: ${err instanceof Error ? err.message : String(err)}`);
    });

    setRunState("running");
    setInputMode("recording");
    simTimerRef.current = setInterval(runSimTick, SIM_INTERVAL_MS);
    rafRef.current = requestAnimationFrame(animLoop);
  }, [stopAll, buildAudioGraph, initOrganisms, runSimTick, animLoop, recordLoaded]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const as = audioState.current;
      if (as.stopDemo) as.stopDemo();
      if (as.micStream) for (const t of as.micStream.getTracks()) t.stop();
      if (as.ctx && as.ctx.state !== "closed") as.ctx.close().catch(() => { /* ok */ });
    };
  }, []);

  // ── HUD values ────────────────────────────────────────────────────────────

  const cScore = stats.meanC;
  const cPct = Math.round(Math.max(0, Math.min(1, (cScore + 0.4) / 0.9)) * 100);
  const cBarColor = cScore > 0.25 ? "#a78bfa" : cScore > 0.05 ? "#60a5fa" : "#f87171";

  const isRunning = runState === "running";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#05020a] text-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-1 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white/95">
            Conchordal Listen
          </h1>
          <p className="text-base text-white/75 mt-0.5 max-w-xl">
            A living chord that{" "}
            <span className="text-violet-300 font-mono">listens</span> — organisms forage a
            Plomp–Levelt consonance landscape, assembling pure-intonation harmony around what
            they hear.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/40 hover:text-white/70 transition-colors shrink-0 ml-4 mt-1"
        >
          ← dreams
        </Link>
      </div>

      {/* Error notices */}
      {audioErr && (
        <p className="px-4 py-1.5 text-rose-300 text-base">{audioErr}</p>
      )}
      {micErr && (
        <p className="px-4 py-1.5 text-rose-300 text-base">{micErr}</p>
      )}

      {/* SVG canvas */}
      <div className="flex-1 px-3 py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full max-w-5xl mx-auto block rounded-xl border border-white/8 bg-[#050208]"
          style={{ aspectRatio: `${SVG_W}/${SVG_H}` }}
          aria-label="Conchordal Listen — organisms bloom toward heard pitches"
        >
          {!isRunning && (
            <text
              x={SVG_W / 2}
              y={SVG_H / 2}
              textAnchor="middle"
              fill="#a78bfa"
              fillOpacity="0.55"
              fontSize="17"
              fontFamily="monospace"
            >
              Tap Start to begin listening
            </text>
          )}
        </svg>
      </div>

      {/* HUD — heard pitches + consonance */}
      {isRunning && (
        <div className="px-4 pb-1 flex flex-wrap gap-x-6 gap-y-1 items-center text-base font-mono">
          <span className="text-white/55">
            <span className="text-violet-300">time</span>{" "}
            <span className="text-white/95">{fmtTime(stats.elapsed)}</span>
          </span>
          <span className="text-white/55">
            <span className="text-violet-300">pop</span>{" "}
            <span className="text-white/95">{stats.pop}</span>
          </span>
          <span className="flex items-center gap-2 text-white/55">
            <span className="text-violet-300">harmony</span>
            <span
              className="inline-block h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, cPct)}px`, background: cBarColor }}
            />
            <span className="text-white/95">{cScore.toFixed(2)}</span>
          </span>
          {heardDisplay.length > 0 && (
            <span className="flex items-center gap-2 text-white/55">
              <span className="text-violet-300">heard</span>
              {heardDisplay.slice(0, 4).map((hp, i) => (
                <span key={i} className="text-amber-300">
                  {freqToNote(hp.freq)}
                </span>
              ))}
            </span>
          )}
          {heardDisplay.length === 0 && inputMode === "mic" && (
            <span className="text-white/55 italic text-sm">
              (play piano — organisms will orient)
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="px-4 pb-4 pt-2 space-y-3 max-w-2xl">
        {/* Mode tabs */}
        <div className="flex gap-2 flex-wrap">
          {/* Demo */}
          <button
            onClick={inputMode === "demo" && isRunning ? stopAll : startDemo}
            className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base font-semibold transition-colors ${
              inputMode === "demo" && isRunning
                ? "bg-violet-700 text-white"
                : "bg-violet-600/70 hover:bg-violet-600 text-white"
            }`}
          >
            {inputMode === "demo" && isRunning ? "■ Stop demo" : "▶ Self-play demo"}
          </button>

          {/* Mic */}
          <button
            onClick={inputMode === "mic" && isRunning ? stopAll : startMic}
            className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base font-semibold transition-colors ${
              inputMode === "mic" && isRunning
                ? "bg-emerald-700 text-white"
                : "bg-emerald-600/70 hover:bg-emerald-600 text-white"
            }`}
          >
            {inputMode === "mic" && isRunning ? "■ Stop mic" : "🎹 Play piano"}
          </button>
        </div>

        {/* Recording input */}
        <div className="space-y-1.5">
          <label className="block text-sm text-white/55 font-mono">
            Karel&apos;s track — paste a recording ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={recordingId}
              onChange={(e) => setRecordingId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRecording()}
              placeholder="paste a recording UUID…"
              className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-base text-white/95 placeholder-white/25 focus:outline-none focus:border-violet-400/50"
              style={{ minHeight: 44 }}
            />
            <button
              onClick={loadRecording}
              disabled={recordLoading || !recordingId.trim()}
              className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium bg-sky-800/70 hover:bg-sky-700 text-white transition-colors disabled:opacity-40"
            >
              {recordLoading ? "…" : "Load"}
            </button>
          </div>
          {recordErr && <p className="text-rose-300 text-base">{recordErr}</p>}
          {recordLoaded && !recordErr && (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-sm font-mono">Recording loaded ✓</span>
              <button
                onClick={inputMode === "recording" && isRunning ? stopAll : startRecording}
                className={`min-h-[44px] px-4 py-2.5 rounded-lg text-base font-semibold transition-colors ${
                  inputMode === "recording" && isRunning
                    ? "bg-sky-800 text-white"
                    : "bg-sky-700/70 hover:bg-sky-700 text-white"
                }`}
              >
                {inputMode === "recording" && isRunning ? "■ Stop" : "▶ Play recording"}
              </button>
            </div>
          )}
        </div>

        {/* Hidden audio element */}
        <audio ref={audioRef} crossOrigin="anonymous" className="hidden" />

        {/* Legend */}
        <div className="text-white/55 text-sm font-mono space-y-0.5 pt-1 border-t border-white/8">
          <p>
            <span className="text-amber-300">yellow wells</span> — heard pitches; organisms grow toward them
          </p>
          <p>
            <span className="text-violet-300">bloom</span> — consonant voices open petals;
            <span className="text-rose-400"> red ring</span> = dissonant
          </p>
          <p>
            <span className="text-violet-300">threads</span> — Kuramoto-coupled consonant pairs
          </p>
          <p>
            <span className="text-white/40">vertical axis</span> — pitch log-scale {FREQ_MIN}–{FREQ_MAX} Hz, low at bottom
          </p>
        </div>
      </div>

      {/* Design notes link */}
      <div className="px-4 pb-6 text-right">
        <Link
          href="/dream/414-conchordal-listen/README.md"
          className="text-xs text-white/30 hover:text-violet-300 transition-colors font-mono"
          target="_blank"
        >
          design notes →
        </Link>
      </div>
    </div>
  );
}
