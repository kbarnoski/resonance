// ─────────────────────────────────────────────────────────────────────────────
// 1418-beat-field — WebGL2 fragment fallback (tier 2).
//
// The same roughness-blob field as gpu.ts, but computed in a full-screen fragment
// shader instead of a compute pass. Blobs arrive as a uniform array; each fragment
// sums the Gaussian splats and applies the identical cosmic→howl palette. Throws
// WebGL2UnsupportedError when WebGL2 is missing so page.tsx can drop to Canvas2D.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_BLOBS, type FieldRenderer, type RenderFrame } from "./field";

export class WebGL2UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGL2UnsupportedError";
  }
}

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = vec2(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec4 uBlobs[${MAX_BLOBS}];   // x, y, r, shimmerHz
uniform int  uCount;
uniform float uTime;
uniform float uDrive;
uniform float uIntensity;
uniform float uReduced;

const float TAU = 6.28318530718;
const float RADIUS_GAIN = 6.0;

vec3 palette(float x, float drive) {
  vec3 base = vec3(0.035, 0.02, 0.07);
  vec3 cool = vec3(0.36, 0.30, 0.95);
  vec3 warm = vec3(1.0, 0.52, 0.28);
  vec3 hot  = vec3(1.0, 0.93, 0.82);
  vec3 c = base;
  c += cool * smoothstep(0.0, 0.55, x) * 0.75;
  c += warm * smoothstep(0.45, 1.5, x);
  c += hot  * smoothstep(1.35, 2.6, x);
  return c * (0.55 + 0.85 * drive);
}

void main() {
  vec2 uv = vUv;
  float val = 0.0;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uCount) break;
    vec4 b = uBlobs[i];
    float sigma = 0.03 + 0.05 * min(1.0, b.z * RADIUS_GAIN);
    vec2 d = uv - b.xy;
    float d2 = dot(d, d);
    float shimmer = 0.6 + 0.4 * sin(TAU * b.w * uTime);
    val += b.z * shimmer * exp(-d2 / (2.0 * sigma * sigma));
  }
  float neb = 0.012 * (0.5 + 0.5 * sin(uv.x * 7.0 + uTime * 0.35))
                    * (0.5 + 0.5 * sin(uv.y * 5.0 - uTime * 0.27));
  val += neb;

  float x = val * (0.8 + uIntensity * 1.6);
  vec3 col = palette(x, uDrive);

  vec2 p = uv - vec2(0.5);
  float rr = length(p * vec2(1.4, 1.0));
  col += vec3(0.05, 0.04, 0.10) * (1.0 - smoothstep(0.0, 0.9, rr));
  col *= (0.4 + 0.6 * (1.0 - smoothstep(0.55, 1.25, rr)));
  col = mix(col, vec3(0.06, 0.045, 0.11) + col * 0.5, uReduced * 0.5);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new WebGL2UnsupportedError("could not create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new WebGL2UnsupportedError("shader compile failed: " + log);
  }
  return sh;
}

export function createBeatFieldGL(canvas: HTMLCanvasElement): FieldRenderer {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new WebGL2UnsupportedError("navigator/canvas has no webgl2 context");

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new WebGL2UnsupportedError("could not create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    throw new WebGL2UnsupportedError("program link failed: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uBlobs = gl.getUniformLocation(prog, "uBlobs[0]");
  const uCount = gl.getUniformLocation(prog, "uCount");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uDrive = gl.getUniformLocation(prog, "uDrive");
  const uIntensity = gl.getUniformLocation(prog, "uIntensity");
  const uReduced = gl.getUniformLocation(prog, "uReduced");

  const vao = gl.createVertexArray();
  const blobData = new Float32Array(MAX_BLOBS * 4);

  let disposed = false;

  const configure = () => {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  configure();

  const render = (frame: RenderFrame, timeSec: number) => {
    if (disposed) return;
    const count = Math.min(MAX_BLOBS, frame.blobs.length);
    for (let i = 0; i < count; i++) {
      const b = frame.blobs[i];
      blobData[i * 4 + 0] = b.x;
      blobData[i * 4 + 1] = b.y;
      blobData[i * 4 + 2] = b.r;
      blobData[i * 4 + 3] = b.shimmerHz;
    }
    for (let i = count; i < MAX_BLOBS; i++) blobData.fill(0, i * 4, i * 4 + 4);

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    if (uBlobs) gl.uniform4fv(uBlobs, blobData);
    if (uCount) gl.uniform1i(uCount, count);
    if (uTime) gl.uniform1f(uTime, timeSec);
    if (uDrive) gl.uniform1f(uDrive, frame.drive);
    if (uIntensity) gl.uniform1f(uIntensity, frame.intensity);
    if (uReduced) gl.uniform1f(uReduced, frame.reduced ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    if (disposed) return;
    configure();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
  };

  return { tier: "webgl2", render, resize, dispose };
}
