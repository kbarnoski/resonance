"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ════════════════════════════════════════════════════════════════════════════
//  AURORA HARP — hear space weather right now. Live NOAA SWPC solar-wind data
//  (speed, density, Bz, Bt at L1) drives a raw-WebGL2 aurora curtain AND a
//  HARP-style sonification of the magnetosphere's resonances: slow ULF drones
//  when calm; beating, gusts and flares when a southward Bz / gust hits.
//  Honest data sonification — the wind is the composer, not a pitch scale.
// ════════════════════════════════════════════════════════════════════════════

// ── live solar-wind state, normalised + raw, smoothed toward the latest read ──
interface Wind {
  speed: number; // km/s (raw)
  density: number; // p/cm^3 (raw)
  bz: number; // nT GSM (raw, negative = southward = geoeffective)
  bt: number; // nT total field magnitude (raw)
  synthetic: boolean; // true when using the synthetic fallback generator
}

const CALM: Wind = { speed: 400, density: 5, bz: 1, bt: 5, synthetic: true };

// NOAA SWPC real-time products (public, CORS-open, no key).
const PLASMA_URL = "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json";
const MAG_URL = "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json";

// Pull the most recent valid row from a SWPC "products" array (header + rows).
function runLatestRow(rows: unknown): string[] | null {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    if (Array.isArray(r)) return r as string[];
  }
  return null;
}

function runParseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// Fetch + parse the two SWPC feeds into one Wind reading. Throws on any gap so
// the caller can fall back to synthetic data.
async function fetchWind(signal: AbortSignal): Promise<Wind> {
  const [plasmaRes, magRes] = await Promise.all([
    fetch(PLASMA_URL, { signal, cache: "no-store" }),
    fetch(MAG_URL, { signal, cache: "no-store" }),
  ]);
  if (!plasmaRes.ok || !magRes.ok) throw new Error("swpc-http");
  const plasma = await plasmaRes.json();
  const mag = await magRes.json();
  const pRow = runLatestRow(plasma);
  const mRow = runLatestRow(mag);
  if (!pRow || !mRow) throw new Error("swpc-empty");
  // plasma rows: [time_tag, density, speed, temperature]
  const density = runParseNum(pRow[1]);
  const speed = runParseNum(pRow[2]);
  // mag rows: [time_tag, bx_gsm, by_gsm, bz_gsm, lon, lat, bt]
  const bz = runParseNum(mRow[3]);
  const bt = runParseNum(mRow[6]);
  if (speed == null || density == null || bz == null || bt == null) {
    throw new Error("swpc-nan");
  }
  return { speed, density, bz, bt, synthetic: false };
}

// Synthetic solar-wind generator — smoothly varying speed/density/Bz so the
// piece always sounds + shows when offline / CORS-blocked / feed gap. Slow
// random-walk plus occasional southward-Bz "substorm" gusts.
function makeSynthetic() {
  let speed = 430;
  let density = 6;
  let bz = 1;
  let bt = 6;
  let t = 0;
  let nextGust = 18 + Math.random() * 24;
  return (dt: number): Wind => {
    t += dt;
    // gentle drifting baselines (low-frequency wander)
    speed += (Math.sin(t * 0.013) * 120 + 450 - speed) * 0.02 * dt;
    density += (Math.sin(t * 0.021 + 1.3) * 4 + 6 - density) * 0.02 * dt;
    bt += (Math.sin(t * 0.017 + 2.1) * 4 + 7 - bt) * 0.02 * dt;
    bz += (Math.sin(t * 0.009 + 0.7) * 2 + 0.5 - bz) * 0.015 * dt;
    // periodic substorm: a sharp southward-Bz gust + speed/density spike
    if (t > nextGust) {
      nextGust = t + 22 + Math.random() * 30;
      bz -= 9 + Math.random() * 7; // go strongly southward
      speed += 140 + Math.random() * 160;
      density += 5 + Math.random() * 8;
      bt += 6 + Math.random() * 8;
    }
    // clamp to physical-ish ranges
    speed = Math.max(250, Math.min(900, speed));
    density = Math.max(0.3, Math.min(40, density));
    bz = Math.max(-22, Math.min(15, bz));
    bt = Math.max(1, Math.min(35, bt));
    return { speed, density, bz, bt, synthetic: true };
  };
}

