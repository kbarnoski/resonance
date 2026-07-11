"use client";

// ── Body Glow ────────────────────────────────────────────────────────────────
// "What if a 4-year-old's whole moving silhouette PAINTED a glowing UPIC score
//  in the air — the higher a part of their body, the higher the note it sings,
//  and their motion leaves luminous light-trails that keep singing?"
//
// The literal full-body version of Xenakis's UPIC (1977): the drawing tool is
// the child's whole dancing body. Front camera → MediaPipe Pose (33 landmarks).
// Tracked parts (wrists/head/ankles…) each drive ONE continuous SUNG voice.
// Vertical position = continuous pitch, glided to C-major pentatonic (never
// wrong) via setTargetAtTime — portamento, not retriggered steps.
//
// OUTPUT : raw WebGL2 additive glow field + ping-pong feedback trails. Motion
//          fills the warm daylight sky with the accumulating UPIC score. A small
//          Canvas2D glow field is the no-WebGL2 fallback (same body→sound map).
// VIBE   : dreamy, painterly, luminous, warm daylight, calm middle register.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createLandmarker,
  bodyFromLandmarks,
  makeGhostBody,
  LM,
  type Body,
  type Pt,
  type PoseLandmarkerInst,
} from "./pose";

type Phase = "idle" | "running";

// ── Voices ────────────────────────────────────────────────────────────────────
// Each tracked body part becomes ONE continuous sung voice. Warm colors map to
// the painterly glow seeded at that part. Height → pitch; brighter colors for
// the higher / lead voices, deeper warm tones for the low voices.
interface VoiceSpec {
  lm: number;
  rgb: [number, number, number]; // warm daylight palette, 0..1
  base: number; // base gain weight for this voice
}
const VOICES: VoiceSpec[] = [
  { lm: LM.leftWrist, rgb: [1.0, 0.78, 0.42], base: 1.0 }, // warm gold
  { lm: LM.rightWrist, rgb: [1.0, 0.6, 0.5], base: 1.0 }, // coral
  { lm: LM.nose, rgb: [1.0, 0.92, 0.72], base: 0.85 }, // bright cream (lead)
  { lm: LM.leftAnkle, rgb: [0.7, 0.85, 1.0], base: 0.7 }, // soft sky
  { lm: LM.rightAnkle, rgb: [0.78, 0.7, 1.0], base: 0.7 }, // lavender
  { lm: LM.leftElbow, rgb: [1.0, 0.82, 0.55], base: 0.6 }, // amber
  { lm: LM.rightElbow, rgb: [0.95, 0.72, 0.62], base: 0.6 }, // rose
];

// ── C-major pentatonic, C3..A5 — height glides continuously across this scale ──
// Never a wrong note: continuous y is mapped to a fractional scale-degree and
// the resulting frequency is glided with setTargetAtTime (portamento).
const PENTA = [0, 2, 4, 7, 9]; // C D E G A
const MIDI_LOW = 48; // C3
const MIDI_HIGH = 81; // A5
function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
// Map a continuous y in [-1,1] to a continuous frequency snapped *smoothly*
// onto the pentatonic lattice. We interpolate within the lattice so motion
// glides, but every landing point is a real pentatonic note.
function yToPentaFreq(y: number): number {
  const t = Math.min(1, Math.max(0, (y + 1) / 2)); // 0 bottom .. 1 top
  // Build the pentatonic ladder of MIDI notes across the range.
  const notes: number[] = [];
  for (let oct = 0; oct < 6; oct++) {
    for (const p of PENTA) {
      const m = MIDI_LOW + oct * 12 + p - (MIDI_LOW % 12);
      if (m >= MIDI_LOW && m <= MIDI_HIGH) notes.push(m);
    }
  }
  notes.sort((a, b) => a - b);
  const fpos = t * (notes.length - 1);
  const i = Math.floor(fpos);
  const frac = fpos - i;
  const a = notes[i];
  const b = notes[Math.min(notes.length - 1, i + 1)];
  // Glide in frequency space between adjacent pentatonic notes.
  return midiToFreq(a) * Math.pow(midiToFreq(b) / midiToFreq(a), frac);
}

// ── WebGL2 sources ─────────────────────────────────────────────────────────────
// Pass A: draw thousands of additive point sprites seeded at limb positions into
// an accumulation FBO, blended over the previous (decayed) frame → trails.
// Pass B: present the accumulation texture over a daylight→dusk gradient.

