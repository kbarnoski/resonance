"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

/* ------------------------------------------------------------------ *
 * 14784 — Nave
 * Walk around inside a cathedral built from one of Karel's own
 * recordings. The acoustics are COMPUTED from where you stand, not
 * mixed with a fader: a shoebox nave is modelled, the piano is mirrored
 * across all six walls to get first-order image sources (Allen &
 * Berkley 1979), and each image is a delayed / distance-attenuated /
 * direction-panned copy of the audio that recomputes live as you move.
 * A synthesized decaying-noise convolution tail supplies the diffuse
 * late field. Stand near a pillar for a tight slap-back; drift to the
 * centre of the nave for a wide bloom. Raw WebGL2 renders the interior
 * with full-chromatic stained-glass light. Pointer to look, drag to walk.
 * ------------------------------------------------------------------ */

// ── Nave geometry (metres) — shared between the audio model and the shader ──
const HW = 7.0; // half-width  (x ∈ [-7, 7])
const HH = 11.0; // half-height (y ∈ [0, 22])
const HL = 27.0; // half-length (z ∈ [0, 54])
const CEN_Y = HH; // box centre y
const CEN_Z = HL; // box centre z
const SPEED_OF_SOUND = 343; // m/s
const SRC: readonly [number, number, number] = [0, 6.0, 50.0]; // the piano, near the altar
const EYE_Y = 5.5; // listener head height
const REFL_COEF = 0.62; // wall reflection coefficient for first-order images
const REF_DIST = 2.0; // reference distance for 1/d attenuation

// six first-order image positions, mirrored across each wall of the shoebox
function makeImageSources(): [number, number, number][] {
  const [sx, sy, sz] = SRC;
  return [
    [-2 * HW - sx, sy, sz], // left wall  x = -HW
    [2 * HW - sx, sy, sz], // right wall x = +HW
    [sx, -sy, sz], // floor      y = 0
    [sx, 2 * (2 * HH) - sy, sz], // ceiling  y = 2·HH
    [sx, sy, -sz], // back wall  z = 0
    [sx, sy, 2 * (2 * HL) - sz], // front wall z = 2·HL
  ];
}

// ── Types ──
type Phase = "idle" | "running";
type LoadState = "none" | "loading" | "ready" | "error";

interface Listener {
  x: number;
  z: number;
  yaw: number; // heading; 0 faces +z (toward the rose window)
}

interface NaveAudio {
  update(l: Listener): [number, number, number][]; // returns valid reflection glint points
  dispose(): void;
}

