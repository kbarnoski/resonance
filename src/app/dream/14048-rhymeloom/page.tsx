"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14048 · Rhyme Loom
//
//   ONE QUESTION
//   What if you could improvise a never-ending, always-coherent path through one
//   of Karel's own recordings by leaping between the moments that *rhyme* with
//   each other — turning his fixed take into an infinite, playable instrument?
//
//   MECHANISM (classic MIR, hand-rolled — no synth, every sound is HIS audio):
//     1. Decode one real recording. Slice it into short beat-ish segments (seeded
//        from the track's real tempo when the analysis is available, else fixed
//        ~0.42s frames).
//     2. For each segment compute a 12-D CHROMA vector (pitch-class energy) with a
//        bank of Goertzel filters over a decimated mono signal — one filter per
//        semitone across several octaves, folded into 12 pitch classes, then
//        L2-normalized.
//     3. Build the SELF-SIMILARITY / recurrence matrix S[i][j] = cosine(chroma_i,
//        chroma_j). For every segment precompute its top-K most-similar *other*
//        segments (its "rhymes"), excluding trivially-adjacent ones.
//     4. Play segment-by-segment on a gapless look-ahead scheduler with tiny
//        equal-power crossfades at every join. It advances linearly, BUT you can
//        leap to a rhyming segment at any moment — click a matrix cell, press a
//        key, or flip on AUTO-WANDER, which keeps taking musically-similar
//        branches forever. A COHERENCE slider decides how similar a leap must be:
//        high = smooth/safe, low = surprising.
//     5. VISUAL is a WebGL2 luminous woven heat-map of the self-similarity matrix
//        (the diagonal stripes of repeated passages become visible architecture),
//        with the current segment as a bright cross-hair playhead and its
//        candidate rhyme-leaps glowing along the current row. Canvas2D fallback
//        renders the same matrix. Subtle bloom is driven by the safeMaster
//        analyser.
//
//   REFS  Jonathan Foote, "Visualizing Music and Audio using Self-Similarity"
//   (ACM MM 1999); Paul Lamere, "The Infinite Jukebox" (2012). Recent barwise
//   music-structure / self-similarity segmentation, arXiv 2025–2026. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── Tuning constants ─────────────────────────────────────────────────────────
const MAX_SEGMENTS = 320; // cap so the matrix computes + renders quickly
const MIN_SEG_DUR = 0.3; // seconds — floor on segment length
const DEFAULT_SEG_DUR = 0.42; // seconds — used when there's no tempo
const TOP_K = 14; // rhymes precomputed per segment
const ADJ_EXCLUDE = 3; // skip |i-j| < this (trivially-adjacent) as "rhymes"
const CROSSFADE = 0.02; // seconds — equal-power fade at every join
const DEC_RATE_TARGET = 11025; // Hz — decimate before chroma analysis
const MIDI_LOW = 36; // C2
const MIDI_HIGH = 95; // B6  → 60 semitone Goertzel bins

// ── Chroma via a Goertzel filter bank ────────────────────────────────────────
interface BinBank {
  coeff: Float32Array; // 2·cos(w) per bin
  cw: Float32Array; // cos(w)
  sw: Float32Array; // sin(w)
  pc: Uint8Array; // pitch class (0..11) per bin
  n: number;
}

function buildBinBank(decRate: number): BinBank {
  const n = MIDI_HIGH - MIDI_LOW + 1;
  const coeff = new Float32Array(n);
  const cw = new Float32Array(n);
  const sw = new Float32Array(n);
  const pc = new Uint8Array(n);
  for (let b = 0; b < n; b++) {
    const midi = MIDI_LOW + b;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const w = (2 * Math.PI * freq) / decRate;
    coeff[b] = 2 * Math.cos(w);
    cw[b] = Math.cos(w);
    sw[b] = Math.sin(w);
    pc[b] = midi % 12;
  }
  return { coeff, cw, sw, pc, n };
}

