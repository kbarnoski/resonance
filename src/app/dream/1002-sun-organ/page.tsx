"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 1002 · SUN ORGAN
// Resonance plays the Sun. On Start, we fetch LIVE space-weather data from NOAA's
// Space Weather Prediction Center (CORS-open, no key) and turn the numbers into
// an endless, non-looping ambient drone + aurora curtain. The piece keeps a
// slowly-evolving internal harmonic state (a wandering tonal centre + a slow
// breath LFO) that the data only *nudges* — so minute 5 genuinely differs from
// minute 1. If the feed is unreachable, a built-in synthetic solar-wind
// generator keeps it playing with zero network.
//
// INPUT: live NOAA SWPC data + synthetic fallback (no kbd / mic / cam / pointer).
// OUTPUT: raw WebGL2 aurora curtain → Canvas2D fallback.
// TECHNIQUE: real-world data sonification → long-form generative drone w/ memory.
// VIBE: aurora, space-weather, luminous and calm — grounded in real data.
// ─────────────────────────────────────────────────────────────────────────────

// ── The Sun's current state, normalised for music + visuals ──────────────────
interface SpaceWeather {
  speed: number; // solar wind speed, km/s  (~300–800)
  density: number; // protons / cm³        (~0.5–20)
  bz: number; // magnetic field Bz GSM, nT  (−15 .. +15; negative = "active")
  kp: number; // planetary K-index          (0–9)
  live: boolean; // true = from NOAA, false = synthetic fallback
}

const DEFAULT_WEATHER: SpaceWeather = {
  speed: 420,
  density: 4,
  bz: 0,
  kp: 2,
  live: false,
};