interface NaveRenderer {
  resize(w: number, h: number): void;
  render(cam: {
    time: number;
    pos: [number, number, number];
    yaw: number;
    pitch: number;
    energy: number;
    bass: number;
    refl: [number, number, number][];
  }): void;
  dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO — the image-source method + a synthesized late-reverb tail.
// ─────────────────────────────────────────────────────────────────────────────
function makeNaveAudio(
  ctx: AudioContext,
  buffer: AudioBuffer,
  master: SafeMaster,
): NaveAudio {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const images = makeImageSources();
  // branch 0 = direct sound (order 0); branches 1..6 = the six wall images.
  const branchLevels = [1.0, ...images.map(() => REFL_COEF)];
  const branchTargets: ([number, number, number] | null)[] = [
    SRC as unknown as [number, number, number],
    ...images,
  ];

  const delays: DelayNode[] = [];
  const gains: GainNode[] = [];
  const pans: StereoPannerNode[] = [];
  for (let i = 0; i < branchTargets.length; i++) {
    const d = ctx.createDelay(0.6);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const p = ctx.createStereoPanner();
    src.connect(d);
    d.connect(g);
    g.connect(p);
    p.connect(master.input);
    delays.push(d);
    gains.push(g);
    pans.push(p);
  }

  // Late reverb: a synthesized decaying-noise impulse response of a large hall.
  // (Synthesizing the IR is the acoustic MODEL, not the music.)
  const irLen = Math.floor(ctx.sampleRate * 3.6);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const t = i / ctx.sampleRate;
      // a short early gap, then exponential RT60 ≈ 3.4 s diffuse decay
      const env = t < 0.02 ? t / 0.02 : Math.exp(-t * 2.0);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const preDelay = ctx.createDelay(0.2);
  preDelay.delayTime.value = 0.03;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  src.connect(preDelay);
  preDelay.connect(conv);
  conv.connect(wet);
  wet.connect(master.input);

  src.start();

  const F: [number, number] = [0, 1]; // forward (x,z)
  const R: [number, number] = [1, 0]; // right   (x,z)

  return {
    update(l: Listener): [number, number, number][] {
      const now = ctx.currentTime;
      F[0] = Math.sin(l.yaw);
      F[1] = Math.cos(l.yaw);
      R[0] = Math.cos(l.yaw);
      R[1] = -Math.sin(l.yaw);
      const lx = l.x;
      const lz = l.z;
      const glints: [number, number, number][] = [];

      for (let i = 0; i < branchTargets.length; i++) {
        const tgt = branchTargets[i]!;
        const dx = tgt[0] - lx;
        const dy = tgt[1] - EYE_Y;
        const dz = tgt[2] - lz;
        const dist = Math.max(0.5, Math.hypot(dx, dy, dz));
        const horiz = Math.max(0.001, Math.hypot(dx, dz));
        // pan from the azimuth of the (image) source relative to the heading
        const rightComp = dx * R[0] + dz * R[1];
        const pan = Math.max(-1, Math.min(1, rightComp / horiz));
        const gain = branchLevels[i] * Math.min(1, REF_DIST / dist);
        delays[i].delayTime.setTargetAtTime(dist / SPEED_OF_SOUND, now, 0.04);
        gains[i].gain.setTargetAtTime(gain, now, 0.04);
        pans[i].pan.setTargetAtTime(pan, now, 0.05);

        // reflection glint: where the listener→image segment crosses its wall.
        if (i >= 1) {
          const wall = i - 1; // 0 L,1 R,2 floor,3 ceil,4 back,5 front
          let t = -1;
          let gx = 0,
            gy = 0,
            gz = 0;
          if (wall === 0 && Math.abs(tgt[0] - lx) > 1e-3) {
            t = (-HW - lx) / (tgt[0] - lx);
          } else if (wall === 1 && Math.abs(tgt[0] - lx) > 1e-3) {
            t = (HW - lx) / (tgt[0] - lx);
          } else if (wall === 2 && Math.abs(tgt[1] - EYE_Y) > 1e-3) {
            t = (0 - EYE_Y) / (tgt[1] - EYE_Y);
          } else if (wall === 3 && Math.abs(tgt[1] - EYE_Y) > 1e-3) {
            t = (2 * HH - EYE_Y) / (tgt[1] - EYE_Y);
          } else if (wall === 4 && Math.abs(tgt[2] - lz) > 1e-3) {
            t = (0 - lz) / (tgt[2] - lz);
          } else if (wall === 5 && Math.abs(tgt[2] - lz) > 1e-3) {
            t = (2 * HL - lz) / (tgt[2] - lz);
          }
          if (t > 0.01 && t < 1) {
            gx = lx + t * (tgt[0] - lx);
            gy = EYE_Y + t * (tgt[1] - EYE_Y);
            gz = lz + t * (tgt[2] - lz);
            glints.push([gx, gy, gz]);
          }
        }
      }

      // centrality → a wider diffuse bloom in the middle of the nave, a drier,
      // slap-dominated field when you crowd a wall or pillar.
      const nearWall = Math.min(HW - Math.abs(lx), 6);
      const nearPillar = Math.abs(Math.abs(lx) - 5.6) < 1.2 ? 0.4 : 1;
      const central = Math.max(0, Math.min(1, (nearWall / 6) * nearPillar));
      wet.gain.setTargetAtTime(0.16 + 0.34 * central, now, 0.08);

      return glints;
    },
    dispose() {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
        conv.disconnect();
        wet.disconnect();
        preDelay.disconnect();
        delays.forEach((d) => d.disconnect());
        gains.forEach((g) => g.disconnect());
        pans.forEach((p) => p.disconnect());
      } catch {
        /* ctx closing */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUALS — raw WebGL2 raymarch of the nave interior, full-chromatic light.
// ─────────────────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime, uEnergy, uBass;
uniform vec3 uCam, uFwd, uRight, uUp;
uniform vec3 uRefl[6];
uniform int uReflN;

#define HW ${HW.toFixed(1)}
#define HH ${HH.toFixed(1)}
#define HL ${HL.toFixed(1)}
#define CY ${CEN_Y.toFixed(1)}
#define CZ ${CEN_Z.toFixed(1)}
#define SP 6.0
#define COLR 0.9
#define COLX 5.6
#define COLTOP 13.0
#define ROSE_Y 15.5
#define ROSE_R 5.4

vec3 hsv(float h, float s, float v){
  vec3 k = mod(vec3(5.0,3.0,1.0) + h*6.0, 6.0);
  return v - v*s*max(vec3(0.0), min(min(k, 4.0-k), 1.0));
}

float sdBox(vec3 p, vec3 b){
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}
float sdCyl(vec3 p, float r, float h){
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// returns (distance, id): id 0 = wall, 1 = column
vec2 mapScene(vec3 p){
  vec3 q = p - vec3(0.0, CY, CZ);
  float dWall = -sdBox(q, vec3(HW, HH, HL)); // positive inside, 0 at a wall
  float px = abs(p.x) - COLX;
  float pz = mod(p.z + SP*0.5, SP) - SP*0.5;
  float dCol = sdCyl(vec3(px, p.y - COLTOP*0.5, pz), COLR, COLTOP*0.5);
  if (dWall < dCol) return vec2(dWall, 0.0);
  return vec2(dCol, 1.0);
}
vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy).x - mapScene(p - e.xyy).x,
    mapScene(p + e.yxy).x - mapScene(p - e.yxy).x,
    mapScene(p + e.yyx).x - mapScene(p - e.yyx).x));
}

// stained-glass rose window on the front wall — full spectrum around the wheel
vec3 rose(vec2 uv, float shimmer){
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float petals = 12.0;
  float pet = cos(a * petals) * 0.5 + 0.5;
  float ring = smoothstep(0.02, 0.06, abs(fract(r * 2.2) - 0.5));
  float trace = smoothstep(0.06, 0.12, abs(fract((a/6.2831853)*petals) - 0.5));
  float hue = fract(a / 6.2831853 + 0.5 + r * 0.35 + shimmer * 0.05);
  vec3 c = hsv(hue, 0.85, 1.0);
  float glow = smoothstep(ROSE_R, ROSE_R*0.2, r);
  c *= (0.5 + 0.9 * pet) * ring * trace;
  return c * glow * (2.2 + 0.8 * shimmer);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  vec3 ro = uCam;
  vec3 rd = normalize(uFwd + uv.x*uRight + uv.y*uUp);

  // slow, photosensitive-safe luminance drift (~0.2 Hz) modulated gently by audio
  float shimmer = 0.5 + 0.5 * sin(uTime * 6.2831853 * 0.2);
  float energy = clamp(uEnergy, 0.0, 1.0);

  float t = 0.0;
  vec2 hit = vec2(-1.0);
  vec3 pos = ro;
  for (int i = 0; i < 110; i++){
    pos = ro + rd * t;
    vec2 m = mapScene(pos);
    if (m.x < 0.01){ hit = m; break; }
    t += m.x;
    if (t > 140.0) break;
  }

  vec3 col = vec3(0.015, 0.017, 0.03); // deep nave gloom
  if (hit.x >= 0.0){
    vec3 n = calcNormal(pos);
    // key light streaming from the rose window down the nave
    vec3 toWin = normalize(vec3(0.0, ROSE_Y, 2.0*HL) - pos);
    float diff = max(dot(n, toWin), 0.0);
    vec3 stone = vec3(0.10, 0.11, 0.14);

    if (hit.y < 0.5){
      // ---- a wall ----
      col = stone * (0.18 + 0.7 * diff);
      // front wall carries the rose window
      if (pos.z > 2.0*HL - 0.3){
        col += rose(vec2(pos.x, pos.y - ROSE_Y), shimmer) * (0.85 + 0.4*energy);
      }
      // clerestory: colored windows high on both side walls cast many hues
      if (abs(abs(pos.x) - HW) < 0.3 && pos.y > 13.0 && pos.y < 19.0){
        float slot = fract(pos.z / SP);
        if (slot > 0.28 && slot < 0.72){
          float hue = fract(pos.z * 0.045 + 0.15);
          col += hsv(hue, 0.8, 1.0) * (0.55 + 0.35*energy) * (0.6 + 0.4*shimmer);
        }
      }
      // floor catches a soft chromatic pool
      if (pos.y < 0.3){
        float hue = fract(pos.z * 0.02 + shimmer * 0.1);
        col += hsv(hue, 0.35, 1.0) * 0.05;
      }
    } else {
      // ---- a column ----
      col = stone * (0.22 + 0.75 * diff);
      col += hsv(fract(pos.y * 0.03 + 0.55), 0.4, 1.0) * 0.08 * diff;
    }

    // image-source glints: faint marks on the walls where reflections originate
    for (int i = 0; i < 6; i++){
      if (i >= uReflN) break;
      float d = length(pos - uRefl[i]);
      col += vec3(1.0, 0.92, 0.7) * exp(-2.2 * d) * 0.35;
    }
  }

  // full-chromatic light shafts toward the window — hue spread across the beam
  vec3 toWinC = normalize(vec3(0.0, ROSE_Y, 2.0*HL) - uCam);
  float al = max(dot(rd, toWinC), 0.0);
  float shaft = pow(al, 24.0) * (0.35 + 0.35*energy) * (0.7 + 0.3*shimmer);
  float shaftHue = fract(0.55 + uv.x * 0.5 + shimmer * 0.08);
  col += shaft * hsv(shaftHue, 0.7, 1.0);

  // gentle vignette + tone
  float vig = smoothstep(1.3, 0.2, length(uv));
  col *= 0.4 + 0.6 * vig;
  col = pow(col, vec3(0.85));
  outColor = vec4(col, 1.0);
}`;

function makeNaveRenderer(canvas: HTMLCanvasElement): NaveRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
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

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    energy: gl.getUniformLocation(prog, "uEnergy"),
    bass: gl.getUniformLocation(prog, "uBass"),
    cam: gl.getUniformLocation(prog, "uCam"),
    fwd: gl.getUniformLocation(prog, "uFwd"),
    right: gl.getUniformLocation(prog, "uRight"),
    up: gl.getUniformLocation(prog, "uUp"),
    refl: gl.getUniformLocation(prog, "uRefl"),
    reflN: gl.getUniformLocation(prog, "uReflN"),
  };

  gl.useProgram(prog);

  return {
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(cam) {
      // camera basis from yaw + pitch
      const cy = Math.cos(cam.pitch);
      const sy = Math.sin(cam.pitch);
      const fwd: [number, number, number] = [
        Math.sin(cam.yaw) * cy,
        sy,
        Math.cos(cam.yaw) * cy,
      ];
      const right: [number, number, number] = [
        Math.cos(cam.yaw),
        0,
        -Math.sin(cam.yaw),
      ];
      // up = right × fwd
      const up: [number, number, number] = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ];
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, cam.time);
      gl.uniform1f(u.energy, cam.energy);
      gl.uniform1f(u.bass, cam.bass);
      gl.uniform3fv(u.cam, cam.pos);
      gl.uniform3fv(u.fwd, fwd);
      gl.uniform3fv(u.right, right);
      gl.uniform3fv(u.up, up);
      const n = Math.min(6, cam.refl.length);
      const flat = new Float32Array(6 * 3);
      for (let i = 0; i < n; i++) {
        flat[i * 3] = cam.refl[i][0];
        flat[i * 3 + 1] = cam.refl[i][1];
        flat[i * 3 + 2] = cam.refl[i][2];
      }
      gl.uniform3fv(u.refl, flat);
      gl.uniform1i(u.reflN, n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      const ext = gl.getExtension("WEBGL_lose_context");
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      ext?.loseContext();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Nave() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [load, setLoad] = useState<LoadState>("none");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const rendererRef = useRef<NaveRenderer | null>(null);
  const audioRef = useRef<NaveAudio | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // listener + look state, read by the loop
  const listenerRef = useRef<Listener>({ x: 0, z: 8, yaw: 0 });
  const lookRef = useRef({ yaw: 0, pitch: 0 }); // hover-look offsets
  const pointerRef = useRef({ down: false, lastX: 0.5, lastY: 0.5 });
  const energyRef = useRef({ e: 0, b: 0 });

  // ---- pointer: hover to look, drag to walk + turn ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current.down = true;
    pointerRef.current.lastX = (e.clientX - r.left) / r.width;
    pointerRef.current.lastY = (e.clientY - r.top) / r.height;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // hover-look: pointer position gives a look offset (parallax)
    lookRef.current.yaw = (px - 0.5) * 0.55;
    lookRef.current.pitch = (0.5 - py) * 0.5;
    if (pointerRef.current.down) {
      const dx = px - pointerRef.current.lastX;
      const dy = py - pointerRef.current.lastY;
      const l = listenerRef.current;
      // horizontal drag turns the heading; vertical drag walks forward/back
      l.yaw += dx * 2.4;
      const step = -dy * 34; // drag up = walk forward
      l.x += Math.sin(l.yaw) * step;
      l.z += Math.cos(l.yaw) * step;
      l.x = Math.max(-5.6, Math.min(5.6, l.x));
      l.z = Math.max(4, Math.min(45, l.z));
    }
    pointerRef.current.lastX = px;
    pointerRef.current.lastY = py;
  }, []);

  const onPointerUp = useCallback(() => {
    pointerRef.current.down = false;
  }, []);

  // ---- main loop ----
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(
        Math.floor(canvas.clientWidth * dpr),
        Math.floor(canvas.clientHeight * dpr),
      );
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    const start = performance.now();
    let smYaw = 0;
    let smPitch = 0;
    let refl: [number, number, number][] = [];
    let frame = 0;
    const freq = new Uint8Array(512);

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const l = listenerRef.current;

      // audio recompute (every 2nd frame is plenty; params are smoothed anyway)
      frame++;
      if (audioRef.current && frame % 2 === 0) {
        refl = audioRef.current.update(l);
      }

      // analyser energy → gentle, heavily-smoothed shimmer (no fast flicker)
      const master = masterRef.current;
      if (master) {
        master.analyser.getByteFrequencyData(freq);
        let sum = 0;
        let bass = 0;
        for (let i = 0; i < 256; i++) {
          const v = freq[i] / 255;
          sum += v;
          if (i < 24) bass += v;
        }
        const e = sum / 256;
        const b = bass / 24;
        energyRef.current.e += (e - energyRef.current.e) * 0.05;
        energyRef.current.b += (b - energyRef.current.b) * 0.05;
      }

      // smooth the look offsets toward camera
      const tgtYaw = l.yaw + lookRef.current.yaw;
      const tgtPitch = lookRef.current.pitch;
      smYaw += (tgtYaw - smYaw) * 0.12;
      smPitch += (tgtPitch - smPitch) * 0.12;

      renderer.render({
        time: t,
        pos: [l.x, EYE_Y, l.z],
        yaw: smYaw,
        pitch: smPitch,
        energy: energyRef.current.e,
        bass: energyRef.current.b,
        refl,
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);

  // ---- enter the nave ----
  const handleEnter = useCallback(async () => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeNaveRenderer(canvas);
    if (!renderer) {
      setNoWebgl(true);
      setPhase("running");
      return;
    }
    rendererRef.current = renderer;
    setPhase("running");
    cleanupRef.current = startLoop() ?? null;

    // audio under the user gesture
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
      audioRef.current = makeNaveAudio(ctx, buffer, master);
      setLoad("ready");
    } catch (err) {
      console.error(err);
      setLoad("error");
    }
  }, [phase, startLoop, trackId]);

  // cleanup on unmount
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

      {/* overlay chrome */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Room, not a mixer
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Nave
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Walk around inside a cathedral built from one of Karel&apos;s own
            recordings. The acoustics are computed from where you stand — a tight
            slap near a pillar, a wide bloom in the centre of the nave — not mixed
            with a fader.
          </p>
          {phase === "running" && (
            <p
              className={`mt-3 font-mono text-base ${
                noWebgl || load === "error"
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {noWebgl
                ? "WebGL2 is unavailable here, so the nave cannot be rendered."
                : load === "loading"
                  ? "Summoning the recording…"
                  : load === "error"
                    ? "The recording could not load — the nave stands, but silent."
                    : `Pointer to look · drag to walk — now sounding “${trackTitle}”.`}
            </p>
          )}
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Recording
                </label>
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {REAL_TRACKS.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleEnter}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the nave
              </button>
              <p className="max-w-sm text-center text-base text-muted-foreground">
                Sound and light begin when you enter. Move your pointer to look
                around; press and drag to walk down the nave and turn.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* design-notes affordance */}
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
              Nave — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The question:</span> what if you
              could walk around inside a cathedral built from your own recording,
              and hear the piano ring off the real walls — because the acoustics
              are computed from where you stand, not mixed with a fader?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              The nave is modelled as a shoebox. The piano is mirrored across all
              six walls to produce{" "}
              <span className="text-primary">first-order image sources</span>{" "}
              (Allen &amp; Berkley&apos;s image-source method, 1979). Each image
              is one delayed, distance-attenuated, direction-panned copy of the
              audio — a <span className="text-primary">DelayNode</span> for the
              extra path length, a <span className="text-primary">GainNode</span>{" "}
              for 1/distance spreading, a{" "}
              <span className="text-primary">StereoPannerNode</span> for its
              azimuth — recomputed live as you move. A synthesized decaying-noise
              convolution tail supplies the diffuse late field, its wetness rising
              toward the open centre of the nave. The design follows{" "}
              <span className="text-foreground">RoomAcoustiC++</span> (2026):
              geometric early reflections plus a feedback-delay-network-style late
              tail.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Faint gold glints mark the walls where each reflection originates,
              so the acoustic model is legible. Stand near a pillar for a tight
              slap-back; drift to the centre for a wide bloom. The interior is a
              raw WebGL2 raymarch lit by full-chromatic stained glass — a rose
              window spanning the spectrum and clerestory windows casting many
              hues down the nave.
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

      <PrototypeNav slugs={["14784-nave"]} />
    </main>
  );
}
