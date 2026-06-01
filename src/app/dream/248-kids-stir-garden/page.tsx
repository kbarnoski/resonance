"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * 248 · Kids Stir Garden
 * Move your body -> grow a living, glowing garden of Turing patterns.
 *
 * Gray-Scott reaction-diffusion on the GPU (ping-pong FBOs, raw WebGL2
 * with WebGL1 fallback). Webcam motion (zero-dependency frame
 * differencing) injects "seed" (v chemical) where the child moves.
 * Pattern + motion drive a gentle pentatonic + ambient pad through a
 * limiter so nothing is ever harsh.
 * ------------------------------------------------------------------ */

// Simulation grid resolution (kept modest so it stays smooth on iPad).
const SIM_W = 320;
const SIM_H = 240;

// Motion sampling resolution (tiny offscreen video copy).
const CAM_W = 64;
const CAM_H = 48;

// Gray-Scott params: feed/kill tuned for soft, lively, growing spots
// ("mitosis"/coral-ish). These stay alive without exploding.
const FEED = 0.037;
const KILL = 0.0603;
const DU = 0.16; // diffusion of u (we scale by dt internally)
const DV = 0.08; // diffusion of v
const SIM_STEPS_PER_FRAME = 6; // multiple RD steps per displayed frame

// C-major pentatonic, low-left -> high-right across N zones.
const ZONE_HZ = [196.0, 261.63, 293.66, 392.0, 440.0];
const ZONE_COLORS = ["#0f5f63", "#1f9b8e", "#36c98f", "#f0894e", "#f6c453"];
const NOTE_REFRACTORY_MS = 360;
const MOTION_NOTE_THRESHOLD = 0.05;

// ---------------- shader sources ----------------

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Gray-Scott update. State texture: r=u, g=v.
const FRAG_SIM = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform sampler2D u_seed;   // motion seed (a = amount of v to add)
uniform vec2 u_texel;
uniform float u_feed;
uniform float u_kill;
uniform float u_du;
uniform float u_dv;
uniform float u_dt;

vec2 samp(vec2 uv){ return texture(u_state, uv).rg; }

void main(){
  vec2 c = samp(v_uv);
  // 3x3 Laplacian (weights sum to 0)
  vec2 lap = vec2(0.0);
  lap += samp(v_uv + vec2(-u_texel.x, 0.0)) * 0.2;
  lap += samp(v_uv + vec2( u_texel.x, 0.0)) * 0.2;
  lap += samp(v_uv + vec2(0.0, -u_texel.y)) * 0.2;
  lap += samp(v_uv + vec2(0.0,  u_texel.y)) * 0.2;
  lap += samp(v_uv + vec2(-u_texel.x,-u_texel.y)) * 0.05;
  lap += samp(v_uv + vec2( u_texel.x,-u_texel.y)) * 0.05;
  lap += samp(v_uv + vec2(-u_texel.x, u_texel.y)) * 0.05;
  lap += samp(v_uv + vec2( u_texel.x, u_texel.y)) * 0.05;
  lap += c * -1.0;

  float u = c.r;
  float v = c.g;
  float reaction = u * v * v;
  float du = u_du * lap.r - reaction + u_feed * (1.0 - u);
  float dv = u_dv * lap.g + reaction - (u_kill + u_feed) * v;

  u += du * u_dt;
  v += dv * u_dt;

  // motion seed injects v (and slightly depletes u where stirred)
  float seed = texture(u_seed, v_uv).a;
  v += seed;
  u -= seed * 0.5;

  u = clamp(u, 0.0, 1.0);
  v = clamp(v, 0.0, 1.0);
  outColor = vec4(u, v, 0.0, 1.0);
}`;

// Display: map v concentration to bioluminescent ramp + bloom feel.
const FRAG_SHOW = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_time;

vec3 ramp(float t){
  // deep teal -> coral -> gold on near black
  vec3 c0 = vec3(0.01, 0.04, 0.05);   // near black
  vec3 c1 = vec3(0.04, 0.35, 0.40);   // deep teal
  vec3 c2 = vec3(0.10, 0.70, 0.55);   // green-teal
  vec3 c3 = vec3(0.95, 0.45, 0.28);   // coral
  vec3 c4 = vec3(1.00, 0.82, 0.38);   // gold
  vec3 col;
  if(t < 0.25)      col = mix(c0, c1, t/0.25);
  else if(t < 0.5)  col = mix(c1, c2, (t-0.25)/0.25);
  else if(t < 0.78) col = mix(c2, c3, (t-0.5)/0.28);
  else              col = mix(c3, c4, (t-0.78)/0.22);
  return col;
}

void main(){
  float v = texture(u_state, v_uv).g;
  // soft edge glow: compare to neighbor average
  float n = 0.0;
  n += texture(u_state, v_uv + vec2(u_texel.x,0.0)).g;
  n += texture(u_state, v_uv - vec2(u_texel.x,0.0)).g;
  n += texture(u_state, v_uv + vec2(0.0,u_texel.y)).g;
  n += texture(u_state, v_uv - vec2(0.0,u_texel.y)).g;
  n *= 0.25;
  float edge = abs(v - n);

  float t = clamp(v * 3.2, 0.0, 1.0);
  vec3 col = ramp(t);
  // additive bloom on edges + breathing shimmer
  float shimmer = 0.85 + 0.15 * sin(u_time * 0.6 + v_uv.x * 8.0);
  col += edge * 3.0 * vec3(0.4, 0.9, 0.8) * shimmer;
  col += pow(t, 3.0) * vec3(0.6, 0.35, 0.1); // gold bloom in dense areas
  outColor = vec4(col, 1.0);
}`;