// Hann windows are cached by length (segment lengths cluster tightly).
function getHann(cache: Map<number, Float32Array>, len: number): Float32Array {
  let w = cache.get(len);
  if (w) return w;
  w = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, len - 1));
  }
  cache.set(len, w);
  return w;
}

// One 12-D L2-normalized chroma vector for sig[start .. start+len).
function computeChroma(
  sig: Float32Array,
  start: number,
  len: number,
  win: Float32Array,
  bank: BinBank,
): Float32Array {
  const chroma = new Float32Array(12);
  const { coeff, cw, sw, pc, n } = bank;
  for (let b = 0; b < n; b++) {
    const cf = coeff[b];
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < len; i++) {
      const x = sig[start + i] * win[i];
      const s0 = cf * s1 - s2 + x;
      s2 = s1;
      s1 = s0;
    }
    const real = s1 - s2 * cw[b];
    const imag = s2 * sw[b];
    chroma[pc[b]] += Math.sqrt(real * real + imag * imag);
  }
  // Perceptual compression, then L2 normalize.
  let norm = 0;
  for (let k = 0; k < 12; k++) {
    chroma[k] = Math.log1p(chroma[k]);
    norm += chroma[k] * chroma[k];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let k = 0; k < 12; k++) chroma[k] /= norm;
  return chroma;
}

// Average all channels to mono and decimate by an integer factor.
function mixMonoDecimate(
  buffer: AudioBuffer,
  factor: number,
): Float32Array {
  const ch = buffer.numberOfChannels;
  const srcLen = buffer.length;
  const outLen = Math.floor(srcLen / factor);
  const out = new Float32Array(outLen);
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < outLen; i++) {
    const base = i * factor;
    let acc = 0;
    // Simple box average over the decimation window (cheap anti-alias).
    for (let j = 0; j < factor; j++) {
      const idx = base + j;
      for (let c = 0; c < ch; c++) acc += chans[c][idx];
    }
    out[i] = acc / (factor * ch);
  }
  return out;
}

// ── The full analysis result ─────────────────────────────────────────────────
interface Segment {
  startSec: number;
  dur: number;
}
interface Analysis {
  segs: Segment[];
  n: number;
  matrix: Uint8Array; // n*n cosine similarity, row-major, 0..255
  candidates: number[][]; // top-K rhyme indices per segment (sim-desc)
  tempo: number | null;
}

