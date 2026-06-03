"use client";

/**
 * 285-mosaic-listener — corpus-based concatenative synthesis / audio mosaicing.
 *
 * The lab's first concatenative-synthesis piece. A recording (Karel's real
 * Welcome Home piano, or a procedural piano corpus) is sliced into hundreds of
 * tiny grains; each grain is tagged with three audio descriptors — loudness
 * (RMS), brightness (spectral centroid) and a rough pitch (autocorrelation) —
 * and laid out as a navigable 2D "atlas" in descriptor space. You then drag a
 * cursor through that cloud (or hum into the mic, or let it auto-drift) and the
 * engine continuously plays whichever grains sit nearest your target — so the
 * music is endlessly re-assembled out of shards of the original recording, and
 * never replays what was literally recorded.
 *
 * Refs: Diemo Schwarz — CataRT (interactive corpus-based concatenative
 * synthesis, IRCAM); "The Concatenator" (arXiv 2411.04366, 2024); Lee &
 * Pasquier — "Musical Agent Systems: MACAT and MACataRT" (arXiv 2502.00023,
 * 2025); FluCoMa (live audio mosaicing on the web). See README.
 *
 * No API route created; this only READS the existing /api/audio/:id (no side
 * effects), otherwise fully client-side. Mic is analysis-only — never routed to
 * destination, never recorded. Matte WebGL2 (no additive blending / no glow).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Grain = { start: number; dur: number; x: number; y: number; hue: number };

const GRAIN_MS = 165; // grain length
const MAX_GRAINS = 620; // corpus cap
const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/285-mosaic-listener/README.md";

// ---- pure helpers (named non-`use*` so eslint doesn't treat them as hooks) ----

// cheap zero-crossing pitch estimate (Hz) — used only to pick a grain's hue
function zcrHz(buf: Float32Array, off: number, len: number, sr: number): number {
  let crossings = 0;
  let prev = buf[off] || 0;
  for (let i = 1; i < len; i++) {
    const s = buf[off + i] || 0;
    if ((prev <= 0 && s > 0) || (prev >= 0 && s < 0)) crossings++;
    prev = s;
  }
  if (crossings < 2) return 0;
  return (crossings * sr) / (2 * len);
}

// spectral centroid (Hz) of a Hann-windowed slice via a small naive DFT
function centroidHz(buf: Float32Array, off: number, len: number, sr: number): number {
  const N = 256;
  const step = Math.max(1, Math.floor(len / N));
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let acc = 0;
  for (let n = 0; n < N; n++) {
    const idx = off + n * step;
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
    re[n] = (buf[idx] || 0) * w;
    im[n] = 0;
    acc += Math.abs(re[n]);
  }
  if (acc < 1e-6) return 0;
  let num = 0;
  let den = 0;
  const half = N / 2;
  for (let k = 1; k < half; k++) {
    let sr2 = 0;
    let si = 0;
    for (let n = 0; n < N; n++) {
      const a = (-2 * Math.PI * k * n) / N;
      sr2 += re[n] * Math.cos(a);
      si += re[n] * Math.sin(a);
    }
    const mag = Math.hypot(sr2, si);
    const f = (k * sr) / N;
    num += f * mag;
    den += mag;
  }
  return den > 1e-6 ? num / den : 0;
}

// pitch-class -> hue (spread across the wheel), or brightness fallback
function grainHue(hz: number, bright01: number): number {
  if (hz > 0 && hz < 4000) {
    const midi = 69 + 12 * Math.log2(hz / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return (pc / 12) * 320 + 20; // spread across the wheel
  }
  return 200 + bright01 * 120; // teal→violet by brightness when unpitched
}

// slice + analyze a mono buffer into descriptor-tagged grains
function analyzeBuffer(data: Float32Array, sr: number): Grain[] {
  const len = Math.floor((GRAIN_MS / 1000) * sr);
  // bound the number of windows on long (multi-minute) tracks so analysis stays fast
  const hop = Math.max(Math.floor(len * 0.6), Math.floor(data.length / (MAX_GRAINS * 2.2)));
  const raw: { c: number; r: number; hz: number; start: number; dur: number }[] = [];
  let rMax = 1e-6;
  let cMin = Infinity;
  let cMax = 1e-6;
  for (let off = 0; off + len < data.length; off += hop) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const s = data[off + i] || 0;
      sum += s * s;
    }
    const r = Math.sqrt(sum / len);
    if (r < 0.012) continue; // skip near-silence
    const c = centroidHz(data, off, len, sr);
    const hz = zcrHz(data, off, len, sr);
    raw.push({ c, r, hz, start: off / sr, dur: GRAIN_MS / 1000 });
    if (r > rMax) rMax = r;
    if (c > 0 && c < cMin) cMin = c;
    if (c > cMax) cMax = c;
  }
  if (raw.length === 0 || !isFinite(cMin)) return [];
  // normalize to [0,1]; subsample if over the cap
  const stride = raw.length > MAX_GRAINS ? raw.length / MAX_GRAINS : 1;
  const out: Grain[] = [];
  const lc = Math.log2(Math.max(cMin, 40));
  const hc = Math.log2(Math.max(cMax, cMin * 1.1));
  for (let i = 0; i < raw.length; i += stride) {
    const g = raw[Math.floor(i)];
    const bright = Math.max(0, Math.min(1, (Math.log2(Math.max(g.c, 40)) - lc) / (hc - lc || 1)));
    const loud = Math.max(0, Math.min(1, Math.sqrt(g.r / rMax)));
    out.push({ start: g.start, dur: g.dur, x: bright, y: loud, hue: grainHue(g.hz, bright) });
  }
  return out;
}

// build a ~16s procedural "piano" corpus buffer (instant, no network)
function buildSynthCorpus(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 16;
  const buf = ctx.createBuffer(1, Math.floor(dur * sr), sr);
  const d = buf.getChannelData(0);
  // C natural-minor-ish wide spread so grains scatter across pitch + brightness
  const scale = [130.81, 146.83, 174.61, 196.0, 233.08, 261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25];
  const notes = 46;
  for (let n = 0; n < notes; n++) {
    const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
    const t0 = Math.random() * (dur - 1.6);
    const i0 = Math.floor(t0 * sr);
    const noteLen = Math.floor((0.5 + Math.random() * 1.0) * sr);
    const amp = 0.18 + Math.random() * 0.22;
    const bright = 0.4 + Math.random() * 0.6; // controls upper-partial weight
    for (let i = 0; i < noteLen && i0 + i < d.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * (2.2 + Math.random() * 0.4)) * (1 - Math.exp(-t * 220));
      const ph = 2 * Math.PI * f * t;
      let s = Math.sin(ph);
      s += 0.5 * bright * Math.sin(2 * ph);
      s += 0.28 * bright * Math.sin(3 * ph);
      s += 0.14 * bright * bright * Math.sin(5 * ph);
      d[i0 + i] += amp * env * s;
    }
  }
  // soft clip
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.2);
  return buf;
}

const VERT = `#version 300 es
in vec2 a_pos;       // [0,1] descriptor space
in float a_hue;      // degrees
in float a_size;     // base point size px
in float a_act;      // 0..1 recency activation
uniform float u_aspect;
uniform float u_dpr;
out float v_hue;
out float v_act;
void main() {
  vec2 p = a_pos * 1.78 - 0.89;        // fill with margin
  p.x /= max(u_aspect, 0.0001);
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = a_size * (1.0 + a_act * 2.4) * u_dpr;
  v_hue = a_hue;
  v_act = a_act;
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_hue;
in float v_act;
uniform float u_isCursor;
out vec4 outColor;
vec3 hsv2rgb(float h, float s, float v) {
  h = mod(h, 360.0) / 60.0;
  float c = v * s;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  vec3 r;
  if (h < 1.0) r = vec3(c, x, 0.0);
  else if (h < 2.0) r = vec3(x, c, 0.0);
  else if (h < 3.0) r = vec3(0.0, c, x);
  else if (h < 4.0) r = vec3(0.0, x, c);
  else if (h < 5.0) r = vec3(x, 0.0, c);
  else r = vec3(c, 0.0, x);
  return r + (v - c);
}
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (u_isCursor > 0.5) {
    // matte white ring (the target cursor)
    float ring = smoothstep(0.5, 0.45, d) - smoothstep(0.36, 0.31, d);
    if (ring <= 0.001) discard;
    outColor = vec4(vec3(0.95) * ring, ring);
    return;
  }
  float a = smoothstep(0.5, 0.4, d);
  if (a <= 0.001) discard;
  // matte: low base value, brightens modestly when recently played (no additive)
  vec3 col = hsv2rgb(v_hue, 0.5, 0.30 + v_act * 0.55);
  outColor = vec4(col * a, a);   // premultiplied, normal alpha blend
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function MosaicListener() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<"synth" | "track">("synth");
  const [nav, setNav] = useState<"drift" | "drag" | "mic">("drift");
  const [grainCount, setGrainCount] = useState(0);
  const [status, setStatus] = useState("A procedural piano corpus is loaded. Press begin, then drag across the cloud.");
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState("");
  const [noGL, setNoGL] = useState(false);

  // audio + engine refs (never trigger React renders from the rAF / scheduler)
  const ctxRef = useRef<AudioContext | null>(null);
  const busRef = useRef<GainNode | null>(null);
  const corpusRef = useRef<AudioBuffer | null>(null);
  const grainsRef = useRef<Grain[]>([]);
  const actRef = useRef<Float32Array>(new Float32Array(0));
  const targetRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const navRef = useRef<"drift" | "drag" | "mic">("drift");
  const pointerTsRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const fireQueueRef = useRef<{ i: number; when: number }[]>([]);

  // GL refs
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const grainBufRef = useRef<WebGLBuffer | null>(null);
  const actBufRef = useRef<WebGLBuffer | null>(null);
  const cursorBufRef = useRef<WebGLBuffer | null>(null);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      // voice bus -> lowpass -> reverb wash -> limiter -> out
      const bus = ctx.createGain();
      bus.gain.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      const dry = ctx.createGain();
      dry.gain.value = 0.78;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.19;
      const fb = ctx.createGain();
      fb.gain.value = 0.36;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.ratio.value = 12;
      bus.connect(lp);
      lp.connect(dry);
      lp.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      dry.connect(limiter);
      wet.connect(limiter);
      limiter.connect(ctx.destination);
      busRef.current = bus;
      ctxRef.current = ctx;
      return ctx;
    } catch (e) {
      console.warn(e);
      return null;
    }
  }, []);

  const loadGrains = useCallback((grains: Grain[]) => {
    grainsRef.current = grains;
    actRef.current = new Float32Array(grains.length);
    setGrainCount(grains.length);
    const gl = glRef.current;
    const prog = progRef.current;
    if (!gl || !prog) return;
    const data = new Float32Array(grains.length * 4);
    for (let i = 0; i < grains.length; i++) {
      data[i * 4] = grains[i].x;
      data[i * 4 + 1] = grains[i].y;
      data[i * 4 + 2] = grains[i].hue;
      data[i * 4 + 3] = 6.5; // base size px
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, grainBufRef.current);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, actBufRef.current);
    gl.bufferData(gl.ARRAY_BUFFER, actRef.current, gl.DYNAMIC_DRAW);
  }, []);

  // ---- WebGL setup (once) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) {
      setNoGL(true);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setNoGL(true);
      return;
    }
    const prog = gl.createProgram();
    if (!prog) {
      setNoGL(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog));
      setNoGL(true);
      return;
    }
    gl.useProgram(prog);
    glRef.current = gl;
    progRef.current = prog;
    grainBufRef.current = gl.createBuffer();
    actBufRef.current = gl.createBuffer();
    cursorBufRef.current = gl.createBuffer();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // matte (premultiplied, NOT additive)

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    const aHue = gl.getAttribLocation(prog, "a_hue");
    const aSize = gl.getAttribLocation(prog, "a_size");
    const aAct = gl.getAttribLocation(prog, "a_act");
    const uAspect = gl.getUniformLocation(prog, "u_aspect");
    const uDpr = gl.getUniformLocation(prog, "u_dpr");
    const uIsCursor = gl.getUniformLocation(prog, "u_isCursor");

    const start = performance.now();
    const render = () => {
      raf = requestAnimationFrame(render);
      const grains = grainsRef.current;
      const act = actRef.current;
      const ctx = ctxRef.current;
      const t = (performance.now() - start) / 1000;

      // resolve the live target from the active navigation mode
      const mode = navRef.current;
      let tgt = targetRef.current;
      const idle = performance.now() - pointerTsRef.current > 2200;
      if (mode === "mic" && micAnalyserRef.current) {
        const an = micAnalyserRef.current;
        const bins = an.frequencyBinCount;
        const freq = new Uint8Array(bins);
        an.getByteFrequencyData(freq);
        let num = 0;
        let den = 0;
        for (let k = 1; k < bins; k++) {
          num += k * freq[k];
          den += freq[k];
        }
        const bright = den > 4 ? Math.min(1, num / den / (bins * 0.45)) : 0.5;
        const loud = Math.min(1, den / (bins * 90));
        tgt = { x: bright, y: loud };
        targetRef.current = tgt;
      } else if (mode === "drift" || idle) {
        tgt = { x: 0.5 + 0.4 * Math.sin(t * 0.13), y: 0.5 + 0.34 * Math.sin(t * 0.21 + 1.1) };
        targetRef.current = tgt;
      }

      // process fired grains -> activation
      if (ctx) {
        const now = ctx.currentTime;
        const q = fireQueueRef.current;
        while (q.length && q[0].when <= now) {
          const f = q.shift();
          if (f && f.i < act.length) act[f.i] = 1;
        }
      }
      // decay + push trail
      for (let i = 0; i < act.length; i++) act[i] *= 0.93;
      const trail = trailRef.current;
      trail.push({ x: tgt.x, y: tgt.y });
      if (trail.length > 48) trail.shift();

      // ---- draw ----
      gl.clearColor(0.035, 0.035, 0.055, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const aspect = canvas.width / Math.max(1, canvas.height);
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uDpr, Math.min(window.devicePixelRatio || 1, 2));

      if (grains.length > 0) {
        // refresh activation attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, actBufRef.current);
        gl.bufferData(gl.ARRAY_BUFFER, act, gl.DYNAMIC_DRAW);

        gl.uniform1f(uIsCursor, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, grainBufRef.current);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aHue);
        gl.vertexAttribPointer(aHue, 1, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(aSize);
        gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 16, 12);
        gl.bindBuffer(gl.ARRAY_BUFFER, actBufRef.current);
        gl.enableVertexAttribArray(aAct);
        gl.vertexAttribPointer(aAct, 1, gl.FLOAT, false, 4, 0);
        gl.drawArrays(gl.POINTS, 0, grains.length);
      }

      // trail + cursor (one buffer, drawn as cursor ring)
      const cn = trail.length;
      const cbuf = new Float32Array(cn * 4);
      for (let i = 0; i < cn; i++) {
        cbuf[i * 4] = trail[i].x;
        cbuf[i * 4 + 1] = trail[i].y;
        cbuf[i * 4 + 2] = 0;
        cbuf[i * 4 + 3] = 4 + (i / cn) * 16; // grows toward the head
      }
      gl.uniform1f(uIsCursor, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, cursorBufRef.current);
      gl.bufferData(gl.ARRAY_BUFFER, cbuf, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.disableVertexAttribArray(aHue);
      gl.vertexAttrib1f(aHue, 0);
      gl.enableVertexAttribArray(aSize);
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 16, 12);
      gl.disableVertexAttribArray(aAct);
      gl.vertexAttrib1f(aAct, 0);
      gl.drawArrays(gl.POINTS, 0, cn);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ---- pointer navigation ----
  const onPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // invert the vertex-shader mapping (a_pos*1.78 - 0.89, x/=aspect) approximately:
    const px = (e.clientX - r.left) / r.width; // 0..1 across canvas
    const py = (e.clientY - r.top) / r.height; // 0..1 top->bottom
    const aspect = r.width / Math.max(1, r.height);
    // screen-x in [-1,1] -> p.x -> a_pos.x
    const nx = (px * 2 - 1) * aspect;
    const x = (nx + 0.89) / 1.78;
    const ny = -(py * 2 - 1); // flip so up = +1
    const y = (ny + 0.89) / 1.78;
    targetRef.current = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    pointerTsRef.current = performance.now();
    if (navRef.current !== "mic") {
      navRef.current = "drag";
      setNav("drag");
    }
  }, []);

  // ---- grain scheduler (Chris Wilson look-ahead) ----
  useEffect(() => {
    if (!started) return;
    let timer = 0;
    let nextTime = 0;
    const schedule = () => {
      const ctx = ctxRef.current;
      const bus = busRef.current;
      const corpus = corpusRef.current;
      const grains = grainsRef.current;
      if (!ctx || !bus || !corpus || grains.length === 0) return;
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
      const aheadTo = ctx.currentTime + 0.12;
      while (nextTime < aheadTo) {
        const tgt = targetRef.current;
        // k-nearest in descriptor space, pick one at random among them (organic)
        const best: number[] = [];
        const bestD: number[] = [];
        for (let i = 0; i < grains.length; i++) {
          const dx = grains[i].x - tgt.x;
          const dy = grains[i].y - tgt.y;
          const dd = dx * dx + dy * dy;
          if (best.length < 6) {
            best.push(i);
            bestD.push(dd);
          } else {
            let wi = 0;
            for (let j = 1; j < 6; j++) if (bestD[j] > bestD[wi]) wi = j;
            if (dd < bestD[wi]) {
              best[wi] = i;
              bestD[wi] = dd;
            }
          }
        }
        if (best.length) {
          const gi = best[(Math.random() * best.length) | 0];
          const g = grains[gi];
          const src = ctx.createBufferSource();
          src.buffer = corpus;
          src.playbackRate.value = 0.98 + Math.random() * 0.04;
          const gain = ctx.createGain();
          const a = 0.012;
          const rel = 0.06;
          const total = g.dur;
          gain.gain.setValueAtTime(0.0001, nextTime);
          gain.gain.linearRampToValueAtTime(0.5 + g.y * 0.4, nextTime + a);
          gain.gain.setValueAtTime(0.5 + g.y * 0.4, nextTime + Math.max(a, total - rel));
          gain.gain.linearRampToValueAtTime(0.0001, nextTime + total);
          src.connect(gain);
          gain.connect(bus);
          try {
            src.start(nextTime, g.start, total + 0.03);
            src.stop(nextTime + total + 0.05);
          } catch {
            /* invalid offset on a swapped corpus — skip this grain */
          }
          fireQueueRef.current.push({ i: gi, when: nextTime });
        }
        nextTime += (GRAIN_MS / 1000) * (0.7 + Math.random() * 0.5); // ~6–9 grains/sec
      }
    };
    timer = window.setInterval(schedule, 25);
    return () => window.clearInterval(timer);
  }, [started]);

  const handleBegin = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    if (ctx.state === "suspended") await ctx.resume();
    if (!corpusRef.current) {
      const buf = buildSynthCorpus(ctx);
      corpusRef.current = buf;
      loadGrains(analyzeBuffer(buf.getChannelData(0), buf.sampleRate));
    }
    setStarted(true);
    setStatus("Playing the procedural piano corpus — drag across the cloud to choose grains.");
  }, [ensureCtx, loadGrains]);

  const handleTrack = useCallback(async () => {
    const id = trackId.trim();
    if (!id) {
      setError("Enter one of Karel's track IDs first.");
      return;
    }
    setError(null);
    setStatus(`Fetching & slicing track ${id}…`);
    try {
      const ctx = ensureCtx();
      if (!ctx) throw new Error("no audio");
      if (ctx.state === "suspended") await ctx.resume();
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      let bytes: ArrayBuffer;
      if (ct.includes("application/json")) {
        const json = (await res.json()) as { url?: string };
        if (!json.url) throw new Error("no url");
        const ar = await fetch(json.url);
        if (!ar.ok) throw new Error(`audio HTTP ${ar.status}`);
        bytes = await ar.arrayBuffer();
      } else {
        bytes = await res.arrayBuffer();
      }
      const decoded = await ctx.decodeAudioData(bytes);
      corpusRef.current = decoded;
      const grains = analyzeBuffer(decoded.getChannelData(0), decoded.sampleRate);
      if (grains.length < 8) throw new Error("too few grains");
      loadGrains(grains);
      setSource("track");
      if (!started) setStarted(true);
      setStatus(`Corpus is now track ${id} — ${grains.length} grains of Karel's piano.`);
    } catch (e) {
      setError(`Couldn't load track "${id}" — the procedural corpus keeps playing.`);
      setStatus("Track load failed — procedural corpus running.");
      console.warn(e);
    }
  }, [trackId, ensureCtx, loadGrains, started]);

  const toggleMic = useCallback(async () => {
    if (navRef.current === "mic") {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micAnalyserRef.current = null;
      navRef.current = "drift";
      setNav("drift");
      return;
    }
    try {
      const ctx = ensureCtx();
      if (!ctx) throw new Error("no audio");
      if (ctx.state === "suspended") await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const srcNode = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      srcNode.connect(an); // analysis only — never connected to destination
      micAnalyserRef.current = an;
      navRef.current = "mic";
      setNav("mic");
      setError(null);
      if (!started) await handleBegin();
    } catch (e) {
      setError("Mic blocked — drag the cloud or let it drift instead.");
      console.warn(e);
    }
  }, [ensureCtx, started, handleBegin]);

  // teardown
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#07070b] text-white overflow-hidden relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointer}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === "touch") onPointer(e);
        }}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: "crosshair" }}
      />

      {/* axis hints */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/55 tracking-wide">
        brightness →
      </div>
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-white/55 tracking-wide">
        loudness →
      </div>

      {/* header / controls */}
      <div className="relative z-10 max-w-2xl p-5 sm:p-7">
        <h1 className="font-serif text-3xl sm:text-4xl text-white/95 leading-tight">
          Mosaic Listener
        </h1>
        <p className="mt-2 text-base text-white/80 max-w-xl">
          A recording is shattered into hundreds of tiny grains and laid out by{" "}
          <span className="text-violet-300">brightness</span> and{" "}
          <span className="text-violet-300">loudness</span>. Drag across the cloud
          and the piece is endlessly re-assembled out of whichever grains sit
          nearest your finger — music made of shards, never the original.
        </p>

        {!started ? (
          <button
            onClick={handleBegin}
            className="mt-5 min-h-[44px] rounded-lg bg-violet-500/90 px-5 py-2.5 text-base font-medium text-white hover:bg-violet-400 transition-colors"
          >
            Begin
          </button>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                navRef.current = "drift";
                setNav("drift");
              }}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base transition-colors ${
                nav === "drift" ? "bg-violet-500/90 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              Auto-drift
            </button>
            <button
              onClick={() => {
                if (navRef.current === "mic") toggleMic();
                navRef.current = "drag";
                setNav("drag");
              }}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base transition-colors ${
                nav === "drag" ? "bg-violet-500/90 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              Drag to play
            </button>
            <button
              onClick={toggleMic}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base transition-colors ${
                nav === "mic" ? "bg-emerald-500/80 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              {nav === "mic" ? "Mic on" : "Hum into mic"}
            </button>
          </div>
        )}

        {started && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              placeholder="Welcome Home track ID"
              className="min-h-[44px] w-48 rounded-lg bg-white/10 px-3 py-2.5 text-base text-white placeholder:text-white/40 outline-none focus:bg-white/15"
            />
            <button
              onClick={handleTrack}
              className="min-h-[44px] rounded-lg bg-white/10 px-4 py-2.5 text-base text-white/85 hover:bg-white/15 transition-colors"
            >
              Use Karel&apos;s piano as the corpus
            </button>
          </div>
        )}

        <p className="mt-3 text-sm text-white/75 max-w-xl">{status}</p>
        {error && <p className="mt-1 text-sm text-rose-300">{error}</p>}
        {noGL && (
          <p className="mt-1 text-sm text-rose-300">
            WebGL2 unavailable — the audio mosaic still plays, but the atlas can&apos;t render.
          </p>
        )}
        {started && (
          <p className="mt-2 text-xs text-white/55">
            {grainCount} grains · corpus: {source === "track" ? "Karel's piano" : "procedural piano"}
          </p>
        )}
      </div>

      <Link
        href={README_URL}
        target="_blank"
        className="absolute bottom-3 right-4 z-10 text-xs text-white/55 hover:text-white/80 transition-colors"
      >
        Read the design notes →
      </Link>
    </main>
  );
}
