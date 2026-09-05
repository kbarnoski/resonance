"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16896 · Strata
//
//   ONE QUESTION
//   What if a recording could remember being HEARD — could Karel's track accrete
//   a visible GEOLOGY of every past listening, so returning re-forms the sediment
//   of all previous visits?
//
//   THE MEDIUM PERSISTS. Pick one of Karel's real catalog tracks. As it plays,
//   the current session deposits a growing STRATUM at the top of a vertical
//   sediment column: a horizontal band whose mineral hue is derived from that
//   session's unfolding harmony (dominant chord pitch-classes → a cool mineral
//   position), whose darkness tracks minor/diminished tension, and whose internal
//   striations tighten with dynamics (analyser RMS). When the session ends — or
//   every few seconds as a checkpoint — a tiny SUMMARY (no raw audio) is written
//   to IndexedDB, keyed per track. On every future visit the full column re-forms
//   from all past listenings: older strata sit lower and compacted, newest on top.
//
//   INSPECTABLE. A draggable CORE-SAMPLE cursor runs down the column. As it
//   crosses a stratum it surfaces that session's date, "N sessions ago", and
//   listened duration — and plays a soft granular ECHO of that remembered
//   session's harmony, voiced by re-pitching grains sliced from the CURRENTLY
//   loaded real track buffer toward that stratum's stored chord. Never a synth.
//
//   OUTPUT is WebGPU (a WGSL render pipeline draws the whole core sample). AUDIO
//   is Karel's real catalog only, always routed through the safeMaster bus.
//
//   REFS  "Persistent Computational State: A Session-Centric Runtime for
//   Generative World Models" (arXiv:2607.21686, Jul 2026 — keep the minimal
//   non-recomputable state across a session boundary); Katie Paterson's *Future
//   Library* (a work that accretes across time, unheard until later). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import {
  loadStrata,
  upsertSession,
  clearStrata,
  roundSig,
  type StrataSession,
} from "./strataStore";

// ── Tunables ────────────────────────────────────────────────────────────────

const MAX_STRATA = 72; // shader array cap (SESSION_CAP 60 + live + headroom)
const SIG_BINS = 16; // spectral-signature length stored per session
const HUE_CAP = 24; // max sampled dominant pitch-classes stored per session
const HUE_SAMPLE_SEC = 3; // sample the current chord every N listened seconds
const CHECKPOINT_SEC = 8; // persist the growing live stratum this often
const MIN_PERSIST_SEC = 4; // don't deposit a stratum for a glance shorter than this

// Column placement as fractions of the canvas (top-origin), shared by the
// renderer (device px) and the pointer scrub (css px) so they always agree.
const COL_X0 = 0.37;
const COL_X1 = 0.63;
const COL_Y0 = 0.09;
const COL_Y1 = 0.91;

// ── Deterministic PRNG (mulberry32) — for grain scatter, never audio content ──

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Harmony helpers ───────────────────────────────────────────────────────────

/** Circle-of-fifths spread of a pitch-class into 0..1 (harmonic neighbours near). */
function pcToPosition(pc: number): number {
  // pitchClassHue is warm-anchored; we only want its fifths ordering, remapped
  // into a cool MINERAL gradient position (0 slate → 1 pale mineral).
  return (pitchClassHue(pc) % 360) / 360;
}

