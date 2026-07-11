"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Magnetic Walk — the invisible field around you, made audible.
//
// THE ONE QUESTION: What if the geomagnetic frame were a musical instrument?
// The phone's compass heading + tilt become a slowly-shifting harmonic drone
// and a field of light that LOCKS to magnetic north — so turning your body
// re-voices the music, and the world feels fixed while you turn.
//
// INPUT     : DeviceOrientationEvent — webkitCompassHeading (iOS) / alpha-beta-
//             gamma elsewhere → compass heading, front/back tilt, left/right roll.
// OUTPUT    : WebGL2 (GLSL ES 3.00) full-screen aurora field, north-locked.
// AUDIO     : stacked detuned saw/sine oscillators → lowpass → synthesized
//             convolution reverb. A continuous, slowly-morphing drone. No loops,
//             no samples, no granular synthesis.
// TECHNIQUE : cross-modal geomagnetic sonification → generative drone.
// VIBE      : ambient / psychogeographic / meditative.
//
// REFERENCES:
//   Christina Kubisch — Electrical Walks: visitors wear induction headphones
//     that make a city's electromagnetic fields audible as they walk.
//   Pauline Oliveros — Deep Listening: attention to the total sound field as
//     a contemplative practice.
//
// DEGRADES: no sensor / denied / desktop → "ghost mode" auto-drifting heading
//   so the piece sounds + moves on a silent glance. No WebGL2 → Canvas2D aurora.
// ─────────────────────────────────────────────────────────────────────────────

// ── the compass of keys ──────────────────────────────────────────────────────
// Twelve stations around the heading circle. Each gives a root (a just-intoned
// ratio above a base) and a chord "color" (extra ratios stacked above the root).
// Facing N vs E vs S vs W lands on genuinely different drone colors; in between,
// we crossfade the two nearest stations so the change is continuous, never stepped.
const BASE_HZ = 110; // A2-ish anchor

// Just-intonation ratios for a warm, beating-free stack. index 0 = root.
// Each "station" = a root ratio + a small set of partials (a chord color).
interface Station {
  root: number; // ratio above BASE_HZ
  color: number[]; // extra ratios above the root (the chord)
}
// Roots walk a slow pentatonic-ish circle; colors alternate open 5ths,
// add-9 shimmer, minor-ish 6/5, sus, etc. 12 stations = one full turn.
const STATIONS: Station[] = [
  { root: 1, color: [1, 3 / 2, 2, 9 / 4] }, //   0° N   — open, airy
  { root: 9 / 8, color: [1, 6 / 5, 3 / 2, 12 / 5] }, //  30°    — minor-ish
  { root: 5 / 4, color: [1, 5 / 4, 3 / 2, 15 / 8] }, //  60°    — bright major
  { root: 4 / 3, color: [1, 3 / 2, 5 / 3, 2] }, //  90° E   — suspended
  { root: 3 / 2, color: [1, 5 / 4, 3 / 2, 9 / 4] }, // 120°    — dominant glow
  { root: 5 / 3, color: [1, 6 / 5, 3 / 2, 2] }, // 150°    — wistful
  { root: 2, color: [1, 3 / 2, 2, 5 / 2] }, // 180° S   — octave-wide
  { root: 9 / 8 * 2, color: [1, 6 / 5, 8 / 5, 2] }, // 210°    — dusky
  { root: 5 / 4 * 2, color: [1, 5 / 4, 3 / 2, 15 / 8] }, // 240°    — major-7 shine
  { root: 4 / 3 * 2, color: [1, 9 / 8, 3 / 2, 2] }, // 270° W   — add-9
  { root: 3 / 2 * 2, color: [1, 5 / 4, 3 / 2, 2] }, // 300°    — full chord
  { root: 5 / 3 * 2, color: [1, 6 / 5, 3 / 2, 9 / 5] }, // 330°    — closing fall
];

const VOICES = 4; // oscillator voices we crossfade across the chord

// ── shared sensor state (mutable, read every frame by audio + visual) ─────────
interface FieldState {
  heading: number; // smoothed compass heading, degrees 0..360
  rawHeading: number; // latest raw target
  beta: number; // front/back tilt, smoothed, degrees (-180..180)
  gamma: number; // left/right roll, smoothed, degrees (-90..90)
  turnRate: number; // |delta heading| / sec, smoothed → brightness
  ghost: boolean; // true when no live sensor: auto-drift
  lastEventAt: number; // perf time of last real sensor event
}

