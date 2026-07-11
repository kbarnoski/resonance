"use client";
import { useEffect, useRef, useState } from "react";
import { buildFirebirdAudio, type FirebirdAudio } from "./audio";

// ── Types ────────────────────────────────────────────────────────────────────

interface MPLandmark {
  x: number;
  y: number;
  z?: number;
}

interface MPHandResult {
  landmarks?: MPLandmark[][];
}

interface MPTask {
  detectForVideo(video: HTMLVideoElement, ts: number): MPHandResult;
  close(): void;
}

interface HandState {
  landmarks: MPLandmark[];
  openness: number; // 0=fist, 1=fully open
  height: number;   // 0=bottom, 1=top
  spread: number;   // 0=fingers together, 1=fan
  speed: number;    // movement delta 0..1
}

// ── Constants ────────────────────────────────────────────────────────────────

const NUM_PARTICLES = 2000;
const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
const PALM_INDICES = [0, 5, 9, 13, 17];

// ── GLSL Shaders ─────────────────────────────────────────────────────────────

const FADE_VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FADE_FRAG = `#version 300 es
precision mediump float;
uniform float u_alpha;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, u_alpha); }
`;

const PARTICLE_VERT = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_life;
in float a_brightness;

uniform vec2 u_resolution;

out float v_life;
out float v_brightness;

void main() {
  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
  clipSpace.y = -clipSpace.y;
  gl_Position = vec4(clipSpace, 0.0, 1.0);
  float sz = mix(2.0, 8.0, a_brightness) * a_life;
  gl_PointSize = max(1.0, sz);
  v_life = a_life;
  v_brightness = a_brightness;
}
`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;

in float v_life;
in float v_brightness;

out vec4 outColor;

void main() {
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord);
  if (dist > 0.5) discard;
  float alpha = (1.0 - dist * 2.0) * v_life * v_brightness;
  vec3 color = mix(
    vec3(1.0, 0.3, 0.0),
    vec3(1.0, 0.9, 0.4),
    1.0 - dist * 2.0
  );
  outColor = vec4(color * alpha, alpha);
}
`;

// ── Shader compilation ────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return prog;
}

// ── WebGL2 renderer ───────────────────────────────────────────────────────────

interface WebGLRenderer {
  // Particle data (CPU)
  positions: Float32Array;
  velocities: Float32Array;
  lifeBrightness: Float32Array;
  targetIdx: Uint8Array;
  // GL objects
  particleProg: WebGLProgram;
  particleVao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  lifeBuf: WebGLBuffer;
  uResolution: WebGLUniformLocation | null;
  fadeProg: WebGLProgram;
  fadeVao: WebGLVertexArrayObject;
  uAlpha: WebGLUniformLocation | null;
}

