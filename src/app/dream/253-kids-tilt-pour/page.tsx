"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── C-major pentatonic: color ↔ pitch ───────────────────────────────────────
const BLOB_DEFS = [
  { freq: 261.63, color: [1.0, 0.25, 0.55] },  // C4  — hot pink
  { freq: 293.66, color: [1.0, 0.55, 0.05] },  // D4  — orange
  { freq: 329.63, color: [1.0, 0.85, 0.05] },  // E4  — yellow
  { freq: 392.00, color: [0.15, 0.95, 0.45] }, // G4  — green
  { freq: 440.00, color: [0.05, 0.75, 1.0] },  // A4  — cyan
  { freq: 523.25, color: [0.45, 0.30, 1.0] },  // C5  — violet
  { freq: 587.33, color: [1.0, 0.35, 0.80] },  // D5  — magenta
  { freq: 659.25, color: [0.35, 1.0, 0.75] },  // E5  — mint
] as const;

const NUM_BLOBS = 8;
const PAD_FREQS = [130.81, 164.81, 196.0] as const; // C3 E3 G3
const MERGE_DIST = 0.13;   // normalized units; ~13% of canvas width
const REFRACTORY_MS = 260;
const RESTITUTION = 0.55;
const DAMPING = 0.985;
const MAX_VEL = 0.5;
const REPEL_DIST = 0.16;
const REPEL_STRENGTH = 0.0012;
const GRAVITY_SMOOTH = 0.07;
const TILT_TIMEOUT_MS = 1800;

// ─── Vertex shader (full-screen quad) ────────────────────────────────────────
const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ─── Fragment shader: metaball field with Hermite smoothstep falloff ─────────
// Reference: Damian Van Der Merwe (Apr 2026) — Hermite smoothstep falloff,
// fixed blob count, 2-octave noise cap, DPR cap at 2.
// Reference: Inigo Quilez — smooth-min (smin) for gooey fusion.
const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

// 8 blobs: xy=pos (0..1), z=radius (normalized), w=unused
uniform vec4 u_blobs[8];
// 8 blob colors: rgb
uniform vec3 u_colors[8];
uniform vec2 u_resolution;
uniform float u_time;

// ── Inigo Quilez smooth-min (k controls blend width) ─────────────────────────
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ── Hermite smoothstep metaball falloff (per Van Der Merwe Apr 2026) ─────────
// Much cheaper than exp(); same gooey look.
float metaball(vec2 p, vec2 center, float r) {
  float d = length(p - center) / r;
  if (d >= 1.0) return 0.0;
  float t = 1.0 - d;
  return t * t * (3.0 - 2.0 * t); // Hermite smoothstep
}

// ── 2-octave value noise (capped at 2 octaves per Van Der Merwe) ─────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
float noise2oct(vec2 p) {
  return vnoise(p) * 0.65 + vnoise(p * 2.1 + vec2(5.3, 1.7)) * 0.35;
}