type Backend = "webgl2" | "canvas2d";

function angleLerpShortest(a: number, b: number, t: number): number {
  // interpolate a → b around the 360° circle along the short arc
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

// ── GLSL ES 3.00 fragment shader: north-locked aurora / radial compass ────────
const VERT = `#version 300 es
// full-screen triangle — no attributes, gl_VertexID drives it
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p; // 0..2
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_heading;   // radians; field rotates by -heading to stay north-locked
uniform float u_tilt;      // front/back tilt, normalized -1..1 (vertical structure)
uniform float u_roll;      // left/right roll, normalized -1..1 (skew/shimmer)
uniform float u_turn;      // turn-rate brightness 0..1
uniform float u_hue;       // base hue 0..1 from heading
uniform float u_ghost;     // 1.0 in ghost mode (subtle pulse)

// cheap value noise
float hash(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for(int i=0;i<5;i++){ v += amp*noise(p); p *= 2.02; amp *= 0.5; }
  return v;
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y; // centered, aspect-correct
  // NORTH-LOCK: rotate the whole field by -heading so it stays fixed in world space
  float s = sin(-u_heading), c = cos(-u_heading);
  vec2 wp = mat2(c, -s, s, c) * uv;

  float r = length(wp);
  float ang = atan(wp.y, wp.x);

  // radial compass: a faint ring + a north spoke that always points up in world space
  float spoke = smoothstep(0.06, 0.0, abs(ang)) ;      // +x = world-east baseline
  float north = smoothstep(0.05, 0.0, abs(ang - 1.5708)); // mark north direction
  float ring  = smoothstep(0.02, 0.0, abs(r - 0.62));

  // aurora bands: vertical structure shaped by tilt, drifting slowly
  float t = u_time*0.05;
  vec2 q = wp*1.3;
  q.y += u_tilt*0.6;                 // tilt shifts the bands up/down
  q.x += u_roll*0.4*sin(u_time*0.2); // roll skews the shimmer
  float bands = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    float n = fbm(q*(1.0+fi*0.7) + vec2(t*(1.0+fi*0.3), -t*0.5 + fi*3.1));
    float band = smoothstep(0.45, 0.9, n) * (1.0 - r*0.55);
    bands += band * (0.6 - fi*0.15);
  }
  bands = max(bands, 0.0);

  // brightness rises with turn-rate; subtle breathing in ghost mode
  float bright = 0.55 + 0.6*u_turn + u_ghost*0.12*(0.5+0.5*sin(u_time*0.6));

  // hue wheel tied to heading; slight radial hue drift for depth
  float hue = fract(u_hue + r*0.08 + bands*0.06);
  float sat = 0.55 + 0.25*u_turn;
  vec3 col = hsv2rgb(vec3(hue, sat, 1.0)) * bands * bright;

  // compass overlays — luminous white-ish accents
  col += vec3(0.9, 0.95, 1.0) * (north*0.9 + ring*0.35 + spoke*0.12) * (0.4 + 0.6*u_turn);

  // dark vignette so the field floats on black
  col *= smoothstep(1.5, 0.2, r);
  // gentle additive star-dust far out
  col += hsv2rgb(vec3(hue, 0.3, 1.0)) * 0.04 * fbm(wp*6.0 + t);

  col = col / (col + 0.7); // tone-map / soft additive rolloff
  fragColor = vec4(col, 1.0);
}`;

export default function MagneticWalkPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [headingLabel, setHeadingLabel] = useState("—");

  const fieldRef = useRef<FieldState>({
    heading: 0,
    rawHeading: 0,
    beta: 0,
    gamma: 0,
    turnRate: 0,
    ghost: true,
    lastEventAt: 0,
  });

  // audio graph (created on Start, inside the gesture)
  const audioRef = useRef<{
    ctx: AudioContext;
    master: GainNode;
    lowpass: BiquadFilterNode;
    voices: { osc: OscillatorNode; det: OscillatorNode; gain: GainNode }[];
    shimmerPan: StereoPannerNode;
    shimmer: OscillatorNode;
    shimmerGain: GainNode;
  } | null>(null);

  const rafRef = useRef<number | null>(null);
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const glCleanupRef = useRef<(() => void) | null>(null);

  // ── set up the live sensor (inside Start gesture) ───────────────────────────
  const runSensorSetup = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (!DOE) {
      setSensorMsg("No motion sensor on this device — auto-drifting through the field.");
      return;
    }
    if (typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setSensorMsg("Compass permission denied — auto-drifting through the field.");
          return;
        }
      } catch {
        setSensorMsg("Compass unavailable — auto-drifting through the field.");
        return;
      }
    }

    const handler = (e: DeviceOrientationEvent) => {
      const f = fieldRef.current;
      // iOS gives a true compass heading; elsewhere derive from alpha.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compass = (e as any).webkitCompassHeading;
      let h: number | null = null;
      if (typeof compass === "number" && !Number.isNaN(compass)) {
        h = compass; // already 0=N, clockwise
      } else if (typeof e.alpha === "number" && !Number.isNaN(e.alpha)) {
        h = (360 - e.alpha) % 360; // alpha is counter-clockwise from arbitrary 0
      }
      if (h === null) return; // not a usable orientation event
      f.rawHeading = h;
      f.beta = (e.beta ?? 0);
      f.gamma = (e.gamma ?? 0);
      f.lastEventAt = performance.now();
      if (f.ghost) {
        f.ghost = false;
        setSensorMsg(null);
      }
    };
    orientHandlerRef.current = handler;
    window.addEventListener("deviceorientation", handler, true);

    // If nothing arrives within ~1.8s, stay in ghost mode with a notice.
    window.setTimeout(() => {
      const f = fieldRef.current;
      if (f.ghost) {
        setSensorMsg(
          "No live compass data — auto-drifting through the field. (Common on desktop or when sensors are blocked.)",
        );
      }
    }, 1800);
  }, []);

  // ── audio graph ─────────────────────────────────────────────────────────────
  const runAudioSetup = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 2.0); // fade in <2s

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.7;

    // synthesized convolution reverb (decaying noise impulse — no external file)
    const reverb = ctx.createConvolver();
    const dur = 3.2;
    const len = Math.floor(ctx.sampleRate * dur);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 2.4);
      }
    }
    reverb.buffer = imp;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const dry = ctx.createGain();
    dry.gain.value = 0.7;

    lowpass.connect(dry).connect(master);
    lowpass.connect(reverb).connect(wet).connect(master);
    master.connect(ctx.destination);

    // drone voices: detuned saw + sine pair per voice
    const voices: { osc: OscillatorNode; det: OscillatorNode; gain: GainNode }[] = [];
    for (let i = 0; i < VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sawtooth" : "sine";
      const det = ctx.createOscillator();
      det.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      osc.frequency.value = BASE_HZ;
      det.frequency.value = BASE_HZ * 1.003; // slow beating
      osc.connect(gain);
      det.connect(gain);
      gain.connect(lowpass);
      osc.start();
      det.start();
      voices.push({ osc, det, gain });
    }

    // a high shimmer layer that pans / detunes with roll (gamma)
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = BASE_HZ * 4;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.0;
    const shimmerPan = ctx.createStereoPanner();
    shimmer.connect(shimmerGain).connect(shimmerPan).connect(master);
    shimmer.start();

    audioRef.current = {
      ctx,
      master,
      lowpass,
      voices,
      shimmerPan,
      shimmer,
      shimmerGain,
    };
  }, []);

  // ── apply field state → audio params (called every frame, slewed) ───────────
  const applyAudio = useCallback((f: FieldState) => {
    const a = audioRef.current;
    if (!a) return;
    const { ctx } = a;
    const now = ctx.currentTime;

    // heading → position between two stations (continuous crossfade)
    const pos = (f.heading / 360) * STATIONS.length; // 0..12
    const i0 = Math.floor(pos) % STATIONS.length;
    const i1 = (i0 + 1) % STATIONS.length;
    const frac = pos - Math.floor(pos);
    const s0 = STATIONS[i0];
    const s1 = STATIONS[i1];

    // octave / brightness from tilt (beta): leaning back opens it up
    const tiltN = Math.max(-1, Math.min(1, f.beta / 60));
    const octave = Math.pow(2, tiltN * 0.5); // ±~half octave
    const cutoff = 500 + (tiltN * 0.5 + 0.5) * 2600 + f.turnRate * 30;

    // smooth (slew) every parameter — long glides, no clicks
    a.lowpass.frequency.setTargetAtTime(cutoff, now, 0.25);

    for (let v = 0; v < VOICES; v++) {
      const r0 = s0.color[v] * s0.root;
      const r1 = s1.color[v] * s1.root;
      const ratio = r0 * (1 - frac) + r1 * frac;
      const freq = BASE_HZ * ratio * octave;
      const voice = a.voices[v];
      voice.osc.frequency.setTargetAtTime(freq, now, 0.18);
      voice.det.frequency.setTargetAtTime(freq * 1.004, now, 0.18);
      // upper voices fade in with turn-rate so motion adds harmonic richness
      const lvl = (v === 0 ? 0.5 : 0.32 - v * 0.04) * (v === 0 ? 1 : 0.4 + 0.6 * f.turnRate);
      voice.gain.gain.setTargetAtTime(Math.max(0, lvl), now, 0.3);
    }

    // roll (gamma) → pan + detune of the shimmer; turn-rate → its volume
    const rollN = Math.max(-1, Math.min(1, f.gamma / 60));
    a.shimmerPan.pan.setTargetAtTime(rollN, now, 0.2);
    const shimBase = BASE_HZ * s0.root * 4 * octave;
    a.shimmer.frequency.setTargetAtTime(shimBase * (1 + rollN * 0.01), now, 0.25);
    a.shimmerGain.gain.setTargetAtTime(0.04 + 0.1 * f.turnRate, now, 0.3);
  }, []);

  // ── WebGL2 renderer setup; returns true on success ──────────────────────────
  const runGLSetup = useCallback((canvas: HTMLCanvasElement): boolean => {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return false;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const u_res = gl.getUniformLocation(prog, "u_res");
    const u_time = gl.getUniformLocation(prog, "u_time");
    const u_heading = gl.getUniformLocation(prog, "u_heading");
    const u_tilt = gl.getUniformLocation(prog, "u_tilt");
    const u_roll = gl.getUniformLocation(prog, "u_roll");
    const u_turn = gl.getUniformLocation(prog, "u_turn");
    const u_hue = gl.getUniformLocation(prog, "u_hue");
    const u_ghost = gl.getUniformLocation(prog, "u_ghost");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("resize", resize);
    resize();

    const start = performance.now();
    const drawFrame = () => {
      resize();
      const f = fieldRef.current;
      const time = (performance.now() - start) / 1000;
      gl.uniform2f(u_res, canvas.width, canvas.height);
      gl.uniform1f(u_time, time);
      gl.uniform1f(u_heading, (f.heading * Math.PI) / 180);
      gl.uniform1f(u_tilt, Math.max(-1, Math.min(1, f.beta / 60)));
      gl.uniform1f(u_roll, Math.max(-1, Math.min(1, f.gamma / 60)));
      gl.uniform1f(u_turn, Math.min(1, f.turnRate / 90));
      gl.uniform1f(u_hue, f.heading / 360);
      gl.uniform1f(u_ghost, f.ghost ? 1 : 0);
      gl.clearColor(0.02, 0.02, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // expose draw via closure stored on ref-less local — handled in main loop below
    (canvas as unknown as { __draw?: () => void }).__draw = drawFrame;

    glCleanupRef.current = () => {
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteVertexArray(vao);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
    return true;
  }, []);

  // ── Canvas2D fallback renderer ──────────────────────────────────────────────
  const runCanvas2DSetup = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    window.addEventListener("resize", resize);
    resize();

    const drawFrame = () => {
      const f = fieldRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = "rgba(5,6,12,0.35)";
      ctx.fillRect(0, 0, w, h);
      const hueDeg = (f.heading / 360) * 360;
      const turn = Math.min(1, f.turnRate / 90);
      const rad = -((f.heading * Math.PI) / 180); // north-lock the compass
      // concentric aurora rings
      const rings = 7;
      for (let i = rings; i >= 1; i--) {
        const rr = (i / rings) * Math.min(w, h) * 0.45;
        const a = 0.05 + 0.08 * turn + 0.02 * Math.sin(performance.now() / 900 + i);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${(hueDeg + i * 18) % 360}, 70%, 60%, ${a})`;
        ctx.lineWidth = 6 + 8 * (1 - i / rings);
        ctx.stroke();
      }
      // north spoke — rotates so it stays world-locked
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -Math.min(w, h) * 0.42);
      ctx.strokeStyle = `hsla(${hueDeg % 360}, 80%, 75%, ${0.5 + 0.4 * turn})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    };
    (canvas as unknown as { __draw?: () => void }).__draw = drawFrame;
    glCleanupRef.current = () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── the Start handler (single gesture: audio unlock + sensor permission) ────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    runAudioSetup();
    if (audioRef.current && audioRef.current.ctx.state === "suspended") {
      await audioRef.current.ctx.resume();
    }
    await runSensorSetup();

    const canvas = canvasRef.current;
    if (canvas) {
      const ok = runGLSetup(canvas);
      if (ok) {
        setBackend("webgl2");
      } else {
        runCanvas2DSetup(canvas);
        setBackend("canvas2d");
      }
    }
  }, [started, runAudioSetup, runSensorSetup, runGLSetup, runCanvas2DSetup]);

  // ── main animation + state-integration loop ─────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let last = performance.now();
    let ghostHeading = fieldRef.current.heading;

    const loop = () => {
      const nowt = performance.now();
      const dt = Math.min(0.05, (nowt - last) / 1000);
      last = nowt;
      const f = fieldRef.current;

      // ghost mode if no recent live event
      const stale = nowt - f.lastEventAt > 1200;
      f.ghost = stale;

      let targetHeading: number;
      if (f.ghost) {
        // slow synthetic drift so the piece is alive with zero interaction
        ghostHeading = (ghostHeading + dt * 6) % 360; // 6°/s — a full turn each minute
        targetHeading = ghostHeading;
        f.beta = 18 * Math.sin(nowt / 7000);
        f.gamma = 22 * Math.sin(nowt / 5000 + 1.2);
      } else {
        ghostHeading = f.heading;
        targetHeading = f.rawHeading;
      }

      const prev = f.heading;
      // slew heading along the short arc — long glide, never steps
      f.heading = angleLerpShortest(f.heading, targetHeading, Math.min(1, dt * 2.2));
      // turn rate (deg/sec), smoothed
      const dh = Math.abs(((f.heading - prev + 540) % 360) - 180) / Math.max(dt, 1e-3);
      f.turnRate = f.turnRate * 0.9 + dh * 0.1;

      applyAudio(f);

      const canvas = canvasRef.current as unknown as { __draw?: () => void } | null;
      if (canvas && canvas.__draw) canvas.__draw();

      setHeadingLabel(`${Math.round(f.heading)}°`);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, applyAudio]);

  // ── teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (orientHandlerRef.current) {
        window.removeEventListener("deviceorientation", orientHandlerRef.current, true);
      }
      if (glCleanupRef.current) glCleanupRef.current();
      const a = audioRef.current;
      if (a) {
        try {
          a.voices.forEach((v) => {
            v.osc.stop();
            v.det.stop();
          });
          a.shimmer.stop();
        } catch {
          /* already stopped */
        }
        void a.ctx.close();
      }
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060c] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* backend badge + live heading */}
      {started && (
        <div className="absolute left-4 top-4 z-20 flex flex-col gap-1">
          <span className="rounded-md bg-black/40 px-3 py-1.5 font-mono text-sm text-muted-foreground">
            {backend === "webgl2" ? "WebGL2" : backend === "canvas2d" ? "Canvas2D" : "…"}
          </span>
          <span className="rounded-md bg-black/40 px-3 py-1.5 font-mono text-sm text-muted-foreground">
            heading {headingLabel}
            {fieldRef.current.ghost ? " · drifting" : ""}
          </span>
        </div>
      )}

      {/* design notes link */}
      <a
        href="/dream/744-magnetic-walk/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes ↗
      </a>

      {/* intro overlay / Start */}
      {!started && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Magnetic Walk
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            The invisible field around you, made audible. Your phone&apos;s compass and
            tilt voice a slowly-shifting drone and a field of light locked to magnetic
            north — turn your body, and the music turns with the world.
          </p>
          <button
            onClick={handleStart}
            className="rounded-full bg-muted px-8 py-4 text-xl font-medium text-foreground ring-1 ring-border transition hover:bg-accent active:scale-95"
            style={{ minHeight: 64 }}
          >
            Start the walk
          </button>
          <p className="max-w-md font-mono text-base text-muted-foreground">
            Allow motion access when asked. No live compass? It drifts on its own.
          </p>
        </div>
      )}

      {/* sensor notice (degraded / ghost mode) */}
      {started && sensorMsg && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 px-4">
          <p className="rounded-lg bg-black/50 px-4 py-2.5 text-center font-mono text-base text-violet-300">
            {sensorMsg}
          </p>
        </div>
      )}

      {/* gentle instruction once running */}
      {started && !sensorMsg && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 px-4">
          <p className="rounded-lg bg-black/40 px-4 py-2.5 text-center font-mono text-base text-muted-foreground">
            Turn slowly. Tilt to open the field. Listen.
          </p>
        </div>
      )}
    </main>
  );
}
