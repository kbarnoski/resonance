// gl.ts — hand-written WebGL2 caustic water-light shader (no three.js, no
// Canvas2D for the main viz). A full-screen GLSL ES 3.00 fragment shader:
// domain-warped value-noise interference (caustic veins), foam highlights and
// a violet strike-bloom that flashes on each gamelan strike.
//
// The SAME sea signals that drive the audio drive the shader, read from one
// SeaDrive object, so sound and image never disagree:
//   roughness → churn/turbulence + foam, period → wave speed,
//   direction → drift vector, swell → large-scale undulation.

import type { SeaDrive } from "./marine";

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_roughness;   // 0..1
uniform float u_period;      // seconds (wave period)
uniform vec2  u_drift;       // unit drift vector from wave direction
uniform float u_swell;       // 0..1
uniform float u_bloom;       // 0..1 strike-bloom intensity (decays)
uniform float u_level;       // 0..1 master loudness tap

// ── value noise ──────────────────────────────────────────────────────────
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0));
  float d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for(int i=0;i<5;i++){
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.7);
    amp *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;

  // wave speed from period: shorter period → faster moving water.
  float speed = 0.6 / max(2.0, u_period) * 6.0;
  float t = u_time * speed;

  // drift the field along the wave direction.
  vec2 drift = u_drift * t * 0.15;

  // large-scale undulation from swell.
  float undulate = sin(uv.y*2.0 + t*0.5) * (0.08 + u_swell*0.22);
  vec2 p = uv * (2.2 + u_swell*1.0);
  p += drift;
  p.x += undulate;

  // domain warp — turbulence rises with roughness.
  float warpAmt = 0.35 + u_roughness * 1.4;
  vec2 q = vec2(fbm(p + vec2(0.0, t*0.2)), fbm(p + vec2(5.2, t*0.15)));
  vec2 r = vec2(fbm(p + warpAmt*q + vec2(1.7, 9.2) + t*0.1),
                fbm(p + warpAmt*q + vec2(8.3, 2.8) - t*0.12));
  float n = fbm(p + warpAmt*r);

  // ridged veins → caustic light filaments. Sharper with roughness.
  float ridge = 1.0 - abs(n*2.0 - 1.0);
  float sharp = 2.0 + u_roughness*5.0;
  float caustic = pow(ridge, sharp);

  // interference second layer for the shimmering web.
  float n2 = fbm(p*1.8 - r*0.5 - vec2(t*0.25));
  float caustic2 = pow(1.0 - abs(n2*2.0-1.0), 3.0);
  caustic = caustic*0.7 + caustic2*0.5;

  // foam highlights: bright crests, only where roughness is high.
  float foam = smoothstep(0.62, 0.95, n) * (0.15 + u_roughness*0.9);

  // ── palette: deep indigo → teal → bronze/gold caustics ─────────────────
  vec3 deep   = vec3(0.03, 0.05, 0.13);   // ocean indigo
  vec3 teal   = vec3(0.05, 0.30, 0.36);
  vec3 bronze = vec3(0.78, 0.55, 0.22);   // bronze/gold caustic
  vec3 gold   = vec3(1.00, 0.82, 0.42);

  float depth = smoothstep(-0.6, 0.7, uv.y + undulate*1.5);
  vec3 col = mix(deep, teal, depth*0.7);
  col = mix(col, bronze, caustic * (0.55 + 0.3*depth));
  col += gold * pow(caustic, 2.0) * (0.35 + u_level*0.5);
  col += vec3(0.85,0.92,1.0) * foam;

  // violet strike-bloom: a soft radial flash, brighter near center, that
  // pulses with u_bloom (driven per gamelan strike) and the live level.
  float d = length(uv * vec2(u_res.x/u_res.y, 1.0));
  float bloom = u_bloom * exp(-d*1.6) ;
  vec3 violet = vec3(0.55, 0.30, 0.95);
  col += violet * bloom * (0.8 + caustic*0.6);
  // a fainter all-over violet wash on loud passages
  col += violet * 0.18 * u_level * caustic;

  // gentle vignette to keep it luminous-but-dark (house style).
  float vig = smoothstep(1.25, 0.25, length(uv));
  col *= 0.55 + 0.45*vig;

  // tone-map-ish soft clip
  col = col / (1.0 + col*0.7);
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
    console.error("shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface SceneHandle {
  setDrive: (d: SeaDrive) => void;
  pulseBloom: (amount: number) => void; // call on gamelan strikes
  setLevel: (level: number) => void; // master loudness tap
  dispose: () => void;
}

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  roughness: WebGLUniformLocation | null;
  period: WebGLUniformLocation | null;
  drift: WebGLUniformLocation | null;
  swell: WebGLUniformLocation | null;
  bloom: WebGLUniformLocation | null;
  level: WebGLUniformLocation | null;
}

/**
 * Start the caustic water-light scene. Returns null if WebGL2 is unavailable
 * or setup fails, so the caller can degrade gracefully (audio keeps playing).
 */
export function startScene(canvas: HTMLCanvasElement): SceneHandle | null {
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
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u: Uniforms = {
    res: gl.getUniformLocation(prog, "u_res"),
    time: gl.getUniformLocation(prog, "u_time"),
    roughness: gl.getUniformLocation(prog, "u_roughness"),
    period: gl.getUniformLocation(prog, "u_period"),
    drift: gl.getUniformLocation(prog, "u_drift"),
    swell: gl.getUniformLocation(prog, "u_swell"),
    bloom: gl.getUniformLocation(prog, "u_bloom"),
    level: gl.getUniformLocation(prog, "u_level"),
  };

  // smoothed state so live data updates never jump.
  let tRoughness = 0.3;
  let tPeriod = 8;
  let tDriftX = 1;
  let tDriftY = 0;
  let tSwell = 0.3;
  let curRoughness = tRoughness;
  let curPeriod = tPeriod;
  let curDriftX = tDriftX;
  let curDriftY = tDriftY;
  let curSwell = tSwell;
  let bloom = 0;
  let level = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  let raf = 0;
  let disposed = false;
  const start = performance.now();

  const frame = () => {
    if (disposed) return;
    resize();
    const t = (performance.now() - start) / 1000;

    const k = 0.03;
    curRoughness += (tRoughness - curRoughness) * k;
    curPeriod += (tPeriod - curPeriod) * k;
    curDriftX += (tDriftX - curDriftX) * k;
    curDriftY += (tDriftY - curDriftY) * k;
    curSwell += (tSwell - curSwell) * k;
    bloom *= 0.9; // strike-bloom decays each frame

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.roughness, curRoughness);
    gl.uniform1f(u.period, curPeriod);
    gl.uniform2f(u.drift, curDriftX, curDriftY);
    gl.uniform1f(u.swell, curSwell);
    gl.uniform1f(u.bloom, bloom);
    gl.uniform1f(u.level, level);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setDrive: (d: SeaDrive) => {
      tRoughness = d.roughness;
      tPeriod = d.period;
      tDriftX = Math.cos((d.direction * Math.PI) / 180);
      tDriftY = Math.sin((d.direction * Math.PI) / 180);
      tSwell = d.swell;
    },
    pulseBloom: (amount: number) => {
      bloom = Math.min(1, bloom + amount);
    },
    setLevel: (l: number) => {
      level = Math.min(1, Math.max(0, l));
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}
