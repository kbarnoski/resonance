// render.ts — RAW WebGL2 with hand-written GLSL. NOT three.js, NOT Canvas2D.
//
// The whole 6-minute arc is drawn as a legible tension LANDSCAPE: a horizontal
// timeline whose height is the target (Freytag) tension, with the realised
// "live" tension riding on top, the five act regions divided, the inciting
// incident marked, and a bright playhead at the current position. Behind it, a
// field of instanced glowing marks accretes — denser, higher and warmer where
// the tension is greater. This is a REPRESENTATION of a discrete dramaturgical
// state, not a simulated continuous field (no fluid / PDE / drag-on-a-field).

import { mulberry32, hashSeed } from "./rng";
import { INCITING_INCIDENT } from "./arc";
import type { BakedJourney } from "./demo";

// Internal act boundaries drawn as dividers (exposition|rising|climax|falling|dénouement).
const ACT_BOUNDS = [0.13, 0.66, 0.76, 0.9];
const PARTICLE_COUNT = 1400;

const VS_FULL = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_LANDSCAPE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform sampler2D uCurve;
uniform float uPos;
uniform float uLive;
uniform float uTime;
uniform float uActBounds[4];
uniform float uInciting;

const float YB = 0.09;
const float YT = 0.75;

vec3 tensionColor(float t) {
  // cool violet (calm) -> warm gold (climax)
  vec3 cool = vec3(0.34, 0.30, 0.82);
  vec3 warm = vec3(1.00, 0.72, 0.42);
  return mix(cool, warm, clamp(t, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float target = texture(uCurve, vec2(uv.x, 0.5)).r;
  float live = texture(uCurve, vec2(uv.x, 0.5)).g;
  float tY = YB + target * (YT - YB);
  float lY = YB + live * (YT - YB);

  vec3 col = vec3(0.028, 0.024, 0.045); // deep base

  // faint drifting ambience above the horizon, warmed by live tension
  float sky = smoothstep(YB, 1.0, uv.y);
  float drift = 0.5 + 0.5 * sin(uTime * 0.12 + uv.x * 3.0);
  col += tensionColor(uLive) * sky * (0.015 + 0.03 * uLive) * (0.7 + 0.3 * drift);

  // filled area below the target curve — denser near the baseline
  float below = 1.0 - smoothstep(tY - 0.004, tY + 0.004, uv.y);
  float depth = clamp((tY - uv.y) / max(tY - YB, 0.001), 0.0, 1.0);
  col += tensionColor(target) * below * (0.05 + 0.22 * depth);

  // act divider lines
  for (int i = 0; i < 4; i++) {
    float b = uActBounds[i];
    float line = smoothstep(0.0018, 0.0, abs(uv.x - b));
    col += vec3(0.5, 0.52, 0.7) * line * 0.18 * step(uv.y, YT + 0.02);
  }

  // inciting-incident marker (a taller, warmer tick)
  float inc = smoothstep(0.0022, 0.0, abs(uv.x - uInciting));
  col += vec3(1.0, 0.68, 0.4) * inc * 0.5 * step(uv.y, tY + 0.05);

  // target curve line (muted guide)
  float tLine = smoothstep(0.010, 0.0, abs(uv.y - tY));
  col += vec3(0.55, 0.55, 0.72) * tLine * 0.35;

  // live tension line (bright, warm-shifted)
  float lLine = smoothstep(0.011, 0.0, abs(uv.y - lY));
  col += tensionColor(live) * lLine * 1.15;

  // playhead: bright vertical + soft halo
  float head = smoothstep(0.0016, 0.0, abs(uv.x - uPos));
  float halo = smoothstep(0.035, 0.0, abs(uv.x - uPos));
  col += vec3(0.95, 0.93, 1.0) * head * 0.9;
  col += tensionColor(uLive) * halo * 0.12;

  // a glowing bead where the playhead meets the live curve
  float beadPos = YB + uLive * (YT - YB);
  float bead = smoothstep(0.03, 0.0, length((uv - vec2(uPos, beadPos)) * vec2(1.0, 1.0)));
  col += tensionColor(uLive) * bead * 0.9;

  // gentle vignette
  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.45;

  outColor = vec4(col, 1.0);
}`;

const VS_PARTICLE = `#version 300 es
in vec2 aSeed; // x: horizontal position 0..1, y: random 0..1
uniform sampler2D uCurve;
uniform float uPos;
uniform float uTime;
uniform vec2 uRes;
out float vT;
out float vAlpha;

const float YB = 0.09;
const float YT = 0.75;

void main() {
  float t = texture(uCurve, vec2(aSeed.x, 0.5)).r;
  float colTop = YB + t * (YT - YB);
  float y = YB + aSeed.y * (colTop - YB + 0.02);
  float drift = sin(uTime * 0.3 + aSeed.y * 6.28 + aSeed.x * 24.0) * 0.008 * t;
  y += drift;
  float prox = smoothstep(0.14, 0.0, abs(aSeed.x - uPos));
  gl_Position = vec4(aSeed.x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  float twinkle = 0.65 + 0.35 * sin(uTime * 0.9 + aSeed.x * 40.0 + aSeed.y * 12.0);
  vAlpha = (0.04 + t * 0.42) * (0.4 + 0.6 * prox) * twinkle;
  vT = t;
  gl_PointSize = (1.5 + t * 5.5 + prox * 4.5) * (uRes.y / 900.0);
}`;

const FS_PARTICLE = `#version 300 es
precision highp float;
in float vT;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r) * vAlpha;
  vec3 cool = vec3(0.42, 0.38, 0.9);
  vec3 warm = vec3(1.0, 0.78, 0.5);
  vec3 col = mix(cool, warm, clamp(vT, 0.0, 1.0));
  outColor = vec4(col * a, a);
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
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

export interface RenderState {
  pos01: number;
  live: number;
  time: number;
}

export class GLRenderer {
  private gl: WebGL2RenderingContext;
  private landscape: WebGLProgram;
  private particles: WebGLProgram;
  private tex: WebGLTexture;
  private seedBuf: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private lLoc: Record<string, WebGLUniformLocation | null> = {};
  private pLoc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement, seed: number) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    this.landscape = link(gl, VS_FULL, FS_LANDSCAPE);
    this.particles = link(gl, VS_PARTICLE, FS_PARTICLE);

    for (const n of ["uRes", "uCurve", "uPos", "uLive", "uTime", "uInciting"]) {
      this.lLoc[n] = gl.getUniformLocation(this.landscape, n);
    }
    this.lLoc["uActBounds"] = gl.getUniformLocation(this.landscape, "uActBounds[0]");
    for (const n of ["uCurve", "uPos", "uTime", "uRes"]) {
      this.pLoc[n] = gl.getUniformLocation(this.particles, n);
    }

    // curve texture (256x1 RGBA8, filled by setCurve)
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // particle seed positions
    const rng = mulberry32(hashSeed(seed, 0xa11ce));
    const seeds = new Float32Array(PARTICLE_COUNT * 2);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 2] = (i + rng() * 0.9) / PARTICLE_COUNT; // spread across x
      seeds[i * 2 + 1] = rng();
    }
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.seedBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const aSeed = gl.getAttribLocation(this.particles, "aSeed");
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  setCurve(baked: BakedJourney): void {
    const gl = this.gl;
    const n = baked.target.length;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = Math.round(baked.target[i] * 255);
      data[i * 4 + 1] = Math.round(baked.live[i] * 255);
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    gl.canvas.width = Math.max(1, Math.floor(w * dpr));
    gl.canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  draw(state: RenderState): void {
    const gl = this.gl;
    const W = gl.canvas.width;
    const H = gl.canvas.height;
    gl.clearColor(0.028, 0.024, 0.045, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // landscape (opaque base)
    gl.useProgram(this.landscape);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.lLoc["uCurve"], 0);
    gl.uniform2f(this.lLoc["uRes"], W, H);
    gl.uniform1f(this.lLoc["uPos"], state.pos01);
    gl.uniform1f(this.lLoc["uLive"], state.live);
    gl.uniform1f(this.lLoc["uTime"], state.time);
    gl.uniform1f(this.lLoc["uInciting"], INCITING_INCIDENT);
    gl.uniform1fv(this.lLoc["uActBounds"], new Float32Array(ACT_BOUNDS));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // particles (additive)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.particles);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.pLoc["uCurve"], 0);
    gl.uniform1f(this.pLoc["uPos"], state.pos01);
    gl.uniform1f(this.pLoc["uTime"], state.time);
    gl.uniform2f(this.pLoc["uRes"], W, H);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.landscape);
    gl.deleteProgram(this.particles);
    gl.deleteTexture(this.tex);
    gl.deleteBuffer(this.seedBuf);
    gl.deleteVertexArray(this.vao);
  }
}
