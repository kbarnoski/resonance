"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  loadRealTrackBuffer,
  WELCOME_HOME_TRACKS,
} from "../_shared/welcomeHome";
import {
  chordIsMinor,
  chordRoot,
  loadTrackAnalysis,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ─────────────────────────────────────────────────────────────────────────────
// 16848-tunevoice — sing a pitch that belongs to Karel's sounding chord and his
// recording audibly OPENS to meet you. The reward is HEARD, not watched: high
// sung-consonance sweeps a veil off the top of his piano and blooms a resonance
// on the chord's root. The visual is a single minimal WebGL2 tuning halo.
//
// The microphone is analysis-only. Its samples feed a dedicated AnalyserNode and
// are NEVER routed onward to any output — no howl, no synth, nothing generated.
// The only audible source is Karel's decoded AudioBuffer, and every audible node
// terminates in createSafeMaster(ctx).input.
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
];

// Sensory-consonance ordering of the 12 intervals above a root (Helmholtz:
// simpler frequency ratios sound smoother). Used to score sung notes that fall
// OUTSIDE the sounding chord so a near-consonant miss still reads as "warm-ish".
const INTERVAL_CONSONANCE = [
  1.0,  // unison
  0.15, // m2
  0.4,  // M2
  0.7,  // m3
  0.75, // M3
  0.8,  // P4
  0.2,  // tritone
  0.95, // P5
  0.6,  // m6
  0.65, // M6
  0.4,  // m7
  0.25, // M7
];

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

// ─── YIN-style monophonic pitch detection ────────────────────────────────────
// difference function → cumulative-mean-normalized difference → absolute
// threshold → parabolic interpolation, gated on RMS + clarity so silence and
// broadband noise never register a pitch.

interface PitchResult {
  hz: number;
  clarity: number; // 1 = perfectly periodic, 0 = noise
}

