// Raw WebGL2 horizon/sky field. Hand-written GLSL ES 3.00 — no three.js.
// Renders a single full-screen triangle; all the work happens in the fragment
// shader, driven by uniforms set from the computed sky state each frame.
//
// Returns null on failure (caller shows a graceful text notice; audio still runs).

import type { SkyState } from "./astronomy";
import { seasonBrightness } from "./astronomy";

const VERT = `#version 300 es
precision highp float;
// full-screen triangle generated from gl_VertexID, no buffers needed
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; // 0..2
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uSunAlt;    // degrees, -90..90
uniform float uSunAz;     // degrees, 0..360 (0=N,90=E,180=S,270=W)
uniform float uMoonIllum; // 0..1
uniform float uMoonPhase; // 0..1
uniform float uSeason;    // 0 winter .. 1 summer (brightness)
uniform float uStarSeed;

// hash / value noise for matte star field + faint banding
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

// Map a normalized horizontal screen position to an azimuth-ish offset so the
// sun/moon glide left<->right with azimuth.
// We place objects on an arc: x from azimuth (E->right), y from altitude.
vec2 skyPos(float azDeg, float altDeg){
  // azimuth 90 (E) -> left(0), 270 (W) -> right(1); 180 (S) -> center.
  float x = clamp((azDeg - 90.0) / 180.0, -0.4, 1.4);
  // altitude -20..70 mapped into vertical screen band
  float y = clamp((altDeg + 12.0) / 80.0, -0.2, 1.2);
  return vec2(x, y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;          // 0..1
  float aspect = uRes.x / uRes.y;

  // ---- day/night factor from sun altitude ---------------------------------
  // smooth night(<-6) .. day(>+6)
  float dayness = smoothstep(-12.0, 8.0, uSunAlt);
  float twilight = exp(-pow((uSunAlt - 0.0)/9.0, 2.0)); // peaks at horizon

  // ---- base sky gradient ---------------------------------------------------
  // Night palette: deep indigo cellar. Day: muted desaturated blue. Twilight:
  // warm amber bloom near the horizon. All matte (no harsh saturation).
  vec3 nightTop = vec3(0.015, 0.02, 0.05);
  vec3 nightBot = vec3(0.04, 0.05, 0.09);
  vec3 dayTop   = vec3(0.16, 0.27, 0.40);
  vec3 dayBot   = vec3(0.45, 0.55, 0.62);

  // season tints day slightly: winter cooler/greyer, summer warmer.
  vec3 seasonWarm = mix(vec3(-0.02, -0.01, 0.02), vec3(0.05, 0.03, -0.03), uSeason);
  dayTop += seasonWarm;
  dayBot += seasonWarm;

  vec3 top = mix(nightTop, dayTop, dayness);
  vec3 bot = mix(nightBot, dayBot, dayness);
  vec3 sky = mix(bot, top, smoothstep(0.0, 1.0, uv.y));

  // horizon band — a soft line where land meets sky
  float horizon = 0.30;
  float band = smoothstep(0.0, 0.06, abs(uv.y - horizon));
  // warm twilight glow hugging the horizon
  vec3 amber = vec3(0.55, 0.32, 0.16);
  float glow = twilight * exp(-abs(uv.y - horizon) * 5.0);
  sky += amber * glow * 0.9;

  // matte land below horizon
  if (uv.y < horizon) {
    float d = (horizon - uv.y);
    vec3 land = mix(vec3(0.03,0.035,0.045), vec3(0.01,0.012,0.02), smoothstep(0.0,horizon,d));
    land += amber * glow * 0.25;
    sky = land;
  }

  // ---- stars: density rises as the sun sets -------------------------------
  float starAmt = (1.0 - dayness);
  if (uv.y > horizon && starAmt > 0.01) {
    vec2 g = floor(gl_FragCoord.xy / 2.5);
    float h = hash(g + uStarSeed);
    float star = step(0.997, h) * starAmt;
    // gentle twinkle
    float tw = 0.6 + 0.4 * sin(uTime * 1.7 + h * 90.0);
    sky += vec3(0.7, 0.74, 0.85) * star * tw * 0.8;
  }

  // ---- the sun disc --------------------------------------------------------
  vec2 sp = skyPos(uSunAz, uSunAlt);
  vec2 sunUv = vec2(sp.x, sp.y * 0.85 + horizon * 0.15);
  vec2 dSun = (uv - sunUv);
  dSun.x *= aspect;
  float sunR = 0.045;
  float sunCore = smoothstep(sunR, sunR*0.4, length(dSun));
  // sun only visible when above (or near) horizon; warm matte color
  float sunVis = smoothstep(-6.0, 2.0, uSunAlt);
  vec3 sunCol = mix(vec3(0.9,0.45,0.25), vec3(1.0,0.92,0.78), dayness);
  // soft halo, restrained (no garish bloom)
  float halo = exp(-length(dSun) * 9.0) * 0.35 * sunVis;
  sky += sunCol * sunCore * sunVis;
  sky += sunCol * halo;

  // ---- the moon disc, lit by phase ----------------------------------------
  // place the moon roughly opposite the sun in azimuth, riding higher at night
  float moonAz = mod(uSunAz + 180.0, 360.0);
  float moonAlt = mix(40.0, -10.0, dayness); // up at night, set by day
  vec2 mp = skyPos(moonAz, moonAlt);
  vec2 moonUv = vec2(mp.x, mp.y * 0.85 + horizon * 0.15);
  vec2 dMoon = (uv - moonUv);
  dMoon.x *= aspect;
  float moonR = 0.035;
  float moonDisc = smoothstep(moonR, moonR*0.6, length(dMoon));
  // phase shading: terminator sweeps across the disc with uMoonPhase.
  // dir of lit side based on phase (waxing lit on one side, waning the other).
  float term = (uMoonPhase < 0.5)
      ? mix(-1.0, 1.0, uMoonPhase * 2.0)
      : mix(1.0, -1.0, (uMoonPhase - 0.5) * 2.0);
  float litMask = smoothstep(term - 0.25, term + 0.25, dMoon.x / moonR);
  float moonVis = (1.0 - dayness * 0.85);
  vec3 moonCol = vec3(0.82, 0.85, 0.95);
  float lit = moonDisc * mix(0.06, 1.0, litMask) * (0.25 + 0.75 * uMoonIllum);
  sky += moonCol * lit * moonVis;
  // faint moon halo scaled by illumination
  sky += moonCol * exp(-length(dMoon) * 12.0) * 0.12 * uMoonIllum * moonVis;

  // ---- final: gentle vignette, matte tone ---------------------------------
  vec2 vc = uv - 0.5;
  float vig = 1.0 - dot(vc, vc) * 0.6;
  sky *= vig;

  // soft filmic-ish clamp to keep it matte
  sky = sky / (sky + vec3(0.85));
  sky = pow(max(sky, 0.0), vec3(0.95));

  fragColor = vec4(sky, 1.0);
}`;