const NOAA = {
  plasma: "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json",
  mag: "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json",
  kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
};

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Parse a SWPC "products" array-of-arrays defensively. Row 0 is a header of
//    column names; we find the column index by name and read the last data row.
function readLastByHeader(
  rows: unknown,
  column: string,
): number | null {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const header = rows[0];
  if (!Array.isArray(header)) return null;
  const ci = header.findIndex(
    (h) => typeof h === "string" && h.toLowerCase() === column.toLowerCase(),
  );
  if (ci < 0) return null;
  // Walk from the end for the most recent non-empty numeric value.
  for (let r = rows.length - 1; r >= 1; r--) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const v = Number(row[ci]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// The Kp feed is array-of-OBJECTS ({ time_tag, Kp, ... }). Read the last Kp.
function readLastKp(rows: unknown): number | null {
  if (!Array.isArray(rows) || rows.length < 1) return null;
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r];
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const rec = row as Record<string, unknown>;
      const v = Number(rec.Kp ?? rec.kp);
      if (Number.isFinite(v)) return v;
    } else if (Array.isArray(row)) {
      // Fallback in case SWPC ever serves it as arrays-of-arrays.
      const v = Number(row[1]);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

async function fetchWeather(
  signal: AbortSignal,
): Promise<SpaceWeather | null> {
  try {
    const [plasmaRes, magRes, kpRes] = await Promise.all([
      fetch(NOAA.plasma, { signal }),
      fetch(NOAA.mag, { signal }),
      fetch(NOAA.kp, { signal }),
    ]);
    if (!plasmaRes.ok || !magRes.ok || !kpRes.ok) return null;
    const [plasma, mag, kp] = await Promise.all([
      plasmaRes.json(),
      magRes.json(),
      kpRes.json(),
    ]);
    const speed = readLastByHeader(plasma, "speed");
    const density = readLastByHeader(plasma, "density");
    const bz = readLastByHeader(mag, "bz_gsm");
    const kpv = readLastKp(kp);
    if (speed == null || bz == null || kpv == null) return null;
    return {
      speed: clamp(speed, 200, 1000),
      density: clamp(density ?? 4, 0, 60),
      bz: clamp(bz, -40, 40),
      kp: clamp(kpv, 0, 9),
      live: true,
    };
  } catch {
    return null;
  }
}

// ── Synthetic solar-wind generator (offline / CORS fallback) ─────────────────
// Summed slow sines + a bounded random walk → plausible, ever-changing values.
function makeSynth() {
  let walkSpeed = 430;
  let walkBz = 0;
  let walkKp = 2;
  const t0 = performance.now();
  return (): SpaceWeather => {
    const t = (performance.now() - t0) / 1000;
    walkSpeed += (Math.random() - 0.5) * 6;
    walkSpeed = clamp(walkSpeed, 300, 760);
    walkBz += (Math.random() - 0.5) * 0.6;
    walkBz = clamp(walkBz, -12, 12);
    walkKp += (Math.random() - 0.5) * 0.12;
    walkKp = clamp(walkKp, 0, 7);
    const speed =
      walkSpeed + 70 * Math.sin(t * 0.012) + 30 * Math.sin(t * 0.047 + 1);
    const bz = walkBz + 5 * Math.sin(t * 0.018 + 2) + 2 * Math.sin(t * 0.09);
    const density = 6 + 4 * Math.sin(t * 0.02 + 0.5) + 2 * Math.sin(t * 0.11);
    const kp = clamp(walkKp + 1.5 * Math.sin(t * 0.01) + (bz < -6 ? 1.5 : 0), 0, 9);
    return {
      speed: clamp(speed, 250, 850),
      density: clamp(density, 0.5, 30),
      bz: clamp(bz, -15, 15),
      kp,
      live: false,
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE — long-form generative drone with internal evolving state.
// The Sun's data is smoothed and mapped onto a small set of always-on sine/saw
// voices. A wandering tonal centre + slow "breath" LFO mean the piece keeps
// moving even when the data is steady; it never loops.
// ─────────────────────────────────────────────────────────────────────────────

// A safe, consonant pitch-class set (an open Dorian-ish field): root, 2, 4, 5,
// b7, octave + a tension 9th. Chosen so any combination sounds calm, no wrong
// notes. Index 0 is the drone root.
const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 16 / 9, 2, 9 / 4];

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode | null; // a slightly-detuned partner for beating
  gain: GainNode;
  detuneGain: GainNode | null;
  ratioIndex: number;
}

class SunOrgan {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  voices: Voice[] = [];
  // Internal evolving state (the "memory"):
  baseHz = 110; // wandering tonal centre (A2-ish), drifts very slowly
  baseTarget = 110;
  breath = 0; // slow LFO phase
  shimmerGain: GainNode;
  shimmerOsc: OscillatorNode;
  started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.master);
    this.master.connect(this.ctx.destination);

    // A soft reverb-ish smear via a short feedback delay (no impulse asset).
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.33;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.45;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.5;
    this.master.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.ctx.destination);

    // Up to 6 sustained voices (density controls how many are audible).
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "sine" : i < 3 ? "sine" : "triangle";
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(t);

      // Voices 2+ get a detuned partner for shimmering beats.
      let detune: OscillatorNode | null = null;
      let detuneGain: GainNode | null = null;
      if (i >= 1) {
        detune = this.ctx.createOscillator();
        detune.type = "sine";
        detuneGain = this.ctx.createGain();
        detuneGain.gain.value = 0;
        detune.connect(detuneGain);
        detuneGain.connect(this.filter);
        detune.start(t);
      }
      this.voices.push({ osc, detune, gain, detuneGain, ratioIndex: i });
    }

    // A high shimmer voice that lifts with Kp.
    this.shimmerOsc = this.ctx.createOscillator();
    this.shimmerOsc.type = "sine";
    this.shimmerGain = this.ctx.createGain();
    this.shimmerGain.gain.value = 0;
    this.shimmerOsc.connect(this.shimmerGain);
    this.shimmerGain.connect(this.filter);
    this.shimmerOsc.start(t);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      // Gentle fade-in so it's never a click.
      this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 2.5);
    }
  }

  // Called ~10×/s with the smoothed Sun state + dt seconds.
  apply(w: SpaceWeather, dt: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Speed → agitation/brightness. Map 300–800 → 0..1.
    const agitation = clamp((w.speed - 300) / 500, 0, 1);
    // Bz: southward (negative) = tension. Map −15..+5 → 1..0 (active..calm).
    const tension = clamp((-w.bz + 2) / 12, 0, 1);
    // Density → number of audible voices (2..6).
    const voiceCount = Math.round(lerp(2, 6, clamp(w.density / 14, 0, 1)));
    // Kp → register lift + shimmer.
    const kpN = clamp(w.kp / 9, 0, 1);

    // ── Internal memory: the tonal centre wanders very slowly. Speed nudges
    //    where it wants to go; the breath LFO keeps it moving regardless. ────
    this.breath += dt * (0.03 + agitation * 0.05);
    const breathV = Math.sin(this.breath);
    // Re-target the base pitch occasionally toward a data-biased value.
    // Higher speed → a touch higher centre; tension pulls it down (darker).
    const wanderTarget =
      98 * Math.pow(2, (agitation * 3 - tension * 4 + breathV * 1.5) / 12);
    // Slow approach — this is the long-form drift (state has memory of itself).
    this.baseTarget = lerp(this.baseTarget, wanderTarget, 0.0008 + agitation * 0.0012);
    this.baseHz = lerp(this.baseHz, this.baseTarget, clamp(dt * 0.15, 0, 1));

    // Filter brightness rides agitation + breath; tension closes it down.
    const cutoff =
      lerp(420, 2200, agitation) * (1 - tension * 0.45) +
      breathV * 120 * (0.5 + agitation);
    this.filter.frequency.setTargetAtTime(clamp(cutoff, 200, 4500), t, 0.4);
    // Tension raises resonance for an edgier, beating feel.
    this.filter.Q.setTargetAtTime(0.5 + tension * 3, t, 0.4);

    // ── Voices ──────────────────────────────────────────────────────────────
    this.voices.forEach((v, i) => {
      const ratio = RATIOS[v.ratioIndex % RATIOS.length];
      const freq = this.baseHz * ratio;
      v.osc.frequency.setTargetAtTime(freq, t, 0.3);

      const active = i < voiceCount;
      // Per-voice level: lower voices louder, breath gives a slow swell, each
      // voice breathes on a slightly offset phase for liveliness.
      const phase = Math.sin(this.breath * (0.8 + i * 0.13) + i);
      const baseLvl = active ? lerp(0.22, 0.08, i / 5) : 0;
      const lvl = baseLvl * (0.7 + 0.3 * (0.5 + 0.5 * phase));
      v.gain.gain.setTargetAtTime(lvl, t, 0.8);

      // Detune partner: tension widens the beat (more "active"/anxious).
      if (v.detune && v.detuneGain) {
        const cents = lerp(2, 22, tension) * (1 + 0.3 * Math.sin(this.breath + i));
        v.detune.frequency.setTargetAtTime(
          freq * Math.pow(2, cents / 1200),
          t,
          0.3,
        );
        v.detuneGain.gain.setTargetAtTime(active ? lvl * 0.7 : 0, t, 0.8);
      }
    });

    // ── Kp shimmer: high register sine that rises and brightens with Kp ──────
    const shimFreq = this.baseHz * 4 * RATIOS[2]; // a high major-3rd-ish sparkle
    this.shimmerOsc.frequency.setTargetAtTime(
      shimFreq * (1 + 0.01 * breathV),
      t,
      0.5,
    );
    const shimLvl = kpN * 0.05 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.breath * 1.7)));
    this.shimmerGain.gain.setTargetAtTime(shimLvl, t, 1.2);
  }

  stop() {
    try {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => this.ctx.close().catch(() => {}), 600);
    } catch {
      /* ignore */
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL — WebGL2 aurora curtain. Flowing vertical green-violet bands + drift,
// driven by the live data: speed→flow rate, Kp→height/intensity, Bz→hue toward
// rose when geomagnetically active. Canvas2D fallback if WebGL2 is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_speed;   // 0..1 flow rate
uniform float u_kp;      // 0..1 height/intensity
uniform float u_active;  // 0..1 Bz southward (rose tint)

// cheap value noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i+vec2(0,0)), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float t = u_time;

  // Vertical curtains: horizontal noise drift, brighter toward top (sky).
  float flow = t * (0.06 + u_speed * 0.5);
  float x = uv.x * (3.0 + u_speed * 4.0);
  // Curtain ridges that waver horizontally.
  float waver = fbm(vec2(x * 0.6, t * 0.08)) * 0.35;
  float curtain = fbm(vec2(x + waver, uv.y * 1.2 - flow));
  curtain = pow(curtain, 1.6);

  // Aurora height: Kp lifts the glowing band upward and intensifies it.
  float horizon = 0.15;
  float top = mix(0.55, 1.05, u_kp);
  float band = smoothstep(horizon, top, uv.y) * (1.0 - smoothstep(top, top + 0.35, uv.y));
  float intensity = curtain * band * (0.5 + u_kp * 0.9);

  // Vertical streaks (particle-curtain feel).
  float streak = fbm(vec2(uv.x * 40.0 + waver * 6.0, uv.y * 2.0 - flow * 1.5));
  intensity += smoothstep(0.72, 1.0, streak) * band * (0.2 + u_kp * 0.4);

  // Colour: green→violet curtain; Bz-active shifts toward rose.
  vec3 green = vec3(0.10, 0.95, 0.55);
  vec3 violet = vec3(0.55, 0.35, 0.95);
  vec3 rose = vec3(0.98, 0.35, 0.55);
  float vmix = clamp(uv.y * 1.1 + curtain * 0.4, 0.0, 1.0);
  vec3 col = mix(green, violet, vmix);
  col = mix(col, rose, u_active * (0.4 + 0.4 * curtain));
  col *= intensity * 1.8;

  // Star/glow background, deep blue night.
  vec3 sky = mix(vec3(0.01, 0.02, 0.06), vec3(0.03, 0.04, 0.12), uv.y);
  float stars = step(0.997, hash(floor(gl_FragCoord.xy * 0.5))) * (0.4 + 0.6*sin(t*2.0 + uv.x*50.0));
  sky += vec3(stars) * (1.0 - band);

  outColor = vec4(sky + col, 1.0);
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

interface GLProgram {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  u: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    speed: WebGLUniformLocation | null;
    kp: WebGLUniformLocation | null;
    active: WebGLUniformLocation | null;
  };
}