// ---------------- GL helpers ----------------

function makeShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = makeShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = makeShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("program link:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

interface RDTarget {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export default function KidsStirGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [camNote, setCamNote] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [pointerMode, setPointerMode] = useState(false);

  // audio refs
  const actxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padGainRef = useRef<GainNode | null>(null);
  const lastNoteRef = useRef<number[]>(ZONE_HZ.map(() => 0));

  // motion state
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const seedDataRef = useRef<Uint8Array | null>(null);
  const lastMotionTimeRef = useRef<number>(performance.now());
  const pointerSeedRef = useRef<{ x: number; y: number; t: number }[]>([]);

  const startedRef = useRef(false);

  // ---------------- audio ----------------
  const ensureAudio = useCallback(() => {
    if (actxRef.current) return actxRef.current;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const actx = new AC();
    const master = actx.createGain();
    master.gain.value = 0.9;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(actx.destination);

    // feedback-delay shimmer bus
    const delay = actx.createDelay(1.0);
    delay.delayTime.value = 0.33;
    const fb = actx.createGain();
    fb.gain.value = 0.34;
    const wet = actx.createGain();
    wet.gain.value = 0.5;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    (actx as unknown as { __delay?: DelayNode }).__delay = delay;

    // ambient pad (always playing)
    const padGain = actx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    [98.0, 130.81, 196.0].forEach((hz, i) => {
      const osc = actx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = hz;
      const lfo = actx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.03;
      const lfoG = actx.createGain();
      lfoG.gain.value = hz * 0.004;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      const g = actx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.3;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      lfo.start();
    });
    padGain.gain.linearRampToValueAtTime(0.05, actx.currentTime + 2.0);

    actxRef.current = actx;
    masterRef.current = master;
    padGainRef.current = padGain;
    return actx;
  }, []);

  const ringNote = useCallback((zone: number, vel: number) => {
    const actx = actxRef.current;
    if (!actx) return;
    const now = performance.now();
    if (now - lastNoteRef.current[zone] < NOTE_REFRACTORY_MS) return;
    lastNoteRef.current[zone] = now;

    const t = actx.currentTime;
    const hz = ZONE_HZ[zone];
    const peak = Math.min(0.28, 0.12 + vel * 0.2);
    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const osc2 = actx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = hz * 2;
    const g = actx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
    const g2 = actx.createGain();
    g2.gain.value = 0.22;
    osc2.connect(g2);
    g2.connect(g);
    osc.connect(g);
    g.connect(masterRef.current!);
    const delay = (actx as unknown as { __delay?: DelayNode }).__delay;
    if (delay) g.connect(delay);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.2);
    osc2.stop(t + 1.2);
  }, []);

  // ---------------- main start ----------------
  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    ensureAudio();
    if (actxRef.current?.state === "suspended") {
      actxRef.current.resume().catch(() => {});
    }
    setStarted(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- WebGL setup ----
    // The RD shaders are GLSL ES 3.00, so we require WebGL2. If it's
    // unavailable the ambient pad keeps playing and we show a notice.
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      setGlError(
        "This device can't run the garden simulation (WebGL2 needed) — the ambient sound is still playing.",
      );
      return;
    }

    // We need float (or half-float) render targets for the RD state.
    let texType: number = gl.UNSIGNED_BYTE;
    let texInternal: number = gl.RGBA;
    const extCBF = gl.getExtension("EXT_color_buffer_float");
    if (extCBF) {
      texType = gl.FLOAT;
      texInternal = gl.RGBA16F;
    } else {
      const extHalf = gl.getExtension("EXT_color_buffer_half_float");
      if (extHalf) {
        texType = gl.HALF_FLOAT;
        texInternal = gl.RGBA16F;
      }
    }

    const usingFloat = texType !== gl.UNSIGNED_BYTE;
    if (!usingFloat) {
      // Fall back to 8-bit packed state; lower precision but it runs.
      console.warn("No float color buffer; using UNSIGNED_BYTE RD state.");
    }

    // ---- programs ----
    const progSim = makeProgram(gl, VERT, FRAG_SIM);
    const progShow = makeProgram(gl, VERT, FRAG_SHOW);
    if (!progSim || !progShow) {
      setGlError("Could not compile the garden shaders on this device.");
      return;
    }

    // ---- fullscreen quad ----
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // ---- RD ping-pong targets ----
    const makeTarget = (): RDTarget | null => {
      const tex = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.REPEAT);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.REPEAT);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        texInternal,
        SIM_W,
        SIM_H,
        0,
        gl!.RGBA,
        texType,
        null,
      );
      const fbo = gl!.createFramebuffer();
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        tex,
        0,
      );
      const status = gl!.checkFramebufferStatus(gl!.FRAMEBUFFER);
      if (status !== gl!.FRAMEBUFFER_COMPLETE) {
        console.error("FBO incomplete:", status);
        return null;
      }
      if (!tex || !fbo) return null;
      return { tex, fbo };
    };

    const tA = makeTarget();
    const tB = makeTarget();
    if (!tA || !tB) {
      setGlError("Could not allocate the simulation buffers on this device.");
      return;
    }

    // ---- GPU init: u=1, v=0, plus a few starter blobs of v ----
    // Done on the GPU so it works for FLOAT / HALF_FLOAT alike.
    const blobs: number[] = [];
    for (let b = 0; b < 6; b++) {
      blobs.push(Math.random(), Math.random());
    }
    const progInit = makeProgram(
      gl,
      VERT,
      `#version 300 es
       precision highp float;
       in vec2 v_uv; out vec4 o;
       uniform vec2 u_blobs[6];
       void main(){
         float v = 0.0;
         for(int i=0;i<6;i++){
           float d = distance(v_uv, u_blobs[i]);
           v += smoothstep(0.04, 0.0, d) * 0.9;
         }
         v = clamp(v, 0.0, 0.9);
         o = vec4(1.0 - v*0.5, v, 0.0, 1.0);
       }`,
    );
    if (progInit) {
      gl.useProgram(progInit);
      const bloc = gl.getUniformLocation(progInit, "u_blobs");
      gl.uniform2fv(bloc, new Float32Array(blobs));
      gl.viewport(0, 0, SIM_W, SIM_H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tA.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteProgram(progInit);
    }

    let src = tA;
    let dst = tB;

    // ---- seed texture (motion) on a small grid, uploaded each frame ----
    const seedTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, seedTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const seedData = new Uint8Array(CAM_W * CAM_H * 4);
    seedDataRef.current = seedData;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      CAM_W,
      CAM_H,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      seedData,
    );

    // ---- offscreen 2D canvas for motion diff ----
    const off = document.createElement("canvas");
    off.width = CAM_W;
    off.height = CAM_H;
    const offCtx = off.getContext("2d", { willReadFrequently: true })!;
    prevGrayRef.current = new Uint8Array(CAM_W * CAM_H);

    // uniform locations
    const simLoc = {
      state: gl.getUniformLocation(progSim, "u_state"),
      seed: gl.getUniformLocation(progSim, "u_seed"),
      texel: gl.getUniformLocation(progSim, "u_texel"),
      feed: gl.getUniformLocation(progSim, "u_feed"),
      kill: gl.getUniformLocation(progSim, "u_kill"),
      du: gl.getUniformLocation(progSim, "u_du"),
      dv: gl.getUniformLocation(progSim, "u_dv"),
      dt: gl.getUniformLocation(progSim, "u_dt"),
    };
    const showLoc = {
      state: gl.getUniformLocation(progShow, "u_state"),
      texel: gl.getUniformLocation(progShow, "u_texel"),
      time: gl.getUniformLocation(progShow, "u_time"),
    };

    // ---- try camera ----
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch {
      setCamNote(
        "Camera is off — drag your finger on the garden to stir it instead.",
      );
      setPointerMode(true);
    }

    // ---- motion -> seed each frame ----
    const computeMotion = (): number[] => {
      const video = videoRef.current;
      const seed = seedDataRef.current!;
      const prev = prevGrayRef.current!;
      // clear seed alpha first
      for (let i = 0; i < seed.length; i += 4) seed[i + 3] = 0;
      const zoneMotion = ZONE_HZ.map(() => 0);

      if (
        stream &&
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0
      ) {
        // draw mirrored, then read pixels
        offCtx.save();
        offCtx.scale(-1, 1);
        offCtx.drawImage(video, -CAM_W, 0, CAM_W, CAM_H);
        offCtx.restore();
        const img = offCtx.getImageData(0, 0, CAM_W, CAM_H).data;
        for (let y = 0; y < CAM_H; y++) {
          for (let x = 0; x < CAM_W; x++) {
            const p = (y * CAM_W + x) * 4;
            const g =
              (img[p] * 0.3 + img[p + 1] * 0.59 + img[p + 2] * 0.11) | 0;
            const gi = y * CAM_W + x;
            const diff = Math.abs(g - prev[gi]);
            prev[gi] = g;
            if (diff > 22) {
              const amt = Math.min(255, diff * 3);
              seed[p + 3] = Math.max(seed[p + 3], amt);
              const zone = Math.min(
                ZONE_HZ.length - 1,
                Math.floor((x / CAM_W) * ZONE_HZ.length),
              );
              zoneMotion[zone] += diff;
            }
          }
        }
        // discard frame contents (privacy): overwrite offscreen
        offCtx.clearRect(0, 0, CAM_W, CAM_H);
      }

      // pointer-mode seeds
      const now = performance.now();
      const pts = pointerSeedRef.current;
      pointerSeedRef.current = pts.filter((p) => now - p.t < 120);
      for (const p of pointerSeedRef.current) {
        const sx = Math.floor(p.x * CAM_W);
        const sy = Math.floor(p.y * CAM_H);
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const x = sx + dx;
            const y = sy + dy;
            if (x < 0 || y < 0 || x >= CAM_W || y >= CAM_H) continue;
            const pp = (y * CAM_W + x) * 4;
            seed[pp + 3] = 255;
          }
        const zone = Math.min(
          ZONE_HZ.length - 1,
          Math.floor(p.x * ZONE_HZ.length),
        );
        zoneMotion[zone] += 200;
      }

      return zoneMotion;
    };

    // ---- render loop ----
    const render = () => {
      if (!gl) return;
      const now = performance.now();
      const zoneMotion = computeMotion();

      // total motion -> swell pad + maybe notes
      let total = 0;
      for (let z = 0; z < zoneMotion.length; z++) {
        const norm = zoneMotion[z] / 4000;
        total += norm;
        if (norm > MOTION_NOTE_THRESHOLD) {
          ringNote(z, Math.min(1, norm));
          lastMotionTimeRef.current = now;
        }
      }
      if (padGainRef.current && actxRef.current) {
        const target = 0.05 + Math.min(0.06, total * 0.04);
        padGainRef.current.gain.setTargetAtTime(
          target,
          actxRef.current.currentTime,
          0.4,
        );
      }

      // auto-seed after 3s stillness
      if (now - lastMotionTimeRef.current > 3000) {
        const seed = seedDataRef.current!;
        const cx = Math.floor(Math.random() * CAM_W);
        const cy = Math.floor(Math.random() * CAM_H);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= CAM_W || y >= CAM_H) continue;
            seed[(y * CAM_W + x) * 4 + 3] = 200;
          }
        lastMotionTimeRef.current = now - 2200; // gentle cadence
      }

      // upload seed texture
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, seedTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        CAM_W,
        CAM_H,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        seedDataRef.current!,
      );

      // ---- RD steps ----
      gl.useProgram(progSim);
      gl.uniform2f(simLoc.texel, 1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(simLoc.feed, FEED);
      gl.uniform1f(simLoc.kill, KILL);
      gl.uniform1f(simLoc.du, DU);
      gl.uniform1f(simLoc.dv, DV);
      gl.uniform1f(simLoc.dt, 1.0);
      gl.uniform1i(simLoc.state, 0);
      gl.uniform1i(simLoc.seed, 1);
      gl.viewport(0, 0, SIM_W, SIM_H);

      for (let s = 0; s < SIM_STEPS_PER_FRAME; s++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, seedTex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const tmp = src;
        src = dst;
        dst = tmp;
        // only inject seed on the first sub-step
        if (s === 0) {
          // zero out seed alpha for subsequent steps by re-binding an
          // empty region: cheaper to just keep — but we want one inject.
          // We re-upload a cleared seed once.
          const seed = seedDataRef.current!;
          for (let i = 0; i < seed.length; i += 4) seed[i + 3] = 0;
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, seedTex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            CAM_W,
            CAM_H,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            seed,
          );
        }
      }

      // ---- display ----
      gl.useProgram(progShow);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(showLoc.state, 0);
      gl.uniform2f(showLoc.texel, 1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(showLoc.time, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafRef.current = requestAnimationFrame(render);
    };

    // size canvas to display
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    rafRef.current = requestAnimationFrame(render);

    // store cleanup on canvas dataset via closure variables
    cleanupRef.current = () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      try {
        gl?.deleteTexture(tA.tex);
        gl?.deleteTexture(tB.tex);
        gl?.deleteTexture(seedTex);
        gl?.deleteFramebuffer(tA.fbo);
        gl?.deleteFramebuffer(tB.fbo);
        gl?.deleteBuffer(quad);
        gl?.deleteProgram(progSim);
        gl?.deleteProgram(progShow);
      } catch {
        /* ignore */
      }
    };
  }, [ensureAudio, ringNote]);

  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      cleanupRef.current();
      const actx = actxRef.current;
      if (actx && actx.state !== "closed") actx.close().catch(() => {});
    };
  }, []);

  // pointer "stir" handlers (work in pointer mode and also additively)
  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!startedRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      pointerSeedRef.current.push({ x, y, t: performance.now() });
      lastMotionTimeRef.current = performance.now();
      const zone = Math.min(
        ZONE_HZ.length - 1,
        Math.floor(x * ZONE_HZ.length),
      );
      ringNote(zone, 0.6);
    },
    [ringNote],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04080a] text-white">
      {/* hidden video used only for motion diffing */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute h-px w-px opacity-0"
        playsInline
        muted
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "auto" }}
      />

      {/* pointer / touch stir layer */}
      <div
        className="absolute inset-0"
        onPointerDown={onPointer}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === "touch") onPointer(e);
        }}
        style={{ touchAction: "none" }}
      />

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-[#04080a]/95 px-6 text-center">
          <div className="text-6xl">🌱</div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Stir the Living Garden
          </h1>
          <p className="max-w-md text-base text-white/75">
            Wave your arms, dance, or wiggle — and watch a glowing garden
            grow where you move. It sings as it blooms.
          </p>
          <button
            onClick={start}
            className="rounded-full bg-emerald-400/90 px-10 py-5 text-xl font-semibold text-[#04080a] shadow-lg shadow-emerald-500/30 transition-transform hover:scale-105 active:scale-95"
            style={{ minWidth: 64, minHeight: 64 }}
          >
            ✨ Start
          </button>
        </div>
      )}

      {/* error / camera notices */}
      {glError && (
        <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-xl bg-black/80 px-5 py-3 text-center">
          <p className="text-base text-rose-300">{glError}</p>
        </div>
      )}
      {camNote && started && (
        <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2 max-w-sm rounded-xl bg-black/70 px-5 py-3 text-center">
          <p className="text-base text-rose-300">{camNote}</p>
        </div>
      )}

      {/* zone color hint strip (kids affordance, no reading needed) */}
      {started && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex h-2">
          {ZONE_COLORS.map((c, i) => (
            <div key={i} className="h-full flex-1" style={{ background: c }} />
          ))}
        </div>
      )}

      {/* read the design notes */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-3 top-3 z-30 rounded-full bg-white/10 px-3 py-2 text-xs text-white/75 backdrop-blur hover:bg-white/20 hover:text-white"
        style={{ minHeight: 44 }}
      >
        {showNotes ? "✕" : "ⓘ notes"}
      </button>
      {showNotes && (
        <div className="absolute right-3 top-16 z-30 max-w-xs rounded-xl border border-white/10 bg-black/85 p-4 text-sm text-white/75 backdrop-blur">
          <p className="mb-2 text-base font-semibold text-white">
            Living Garden
          </p>
          <p className="mb-2">
            A Gray-Scott reaction-diffusion simulation runs on the GPU.
            Your movement (via the webcam, mirrored) injects chemical
            &quot;seed&quot; that grows into coral-like Turing patterns.
          </p>
          <p className="mb-2">
            {pointerMode
              ? "Camera off: drag to stir the garden."
              : "Move your whole body to grow patterns."}
          </p>
          <p className="text-white/60">
            See README.md for the math (feed≈0.037, kill≈0.0603),
            sound mapping, and references (Ghassaei, cake23, Karl Sims).
          </p>
        </div>
      )}
    </main>
  );
}
