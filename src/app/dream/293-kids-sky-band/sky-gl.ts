// sky-gl.ts — the sky itself: a single full-screen-quad WebGL2 fragment
// shader. One program, time + weather uniforms updated per frame via rAF.
// No three.js. If WebGL2 is unavailable the caller shows a fallback notice.

import type { Weather } from "./weather";

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// One fragment shader paints the whole sky. Distance fields give the
// sun/moon a tiny friendly face. fbm value-noise drifts the clouds.
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_temp;     // -20..45 mapped → 0..1 warmth
uniform float u_cloud;    // 0..1 coverage
uniform float u_wind;     // 0..1 movement
uniform float u_rain;     // 0..1 precipitation intensity
uniform float u_isDay;    // 0 night, 1 day

// ── noise ──────────────────────────────────────────────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}

float smiley(vec2 p, float r) {
  // p is in disc-local space, r is disc radius. Returns coverage 0..1 of
  // dark face features (two eyes + a smile arc).
  float face = 0.0;
  vec2 eyeL = vec2(-0.32, 0.18) * r;
  vec2 eyeR = vec2( 0.32, 0.18) * r;
  float eyeR2 = 0.10 * r;
  face = max(face, smoothstep(eyeR2, eyeR2 * 0.5, length(p - eyeL)));
  face = max(face, smoothstep(eyeR2, eyeR2 * 0.5, length(p - eyeR)));
  // Smile: distance to a circle arc below centre.
  vec2 m = p - vec2(0.0, 0.05 * r);
  float d = abs(length(m) - 0.45 * r);
  float mouth = smoothstep(0.07 * r, 0.03 * r, d);
  mouth *= step(m.y, -0.02 * r); // lower half only → a smile, not a ring
  face = max(face, mouth);
  return face;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;        // 0..1
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res.xy) / u_res.y; // aspect-correct

  // ── sky gradient ───────────────────────────────────────────────────
  float warmth = clamp((u_temp + 20.0) / 65.0, 0.0, 1.0);

  vec3 dayTop = mix(vec3(0.20, 0.42, 0.78), vec3(0.30, 0.55, 0.85), warmth);
  vec3 dayBot = mix(vec3(0.74, 0.82, 0.92), vec3(0.99, 0.86, 0.62), warmth);
  vec3 nightTop = vec3(0.04, 0.05, 0.13);
  vec3 nightBot = mix(vec3(0.12, 0.10, 0.24), vec3(0.22, 0.13, 0.22), warmth);

  vec3 top = mix(nightTop, dayTop, u_isDay);
  vec3 bot = mix(nightBot, dayBot, u_isDay);
  float g = smoothstep(0.0, 1.0, uv.y);
  vec3 col = mix(bot, top, g);

  // ── stars at night ─────────────────────────────────────────────────
  if (u_isDay < 0.5) {
    vec2 sp = uv * vec2(u_res.x / u_res.y, 1.0) * 90.0;
    float star = hash(floor(sp));
    float tw = 0.5 + 0.5 * sin(u_time * 2.0 + star * 40.0);
    float spark = smoothstep(0.985, 1.0, star) * tw;
    col += spark * vec3(0.9, 0.93, 1.0) * (1.0 - uv.y * 0.4);
  }

  // ── sun / moon disc with a friendly face ───────────────────────────
  vec2 discPos = vec2(0.28, 0.30 - 0.10 * u_isDay); // a touch higher by day
  vec2 dp = p - discPos;
  float discR = 0.16;
  float dist = length(dp);
  vec3 sunCol = mix(vec3(1.0, 0.93, 0.55), vec3(1.0, 0.80, 0.40), warmth);
  vec3 moonCol = vec3(0.92, 0.94, 1.0);
  vec3 bodyCol = mix(moonCol, sunCol, u_isDay);

  // soft glow halo
  float glow = exp(-dist * (u_isDay > 0.5 ? 5.0 : 8.0)) * (u_isDay > 0.5 ? 0.55 : 0.30);
  col += glow * bodyCol;

  float disc = smoothstep(discR, discR - 0.012, dist);
  // moon crescent shading at night
  float shade = 1.0;
  if (u_isDay < 0.5) {
    float crescent = smoothstep(0.0, 0.18, length(dp - vec2(0.05, 0.02)) - discR * 0.6);
    shade = mix(0.55, 1.0, crescent);
  }
  vec3 discShaded = bodyCol * shade;
  float face = smiley(dp, discR);
  discShaded = mix(discShaded, vec3(0.18, 0.12, 0.10), face * 0.85);
  col = mix(col, discShaded, disc);

  // ── drifting clouds (fbm) ──────────────────────────────────────────
  float drift = u_time * (0.012 + u_wind * 0.10);
  vec2 cp = uv * vec2(u_res.x / u_res.y, 1.0) * 2.4;
  cp.x += drift;
  float n = fbm(cp + fbm(cp * 0.5 + drift * 0.5));
  // coverage threshold: more cloud_cover → lower threshold → more cloud.
  float thresh = mix(0.78, 0.30, clamp(u_cloud, 0.0, 1.0));
  float cloudMask = smoothstep(thresh, thresh + 0.22, n);
  cloudMask *= smoothstep(-0.1, 0.45, uv.y); // fewer clouds at the horizon
  vec3 cloudLit = mix(vec3(0.62, 0.64, 0.72), vec3(0.97, 0.97, 1.0), u_isDay);
  cloudLit = mix(cloudLit, vec3(0.30, 0.32, 0.42), 1.0 - u_isDay);
  col = mix(col, cloudLit, cloudMask * (0.55 + 0.35 * u_cloud));

  // ── rain streaks ───────────────────────────────────────────────────
  if (u_rain > 0.001) {
    vec2 rp = uv * vec2(60.0, 22.0);
    rp.y += u_time * (7.0 + u_wind * 8.0);
    rp.x += u_time * (1.0 + u_wind * 4.0);
    float col_i = floor(rp.x);
    float drop = hash(vec2(col_i, floor(rp.y * 0.2)));
    float streak = smoothstep(0.92, 1.0, fract(rp.y) ) * step(drop, 0.4 + u_rain * 0.5);
    streak *= smoothstep(0.0, 0.3, fract(rp.x)) * smoothstep(1.0, 0.7, fract(rp.x));
    col = mix(col, vec3(0.78, 0.85, 0.95), streak * 0.35 * clamp(u_rain * 2.0, 0.2, 1.0));
  }

  // gentle vignette
  float vig = smoothstep(1.25, 0.35, length(uv - 0.5));
  col *= mix(0.82, 1.0, vig);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  temp: WebGLUniformLocation | null;
  cloud: WebGLUniformLocation | null;
  wind: WebGLUniformLocation | null;
  rain: WebGLUniformLocation | null;
  isDay: WebGLUniformLocation | null;
}

