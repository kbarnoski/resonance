// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY — the "harmony aurora"
// A single full-screen quad + one fragment shader (fbm domain-warp noise).
// HUE tracks the tonic's position on the circle of fifths, biased into the
// Resonance violet arc (indigo → violet → magenta). Brightness/bloom pulses on
// chord changes; turbulence tracks sung pitch height + key stability.
// Graceful Canvas2D fallback if WebGL2 is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuroraUniforms {
  time: number;
  tonic: number; // 0..1 circle-of-fifths position
  pulse: number; // 0..1 decaying chord-change flash
  pitch: number; // 0..1 sung pitch height
  stability: number; // 0..1 key confidence
}

export interface AuroraHandle {
  render: (u: AuroraUniforms) => void;
  resize: () => void;
  dispose: () => void;
}

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTonic;
uniform float uPulse;
uniform float uPitch;
uniform float uStability;

// hash / value noise
float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++){
    v += amp * noise(p);
    p = p * 2.02 + vec2(3.1, 1.7);
    amp *= 0.5;
  }
  return v;
}

vec3 hsv2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  rgb = rgb*rgb*(3.0 - 2.0*rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float t = uTime * 0.06;
  float turb = 0.25 + uPitch * 0.9;              // pitch drives turbulence
  float calm = mix(1.6, 0.8, uStability);         // stable key = smoother flow

  // Domain warp for flowing aurora curtains.
  vec2 q = vec2(fbm(p * calm + vec2(0.0, t)), fbm(p * calm + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * calm + q * (1.5 + turb) + vec2(1.7, 9.2) + t * 0.5),
                fbm(p * calm + q * (1.5 + turb) + vec2(8.3, 2.8) - t * 0.4));
  float f = fbm(p * calm + r * (1.0 + turb));

  // Vertical aurora banding.
  float band = smoothstep(0.15, 0.85, f + 0.25 * sin(p.x * 3.0 + r.y * 4.0 + uTime * 0.2));
  float glow = pow(band, 1.6);

  // Hue: bias the tonic into the violet arc (indigo .72 → magenta .86).
  float hueBase = 0.74;
  float hue = hueBase + (uTonic - 0.5) * 0.16 + 0.02 * r.x;
  float sat = 0.55 + 0.25 * f;
  float val = glow * (0.55 + 0.45 * f);

  // Chord-change bloom: brighten + desaturate toward white momentarily.
  val += uPulse * 0.5 * glow;
  sat -= uPulse * 0.35;

  vec3 col = hsv2rgb(vec3(fract(hue), clamp(sat, 0.0, 1.0), clamp(val, 0.0, 1.0)));

  // Cosmic deep-space base + subtle vignette.
  vec3 deep = vec3(0.03, 0.02, 0.07);
  col = deep + col;
  float vig = smoothstep(1.3, 0.2, length(p));
  col *= 0.4 + 0.6 * vig;

  // gentle tonemap
  col = col / (col + vec3(0.9));
  fragColor = vec4(col, 1.0);
}
`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Try to build the WebGL2 aurora. Returns null if WebGL2 is unavailable. */
export function makeAurora(canvas: HTMLCanvasElement): AuroraHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uTonic = gl.getUniformLocation(prog, "uTonic");
  const uPulse = gl.getUniformLocation(prog, "uPulse");
  const uPitch = gl.getUniformLocation(prog, "uPitch");
  const uStability = gl.getUniformLocation(prog, "uStability");

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  const render = (u: AuroraUniforms): void => {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, u.time);
    gl.uniform1f(uTonic, u.tonic);
    gl.uniform1f(uPulse, u.pulse);
    gl.uniform1f(uPitch, u.pitch);
    gl.uniform1f(uStability, u.stability);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = (): void => {
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteVertexArray(vao);
  };

  return { render, resize, dispose };
}

// ── Canvas2D fallback aurora ─────────────────────────────────────────────────
export function makeAuroraFallback(canvas: HTMLCanvasElement): AuroraHandle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  resize();

  const render = (u: AuroraUniforms): void => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#08060f";
    ctx.fillRect(0, 0, w, h);
    const hueDeg = (0.74 + (u.tonic - 0.5) * 0.16) * 360;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const yy = (i / bands) * h;
      const wobble =
        Math.sin(u.time * 0.5 + i * 1.3) * 40 * (0.4 + u.pitch);
      const grad = ctx.createLinearGradient(0, yy + wobble, w, yy - wobble);
      const light = 40 + u.pulse * 35 + i * 4;
      const alpha = 0.12 + 0.1 * u.stability;
      grad.addColorStop(0, `hsla(${hueDeg - 12}, 70%, ${light}%, 0)`);
      grad.addColorStop(0.5, `hsla(${hueDeg}, 75%, ${light}%, ${alpha})`);
      grad.addColorStop(1, `hsla(${hueDeg + 14}, 70%, ${light}%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, yy - h * 0.3 + wobble, w, h * 0.6);
    }
  };

  const dispose = (): void => {
    /* nothing to release */
  };

  return { render, resize, dispose };
}