function makeGL(canvas: HTMLCanvasElement): GLProgram | null {
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

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
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
    u: {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      speed: gl.getUniformLocation(program, "u_speed"),
      kp: gl.getUniformLocation(program, "u_kp"),
      active: gl.getUniformLocation(program, "u_active"),
    },
  };
}

// Canvas2D fallback aurora (very lightweight, still data-reactive).
function drawCanvas2D(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  speedN: number,
  kpN: number,
  activeN: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#03040c");
  g.addColorStop(1, "#06081a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const phase = time * (0.2 + speedN * 0.6) + b * 1.3;
    const baseY = h * (0.55 - kpN * 0.25) + b * 14;
    const hueRose = activeN;
    const r = Math.round(lerp(20, 240, hueRose));
    const gg = Math.round(lerp(230, 90, hueRose));
    const bb = Math.round(lerp(140, 150, hueRose));
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= w; x += 12) {
      const y =
        baseY +
        Math.sin(x * 0.008 + phase) * (18 + kpN * 40) +
        Math.sin(x * 0.021 + phase * 1.7) * (10 + kpN * 20);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const alpha = 0.06 + kpN * 0.1;
    ctx.fillStyle = `rgba(${r},${gg},${bb},${alpha})`;
    ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type Status = "idle" | "running";

export default function SunOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const organRef = useRef<SunOrgan | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const synthRef = useRef<(() => SpaceWeather) | null>(null);
  // Target (latest fetched/synth) + smoothed (what audio/visual actually use).
  const targetRef = useRef<SpaceWeather>({ ...DEFAULT_WEATHER });
  const smoothRef = useRef<SpaceWeather>({ ...DEFAULT_WEATHER });
  const startedRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [usingSynth, setUsingSynth] = useState(false);
  const [readout, setReadout] = useState<SpaceWeather>({ ...DEFAULT_WEATHER });
  const [elapsed, setElapsed] = useState(0);
  const [glActive, setGlActive] = useState(true);

  // Poll NOAA; on failure flip to synthetic generator.
  const runPoll = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const w = await fetchWeather(ac.signal);
    if (ac.signal.aborted) return;
    if (w) {
      targetRef.current = w;
      setUsingSynth(false);
    } else {
      // Live unavailable → ensure synthetic generator exists, mark fallback.
      if (!synthRef.current) synthRef.current = makeSynth();
      setUsingSynth(true);
    }
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("running");

    // Audio
    if (!organRef.current) organRef.current = new SunOrgan();
    await organRef.current.resume();

    // First poll + interval (every 60s, don't hammer).
    await runPoll();
    pollRef.current = window.setInterval(() => {
      void runPoll();
    }, 60_000);
  }, [runPoll]);

  // Auto-start after ~2s idle.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!startedRef.current) void start();
    }, 2000);
    return () => window.clearTimeout(id);
  }, [start]);

  // Render + audio-apply loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let glp: GLProgram | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    const usingGL = (() => {
      glp = makeGL(canvas);
      if (glp) return true;
      ctx2d = canvas.getContext("2d");
      return false;
    })();
    setGlActive(usingGL);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        if (glp) glp.gl.viewport(0, 0, w, h);
      }
    };

    const t0 = performance.now();
    let last = t0;
    let lastReadout = 0;

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      resize();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const time = (now - t0) / 1000;

      // Choose data source for this frame.
      let target = targetRef.current;
      if (usingSynth && synthRef.current) {
        target = synthRef.current();
        targetRef.current = target;
      }

      // Smooth toward target (slow, so changes are felt as drift).
      const s = smoothRef.current;
      const k = clamp(dt * 0.4, 0, 1);
      s.speed = lerp(s.speed, target.speed, k);
      s.density = lerp(s.density, target.density, k);
      s.bz = lerp(s.bz, target.bz, k);
      s.kp = lerp(s.kp, target.kp, k);
      s.live = target.live;

      // Drive audio.
      if (organRef.current && startedRef.current) {
        organRef.current.apply(s, dt);
      }

      // Normalised visual params.
      const speedN = clamp((s.speed - 300) / 500, 0, 1);
      const kpN = clamp(s.kp / 9, 0, 1);
      const activeN = clamp((-s.bz + 2) / 12, 0, 1);

      if (usingGL && glp) {
        const { gl, u } = glp;
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, time);
        gl.uniform1f(u.speed, speedN);
        gl.uniform1f(u.kp, kpN);
        gl.uniform1f(u.active, activeN);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        drawCanvas2D(
          ctx2d,
          canvas.width,
          canvas.height,
          time,
          speedN,
          kpN,
          activeN,
        );
      }

      // Throttle React state updates to ~3/s.
      if (now - lastReadout > 330) {
        lastReadout = now;
        setReadout({
          speed: s.speed,
          density: s.density,
          bz: s.bz,
          kp: s.kp,
          live: !usingSynth,
        });
        if (startedRef.current) setElapsed(Math.floor((now - t0) / 1000));
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (glp) {
        const lose = glp.gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      }
    };
  }, [usingSynth]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current != null) window.clearInterval(pollRef.current);
      abortRef.current?.abort();
      organRef.current?.stop();
      organRef.current = null;
    };
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#03040c] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Overlay UI */}
      <div className="relative z-10 flex min-h-dvh flex-col justify-between p-6 sm:p-8">
        <header className="max-w-2xl">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Sun Organ
          </h1>
          <p className="mt-2 max-w-xl text-base text-white/80">
            An endless, non-looping ambient piece composed in real time from{" "}
            <span className="text-violet-300">live space-weather data</span> — the
            music is literally different every minute because it tracks the actual
            solar wind and Earth&apos;s magnetic field right now.
          </p>

          {status === "idle" ? (
            <button
              type="button"
              onClick={() => void start()}
              className="mt-5 inline-flex min-h-[44px] items-center rounded-lg border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 font-mono text-base text-white transition-colors hover:bg-violet-500/25"
            >
              ▶ Play the Sun
            </button>
          ) : (
            <p className="mt-5 font-mono text-base text-white/75">
              <span className="text-violet-300">●</span> playing · {mm}:{ss}{" "}
              <span className="text-white/75">
                — the harmonic state keeps drifting; it never repeats.
              </span>
            </p>
          )}

          {usingSynth && status === "running" && (
            <p className="mt-3 max-w-xl text-base text-amber-300/95">
              Using simulated space weather (live feed unavailable). The piece
              still plays and evolves with zero network.
            </p>
          )}
        </header>

        {/* Live data readout */}
        <footer className="font-mono">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 text-base">
            <Readout
              label="solar wind"
              value={`${readout.speed.toFixed(0)} km/s`}
              hint="→ tempo + brightness"
            />
            <Readout
              label="Bz (mag field)"
              value={`${readout.bz >= 0 ? "+" : ""}${readout.bz.toFixed(1)} nT`}
              hint={readout.bz < -2 ? "southward → tension" : "northward → calm"}
            />
            <Readout
              label="Kp index"
              value={readout.kp.toFixed(1)}
              hint="→ aurora energy + lift"
            />
            <Readout
              label="density"
              value={`${readout.density.toFixed(1)} p/cm³`}
              hint="→ active voices"
            />
          </div>
          <p className="mt-3 text-base text-white/75">
            source:{" "}
            <span className={usingSynth ? "text-amber-300/95" : "text-violet-300"}>
              {usingSynth ? "synthetic generator" : "NOAA SWPC (live)"}
            </span>
            {" · "}
            <span className="text-white/75">
              render: {glActive ? "WebGL2 aurora" : "Canvas2D fallback"}
            </span>
          </p>
        </footer>
      </div>
    </main>
  );
}

function Readout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-[7rem]">
      <div className="text-[0.7rem] uppercase tracking-[0.18em] text-white/75">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-white">{value}</div>
      <div className="text-base text-white/75">{hint}</div>
    </div>
  );
}
