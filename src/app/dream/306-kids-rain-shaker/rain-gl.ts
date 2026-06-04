// Raw WebGL2 renderer for the rain-shaker.
// ────────────────────────────────────────────────────────────────────────────
// The scene is a soft dark→dawn vertical gradient with a warm shower of falling
// particles raining DOWN the screen. The particle pool is CPU-simulated each
// frame (cheap, a few hundred points) and streamed into one dynamic VBO, then
// drawn as additive point-sprites (round soft beads). A handful of warm "glow"
// flashes bloom at the moment a bell is struck.
//
// Energy coupling (set from the page each frame):
//   - active particle COUNT scales with the smoothed shake energy
//   - fall SPEED scales with energy (gentle drizzle → fast tumble)
//   - particle warmth/brightness rises with energy
//
// Two draw passes, both over a full-screen gradient quad:
//   1. gradient background (matte, NORMAL blend)
//   2. rain particles + bell-glow sprites (ADDITIVE blend for a warm glow)
//
// Coordinates are normalised [0,1] with y pointing DOWN (0 top, 1 bottom);
// we flip y into clip space in the shaders. Hand-written GLSL ES 3.00.

const BG_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Soft dark→dawn gradient. At rest it is a calm deep indigo night; as energy
// rises the horizon warms toward a rosy/amber dawn. A slow breathing centre
// glow keeps it alive. Matte.
const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform float u_time;
uniform float u_energy; // 0..1 (clamped by caller)
void main() {
  float y = v_uv.y; // 0 top .. 1 bottom

  // night palette
  vec3 topNight = vec3(0.04, 0.05, 0.12);
  vec3 botNight = vec3(0.02, 0.02, 0.06);
  // dawn palette: warm rose low, soft amber-violet up high
  vec3 topDawn  = vec3(0.16, 0.10, 0.20);
  vec3 botDawn  = vec3(0.22, 0.10, 0.10);

  float e = clamp(u_energy, 0.0, 1.0);
  vec3 top = mix(topNight, topDawn, e);
  vec3 bot = mix(botNight, botDawn, e);
  vec3 col = mix(top, bot, smoothstep(0.0, 1.0, y));

  // warm dawn band rising from the bottom with energy
  float band = smoothstep(0.35, 1.0, y);
  col += vec3(0.20, 0.09, 0.06) * band * e;

  // gentle breathing centre glow
  vec2 c = v_uv - vec2(0.5, 0.40);
  float r = length(c * vec2(1.0, 1.25));
  float breathe = 0.5 + 0.5 * sin(u_time * 0.22);
  col += vec3(0.05, 0.045, 0.08) * (1.0 - smoothstep(0.0, 0.9, r)) * (0.55 + 0.45 * breathe);

  // soft vignette
  col *= 1.0 - 0.32 * smoothstep(0.55, 1.15, length(v_uv - 0.5));
  o = vec4(col, 1.0);
}`;

// Particle / glow point-sprite shader. Each point carries a clip position, a
// size in pixels, an rgb colour and an alpha.
const PT_VERT = `#version 300 es
in vec2 a_pos;     // clip space
in float a_size;   // point size in px
in vec3 a_color;
in float a_alpha;
out vec3 v_color;
out float v_alpha;
void main() {
  v_color = a_color;
  v_alpha = a_alpha;
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
}`;

// Round soft bead: radial falloff, additive glow.
const PT_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_alpha;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;        // 0 centre .. 1 edge
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  float soft = pow(core, 1.7);
  float a = soft * v_alpha;
  o = vec4(v_color * a, a);          // premultiplied alpha (composited matte over the scene)
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

// Warm rain palette — cool periwinkle beads at rest warming to amber/rose as
// energy rises. Picked per-particle and lerped by energy.
const COOL: [number, number, number] = [0.55, 0.66, 0.95];
const WARM: [number, number, number] = [0.98, 0.62, 0.42];

interface Particle {
  x: number; // 0..1
  y: number; // 0..1, y down
  vy: number; // fall speed (norm units / s)
  vx: number; // gentle horizontal drift
  size: number; // base px
  life: number; // 0..1 fade as it nears bottom (we just recycle off-screen)
  warm: number; // 0..1 per-particle warmth bias
  active: boolean;
}

interface Glow {
  x: number;
  y: number;
  age: number; // seconds
  ttl: number; // seconds
  strength: number;
  warm: number;
}

export interface RainRenderer {
  /** advance the CPU particle sim. energy 0..1 sets target active count/speed. */
  step: (dt: number, energy: number) => void;
  /** spawn a warm bell-glow flash at a screen position (x,y in 0..1, y down). */
  flash: (x: number, y: number, strength: number) => void;
  /** draw a frame. timeSec for the breathing background. */
  render: (timeSec: number, energy: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

const MAX_PARTICLES = 600;
const MAX_GLOWS = 32;
// 5 floats per point: pos.xy, size, ... actually pos(2)+size(1)+color(3)+alpha(1)=7
const FLOATS = 7;

export function createRainRenderer(gl: WebGL2RenderingContext): RainRenderer {
  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const ptProg = link(gl, PT_VERT, PT_FRAG);

  // full-screen tri
  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const quadVao = gl.createVertexArray()!;
  const quadVbo = gl.createBuffer()!;
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const bgPos = gl.getAttribLocation(bgProg, "a_pos");
  gl.enableVertexAttribArray(bgPos);
  gl.vertexAttribPointer(bgPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const bgTimeLoc = gl.getUniformLocation(bgProg, "u_time");
  const bgEnergyLoc = gl.getUniformLocation(bgProg, "u_energy");

  // dynamic point buffer
  const ptVao = gl.createVertexArray()!;
  const ptVbo = gl.createBuffer()!;
  gl.bindVertexArray(ptVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
  const stride = FLOATS * 4;
  const aPos = gl.getAttribLocation(ptProg, "a_pos");
  const aSize = gl.getAttribLocation(ptProg, "a_size");
  const aColor = gl.getAttribLocation(ptProg, "a_color");
  const aAlpha = gl.getAttribLocation(ptProg, "a_alpha");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aSize);
  gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(aAlpha);
  gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 24);
  gl.bindVertexArray(null);

  // CPU pools
  const particles: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      vy: 0.25,
      vx: 0,
      size: 6,
      life: 1,
      warm: Math.random(),
      active: false,
    });
  }
  let activeCount = 0; // smoothed toward target

  const glows: Glow[] = [];

  // scratch upload buffer (particles + glows)
  const scratch = new Float32Array((MAX_PARTICLES + MAX_GLOWS) * FLOATS);

  let dprScale = 1; // px-size multiplier from DPR so beads look consistent

  function respawn(p: Particle): void {
    p.x = Math.random();
    p.y = -0.05 - Math.random() * 0.15; // start just above the top
    p.warm = Math.random();
    p.vx = (Math.random() - 0.5) * 0.06;
    p.life = 1;
    p.active = true;
  }

  function step(dt: number, energy: number): void {
    const e = Math.max(0, Math.min(1.2, energy));
    // target number of active particles: a soft trickle at rest, a tumble at max
    const target = 30 + e * (MAX_PARTICLES - 30);
    // ease the active count so density changes feel organic, not steppy
    activeCount += (target - activeCount) * Math.min(1, dt * 6);

    // base fall speed scales with energy; size grows a touch with energy too
    const fall = 0.22 + e * 0.9;

    const want = Math.round(activeCount);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      const shouldBeActive = i < want;
      if (shouldBeActive && !p.active) respawn(p);
      if (!shouldBeActive) {
        // let already-falling ones finish, but don't refresh
        if (!p.active) continue;
      }
      if (!p.active) continue;

      // per-particle fall: a little variance so it shimmers
      const v = fall * (0.7 + p.warm * 0.6);
      p.vy = v;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      // wrap horizontal drift gently
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;

      if (p.y > 1.1) {
        if (shouldBeActive) {
          respawn(p); // recycle
        } else {
          p.active = false; // fade out of the pool when density dropped
        }
      }
    }

    // age glows
    for (let i = glows.length - 1; i >= 0; i--) {
      glows[i].age += dt;
      if (glows[i].age >= glows[i].ttl) glows.splice(i, 1);
    }
  }

  function flash(x: number, y: number, strength: number): void {
    if (glows.length >= MAX_GLOWS) glows.shift();
    glows.push({
      x,
      y,
      age: 0,
      ttl: 0.55 + strength * 0.45,
      strength: Math.max(0.2, Math.min(1.5, strength)),
      warm: Math.min(1, 0.4 + strength * 0.6),
    });
  }

  function nx(x: number): number {
    return x * 2 - 1;
  }
  function ny(y: number): number {
    return 1 - y * 2; // y down -> clip y up
  }

  function render(timeSec: number, energy: number): void {
    const e = Math.max(0, Math.min(1.2, energy));

    // background (matte)
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(bgTimeLoc, timeSec);
    gl.uniform1f(bgEnergyLoc, Math.min(1, e));
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // build point buffer
    let o = 0;
    // rain particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) continue;
      const warmth = Math.min(1, p.warm * 0.4 + e * 0.9);
      const r = COOL[0] + (WARM[0] - COOL[0]) * warmth;
      const g = COOL[1] + (WARM[1] - COOL[1]) * warmth;
      const b = COOL[2] + (WARM[2] - COOL[2]) * warmth;
      // fade in near the top, fade out near the bottom
      const fadeTop = Math.min(1, (p.y + 0.05) / 0.1);
      const fadeBot = 1 - Math.max(0, (p.y - 0.85) / 0.25);
      const alpha = Math.max(0, Math.min(1, fadeTop * fadeBot)) * (0.35 + e * 0.4);
      const size = (3.5 + p.warm * 3 + e * 4) * dprScale;
      scratch[o] = nx(p.x);
      scratch[o + 1] = ny(p.y);
      scratch[o + 2] = size;
      scratch[o + 3] = r;
      scratch[o + 4] = g;
      scratch[o + 5] = b;
      scratch[o + 6] = alpha;
      o += FLOATS;
    }
    // bell-glow flashes (big soft warm blooms)
    for (const fl of glows) {
      const t = fl.age / fl.ttl; // 0..1
      const env = Math.sin(Math.min(1, t) * Math.PI); // rise & fall
      const r = COOL[0] + (WARM[0] - COOL[0]) * fl.warm;
      const g = COOL[1] + (WARM[1] - COOL[1]) * fl.warm;
      const b = COOL[2] + (WARM[2] - COOL[2]) * fl.warm;
      scratch[o] = nx(fl.x);
      scratch[o + 1] = ny(fl.y);
      scratch[o + 2] = (40 + fl.strength * 70) * dprScale;
      scratch[o + 3] = r;
      scratch[o + 4] = g;
      scratch[o + 5] = b;
      scratch[o + 6] = env * 0.5 * fl.strength;
      o += FLOATS;
    }

    const count = o / FLOATS;
    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // matte premultiplied alpha-over (house style — no additive blow-out)
      gl.useProgram(ptProg);
      gl.bindVertexArray(ptVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
      gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, o), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    }
  }

  function resize(w: number, h: number): void {
    gl.viewport(0, 0, w, h);
    // keep bead px-size roughly constant in CSS px regardless of DPR
    dprScale = Math.max(1, w / Math.max(1, window.innerWidth || w));
  }

  function dispose(): void {
    gl.deleteBuffer(quadVbo);
    gl.deleteBuffer(ptVbo);
    gl.deleteVertexArray(quadVao);
    gl.deleteVertexArray(ptVao);
    gl.deleteProgram(bgProg);
    gl.deleteProgram(ptProg);
  }

  return { step, flash, render, resize, dispose };
}
