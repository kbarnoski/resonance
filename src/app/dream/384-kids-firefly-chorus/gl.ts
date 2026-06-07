// WebGL2 renderer for the firefly chorus.
//
// Two passes, both with premultiplied alpha-over compositing (the lab's matte
// house style — NO additive glow-stacking):
//
//   1. Full-screen meadow: deep dusk-indigo vertical gradient + a soft ground
//      mist + a faint "togetherness" vignette whose warmth tracks the global
//      Kuramoto order parameter r.
//   2. Instanced firefly quads: each a soft radial glow whose brightness comes
//      from its blink phase, tinted by cluster (synced clusters share a warm
//      hue) and haloed when its neighbourhood is synced.
//
// Hand-written GLSL ES 3.00. DPR/resize aware.

// ── Pass 1: meadow background ──
const BG_VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 vUv;
void main(){
  vec2 p = verts[gl_VertexID];
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.,1.);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uOrderR;   // 0..1 global synchrony

const vec3 SKY_TOP = vec3(0.020, 0.020, 0.075); // deep dusk indigo
const vec3 SKY_LOW = vec3(0.050, 0.045, 0.130);
const vec3 GROUND  = vec3(0.030, 0.060, 0.075); // meadow floor, cool teal-green
const vec3 WARM    = vec3(0.140, 0.090, 0.080); // togetherness warmth

void main(){
  float y = vUv.y;
  // sky → meadow gradient (y=0 bottom)
  vec3 col = mix(GROUND, SKY_LOW, smoothstep(0.0, 0.45, y));
  col = mix(col, SKY_TOP, smoothstep(0.4, 1.0, y));

  // slow ground mist near the bottom
  float mist = (1.0 - smoothstep(0.0, 0.35, y));
  mist *= 0.5 + 0.5 * sin(vUv.x * 6.2831 + uTime * 0.15);
  col += vec3(0.02, 0.03, 0.035) * mist * 0.4;

  // togetherness: gentle warm centre-vignette that blooms as r → 1
  vec2 c = vUv - 0.5;
  float vig = 1.0 - smoothstep(0.1, 0.75, length(c));
  col = mix(col, col + WARM, vig * uOrderR * 0.55);

  outColor = vec4(col, 1.0);
}`;

// ── Pass 2: instanced fireflies ──
// Each instance carries: position (x,y in 0..1), brightness, localR, hue.
const FF_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // [-1..1] quad corner
layout(location=1) in vec2 aPos;      // firefly position 0..1
layout(location=2) in float aBright;  // 0..1 blink brightness
layout(location=3) in float aLocalR;  // 0..1 local synchrony
layout(location=4) in float aHue;     // 0..1 cluster hue

uniform vec2 uAspect;   // (1, W/H) or (H/W, 1) to keep glows circular
uniform float uSize;    // base glow radius in clip space

out vec2 vCorner;
out float vBright;
out float vLocalR;
out float vHue;

void main(){
  vCorner = aCorner;
  vBright = aBright;
  vLocalR = aLocalR;
  vHue = aHue;
  // synced fireflies glow a touch larger (a gentle "halo")
  float size = uSize * (0.7 + 0.5 * aBright + 0.35 * aLocalR);
  vec2 clip = aPos * 2.0 - 1.0;          // 0..1 → -1..1
  clip.y = -clip.y;                       // y down in world → up in clip
  vec2 offset = aCorner * size * uAspect;
  gl_Position = vec4(clip + offset, 0.0, 1.0);
}`;

const FF_FRAG = `#version 300 es
precision highp float;
in vec2 vCorner;
in float vBright;
in float vLocalR;
in float vHue;
out vec4 outColor;

// hue → warm firefly colour. We keep it in the amber/green/gold band.
vec3 hue2rgb(float h){
  // map 0..1 to a calm warm palette: green-gold → amber → warm white-gold
  vec3 cool = vec3(0.55, 0.90, 0.55);  // gentle green
  vec3 warm = vec3(1.00, 0.82, 0.45);  // amber gold
  vec3 hot  = vec3(1.00, 0.95, 0.80);  // warm white
  if (h < 0.5) return mix(cool, warm, h*2.0);
  return mix(warm, hot, (h-0.5)*2.0);
}

void main(){
  float d = length(vCorner);
  if (d > 1.0) discard;

  // soft radial falloff (matte, not a hard additive dot)
  float core = 1.0 - smoothstep(0.0, 0.35, d);
  float halo = 1.0 - smoothstep(0.2, 1.0, d);

  // idle fireflies keep a faint always-on ember so the meadow is never black.
  float idle = 0.18;
  float lum = idle + vBright * 0.85;

  // synced neighbourhoods get a slightly stronger, warmer halo (legible sync)
  float syncHalo = halo * (0.25 + 0.55 * vLocalR);

  vec3 tint = hue2rgb(clamp(vHue, 0.0, 1.0));
  // when synced, pull tint toward warm gold so a locked cluster reads as one.
  tint = mix(tint, vec3(1.0, 0.85, 0.55), vLocalR * 0.6);

  vec3 col = tint * (core * lum + syncHalo * 0.6);
  float alpha = clamp(core * lum + syncHalo * 0.5, 0.0, 1.0);

  // premultiplied alpha-over: rgb already multiplied by alpha-ish weight
  outColor = vec4(col * alpha, alpha);
}`;