export type SkyRenderer = {
  render: (s: SkyState, timeSec: number) => void;
  resize: () => void;
  dispose: () => void;
};

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
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createSkyRenderer(
  canvas: HTMLCanvasElement,
): SkyRenderer | null {
  const ctx = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    sunAlt: gl.getUniformLocation(prog, "uSunAlt"),
    sunAz: gl.getUniformLocation(prog, "uSunAz"),
    moonIllum: gl.getUniformLocation(prog, "uMoonIllum"),
    moonPhase: gl.getUniformLocation(prog, "uMoonPhase"),
    season: gl.getUniformLocation(prog, "uSeason"),
    starSeed: gl.getUniformLocation(prog, "uStarSeed"),
  };

  const starSeed = Math.random() * 100;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  function render(s: SkyState, timeSec: number) {
    resize();
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, timeSec);
    gl.uniform1f(u.sunAlt, s.sunAltDeg);
    gl.uniform1f(u.sunAz, s.sunAzDeg);
    gl.uniform1f(u.moonIllum, s.moonIllum);
    gl.uniform1f(u.moonPhase, s.moonPhase);
    gl.uniform1f(u.season, seasonBrightness(s.dayOfYear));
    gl.uniform1f(u.starSeed, starSeed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteVertexArray(vao);
  }

  return { render, resize, dispose };
}
