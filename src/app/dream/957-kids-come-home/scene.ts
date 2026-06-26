// Renderer for "Kids Come Home".
// Primary: raw WebGL2 with hand-written GLSL ES 3.00 (glowing dusk hill + firefly bloom + trail).
// Fallback: Canvas2D (same scene). No three.js.

export interface SceneState {
  // firefly position in 0..1 (x left->right, y bottom->top of the hill)
  fx: number;
  fy: number;
  // 0..1 normalized "height up the hill" -> tension
  tension: number;
  // 0..1 bloom flash (1 right after resolving home)
  bloom: number;
  // seconds, for shimmer
  time: number;
  // trail points (newest last), normalized 0..1
  trail: { x: number; y: number }[];
}

export interface Renderer {
  draw: (s: SceneState) => void;
  resize: () => void;
  dispose: () => void;
  kind: "webgl2" | "canvas2d";
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment: dusk gradient hill + firefly with additive bloom + trail glow.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_fly;      // firefly pos (0..1, y up)
uniform float u_tension;  // 0..1
uniform float u_bloom;    // 0..1
uniform vec3  u_trail[16];// xy = pos (0..1, y up), z = strength

float hillHeight(float x) {
  // soft rolling hill silhouette near the bottom
  return 0.18 + 0.06 * sin(x * 3.14159 + 0.6) + 0.03 * sin(x * 7.0);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);

  // ---- dusk sky gradient: deep indigo top -> warm rose/amber near horizon ----
  vec3 top = vec3(0.06, 0.05, 0.14);
  vec3 mid = vec3(0.20, 0.10, 0.26);
  vec3 horizon = mix(vec3(0.55, 0.28, 0.30), vec3(0.85, 0.45, 0.25), u_tension);
  vec3 sky = mix(mid, top, smoothstep(0.35, 1.0, uv.y));
  sky = mix(horizon, sky, smoothstep(0.16, 0.5, uv.y));

  // subtle vignette
  vec2 c = uv - 0.5; c.x *= aspect;
  sky *= 1.0 - dot(c, c) * 0.5;

  // ---- the dark hill ----
  float h = hillHeight(uv.x);
  float hillMask = smoothstep(h + 0.004, h - 0.004, uv.y);
  vec3 hillCol = vec3(0.05, 0.04, 0.09);
  vec3 col = mix(sky, hillCol, hillMask);

  // a faint "home" glow at the base center (where the firefly returns)
  vec2 home = vec2(0.5, 0.16);
  vec2 dh = uv - home; dh.x *= aspect;
  float homeGlow = exp(-dot(dh, dh) * 26.0);
  col += vec3(1.0, 0.78, 0.45) * homeGlow * (0.10 + u_bloom * 0.9);

  // ---- trail glow (additive) ----
  for (int i = 0; i < 16; i++) {
    vec3 t = u_trail[i];
    if (t.z <= 0.001) continue;
    vec2 d = uv - t.xy; d.x *= aspect;
    float g = exp(-dot(d, d) * 900.0) * t.z;
    col += mix(vec3(0.5,0.8,1.0), vec3(1.0,0.7,0.3), u_tension) * g * 0.5;
  }

  // ---- the firefly: hot core + additive bloom; trembles with tension ----
  float tremble = sin(u_time * 26.0) * u_tension * u_tension * 0.012;
  vec2 fly = u_fly + vec2(tremble, 0.0);
  vec2 d = uv - fly; d.x *= aspect;
  float dist2 = dot(d, d);
  // color: cool gold when low/home -> hot white/orange when tense
  vec3 cool = vec3(1.0, 0.85, 0.45);
  vec3 hot  = vec3(1.0, 0.55, 0.30);
  vec3 fcol = mix(cool, hot, u_tension);
  float shimmer = 0.85 + 0.15 * sin(u_time * (8.0 + u_tension * 30.0));
  float core = exp(-dist2 * 5500.0);
  float halo = exp(-dist2 * 220.0) * (0.6 + u_tension * 0.7);
  col += fcol * (core * 1.6 + halo) * shimmer;
  col += vec3(1.0) * core * 1.2; // white-hot center
  col += fcol * u_bloom * exp(-dist2 * 40.0) * 1.5; // resolution flash

