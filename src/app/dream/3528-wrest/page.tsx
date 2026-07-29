"use client";

// ════════════════════════════════════════════════════════════════════════════
// WREST (3528) — "What if you don't PLAY an instrument and don't merely WITNESS
// one — but continuously wrest a self-running generative voice back from itself
// and let it go?"
//
// A single autonomous continuous-pitch voice is ALWAYS sounding. On its own it
// drifts (seeded random-walk) through a soft harmonic gravity field — a slowly
// rotating D-Dorian chord that pulls it toward the nearest chord tone WITHOUT
// snapping (continuous pitch survives). The human applies a FORCE with their
// voice: a control-balance α ∈ [0,1] snaps toward you (~0.1 s attack) when you
// sing and decays back to the machine (~1.5 s) when you go quiet. The sounding
// fundamental is lerp(machine, you, α) — steer it, then let it free-run.
//
// Consequence, not score: a slow "home" bias absorbs the residue of every
// negotiation (time constant ~25 s). Neglect the voice and it wanders somewhere
// you did not choose; over-grip it and the surprise dies. No win, no lose.
//
// Substrate: a raw WebGL2 #version 300 es fragment shader — a flow field where
// the machine's current and the human's pull are two bands, the sounding voice
// rides between them, and α is made legible as how far the field bends toward
// you. Self-demo: with no mic, a seeded synthetic performer grabs and releases
// so a headless reviewer immediately sees + hears the tug-of-war.
//
// Reference: "Opening the Design Space: Two Years of Performance with
// Intelligent Musical Instruments" (arXiv:2604.23583) — ~0.1 s human↔AI control
// switching yields "a free-running system you guide but don't fully control,"
// and the "rescue" gesture. α is that fast handoff.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";