// ── normalised drivers (0..1) derived from a Wind reading, for audio + shader ─
interface Drivers {
  energy: number; // wind speed → gust tempo / overall energy
  richness: number; // density → number of drone partials / brightness
  south: number; // southward Bz → flare intensity + dissonance (0 = north, 1 = strong south)
  turbulence: number; // Bt magnitude → shimmer / beat rate
}

function runDrivers(w: Wind): Drivers {
  const energy = Math.max(0, Math.min(1, (w.speed - 300) / 500)); // 300→800 km/s
  const richness = Math.max(0, Math.min(1, w.density / 20)); // 0→20 p/cm^3
  const south = Math.max(0, Math.min(1, -w.bz / 15)); // 0→-15 nT southward
  const turbulence = Math.max(0, Math.min(1, w.bt / 25)); // 0→25 nT
  return { energy, richness, south, turbulence };
}

// ════════════════════════════════════════════════════════════════════════════
//  Audio engine — HARP-style magnetosphere sonification.
//   - sustained drone bed (ULF-style), partials gated by density (richness)
//   - detuned oscillator PAIRS → real beating; beat rate tracks turbulence/Bt
//   - periodic gust swells; rate tracks wind speed (energy)
//   - southward-Bz flare: sub-rumble + ripple of beating tones
//  Master compressor/limiter for safety. NOT a fixed consonant scale.
// ════════════════════════════════════════════════════════════════════════════
interface AudioEngine {
  ctx: AudioContext;
  setDrivers: (d: Drivers) => void;
  flare: (strength: number) => void;
  close: () => void;
}

// Drone partial frequencies — deliberately a stack of resonance BANDS (not a
// chord/scale): a low ULF-ish fundamental and inharmonic-ish overtones, so the
// data (which ones are audible + how they beat) is the composer.
const DRONE_BANDS = [48.5, 73, 97.5, 121, 162, 194];