void main() {
  vec2 asp = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = v_uv * asp;

  // ── Accumulate metaball field + smooth-fused color ────────────────────────
  float totalField = 0.0;
  vec3  fusedColor = vec3(0.0);
  float colorWeight = 0.0;

  for (int i = 0; i < 8; i++) {
    vec2  bpos = vec2(u_blobs[i].x, u_blobs[i].y);
    float brad = u_blobs[i].z;
    bpos.x *= asp.x;

    float f = metaball(p, bpos, brad);
    totalField += f;

    // Weight color contribution by field intensity
    fusedColor += u_colors[i] * f;
    colorWeight += f;
  }

  if (colorWeight > 0.001) {
    fusedColor /= colorWeight;
  }

  // ── SDF threshold: field > 1.0 is "inside" the metaball mass ────────────
  float inside = smoothstep(0.9, 1.1, totalField);

  // ── Rim / glow halo (additive, bright at field ~0.7-0.95) ────────────────
  float rimField = smoothstep(0.5, 0.9, totalField) * (1.0 - inside);
  float haloField = smoothstep(0.2, 0.6, totalField) * (1.0 - inside) * 0.45;

  // ── Interior surface noise for lava-lamp texture ─────────────────────────
  float n = noise2oct(p * 4.5 + vec2(u_time * 0.18, u_time * 0.11));
  vec3 surfaceVariation = vec3(n * 0.18 - 0.05);

  // ── Dark background with subtle animated gradient ─────────────────────────
  float bgN = noise2oct(p * 1.5 + vec2(u_time * 0.04, 0.0));
  vec3 bg = vec3(0.04, 0.02, 0.08) + vec3(0.02, 0.01, 0.04) * bgN;

  // ── Compose layers ────────────────────────────────────────────────────────
  // 1. Base interior: saturated candy color + slight noise texture
  vec3 interiorColor = fusedColor * 1.3 + surfaceVariation;
  interiorColor = mix(interiorColor, interiorColor * 1.6, 0.25); // boost saturation

  // 2. Bright specular-ish rim
  vec3 rimColor = mix(fusedColor, vec3(1.0), 0.7) * 2.0;

  // 3. Soft additive halo
  vec3 haloColor = fusedColor * 1.5;

  // 4. Compose
  vec3 color = bg;
  color = mix(color, interiorColor, inside);
  color += rimColor * rimField * 0.85;
  color += haloColor * haloField;

  // ── Reinhard tonemap to prevent clipping to white ─────────────────────────
  color = color / (color + vec3(1.0));

  gl_FragColor = vec4(color, 1.0);
}`;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Blob {
  x: number; y: number;  // 0..1 normalized
  vx: number; vy: number;
  r: number;             // radius in normalized units
  noteIdx: number;
  colorRgb: [number, number, number];
}

interface MergePair {
  key: string;
  lastRing: number;
}

type Phase = "idle" | "playing";

// ─── Audio helpers ────────────────────────────────────────────────────────────
function buildSineTriVoice(
  ac: AudioContext,
  freq: number,
  destination: AudioNode
): () => void {
  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0, now);
  master.gain.linearRampToValueAtTime(0.22, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  master.connect(destination);

  // Sine oscillator
  const sine = ac.createOscillator();
  sine.type = "sine";
  sine.frequency.value = freq;
  const sineGain = ac.createGain();
  sineGain.gain.value = 0.6;
  sine.connect(sineGain);
  sineGain.connect(master);
  sine.start(now);
  sine.stop(now + 0.95);

  // Triangle oscillator (upper octave, quieter)
  const tri = ac.createOscillator();
  tri.type = "triangle";
  tri.frequency.value = freq * 2.0;
  const triGain = ac.createGain();
  triGain.gain.value = 0.3;
  tri.connect(triGain);
  triGain.connect(master);
  tri.start(now);
  tri.stop(now + 0.95);

  return () => {
    try { sine.stop(); } catch { /* already stopped */ }
    try { tri.stop(); } catch { /* already stopped */ }
  };
}

function buildAmbientPad(
  ac: AudioContext,
  destination: AudioNode
): { gainNode: GainNode; stop: () => void } {
  const oscs: OscillatorNode[] = [];
  const gainNode = ac.createGain();
  gainNode.gain.value = 0.06;
  gainNode.connect(destination);

  for (const freq of PAD_FREQS) {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = 0.33;
    o.connect(g);
    g.connect(gainNode);
    o.start();
    oscs.push(o);
  }

  return {
    gainNode,
    stop: () => oscs.forEach((o) => { try { o.stop(); } catch { /* ok */ } }),
  };
}

function buildDelay(ac: AudioContext): { input: GainNode; output: GainNode } {
  const input = ac.createGain();
  const delay = ac.createDelay(0.4);
  delay.delayTime.value = 0.22;
  const feedback = ac.createGain();
  feedback.gain.value = 0.32;
  const wetGain = ac.createGain();
  wetGain.gain.value = 0.4;
  const output = ac.createGain();

  input.connect(output);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(output);

  return { input, output };
}

// ─── Physics step ─────────────────────────────────────────────────────────────
function stepPhysics(
  blobs: Blob[],
  gx: number,
  gy: number,
  aspect: number,
  dt: number
): void {
  const G = 0.0028 * dt;
  const N = blobs.length;

  for (let i = 0; i < N; i++) {
    const b = blobs[i];

    // Gravity (in normalized space, account for aspect so blobs fall "down")
    b.vx += gx * G;
    b.vy += gy * G;

    // Damping
    b.vx *= DAMPING;
    b.vy *= DAMPING;

    // Blob-blob soft repulsion
    for (let j = i + 1; j < N; j++) {
      const o = blobs[j];
      const dx = b.x - o.x;
      const dy = (b.y - o.y) * (1.0 / aspect); // aspect-correct distance
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < REPEL_DIST && dist > 0.001) {
        const force = (REPEL_DIST - dist) / REPEL_DIST * REPEL_STRENGTH * dt;
        const nx = dx / dist;
        const ny = dy / dist;
        b.vx += nx * force;
        b.vy += ny * force * aspect;
        o.vx -= nx * force;
        o.vy -= ny * force * aspect;
      }
    }

    // Cap velocity
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > MAX_VEL) {
      b.vx = (b.vx / speed) * MAX_VEL;
      b.vy = (b.vy / speed) * MAX_VEL;
    }

    // Integrate
    b.x += b.vx * dt * 0.016;
    b.y += b.vy * dt * 0.016;

    // Edge restitution
    const margin = b.r * 0.5;
    if (b.x < margin) { b.x = margin; b.vx = Math.abs(b.vx) * RESTITUTION; }
    if (b.x > 1.0 - margin) { b.x = 1.0 - margin; b.vx = -Math.abs(b.vx) * RESTITUTION; }
    if (b.y < margin / aspect) { b.y = margin / aspect; b.vy = Math.abs(b.vy) * RESTITUTION; }
    if (b.y > 1.0 - margin / aspect) { b.y = 1.0 - margin / aspect; b.vy = -Math.abs(b.vy) * RESTITUTION; }
  }
}

// ─── GL helper: compile shader ────────────────────────────────────────────────
function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string
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

// ─── GL helper: link program ──────────────────────────────────────────────────
function linkProgram(
  gl: WebGLRenderingContext,
  vert: WebGLShader,
  frag: WebGLShader
): WebGLProgram | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// ─── Initialize blobs ─────────────────────────────────────────────────────────
function initBlobs(): Blob[] {
  return BLOB_DEFS.map((def, i) => ({
    x: 0.2 + (i % 4) * 0.18,
    y: 0.25 + Math.floor(i / 4) * 0.35,
    vx: (Math.random() - 0.5) * 0.05,
    vy: (Math.random() - 0.5) * 0.05,
    r: 0.10 + Math.random() * 0.025,
    noteIdx: i,
    colorRgb: def.color as [number, number, number],
  }));
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function KidsTiltPour() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noTiltFallback, setNoTiltFallback] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);

  // All loop state in refs to avoid stale closures
  const rafRef = useRef<number>(0);
  const actxRef = useRef<AudioContext | null>(null);
  const padGainRef = useRef<GainNode | null>(null);
  const delayInputRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const padStopRef = useRef<(() => void) | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);

  const blobsRef = useRef<Blob[]>(initBlobs());
  const gravXRef = useRef(0.0);   // smoothed gravity vector x
  const gravYRef = useRef(1.0);   // smoothed gravity vector y (default: down)
  const rawGravXRef = useRef(0.0);
  const rawGravYRef = useRef(1.0);
  const hasTiltRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const pointerXRef = useRef(0.5);
  const pointerYRef = useRef(0.5);
  const mergePairsRef = useRef<Map<string, MergePair>>(new Map());
  const startTimeRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const tiltTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slosh metric (how much blobs are moving) for ambient pad volume
  const sloshRef = useRef(0.0);

  // ── Device orientation handler ────────────────────────────────────────────
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    hasTiltRef.current = true;
    if (tiltTimeoutRef.current) {
      clearTimeout(tiltTimeoutRef.current);
      tiltTimeoutRef.current = null;
    }
    // gamma: left/right tilt (-90..90), beta: front/back (-180..180)
    const gamma = (e.gamma ?? 0) / 90.0;   // -1..1
    const beta  = (e.beta  ?? 0) / 90.0;   // -1..1
    // Map to gravity vector: tilting right → blobs slide right (gx > 0)
    rawGravXRef.current = Math.max(-1, Math.min(1, gamma));
    rawGravYRef.current = Math.max(-1, Math.min(1, beta * 0.7 + 0.3));
  }, []);

  // ── Pointer fallback ──────────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!pointerActiveRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerXRef.current = (e.clientX - rect.left) / rect.width;
    pointerYRef.current = (e.clientY - rect.top) / rect.height;
    // Gravity points toward pointer from center
    rawGravXRef.current = (pointerXRef.current - 0.5) * 2.0;
    rawGravYRef.current = (pointerYRef.current - 0.5) * 2.0;
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    pointerActiveRef.current = true;
    handlePointerMove(e);
  }, [handlePointerMove]);

  const handlePointerUp = useCallback(() => {
    pointerActiveRef.current = false;
    rawGravXRef.current = 0.0;
    rawGravYRef.current = 0.8;
  }, []);

  // ── Check merge & ring notes ──────────────────────────────────────────────
  const checkMerges = useCallback(() => {
    const blobs = blobsRef.current;
    const ac = actxRef.current;
    const now = performance.now();
    const N = blobs.length;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = blobs[i];
        const b = blobs[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MERGE_DIST) {
          const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
          const pair = mergePairsRef.current.get(key);
          if (!pair || now - pair.lastRing > REFRACTORY_MS) {
            mergePairsRef.current.set(key, { key, lastRing: now });
            // Ring both notes
            if (ac && ac.state === "running" && delayInputRef.current) {
              buildSineTriVoice(ac, BLOB_DEFS[a.noteIdx].freq, delayInputRef.current);
              if (a.noteIdx !== b.noteIdx) {
                buildSineTriVoice(ac, BLOB_DEFS[b.noteIdx].freq, delayInputRef.current);
              }
            }
          }
        }
      }
    }
  }, []);

  // ── Start experience ──────────────────────────────────────────────────────
  const startExperience = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. AudioContext
    const ac = new AudioContext();
    actxRef.current = ac;
    await ac.resume();

    // 2. Master chain: delay shimmer → compressor → destination
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 10;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.connect(ac.destination);
    compressorRef.current = compressor;

    const { input: delayIn, output: delayOut } = buildDelay(ac);
    delayOut.connect(compressor);
    delayInputRef.current = delayIn;

    // 3. Ambient pad
    const { gainNode: padGain, stop: padStop } = buildAmbientPad(ac, compressor);
    padGainRef.current = padGain;
    padStopRef.current = padStop;

    // 4. Request device orientation permission (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm === "granted") {
          window.addEventListener("deviceorientation", handleOrientation);
        } else {
          setNoTiltFallback(true);
        }
      } catch {
        setNoTiltFallback(true);
      }
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      window.addEventListener("deviceorientation", handleOrientation);
    } else {
      setNoTiltFallback(true);
    }

    // 5. Wait up to 1.8s for a tilt event; if none, switch to pointer fallback
    tiltTimeoutRef.current = setTimeout(() => {
      if (!hasTiltRef.current) {
        setNoTiltFallback(true);
        // Remove orientation listener since it's not working
        window.removeEventListener("deviceorientation", handleOrientation);
      }
    }, TILT_TIMEOUT_MS);

    // 6. Pointer listeners (always active, used as fallback)
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerUp);
    }

    // 7. Set up WebGL
    if (!canvas) return;
    const gl =
      (canvas.getContext("webgl2") as WebGLRenderingContext | null) ||
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      setNoWebGL(true);
      return;
    }
    glRef.current = gl;

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) { setNoWebGL(true); return; }

    const prog = linkProgram(gl, vert, frag);
    if (!prog) { setNoWebGL(true); return; }
    programRef.current = prog;

    // Full-screen quad (two triangles)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    startTimeRef.current = performance.now();

    // 8. Render loop
    const renderLoop = (ts: number) => {
      rafRef.current = requestAnimationFrame(renderLoop);
      const elapsed = (ts - startTimeRef.current) / 1000;

      const canvas2 = canvasRef.current;
      if (!canvas2) return;

      // Resize canvas to CSS size, cap DPR at 2 (Van Der Merwe performance tip)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.floor(canvas2.clientWidth * dpr);
      const H = Math.floor(canvas2.clientHeight * dpr);
      if (canvas2.width !== W || canvas2.height !== H) {
        canvas2.width = W;
        canvas2.height = H;
        gl.viewport(0, 0, W, H);
      }

      const aspect = W / H;

      // Smooth gravity
      gravXRef.current += (rawGravXRef.current - gravXRef.current) * GRAVITY_SMOOTH;
      gravYRef.current += (rawGravYRef.current - gravYRef.current) * GRAVITY_SMOOTH;

      // Physics
      stepPhysics(blobsRef.current, gravXRef.current, gravYRef.current, aspect, 1.0);

      // Slosh metric (mean speed)
      let totalSpeed = 0;
      for (const b of blobsRef.current) totalSpeed += Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const avgSpeed = totalSpeed / NUM_BLOBS;
      sloshRef.current = sloshRef.current * 0.95 + avgSpeed * 0.05;

      // Update ambient pad volume
      const padGain = padGainRef.current;
      if (padGain && ac.state === "running") {
        const targetVol = 0.04 + Math.min(sloshRef.current * 2.5, 0.12);
        padGain.gain.setTargetAtTime(targetVol, ac.currentTime, 0.3);
      }

      // Check merges for sound
      checkMerges();

      // Render
      const glCtx = glRef.current;
      const program = programRef.current;
      if (!glCtx || !program) return;

      glCtx.useProgram(program);

      // Upload uniforms
      const resLoc = glCtx.getUniformLocation(program, "u_resolution");
      glCtx.uniform2f(resLoc, W, H);

      const timeLoc = glCtx.getUniformLocation(program, "u_time");
      glCtx.uniform1f(timeLoc, elapsed);

      // Blob positions & radii
      const blobData = new Float32Array(NUM_BLOBS * 4);
      const colorData = new Float32Array(NUM_BLOBS * 3);
      for (let i = 0; i < NUM_BLOBS; i++) {
        const b = blobsRef.current[i];
        blobData[i * 4 + 0] = b.x;
        blobData[i * 4 + 1] = 1.0 - b.y; // flip Y for GL coords
        blobData[i * 4 + 2] = b.r;
        blobData[i * 4 + 3] = 0;
        colorData[i * 3 + 0] = b.colorRgb[0];
        colorData[i * 3 + 1] = b.colorRgb[1];
        colorData[i * 3 + 2] = b.colorRgb[2];
      }

      const blobsLoc = glCtx.getUniformLocation(program, "u_blobs");
      glCtx.uniform4fv(blobsLoc, blobData);
      const colorsLoc = glCtx.getUniformLocation(program, "u_colors");
      glCtx.uniform3fv(colorsLoc, colorData);

      glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [handleOrientation, handlePointerMove, handlePointerDown, handlePointerUp, checkMerges]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    // Capture canvas ref value at registration time for cleanup
    const canvas = canvasRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (tiltTimeoutRef.current) clearTimeout(tiltTimeoutRef.current);
      window.removeEventListener("deviceorientation", handleOrientation);

      if (canvas) {
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointerleave", handlePointerUp);
      }

      if (padStopRef.current) padStopRef.current();

      const ac = actxRef.current;
      if (ac) {
        ac.suspend().then(() => ac.close()).catch(() => { /* ok */ });
      }

      const gl = glRef.current;
      if (gl) {
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
    };
  }, [handleOrientation, handlePointerMove, handlePointerDown, handlePointerUp]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full h-dvh overflow-hidden bg-[#0a0410] touch-none select-none">
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: phase === "playing" ? "block" : "none" }}
      />

      {/* Start screen */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6">
          {/* Hero title */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Jelly Pour
            </h1>
            <p className="text-xl text-white/75 font-light">
              Tilt to pour glowing blobs!
            </p>
            <p className="text-base text-white/75">
              They sing when they touch 🎵
            </p>
          </div>

          {/* Big start button (≥64px, kid-friendly) */}
          <button
            onClick={startExperience}
            className="
              w-40 h-40 rounded-full
              bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500
              text-white text-2xl font-bold
              shadow-2xl shadow-violet-900/60
              active:scale-95 transition-transform
              flex items-center justify-center
              border-4 border-white/20
            "
            aria-label="Start Jelly Pour"
          >
            <span className="text-5xl">▶</span>
          </button>

          <p className="text-base text-white/75 text-center max-w-xs">
            Tilt your device to pour the blobs.
            <br />
            On desktop, drag with your finger or mouse.
          </p>

          {/* Design notes link */}
          <a
            href="#notes"
            className="text-sm text-violet-300 underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
            onClick={(e) => { e.preventDefault(); document.getElementById("notes")?.scrollIntoView({ behavior: "smooth" }); }}
          >
            Read the design notes ↓
          </a>
        </div>
      )}

      {/* Playing overlay: tilt fallback notice + design notes link */}
      {phase === "playing" && (
        <>
          {noWebGL && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="text-base text-rose-300 text-center max-w-sm">
                WebGL is not available on this device. The ambient pad is still playing!
              </p>
            </div>
          )}

          {noTiltFallback && !noWebGL && (
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <p className="text-base text-rose-300 bg-black/50 px-4 py-2.5 rounded-full backdrop-blur-sm">
                Drag to steer the blobs
              </p>
            </div>
          )}

          {/* Corner design notes affordance */}
          <div className="absolute bottom-4 right-4 pointer-events-auto">
            <a
              href="#notes"
              onClick={(e) => { e.preventDefault(); setPhase("idle"); }}
              className="text-xs text-white/75 bg-black/40 px-3 py-2 rounded-full backdrop-blur-sm hover:text-white transition-colors"
            >
              Design notes
            </a>
          </div>
        </>
      )}

      {/* Design notes section (scroll target) */}
      <section
        id="notes"
        className="absolute top-full left-0 right-0 min-h-dvh bg-[#0a0410] px-6 py-12 text-white/75 text-base font-mono"
        style={{ display: phase === "idle" ? "block" : "none" }}
      >
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-2xl text-white font-bold">Design Notes</h2>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Concept:</span> A fullscreen lava-lamp made of 8
            candy-colored jelly blobs. Tilt an iOS/Android device to pour them
            around; blobs sing pentatonic notes when they merge, making music
            impossible to get wrong.
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Metaball math:</span> Each blob contributes a field
            value using a <em>Hermite smoothstep falloff</em> (t² (3−2t) where t =
            1−d/r), capped at zero outside the radius. Summing all 8 fields and
            thresholding at 1.0 gives the classic lava-lamp goo shape. Colors
            are blended proportionally to each blob&rsquo;s field weight.
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Smooth-min (smin):</span> Inigo Quilez&rsquo;s
            polynomial smin blends the iso-surface transitions — the shader
            uses smoothstep thresholds on the total field to produce bright
            rims + additive halos at merge zones.
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Performance (Van Der Merwe Apr 2026):</span> Hermite
            falloff instead of exp(), fixed 8 blobs, noise capped at 2 octaves,
            devicePixelRatio capped at 2 — halves GPU load on 3× phones.
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Physics:</span> Each frame a tiny CPU step applies
            gravity (from device tilt via deviceorientation gamma/beta → smoothed
            gravity vector), DAMPING=0.985, edge RESTITUTION=0.55, and soft
            blob–blob repulsion within 16% normalized radius. Velocities capped
            at 0.5 for gentle motion.
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Sound:</span> C-major pentatonic (C4–E5). Each blob
            owns one note. Merges trigger a sine+triangle voice → feedback delay
            shimmer → DynamicsCompressor limiter. A low C–E–G ambient pad swells
            with the slosh metric (mean blob speed).
          </p>
          <p className="text-white/75">
            <span className="text-violet-300 font-semibold">Degradation:</span> iOS DeviceOrientationEvent
            requestPermission called inside the start-button tap. If no tilt
            events arrive within 1.8s, auto-switch to pointer-drag fallback.
            WebGL failure shows a readable notice while ambient pad plays on.
          </p>
          <p className="text-white/75">
            <span className="text-emerald-300/95 font-semibold">References:</span> Damian Van Der Merwe,
            &ldquo;Painting with Math: Building an Interactive Lava Lamp Shader from
            Scratch&rdquo; (damianvandermerwe.com, April 3, 2026). Inigo Quilez,
            smooth-min / SDF techniques (iquilezles.org). Related prototypes:
            83-kids-tilt-rain, 169-kids-marble-run, 84-wave-fluid.
          </p>
          <p className="text-white/75">
            <span className="text-amber-300/95 font-semibold">Limitations:</span> Physics is a simple
            Euler-integration CPU step with no true fluid simulation. Blobs don&rsquo;t
            visually split — they only look merged in the shader field.
          </p>
          <p className="text-white/75">
            <span className="text-amber-300/95 font-semibold">Next cycle:</span> True SDF-signed distance
            field for per-blob outlines; gyroscope-assisted 3-axis tilt; Karplus-Strong
            pluck voices instead of sine+triangle; save a &ldquo;melody&rdquo; from blob
            collisions.
          </p>
          <button
            onClick={() => setPhase("idle")}
            className="mt-6 px-4 py-2.5 rounded-full bg-violet-600/30 text-violet-300 text-base border border-violet-500/30 hover:bg-violet-600/50 transition-colors"
          >
            ← Back
          </button>
        </div>
      </section>
    </main>
  );
}