const GLOW_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_seed;   // per-point random seed (-1..1)
uniform vec2 u_pos;                  // limb position in clip space (-1..1)
uniform float u_size;                // base sprite size
uniform float u_spread;             // cloud radius around the limb
out float v_fade;
// cheap hash
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 off = a_seed * u_spread;
  // pull points into a soft gaussian-ish cloud
  off *= (0.4 + 0.6 * h(a_seed));
  vec2 p = u_pos + off;
  gl_Position = vec4(p, 0.0, 1.0);
  float d = length(a_seed);
  v_fade = clamp(1.0 - d, 0.0, 1.0);
  gl_PointSize = u_size * (0.5 + v_fade);
}`;

const GLOW_FRAG = `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_intensity;
in float v_fade;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float g = exp(-r * r * 9.0);      // soft round glow
  float a = g * v_fade * u_intensity;
  o = vec4(u_color * a, a);
}`;

// Fade/feedback pass: copy previous accumulation, multiplied by decay.
const FADE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_p;
out vec2 v_uv;
void main(){ v_uv = a_p * 0.5 + 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_decay;
in vec2 v_uv;
out vec4 o;
void main(){
  vec4 c = texture(u_tex, v_uv);
  o = c * u_decay;                  // gentle exponential fade → never whites out
}`;