function makeAudio(): AudioEngine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.0;
  // limiter: hard-ish compressor protects the ears on flares
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);
  master.gain.setTargetAtTime(0.32, ctx.currentTime, 1.5);

  // ── drone bed: each band is a detuned PAIR → beating ──────────────────────
  const bandFilter = ctx.createBiquadFilter();
  bandFilter.type = "lowpass";
  bandFilter.frequency.value = 700;
  bandFilter.Q.value = 0.6;
  bandFilter.connect(master);

  interface Band {
    base: number;
    a: OscillatorNode;
    b: OscillatorNode;
    detuneB: AudioParam; // controls beat rate (Hz offset of partner)
    gain: GainNode;
  }
  const bands: Band[] = DRONE_BANDS.map((base, i) => {
    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = base;
    const b = ctx.createOscillator();
    b.type = "sawtooth";
    b.frequency.value = base;
    b.detune.value = 6; // initial small beat
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.0; // fundamental always present
    a.connect(g);
    b.connect(g);
    g.connect(bandFilter);
    a.start();
    b.start();
    return { base, a, b, detuneB: b.detune, gain: g };
  });

  // ── gust LFO: a swell node whose retrigger rate tracks wind speed ─────────
  const gustGain = ctx.createGain();
  gustGain.gain.value = 0.0;
  const gustFilter = ctx.createBiquadFilter();
  gustFilter.type = "bandpass";
  gustFilter.frequency.value = 220;
  gustFilter.Q.value = 1.2;
  gustGain.connect(gustFilter);
  gustFilter.connect(master);
  const gustOsc = ctx.createOscillator();
  gustOsc.type = "sawtooth";
  gustOsc.frequency.value = 55;
  const gustOsc2 = ctx.createOscillator();
  gustOsc2.type = "sawtooth";
  gustOsc2.frequency.value = 55;
  gustOsc2.detune.value = 14;
  gustOsc.connect(gustGain);
  gustOsc2.connect(gustGain);
  gustOsc.start();
  gustOsc2.start();

  let cur: Drivers = { energy: 0.2, richness: 0.2, south: 0, turbulence: 0.2 };
  let gustTimer: number | null = null;
  let stopped = false;

  function runGust() {
    if (stopped) return;
    const now = ctx.currentTime;
    const amt = 0.06 + cur.energy * 0.18;
    const dur = 1.2 - cur.energy * 0.5;
    gustGain.gain.cancelScheduledValues(now);
    gustGain.gain.setValueAtTime(gustGain.gain.value, now);
    gustGain.gain.linearRampToValueAtTime(amt, now + dur * 0.35);
    gustGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    // gust pitch sweep tracks energy slightly (faster wind = a touch higher)
    const f = 44 + cur.energy * 40;
    gustOsc.frequency.setTargetAtTime(f, now, 0.3);
    gustOsc2.frequency.setTargetAtTime(f, now, 0.3);
    gustFilter.frequency.setTargetAtTime(180 + cur.energy * 700, now, 0.4);
    // schedule next gust: faster wind → faster gust rate (4s calm → ~0.9s fast)
    const interval = (4.2 - cur.energy * 3.3) * 1000;
    gustTimer = window.setTimeout(runGust, interval);
  }
  gustTimer = window.setTimeout(runGust, 800);

  function setDrivers(d: Drivers) {
    cur = d;
    const now = ctx.currentTime;
    // density → how many partials sing + overall brightness of the bed
    const audible = 1 + Math.round(d.richness * (DRONE_BANDS.length - 1));
    bands.forEach((band, i) => {
      const on = i < audible;
      // higher partials enter as richness climbs; weighting falls off upward
      const target = on ? (i === 0 ? 0.5 : 0.34 * (1 - i / DRONE_BANDS.length)) : 0.0;
      band.gain.gain.setTargetAtTime(target, now, 0.8);
      // turbulence → beat rate: detune offset of the partner oscillator.
      // small detune = slow beat (calm), larger = fast restless beating.
      // southward Bz adds extra dissonant beating on top.
      const beatHz = 3 + d.turbulence * 22 + d.south * 18;
      band.detuneB.setTargetAtTime(beatHz, now, 0.6);
    });
    // brightness of the bed tracks density + energy
    bandFilter.frequency.setTargetAtTime(
      420 + d.richness * 1400 + d.energy * 600,
      now,
      0.7,
    );
  }

  // southward-Bz FLARE: sub-rumble + a ripple of beating tones, brief and safe.
  function flare(strength: number) {
    if (stopped) return;
    const now = ctx.currentTime;
    const s = Math.max(0.2, Math.min(1, strength));
    // sub-rumble
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 30 + s * 14;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0, now);
    subG.gain.linearRampToValueAtTime(0.18 * s, now + 0.08);
    subG.gain.exponentialRampToValueAtTime(0.0008, now + 2.2 + s);
    sub.connect(subG);
    subG.connect(master);
    sub.start(now);
    sub.stop(now + 2.6 + s);
    // ripple of detuned beating tones up the resonance bands
    const rippleBands = DRONE_BANDS.slice(0, 3 + Math.round(s * 3));
    rippleBands.forEach((base, i) => {
      const t0 = now + i * 0.12;
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = base * 2;
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = base * 2;
      o2.detune.value = 22 + s * 30; // strong beating
      const g = ctx.createGain();
      const peak = 0.07 * s * (1 - i * 0.12);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0006, t0 + 1.6);
      o1.connect(g);
      o2.connect(g);
      g.connect(master);
      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 1.8);
      o2.stop(t0 + 1.8);
    });
  }

  function close() {
    stopped = true;
    if (gustTimer != null) window.clearTimeout(gustTimer);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      try {
        bands.forEach((b) => {
          b.a.stop();
          b.b.stop();
        });
        gustOsc.stop();
        gustOsc2.stop();
      } catch {
        /* already stopped */
      }
      ctx.close().catch(() => {
        /* ignore */
      });
    }, 500);
  }

  return { ctx, setDrivers, flare, close };
}