/** Most common pitch-classes in a sampled sequence, most-frequent first. */
function topPitchClasses(hues: number[], k: number): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const h of hues) {
    const pc = ((Math.round(h) % 12) + 12) % 12;
    hist[pc] += 1;
  }
  const order = hist
    .map((n, pc) => ({ pc, n }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((e) => e.pc);
  if (order.length === 0) return [0];
  return order.slice(0, Math.max(1, k));
}

// ── Live-session accumulator (kept in a ref, mirrored to a render stratum) ────

interface LiveState {
  id: number; // session start timestamp = stable persistence id
  playedSecs: number; // accumulated actual listening time
  hueSamples: number[]; // dominant pcs sampled over the session
  minorCount: number;
  chordSamples: number;
  rmsSum: number;
  rmsCount: number;
  peakRms: number;
  sig: number[]; // running-mean spectral signature (SIG_BINS)
  sigCount: number;
  // smoothed CURRENT harmony, for the live band's live appearance
  curPos: number; // 0..1 mineral position
  curMinor: number; // 0..1
  curRms: number; // 0..1
  lastHueSampleAt: number; // playedSecs of the last hue sample
}

function makeLiveState(id: number): LiveState {
  return {
    id,
    playedSecs: 0,
    hueSamples: [],
    minorCount: 0,
    chordSamples: 0,
    rmsSum: 0,
    rmsCount: 0,
    peakRms: 0,
    sig: new Array<number>(SIG_BINS).fill(0),
    sigCount: 0,
    curPos: 0.5,
    curMinor: 0.35,
    curRms: 0,
    lastHueSampleAt: -HUE_SAMPLE_SEC,
  };
}

/** Fold a finished/checkpointed LiveState into a tiny persistable record. */
function liveToSession(ls: LiveState): StrataSession {
  // decimate the hue sequence evenly down to HUE_CAP so long sessions stay tiny
  let hues = ls.hueSamples;
  if (hues.length > HUE_CAP) {
    const out: number[] = [];
    for (let i = 0; i < HUE_CAP; i++) {
      out.push(hues[Math.floor((i / HUE_CAP) * hues.length)]);
    }
    hues = out;
  }
  const meanRms = ls.rmsCount > 0 ? ls.rmsSum / ls.rmsCount : 0;
  const sig = ls.sig.map((v) => roundSig(ls.sigCount > 0 ? v / ls.sigCount : 0));
  return {
    id: ls.id,
    t: Date.now(),
    secs: Math.round(ls.playedSecs),
    hues,
    minor: roundSig(ls.chordSamples > 0 ? ls.minorCount / ls.chordSamples : 0.35),
    meanRms: Math.round(meanRms * 10000) / 10000,
    peakRms: Math.round(ls.peakRms * 10000) / 10000,
    sig,
  };
}

// ── Render-side stratum (one horizontal band in the core sample) ──────────────

interface RenderStratum {
  vTop: number; // 0 top .. 1 bottom within the column
  vBot: number;
  pos: number; // mineral hue position 0..1
  minor: number; // 0..1
  meanRms: number;
  peakRms: number;
  age01: number; // 0 newest .. 1 oldest (drives compaction/darkening)
  seed: number;
  kind: "live" | "stored";
  session: StrataSession | null;
  sessionsAgo: number; // 0 = most recent stored, live counts as -1 sentinel
}

/**
 * Lay stored sessions + the optional growing live session out as bands within
 * the column. Newest on top; older sit lower with a compaction weighting so the
 * column reads as accreted sediment settling under its own history.
 */
function computeLayout(
  stored: StrataSession[],
  live: LiveState | null,
): RenderStratum[] {
  // newest → oldest ordering, top → bottom
  const n = stored.length;
  const entries: {
    pos: number;
    minor: number;
    meanRms: number;
    peakRms: number;
    secs: number;
    seed: number;
    kind: "live" | "stored";
    session: StrataSession | null;
    sessionsAgo: number;
  }[] = [];

  if (live) {
    entries.push({
      pos: live.curPos,
      minor: live.curMinor,
      meanRms: live.curRms,
      peakRms: Math.max(live.curRms, live.peakRms),
      secs: live.playedSecs,
      seed: (live.id % 9973) / 9973,
      kind: "live",
      session: null,
      sessionsAgo: -1,
    });
  }

  for (let i = n - 1; i >= 0; i--) {
    const s = stored[i];
    const pcs = topPitchClasses(s.hues, 1);
    entries.push({
      pos: pcToPosition(pcs[0]),
      minor: s.minor,
      meanRms: s.meanRms,
      peakRms: s.peakRms,
      secs: s.secs,
      seed: (s.id % 9973) / 9973,
      kind: "stored",
      session: s,
      sessionsAgo: n - 1 - i,
    });
  }

  const total = entries.length;
  if (total === 0) return [];

  // weight = presence (listened length) × compaction (older → thinner)
  const weights = entries.map((e, idx) => {
    const rank = idx; // 0 newest (top)
    const age01 = total > 1 ? rank / (total - 1) : 0;
    const compaction = 1 - 0.55 * age01; // older bands squeezed thinner
    const presence = 0.45 + Math.min(1, e.secs / 150);
    const grow = e.kind === "live" ? 1 + Math.min(1.4, e.secs / 90) : 1;
    return Math.max(0.05, presence * compaction * grow);
  });
  const sum = weights.reduce((a, b) => a + b, 0);

  const out: RenderStratum[] = [];
  let v = 0;
  for (let idx = 0; idx < total; idx++) {
    const e = entries[idx];
    const h = weights[idx] / sum;
    const age01 = total > 1 ? idx / (total - 1) : 0;
    out.push({
      vTop: v,
      vBot: v + h,
      pos: e.pos,
      minor: e.minor,
      meanRms: e.meanRms,
      peakRms: e.peakRms,
      age01,
      seed: e.seed,
      kind: e.kind,
      session: e.session,
      sessionsAgo: e.sessionsAgo,
    });
    v += h;
  }
  return out;
}

// ── WGSL — a full-screen pass that draws the mineral core sample ──────────────

const RENDER_WGSL = /* wgsl */ `
struct Uni {
  res: vec2f,
  cursorV: f32,
  time: f32,
  col: vec4f,      // x0, y0, x1, y1 in device px
  count: f32,
  playing: f32,
  cursorOn: f32,
  pad: f32,
};
@group(0) @binding(0) var<uniform> U: Uni;
// two vec4 per stratum: a = (vTop, vBot, pos, minor); b = (meanRms, peakRms, age01, seed)
@group(0) @binding(1) var<storage, read> strata: array<vec4f>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[vi];
  // uv: (0,0) top-left .. (1,1) bottom-right in device px space
  return VO(vec4f(xy, 0.0, 1.0), vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5));
}

fn hash21(p: vec2f) -> f32 {
  var h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

// cool MINERAL gradient: deep slate → mineral-blue → patina(teal) → pale mineral
fn mineral(t: f32) -> vec3f {
  let slate = vec3f(0.170, 0.220, 0.300);
  let mblue = vec3f(0.235, 0.400, 0.585);
  let patina = vec3f(0.310, 0.585, 0.560);
  let pale  = vec3f(0.660, 0.780, 0.815);
  let u = clamp(t, 0.0, 1.0);
  if (u < 0.34) { return mix(slate, mblue, u / 0.34); }
  if (u < 0.68) { return mix(mblue, patina, (u - 0.34) / 0.34); }
  return mix(patina, pale, (u - 0.68) / 0.32);
}

fn ground(uv: vec2f) -> vec3f {
  // deep neutral ground with a soft vignette
  let base = vec3f(0.045, 0.055, 0.070);
  let d = distance(uv, vec2f(0.5, 0.5));
  return base * (1.0 - 0.45 * d);
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let px = v.uv * U.res;
  let x0 = U.col.x; let y0 = U.col.y; let x1 = U.col.z; let y1 = U.col.w;

  // slow global luminance drift (< 0.1 Hz) — no strobe
  let drift = 0.90 + 0.10 * sin(U.time * 0.35);

  var col = ground(v.uv);

  let inCol = px.x >= x0 && px.x <= x1 && px.y >= y0 && px.y <= y1;
  if (inCol) {
    let cx = (px.x - x0) / max(1.0, x1 - x0); // 0..1 across width
    let cv = (px.y - y0) / max(1.0, y1 - y0); // 0..1 top→bottom (column v)

    // faint empty substrate if there are no strata yet
    var band = ground(v.uv) + vec3f(0.02, 0.03, 0.04);

    let n = u32(U.count);
    for (var i = 0u; i < n; i = i + 1u) {
      let a = strata[i * 2u];
      let b = strata[i * 2u + 1u];
      let vTop = a.x; let vBot = a.y;
      if (cv >= vTop && cv < vBot) {
        let pos = a.z; let minor = a.w;
        let meanRms = b.x; let peakRms = b.y; let age01 = b.z; let seed = b.w;
        let local = (cv - vTop) / max(0.0008, vBot - vTop); // 0 top .. 1 bottom of band

        var base = mineral(pos);
        // minor/diminished tension → pull toward cold slate + darken
        base = mix(base, vec3f(0.145, 0.180, 0.245), minor * 0.55) * (1.0 - minor * 0.18);
        // compaction: older strata darker + slightly desaturated
        let comp = 1.0 - 0.42 * age01;
        base = base * comp;

        // sediment striations: fine horizontal laminae, tighter with dynamics
        let freq = 26.0 + peakRms * 130.0 + seed * 22.0;
        let lam = 0.5 + 0.5 * sin(local * freq * 6.2831853 + seed * 40.0);
        let laminae = 0.82 + 0.18 * lam;
        // grain flecks (mineral inclusions) keyed to loudness
        let g = hash21(floor(vec2f(cx * 90.0, cv * 420.0)) + seed * 17.0);
        let fleck = smoothstep(0.985 - meanRms * 0.06, 1.0, g) * (0.25 + 0.5 * meanRms);

        // gentle top-lighting within the band + loudness lift
        let shade = 0.86 + 0.14 * (1.0 - local);
        var c = base * laminae * shade * (0.80 + 0.45 * meanRms) * drift;
        c = c + vec3f(0.62, 0.74, 0.78) * fleck * drift;

        // a hairline dark bedding plane at each stratum boundary
        let edge = smoothstep(0.0, 0.03, local) * smoothstep(0.0, 0.03, 1.0 - local);
        c = c * (0.55 + 0.45 * edge);

        band = c;
        break;
      }
    }
    col = band;

    // subtle column walls (the core tube)
    let wall = smoothstep(0.0, 0.012, cx) * smoothstep(0.0, 0.012, 1.0 - cx);
    col = col * (0.35 + 0.65 * wall);

    // ── the CORE-SAMPLE cursor ──────────────────────────────────────────────
    if (U.cursorOn > 0.5) {
      let d = abs(cv - U.cursorV);
      let glow = exp(-d * d * 900.0) * 0.55;
      let line = smoothstep(0.004, 0.0, d);
      col = col + vec3f(0.70, 0.85, 0.92) * (glow + line * 0.6);
    }
  }

  return vec4f(col, 1.0);
}
`;

// ── WebGPU backend ────────────────────────────────────────────────────────────

interface Gpu {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  uniformBuf: GPUBuffer;
  strataBuf: GPUBuffer;
  bindGroup: GPUBindGroup;
  uniformArr: Float32Array<ArrayBuffer>;
  strataArr: Float32Array<ArrayBuffer>;
  destroy(): void;
}

async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("no navigator.gpu");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();

  device.pushErrorScope("validation");

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no webgpu context");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const uniformArr = new Float32Array(16); // 64 bytes, 16-aligned
  const uniformBuf = device.createBuffer({
    size: uniformArr.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const strataArr = new Float32Array(MAX_STRATA * 2 * 4);
  const strataBuf = device.createBuffer({
    size: strataArr.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const mod = device.createShaderModule({ code: RENDER_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: mod, entryPoint: "vs" },
    fragment: { module: mod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-strip" },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: strataBuf } },
    ],
  });

  const scopeErr = await device.popErrorScope();
  if (scopeErr) throw new Error("WGSL validation: " + scopeErr.message);

  return {
    device,
    ctx,
    pipeline,
    uniformBuf,
    strataBuf,
    bindGroup,
    uniformArr,
    strataArr,
    destroy() {
      try {
        uniformBuf.destroy();
        strataBuf.destroy();
        device.destroy();
      } catch {
        /* already lost */
      }
    },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

type TrackOpt = { id: string; title: string; group: string };

const TRACK_OPTS: TrackOpt[] = [
  ...WELCOME_HOME_TRACKS.map((t) => ({ ...t, group: "Welcome Home" })),
  ...SNOWFLAKE_TRACKS.map((t) => ({ ...t, group: "Snowflake" })),
];

interface CursorInfo {
  kind: "live" | "stored";
  sessionsAgo: number;
  secs: number;
  t: number;
}

function relativeLabel(info: CursorInfo, storedCount: number): string {
  if (info.kind === "live") return "this listening (forming now)";
  const ago = info.sessionsAgo;
  const when =
    ago === 0 ? "most recent" : ago === 1 ? "1 session ago" : `${ago} sessions ago`;
  return `${when} of ${storedCount}`;
}

function durationLabel(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

function dateLabel(t: number): string {
  try {
    return new Date(t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function StrataPage() {
  const [selectedId, setSelectedId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storedCount, setStoredCount] = useState(0);
  const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [gpuReady, setGpuReady] = useState(false);
  const [analysisAbsent, setAnalysisAbsent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<Gpu | null>(null);
  const rafRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const grainSrcRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const storedRef = useRef<StrataSession[]>([]);
  const liveRef = useRef<LiveState | null>(null);
  const layoutRef = useRef<RenderStratum[]>([]);
  const trackIdRef = useRef<string>("");

  const cursorVRef = useRef(0.02);
  const cursorActiveRef = useRef(false);
  const cursorPlacedRef = useRef(false);
  const lastEchoIdxRef = useRef<number>(-2);
  const rngRef = useRef<() => number>(makeRng(0x16896a));
  const reducedRef = useRef(false);

  // playback timing
  const playStartCtxRef = useRef(0); // ctx.currentTime when the source started
  const playStartOffsetRef = useRef(0); // buffer offset at that start
  const lastTickRef = useRef(0); // ctx.currentTime of the previous frame tick
  const lastCheckpointRef = useRef(0); // playedSecs of the last persist

  const tdRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(1024));
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(512));

  // ── analyser sampling → live harmony ────────────────────────────────────────
  const sampleAudio = useCallback((playedSecs: number) => {
    const master = masterRef.current;
    const ls = liveRef.current;
    if (!master || !ls) return;
    const an = master.analyser;

    // RMS from the tamed time-domain signal
    const td = tdRef.current;
    an.getFloatTimeDomainData(td);
    let sq = 0;
    for (let i = 0; i < td.length; i++) sq += td[i] * td[i];
    const rms = Math.sqrt(sq / td.length);
    ls.curRms += (Math.min(1, rms * 3.2) - ls.curRms) * 0.15;
    ls.rmsSum += rms;
    ls.rmsCount += 1;
    if (rms > ls.peakRms) ls.peakRms = rms;

    // coarse spectral signature (SIG_BINS averaged)
    const freq = freqRef.current;
    an.getByteFrequencyData(freq);
    const per = Math.floor(freq.length / SIG_BINS);
    for (let bin = 0; bin < SIG_BINS; bin++) {
      let s = 0;
      for (let j = 0; j < per; j++) s += freq[bin * per + j];
      ls.sig[bin] += s / per / 255;
    }
    ls.sigCount += 1;

    // dominant chord at this playback position → mineral position + minor tension
    const analysis = analysisRef.current;
    let pc: number | null = null;
    let minor = ls.curMinor;
    if (analysis && analysis.chords.length > 0) {
      const chords = analysis.chords;
      let lo = 0;
      let hi = chords.length - 1;
      let idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (chords[mid].time <= playedSecs) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const chord = chords[idx];
      pc = chordRoot(chord.chord);
      minor = chordIsMinor(chord.chord) ? 1 : 0;
    } else {
      // graceful neutral mineral drift when analysis is absent
      pc = Math.floor((playedSecs * 0.06) % 12);
      minor = 0.35 + 0.25 * Math.sin(playedSecs * 0.03);
    }

    if (pc != null) {
      const pos = pcToPosition(((pc % 12) + 12) % 12);
      ls.curPos += (pos - ls.curPos) * 0.08;
      ls.curMinor += (minor - ls.curMinor) * 0.06;
      if (analysis && analysis.chords.length > 0) {
        ls.minorCount += minor >= 0.5 ? 1 : 0;
        ls.chordSamples += 1;
      }
      // periodic hue sample for the stored sequence
      if (playedSecs - ls.lastHueSampleAt >= HUE_SAMPLE_SEC) {
        ls.hueSamples.push(((pc % 12) + 12) % 12);
        ls.lastHueSampleAt = playedSecs;
      }
    }
  }, []);

  // ── granular echo — grains sliced from the real buffer, voiced to a chord ────
  const playEcho = useCallback((pcs: number[], intensity: number) => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    const buf = bufferRef.current;
    if (!ctx || !master || !buf) return;
    const rng = rngRef.current;
    const root = pcs[0] ?? 0;
    const nGrains = reducedRef.current ? 4 : 8;
    const dur = 0.15;
    const t0 = ctx.currentTime + 0.02;

    for (let i = 0; i < nGrains; i++) {
      const pc = pcs[i % pcs.length];
      const interval = (((pc - root) % 12) + 12) % 12;
      // slowed one octave → a low "memory" register; voiced to the chord tone
      const rate = 0.5 * Math.pow(2, interval / 12);
      const off = Math.max(0, rng() * Math.max(0.01, buf.duration - dur - 0.05));

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;

      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = (rng() - 0.5) * 0.8;

      src.connect(g);
      g.connect(pan);
      pan.connect(master.input);

      const st = t0 + i * 0.05 + rng() * 0.02;
      const peak = 0.16 * (0.5 + 0.5 * intensity);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(peak, st + 0.03);
      g.gain.linearRampToValueAtTime(0, st + dur);

      const set = grainSrcRef.current;
      set.add(src);
      src.onended = () => {
        try {
          src.disconnect();
          g.disconnect();
          pan.disconnect();
        } catch {
          /* closing */
        }
        set.delete(src);
      };
      try {
        src.start(st, off, dur + 0.05);
        src.stop(st + dur + 0.1);
      } catch {
        set.delete(src);
      }
    }
  }, []);

  // ── evaluate the cursor against the layout: metadata + echo trigger ──────────
  const evaluateCursor = useCallback(() => {
    const layout = layoutRef.current;
    if (layout.length === 0) {
      setCursorInfo(null);
      lastEchoIdxRef.current = -2;
      return;
    }
    const cv = cursorVRef.current;
    let hit = -1;
    for (let i = 0; i < layout.length; i++) {
      if (cv >= layout[i].vTop && cv < layout[i].vBot) {
        hit = i;
        break;
      }
    }
    if (hit < 0) hit = cv < layout[0].vTop ? 0 : layout.length - 1;
    const st = layout[hit];
    cursorPlacedRef.current = true;

    setCursorInfo({
      kind: st.kind,
      sessionsAgo: st.sessionsAgo,
      secs: st.session ? st.session.secs : (liveRef.current?.playedSecs ?? 0),
      t: st.session ? st.session.t : Date.now(),
    });

    if (hit !== lastEchoIdxRef.current) {
      lastEchoIdxRef.current = hit;
      const hues =
        st.session?.hues ??
        (liveRef.current ? liveRef.current.hueSamples : []);
      const pcs = topPitchClasses(hues.length ? hues : [Math.round(st.pos * 12)], 3);
      playEcho(pcs, 0.4 + 0.6 * st.meanRms);
    }
  }, [playEcho]);

  // ── main render loop ─────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const draw = () => {
      const gpu = gpuRef.current;
      const canvas = canvasRef.current;
      if (!gpu || !canvas) return;

      // advance the live session while the source plays
      const ctx = audioCtxRef.current;
      const ls = liveRef.current;
      if (playing && ctx && ls) {
        const now = ctx.currentTime;
        const dt = Math.max(0, Math.min(0.1, now - lastTickRef.current));
        lastTickRef.current = now;
        ls.playedSecs += dt;
        sampleAudio(playStartOffsetRef.current + (now - playStartCtxRef.current));
      }

      // layout (stored history minus the currently-live id + the live band)
      const liveId = ls?.id ?? -1;
      const storedForLayout = playing
        ? storedRef.current.filter((s) => s.id !== liveId)
        : storedRef.current;
      const layout = computeLayout(storedForLayout, playing ? ls : null);
      layoutRef.current = layout;

      // write strata storage buffer
      const sa = gpu.strataArr;
      sa.fill(0);
      const count = Math.min(MAX_STRATA, layout.length);
      for (let i = 0; i < count; i++) {
        const s = layout[i];
        const o = i * 8;
        sa[o + 0] = s.vTop;
        sa[o + 1] = s.vBot;
        sa[o + 2] = s.pos;
        sa[o + 3] = s.minor;
        sa[o + 4] = s.meanRms;
        sa[o + 5] = s.peakRms;
        sa[o + 6] = s.age01;
        sa[o + 7] = s.seed;
      }
      gpu.device.queue.writeBuffer(gpu.strataBuf, 0, sa.buffer, 0, sa.byteLength);

      // uniforms
      const w = canvas.width;
      const h = canvas.height;
      const u = gpu.uniformArr;
      u[0] = w;
      u[1] = h;
      u[2] = cursorVRef.current;
      u[3] = (performance.now() / 1000) % 100000;
      u[4] = COL_X0 * w;
      u[5] = COL_Y0 * h;
      u[6] = COL_X1 * w;
      u[7] = COL_Y1 * h;
      u[8] = count;
      u[9] = playing ? 1 : 0;
      u[10] = cursorActiveRef.current || cursorPlacedRef.current ? 1 : 0;
      u[11] = 0;
      gpu.device.queue.writeBuffer(gpu.uniformBuf, 0, u.buffer, 0, u.byteLength);

      const enc = gpu.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: gpu.ctx.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.03, g: 0.04, b: 0.052, a: 1 },
          },
        ],
      });
      pass.setPipeline(gpu.pipeline);
      pass.setBindGroup(0, gpu.bindGroup);
      pass.draw(4);
      pass.end();
      gpu.device.queue.submit([enc.finish()]);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, [playing, sampleAudio]);

  // ── persist the growing / finished live stratum ──────────────────────────────
  const persistLive = useCallback(async () => {
    const ls = liveRef.current;
    const tid = trackIdRef.current;
    if (!ls || !tid) return;
    if (ls.playedSecs < MIN_PERSIST_SEC) return;
    const rec = liveToSession(ls);
    try {
      const capped = await upsertSession(tid, rec);
      storedRef.current = capped;
      setStoredCount(capped.length);
    } catch {
      /* storage unavailable — the live band still renders this session */
    }
  }, []);

  // ── size the canvas to its box ───────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.offsetWidth * dpr));
    const h = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // ── initialise WebGPU once ───────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas();

    initGpu(canvas)
      .then((gpu) => {
        if (cancelled) {
          gpu.destroy();
          return;
        }
        gpuRef.current = gpu;
        gpu.device.lost.then((info) => {
          if (!cancelled) setGpuError(`GPU device lost: ${info.reason}`);
        });
        setGpuReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setGpuError(
          `WebGPU is unavailable here (${msg}). Strata needs WebGPU (Chrome/Edge, or Safari on iOS 26+).`,
        );
      });

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      if (gpuRef.current) {
        gpuRef.current.destroy();
        gpuRef.current = null;
      }
    };
    // startLoop/sizeCanvas are stable enough; we intentionally init once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the RAF closure current when `playing`/cursor change
  useEffect(() => {
    if (!gpuReady) return;
    cancelAnimationFrame(rafRef.current);
    startLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [gpuReady, startLoop]);

  // ── select + load a track ────────────────────────────────────────────────────
  const selectTrack = useCallback(
    async (id: string) => {
      if (!id) return;
      // finish any in-progress listening on the previous track first
      if (sourceRef.current) {
        try {
          sourceRef.current.onended = null;
          sourceRef.current.stop();
          sourceRef.current.disconnect();
        } catch {
          /* */
        }
        sourceRef.current = null;
      }
      if (liveRef.current) {
        await persistLive();
        liveRef.current = null;
      }
      setPlaying(false);
      setSelectedId(id);
      setLoading(true);
      setLoadError(null);
      setCursorInfo(null);
      lastEchoIdxRef.current = -2;
      cursorPlacedRef.current = false;
      playStartOffsetRef.current = 0;

      // audio context + safe master (created on this user gesture)
      let ctx = audioCtxRef.current;
      if (!ctx) {
        try {
          ctx = new AudioContext();
          audioCtxRef.current = ctx;
        } catch {
          setLoadError("Web Audio is unavailable in this browser.");
          setLoading(false);
          return;
        }
      }
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* */
        }
      }
      if (!masterRef.current) masterRef.current = createSafeMaster(ctx);

      try {
        const [{ buffer, title: tt }, analysis, stored] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id),
          loadStrata(id),
        ]);
        bufferRef.current = buffer;
        analysisRef.current = analysis;
        setAnalysisAbsent(!analysis || analysis.chords.length === 0);
        storedRef.current = stored;
        trackIdRef.current = id;
        setStoredCount(stored.length);
        setTitle(tt);
        cursorVRef.current = 0.02;
        cursorActiveRef.current = false;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(`Could not load this track (${msg}).`);
      } finally {
        setLoading(false);
      }
    },
    [persistLive],
  );

  // ── play / pause ─────────────────────────────────────────────────────────────
  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    const buf = bufferRef.current;
    if (!ctx || !master || !buf) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    if (!liveRef.current) {
      liveRef.current = makeLiveState(Date.now());
      lastCheckpointRef.current = 0;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master.input);
    const offset = playStartOffsetRef.current % buf.duration;
    playStartCtxRef.current = ctx.currentTime;
    lastTickRef.current = ctx.currentTime;
    src.start(0, offset);
    src.onended = () => {
      // natural end of the track — persist and reset to a fresh potential session
      if (sourceRef.current === src) {
        sourceRef.current = null;
        playStartOffsetRef.current = 0;
        setPlaying(false);
        void (async () => {
          await persistLive();
          if (liveRef.current) {
            // fold into history; the just-heard stratum becomes stored
            liveRef.current = null;
          }
        })();
      }
    };
    sourceRef.current = src;
    setPlaying(true);
  }, [persistLive]);

  const pausePlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const src = sourceRef.current;
    if (!ctx || !src) return;
    // remember where we were so resume continues the same session
    playStartOffsetRef.current =
      playStartOffsetRef.current + (ctx.currentTime - playStartCtxRef.current);
    try {
      src.onended = null;
      src.stop();
      src.disconnect();
    } catch {
      /* */
    }
    sourceRef.current = null;
    setPlaying(false);
    void persistLive();
  }, [persistLive]);

  // periodic checkpoint while playing (so a hard reload preserves the stratum)
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      const ls = liveRef.current;
      if (!ls) return;
      if (ls.playedSecs - lastCheckpointRef.current >= CHECKPOINT_SEC) {
        lastCheckpointRef.current = ls.playedSecs;
        void persistLive();
      }
    }, 2000);
    return () => window.clearInterval(iv);
  }, [playing, persistLive]);

  // ── pointer scrub → core-sample cursor ───────────────────────────────────────
  const pointerToCursor = useCallback((clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y0 = rect.top + COL_Y0 * rect.height;
    const y1 = rect.top + COL_Y1 * rect.height;
    const v = (clientY - y0) / Math.max(1, y1 - y0);
    cursorVRef.current = Math.max(0, Math.min(0.9999, v));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      if (!trackIdRef.current) return;
      cursorActiveRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      pointerToCursor(e.clientY);
      evaluateCursor();
    };
    const onMove = (e: PointerEvent) => {
      if (!cursorActiveRef.current) return;
      pointerToCursor(e.clientY);
      evaluateCursor();
    };
    const onUp = (e: PointerEvent) => {
      cursorActiveRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [pointerToCursor, evaluateCursor]);

  // ── clear this track's remembered column ─────────────────────────────────────
  const clearColumn = useCallback(async () => {
    const tid = trackIdRef.current;
    if (!tid) return;
    await clearStrata(tid);
    storedRef.current = [];
    liveRef.current = null;
    setStoredCount(0);
    setPlaying(false);
    playStartOffsetRef.current = 0;
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch {
        /* */
      }
      sourceRef.current = null;
    }
    setCursorInfo(null);
    lastEchoIdxRef.current = -2;
  }, []);

  // ── full teardown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const grains = grainSrcRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      // best-effort synchronous persist of an in-progress session
      const ls = liveRef.current;
      const tid = trackIdRef.current;
      if (ls && tid && ls.playedSecs >= MIN_PERSIST_SEC) {
        void upsertSession(tid, liveToSession(ls)).catch(() => {});
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.onended = null;
          sourceRef.current.stop();
          sourceRef.current.disconnect();
        } catch {
          /* */
        }
        sourceRef.current = null;
      }
      grains.forEach((s) => {
        try {
          s.onended = null;
          s.stop();
          s.disconnect();
        } catch {
          /* */
        }
      });
      grains.clear();
      if (masterRef.current) {
        masterRef.current.disconnect();
        masterRef.current = null;
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      audioCtxRef.current = null;
      if (gpuRef.current) {
        gpuRef.current.destroy();
        gpuRef.current = null;
      }
    };
  }, []);

  const notesText = `Strata treats a recording as a medium that remembers being heard. Each listening deposits a thin horizontal band — a stratum — at the top of a vertical core sample. The band's mineral hue comes from that session's dominant chords (mapped around the circle of fifths into a cool slate→mineral-blue→patina→pale gradient); minor and diminished harmony pulls it toward cold slate and darkens it; the fine internal laminae tighten with the track's dynamics (analyser RMS).

The medium PERSISTS across browser sessions. Every session's summary — a timestamp, listened seconds, a short sampled sequence of dominant pitch-classes, a minor-tension fraction, mean/peak loudness, and a 16-float spectral signature — is written to IndexedDB (with a localStorage fallback), keyed per track, and checkpointed every few seconds so a reload mid-listen still preserves the stratum. No raw audio is ever stored, each record is well under 1KB, and only the newest ~60 sessions per track are kept. Return to a track and the whole column re-forms: older strata sit lower and compacted, the newest on top.

Drag the core-sample cursor down the column to read the history. Each stratum it crosses surfaces that session's date, how many sessions ago it was, and how long it was listened — and plays a soft granular echo: grains sliced from the CURRENTLY loaded real track buffer, re-pitched toward that remembered session's dominant chord and dropped an octave into a low "memory" register. The memory is something you can literally scrub through and hear.

References: "Persistent Computational State: A Session-Centric Runtime for Generative World Models" (arXiv:2607.21686, Jul 2026), on preserving the minimal non-recomputable state across a session boundary; and Katie Paterson's Future Library, a work that accretes across time, unheard until later. The honest first here is a piece whose medium persists across browser sessions so returning to a track re-forms the accreted geology of every past listening — scrubbable, and audible, as a core sample.`;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: trackIdRef.current ? "ns-resize" : "default" }}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Strata
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            A recording that remembers being heard. Every listening lays down a
            mineral stratum; return and the full core sample of all past visits
            re-forms — scrub it to read and hear the sediment of each session.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* GPU error — house-style destructive notice, never a blank canvas */}
      {gpuError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-border bg-background/90 p-6 text-center shadow-lg backdrop-blur">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              webgpu required
            </p>
            <p className="mt-3 text-base text-destructive">{gpuError}</p>
          </div>
        </div>
      )}

      {/* Track picker + transport */}
      {!gpuError && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <label className="pointer-events-auto flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={selectedId}
              onChange={(e) => void selectTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>
                Choose one of Karel&apos;s tracks…
              </option>
              <optgroup label="Welcome Home">
                {TRACK_OPTS.filter((t) => t.group === "Welcome Home").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Snowflake">
                {TRACK_OPTS.filter((t) => t.group === "Snowflake").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {selectedId && !loading && (
            <button
              onClick={() => (playing ? pausePlayback() : startPlayback())}
              className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play — deposit a stratum"}
            </button>
          )}

          {loading && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              loading real audio…
            </span>
          )}

          {selectedId && !loading && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {title ? `${title} · ` : ""}
              {storedCount} stored {storedCount === 1 ? "stratum" : "strata"}
              {analysisAbsent ? " · neutral drift (no analysis)" : ""}
            </span>
          )}

          {loadError && (
            <span className="text-sm text-destructive">{loadError}</span>
          )}

          <div className="flex-1" />

          {selectedId && storedCount > 0 && (
            <button
              onClick={() => void clearColumn()}
              className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear column
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* Cursor readout — the inspectable memory */}
      {!gpuError && cursorInfo && (
        <div className="pointer-events-none absolute left-6 top-1/2 max-w-[15rem] -translate-y-1/2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            core sample
          </p>
          <p className="mt-1 text-base text-foreground">
            {relativeLabel(cursorInfo, storedCount)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            listened {durationLabel(cursorInfo.secs)}
            {cursorInfo.kind === "stored" ? ` · ${dateLabel(cursorInfo.t)}` : ""}
          </p>
        </div>
      )}

      {/* First-run hint */}
      {!gpuError && !selectedId && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="max-w-md text-base text-muted-foreground">
            Pick one of Karel&apos;s tracks to open its core sample. Press play to
            deposit a new stratum, then drag down the column to scrub through — and
            hear — every past listening.
          </p>
        </div>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Strata — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                close
              </button>
            </div>
            {notesText.split("\n\n").map((para, i) => (
              <p key={i} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {para}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