// Present pass: daylight→dusk gradient base + additive glow accumulation + bloom.
const PRESENT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_time;
uniform vec2 u_res;
in vec2 v_uv;
out vec4 o;
void main(){
  // warm daylight that drifts slowly toward dusk (long-form)
  float dusk = 0.5 + 0.5 * sin(u_time * 0.012);  // very slow
  vec3 top = mix(vec3(0.62,0.80,0.98), vec3(0.85,0.62,0.78), dusk);
  vec3 bot = mix(vec3(0.99,0.93,0.80), vec3(0.99,0.82,0.62), dusk);
  vec3 sky = mix(bot, top, v_uv.y);
  // soft glow accumulation (small 5-tap bloom)
  vec2 px = 1.0 / u_res;
  vec3 g = texture(u_tex, v_uv).rgb * 1.2;
  g += texture(u_tex, v_uv + vec2(px.x, 0.0) * 2.0).rgb * 0.5;
  g += texture(u_tex, v_uv - vec2(px.x, 0.0) * 2.0).rgb * 0.5;
  g += texture(u_tex, v_uv + vec2(0.0, px.y) * 2.0).rgb * 0.5;
  g += texture(u_tex, v_uv - vec2(0.0, px.y) * 2.0).rgb * 0.5;
  vec3 col = sky + g;               // additive luminous paint over daylight
  col = col / (col + 0.85);         // gentle tonemap so it never blows out
  o = vec4(col, 1.0);
}`;

const POINTS_PER_LIMB = 900;

// ── helpers (pure, module top) ──────────────────────────────────────────────────
function midpoint(a: Pt | undefined, b: Pt | undefined): Pt | undefined {
  if (!a || !b) return undefined;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v, b.v) };
}

// Build a per-limb seed cloud (random unit-ish disc seeds).
function makeSeeds(n: number): Float32Array {
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    arr[i * 2] = Math.cos(a) * r;
    arr[i * 2 + 1] = Math.sin(a) * r;
  }
  return arr;
}

export default function BodyGlowPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // long-lived handles for teardown
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
    }
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (phase === "running") return;
    setPhase("running");
    setNotice("");

    // ── AUDIO: create + resume inside the user tap (iOS). Kids-safe chain. ──────
    type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    const ctx = new Ctor();
    audioRef.current = ctx;
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.0; // fade in softly (no transient)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    master.connect(lp).connect(comp).connect(ctx.destination);
    master.gain.setTargetAtTime(0.28, ctx.currentTime, 1.2); // gentle swell ≤0.3

    // Always-on warm ambient pad (C2 + G2) — never silent, always pentatonic.
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    padGain.gain.setTargetAtTime(0.18, ctx.currentTime, 2.0);
    const padOscs: OscillatorNode[] = [];
    [midiToFreq(36), midiToFreq(43)].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.7 : 0.5;
      // slow chorus shimmer
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.03;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.6;
      lfo.connect(lfoG).connect(o.detune);
      o.connect(og).connect(padGain);
      o.start();
      lfo.start();
      padOscs.push(o, lfo);
    });

    // Per-voice continuous sung oscillators.
    interface Voice {
      osc: OscillatorNode;
      gain: GainNode;
      vib: OscillatorNode;
    }
    const voices: Voice[] = VOICES.map(() => {
      const osc = ctx.createOscillator();
      osc.type = "triangle"; // soft, vocal, warm
      osc.frequency.value = midiToFreq(60);
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      // gentle vibrato for a sung quality
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.5;
      const vibG = ctx.createGain();
      vibG.gain.value = 3.5;
      vib.connect(vibG).connect(osc.detune);
      // soften each voice with its own lowpass for a choir-ish blend
      const vlp = ctx.createBiquadFilter();
      vlp.type = "lowpass";
      vlp.frequency.value = 2600;
      osc.connect(gain).connect(vlp).connect(master);
      osc.start();
      vib.start();
      return { osc, gain, vib };
    });

    const stopAudio = () => {
      try {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        voices.forEach((v) => {
          v.osc.stop(ctx.currentTime + 0.6);
          v.vib.stop(ctx.currentTime + 0.6);
        });
        padOscs.forEach((o) => o.stop(ctx.currentTime + 0.6));
      } catch {
        /* ignore */
      }
    };

    // ── RENDERER: try WebGL2, else Canvas2D fallback. ───────────────────────────
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = Math.max(2, w);
        canvas.height = Math.max(2, h);
      }
    };
    resize();

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    // ── Body source: camera+pose, OR ghost-body fallback. ───────────────────────
    let usePose = false;
    let video: HTMLVideoElement | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      const lmk = await createLandmarker();
      landmarkerRef.current = lmk;
      usePose = true;
    } catch {
      setNotice(
        "Dancing for you with a friendly ghost body — let the camera in to dance yourself!",
      );
      usePose = false;
    }

    const startTime = performance.now();

    // Resolve a Body for the current frame (real pose midpoints filled in).
    const lastBodyRef: { body: Body | null } = { body: null };
    const getBody = (tSec: number): Body => {
      if (usePose && video && landmarkerRef.current && video.readyState >= 2) {
        try {
          const res = landmarkerRef.current.detectForVideo(
            video,
            performance.now(),
          );
          if (res.landmarks && res.landmarks.length > 0) {
            const b = bodyFromLandmarks(res.landmarks[0]);
            lastBodyRef.body = b;
            return b;
          }
        } catch {
          /* fall through to last/ghost */
        }
        if (lastBodyRef.body) return lastBodyRef.body;
      }
      return makeGhostBody(tSec);
    };

    // Resolve the point for a voice (with sensible midpoints if needed).
    const voicePoint = (body: Body, lm: number): Pt | undefined => {
      const p = body[lm];
      if (p) return p;
      return undefined;
    };

    // Smoothed positions per voice for buttery audio + visuals.
    const smooth: { x: number; y: number; on: number }[] = VOICES.map(() => ({
      x: 0,
      y: 0,
      on: 0,
    }));

    // Update all audio voices from a Body (continuous portamento glide).
    const updateAudio = (body: Body) => {
      const now = ctx.currentTime;
      VOICES.forEach((spec, i) => {
        let p = voicePoint(body, spec.lm);
        // midpoint fallbacks keep every voice alive
        if (!p && spec.lm === LM.nose)
          p = midpoint(body[LM.leftShoulder], body[LM.rightShoulder]);
        const s = smooth[i];
        const vis = p && p.v > 0.3 ? 1 : 0;
        if (p) {
          s.x += (p.x - s.x) * 0.25;
          s.y += (p.y - s.y) * 0.25;
        }
        s.on += (vis - s.on) * 0.08;
        const freq = yToPentaFreq(s.y);
        // PORTAMENTO: glide pitch, never retrigger steps.
        voices[i].osc.frequency.setTargetAtTime(freq, now, 0.08);
        // gain follows presence + a touch of motion; gentle, soft.
        const g = spec.base * 0.07 * s.on;
        voices[i].gain.gain.setTargetAtTime(g, now, 0.15);
      });
    };

    // ════════ WebGL2 PATH ════════
    if (gl) {
      const compile = (type: number, src: string): WebGLShader => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        return sh;
      };
      const link = (vs: string, fs: string): WebGLProgram => {
        const p = gl.createProgram()!;
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        return p;
      };
      const glowProg = link(GLOW_VERT, GLOW_FRAG);
      const fadeProg = link(FADE_VERT, FADE_FRAG);
      const presentProg = link(FADE_VERT, PRESENT_FRAG);

      // fullscreen quad
      const quad = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );

      // per-limb seed buffer (shared cloud, repositioned by uniform)
      const seeds = makeSeeds(POINTS_PER_LIMB);
      const seedBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
      gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

      // ping-pong float-ish textures (RGBA8 is fine for soft trails)
      let W = canvas.width;
      let H = canvas.height;
      const makeTex = (w: number, h: number): WebGLTexture => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          w,
          h,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      let texA = makeTex(W, H);
      let texB = makeTex(W, H);
      const fbo = gl.createFramebuffer()!;

      const uGlow = {
        pos: gl.getUniformLocation(glowProg, "u_pos"),
        size: gl.getUniformLocation(glowProg, "u_size"),
        spread: gl.getUniformLocation(glowProg, "u_spread"),
        color: gl.getUniformLocation(glowProg, "u_color"),
        intensity: gl.getUniformLocation(glowProg, "u_intensity"),
      };
      const uFade = {
        tex: gl.getUniformLocation(fadeProg, "u_tex"),
        decay: gl.getUniformLocation(fadeProg, "u_decay"),
      };
      const uPresent = {
        tex: gl.getUniformLocation(presentProg, "u_tex"),
        time: gl.getUniformLocation(presentProg, "u_time"),
        res: gl.getUniformLocation(presentProg, "u_res"),
      };

      const bindFsQuad = (prog: WebGLProgram) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        const loc = gl.getAttribLocation(prog, "a_p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      };

      const ensureSize = () => {
        resize();
        if (canvas.width !== W || canvas.height !== H) {
          W = canvas.width;
          H = canvas.height;
          gl.deleteTexture(texA);
          gl.deleteTexture(texB);
          texA = makeTex(W, H);
          texB = makeTex(W, H);
        }
      };

      const frame = () => {
        ensureSize();
        const tSec = (performance.now() - startTime) / 1000;
        const body = getBody(tSec);
        updateAudio(body);

        gl.viewport(0, 0, W, H);

        // 1) FADE previous (texA) into texB with decay → trails persist.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texB,
          0,
        );
        gl.disable(gl.BLEND);
        gl.useProgram(fadeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texA);
        gl.uniform1i(uFade.tex, 0);
        gl.uniform1f(uFade.decay, 0.965); // slow fade → minute 5 fuller than 1
        bindFsQuad(fadeProg);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 2) ADD fresh glow point-clouds at every visible limb (additive).
        gl.useProgram(glowProg);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
        gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
        const sloc = gl.getAttribLocation(glowProg, "a_seed");
        gl.enableVertexAttribArray(sloc);
        gl.vertexAttribPointer(sloc, 2, gl.FLOAT, false, 0, 0);

        VOICES.forEach((spec, i) => {
          let p = voicePoint(body, spec.lm);
          if (!p && spec.lm === LM.nose)
            p = midpoint(body[LM.leftShoulder], body[LM.rightShoulder]);
          if (!p || p.v < 0.3) return;
          const s = smooth[i];
          gl.uniform2f(uGlow.pos, s.x, s.y);
          gl.uniform1f(uGlow.size, 18.0 * dpr);
          gl.uniform1f(uGlow.spread, 0.10);
          gl.uniform3f(uGlow.color, spec.rgb[0], spec.rgb[1], spec.rgb[2]);
          gl.uniform1f(uGlow.intensity, 0.05 * spec.base);
          gl.drawArrays(gl.POINTS, 0, POINTS_PER_LIMB);
        });

        // 3) PRESENT texB over daylight gradient to the screen.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        gl.useProgram(presentProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texB);
        gl.uniform1i(uPresent.tex, 0);
        gl.uniform1f(uPresent.time, tSec);
        gl.uniform2f(uPresent.res, W, H);
        bindFsQuad(presentProg);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // swap ping-pong
        const tmp = texA;
        texA = texB;
        texB = tmp;

        rafRef.current = requestAnimationFrame(frame);
      };

      stopRef.current = () => {
        stopAudio();
        try {
          gl.deleteProgram(glowProg);
          gl.deleteProgram(fadeProg);
          gl.deleteProgram(presentProg);
          gl.deleteBuffer(quad);
          gl.deleteBuffer(seedBuf);
          gl.deleteTexture(texA);
          gl.deleteTexture(texB);
          gl.deleteFramebuffer(fbo);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
          /* ignore */
        }
      };

      rafRef.current = requestAnimationFrame(frame);
      return;
    }

    // ════════ CANVAS2D FALLBACK (no WebGL2) ════════
    setNotice(
      (n: string | null) =>
        n ||
        "Painting in soft mode (no WebGL2 here) — still dancing and singing!",
    );
    const c2d = canvas.getContext("2d");
    if (!c2d) {
      setNotice("This device can't paint the sky, but the choir still sings.");
      // still keep audio alive in a minimal loop
      const audioOnly = () => {
        const tSec = (performance.now() - startTime) / 1000;
        updateAudio(getBody(tSec));
        rafRef.current = requestAnimationFrame(audioOnly);
      };
      stopRef.current = stopAudio;
      rafRef.current = requestAnimationFrame(audioOnly);
      return;
    }

    const frame2d = () => {
      resize();
      const W = canvas.width;
      const H = canvas.height;
      const tSec = (performance.now() - startTime) / 1000;
      const body = getBody(tSec);
      updateAudio(body);

      // gentle decay of previous frame → trails (kid-warm, never white-out)
      c2d.globalCompositeOperation = "source-over";
      const dusk = 0.5 + 0.5 * Math.sin(tSec * 0.012);
      const grad = c2d.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `rgba(${158 + dusk * 60},${204 - dusk * 50},${250 - dusk * 40},0.06)`);
      grad.addColorStop(1, `rgba(252,${237 - dusk * 30},${204 - dusk * 40},0.06)`);
      c2d.fillStyle = grad;
      c2d.fillRect(0, 0, W, H);

      // additive luminous blobs at each limb
      c2d.globalCompositeOperation = "lighter";
      VOICES.forEach((spec, i) => {
        let p = voicePoint(body, spec.lm);
        if (!p && spec.lm === LM.nose)
          p = midpoint(body[LM.leftShoulder], body[LM.rightShoulder]);
        if (!p || p.v < 0.3) return;
        const s = smooth[i];
        const px = (s.x * 0.5 + 0.5) * W;
        const py = (1 - (s.y * 0.5 + 0.5)) * H;
        const rad = 70 * dpr * spec.base;
        const g = c2d.createRadialGradient(px, py, 0, px, py, rad);
        const [r, gg, b] = spec.rgb;
        g.addColorStop(0, `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0},0.55)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.arc(px, py, rad, 0, Math.PI * 2);
        c2d.fill();
      });

      rafRef.current = requestAnimationFrame(frame2d);
    };

    // paint an initial daylight wash so it's never a black screen
    c2d.fillStyle = "#dfeeff";
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    stopRef.current = stopAudio;
    rafRef.current = requestAnimationFrame(frame2d);
  }, [phase]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#dfeeff] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* analysis-only camera; never recorded or transmitted */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {phase === "idle" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-violet-300/70 via-violet-100/40 to-violet-200/60 px-6 text-center backdrop-blur-sm">
          <h1 className="text-4xl font-bold text-foreground drop-shadow sm:text-5xl">
            Body Glow
          </h1>
          <p className="max-w-md text-base text-foreground sm:text-xl">
            Dance, and your whole body paints a glowing song in the sky. Reach up
            high for high notes, low for low ones!
          </p>
          <button
            onClick={() => void start()}
            className="min-h-[64px] rounded-full bg-muted px-12 py-5 text-2xl font-bold text-violet-700 shadow-lg transition hover:scale-105 hover:bg-card active:scale-95"
          >
            Start dancing
          </button>
          <Link
            href="#design-notes"
            className="text-base text-muted-foreground underline-offset-4 hover:underline"
          >
            design notes
          </Link>
        </div>
      )}

      {phase === "running" && notice && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-black/30 px-5 py-2 text-base text-violet-300 backdrop-blur">
          {notice}
        </div>
      )}

      {/* tiny corner design-notes link, always present while running */}
      {phase === "running" && (
        <div
          id="design-notes"
          className="absolute bottom-3 right-4 z-10 text-base text-muted-foreground"
        >
          <span className="rounded bg-black/20 px-2 py-1 backdrop-blur">
            UPIC for whole bodies · height = pitch
          </span>
        </div>
      )}
    </main>
  );
}