function detectPitchYin(
  buf: Float32Array,
  sampleRate: number,
): PitchResult | null {
  const size = buf.length;
  const half = Math.floor(size / 2);

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null; // gate on loudness

  const THRESHOLD = 0.12;
  const diff = new Float32Array(half);
  for (let tau = 1; tau < half; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = buf[i] - buf[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // cumulative mean normalized difference
  const cmnd = new Float32Array(half);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < half; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }

  // absolute threshold: first dip below THRESHOLD, walking down to its local min
  let tau = -1;
  for (let t = 2; t < half - 1; t++) {
    if (cmnd[t] < THRESHOLD) {
      while (t + 1 < half - 1 && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null; // nothing periodic enough

  // parabolic interpolation around the chosen lag
  const x0 = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
  const x2 = tau + 1 < half ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - x2 - x0);
  const shift = denom !== 0 ? (x2 - x0) / denom : 0;
  const period = tau + shift;
  if (period <= 0) return null;

  const hz = sampleRate / period;
  if (hz < 70 || hz > 1200) return null; // plausible sung range

  const clarity = 1 - cmnd[tau];
  if (clarity < 0.55) return null; // gate on periodicity
  return { hz, clarity };
}

// ─── time-matched chord tracker ──────────────────────────────────────────────

function binarySearchChord(
  chords: TrackChord[],
  t: number,
): TrackChord | null {
  if (chords.length === 0) return null;
  let lo = 0;
  let hi = chords.length - 1;
  let ans: TrackChord | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].time <= t) {
      ans = chords[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

interface ChordTones {
  root: number;
  // pitch-class → weight (root/5th highest, third high, tensions medium)
  tones: Map<number, number>;
}

// Small triad / 7th / 9th interval parser layered on the shared chordRoot +
// chordIsMinor helpers. Returns the weighted pitch-class set of a chord symbol.
function parseChordTones(symbol: string): ChordTones | null {
  const root = chordRoot(symbol);
  if (root === null) return null;
  const body = symbol.split("/")[0].replace(/^[A-Ga-g][#b]?/, "");

  const tones = new Map<number, number>();
  const add = (interval: number, w: number) => {
    const pc = (root + interval + 12) % 12;
    tones.set(pc, Math.max(tones.get(pc) ?? 0, w));
  };

  const dim = /dim|°/.test(body);
  const aug = /aug|\+/.test(body);
  const sus2 = /sus2/.test(body);
  const sus4 = /sus4|sus(?!2)/.test(body);
  const isMin = chordIsMinor(symbol);

  add(0, 1.0); // root

  // third (or suspension)
  if (sus2) add(2, 0.6);
  else if (sus4) add(5, 0.6);
  else add(isMin ? 3 : 4, 0.7);

  // fifth
  add(dim ? 6 : aug ? 8 : 7, 0.9);

  // sixth
  if (/6/.test(body)) add(9, 0.5);

  // seventh
  if (/7|9|11|13/.test(body)) {
    const maj7 = /maj7|maj9|maj11|maj13|M7|Δ/.test(body);
    if (dim && /dim7|°7/.test(body)) add(9, 0.4); // dim7 → bb7 (9 semitones)
    else add(maj7 ? 11 : 10, 0.45);
  }

  // upper tensions
  if (/9|11|13/.test(body)) add(2, 0.35);
  if (/11|13/.test(body)) add(5, 0.35);
  if (/13/.test(body)) add(9, 0.35);

  return { root, tones };
}

// consonance of a sung pitch-class against the sounding chord: chord tones are
// authoritative (root/5th highest, tensions medium); an out-of-chord note scores
// by its sensory-consonance interval to the root, scaled down.
function computeConsonance(sungPc: number, chord: ChordTones): number {
  const tone = chord.tones.get(sungPc);
  if (tone !== undefined) return tone;
  const interval = ((sungPc - chord.root) % 12 + 12) % 12;
  return INTERVAL_CONSONANCE[interval] * 0.5;
}

// how close (0..1) the sung fractional pitch sits to its nearest chord tone,
// for the halo's tuning ring. 1 = dead on a chord tone.
function computeRingCloseness(sungMidi: number, chord: ChordTones): number {
  const frac = ((sungMidi % 12) + 12) % 12;
  let best = 12;
  for (const pc of chord.tones.keys()) {
    const d = Math.abs(frac - pc);
    const circular = Math.min(d, 12 - d);
    if (circular < best) best = circular;
  }
  return 1 - Math.min(best, 1);
}

// spectral-peak fallback: dominant pitch-class of the recording's own spectrum,
// used when the track has no chord analysis.
function detectSpectralPc(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number,
): ChordTones | null {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(60 / binHz));
  const hi = Math.min(freq.length - 1, Math.floor(1000 / binHz));
  let peakBin = -1;
  let peakVal = 24; // ignore near-silence
  for (let b = lo; b <= hi; b++) {
    if (freq[b] > peakVal) {
      peakVal = freq[b];
      peakBin = b;
    }
  }
  if (peakBin < 0) return null;
  const hz = peakBin * binHz;
  const pc = ((Math.round(hzToMidi(hz)) % 12) + 12) % 12;
  const tones = new Map<number, number>([[pc, 1.0]]);
  return { root: pc, tones };
}

// ─── WebGL2 tuning halo ──────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_consonance; // 0 searching .. 1 locked
uniform float u_ring;       // 0 far .. 1 on a chord tone
uniform float u_active;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float r = length(uv);

  // cool teal (searching) → warm amber-gold (consonant)
  vec3 cool = vec3(0.10, 0.52, 0.58);
  vec3 warm = vec3(0.98, 0.70, 0.24);
  vec3 tint = mix(cool, warm, u_consonance);

  // slow luminance drift (well under 3 Hz — no strobe)
  float drift = 0.88 + 0.12 * sin(u_time * 0.35);

  // soft central bloom, tighter + brighter as consonance rises
  float spread = mix(0.85, 0.42, u_consonance);
  float bloom = exp(-r * r / (spread * spread));
  bloom *= mix(0.35, 1.15, u_consonance);

  // tuning ring: radius contracts toward centre as the sung pitch nears a
  // chord tone; a gentle band, brightest when locked.
  float ringR = mix(0.46, 0.14, u_ring);
  float band = exp(-pow((r - ringR) / 0.03, 2.0));
  band *= 0.25 + 0.55 * u_ring;

  vec3 col = tint * (bloom + band) * drift * u_active;
  // faint outer wash so the field is never pure black
  col += cool * 0.04 * (1.0 - u_consonance) * u_active;

  outColor = vec4(col, 1.0);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

interface GLState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  u: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    consonance: WebGLUniformLocation | null;
    ring: WebGLUniformLocation | null;
    active: WebGLUniformLocation | null;
  };
}

function makeGL(canvas: HTMLCanvasElement): GLState | null {
  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) return null;
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const buffer = gl.createBuffer();
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  return {
    gl,
    program,
    buffer,
    u: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      consonance: gl.getUniformLocation(program, "u_consonance"),
      ring: gl.getUniformLocation(program, "u_ring"),
      active: gl.getUniformLocation(program, "u_active"),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// engine (mutable refs, torn down fully on unmount)
// ─────────────────────────────────────────────────────────────────────────────

interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode;
  lowpass: BiquadFilterNode;
  peak: BiquadFilterNode;
  recAnalyser: AnalyserNode;
  startedAt: number;
  duration: number;
  // mic (analysis-only) — may be absent in demo mode
  micStream: MediaStream | null;
  micSource: MediaStreamAudioSourceNode | null;
  micAnalyser: AnalyserNode | null;
  micBuf: Float32Array<ArrayBuffer> | null;
  recBuf: Uint8Array<ArrayBuffer>;
  chords: TrackChord[];
  useSpectral: boolean;
  smoothed: number; // one-pole consonance
  readout: Readout;
}

interface Readout {
  chordLabel: string;
  sungLabel: string;
  consonance: number;
  ring: number;
  openHz: number;
}

type Phase = "idle" | "loading" | "running" | "error";

export default function TuneVoicePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const glRef = useRef<GLState | null>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [micMode, setMicMode] = useState<"live" | "demo">("live");
  const [analysisMode, setAnalysisMode] = useState<"chords" | "spectral">(
    "chords",
  );
  const [webglOk, setWebglOk] = useState<boolean>(true);
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [readout, setReadout] = useState<Readout>({
    chordLabel: "—",
    sungLabel: "—",
    consonance: 0,
    ring: 0,
    openHz: 480,
  });

  // ── teardown ───────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    const eng = engineRef.current;
    if (eng) {
      try {
        eng.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        eng.source.disconnect();
        eng.lowpass.disconnect();
        eng.peak.disconnect();
        eng.recAnalyser.disconnect();
      } catch {
        /* closing */
      }
      try {
        eng.master.disconnect();
      } catch {
        /* closing */
      }
      if (eng.micSource) {
        try {
          eng.micSource.disconnect();
        } catch {
          /* closing */
        }
      }
      if (eng.micAnalyser) {
        try {
          eng.micAnalyser.disconnect();
        } catch {
          /* closing */
        }
      }
      if (eng.micStream) {
        eng.micStream.getTracks().forEach((t) => t.stop());
      }
      try {
        void eng.ctx.close();
      } catch {
        /* already closed */
      }
    }
    engineRef.current = null;

    const gls = glRef.current;
    if (gls) {
      try {
        gls.gl.deleteProgram(gls.program);
        gls.gl.deleteBuffer(gls.buffer);
        gls.gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* gone */
      }
    }
    glRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── mirror engine readouts into React state at a calm cadence ───────────────
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const eng = engineRef.current;
      if (eng) setReadout({ ...eng.readout });
    }, 160);
    return () => window.clearInterval(id);
  }, [phase]);

  // ── per-frame loop ──────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const eng = engineRef.current;
    const gls = glRef.current;
    if (!eng) return;

    const now = eng.ctx.currentTime;
    const elapsed = eng.duration > 0 ? (now - eng.startedAt) % eng.duration : 0;

    // 1. what is sounding NOW in the recording
    let chord: ChordTones | null = null;
    let chordLabel = "—";
    if (!eng.useSpectral) {
      const c = binarySearchChord(eng.chords, elapsed);
      if (c) {
        chord = parseChordTones(c.chord);
        chordLabel = c.chord;
      }
    }
    if (!chord) {
      eng.recAnalyser.getByteFrequencyData(eng.recBuf);
      chord = detectSpectralPc(
        eng.recBuf,
        eng.ctx.sampleRate,
        eng.recAnalyser.fftSize,
      );
      if (chord) chordLabel = `${NOTE_NAMES[chord.root]} (spectral)`;
    }

    // 2. what is being sung (mic) or simulated (demo)
    let sungMidi: number | null = null;
    let sungLabel = "—";
    if (eng.micAnalyser && eng.micBuf) {
      eng.micAnalyser.getFloatTimeDomainData(eng.micBuf);
      const p = detectPitchYin(eng.micBuf, eng.ctx.sampleRate);
      if (p) {
        sungMidi = hzToMidi(p.hz);
      }
    } else {
      // demo: sweep a simulated sung pitch slowly across the pitch-classes
      const pc = (elapsed * 0.28) % 12; // full circle ≈ 43 s
      sungMidi = 57 + pc; // around A3
    }
    if (sungMidi !== null) {
      const pc = ((Math.round(sungMidi) % 12) + 12) % 12;
      sungLabel = NOTE_NAMES[pc];
    }

    // 3. consonance of the sung pitch vs the sounding chord
    let raw = 0;
    let ring = 0;
    if (chord && sungMidi !== null) {
      const pc = ((Math.round(sungMidi) % 12) + 12) % 12;
      raw = computeConsonance(pc, chord);
      ring = computeRingCloseness(sungMidi, chord);
    }
    // one-pole smoothing (~0.15) so the opening breathes rather than jumps
    eng.smoothed += 0.15 * (raw - eng.smoothed);
    const s = eng.smoothed;

    // 4. consonance drives the two filters (setTargetAtTime — no zipper noise)
    const openHz = 480 + s * (6200 - 480);
    eng.lowpass.frequency.setTargetAtTime(openHz, now, 0.08);
    eng.peak.gain.setTargetAtTime(s * 12, now, 0.08);
    if (chord) {
      const rootHz = 261.63 * Math.pow(2, chord.root / 12); // C4-based bloom
      eng.peak.frequency.setTargetAtTime(rootHz, now, 0.12);
    }

    eng.readout = {
      chordLabel,
      sungLabel,
      consonance: s,
      ring,
      openHz,
    };

    // 5. minimal WebGL2 halo
    if (gls) {
      const { gl, u } = gls;
      const time = (performance.now() - t0Ref.current) / 1000;
      gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.consonance, s);
      gl.uniform1f(u.ring, ring);
      gl.uniform1f(u.active, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── resize the GL canvas to the device pixel grid ───────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const gls = glRef.current;
    if (!canvas || !gls) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gls.gl.viewport(0, 0, w, h);
    }
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, resizeCanvas]);

  // ── start ────────────────────────────────────────────────────────────────
  const runStart = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();

      // Karel's real recording is the only audible source.
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      const master = createSafeMaster(ctx);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 480; // veiled to start
      lowpass.Q.value = 0.9;

      const peak = ctx.createBiquadFilter();
      peak.type = "peaking";
      peak.frequency.value = 261.63;
      peak.Q.value = 3.5;
      peak.gain.value = 0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // audible chain: source → lowpass → peaking → safe master
      source.connect(lowpass);
      lowpass.connect(peak);
      peak.connect(master.input);

      // passive analysis tap for the spectral-peak fallback (a sink; never
      // routed onward).
      const recAnalyser = ctx.createAnalyser();
      recAnalyser.fftSize = 2048;
      recAnalyser.smoothingTimeConstant = 0.7;
      peak.connect(recAnalyser);
      const recBuf = new Uint8Array(recAnalyser.frequencyBinCount);

      // chord analysis (may be null)
      const analysis = await loadTrackAnalysis(trackId);
      const chords = analysis?.chords ?? [];
      const useSpectral = chords.length === 0;
      setAnalysisMode(useSpectral ? "spectral" : "chords");

      // microphone — analysis-only. Its source feeds a dedicated analyser and
      // is NEVER connected to the master or destination.
      let micStream: MediaStream | null = null;
      let micSource: MediaStreamAudioSourceNode | null = null;
      let micAnalyser: AnalyserNode | null = null;
      let micBuf: Float32Array<ArrayBuffer> | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSource = ctx.createMediaStreamSource(micStream);
        micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 2048;
        micSource.connect(micAnalyser); // dead-ends at the analyser
        micBuf = new Float32Array(micAnalyser.fftSize);
        setMicMode("live");
      } catch {
        micStream = null;
        micSource = null;
        micAnalyser = null;
        micBuf = null;
        setMicMode("demo");
      }

      // WebGL2 halo
      const canvas = canvasRef.current;
      if (canvas) {
        const gls = makeGL(canvas);
        if (!gls) {
          setWebglOk(false);
        } else {
          glRef.current = gls;
          setWebglOk(true);
        }
      }

      source.start();
      const startedAt = ctx.currentTime;

      engineRef.current = {
        ctx,
        master,
        source,
        lowpass,
        peak,
        recAnalyser,
        startedAt,
        duration: buffer.duration,
        micStream,
        micSource,
        micAnalyser,
        micBuf,
        recBuf,
        chords,
        useSpectral,
        smoothed: 0,
        readout: {
          chordLabel: "—",
          sungLabel: "—",
          consonance: 0,
          ring: 0,
          openHz: 480,
        },
      };

      t0Ref.current = performance.now();
      setPhase("running");
      resizeCanvas();
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not start audio.");
      setPhase("error");
      teardown();
    }
  }, [trackId, runFrame, resizeCanvas, teardown]);

  const runStop = useCallback(() => {
    teardown();
    setPhase("idle");
  }, [teardown]);

  const pct = Math.round(readout.consonance * 100);
  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* WebGL2 halo — the whole minimal visual */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-6 pt-20 pb-28">
        <header className="mb-8">
          <p className={labelCls}>Resonance · dream lab · 16848</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Tune Voice
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Sing a pitch that belongs to the chord sounding right now in Karel&apos;s
            recording and it audibly opens to meet you — a veil lifts off the top
            of the piano and a resonance blooms on the chord&apos;s root. The
            reward is heard, not watched.
          </p>
        </header>

        {phase === "idle" && (
          <section className="rounded-lg border border-border bg-background/70 p-6 backdrop-blur-sm">
            <p className={labelCls}>Choose a recording</p>
            <div className="mt-4 space-y-5">
              {COLLECTIONS.map((col) => (
                <div key={col.name}>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {col.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {col.tracks.map((t) => {
                      const active = t.id === trackId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTrackId(t.id)}
                          className={`min-h-[44px] rounded-md px-4 text-sm font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-background/60 text-foreground hover:bg-accent"
                          }`}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={runStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin listening
              </button>
              <span className="text-sm text-muted-foreground">
                Allow the microphone to sing along, or continue without it for a
                self-playing demonstration.
              </span>
            </div>
          </section>
        )}

        {phase === "loading" && (
          <p className="text-base text-muted-foreground">
            Loading the recording and its harmony…
          </p>
        )}

        {phase === "error" && (
          <section className="rounded-lg border border-border bg-background/70 p-6 backdrop-blur-sm">
            <p className="text-base text-destructive">
              Could not begin: {errorMsg}
            </p>
            <button
              onClick={() => setPhase("idle")}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-6 text-sm font-medium hover:bg-accent"
            >
              Back
            </button>
          </section>
        )}

        {phase === "running" && (
          <section className="mt-auto">
            {!webglOk && (
              <p className="mb-4 text-base text-destructive">
                This browser has no WebGL2, so the tuning halo is unavailable —
                the audio still opens and closes as you sing.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
                <p className={labelCls}>Sounding chord</p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {readout.chordLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
                <p className={labelCls}>
                  {micMode === "live" ? "You are singing" : "Demo pitch"}
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {readout.sungLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
                <p className={labelCls}>Openness</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-primary">
                  {pct}%
                </p>
              </div>
            </div>

            {/* openness meter */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full border border-border bg-background/60">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Filter opening ≈ {Math.round(readout.openHz)} Hz ·{" "}
              {trackTitle || "recording"} ·{" "}
              {micMode === "demo"
                ? "microphone unavailable — self-playing demo"
                : "singing live"}
              {analysisMode === "spectral"
                ? " · no chord map: tracking the recording's own spectral peak"
                : ""}
            </p>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={runStop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-6 text-sm font-medium hover:bg-accent"
              >
                Stop
              </button>
            </div>
          </section>
        )}
      </div>

      {/* design notes control */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-3 right-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm font-medium text-muted-foreground backdrop-blur-sm hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={labelCls}>Design notes</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Consonance opens the recording
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Karel&apos;s recording plays through a lowpass &quot;opening&quot;
                filter and a peaking filter tuned to the chord&apos;s root. Your
                voice is analysed only — it is never played back, synthesised, or
                routed to the speakers.
              </p>
              <p>
                Each frame, a YIN-style autocorrelation reads your sung pitch and
                scores its consonance against the chord sounding at that instant
                in the recording. Chord tones score high (the root and fifth
                highest); tensions sit in the middle; out-of-chord notes score by
                their sensory-consonance interval to the root. A smoothed score
                sweeps the lowpass from a veiled 480 Hz up to an open 6.2 kHz and
                blooms the resonance on the root.
              </p>
              <p>
                This follows Pauline Oliveros&apos; Deep Listening — attunement as
                a practice you enter, never a substance — with a consonance model
                indebted to Helmholtz&apos; account of sensory consonance and
                roughness, and to the real-time consonance-distance line in
                &quot;From Discord to Harmony&quot; (arXiv 2509.01588, 2025).
              </p>
              <p>
                The honest first: pitch detection itself has lab priors. What is
                new here is that sung consonance against his sounding chord
                audibly opens the recording.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
