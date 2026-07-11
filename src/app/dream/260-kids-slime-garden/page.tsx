"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * 260 · Kids Slime Garden
 * Touch the dark screen -> grow a living, glowing creature-network and
 * hear it sing as the strands connect.
 *
 * Physarum polycephalum transport-network agent simulation (the
 * Jones/Jenson "mold" algorithm). ~3500 agents wander a 220x220 trail
 * grid on the CPU, sensing front-left / front / front-right, steering
 * toward the brightest trail, depositing as they go. The grid diffuses
 * (small blur) and decays each frame, then is uploaded as a WebGL2 R8
 * texture and rendered through a fragment shader that maps trail
 * intensity to a bioluminescent gold -> teal -> magenta glow.
 *
 * Taps/holds drop bright food attractors; agents steer toward food so
 * tendrils thicken into a network between the spots. Up to 5 food nodes,
 * each a C-major-pentatonic voice whose gain + brightness rise with the
 * local glow near it. Always-on soft sine pad; master limiter.
 * ------------------------------------------------------------------ */

// Trail grid resolution (CPU sim). Square keeps sensing isotropic.
const GRID = 220;
const GRID_N = GRID * GRID;
const AGENT_COUNT = 3500;

// Physarum tuning (units in grid cells / radians).
const SENSOR_DIST = 9.0; // how far ahead agents sense
const SENSOR_ANGLE = 0.5; // radians between center and side sensors
const TURN_ANGLE = 0.42; // how sharply they steer per step
const STEP = 1.0; // forward distance per step
const DEPOSIT = 0.16; // trail laid each step (0..1 scale)
const DECAY = 0.965; // trail multiplier each frame
const FOOD_PULL = 0.55; // extra steer weight toward nearest food
const FOOD_DEPOSIT = 0.42; // glow injected at food each frame

const MAX_FOOD = 5;
// C-major pentatonic: C3 E3 G3 A3 C4
const FOOD_HZ = [130.81, 164.81, 196.0, 220.0, 261.63];

// ---------------- shader sources ----------------

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Map trail intensity -> bioluminescent additive glow over deep indigo.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_trail;
uniform float u_time;

vec3 palette(float t){
  // gold -> teal -> magenta, brightening with intensity
  vec3 gold    = vec3(1.00, 0.78, 0.30);
  vec3 teal    = vec3(0.16, 0.92, 0.78);
  vec3 magenta = vec3(0.95, 0.30, 0.85);
  vec3 c;
  if (t < 0.5) {
    c = mix(teal, gold, smoothstep(0.0, 0.5, t));
  } else {
    c = mix(gold, magenta, smoothstep(0.5, 1.0, t));
  }
  return c;
}

