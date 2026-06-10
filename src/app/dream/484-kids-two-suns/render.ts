/**
 * render.ts — WebGL2 full-screen fragment-shader renderer for "Two Suns".
 *
 * Two radial light fields, one per sun, each tinted its world's color, blended
 * additively over a dusk sky. Where the two fields overlap a soft corona bloom
 * blooms (the bitonal "place where they meet"). The shader reads the two sun
 * positions + a per-sun radius + an audio-energy uniform that pulses the glow.
 *
 * Raw WebGL2 (no three.js). Caller must provide a Canvas2D fallback.
 */

export interface SunState {
  x: number; // normalised [0,1], left→right
  y: number; // normalised [0,1], BOTTOM→top (GL convention)
}

export interface FrameState {
  sunA: SunState;
  sunB: SunState;
  energy: number; // [0,1] audio pulse
  overlap: number; // [0,1] how eclipsed the suns are
}

export interface Renderer {
  draw: (state: FrameState, timeSec: number) => void;
  resize: (w: number, h: number) => void;
  teardown: () => void;
}

const VERT_SRC = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(-1.0);
  if(gl_VertexID==1) p=vec2( 3.0,-1.0);
  if(gl_VertexID==2) p=vec2(-1.0, 3.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p,0.0,1.0);
}`;

// Sun A = warm (amber/gold), Sun B = cool (violet/cyan). Colors are the
// language: each world a bold saturated hue, blended where they overlap.
const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_sunA;     // normalised pos
uniform vec2  u_sunB;
uniform float u_energy;   // 0..1 audio pulse
uniform float u_overlap;  // 0..1 eclipse amount

// Soft radial field around a sun centre.
float field(vec2 uv, vec2 c, float r){
  float d = distance(uv, c);
  return exp(-d * d / (r * r));
}

void main(){
  // Aspect-correct uv so suns stay round.
  vec2 uv = vUv;
  float aspect = u_res.x / u_res.y;
  vec2 auv = vec2(uv.x * aspect, uv.y);
  vec2 ca  = vec2(u_sunA.x * aspect, u_sunA.y);
  vec2 cb  = vec2(u_sunB.x * aspect, u_sunB.y);

  // ── Dusk sky: deep indigo at top, warm dusty rose near horizon ───────────
  vec3 skyTop = vec3(0.04, 0.04, 0.11);
  vec3 skyBot = vec3(0.14, 0.07, 0.13);
  vec3 col = mix(skyBot, skyTop, smoothstep(0.0, 1.0, uv.y));

  // Pulse breathes the glow radius with the audio energy.
  float pulse = 0.92 + 0.18 * u_energy + 0.04 * sin(u_time * 1.3);
  float rBase = 0.34 * pulse;

  // Two light fields.
  float fa = field(auv, ca, rBase);
  float fb = field(auv, cb, rBase);

  vec3 warm = vec3(1.0, 0.62, 0.20);   // Sun A — C major, golden amber
  vec3 cool = vec3(0.55, 0.45, 1.0);   // Sun B — A major, cool violet

  // Additive blend of the two worlds.
  col += warm * fa * 1.15;
  col += cool * fb * 1.15;

  // Bright cores.
  col += warm * smoothstep(0.10, 0.0, distance(auv, ca)) * 1.6;
  col += cool * smoothstep(0.10, 0.0, distance(auv, cb)) * 1.6;

  // ── Overlap bloom: where both fields are strong, a soft white-gold corona.
  float ov = fa * fb;                       // product peaks only where they meet
  float corona = pow(ov, 0.6) * (1.4 + 1.6 * u_overlap);
  vec3  meet = mix(vec3(1.0, 0.85, 0.8), vec3(1.0, 0.97, 0.9), u_overlap);
  col += meet * corona;

  // A faint shimmer ring at the seam — the unresolved middle, alive.
  float seam = sin((fa - fb) * 22.0 + u_time * 0.8);
  col += meet * 0.04 * ov * (0.5 + 0.5 * seam) * (0.4 + u_energy);

  // Gentle vignette so the suns feel like they float in space.
  float vig = smoothstep(1.25, 0.25, distance(uv, vec2(0.5)));
  col *= 0.55 + 0.45 * vig;

  // Soft filmic-ish clamp (kid-safe — no blinding whites).
  col = col / (col + vec3(0.9));
  col = pow(col, vec3(0.85));

  fragColor = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("Shader compile error: " + log);
  }
  return s;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  let prog: WebGLProgram;
  try {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vert);
    gl.attachShader(p, frag);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    }
    prog = p;
  } catch {
    return null;
  }

  gl.useProgram(prog);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uSunA = gl.getUniformLocation(prog, "u_sunA");
  const uSunB = gl.getUniformLocation(prog, "u_sunB");
  const uEnergy = gl.getUniformLocation(prog, "u_energy");
  const uOverlap = gl.getUniformLocation(prog, "u_overlap");

  let width = canvas.width;
  let height = canvas.height;

  function resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.floor(w * dpr);
    height = Math.floor(h * dpr);
    canvas.width = width;
    canvas.height = height;
    gl!.viewport(0, 0, width, height);
  }

  function draw(state: FrameState, timeSec: number): void {
    gl!.useProgram(prog);
    gl!.bindVertexArray(vao);
    gl!.uniform2f(uRes, width, height);
    gl!.uniform1f(uTime, timeSec);
    gl!.uniform2f(uSunA, state.sunA.x, state.sunA.y);
    gl!.uniform2f(uSunB, state.sunB.x, state.sunB.y);
    gl!.uniform1f(uEnergy, state.energy);
    gl!.uniform1f(uOverlap, state.overlap);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function teardown(): void {
    try {
      gl!.deleteProgram(prog);
    } catch {
      /* noop */
    }
  }

  return { draw, resize, teardown } satisfies Renderer;
}