// ── Determinism: one seeded PRNG, no Math.random / Date.now anywhere ──────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Pitch helpers (continuous MIDI space) ─────────────────────────────────────
const PITCH_LO = 50; // D3
const PITCH_HI = 74; // D5
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNote(m: number): string {
  const r = Math.round(m);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

// D-Dorian rotating chord field (pitch classes; C=0, D=2 …). 8 soft chords.
const CHORDS: number[][] = [
  [2, 5, 9], // Dm
  [9, 0, 4], // Am
  [0, 4, 7], // C
  [7, 11, 2], // G
  [5, 9, 0], // F
  [4, 7, 11], // Em
  [2, 5, 9], // Dm
  [7, 11, 2], // G
];
const CHORD_DUR = 6.5; // seconds per chord

// Nearest chord tone to a continuous pitch, across octaves — a soft target, NOT
// a quantizer. Returns the continuous MIDI value of the closest chord tone.
function nearestChordTone(p: number, chord: number[]): number {
  let best = p;
  let bestD = Infinity;
  for (const pc of chord) {
    // candidate congruent to pc mod 12, nearest to p
    const base = Math.round((p - pc) / 12) * 12 + pc;
    for (const cand of [base - 12, base, base + 12]) {
      const d = Math.abs(cand - p);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
}

// ── Autocorrelation pitch detection (returns Hz or -1) ────────────────────────
function detectPitch(buf: Float32Array, sampleRate: number): { hz: number; rms: number } {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return { hz: -1, rms };

  // Trim to the loud central region.
  let start = 0;
  let end = n - 1;
  const thresh = 0.2;
  for (let i = 0; i < n / 2; i++) if (Math.abs(buf[i]) < thresh) start = i;
  for (let i = 1; i < n / 2; i++) if (Math.abs(buf[n - i]) < thresh) end = n - i;
  const b = buf.subarray(start, end);
  const m = b.length;

  const c = new Float32Array(m);
  for (let lag = 0; lag < m; lag++) {
    let sum = 0;
    for (let i = 0; i < m - lag; i++) sum += b[i] * b[i + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < m - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxLag = -1;
  for (let i = d; i < m; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxLag = i;
    }
  }
  if (maxLag <= 0) return { hz: -1, rms };
  // Parabolic interpolation around the peak.
  const x0 = maxLag > 0 ? c[maxLag - 1] : c[maxLag];
  const x2 = maxLag < m - 1 ? c[maxLag + 1] : c[maxLag];
  const a = (x0 + x2 - 2 * c[maxLag]) / 2;
  const bb = (x2 - x0) / 2;
  const shift = a !== 0 ? -bb / (2 * a) : 0;
  const hz = sampleRate / (maxLag + shift);
  if (hz < 60 || hz > 1200) return { hz: -1, rms };
  return { hz, rms };
}

// ── GL shaders ────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uAlpha;    // control balance 0..1
uniform float uMachineY; // machine intended pitch, normalized 0..1
uniform float uHumanY;   // human pull, normalized
uniform float uSoundY;   // actual sounding pitch, normalized
uniform float uHomeY;    // slow home-bias residue, normalized
uniform float uRms;
uniform float uChord;    // chord phase (radians)
uniform float uReduced;  // 1.0 = damp motion

vec3 dreamPalette(float t){
  vec3 deep    = vec3(0.043,0.027,0.075);
  vec3 indigo  = vec3(0.388,0.400,0.945);
  vec3 violet  = vec3(0.545,0.361,0.965);
  vec3 magenta = vec3(0.690,0.263,0.878);
  vec3 light   = vec3(0.769,0.710,0.992);
  t = clamp(t,0.0,1.0);
  if(t<0.33) return mix(deep,indigo,t/0.33);
  if(t<0.66) return mix(indigo,violet,(t-0.33)/0.33);
  return mix(violet, mix(magenta,light,(t-0.66)/0.34), 1.0);
}
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float t = uReduced>0.5 ? uTime*0.14 : uTime*0.5;

  // Warp the continuum toward the human pull, scaled by alpha — this is how the
  // field "bends" to whoever holds control right now.
  float pull = smoothstep(0.55,0.0,abs(uv.y-uHumanY));
  float bend = (uHumanY - uv.y) * uAlpha * 0.32 * pull;
  float y = uv.y + bend;

  // Two currents flowing as fbm-perturbed streamlines.
  vec2 fp = vec2(uv.x*2.4 - t*0.16, y*3.0);
  float flow = fbm(fp + vec2(fbm(fp*0.7 + t*0.05), 0.0));
  float streak = 0.5 + 0.5*sin(y*40.0 + flow*6.0 + t*1.4 + uv.x*3.0);

  float pt = 0.28 + 0.5*y + 0.12*sin(uChord) + 0.2*flow;
  vec3 col = dreamPalette(pt) * (0.10 + 0.5*streak*flow);

  // Machine current band — where the voice would go if left alone.
  float mBand = exp(-pow((uv.y-uMachineY)/0.06, 2.0));
  col += dreamPalette(0.42) * mBand * 0.45 * (0.6 + 0.4*sin(t*0.7 + uv.x*8.0));

  // Human pull band — brightens as you take control.
  float hBand = exp(-pow((uv.y-uHumanY)/0.05, 2.0));
  col += dreamPalette(0.82) * hBand * (0.18 + 0.9*uAlpha) * (0.55 + 0.5*uRms);

  // Home residue — a faint line marking the history of your negotiations.
  float homeLine = exp(-pow((uv.y-uHomeY)/0.014, 2.0));
  col += dreamPalette(0.6) * homeLine * 0.16;

  // Sounding ridge — the actual voice, brightest, riding between the currents.
  float sRidge = exp(-pow((uv.y-uSoundY)/0.011, 2.0));
  float shimmer = 0.7 + 0.3*sin(uv.x*20.0 - t*3.0 + flow*4.0);
  col += dreamPalette(0.92) * sRidge * (0.8 + 1.2*uRms) * shimmer;

  vec2 c = uv - 0.5; c.x *= aspect;
  col *= 1.0 - 0.55*dot(c,c);
  col *= 0.9 + 0.1*sin(t*0.2); // slow luminance drift, no strobe
  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

// ── HUD state ─────────────────────────────────────────────────────────────────
interface Hud {
  alpha: number;
  soundMidi: number;
  controller: "you" | "machine" | "shared";
  mode: "synthetic" | "mic";
}

export default function WrestPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Hud>({
    alpha: 0,
    soundMidi: 62,
    controller: "machine",
    mode: "synthetic",
  });

  // Everything mutable the loop touches lives in refs (no re-render churn).
  const rafRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{
    oscs: OscillatorNode[];
    mainA: OscillatorNode;
    mainB: OscillatorNode;
    mainFilter: BiquadFilterNode;
    padFilter: BiquadFilterNode;
    padRoot: OscillatorNode;
    padFifth: OscillatorNode;
    padSub: OscillatorNode;
  } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const glCtxRef = useRef<WebGL2RenderingContext | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    for (const fn of cleanupRef.current) fn();
    cleanupRef.current = [];
    const nodes = nodesRef.current;
    if (nodes) {
      for (const o of nodes.oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    nodesRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    const ac = audioRef.current;
    if (ac && ac.state !== "closed") void ac.close();
    audioRef.current = null;
    const gl = glCtxRef.current;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    glCtxRef.current = null;
    setStarted(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL2 ────────────────────────────────────────────────────────────────
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) {
      setGlError("WebGL2 is unavailable in this browser — the visual substrate needs it.");
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setGlError("Shader compilation failed on this device.");
      return;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setGlError("Shader program failed to link.");
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    glCtxRef.current = gl;
    const U = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      alpha: gl.getUniformLocation(prog, "uAlpha"),
      machineY: gl.getUniformLocation(prog, "uMachineY"),
      humanY: gl.getUniformLocation(prog, "uHumanY"),
      soundY: gl.getUniformLocation(prog, "uSoundY"),
      homeY: gl.getUniformLocation(prog, "uHomeY"),
      rms: gl.getUniformLocation(prog, "uRms"),
      chord: gl.getUniformLocation(prog, "uChord"),
      reduced: gl.getUniformLocation(prog, "uReduced"),
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    cleanupRef.current.push(() => window.removeEventListener("resize", resize));

    // ── Audio graph ────────────────────────────────────────────────────────────
    const AC: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    audioRef.current = ac;
    const now = ac.currentTime;

    // Master soft-clip (tanh) then a conservative output gain — peak ≈ 0.2.
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(3 * x) / Math.tanh(3);
    }
    shaper.curve = curve;
    const outGain = ac.createGain();
    outGain.gain.value = 0.2;
    shaper.connect(outGain);
    outGain.connect(ac.destination);

    // Tug-of-war voice: two detuned saws through a lowpass.
    const mainFilter = ac.createBiquadFilter();
    mainFilter.type = "lowpass";
    mainFilter.frequency.value = 1400;
    mainFilter.Q.value = 0.7;
    const mainGain = ac.createGain();
    mainGain.gain.value = 0.5;
    mainFilter.connect(mainGain);
    mainGain.connect(shaper);
    const mainA = ac.createOscillator();
    mainA.type = "sawtooth";
    mainA.detune.value = -7;
    const mainB = ac.createOscillator();
    mainB.type = "sawtooth";
    mainB.detune.value = 7;
    mainA.connect(mainFilter);
    mainB.connect(mainFilter);

    // Autonomous pad/drone bed following the rotating chord.
    const padFilter = ac.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    const padGain = ac.createGain();
    padGain.gain.value = 0.22;
    padFilter.connect(padGain);
    padGain.connect(shaper);
    const padRoot = ac.createOscillator();
    padRoot.type = "triangle";
    const padFifth = ac.createOscillator();
    padFifth.type = "triangle";
    padFifth.detune.value = 4;
    const padSub = ac.createOscillator();
    padSub.type = "sine";
    padRoot.connect(padFilter);
    padFifth.connect(padFilter);
    padSub.connect(padFilter);

    const oscs = [mainA, mainB, padRoot, padFifth, padSub];
    for (const o of oscs) o.start(now);
    nodesRef.current = { oscs, mainA, mainB, mainFilter, padFilter, padRoot, padFifth, padSub };

    // ── Microphone (best-effort; synthetic performer covers denial) ─────────────
    let micLive = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser); // NOT to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      setMicError(null);
    } catch {
      setMicError("Microphone unavailable — a seeded synthetic performer is negotiating instead.");
    }

    // ── Negotiation state ───────────────────────────────────────────────────────
    const rng = makeRng(0x3528);
    let machineP = 62; // D4
    let machineV = 0;
    let homeP = 62;
    let alpha = 0;
    const t0 = performance.now();
    let last = t0;

    // Seeded synthetic performer: alternating grab / release episodes.
    let synthGrabbing = false;
    let synthNext = 0.8;
    let synthTarget = 62;

    let lastHud = 0;
    const attack = 0.1; // s — fast handoff toward the human
    const release = 1.5; // s — decay back to the machine
    const HOME_TAU = 25; // s — slow residue of negotiation

    setStarted(true);

    const loop = () => {
      const nowMs = performance.now();
      const tSec = (nowMs - t0) / 1000;
      let dt = (nowMs - last) / 1000;
      last = nowMs;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 60;

      // Rotating chord + its pad targets.
      const chordF = tSec / CHORD_DUR;
      const chordIdx = Math.floor(chordF) % CHORDS.length;
      const chord = CHORDS[chordIdx];
      const rootPc = chord[0];
      const rootMidi = 50 + ((rootPc - 2 + 12) % 12); // near D3

      // ── Human force: real mic, else synthetic performer ─────────────────────
      let humanActive = false;
      let humanP = machineP;
      let humanRms = 0;
      const analyser = analyserRef.current;
      const tbuf = timeBufRef.current;
      if (analyser && tbuf) {
        analyser.getFloatTimeDomainData(tbuf as unknown as Float32Array<ArrayBuffer>);
        const { hz, rms } = detectPitch(tbuf, ac.sampleRate);
        if (hz > 0 && rms > 0.012) {
          micLive = true; // first real input hands over permanently
          humanActive = true;
          humanP = Math.max(PITCH_LO, Math.min(PITCH_HI, freqToMidi(hz)));
          humanRms = Math.min(1, rms * 6);
        }
      }
      if (!humanActive && !micLive) {
        if (tSec > synthNext) {
          synthGrabbing = !synthGrabbing;
          if (synthGrabbing) {
            // Grab a fresh target somewhere in range, then hold 2–4 s.
            const t = PITCH_LO + rng() * (PITCH_HI - PITCH_LO);
            synthTarget = nearestChordTone(t, chord);
            synthNext = tSec + 2 + rng() * 2;
          } else {
            synthNext = tSec + 1.5 + rng() * 1.5; // release, let it free-run
          }
        }
        if (synthGrabbing) {
          humanActive = true;
          const vib = Math.sin(tSec * 5.2) * 0.15;
          humanP = Math.max(PITCH_LO, Math.min(PITCH_HI, synthTarget + vib));
          humanRms = 0.55;
        }
      }

      // ── Control balance α: fast toward human, slow decay to machine ──────────
      const tau = humanActive ? attack : release;
      const goal = humanActive ? 1 : 0;
      alpha += (goal - alpha) * (1 - Math.exp(-dt / tau));

      // ── Machine free-run: gravity to nearest chord tone + home bias + drift ──
      const nearest = nearestChordTone(machineP, chord);
      const aGrav = 2.2 * (nearest - machineP); // soft pull, never a snap
      const aHome = 0.35 * (homeP - machineP);
      const noise = (rng() * 2 - 1) * 6.0;
      machineV += (aGrav + aHome) * dt + noise * Math.sqrt(dt);
      machineV *= Math.exp(-1.4 * dt); // momentum with damping
      machineP += machineV * dt;
      if (machineP < PITCH_LO) {
        machineP = PITCH_LO;
        machineV = Math.abs(machineV) * 0.5;
      }
      if (machineP > PITCH_HI) {
        machineP = PITCH_HI;
        machineV = -Math.abs(machineV) * 0.5;
      }

      // ── The sounding fundamental is the negotiation itself ───────────────────
      const soundP = machineP + (humanP - machineP) * alpha;

      // ── Consequence: home slowly absorbs the residue, weighted by control ────
      const homeRate = 1 - Math.exp(-dt / HOME_TAU);
      homeP += (soundP - homeP) * homeRate * (0.25 + 0.75 * alpha);

      // ── Drive audio ──────────────────────────────────────────────────────────
      const tSmooth = 0.03;
      mainA.frequency.setTargetAtTime(midiToFreq(soundP), ac.currentTime, tSmooth);
      mainB.frequency.setTargetAtTime(midiToFreq(soundP), ac.currentTime, tSmooth);
      mainFilter.frequency.setTargetAtTime(1200 + humanRms * 2400 + alpha * 900, ac.currentTime, 0.05);
      padRoot.frequency.setTargetAtTime(midiToFreq(rootMidi), ac.currentTime, 0.4);
      padFifth.frequency.setTargetAtTime(midiToFreq(rootMidi + 7), ac.currentTime, 0.4);
      padSub.frequency.setTargetAtTime(midiToFreq(rootMidi - 12), ac.currentTime, 0.4);

      // ── Drive shader ─────────────────────────────────────────────────────────
      const norm = (p: number) => (p - PITCH_LO) / (PITCH_HI - PITCH_LO);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, tSec);
      gl.uniform1f(U.alpha, alpha);
      gl.uniform1f(U.machineY, norm(machineP));
      gl.uniform1f(U.humanY, norm(humanP));
      gl.uniform1f(U.soundY, norm(soundP));
      gl.uniform1f(U.homeY, norm(homeP));
      gl.uniform1f(U.rms, humanRms);
      gl.uniform1f(U.chord, chordF * 2 * Math.PI);
      gl.uniform1f(U.reduced, reduced);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ── HUD (throttled) ──────────────────────────────────────────────────────
      if (nowMs - lastHud > 120) {
        lastHud = nowMs;
        setHud({
          alpha,
          soundMidi: soundP,
          controller: alpha > 0.6 ? "you" : alpha < 0.25 ? "machine" : "shared",
          mode: micLive ? "mic" : "synthetic",
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Idle / start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background/80 px-6 text-center backdrop-blur-sm">
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Wrest
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            A voice is always singing on its own. Sing or hum and you wrest it toward your pitch;
            fall quiet and it slips back to its own drift. Not playing, not witnessing — negotiating.
          </p>
          {glError ? (
            <p className="max-w-md text-base text-destructive">{glError}</p>
          ) : (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start mic
            </button>
          )}
          <p className="max-w-md text-sm text-muted-foreground">
            No microphone needed to see it work — a synthetic performer takes over if access is denied.
          </p>
        </div>
      )}

      {/* Live chrome */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-1 p-5">
            <h1 className="text-xl font-semibold tracking-tight">Wrest</h1>
            <p className="max-w-xs text-sm text-muted-foreground">
              Wrest the drifting voice toward your pitch — then let it go.
            </p>
          </div>

          {/* HUD: who has control + current pitch */}
          <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                control
              </span>
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-100"
                  style={{ width: `${Math.round(hud.alpha * 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs text-foreground">
                {hud.controller === "you" ? "you" : hud.controller === "machine" ? "machine" : "shared"}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
              <span>
                pitch <span className="text-foreground">{midiToNote(hud.soundMidi)}</span>{" "}
                {midiToFreq(hud.soundMidi).toFixed(1)} Hz
              </span>
              <span>· {hud.mode === "mic" ? "your voice" : "synthetic performer"}</span>
            </div>
            {micError && (
              <p className="max-w-xs text-sm text-destructive">{micError}</p>
            )}
          </div>

          <button
            onClick={stop}
            className="absolute bottom-5 right-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        </>
      )}

      {/* Design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Wrest — negotiated authorship</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single autonomous voice is always sounding. Left alone it random-walks through a
                slowly rotating D-Dorian chord that pulls it toward the nearest chord tone — a soft
                gravity, never a quantizer, so the pitch stays continuous.
              </p>
              <p>
                When you sing or hum, a control balance α snaps toward you in about a tenth of a
                second and decays back to the machine over ~1.5 s when you stop. The sounding
                fundamental is a blend of the machine&apos;s intent and yours, weighted by α — so you
                steer it, then let it free-run, and can rescue it whenever it wanders.
              </p>
              <p>
                Consequence without a score: a slow &quot;home&quot; bias (≈25 s) absorbs the residue
                of every negotiation. Neglect the voice and it drifts somewhere you didn&apos;t
                choose; over-grip it and the surprise dies. The piece at minute five is the record of
                how you two got along.
              </p>
              <p>
                After &quot;Opening the Design Space: Two Years of Performance with Intelligent
                Musical Instruments&quot; (arXiv:2604.23583) — ~0.1 s human↔AI control switching makes
                &quot;a free-running system you guide but don&apos;t fully control.&quot;
              </p>
            </div>
            <button
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