function makeWebGLRenderer(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): WebGLRenderer | null {
  // ── Fade program ─────────────────────────────────────────────────────────
  const fadeProg = buildProgram(gl, FADE_VERT, FADE_FRAG);
  if (!fadeProg) return null;

  const fadeVao = gl.createVertexArray();
  if (!fadeVao) return null;
  gl.bindVertexArray(fadeVao);
  const quadBuf = gl.createBuffer();
  if (!quadBuf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPosLoc = gl.getAttribLocation(fadeProg, "a_pos");
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uAlpha = gl.getUniformLocation(fadeProg, "u_alpha");

  // ── Particle program ─────────────────────────────────────────────────────
  const particleProg = buildProgram(gl, PARTICLE_VERT, PARTICLE_FRAG);
  if (!particleProg) return null;

  const positions = new Float32Array(NUM_PARTICLES * 2);
  const velocities = new Float32Array(NUM_PARTICLES * 2);
  const lifeBrightness = new Float32Array(NUM_PARTICLES * 2);
  const targetIdx = new Uint8Array(NUM_PARTICLES);

  for (let i = 0; i < NUM_PARTICLES; i++) {
    positions[i * 2] = w * 0.5 + (Math.random() - 0.5) * w * 0.3;
    positions[i * 2 + 1] = h * 0.5 + (Math.random() - 0.5) * h * 0.3;
    velocities[i * 2] = (Math.random() - 0.5) * 2;
    velocities[i * 2 + 1] = (Math.random() - 0.5) * 2;
    lifeBrightness[i * 2] = Math.random();
    lifeBrightness[i * 2 + 1] = 0.5 + Math.random() * 0.5;
    targetIdx[i] = Math.floor(Math.random() * 21);
  }

  const posBuf = gl.createBuffer();
  if (!posBuf) return null;
  const lifeBuf = gl.createBuffer();
  if (!lifeBuf) return null;

  const particleVao = gl.createVertexArray();
  if (!particleVao) return null;
  gl.bindVertexArray(particleVao);

  const aPosition = gl.getAttribLocation(particleProg, "a_position");
  const aLife = gl.getAttribLocation(particleProg, "a_life");
  const aBrightness = gl.getAttribLocation(particleProg, "a_brightness");

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, lifeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lifeBrightness, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aLife);
  gl.vertexAttribPointer(aLife, 1, gl.FLOAT, false, 8, 0);
  gl.enableVertexAttribArray(aBrightness);
  gl.vertexAttribPointer(aBrightness, 1, gl.FLOAT, false, 8, 4);

  gl.bindVertexArray(null);

  const uResolution = gl.getUniformLocation(particleProg, "u_resolution");

  return {
    positions,
    velocities,
    lifeBrightness,
    targetIdx,
    particleProg,
    particleVao,
    posBuf,
    lifeBuf,
    uResolution,
    fadeProg,
    fadeVao,
    uAlpha,
  };
}

function renderWebGL(
  gl: WebGL2RenderingContext,
  renderer: WebGLRenderer,
  w: number,
  h: number,
): void {
  // Step 1: draw semi-transparent black quad for trail fade
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(renderer.fadeProg);
  if (renderer.uAlpha) gl.uniform1f(renderer.uAlpha, 0.13);
  gl.bindVertexArray(renderer.fadeVao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  // Step 2: draw particles additively
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.useProgram(renderer.particleProg);
  if (renderer.uResolution) gl.uniform2f(renderer.uResolution, w, h);
  gl.bindVertexArray(renderer.particleVao);
  gl.drawArrays(gl.POINTS, 0, NUM_PARTICLES);
  gl.bindVertexArray(null);
}

// ── Particle update (CPU) ─────────────────────────────────────────────────────

function updateParticles(
  renderer: WebGLRenderer,
  landmarks: MPLandmark[],
  openness: number,
  speed: number,
  canvasW: number,
  canvasH: number,
  dt: number,
): void {
  const jitterScale = (0.3 + speed * 2.0) * (0.5 + openness * 0.5);

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const ix = i * 2;
    const iy = i * 2 + 1;

    const px = renderer.positions[ix] ?? 0;
    const py = renderer.positions[iy] ?? 0;
    let vx = renderer.velocities[ix] ?? 0;
    let vy = renderer.velocities[iy] ?? 0;
    let life = renderer.lifeBrightness[ix] ?? 0;

    const lmIdx = renderer.targetIdx[i] ?? 0;
    const lm = landmarks[lmIdx] ?? landmarks[0];
    if (!lm) continue;

    // Mirror x (webcam is mirrored naturally)
    const tx = (1 - lm.x) * canvasW;
    const ty = lm.y * canvasH;

    // Spring force toward target
    const dx = tx - px;
    const dy = ty - py;
    const springK = 0.08 + openness * 0.04;
    vx += dx * springK;
    vy += dy * springK;

    // Damping
    vx *= 0.88;
    vy *= 0.88;

    // Random jitter
    vx += (Math.random() - 0.5) * jitterScale * 4;
    vy += (Math.random() - 0.5) * jitterScale * 4;

    // Speed cap
    const spd = Math.sqrt(vx * vx + vy * vy);
    const maxSpd = 12 + speed * 20;
    if (spd > maxSpd) {
      vx = (vx / spd) * maxSpd;
      vy = (vy / spd) * maxSpd;
    }

    renderer.positions[ix] = px + vx * dt * 60;
    renderer.positions[iy] = py + vy * dt * 60;
    renderer.velocities[ix] = vx;
    renderer.velocities[iy] = vy;

    // Life decay
    const lifeDecay = 0.003 + Math.random() * 0.008;
    life -= lifeDecay * dt * 60;

    if (life <= 0) {
      // Respawn at random landmark
      const spawnIdx = Math.floor(Math.random() * 21);
      renderer.targetIdx[i] = spawnIdx;
      const spawnLm = landmarks[spawnIdx] ?? landmarks[0];
      if (spawnLm) {
        const scatter = 15 + openness * 30;
        renderer.positions[ix] = (1 - spawnLm.x) * canvasW + (Math.random() - 0.5) * scatter;
        renderer.positions[iy] = spawnLm.y * canvasH + (Math.random() - 0.5) * scatter;
      }
      renderer.velocities[ix] = (Math.random() - 0.5) * 3;
      renderer.velocities[iy] = (Math.random() - 0.5) * 3;
      life = 0.4 + Math.random() * 0.6;
      renderer.lifeBrightness[i * 2 + 1] = 0.3 + Math.random() * 0.7 * (0.4 + openness * 0.6);
    }

    renderer.lifeBrightness[ix] = Math.max(0, life);
  }
}

