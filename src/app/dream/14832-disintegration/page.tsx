"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

/* ------------------------------------------------------------------ *
 * 14832 — Disintegration
 * One of Karel's recordings is left to loop and slowly wear itself
 * away. A single evolving erosion state e ∈ [0,1] climbs over a
 * user-set "Evolve" duration; as it rises the loop loses its top end
 * (a lowpass creeps 16 kHz → 800 Hz), loses material (amplitude
 * thinning / sag), gains wow & flutter (a slow detune wobble that
 * widens), and a filtered-noise room-tone bed surfaces from beneath
 * the receding signal. The piece is audibly different at minute five
 * than at minute one. A raw WebGL2 ping-pong feedback texture renders
 * the sound as a decaying silver-gelatin emulsion: grain accumulates,
 * the frame thins toward black, silver flecks bloom and die. Press and
 * hold on the frame to abrade — to speed the wear where you touch.
 * After William Basinski, "The Disintegration Loops" (2002).
 * ------------------------------------------------------------------ */

type Phase = "idle" | "running";
type LoadState = "none" | "loading" | "ready" | "error";

interface ErosionAudio {
  /** Push the current erosion state + wall-clock time into the graph. */
  step(t: number, e: number): void;
  dispose(): void;
}

interface EmulsionRenderer {
  resize(w: number, h: number): void;
  render(s: {
    time: number;
    frame: number;
    erosion: number;
    rms: number;
    tilt: number;
    pointer: [number, number, number];
  }): void;
  clear(): void;
  dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO — one looping real take, degraded through a chain that deepens with e.
//   src → lowpass → thinning-gain → dry → master
//   src → lowpass → convolver(room-tone IR) → wet → master   (surfaces as e↑)
//   noise-bed → bandpass → hiss-gain → master                (very low, rises)
// Wow/flutter is driven from the render loop onto src.detune — no oscillators.
// ─────────────────────────────────────────────────────────────────────────────
function makeErosionAudio(
  ctx: AudioContext,
  buffer: AudioBuffer,
  master: SafeMaster,
): ErosionAudio {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  // The top wears off first: a lowpass that creeps down as e climbs.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 16000;
  lp.Q.value = 0.707;

  // Amplitude thinning — the loop "loses material" as it sags.
  const thin = ctx.createGain();
  thin.gain.value = 1;

  const dry = ctx.createGain();
  dry.gain.value = 0.92;

  src.connect(lp);
  lp.connect(thin);
  thin.connect(dry);
  dry.connect(master.input);

  // Room-tone bed: a decaying-noise impulse response. As the signal recedes,
  // its wetness rises so the room surfaces from beneath the recording.
  const irLen = Math.floor(ctx.sampleRate * 3.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const tt = i / ctx.sampleRate;
      const env = tt < 0.02 ? tt / 0.02 : Math.exp(-tt * 1.9);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.04;
  const wet = ctx.createGain();
  wet.gain.value = 0.04;
  lp.connect(pre);
  pre.connect(conv);
  conv.connect(wet);
  wet.connect(master.input);

  // A very-low filtered-noise hiss bed (roomtone floor) that lifts with e.
  const noiseLen = Math.floor(ctx.sampleRate * 2);
  const nbuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = nbuf;
  noise.loop = true;
  const nbp = ctx.createBiquadFilter();
  nbp.type = "bandpass";
  nbp.frequency.value = 2600;
  nbp.Q.value = 0.7;
  const hiss = ctx.createGain();
  hiss.gain.value = 0.001;
  noise.connect(nbp);
  nbp.connect(hiss);
  hiss.connect(master.input);

  src.start();
  noise.start();

  return {
    step(t: number, e: number) {
      const now = ctx.currentTime;

      // Lowpass: 16 kHz (e=0) → 800 Hz (e=1), exponential.
      const fc = 800 * Math.pow(16000 / 800, 1 - e);
      lp.frequency.setTargetAtTime(fc, now, 0.12);

      // Thinning: an irregular sag that deepens with e — dropouts, lost material.
      const sag = 0.5 + 0.5 * Math.sin(t * 0.23) * Math.sin(t * 0.091 + 2);
      const g = 1 - e * (0.22 + 0.42 * sag);
      thin.gain.setTargetAtTime(Math.max(0.12, g), now, 0.1);

      // Wow (slow) + flutter (faster), widening with e — detune in cents.
      const flutter = e * (42 * Math.sin(t * 0.6) + 16 * Math.sin(t * 2.3 + 1));
      src.detune.setTargetAtTime(flutter, now, 0.05);

      // Room-tone rises as the dry signal recedes.
      wet.gain.setTargetAtTime(0.04 + 0.5 * e, now, 0.25);
      hiss.gain.setTargetAtTime(0.001 + 0.03 * e, now, 0.35);
    },
    dispose() {
      try {
        src.stop();
        noise.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
        lp.disconnect();
        thin.disconnect();
        dry.disconnect();
        pre.disconnect();
        conv.disconnect();
        wet.disconnect();
        noise.disconnect();
        nbp.disconnect();
        hiss.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUALS — raw WebGL2 ping-pong feedback. Two textures are swapped each frame;
// the update pass samples the previous frame, injects a faint latent emulsion,
// fades toward black, and layers accumulating grain + silver flecks. The present
// pass tone-maps to achromatic silver-gelatin. Fullscreen triangle via
// gl_VertexID — no vertex buffer.
// ─────────────────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const UPDATE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime, uFrame, uErosion, uRms, uTilt;
uniform vec3 uPointer; // xy in [0,1], z = held

float hash31(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// The latent silver-gelatin image: an indistinct standing form, a horizon band,
// a little low-frequency silver mottling. Neutral grayscale, no hue.
float latent(vec2 uv){
  vec2 c = uv - vec2(0.5, 0.52);
  float form = exp(-dot(c * vec2(1.7, 1.05), c * vec2(1.7, 1.05)) * 3.4);
  float band = smoothstep(0.02, 0.34, uv.y) * smoothstep(1.0, 0.58, uv.y);
  float base = 0.18 + 0.55 * form + 0.10 * band;
  base += 0.05 * sin(uv.x * 9.0 + 1.3) * sin(uv.y * 7.0);
  return clamp(base, 0.0, 1.0);
}

// Filmstrip framing: a picture window with dark film base + sprocket holes at
// the left and right margins.
float filmFrame(vec2 uv){
  float pic = smoothstep(0.09, 0.11, uv.x) * smoothstep(0.91, 0.89, uv.x);
  float margin = 1.0 - pic;
  float hy = fract(uv.y * 9.0);
  float hole = smoothstep(0.34, 0.28, abs(hy - 0.5));
  float onMargin = step(uv.x, 0.075) + step(0.925, uv.x);
  float sprocket = margin * onMargin * hole * 0.5;
  return pic + sprocket;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;

  // Wow/flutter warp: sample the previous frame through a slow drifting offset
  // that widens with erosion — the loop physically wears as it is reread.
  vec2 warp = vec2(
    sin(uv.y * 3.1 + uTime * 0.13),
    cos(uv.x * 2.4 + uTime * 0.11)
  ) * (0.0007 + 0.004 * uErosion);
  vec3 prev = texture(uPrev, uv + warp).rgb;

  // The latent image thins as the highlights wear off first.
  float img = latent(uv) * filmFrame(uv) * (1.0 - 0.55 * uErosion);

  // Re-inject a little of the base each frame so the picture persists; the
  // feedback fade does the rest of the work.
  float inject = 0.038 + 0.03 * uRms;
  vec3 cur = mix(prev, vec3(img), inject);

  // Fade toward black — the frame thins. Grows with erosion + spectral tilt.
  float decay = 0.006 + 0.052 * uErosion + 0.01 * max(uTilt, 0.0);
  cur *= (1.0 - decay);

  // Silver grain accumulates: per-pixel, temporally reseeded (spatial noise,
  // never a full-frame flash), heavier with erosion and audio energy.
  float g = hash31(vec3(gl_FragCoord.xy, floor(uTime * 24.0)));
  float grain = (0.02 + 0.15 * uErosion) * (0.55 + 0.85 * uRms);
  cur += (g - 0.5) * grain;

  // Silver flecks bloom then die (feedback fade kills them); dust specks too.
  float thresh = 0.9986 - 0.004 * uErosion;
  float fleck = hash31(vec3(gl_FragCoord.xy * 0.5, floor(uTime * 8.0) + uFrame));
  if (fleck > thresh) cur += vec3(0.55 + 0.4 * uErosion);
  float dust = hash31(vec3(gl_FragCoord.yx * 0.7 + 11.0, floor(uTime * 6.0)));
  if (dust > thresh) cur -= vec3(0.45);

  // Abrasion: pressing on the frame speeds the wear locally — a bloom of grain
  // and a flare of silver where the fingertip rests.
  if (uPointer.z > 0.5){
    float pd = distance(uv, uPointer.xy);
    float ab = exp(-pd * pd * 42.0);
    cur += (g - 0.5) * ab * 0.5 * (0.3 + uErosion);
    cur += ab * 0.06;
  }

  cur = clamp(cur, 0.0, 1.2);
  outColor = vec4(cur, 1.0);
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uErosion;

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uTex, uv).rgb;
  float L = dot(c, vec3(0.3333)); // force achromatic

  // Vignette — the emulsion darkens toward the edges of the frame.
  vec2 q = uv - 0.5;
  float vig = smoothstep(0.95, 0.18, length(q * vec2(1.08, 1.0)));
  L *= 0.22 + 0.78 * vig;

  // Faint film-base fog + gentle horizontal wear striations that deepen with e.
  L = L * 0.96 + 0.018;
  float wear = 0.03 * uErosion * sin(uv.y * 240.0);
  L += wear;

  L = clamp(L, 0.0, 1.0);
  outColor = vec4(vec3(L), 1.0);
}`;

function makeEmulsionRenderer(canvas: HTMLCanvasElement): EmulsionRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const compile = (type: number, srcStr: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, srcStr);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const link = (fsSrc: string): WebGLProgram | null => {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  };

  const updateProg = link(UPDATE_FS);
  const presentProg = link(PRESENT_FS);
  if (!updateProg || !presentProg) return null;

  const vao = gl.createVertexArray(); // empty VAO — draw with gl_VertexID
  const uu = {
    prev: gl.getUniformLocation(updateProg, "uPrev"),
    res: gl.getUniformLocation(updateProg, "uRes"),
    time: gl.getUniformLocation(updateProg, "uTime"),
    frame: gl.getUniformLocation(updateProg, "uFrame"),
    erosion: gl.getUniformLocation(updateProg, "uErosion"),
    rms: gl.getUniformLocation(updateProg, "uRms"),
    tilt: gl.getUniformLocation(updateProg, "uTilt"),
    pointer: gl.getUniformLocation(updateProg, "uPointer"),
  };
  const up = {
    tex: gl.getUniformLocation(presentProg, "uTex"),
    res: gl.getUniformLocation(presentProg, "uRes"),
    erosion: gl.getUniformLocation(presentProg, "uErosion"),
  };

  let texW = 2;
  let texH = 2;
  const tex: (WebGLTexture | null)[] = [null, null];
  const fbo: (WebGLFramebuffer | null)[] = [null, null];
  let read = 0; // ping-pong index

  const allocTargets = (w: number, h: number) => {
    for (let i = 0; i < 2; i++) {
      if (tex[i]) gl.deleteTexture(tex[i]);
      if (fbo[i]) gl.deleteFramebuffer(fbo[i]);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      tex[i] = t;
      fbo[i] = f;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    texW = w;
    texH = h;
    read = 0;
  };

  return {
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      // Cap the simulation resolution for stable grain + performance.
      const scale = Math.min(1, 1280 / Math.max(1, w));
      allocTargets(Math.max(2, Math.floor(w * scale)), Math.max(2, Math.floor(h * scale)));
    },
    clear() {
      allocTargets(texW, texH);
    },
    render(s) {
      const write = 1 - read;
      // ── update pass: previous(read) → next(write) ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[write]);
      gl.viewport(0, 0, texW, texH);
      gl.useProgram(updateProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[read]);
      gl.uniform1i(uu.prev, 0);
      gl.uniform2f(uu.res, texW, texH);
      gl.uniform1f(uu.time, s.time);
      gl.uniform1f(uu.frame, s.frame % 1024);
      gl.uniform1f(uu.erosion, s.erosion);
      gl.uniform1f(uu.rms, s.rms);
      gl.uniform1f(uu.tilt, s.tilt);
      gl.uniform3f(uu.pointer, s.pointer[0], s.pointer[1], s.pointer[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ── present pass: next(write) → screen ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(presentProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[write]);
      gl.uniform1i(up.tex, 0);
      gl.uniform2f(up.res, canvas.width, canvas.height);
      gl.uniform1f(up.erosion, s.erosion);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      read = write;
    },
    dispose() {
      const ext = gl.getExtension("WEBGL_lose_context");
      gl.deleteProgram(updateProg);
      gl.deleteProgram(presentProg);
      gl.deleteVertexArray(vao);
      for (let i = 0; i < 2; i++) {
        if (tex[i]) gl.deleteTexture(tex[i]);
        if (fbo[i]) gl.deleteFramebuffer(fbo[i]);
      }
      ext?.loseContext();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Disintegration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [load, setLoad] = useState<LoadState>("none");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Evolve duration in MINUTES (1–16), default 4. Live via ref for the loop.
  const [evolveMin, setEvolveMin] = useState(4);
  const evolveSecRef = useRef(4 * 60);
  useEffect(() => {
    evolveSecRef.current = evolveMin * 60;
  }, [evolveMin]);

  // Read-outs (throttled from the loop so we don't rerender every frame).
  const [erosionPct, setErosionPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const rendererRef = useRef<EmulsionRenderer | null>(null);
  const audioRef = useRef<ErosionAudio | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const erosionRef = useRef(0);
  const startRef = useRef(0);
  const pointerRef = useRef<[number, number, number]>([0.5, 0.5, 0]);
  const energyRef = useRef({ rms: 0, tilt: 0 });

  // ── pointer: press & hold to abrade (speed the wear where you touch) ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current = [
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height,
      1,
    ];
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current[0] = (e.clientX - r.left) / r.width;
    pointerRef.current[1] = 1 - (e.clientY - r.top) / r.height;
  }, []);
  const onPointerUp = useCallback(() => {
    pointerRef.current[2] = 0;
  }, []);

  const handleRestore = useCallback(() => {
    erosionRef.current = 0;
    startRef.current = performance.now();
    rendererRef.current?.clear();
    setErosionPct(0);
    setElapsed(0);
  }, []);

  // ── main loop ──
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(
        Math.max(2, Math.floor(canvas.clientWidth * dpr)),
        Math.max(2, Math.floor(canvas.clientHeight * dpr)),
      );
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    startRef.current = performance.now();
    let last = startRef.current;
    let frame = 0;
    let sinceUi = 0;
    const bins = new Uint8Array(512);
    const time = new Uint8Array(1024);

    const loop = (now: number) => {
      const t = (now - startRef.current) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frame++;

      // Integrate the erosion state — real memory, evolving unattended. Holding
      // the pointer abrades: the wear accelerates while pressed.
      const rate = 1 / Math.max(1, evolveSecRef.current);
      const abrade = pointerRef.current[2] > 0.5 ? 3.5 : 1;
      erosionRef.current = Math.min(1, erosionRef.current + rate * dt * abrade);
      const e = erosionRef.current;

      // Analyser → RMS (time domain) + spectral tilt (freq domain), smoothed.
      const master = masterRef.current;
      if (master) {
        master.analyser.getByteTimeDomainData(time);
        let sq = 0;
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128;
          sq += v * v;
        }
        const rms = Math.sqrt(sq / time.length);
        master.analyser.getByteFrequencyData(bins);
        let lo = 0;
        let hi = 0;
        for (let i = 0; i < 48; i++) lo += bins[i] / 255;
        for (let i = 160; i < 256; i++) hi += bins[i] / 255;
        const tilt = hi / 96 - lo / 48; // + bright, − dark
        energyRef.current.rms += (rms - energyRef.current.rms) * 0.1;
        energyRef.current.tilt += (tilt - energyRef.current.tilt) * 0.05;
      }

      if (audioRef.current) audioRef.current.step(t, e);

      renderer.render({
        time: t,
        frame,
        erosion: e,
        rms: energyRef.current.rms,
        tilt: energyRef.current.tilt,
        pointer: pointerRef.current,
      });

      sinceUi += dt;
      if (sinceUi > 0.4) {
        sinceUi = 0;
        setErosionPct(Math.round(e * 100));
        setElapsed(t);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);

  const handleBegin = useCallback(async () => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeEmulsionRenderer(canvas);
    if (!renderer) {
      setNoWebgl(true);
      setPhase("running");
      return;
    }
    rendererRef.current = renderer;
    setPhase("running");
    cleanupRef.current = runLoop() ?? null;

    setLoad("loading");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      const master = createSafeMaster(ctx);
      masterRef.current = master;
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);
      audioRef.current = makeErosionAudio(ctx, buffer, master);
      setLoad("ready");
    } catch (err) {
      console.error(err);
      setLoad("error");
    }
  }, [phase, runLoop, trackId]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      audioRef.current?.dispose();
      audioRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            A loop left to wear away
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Disintegration
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            One of Karel&apos;s recordings, left to loop and slowly wear itself
            away — audibly and visibly different at minute five than at minute
            one. The top wears off first, the loop loses material, wow and
            flutter widen, and the room surfaces from beneath. A long-form
            meditation on impermanence, after Basinski.
          </p>
          {phase === "running" && (
            <p
              className={`mt-3 font-mono text-base ${
                noWebgl || load === "error" ? "text-destructive" : "text-primary"
              }`}
            >
              {noWebgl
                ? "WebGL2 is unavailable here, so the emulsion cannot be rendered."
                : load === "loading"
                  ? "Summoning the recording…"
                  : load === "error"
                    ? "The recording could not load — the frame decays, but silent."
                    : `Sounding “${trackTitle}” · ${mins}:${String(secs).padStart(2, "0")} · erosion ${erosionPct}%`}
            </p>
          )}
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-5 px-6">
              <div className="flex w-full items-center justify-between gap-3">
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Recording
                </label>
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="min-h-[44px] flex-1 rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {REAL_TRACKS.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-full flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Evolve duration
                  </label>
                  <span className="font-mono text-xs text-muted-foreground">
                    {evolveMin} min
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={16}
                  step={1}
                  value={evolveMin}
                  onChange={(e) => setEvolveMin(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <button
                onClick={handleBegin}
                className="min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the loop
              </button>
              <p className="text-center text-base text-muted-foreground">
                Sound and image begin together, then wear away over the evolve
                duration. Press and hold on the frame to abrade — to speed the
                wear where you touch.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* running controls */}
      {phase === "running" && !noWebgl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-5">
          <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Evolve duration
              </label>
              <span className="font-mono text-xs text-muted-foreground">
                {evolveMin} min
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={evolveMin}
              onChange={(e) => setEvolveMin(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <button
              onClick={handleRestore}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Restore · begin again
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Disintegration — design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">The question:</span> what if one
              of Karel&apos;s recordings were left to loop and slowly wear itself
              away — a piece audibly, visibly different at minute five than at
              minute one, a long-form meditation on impermanence?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A single erosion state <span className="text-primary">e</span>,
              from 0 to 1, climbs over the evolve duration you set (1–16
              minutes). It is real memory: the loop keeps evolving unattended,
              it does not reset each frame. As e rises, a lowpass creeps from
              about 16&nbsp;kHz down to 800&nbsp;Hz so the top wears off first;
              an irregular gain sag thins the amplitude so the loop loses
              material; a detune wobble widens into audible wow and flutter; and
              a filtered-noise room-tone bed rises to surface from beneath the
              receding signal. Everything routes through the shared ear-safety
              master.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The image is a decaying silver-gelatin emulsion, rendered with a
              raw WebGL2 ping-pong feedback texture — two framebuffers swapped
              each frame. The update pass samples the previous frame through a
              slow wow/flutter warp, re-injects a faint latent image, fades
              toward black, and layers accumulating grain and silver flecks that
              bloom and die. Grain and decay are driven by the audio analyser
              (RMS and spectral tilt) and by e. Luminance evolves slowly and the
              grain is per-pixel spatial noise — never a strobe. Press and hold
              to abrade the frame locally.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">References:</span> William
              Basinski, <span className="italic">The Disintegration Loops</span>{" "}
              (2002) — tape loops that literally shed their oxide with each pass;
              and the real-time disintegration effect in{" "}
              <span className="italic">False Memory</span> (All the Machines,
              2026), whose &ldquo;Evolve&rdquo; knob auto-degrades a source over
              a set span.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14832-disintegration"]} />
    </main>
  );
}