// Compute chroma + self-similarity + candidate rhymes. Yields to the event loop
// between chunks so the "weaving…" progress can paint.
async function runAnalysis(
  buffer: AudioBuffer,
  tempo: number | null,
  onProgress: (frac: number) => void,
): Promise<Analysis> {
  const sr = buffer.sampleRate;
  const factor = Math.max(1, Math.round(sr / DEC_RATE_TARGET));
  const decRate = sr / factor;
  const sig = mixMonoDecimate(buffer, factor);
  const totalDur = buffer.duration;

  // Segment length: seed from the real tempo (one beat) when we have it.
  let segDur = DEFAULT_SEG_DUR;
  if (tempo && tempo > 30 && tempo < 300) {
    const beat = 60 / tempo;
    // Fold very fast beats up to a musical-ish frame length.
    segDur = beat < MIN_SEG_DUR ? beat * 2 : beat;
  }
  segDur = Math.max(segDur, MIN_SEG_DUR);
  let n = Math.floor(totalDur / segDur);
  if (n > MAX_SEGMENTS) {
    n = MAX_SEGMENTS;
    segDur = totalDur / n;
  }
  if (n < 4) n = Math.max(4, n); // guard tiny tracks

  const segLen = Math.max(1, Math.round(segDur * decRate));
  const bank = buildBinBank(decRate);
  const hannCache = new Map<number, Float32Array>();

  // 1. Chroma per segment (chunked).
  const chromas: Float32Array[] = new Array(n);
  const segs: Segment[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const start = i * segLen;
    const len = Math.min(segLen, sig.length - start);
    const win = getHann(hannCache, len);
    chromas[i] = computeChroma(sig, start, len, win, bank);
    const startSec = (i * segLen) / decRate;
    const dur = Math.min(segDur, totalDur - startSec);
    segs[i] = { startSec, dur: Math.max(0.05, dur) };
    if ((i & 15) === 0) {
      onProgress((i / n) * 0.7);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 2. Self-similarity matrix (cosine = dot, vectors are unit-norm).
  const matrix = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    const ci = chromas[i];
    for (let j = i; j < n; j++) {
      const cj = chromas[j];
      let dot = 0;
      for (let k = 0; k < 12; k++) dot += ci[k] * cj[k];
      const v = Math.max(0, Math.min(1, dot));
      const byte = Math.round(v * 255);
      matrix[i * n + j] = byte;
      matrix[j * n + i] = byte;
    }
    if ((i & 31) === 0) {
      onProgress(0.7 + (i / n) * 0.25);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 3. Top-K rhymes per segment (exclude trivially-adjacent).
  const candidates: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: Array<{ j: number; s: number }> = [];
    for (let j = 0; j < n; j++) {
      if (Math.abs(i - j) < ADJ_EXCLUDE) continue;
      row.push({ j, s: matrix[i * n + j] });
    }
    row.sort((a, b) => b.s - a.s);
    candidates[i] = row.slice(0, TOP_K).map((r) => r.j);
  }
  onProgress(1);

  return { segs, n, matrix, candidates, tempo };
}

// ── Violet ramp (JS mirror for the Canvas2D fallback) ────────────────────────
function violetRGB(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [5, 3, 10]],
    [0.3, [26, 15, 56]],
    [0.55, [71, 36, 128]],
    [0.78, [140, 89, 217]],
    [1.0, [217, 191, 255]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ── WebGL2 shaders ────────────────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  vUv = 0.5 * (p + 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uMatrix;
uniform float uN;
uniform float uCur;
uniform float uTime;
uniform float uLevel;
uniform float uCandCount;
uniform int uCand[16];
in vec2 vUv;
out vec4 frag;

vec3 violet(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.020, 0.012, 0.039);
  vec3 c1 = vec3(0.102, 0.059, 0.220);
  vec3 c2 = vec3(0.278, 0.141, 0.502);
  vec3 c3 = vec3(0.549, 0.349, 0.851);
  vec3 c4 = vec3(0.851, 0.749, 1.000);
  if (t < 0.3)  return mix(c0, c1, t / 0.3);
  if (t < 0.55) return mix(c1, c2, (t - 0.3) / 0.25);
  if (t < 0.78) return mix(c2, c3, (t - 0.55) / 0.23);
  return mix(c3, c4, (t - 0.78) / 0.22);
}

void main(){
  vec2 uv = vUv;
  // Row 0 at top; texture origin is bottom-left, so flip v.
  float v = texture(uMatrix, vec2(uv.x, 1.0 - uv.y)).r;
  float bloom = 0.9 + 0.55 * uLevel;
  vec3 c = violet(pow(v, 0.82) * bloom);

  // Woven architectural grid — faint cell seams.
  float seam = 0.0;
  seam += smoothstep(0.0, 0.5, abs(fract(uv.x * uN) - 0.5)) ;
  c *= 0.9 + 0.1 * seam;

  float curU = uCur / uN;             // vertical position of current row
  float curV = uCur / uN;             // horizontal position of current column

  // Cross-hair playhead.
  float pulse = 0.6 + 0.4 * sin(uTime * 2.2);
  float hor = smoothstep(0.007, 0.0, abs((1.0 - uv.y) - curU));
  float ver = smoothstep(0.007, 0.0, abs(uv.x - curV));
  c += vec3(0.40, 0.52, 0.95) * (hor + ver) * pulse;

  // Rhyme-leap candidates: glowing dots along the current row.
  float glow = 0.0;
  for (int k = 0; k < 16; k++){
    if (float(k) >= uCandCount) break;
    float cx = float(uCand[k]) / uN;
    float d = distance(vec2(uv.x, 1.0 - uv.y), vec2(cx, curU));
    glow += smoothstep(0.018, 0.0, d);
  }
  c += vec3(0.85, 0.72, 1.0) * glow * (0.75 + 0.35 * sin(uTime * 3.0));

  // Vignette.
  float dd = distance(uv, vec2(0.5));
  c *= 1.0 - 0.28 * smoothstep(0.42, 0.98, dd);
  frag = vec4(c, 1.0);
}`;

interface GlBackend {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  tex: WebGLTexture;
  uni: {
    matrix: WebGLUniformLocation | null;
    n: WebGLUniformLocation | null;
    cur: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    level: WebGLUniformLocation | null;
    candCount: WebGLUniformLocation | null;
    cand: WebGLUniformLocation | null;
  };
}

function initGl(canvas: HTMLCanvasElement): GlBackend | null {
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) return null;
  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    gl,
    program,
    tex,
    uni: {
      matrix: gl.getUniformLocation(program, "uMatrix"),
      n: gl.getUniformLocation(program, "uN"),
      cur: gl.getUniformLocation(program, "uCur"),
      time: gl.getUniformLocation(program, "uTime"),
      level: gl.getUniformLocation(program, "uLevel"),
      candCount: gl.getUniformLocation(program, "uCandCount"),
      cand: gl.getUniformLocation(program, "uCand"),
    },
  };
}

function uploadMatrix(be: GlBackend, matrix: Uint8Array, n: number) {
  const { gl, tex } = be;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, matrix);
}

// ── Playback scheduler bookkeeping ────────────────────────────────────────────
interface ActiveVoice {
  src: AudioBufferSourceNode;
  g: GainNode;
  end: number;
}
interface QueueItem {
  index: number;
  start: number;
  end: number;
}

type Phase = "idle" | "loading" | "weaving" | "ready";

// ─────────────────────────────────────────────────────────────────────────────

export default function RhymeLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state
  const [selectedId, setSelectedId] = useState(REAL_TRACKS[0].id);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoWander, setAutoWander] = useState(false);
  const [coherence, setCoherence] = useState(0.65);
  const [error, setError] = useState<string | null>(null);
  const [glFallback, setGlFallback] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [meta, setMeta] = useState<{ title: string; n: number; tempo: number | null } | null>(
    null,
  );
  const [curReadout, setCurReadout] = useState(0);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const fadeInRef = useRef<Float32Array | null>(null);
  const fadeOutRef = useRef<Float32Array | null>(null);

  // Scheduler refs
  const timerRef = useRef<number | null>(null);
  const nextSegRef = useRef(0);
  const nextTimeRef = useRef(0);
  const pendingJumpRef = useRef<number | null>(null);
  const activeRef = useRef<ActiveVoice[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const currentSegRef = useRef(0);

  // Live control mirrors (read inside scheduler / raf without re-subscribing)
  const autoWanderRef = useRef(autoWander);
  const coherenceRef = useRef(coherence);
  const playingRef = useRef(playing);
  useEffect(() => {
    autoWanderRef.current = autoWander;
  }, [autoWander]);
  useEffect(() => {
    coherenceRef.current = coherence;
  }, [coherence]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Visual refs
  const rafRef = useRef<number | null>(null);
  const glRef = useRef<GlBackend | null>(null);
  const c2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(0);
  const freqBufRef = useRef<Uint8Array | null>(null);

  // ── Pick a rhyme for a segment, biased by the coherence slider ─────────────
  const pickRhyme = useCallback((from: number): number => {
    const a = analysisRef.current;
    if (!a) return from;
    const cand = a.candidates[from];
    if (!cand || cand.length === 0) return (from + 1) % a.n;
    const c = coherenceRef.current;
    // High coherence → only the very best rhyme; low → any of the top-K.
    const span = Math.max(1, Math.round(1 + (1 - c) * (cand.length - 1)));
    const pick = cand[Math.floor(Math.random() * span)];
    return pick;
  }, []);

  // ── Decide the segment that follows `from` on the timeline ─────────────────
  const chooseNext = useCallback(
    (from: number): number => {
      const a = analysisRef.current;
      if (!a) return 0;
      if (pendingJumpRef.current !== null) {
        const t = pendingJumpRef.current;
        pendingJumpRef.current = null;
        return Math.max(0, Math.min(a.n - 1, t));
      }
      const linear = from + 1;
      const atEnd = linear >= a.n;
      if (autoWanderRef.current) {
        // Branch on a coin flip, and always branch at the end so it never stops.
        if (atEnd || Math.random() < 0.42) return pickRhyme(from);
        return linear;
      }
      return atEnd ? 0 : linear; // linear play loops the take
    },
    [pickRhyme],
  );

  // ── Schedule one segment's audio at time `when` ────────────────────────────
  const scheduleSegment = useCallback((idx: number, when: number) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const buffer = bufferRef.current;
    const a = analysisRef.current;
    const fin = fadeInRef.current;
    const fout = fadeOutRef.current;
    if (!ctx || !safe || !buffer || !a || !fin || !fout) return;
    const seg = a.segs[idx];
    const cf = Math.min(CROSSFADE, seg.dur * 0.4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    src.connect(g).connect(safe.input);

    g.gain.setValueCurveAtTime(fin, when, cf);
    g.gain.setValueCurveAtTime(fout, when + seg.dur - cf, cf);

    try {
      src.start(when, seg.startSec, seg.dur);
    } catch {
      return;
    }
    const voice: ActiveVoice = { src, g, end: when + seg.dur };
    activeRef.current.push(voice);
    src.onended = () => {
      try {
        g.disconnect();
        src.disconnect();
      } catch {
        /* already gone */
      }
      activeRef.current = activeRef.current.filter((v) => v !== voice);
    };
    queueRef.current.push({ index: idx, start: when, end: when + seg.dur });
  }, []);

  // ── Look-ahead scheduler tick ──────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const a = analysisRef.current;
    if (!ctx || !a || !playingRef.current) return;
    const lookahead = 0.25;
    let guard = 0;
    while (nextTimeRef.current < ctx.currentTime + lookahead && guard < 32) {
      const idx = nextSegRef.current;
      const seg = a.segs[idx];
      scheduleSegment(idx, nextTimeRef.current);
      nextTimeRef.current += seg.dur - Math.min(CROSSFADE, seg.dur * 0.4);
      nextSegRef.current = chooseNext(idx);
      guard++;
    }
  }, [chooseNext, scheduleSegment]);

  // ── Stop all sound, keep the analysis loaded ───────────────────────────────
  const stopPlayback = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    for (const v of activeRef.current) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.g.disconnect();
      } catch {
        /* already stopped */
      }
    }
    activeRef.current = [];
    queueRef.current = [];
    playingRef.current = false;
    setPlaying(false);
  }, []);

  // ── Start (or resume) playback from the current playhead ───────────────────
  const startPlayback = useCallback(async () => {
    const ctx = ctxRef.current;
    const a = analysisRef.current;
    if (!ctx || !a) return;
    await ctx.resume();
    nextSegRef.current = currentSegRef.current;
    nextTimeRef.current = ctx.currentTime + 0.08;
    playingRef.current = true;
    setPlaying(true);
    if (timerRef.current === null) {
      timerRef.current = window.setInterval(runScheduler, 30);
    }
    runScheduler();
  }, [runScheduler]);

  // ── The main "Weave" action: load → analyze → play ─────────────────────────
  const startWeave = useCallback(async () => {
    stopPlayback();
    setError(null);
    setPhase("loading");
    setProgress(0);
    analysisRef.current = null;
    currentSegRef.current = 0;
    try {
      // One shared AudioContext + safe master for the lifetime of the page.
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        ctxRef.current = ctx;
        safeRef.current = createSafeMaster(ctx);
        // Precompute equal-power crossfade curves once.
        const cn = 48;
        const fin = new Float32Array(cn);
        const fout = new Float32Array(cn);
        for (let i = 0; i < cn; i++) {
          const t = i / (cn - 1);
          fin[i] = Math.sin(0.5 * Math.PI * t);
          fout[i] = Math.cos(0.5 * Math.PI * t);
        }
        fadeInRef.current = fin;
        fadeOutRef.current = fout;
      }
      await ctx.resume();

      const { buffer, title } = await loadRealTrackBuffer(ctx, selectedId);
      bufferRef.current = buffer;

      // Real tempo (if available) seeds the segment grid; degrade gracefully.
      let tempo: number | null = null;
      try {
        const ta = await loadTrackAnalysis(selectedId);
        tempo = ta?.tempo ?? null;
      } catch {
        tempo = null;
      }

      setPhase("weaving");
      const analysis = await runAnalysis(buffer, tempo, (f) => setProgress(f));
      analysisRef.current = analysis;
      setMeta({ title, n: analysis.n, tempo: analysis.tempo });

      const be = glRef.current;
      if (be) uploadMatrix(be, analysis.matrix, analysis.n);

      setPhase("ready");
      await startPlayback();
    } catch (e) {
      console.error(e);
      setError(
        "Could not load or weave this recording. Please try another track.",
      );
      setPhase("idle");
    }
  }, [selectedId, startPlayback, stopPlayback]);

  // ── Manual leap: jump to a rhyme of the currently-sounding segment ─────────
  const leapToRhyme = useCallback(() => {
    const a = analysisRef.current;
    if (!a) return;
    pendingJumpRef.current = pickRhyme(currentSegRef.current);
  }, [pickRhyme]);

  // ── Click a matrix cell → leap to that column's segment ────────────────────
  const handleCanvasClick = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    const a = analysisRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const target = Math.max(0, Math.min(a.n - 1, Math.floor(fx * a.n)));
    pendingJumpRef.current = target;
    if (!playingRef.current) void startPlayback();
  }, [startPlayback]);

  // ── Visual render loop (always running; draws once analysis is ready) ──────
  const drawFrame = useCallback((tMs: number) => {
    const a = analysisRef.current;
    const safe = safeRef.current;
    const canvas = canvasRef.current;

    // Track the sounding segment from the scheduled queue.
    const ctx = ctxRef.current;
    if (ctx && a) {
      const now = ctx.currentTime;
      const q = queueRef.current;
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i].start <= now && now < q[i].end) {
          currentSegRef.current = q[i].index;
          break;
        }
      }
      queueRef.current = q.filter((it) => it.end > now - 1);
    }

    // Analyser level for subtle bloom.
    if (safe && freqBufRef.current) {
      const buf = freqBufRef.current;
      safe.analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const lvl = sum / (buf.length * 255);
      levelRef.current += (lvl - levelRef.current) * 0.15;
    }

    const be = glRef.current;
    if (be && a && canvas) {
      const { gl, program, uni } = be;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, be.tex);
      gl.uniform1i(uni.matrix, 0);
      gl.uniform1f(uni.n, a.n);
      gl.uniform1f(uni.cur, currentSegRef.current);
      gl.uniform1f(uni.time, tMs * 0.001);
      gl.uniform1f(uni.level, levelRef.current);
      const cand = a.candidates[currentSegRef.current] ?? [];
      const cc = Math.min(16, cand.length);
      const arr = new Int32Array(16);
      for (let i = 0; i < cc; i++) arr[i] = cand[i];
      gl.uniform1iv(uni.cand, arr);
      gl.uniform1f(uni.candCount, cc);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (a && canvas) {
      // Canvas2D fallback: blit the matrix, then overlay playhead + candidates.
      const c2d = c2dRef.current;
      const off = offRef.current;
      if (c2d && off) {
        c2d.imageSmoothingEnabled = true;
        c2d.clearRect(0, 0, canvas.width, canvas.height);
        c2d.drawImage(off, 0, 0, a.n, a.n, 0, 0, canvas.width, canvas.height);
        const cur = currentSegRef.current;
        const cellW = canvas.width / a.n;
        const cellH = canvas.height / a.n;
        c2d.fillStyle = "rgba(120,150,240,0.35)";
        c2d.fillRect(0, cur * cellH, canvas.width, Math.max(1.5, cellH));
        c2d.fillRect(cur * cellW, 0, Math.max(1.5, cellW), canvas.height);
        const cand = a.candidates[cur] ?? [];
        c2d.fillStyle = "rgba(220,190,255,0.85)";
        for (const cj of cand) {
          const px = cj * cellW;
          const py = cur * cellH;
          const r = Math.max(2.5, cellW * 0.6);
          c2d.beginPath();
          c2d.arc(px + cellW / 2, py + cellH / 2, r, 0, Math.PI * 2);
          c2d.fill();
        }
      }
    }

    if ((tMs | 0) % 8 === 0) setCurReadout(currentSegRef.current);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  // ── Prepare the Canvas2D fallback image whenever a new analysis lands ──────
  useEffect(() => {
    if (phase !== "ready") return;
    if (glRef.current) return; // WebGL path draws directly
    const a = analysisRef.current;
    if (!a) return;
    const off = document.createElement("canvas");
    off.width = a.n;
    off.height = a.n;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(a.n, a.n);
    for (let i = 0; i < a.n * a.n; i++) {
      const v = a.matrix[i] / 255;
      const [r, g, b] = violetRGB(Math.pow(v, 0.82));
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    offRef.current = off;
  }, [phase]);

  // ── Init WebGL2 (or fallback) + start the render loop on mount ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const be = initGl(canvas);
    if (be) {
      glRef.current = be;
    } else {
      c2dRef.current = canvas.getContext("2d");
      setGlFallback(true);
    }
    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // ── Keyboard: space = play/pause, J = leap ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "ready") return;
        if (playingRef.current) stopPlayback();
        else void startPlayback();
      } else if (e.key === "j" || e.key === "J") {
        leapToRhyme();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startPlayback, stopPlayback, leapToRhyme]);

  // ── Allocate the analyser read buffer once the safe master exists ──────────
  useEffect(() => {
    if (phase === "ready" && safeRef.current && !freqBufRef.current) {
      freqBufRef.current = new Uint8Array(safeRef.current.analyser.frequencyBinCount);
    }
  }, [phase]);

  // ── Full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const v of activeRef.current) {
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
      }
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
      const be = glRef.current;
      if (be) {
        be.gl.deleteTexture(be.tex);
        be.gl.deleteProgram(be.program);
      }
    };
  }, []);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
  const btnSecondary =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";
  const label = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  const busy = phase === "loading" || phase === "weaving";
  const weaveLabel =
    phase === "loading"
      ? "Loading…"
      : phase === "weaving"
        ? `Weaving… ${Math.round(progress * 100)}%`
        : phase === "ready"
          ? "Re-weave"
          : "Weave the loom";

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 pb-24">
      <PrototypeNav slugs={["14048-rhymeloom"]} />

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <p className={label}>14048 · rhyme loom</p>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Rhyme Loom — play your song by its own echoes
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Weave one of Karel&apos;s recordings into a self-similarity matrix, then
          improvise a never-ending path through it by leaping between the moments
          that <span className="text-foreground">rhyme</span> — every leap lands on
          a bar that harmonically matches, so his fixed take becomes an infinite,
          playable instrument.
        </p>
      </header>

      <div className="relative mb-4 aspect-square w-full max-w-[560px] mx-auto overflow-hidden rounded-md border border-border bg-black">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="h-full w-full cursor-crosshair"
        />
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Pick a track and weave the loom to see its recurrence matrix.
            </p>
          </div>
        )}
        {busy && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-sm text-primary">
              {phase === "loading" ? "loading audio…" : `weaving… ${Math.round(progress * 100)}%`}
            </p>
          </div>
        )}
        {glFallback && (
          <p className="pointer-events-none absolute left-3 top-3 font-mono text-xs text-destructive">
            WebGL2 unavailable — Canvas2D matrix
          </p>
        )}
        {phase === "ready" && meta && (
          <p className="pointer-events-none absolute bottom-2 right-3 font-mono text-xs text-muted-foreground">
            seg {curReadout + 1}/{meta.n} · {playing ? "PLAYING" : "PAUSED"}
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={startWeave} disabled={busy}>
          {weaveLabel}
        </button>
        {phase === "ready" && (
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => (playing ? stopPlayback() : void startPlayback())}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" className={btnSecondary} onClick={leapToRhyme}>
              Leap to a rhyme (J)
            </button>
            <button
              type="button"
              className={autoWander ? btnPrimary : btnSecondary}
              onClick={() => setAutoWander((w) => !w)}
              aria-pressed={autoWander}
            >
              Auto-wander {autoWander ? "on" : "off"}
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {phase === "ready" && (
        <div className="mb-6 max-w-md">
          <label htmlFor="coherence" className={label}>
            Coherence · {Math.round(coherence * 100)}%
          </label>
          <input
            id="coherence"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={coherence}
            onChange={(e) => setCoherence(parseFloat(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            High — leaps only to the closest-matching bar (smooth). Low — allows
            more distant rhymes (surprising).
          </p>
        </div>
      )}

      <div className="mb-6">
        <p className={label}>Recording</p>
        <div className="mt-2 space-y-3">
          {COLLECTIONS.map((col) => (
            <div key={col.name}>
              <p className="mb-1 text-sm text-muted-foreground">{col.name}</p>
              <div className="flex flex-wrap gap-2">
                {col.tracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={t.id === selectedId ? btnPrimary : btnSecondary}
                    disabled={busy}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p className={label}>How it works</p>
        <p>
          The recording is sliced into short {meta?.tempo ? "beat-length" : "fixed"}{" "}
          segments. Each segment is reduced to a 12-D chroma vector — pitch-class
          energy measured by a bank of Goertzel filters across several octaves — so
          bars in the same harmony point the same direction. The cosine similarity
          of every pair of segments is the woven matrix you see; its bright diagonal
          stripes are the passages Karel repeats. Playback advances bar by bar with
          equal-power crossfades, but a leap sends the playhead to one of a bar&apos;s
          precomputed <span className="text-foreground">rhymes</span> — a distant bar
          whose chroma matches — so the path can wander forever and still sound
          intentional. Click a cell, press <span className="font-mono">J</span>, or
          turn on auto-wander.
        </p>
        <p className="text-muted-foreground/70">
          Refs: Jonathan Foote, &ldquo;Visualizing Music and Audio using
          Self-Similarity&rdquo; (ACM Multimedia 1999); Paul Lamere, &ldquo;The
          Infinite Jukebox&rdquo; (2012).
        </p>
      </section>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Rhyme Loom turns a fixed recording into an instrument you steer.
                Jonathan Foote&apos;s self-similarity matrix (1999) revealed musical
                structure by comparing every moment of a piece to every other; Paul
                Lamere&apos;s Infinite Jukebox (2012) used the same idea to play a
                song forever by jumping between beats that sound alike. This proto
                joins the two: a chroma self-similarity matrix you can read as a map,
                and a rhyme-jump scheduler you play in real time.
              </p>
              <p>
                Everything you hear is a slice of Karel&apos;s own take — no synths,
                no generated tones. Chroma comes from a hand-rolled Goertzel bank;
                similarity is plain cosine distance; joins use tiny equal-power
                crossfades so leaps never click. The coherence slider trades
                smoothness for surprise by widening the pool of eligible rhymes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