// ════════════════════════════════════════════════════════════════════════════
//  WebGL2 aurora shader — full-screen curtain. fbm-folded vertical light sheets
//  over a dark arctic horizon + star field. Solar-wind drivers shape
//  brightness, fold turbulence, color (green→violet→crimson) and motion.
// ════════════════════════════════════════════════════════════════════════════
const VERT_GLSL = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG_GLSL = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2  uRes;
uniform float uTime;
uniform float uEnergy;     // wind speed → fold speed
uniform float uRichness;   // density → brightness / curtain density
uniform float uSouth;      // southward Bz → height + crimson/violet shift
uniform float uTurb;       // Bt → shimmer
uniform float uFlash;      // 0..1 transient flare flash
uniform float uLook;       // pointer look-around offset (-1..1)

// ── hash / value noise / fbm ──
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < 5; i++){
    v += a * noise(p);
    p = p * 2.02 + 7.0;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;        // 0..1
  float aspect = uRes.x / uRes.y;
  vec2 sky = vec2((uv.x - 0.5 + uLook * 0.15) * aspect, uv.y);

  // ── background gradient: deep arctic night ──
  vec3 col = mix(vec3(0.01, 0.015, 0.05), vec3(0.02, 0.03, 0.10), uv.y);

  // ── star field (above the horizon, fading toward it) ──
  float horizon = 0.16;
  float above = smoothstep(horizon - 0.02, horizon + 0.10, uv.y);
  vec2 sg = floor(sky * 220.0);
  float star = hash(sg);
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + star * 3.0) + star * 30.0);
  float starM = step(0.991, star) * above * (0.4 + 0.6 * tw);
  col += vec3(0.8, 0.85, 1.0) * starM * 0.9;

  // ── aurora curtains: vertical folded light sheets ──
  // curtain height grows with southward Bz (reaches higher up the sky)
  float topReach = mix(0.55, 0.96, uSouth);
  float band = smoothstep(horizon, horizon + 0.05, uv.y) *
               (1.0 - smoothstep(topReach * 0.5, topReach, uv.y));

  // horizontal folds: fbm warps x; folds move faster with wind speed
  float speed = 0.05 + uEnergy * 0.35;
  float foldScale = 2.5 + uRichness * 3.0;
  float warp = fbm(vec2(sky.x * foldScale + uTime * speed,
                        uv.y * 1.5 - uTime * speed * 0.4));
  float folds = fbm(vec2(sky.x * (5.0 + uTurb * 8.0) + warp * 2.5 + uTime * speed,
                         uv.y * 2.0));
  // vertical striations (the "rays")
  float rays = 0.5 + 0.5 * sin(sky.x * (40.0 + uRichness * 60.0) + warp * 6.0);
  rays = pow(rays, 1.5);

  float curtain = band * folds * (0.4 + 0.6 * rays);
  // fade with height + brighten with density
  curtain *= (1.0 - uv.y * 0.5) * (0.5 + uRichness * 1.1);
  curtain = max(0.0, curtain);

  // ── color: calm = green; turbulence pushes toward teal; south Bz → violet/crimson
  vec3 green = vec3(0.15, 0.95, 0.45);
  vec3 teal = vec3(0.10, 0.80, 0.75);
  vec3 violet = vec3(0.70, 0.25, 0.95);
  vec3 crimson = vec3(0.95, 0.18, 0.35);
  vec3 aColor = mix(green, teal, uTurb * 0.6);
  aColor = mix(aColor, violet, uSouth * 0.8);
  aColor = mix(aColor, crimson, uSouth * uSouth * 0.6);

  // flare flash brightens + reddens transiently
  float flash = uFlash;
  aColor = mix(aColor, mix(violet, crimson, 0.5), flash * 0.5);
  float bright = 1.1 + flash * 1.4;

  col += aColor * curtain * bright;

  // lower-edge glow on the horizon
  float glow = exp(-abs(uv.y - horizon) * 14.0) * (0.3 + uRichness * 0.5 + flash * 0.6);
  col += aColor * glow * 0.5;

  // subtle vignette
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.6;

  // tone map
  col = col / (col + vec3(0.6));
  col = pow(col, vec3(0.85));
  frag = vec4(col, 1.0);
}`;

function runCompile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader-compile: " + log);
  }
  return sh;
}

interface GlCtx {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  uni: Record<string, WebGLUniformLocation | null>;
}

function buildGl(canvas: HTMLCanvasElement): GlCtx {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no-webgl2");
  const vs = runCompile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = runCompile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const names = ["uRes", "uTime", "uEnergy", "uRichness", "uSouth", "uTurb", "uFlash", "uLook"];
  const uni: Record<string, WebGLUniformLocation | null> = {};
  names.forEach((n) => {
    uni[n] = gl.getUniformLocation(prog, n);
  });
  return { gl, prog, uni };
}

// ════════════════════════════════════════════════════════════════════════════
//  Component
// ════════════════════════════════════════════════════════════════════════════
type Phase = "idle" | "running";

export default function AuroraHarp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Wind>(CALM);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const animRef = useRef(0);
  const windRef = useRef<Wind>(CALM); // smoothed live target
  const dispRef = useRef<Wind>(CALM); // displayed/eased value driving everything
  const syntheticRef = useRef<((dt: number) => Wind) | null>(null);
  const lookRef = useRef(0);
  const flashRef = useRef(0);
  const lastBzRef = useRef(1);
  const pollAbortRef = useRef<AbortController | null>(null);

  // ── polling: fetch every ~60s; on failure switch to synthetic generator ──
  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;
    let pollTimer: number | null = null;

    async function poll() {
      if (cancelled) return;
      const ac = new AbortController();
      pollAbortRef.current = ac;
      try {
        const w = await fetchWind(ac.signal);
        if (cancelled) return;
        windRef.current = w;
        syntheticRef.current = null; // real data flowing — stop synthetic
        setNotice(null);
      } catch {
        if (cancelled) return;
        // engage synthetic fallback if not already
        if (!syntheticRef.current) {
          syntheticRef.current = makeSynthetic();
          setNotice("Live NOAA feed unavailable — sonifying a synthetic solar wind.");
        }
      } finally {
        if (!cancelled) pollTimer = window.setTimeout(poll, 60000);
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      pollAbortRef.current?.abort();
    };
  }, [phase]);

  // ── render + audio-driver loop ──
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let glc: GlCtx | null = null;
    try {
      glc = buildGl(canvas);
    } catch {
      setNotice((n) =>
        n ?? "WebGL2 unavailable — running audio-only. The sky cannot be drawn here.",
      );
    }

    const dpr = Math.min(devicePixelRatio || 1, 2);
    function resize() {
      if (!canvas) return;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      if (glc) glc.gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    // safety synthetic until the first poll resolves, so we sound within 0.6s
    if (!syntheticRef.current && windRef.current.synthetic) {
      syntheticRef.current = makeSynthetic();
    }

    const t0 = performance.now();
    let last = t0;
    let hudT = 0;

    const frame = (now: number) => {
      if (cancelled) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const tSec = (now - t0) / 1000;

      // advance synthetic target if engaged
      if (syntheticRef.current) {
        windRef.current = syntheticRef.current(dt);
      }

      // ease the displayed wind toward the target (smooth transitions)
      const tgt = windRef.current;
      const d = dispRef.current;
      const k = 1 - Math.pow(0.001, dt); // ~time-constant smoothing
      d.speed += (tgt.speed - d.speed) * k;
      d.density += (tgt.density - d.density) * k;
      d.bz += (tgt.bz - d.bz) * k;
      d.bt += (tgt.bt - d.bt) * k;
      d.synthetic = tgt.synthetic;

      const drv = runDrivers(d);

      // southward-Bz flare detection (edge: Bz crossing strongly negative)
      const prevBz = lastBzRef.current;
      if (d.bz < -7 && prevBz >= -7) {
        const strength = Math.min(1, -d.bz / 15);
        audioRef.current?.flare(strength);
        flashRef.current = Math.min(1, flashRef.current + 0.7 + strength * 0.3);
      }
      lastBzRef.current = d.bz;
      flashRef.current *= Math.pow(0.25, dt); // flash decays

      // feed audio drivers (cheap; ~60fps targets are fine)
      audioRef.current?.setDrivers(drv);

      // ── draw ──
      if (glc && canvas) {
        const { gl, uni } = glc;
        gl.uniform2f(uni.uRes, canvas.width, canvas.height);
        gl.uniform1f(uni.uTime, tSec);
        gl.uniform1f(uni.uEnergy, drv.energy);
        gl.uniform1f(uni.uRichness, drv.richness);
        gl.uniform1f(uni.uSouth, drv.south);
        gl.uniform1f(uni.uTurb, drv.turbulence);
        gl.uniform1f(uni.uFlash, flashRef.current);
        gl.uniform1f(uni.uLook, lookRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // HUD readout ~3x/sec
      hudT += dt;
      if (hudT > 0.33) {
        setReadout({
          speed: d.speed,
          density: d.density,
          bz: d.bz,
          bt: d.bt,
          synthetic: d.synthetic,
        });
        hudT = 0;
      }

      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      if (glc) {
        const lose = glc.gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      }
    };
  }, [phase]);

  async function handleStart() {
    // 1. seed an immediate synthetic wind so sound + sky appear within ~0.6s
    syntheticRef.current = makeSynthetic();
    windRef.current = syntheticRef.current(0);
    dispRef.current = { ...windRef.current };
    setNotice("Reaching for the live NOAA solar-wind feed…");

    // 2. audio inside the user gesture
    try {
      const a = makeAudio();
      await a.ctx.resume();
      audioRef.current = a;
    } catch {
      setNotice("Audio could not start in this browser.");
    }
    setPhase("running");
  }

  function handleStop() {
    cancelAnimationFrame(animRef.current);
    pollAbortRef.current?.abort();
    audioRef.current?.close();
    audioRef.current = null;
    syntheticRef.current = null;
    setPhase("idle");
    setNotice(null);
  }

  // pointer = look around the sky (not the primary driver — data is)
  function handlePointerMove(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    lookRef.current = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  }

  const running = phase === "running";
  const isSynthetic = readout.synthetic;

  return (
    <div className="relative w-full bg-[#01030a]" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none", cursor: running ? "crosshair" : "default" }}
        onPointerMove={handlePointerMove}
      />

      {/* idle / start */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="font-serif text-3xl md:text-4xl text-white mb-3 tracking-tight">
            Aurora Harp
          </h1>
          <p className="text-base text-white/80 max-w-lg mb-2 leading-relaxed">
            Hear space weather, right now. The live solar wind streaming past
            Earth — its speed, density and magnetic-field Bz — drives a shimmering
            aurora you watch and audifies the magnetosphere&apos;s resonances the
            way NASA&apos;s HARP project does.
          </p>
          <p className="text-base text-white/75 max-w-lg mb-8 leading-relaxed">
            Calm wind: slow ULF-style drones. A gust or a southward Bz: the
            curtain flares green-violet and the sound thickens, beats and ripples.
            Music from real data and its resonances — not a pitch scale.
          </p>
          <button
            onClick={handleStart}
            className="px-6 py-2.5 min-h-[44px] text-base text-white border border-emerald-400/50 bg-emerald-500/15 rounded hover:bg-emerald-500/25 hover:border-emerald-400 transition"
          >
            Start listening to the sky
          </button>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-5 text-base text-white/75 hover:text-white/95 underline underline-offset-4"
          >
            Design notes
          </button>
          <Link href="/dream" className="mt-10 text-base text-white/75 hover:text-white/95">
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* running HUD */}
      {running && (
        <>
          <div className="absolute top-4 left-4 space-y-1 pointer-events-none select-none">
            <div className="font-serif text-2xl text-white/95">Aurora Harp</div>
            <div className="text-base text-white/80 font-mono">
              wind {Math.round(readout.speed)} km/s · {readout.density.toFixed(1)} p/cm³
            </div>
            <div className="text-base text-white/80 font-mono">
              Bz {readout.bz >= 0 ? "+" : ""}
              {readout.bz.toFixed(1)} nT · Bt {readout.bt.toFixed(1)} nT
              {readout.bz < -3 && (
                <span className="text-rose-300"> · southward</span>
              )}
            </div>
            <div className="text-sm text-white/75 font-mono">
              {isSynthetic ? "source: synthetic" : "source: NOAA SWPC (L1, live)"}
            </div>
          </div>

          {/* what am I hearing panel */}
          <div className="absolute top-4 right-4 max-w-xs bg-black/40 rounded-lg p-3 pointer-events-none select-none">
            <div className="text-base text-white/95 font-semibold mb-1">
              What am I hearing
            </div>
            <ul className="text-sm text-white/80 space-y-1 leading-snug font-mono">
              <li>speed → gust tempo / energy</li>
              <li>density → drone partials / brightness</li>
              <li>Bz south → flare + beating + crimson sky</li>
              <li>Bt → shimmer + beat rate</li>
            </ul>
          </div>

          <button
            onClick={handleStop}
            className="absolute bottom-4 right-4 text-base text-white/80 hover:text-white border border-white/20 hover:border-white/50 px-4 py-2.5 min-h-[44px] rounded bg-black/30"
          >
            Stop
          </button>

          <Link
            href="/dream"
            className="absolute bottom-4 left-4 text-base text-white/75 hover:text-white/95"
          >
            ← back
          </Link>
        </>
      )}

      {/* notice (amber for synthetic / degraded; plain while reaching) */}
      {notice && (
        <div
          className={`absolute ${
            running ? "bottom-20 right-4" : "top-4 right-4"
          } max-w-xs text-base bg-black/45 rounded px-3 py-2 ${
            isSynthetic && running ? "text-amber-300/95" : "text-white/80"
          }`}
        >
          {notice}
        </div>
      )}

      {/* design notes overlay */}
      {showNotes && phase === "idle" && (
        <div className="absolute inset-0 bg-black/85 flex items-center justify-center px-6 overflow-y-auto">
          <div className="max-w-lg text-left py-10">
            <h2 className="font-serif text-2xl text-white mb-4">Design notes</h2>
            <p className="text-base text-white/80 mb-3 leading-relaxed">
              Two live NOAA SWPC feeds (5-minute plasma + magnetic-field products
              from ACE/DSCOVR at the L1 point) are polled every 60 seconds from the
              browser. The latest row gives solar-wind <span className="text-emerald-300">speed</span>,{" "}
              <span className="text-emerald-300">density</span>, and the
              interplanetary magnetic-field <span className="text-violet-300">Bz</span> and total
              field <span className="text-violet-300">Bt</span>. If the feed is
              unreachable, a smoothly-varying synthetic solar wind takes over so it
              always sounds and shows (with an amber notice).
            </p>
            <p className="text-base text-white/80 mb-3 leading-relaxed">
              The sound is HARP-style data sonification, not a chord. A sustained
              drone bed sits on inharmonic resonance <span className="text-emerald-300">bands</span>;
              density decides how many partials sing. Each band is a detuned
              oscillator <span className="text-violet-300">pair</span> producing real{" "}
              <span className="text-violet-300">beating</span>, whose beat rate tracks
              turbulence (Bt) and southward Bz. Periodic gust swells speed up with
              the wind. A southward-Bz event triggers a flare: a sub-rumble plus a
              ripple of beating tones — and the sky flashes.
            </p>
            <p className="text-base text-white/80 mb-4 leading-relaxed">
              The visual is a raw WebGL2 fragment shader: fbm-folded vertical light
              sheets over a dark arctic horizon and a twinkling star field. Faster
              wind folds the curtain faster; more density brightens it; southward
              Bz pushes it higher and shifts it from green toward violet and
              crimson — the colours of a real geomagnetic storm.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="text-base text-emerald-300 hover:text-emerald-200 underline underline-offset-4 min-h-[44px]"
            >
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