// ── Hand state computation ────────────────────────────────────────────────────

function computeHandState(
  landmarks: MPLandmark[],
  prevLandmarks: MPLandmark[] | null,
  prevState: HandState | null,
): HandState {
  // Palm center
  let palmX = 0;
  let palmY = 0;
  let palmCount = 0;
  for (const idx of PALM_INDICES) {
    const lm = landmarks[idx];
    if (lm) {
      palmX += lm.x;
      palmY += lm.y;
      palmCount++;
    }
  }
  if (palmCount > 0) {
    palmX /= palmCount;
    palmY /= palmCount;
  }

  // Hand size: wrist to middle MCP
  const wrist = landmarks[0];
  const midMcp = landmarks[9];
  let handSize = 0.15;
  if (wrist && midMcp) {
    handSize = Math.max(
      0.05,
      Math.sqrt((wrist.x - midMcp.x) ** 2 + (wrist.y - midMcp.y) ** 2),
    );
  }

  // Openness
  let totalDist = 0;
  let tipCount = 0;
  for (const idx of FINGERTIP_INDICES) {
    const tip = landmarks[idx];
    if (tip) {
      totalDist += Math.sqrt((tip.x - palmX) ** 2 + (tip.y - palmY) ** 2);
      tipCount++;
    }
  }
  const avgTipDist = tipCount > 0 ? totalDist / tipCount : 0;
  const rawOpenness = Math.min(1, Math.max(0, (avgTipDist / handSize - 0.5) / 1.5));

  // Spread: angular fan of fingertips
  let minAngle = Infinity;
  let maxAngle = -Infinity;
  for (const idx of FINGERTIP_INDICES) {
    const tip = landmarks[idx];
    if (tip) {
      const angle = Math.atan2(tip.y - palmY, tip.x - palmX);
      if (angle < minAngle) minAngle = angle;
      if (angle > maxAngle) maxAngle = angle;
    }
  }
  const angularSpan = Number.isFinite(maxAngle - minAngle) ? maxAngle - minAngle : 0;
  const rawSpread = Math.min(1, Math.max(0, angularSpan / (Math.PI * 0.8)));

  // Height: 1 - palm_y
  const rawHeight = Math.min(1, Math.max(0, 1 - palmY));

  // Speed
  let rawSpeed = 0;
  if (prevLandmarks) {
    let totalMovement = 0;
    const len = Math.min(landmarks.length, prevLandmarks.length);
    for (let i = 0; i < len; i++) {
      const cur = landmarks[i];
      const prev = prevLandmarks[i];
      if (cur && prev) {
        totalMovement += Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      }
    }
    rawSpeed = Math.min(1, totalMovement * 10);
  }

  // Smooth with lerp from prev state
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const s = prevState;
  return {
    landmarks,
    openness: s ? lerp(s.openness, rawOpenness, 0.12) : rawOpenness,
    height:   s ? lerp(s.height,   rawHeight,   0.08) : rawHeight,
    spread:   s ? lerp(s.spread,   rawSpread,   0.12) : rawSpread,
    speed:    s ? lerp(s.speed,    rawSpeed,    0.25) : rawSpeed,
  };
}