  frag = vec4(col, 1.0);
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

export function createWebGL2Renderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  let vbo: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null;

  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("link failed: " + gl.getProgramInfoLog(program));
    }
  } catch {
    if (program) gl.deleteProgram(program);
    return null;
  }

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]), // fullscreen triangle
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    time: gl.getUniformLocation(program, "u_time"),
    fly: gl.getUniformLocation(program, "u_fly"),
    tension: gl.getUniformLocation(program, "u_tension"),
    bloom: gl.getUniformLocation(program, "u_bloom"),
    trail: gl.getUniformLocation(program, "u_trail"),
  };

  const trailBuf = new Float32Array(16 * 3);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  const draw = (s: SceneState) => {
    if (gl.isContextLost()) return;
    resize();
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, s.time);
    gl.uniform2f(u.fly, s.fx, s.fy);
    gl.uniform1f(u.tension, s.tension);
    gl.uniform1f(u.bloom, s.bloom);

    trailBuf.fill(0);
    const n = Math.min(16, s.trail.length);
    for (let i = 0; i < n; i++) {
      const p = s.trail[s.trail.length - n + i];
      const strength = ((i + 1) / n) * 0.8;
      trailBuf[i * 3] = p.x;
      trailBuf[i * 3 + 1] = p.y;
      trailBuf[i * 3 + 2] = strength;
    }
    gl.uniform3fv(u.trail, trailBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    if (vbo) gl.deleteBuffer(vbo);
    if (vao) gl.deleteVertexArray(vao);
    if (program) gl.deleteProgram(program);
    program = null;
    vbo = null;
    vao = null;
  };

  return { draw, resize, dispose, kind: "webgl2" };
}

export function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let W = 1;
  let H = 1;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
  };
  resize();

  const draw = (s: SceneState) => {
    resize();
    // dusk gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0f0d24");
    const horizon = s.tension > 0.5 ? "#d97340" : "#8c4750";
    g.addColorStop(0.78, "#341a44");
    g.addColorStop(1, horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // hill (dark band along bottom)
    ctx.fillStyle = "#0d0a17";
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      const u = x / W;
      const hh = 0.18 + 0.06 * Math.sin(u * Math.PI + 0.6) + 0.03 * Math.sin(u * 7);
      ctx.lineTo(x, H - hh * H);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // home glow
    const hx = 0.5 * W;
    const hy = (1 - 0.16) * H;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 0.25 * H * (1 + s.bloom * 2));
    hg.addColorStop(0, `rgba(255,200,120,${0.18 + s.bloom * 0.7})`);
    hg.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    // trail
    const n = Math.min(16, s.trail.length);
    for (let i = 0; i < n; i++) {
      const p = s.trail[s.trail.length - n + i];
      const a = ((i + 1) / n) * 0.35;
      const px = p.x * W;
      const py = (1 - p.y) * H;
      const r = 18 * (i / n + 0.3);
      const tg = ctx.createRadialGradient(px, py, 0, px, py, r);
      const col = s.tension > 0.5 ? "255,170,90" : "150,200,255";
      tg.addColorStop(0, `rgba(${col},${a})`);
      tg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = tg;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }

    // firefly
    const tremble = Math.sin(s.time * 26) * s.tension * s.tension * 0.012;
    const fx = (s.fx + tremble) * W;
    const fy = (1 - s.fy) * H;
    const shimmer = 0.85 + 0.15 * Math.sin(s.time * (8 + s.tension * 30));
    const R = (38 + s.tension * 36) * shimmer * (1 + s.bloom);
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, R);
    const core = s.tension > 0.5 ? "255,140,80" : "255,215,120";
    fg.addColorStop(0, "rgba(255,255,255,0.95)");
    fg.addColorStop(0.25, `rgba(${core},0.85)`);
    fg.addColorStop(1, `rgba(${core},0)`);
    ctx.fillStyle = fg;
    ctx.fillRect(fx - R, fy - R, R * 2, R * 2);

    ctx.globalCompositeOperation = "source-over";
  };

  const dispose = () => {
    /* nothing persistent to free for 2d */
  };

  return { draw, resize, dispose, kind: "canvas2d" };
}
