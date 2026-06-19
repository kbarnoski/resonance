// field.ts — RAW WebGL2 renderer for the glowing companion family.
//
// A single fullscreen triangle runs a GLSL ES 3.00 fragment shader that, per
// pixel, sums soft additive glow from up to MAX_BLOBS companions whose position,
// radius, brightness, hue and a singing "pulse" are pushed in as uniform arrays.
// Dark calm field, gentle bloom, slow drift. A tiny Canvas2D glow-dot fallback
// is provided for devices without WebGL2 (WebGL2 is the primary path).

export const MAX_BLOBS = 8; // cap 4 companions; headroom for breath sparks

/** Per-frame state for one rendered blob. All in normalized -1..1 / 0..1. */
export interface Blob {
  x: number; // -1..1 (aspect-corrected in shader)
  y: number; // -1..1
  radius: number; // 0..1 of half-height
  brightness: number; // 0..1
  hue: number; // 0..1
  pulse: number; // 0..1 singing energy
}

export interface FieldFrame {
  time: number;
  blobs: Blob[];
  warmth: number; // 0..1 overall family maturity (background warms slightly)
}

export interface FieldRenderer {
  draw: (f: FieldFrame) => void;
  resize: () => void;
  dispose: () => void;
  isGL: boolean;
}

const VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // fullscreen triangle
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p; // 0..2
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_warmth;
uniform int u_count;
uniform vec3 u_pos[${MAX_BLOBS}];     // xy = position(-1..1), z = radius
uniform vec3 u_props[${MAX_BLOBS}];   // x = brightness, y = hue, z = pulse

vec3 hue2rgb(float h) {
  vec3 k = vec3(1.0, 2.0/3.0, 1.0/3.0);
  vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv; // 0..2
  vec2 p = uv - 1.0; // -1..1
  float aspect = u_res.x / u_res.y;
  p.x *= aspect;

  // dark calm base, warms very slightly as the family matures
  vec3 col = mix(vec3(0.008, 0.012, 0.028), vec3(0.03, 0.022, 0.02), u_warmth * 0.5);

  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= u_count) break;
    vec3 pos = u_pos[i];
    vec3 pr = u_props[i];
    vec2 c = pos.xy;
    c.x *= aspect;
    // gentle drift so nothing is static
    c += 0.04 * vec2(sin(u_time * 0.27 + float(i) * 1.7),
                     cos(u_time * 0.21 + float(i) * 2.3));
    float rad = pos.z;
    float bright = pr.x;
    float hue = pr.y;
    float pulse = pr.z;

    float d = length(p - c);
    // soft core + wide halo; the pulse swells the halo while singing
    float core = exp(-pow(d / (rad * (0.45 + pulse * 0.25)), 2.0));
    float halo = exp(-d / (rad * (1.1 + pulse * 0.8)));
    float glow = core * 1.1 + halo * (0.4 + pulse * 0.5);

    vec3 base = hue2rgb(hue);
    // warm the singing core toward white-gold
    vec3 tint = mix(base, vec3(1.0, 0.92, 0.78), pulse * 0.6 + bright * 0.2);
    col += tint * glow * (0.35 + bright * 0.9);
  }

  // gentle filmic-ish tone curve + soft vignette so bloom stays calm
  float vig = smoothstep(1.7, 0.2, length(p));
  col *= mix(0.7, 1.0, vig);
  col = col / (col + vec3(0.85)); // soft rolloff, no harsh clipping
  col = pow(col, vec3(0.9));
  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

/** Build the WebGL2 renderer. Throws if WebGL2 unavailable (caller falls back). */
export function makeGLField(canvas: HTMLCanvasElement): FieldRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("no webgl2");

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new Error("program create failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("link: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray(); // empty VAO; positions come from gl_VertexID
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uWarmth = gl.getUniformLocation(prog, "u_warmth");
  const uCount = gl.getUniformLocation(prog, "u_count");
  const uPos = gl.getUniformLocation(prog, "u_pos");
  const uProps = gl.getUniformLocation(prog, "u_props");

  const posArr = new Float32Array(MAX_BLOBS * 3);
  const propArr = new Float32Array(MAX_BLOBS * 3);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  const draw = (f: FieldFrame) => {
    const n = Math.min(f.blobs.length, MAX_BLOBS);
    for (let i = 0; i < n; i++) {
      const b = f.blobs[i];
      posArr[i * 3] = b.x;
      posArr[i * 3 + 1] = b.y;
      posArr[i * 3 + 2] = Math.max(0.02, b.radius);
      propArr[i * 3] = b.brightness;
      propArr[i * 3 + 1] = b.hue;
      propArr[i * 3 + 2] = b.pulse;
    }
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, f.time);
    gl.uniform1f(uWarmth, f.warmth);
    gl.uniform1i(uCount, n);
    gl.uniform3fv(uPos, posArr);
    gl.uniform3fv(uProps, propArr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  };

  return { draw, resize, dispose, isGL: true };
}

/** Canvas2D glow-dot fallback (no WebGL2). Same FieldFrame contract. */
export function makeCanvasField(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  };
  resize();

  const draw = (f: FieldFrame) => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = "source-over";
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#05060f");
    bg.addColorStop(1, "#080610");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    const min = Math.min(w, h);
    for (const b of f.blobs) {
      const cx = (b.x * 0.5 + 0.5) * w + 0.06 * w * Math.sin(f.time * 0.27);
      const cy = (b.y * 0.5 + 0.5) * h + 0.06 * h * Math.cos(f.time * 0.21);
      const r = Math.max(8, b.radius * min * (1.0 + b.pulse * 0.6));
      const hueDeg = ((b.hue * 360) % 360 + 360) % 360;
      const a = 0.18 + b.brightness * 0.4 + b.pulse * 0.25;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `hsla(${hueDeg},80%,${60 + b.pulse * 25}%,${a})`);
      g.addColorStop(1, `hsla(${hueDeg},80%,55%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  return { draw, resize, dispose: () => {}, isGL: false };
}