export interface SkyHandle {
  /** Push a new weather snapshot (values are smoothed toward it each frame). */
  setWeather: (w: Weather) => void;
  /** Stop the render loop and release GL resources. */
  dispose: () => void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("sky shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Targets the shader smooths toward, in normalised-ish ranges.
interface Targets {
  temp: number;
  cloud: number;
  wind: number;
  rain: number;
  isDay: number;
}

function targetsFrom(w: Weather): Targets {
  return {
    temp: w.temperature,
    cloud: Math.max(0, Math.min(1, w.cloudCover / 100)),
    wind: Math.max(0, Math.min(1, w.windSpeed / 60)),
    rain: Math.max(0, Math.min(1, w.precipitation / 5)),
    isDay: w.isDay ? 1 : 0,
  };
}

// Start the sky. Returns null if WebGL2 is unavailable / setup fails so the
// caller can show a graceful fallback.
export function startSky(
  canvas: HTMLCanvasElement,
  initial: Weather,
): SkyHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
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
    console.error("sky program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // Full-screen quad (two triangles).
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
    temp: gl.getUniformLocation(prog, "u_temp"),
    cloud: gl.getUniformLocation(prog, "u_cloud"),
    wind: gl.getUniformLocation(prog, "u_wind"),
    rain: gl.getUniformLocation(prog, "u_rain"),
    isDay: gl.getUniformLocation(prog, "u_isDay"),
  };

  let target = targetsFrom(initial);
  const cur: Targets = { ...target };

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

    // Smooth toward targets so weather updates never jump.
    const k = 0.02;
    cur.temp += (target.temp - cur.temp) * k;
    cur.cloud += (target.cloud - cur.cloud) * k;
    cur.wind += (target.wind - cur.wind) * k;
    cur.rain += (target.rain - cur.rain) * k;
    cur.isDay += (target.isDay - cur.isDay) * k;

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.temp, cur.temp);
    gl.uniform1f(u.cloud, cur.cloud);
    gl.uniform1f(u.wind, cur.wind);
    gl.uniform1f(u.rain, cur.rain);
    gl.uniform1f(u.isDay, cur.isDay);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setWeather: (w: Weather) => {
      target = targetsFrom(w);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