// ── Virtual demo landmarks ────────────────────────────────────────────────────

function makeVirtualLandmarks(t: number): MPLandmark[] {
  const phase = t % 8;
  const ease = (x: number) => x * x * (3 - 2 * x);

  let openness: number;
  if (phase < 2) {
    openness = 0.05;
  } else if (phase < 3) {
    openness = ease((phase - 2) / 1.0) * 0.9;
  } else if (phase < 5) {
    openness = 0.9 + Math.sin((phase - 3) * Math.PI) * 0.05;
  } else if (phase < 6) {
    openness = ease(1 - (phase - 5) / 1.0) * 0.9;
  } else if (phase < 7) {
    openness = 0.1 + Math.abs(Math.sin((phase - 6) * Math.PI * 2)) * 0.4;
  } else {
    openness = 0.05 + (8 - phase) * 0.05;
  }

  const cx = 0.5 + Math.sin(t * 0.4) * 0.08;
  const cy = 0.52 - Math.sin(t * 0.3) * 0.06
    - (phase > 3 && phase < 5 ? (phase - 3) * 0.03 : 0);
  const handSize = 0.18;

  const lms: MPLandmark[] = [];

  // Wrist (0)
  lms.push({ x: cx, y: cy + handSize * 0.7 });

  // Thumb (1-4)
  const thumbBaseX = cx - handSize * 0.42;
  const thumbBaseY = cy + handSize * 0.35;
  for (let j = 0; j < 4; j++) {
    const frac = j / 3;
    const spread = openness * 0.35;
    lms.push({
      x: thumbBaseX - frac * handSize * (0.3 + spread),
      y: thumbBaseY - frac * handSize * (0.55 + spread * 0.2),
    });
  }

  // 4 fingers × 4 joints (5-20)
  const fingerBaseOffsets = [-0.28, -0.10, 0.08, 0.25];
  const fingerLengths = [1.0, 1.1, 0.95, 0.75];

  for (let f = 0; f < 4; f++) {
    const baseX = cx + handSize * (fingerBaseOffsets[f] ?? 0);
    const baseY = cy + handSize * 0.15;
    const len = (fingerLengths[f] ?? 1.0) * handSize * (0.5 + openness * 0.5);
    const spreadAngle = openness * (f - 1.5) * 0.22;

    for (let j = 0; j < 4; j++) {
      const frac = (j + 1) / 4;
      lms.push({
        x: baseX + Math.sin(spreadAngle) * len * frac,
        y: baseY - Math.cos(spreadAngle) * len * frac,
      });
    }
  }

  return lms;
}

// ── Canvas 2D fallback ────────────────────────────────────────────────────────