void main(){
  float v = texture(u_trail, v_uv).r;
  // gentle gamma so faint tendrils still read
  float g = pow(clamp(v, 0.0, 1.0), 0.65);

  // deep indigo background with a faint living shimmer
  float shimmer = 0.012 * sin(u_time * 0.6 + v_uv.x * 9.0 + v_uv.y * 7.0);
  vec3 bg = vec3(0.035, 0.02, 0.09) + shimmer;

  vec3 glow = palette(g) * g * 1.9;
  // a soft white-hot core where the network is densest
  glow += vec3(0.9, 0.95, 1.0) * smoothstep(0.7, 1.0, g) * 0.6;

  vec3 col = bg + glow;
  // soft vignette to settle the eye
  vec2 d = v_uv - 0.5;
  col *= 1.0 - 0.45 * dot(d, d);

  outColor = vec4(col, 1.0);
}`;

type Food = {
  active: boolean;
  // grid coords
  gx: number;
  gy: number;
  // smoothed local glow near node (0..~1)
  glow: number;
};

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
    console.warn("shader compile:", gl.getShaderInfoLog(sh));
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
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export default function KidsSlimeGarden() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [glOk, setGlOk] = useState<boolean | null>(null);

  // ---- mutable sim state (refs, never React state, to avoid stale closures) ----
  const rafRef = useRef<number | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);

  // trail grids (double buffer for diffusion)
  const trailRef = useRef<Float32Array>(new Float32Array(GRID_N));
  const trailNextRef = useRef<Float32Array>(new Float32Array(GRID_N));
  const uploadRef = useRef<Uint8Array>(new Uint8Array(GRID_N));

  // agents: x, y in grid space; heading in radians
  const axRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT));
  const ayRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT));
  const ahRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT));

  const foodRef = useRef<Food[]>(
    Array.from({ length: MAX_FOOD }, () => ({
      active: false,
      gx: 0,
      gy: 0,
      glow: 0,
    })),
  );
  const nextFoodRef = useRef<number>(0);

  // audio
  const audioRef = useRef<AudioContext | null>(null);
  const voicesRef = useRef<
    {
      osc: OscillatorNode;
      gain: GainNode;
      filter: BiquadFilterNode;
    }[]
  >([]);
  const startedRef = useRef(false);

  // pointer hold tracking (in grid coords)
  const holdRef = useRef<{ down: boolean; gx: number; gy: number }>({
    down: false,
    gx: 0,
    gy: 0,
  });

  // ---------------- audio setup ----------------
  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    type WindowWithAudio = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx =
      window.AudioContext || (window as WindowWithAudio).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    audioRef.current = ac;

    // master chain: bus -> compressor (limiter) -> destination
    const master = ac.createGain();
    master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 18;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ac.destination);

    // always-on soft sine pad: C3 + G3
    [130.81, 196.0].forEach((hz, i) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      const g = ac.createGain();
      g.gain.value = 0.0;
      o.connect(g);
      g.connect(master);
      o.start();
      g.gain.setTargetAtTime(i === 0 ? 0.06 : 0.04, ac.currentTime, 1.2);
    });

    // food voices (one per possible node), gain driven by glow each frame
    const voices = FOOD_HZ.map((hz) => {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 300;
      filter.Q.value = 0.7;
      const gain = ac.createGain();
      gain.gain.value = 0.0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      return { osc, gain, filter };
    });
    voicesRef.current = voices;
  }, []);

  // ---------------- sim init ----------------
  const initSim = useCallback(() => {
    const ax = axRef.current;
    const ay = ayRef.current;
    const ah = ahRef.current;
    // seed agents in a soft central disc, random headings
    for (let i = 0; i < AGENT_COUNT; i++) {
      const r = Math.sqrt(Math.random()) * GRID * 0.32;
      const a = Math.random() * Math.PI * 2;
      ax[i] = GRID / 2 + Math.cos(a) * r;
      ay[i] = GRID / 2 + Math.sin(a) * r;
      ah[i] = Math.random() * Math.PI * 2;
    }
    trailRef.current.fill(0);
    trailNextRef.current.fill(0);
  }, []);

  // sample trail at a float grid position (clamped, nearest)
  const sampleTrail = useCallback((trail: Float32Array, x: number, y: number) => {
    let gx = x | 0;
    let gy = y | 0;
    if (gx < 0) gx = 0;
    else if (gx >= GRID) gx = GRID - 1;
    if (gy < 0) gy = 0;
    else if (gy >= GRID) gy = GRID - 1;
    return trail[gy * GRID + gx];
  }, []);

  // ---------------- one sim step ----------------
  const stepSim = useCallback(() => {
    const trail = trailRef.current;
    const next = trailNextRef.current;
    const ax = axRef.current;
    const ay = ayRef.current;
    const ah = ahRef.current;
    const foods = foodRef.current;

    // 1) inject food glow
    for (let f = 0; f < foods.length; f++) {
      const food = foods[f];
      if (!food.active) continue;
      const cx = food.gx;
      const cy = food.gy;
      for (let dy = -3; dy <= 3; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= GRID) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const xx = cx + dx;
          if (xx < 0 || xx >= GRID) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 > 9) continue;
          const amt = FOOD_DEPOSIT * (1 - d2 / 10);
          const idx = yy * GRID + xx;
          const nv = trail[idx] + amt;
          trail[idx] = nv > 1 ? 1 : nv;
        }
      }
    }

    // 2) move agents (sense -> steer -> step -> deposit)
    for (let i = 0; i < AGENT_COUNT; i++) {
      const x = ax[i];
      const y = ay[i];
      let h = ah[i];

      // sensor readings
      const fx = x + Math.cos(h) * SENSOR_DIST;
      const fy = y + Math.sin(h) * SENSOR_DIST;
      const lh = h - SENSOR_ANGLE;
      const rh = h + SENSOR_ANGLE;
      const lx = x + Math.cos(lh) * SENSOR_DIST;
      const ly = y + Math.sin(lh) * SENSOR_DIST;
      const rx = x + Math.cos(rh) * SENSOR_DIST;
      const ry = y + Math.sin(rh) * SENSOR_DIST;

      const cF = sampleTrail(trail, fx, fy);
      const cL = sampleTrail(trail, lx, ly);
      const cR = sampleTrail(trail, rx, ry);

      // steer toward brightest sensor
      if (cF >= cL && cF >= cR) {
        // keep heading
      } else if (cF < cL && cF < cR) {
        // random turn either way
        h += Math.random() < 0.5 ? TURN_ANGLE : -TURN_ANGLE;
      } else if (cL > cR) {
        h -= TURN_ANGLE;
      } else {
        h += TURN_ANGLE;
      }

      // gentle pull toward nearest active food
      let bestD2 = Infinity;
      let bgx = 0;
      let bgy = 0;
      for (let f = 0; f < foods.length; f++) {
        const food = foods[f];
        if (!food.active) continue;
        const ddx = food.gx - x;
        const ddy = food.gy - y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bgx = ddx;
          bgy = ddy;
        }
      }
      if (bestD2 < 90 * 90 && bestD2 > 1) {
        const target = Math.atan2(bgy, bgx);
        // shortest angular difference
        let diff = target - h;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        h += diff * FOOD_PULL * 0.12;
      }

      // step forward
      let nx = x + Math.cos(h) * STEP;
      let ny = y + Math.sin(h) * STEP;

      // bounce softly off edges (wrap-free keeps the network framed)
      if (nx < 1) {
        nx = 1;
        h = Math.PI - h + (Math.random() - 0.5) * 0.4;
      } else if (nx > GRID - 2) {
        nx = GRID - 2;
        h = Math.PI - h + (Math.random() - 0.5) * 0.4;
      }
      if (ny < 1) {
        ny = 1;
        h = -h + (Math.random() - 0.5) * 0.4;
      } else if (ny > GRID - 2) {
        ny = GRID - 2;
        h = -h + (Math.random() - 0.5) * 0.4;
      }

      ax[i] = nx;
      ay[i] = ny;
      ah[i] = h;

      // deposit
      const di = (ny | 0) * GRID + (nx | 0);
      const dv = trail[di] + DEPOSIT;
      trail[di] = dv > 1 ? 1 : dv;
    }

    // 3) diffuse (3x3 box blur) + decay -> next, then swap
    for (let y = 0; y < GRID; y++) {
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < GRID - 1 ? y + 1 : GRID - 1;
      const rowY = y * GRID;
      const row0 = y0 * GRID;
      const row1 = y1 * GRID;
      for (let x = 0; x < GRID; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x < GRID - 1 ? x + 1 : GRID - 1;
        const sum =
          trail[row0 + x0] +
          trail[row0 + x] +
          trail[row0 + x1] +
          trail[rowY + x0] +
          trail[rowY + x] +
          trail[rowY + x1] +
          trail[row1 + x0] +
          trail[row1 + x] +
          trail[row1 + x1];
        next[rowY + x] = (sum / 9) * DECAY;
      }
    }
    trailRef.current = next;
    trailNextRef.current = trail;
  }, [sampleTrail]);

  // ---------------- update food audio from glow ----------------
  const applyAudio = useCallback(() => {
    const ac = audioRef.current;
    if (!ac) return;
    const trail = trailRef.current;
    const foods = foodRef.current;
    const voices = voicesRef.current;
    const t = ac.currentTime;
    for (let f = 0; f < foods.length; f++) {
      const food = foods[f];
      const voice = voices[f];
      if (!voice) continue;
      let target = 0;
      if (food.active) {
        // average glow in a small disc around the node = connectivity
        let sum = 0;
        let cnt = 0;
        for (let dy = -6; dy <= 6; dy += 2) {
          const yy = food.gy + dy;
          if (yy < 0 || yy >= GRID) continue;
          for (let dx = -6; dx <= 6; dx += 2) {
            const xx = food.gx + dx;
            if (xx < 0 || xx >= GRID) continue;
            sum += trail[yy * GRID + xx];
            cnt++;
          }
        }
        target = cnt > 0 ? sum / cnt : 0;
      }
      // smooth the measured glow
      food.glow += (target - food.glow) * 0.1;
      const gv = food.glow;
      // gain & lowpass brightness rise with local connectivity
      const gain = food.active ? 0.04 + gv * 0.16 : 0.0;
      const cutoff = 250 + gv * 2400;
      voice.gain.gain.setTargetAtTime(gain, t, 0.15);
      voice.filter.frequency.setTargetAtTime(cutoff, t, 0.15);
    }
  }, []);

  // ---------------- render ----------------
  const drawFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const tex = texRef.current;
    if (!gl || !prog || !tex) return;

    // upload trail grid -> R8 texture
    const trail = trailRef.current;
    const up = uploadRef.current;
    for (let i = 0; i < GRID_N; i++) {
      const v = trail[i];
      up[i] = v >= 1 ? 255 : (v * 255) | 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // R8 rows are GRID bytes wide; force tight packing so non-mult-of-4
    // widths upload row-aligned correctly.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      GRID,
      GRID,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      up,
    );

    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    const tLoc = gl.getUniformLocation(prog, "u_time");
    if (tLoc) gl.uniform1f(tLoc, performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, []);

  // ---------------- main effect: set up GL + loop ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setGlOk(false);
      return;
    }
    setGlOk(true);
    glRef.current = gl;

    const prog = makeProgram(gl, VERT, FRAG);
    if (!prog) {
      setGlOk(false);
      return;
    }
    progRef.current = prog;

    // fullscreen triangle pair
    const quad = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // trail texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texRef.current = tex;
    gl.useProgram(prog);
    const trailLoc = gl.getUniformLocation(prog, "u_trail");
    if (trailLoc) gl.uniform1i(trailLoc, 0);

    initSim();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let acc = 0;
    const FIXED = 1000 / 60;

    const loop = () => {
      const now = performance.now();
      acc += now - last;
      last = now;
      // cap to avoid spiral-of-death after a tab stall
      if (acc > 200) acc = 200;
      let steps = 0;
      while (acc >= FIXED && steps < 3) {
        // hold-to-feed refresh of the held food node position
        const hold = holdRef.current;
        if (hold.down) {
          const foods = foodRef.current;
          // keep the most-recently-placed node alive under the finger
          const idx = (nextFoodRef.current - 1 + MAX_FOOD) % MAX_FOOD;
          const food = foods[idx];
          if (food.active) {
            food.gx = hold.gx;
            food.gy = hold.gy;
          }
        }
        stepSim();
        acc -= FIXED;
        steps++;
      }
      applyAudio();
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const ac = audioRef.current;
      if (ac) {
        ac.close().catch(() => {});
        audioRef.current = null;
      }
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      glRef.current = null;
      progRef.current = null;
      texRef.current = null;
    };
  }, [initSim, stepSim, applyAudio, drawFrame]);

  // ---------------- pointer -> food ----------------
  const dropFood = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    const gx = Math.max(0, Math.min(GRID - 1, Math.round(u * GRID)));
    const gy = Math.max(0, Math.min(GRID - 1, Math.round(v * GRID)));
    const foods = foodRef.current;
    const slot = nextFoodRef.current % MAX_FOOD;
    foods[slot] = { active: true, gx, gy, glow: foods[slot]?.glow ?? 0 };
    nextFoodRef.current = (nextFoodRef.current + 1) % MAX_FOOD;
    holdRef.current = { down: true, gx, gy };
    return slot;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!startedRef.current) return;
      (e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
      dropFood(e.clientX, e.clientY);
    },
    [dropFood],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!startedRef.current) return;
      if (!holdRef.current.down) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      holdRef.current.gx = Math.max(0, Math.min(GRID - 1, Math.round(u * GRID)));
      holdRef.current.gy = Math.max(0, Math.min(GRID - 1, Math.round(v * GRID)));
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    holdRef.current.down = false;
  }, []);

  const handleStart = useCallback(() => {
    startAudio();
    const ac = audioRef.current;
    if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    startedRef.current = true;
    setStarted(true);
  }, [startAudio]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#070414] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* title (small, top-left) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <h1 className="text-xl font-semibold text-foreground drop-shadow">
          Slime Garden
        </h1>
        <p className="text-base text-muted-foreground drop-shadow">
          Touch to grow glowing creatures
        </p>
      </div>

      {/* design notes link */}
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/260-kids-slime-garden/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 z-10 text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4"
      >
        design notes
      </a>

      {/* WebGL2 unavailable notice */}
      {glOk === false && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-violet-300">
            This browser can&apos;t show the glowing slime garden (WebGL2 is
            unavailable), but a gentle tone is still playing. Try a recent
            Chrome, Safari, or Firefox.
          </p>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#070414]/70 backdrop-blur-sm">
          <div className="px-6 text-center">
            <h2 className="text-xl font-semibold text-foreground">
              Grow a glowing garden
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              Tap and hold anywhere. Little creatures crawl toward your touch
              and sing as they connect.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-full bg-violet-400/90 px-8 py-2.5 text-xl font-semibold text-[#07121a] shadow-lg shadow-violet-400/30 active:scale-95"
          >
            Start
          </button>
        </div>
      )}
    </main>
  );
}