export interface GLRenderer {
  /** push per-frame instance data and draw */
  draw(
    n: number,
    posXY: Float32Array, // length n*2
    bright: Float32Array, // length n
    localR: Float32Array, // length n
    hue: Float32Array, // length n
    orderR: number,
    canvasW: number,
    canvasH: number,
    timeSec: number
  ): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

export function makeRenderer(gl: WebGL2RenderingContext, maxN: number): GLRenderer {
  // ── Background program ──
  const bgProg = link(
    gl,
    compile(gl, gl.VERTEX_SHADER, BG_VERT),
    compile(gl, gl.FRAGMENT_SHADER, BG_FRAG)
  );
  const bgVao = gl.createVertexArray()!;
  const uBgTime = gl.getUniformLocation(bgProg, "uTime");
  const uBgOrder = gl.getUniformLocation(bgProg, "uOrderR");

  // ── Firefly program ──
  const ffProg = link(
    gl,
    compile(gl, gl.VERTEX_SHADER, FF_VERT),
    compile(gl, gl.FRAGMENT_SHADER, FF_FRAG)
  );
  const uAspect = gl.getUniformLocation(ffProg, "uAspect");
  const uSize = gl.getUniformLocation(ffProg, "uSize");

  const ffVao = gl.createVertexArray()!;
  gl.bindVertexArray(ffVao);

  // static unit quad (two triangles via 4 corners + index)
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  // prettier-ignore
  const corners = new Float32Array([
    -1, -1,  1, -1,  -1, 1,
     1, -1,  1,  1,  -1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // instance buffers
  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxN * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  const brightBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, brightBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxN * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(2, 1);

  const localRBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, localRBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxN * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(3, 1);

  const hueBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, hueBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxN * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(4, 1);

  gl.bindVertexArray(null);

  // Premultiplied alpha-over for everything.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  function draw(
    n: number,
    posXY: Float32Array,
    bright: Float32Array,
    localR: Float32Array,
    hue: Float32Array,
    orderR: number,
    canvasW: number,
    canvasH: number,
    timeSec: number
  ) {
    gl.viewport(0, 0, canvasW, canvasH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Pass 1: meadow
    gl.useProgram(bgProg);
    gl.bindVertexArray(bgVao);
    gl.uniform1f(uBgTime, timeSec);
    gl.uniform1f(uBgOrder, orderR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2: fireflies
    gl.useProgram(ffProg);
    gl.bindVertexArray(ffVao);

    // keep glows circular regardless of aspect
    const aspect = canvasW / canvasH;
    if (aspect >= 1) gl.uniform2f(uAspect, 1.0 / aspect, 1.0);
    else gl.uniform2f(uAspect, 1.0, aspect);
    gl.uniform1f(uSize, 0.05);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, posXY.subarray(0, n * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, brightBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, bright.subarray(0, n));
    gl.bindBuffer(gl.ARRAY_BUFFER, localRBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, localR.subarray(0, n));
    gl.bindBuffer(gl.ARRAY_BUFFER, hueBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, hue.subarray(0, n));

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
  }

  function dispose() {
    gl.deleteProgram(bgProg);
    gl.deleteProgram(ffProg);
    gl.deleteVertexArray(bgVao);
    gl.deleteVertexArray(ffVao);
    gl.deleteBuffer(cornerBuf);
    gl.deleteBuffer(posBuf);
    gl.deleteBuffer(brightBuf);
    gl.deleteBuffer(localRBuf);
    gl.deleteBuffer(hueBuf);
  }

  return { draw, dispose };
}