function drawFallbackGlow(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  state: HandState,
): void {
  ctx2d.fillStyle = "rgba(0,0,0,0.18)";
  ctx2d.fillRect(0, 0, w, h);

  const { openness, landmarks } = state;
  const cx = w * 0.5;
  const cy = h * 0.5;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    const lx = (1 - lm.x) * w;
    const ly = lm.y * h;
    const r = 8 + openness * 20 + Math.sin(t * 3 + i) * 3;
    const alpha = 0.3 + openness * 0.5;

    const grad = ctx2d.createRadialGradient(lx, ly, 0, lx, ly, r * 2);
    grad.addColorStop(0, `rgba(255,200,80,${alpha.toFixed(2)})`);
    grad.addColorStop(0.5, `rgba(255,80,0,${(alpha * 0.5).toFixed(2)})`);
    grad.addColorStop(1, "rgba(255,50,0,0)");
    ctx2d.beginPath();
    ctx2d.arc(lx, ly, r * 2, 0, Math.PI * 2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();
  }

  // Central glow pulse
  const pulseR = 40 + openness * 60 + Math.sin(t * 2) * 10;
  const centerGrad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
  centerGrad.addColorStop(0, `rgba(255,180,30,${(0.2 + openness * 0.3).toFixed(2)})`);
  centerGrad.addColorStop(1, "rgba(255,80,0,0)");
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, pulseR, 0, Math.PI * 2);
  ctx2d.fillStyle = centerGrad;
  ctx2d.fill();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FirebirdPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<FirebirdAudio | null>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    if (!started) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Canvas resize ────────────────────────────────────────────────────────
    const doResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const gl2 = canvas.getContext("webgl2");
      if (gl2) gl2.viewport(0, 0, canvas.width, canvas.height);
    };
    doResize();
    window.addEventListener("resize", doResize);

    // ── Init WebGL2 ──────────────────────────────────────────────────────────
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
    let renderer: WebGLRenderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;

    if (gl) {
      renderer = makeWebGLRenderer(gl, canvas.width, canvas.height);
      if (!renderer) {
        setWebglFailed(true);
      }
    } else {
      setWebglFailed(true);
    }

    if (!renderer) {
      ctx2d = canvas.getContext("2d");
    }

    // ── Init audio ───────────────────────────────────────────────────────────
    let audio: FirebirdAudio | null = null;
    try {
      audio = buildFirebirdAudio();
      audioRef.current = audio;
    } catch (e) {
      console.warn("Audio init failed:", e);
    }

    // ── Mutable state (closure vars) ─────────────────────────────────────────
    let handState: HandState = {
      landmarks: makeVirtualLandmarks(0),
      openness: 0.05,
      height: 0.5,
      spread: 0.1,
      speed: 0,
    };
    let prevLandmarks: MPLandmark[] | null = null;
    let prevHandState: HandState | null = null;
    let demoActive = true;
    let demoTime = 0;
    let lastIdleTime = performance.now();
    let mpTask: MPTask | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let lastMpTime = 0;

    // ── Render loop ──────────────────────────────────────────────────────────
    let rafId = 0;
    let lastFrameTime = performance.now();

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // Virtual demo drives hand automatically
      if (demoActive) {
        demoTime += dt;
        const vLandmarks = makeVirtualLandmarks(demoTime);
        const newState = computeHandState(vLandmarks, prevLandmarks, prevHandState);
        handState = newState;
        prevLandmarks = vLandmarks;
        prevHandState = newState;
      }

      // Update audio every frame
      if (audio) {
        audio.update({
          openness: handState.openness,
          height:   handState.height,
          spread:   handState.spread,
          speed:    handState.speed,
        });
      }

      const W = canvas.width;
      const H = canvas.height;

      if (gl && renderer) {
        // Upload updated particle data to GPU
        updateParticles(renderer, handState.landmarks, handState.openness, handState.speed, W, H, dt);
        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.positions);
        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lifeBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.lifeBrightness);
        renderWebGL(gl, renderer, W, H);
      } else if (ctx2d) {
        drawFallbackGlow(ctx2d, W, H, demoTime, handState);
      }
    };

    rafId = requestAnimationFrame(tick);

    // ── MediaPipe camera init (async) ────────────────────────────────────────
    const mpVer = "0.10.14";

    async function initCamera(): Promise<void> {
      setStatus("Loading hand tracker…");
      try {
        await new Promise<void>((res, rej) => {
          if (document.querySelector(`script[data-mp="${mpVer}"]`)) { res(); return; }
          const s = document.createElement("script");
          s.src = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVer}/wasm/vision_bundle.mjs`;
          s.type = "module";
          s.dataset.mp = mpVer;
          s.onload = () => res();
          s.onerror = rej;
          document.head.appendChild(s);
          setTimeout(rej, 12000);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mpNs = (window as any).mediapipeTasks ?? (window as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { HandLandmarker, FilesetResolver } = mpNs as any;
        if (!HandLandmarker) throw new Error("HandLandmarker not found");

        const cdnBase = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVer}/wasm`;
        const vision = await FilesetResolver.forVisionTasks(cdnBase) as unknown;
        mpTask = (await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        })) as MPTask;

        setStatus("Point your hand at the camera");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        videoEl = document.createElement("video");
        videoEl.srcObject = stream;
        videoEl.playsInline = true;
        videoEl.muted = true;
        await videoEl.play();
        setStatus("");
        lastIdleTime = performance.now();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Auto-demo running — camera unavailable (${msg.slice(0, 60)})`);
        setTimeout(() => setStatus(""), 5000);
      }
    }

    // Give demo 300ms head start before attempting camera
    const cameraTimer = setTimeout(() => { void initCamera(); }, 300);

    // ── MediaPipe detection loop ─────────────────────────────────────────────
    const MP_INTERVAL_MS = 33;
    let camRafId = 0;

    const camLoop = (now: number) => {
      camRafId = requestAnimationFrame(camLoop);
      if (!mpTask || !videoEl || videoEl.readyState < 2) return;
      if (now - lastMpTime < MP_INTERVAL_MS) return;
      lastMpTime = now;

      try {
        const result = mpTask.detectForVideo(videoEl, now);
        if (result.landmarks && result.landmarks.length > 0 && result.landmarks[0]) {
          const rawLms = result.landmarks[0];
          const newState = computeHandState(rawLms, prevLandmarks, prevHandState);
          handState = newState;
          prevLandmarks = rawLms;
          prevHandState = newState;
          lastIdleTime = now;
          demoActive = false;
        } else {
          // Resume demo after 3.5s with no hand detected
          if (now - lastIdleTime > 3500) {
            demoActive = true;
          }
        }
      } catch (e) {
        console.warn("MP detect error:", e);
      }
    };

    camRafId = requestAnimationFrame(camLoop);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(cameraTimer);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(camRafId);
      window.removeEventListener("resize", doResize);
      if (mpTask) { try { mpTask.close(); } catch { /* ignore */ } }
      if (videoEl) {
        const stream = videoEl.srcObject as MediaStream | null;
        stream?.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
      if (audio) audio.dispose();
      audioRef.current = null;
    };
  }, [started]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
      />

      {/* Start overlay — shown before button click */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          {/* Animated ember preview */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div
              className="absolute w-24 h-24 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,200,60,0.9) 0%, rgba(255,80,0,0.6) 40%, transparent 70%)",
                animation: "fbPulse 2s ease-in-out infinite",
              }}
            />
            <div
              className="absolute w-12 h-12 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,240,200,1) 0%, rgba(255,150,30,0.8) 60%, transparent 100%)",
                animation: "fbPulse 1.4s ease-in-out infinite reverse",
              }}
            />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center tracking-wide">
            Firebird
          </h1>
          <p className="text-base text-muted-foreground text-center max-w-xs leading-relaxed">
            Hold your hand up and watch a creature of light form around your fingers
          </p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Opens its wings and sings when you open your hand
          </p>

          <button
            onClick={() => setStarted(true)}
            className="px-4 py-2.5 bg-violet-500 hover:bg-violet-400 active:bg-violet-600 text-foreground font-semibold rounded-full text-lg min-h-[44px] min-w-[220px] transition-colors"
          >
            Wake the Firebird
          </button>

          <p className="text-xs text-muted-foreground/70">
            Glowing auto-demo starts immediately · camera optional
          </p>
        </div>
      )}

      {/* Status message */}
      {started && status && (
        <p className="absolute bottom-4 left-0 right-0 text-center text-muted-foreground text-sm pointer-events-none px-4">
          {status}
        </p>
      )}

      {/* WebGL2 fallback notice */}
      {webglFailed && started && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-violet-300 text-sm bg-black/60 px-3 py-1.5 rounded-lg">
            WebGL2 unavailable — Canvas2D mode
          </p>
        </div>
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes fbPulse {
          0%, 100% { opacity: 0.65; transform: scale(0.9); }
          50%       { opacity: 1;    transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
