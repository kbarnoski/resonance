// Retinal-space renderer for the scintillating scotoma (migraine fortification
// spectrum). A CSD-style reaction front expands as a C-shaped arc across the
// full visual field. Everything is generated directly in screen space — NO
// log-polar / exp() warp. WebGL2 fragment shader; on-brand text notice if
// WebGL2 is unavailable.

export type WaveState = {
  time: number; // seconds since begin
  radius: number; // wavefront radius, normalized (1.0 == half min-dimension)
  progress: number; // 0..1 over the journey
  scintRate: number; // scintillation frequency in Hz (kept <= 3 for safety)
};

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uRadius;
uniform float uProgress;
uniform float uScintRate;
uniform vec2  uOrigin;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float mn = min(uRes.x, uRes.y);
  vec2 uv = (frag - 0.5 * uRes) / mn;   // centered, isotropic
  vec2 p  = uv - uOrigin;
  float d = length(p);
  float ang = atan(p.y, p.x);

  float R = uRadius;
  float halfBand = 0.065;
  float edge = abs(d - R);
  float bandEnv = smoothstep(halfBand, 0.0, edge);   // 1 at band centre

  // C-shaped sector, opening toward +x, widening across the journey.
  float sectorHalf = mix(0.75, 2.35, clamp(uProgress, 0.0, 1.0));
  float da = abs(ang);
  float sector = smoothstep(sectorHalf, sectorHalf - 0.5, da);

  // ── Fortification zigzags: herringbone bars tangent to the arc ──
  float u = ang * (R + 0.28) * 42.0;   // arc-length coordinate
  float v = (d - R) / halfBand;        // across the band, -1..1
  float col = floor(u * 0.5);
  float dir = mod(col, 2.0) < 1.0 ? 1.0 : -1.0;
  float diag = u * 0.5 * dir + v * 0.95;
  float tri = abs(fract(diag) - 0.5);
  float lines = smoothstep(0.24, 0.10, tri);

  // ── Scintillation: slow, smooth, floored (never hard on/off) ──
  float phase = 6.2831853 * uScintRate * uTime + u * 0.06 + ang * 2.0;
  float scint = 0.58 + 0.42 * sin(phase);   // 0.16 .. 1.0

  float lum = lines * bandEnv * sector * scint;

  // Mostly-white fortification with faint chromatic fringe at the edge.
  vec3 fringe = vec3(
    0.5 + 0.5 * sin(phase + 0.0),
    0.5 + 0.5 * sin(phase + 2.1),
    0.5 + 0.5 * sin(phase + 4.2));
  vec3 edgeCol = mix(vec3(1.0), fringe, 0.32);
  vec3 arc = edgeCol * lum * 1.7;

  // ── Scotoma: a blind band trailing just behind the front, recovering ──
  float behind = R - d;                       // > 0 behind the wavefront
  float scot = smoothstep(0.0, 0.02, behind) * smoothstep(0.36, 0.04, behind);
  scot *= sector;

  vec3 bg = vec3(0.020, 0.021, 0.028);
  float stat = (hash(frag * 0.7 + floor(uTime * 8.0)) - 0.5) * 0.04 * scot;
  vec3 base = mix(bg, vec3(0.010, 0.010, 0.014), scot * 0.85) + stat;

  vec3 outc = base + arc;

  // gentle vignette
  float vig = smoothstep(1.15, 0.35, length(uv));
  outc *= mix(0.78, 1.0, vig);

  fragColor = vec4(outc, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export type AuraRenderer = {
  backend: "webgl2";
  render: (s: WaveState) => void;
  resize: () => void;
  dispose: () => void;
};

export function createAuraRenderer(canvas: HTMLCanvasElement): AuraRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("program link failed: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uRadius = gl.getUniformLocation(prog, "uRadius");
  const uProgress = gl.getUniformLocation(prog, "uProgress");
  const uScintRate = gl.getUniformLocation(prog, "uScintRate");
  const uOrigin = gl.getUniformLocation(prog, "uOrigin");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const resize = () => {
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

  const render = (s: WaveState) => {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, s.time);
    gl.uniform1f(uRadius, s.radius);
    gl.uniform1f(uProgress, s.progress);
    gl.uniform1f(uScintRate, s.scintRate);
    // Fixation slightly left of centre; the C opens toward the right periphery.
    gl.uniform2f(uOrigin, -0.14, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  };

  return { backend: "webgl2", render, resize, dispose };
}
