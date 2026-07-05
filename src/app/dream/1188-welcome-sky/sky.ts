// ─────────────────────────────────────────────────────────────────────────────
// sky.ts — the hero visual: a volumetric raymarched cloudscape on raw WebGL2.
//
//   A full-screen triangle drives a fragment shader that raymarches a layered
//   fractal-noise (fbm) cloud slab lit by a single sun. The sun's position and
//   the whole palette are driven by `progress` (0 = dawn → 0.5 = midday →
//   1 = dusk), so the sky at minute 5 is a genuinely different world than the
//   sky at minute 1 — the long-form state. Live music features bend the weather:
//   energy → light + cloud density, centroid → warm/cool + wispy/heavy,
//   flux → a soft brightening pulse and light shafts near the sun.
//
//   Everything drifts slowly — no strobe, no harsh flicker. Brightness changes
//   are smoothed on the JS side before they ever reach a uniform.
//
//   If WebGL2 is unavailable, drawFallbackSky() paints a clean Canvas2D
//   painterly-gradient sky with a few soft cloud blobs that still breathe with
//   energy, so this piece always renders something beautiful.
// ─────────────────────────────────────────────────────────────────────────────

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

// The music/day state the renderer needs each frame.
export interface SkyState {
  time: number; // seconds, for slow drift
  progress: number; // 0..1 day phase (dawn→midday→dusk)
  energy: number; // 0..1 loudness
  centroid: number; // 0..1 brightness
  flux: number; // 0..1 onset pulse
  drift: number; // 0..1 motion scale (reduced-motion lowers it)
}

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
uniform float uDrift;
uniform vec3  uSunDir;      // normalized
uniform vec3  uSunCol;      // sun tint (warm at dawn/dusk, white midday)
uniform vec3  uSkyHorizon;  // warm horizon band
uniform vec3  uSkyZenith;   // deep blue overhead
uniform float uCoverage;    // 0..1 cloud coverage (energy)
uniform float uThickness;   // 0..1 cloud thickness (energy)
uniform float uWisp;        // 0..1 high/wispy vs low/heavy (centroid)
uniform float uFlux;        // 0..1 onset brightening
uniform float uExposure;    // overall light gain

// ── noise ────────────────────────────────────────────────────────────────
float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);
  float n000 = hash(i+vec3(0,0,0)); float n100 = hash(i+vec3(1,0,0));
  float n010 = hash(i+vec3(0,1,0)); float n110 = hash(i+vec3(1,1,0));
  float n001 = hash(i+vec3(0,0,1)); float n101 = hash(i+vec3(1,0,1));
  float n011 = hash(i+vec3(0,1,1)); float n111 = hash(i+vec3(1,1,1));
  return mix(
    mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
    mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + vec3(1.7,9.2,4.3); a *= 0.5; }
  return v;
}

// cloud slab: base..top world heights
const float BASE = 6.0;
const float TOP  = 14.0;

float densityAt(vec3 p){
  // wisp raises the layer and shrinks features so high passages read as thin
  // cirrus; low/heavy passages sit lower and thicker.
  vec3 wind = vec3(uTime * 0.06 * uDrift, uTime * 0.015 * uDrift, uTime * 0.02 * uDrift);
  float scale = mix(0.14, 0.26, uWisp);
  float f = fbm(p * scale + wind);
  // coverage lifts the whole field toward being cloud; energy-linked.
  float cov = mix(0.62, 0.30, uCoverage);
  float d = f - cov;
  // soft vertical envelope inside the slab (feathered top & bottom)
  float h = (p.y - BASE) / (TOP - BASE);
  float env = smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.55, h);
  d *= env;
  float thick = mix(0.9, 1.9, uThickness);
  return clamp(d * thick, 0.0, 1.0);
}

// short march toward the sun for self-shadowing
float lightMarch(vec3 p){
  float t = 0.0;
  float acc = 0.0;
  for(int i=0;i<5;i++){
    vec3 sp = p + uSunDir * t;
    acc += densityAt(sp);
    t += 1.1;
  }
  return acc;
}

vec3 skyColor(vec3 rd){
  float el = clamp(rd.y * 1.6, 0.0, 1.0);
  // Rayleigh-ish vertical gradient horizon→zenith
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(el, 0.55));
  // sun glow bled into the sky
  float sd = max(dot(rd, uSunDir), 0.0);
  float halo = pow(sd, 6.0) * 0.5 + pow(sd, 40.0) * 0.7;
  col += uSunCol * halo * (0.8 + uFlux * 0.9);
  // crisp sun disc
  float disc = smoothstep(0.9975, 0.9992, sd);
  col += uSunCol * disc * 2.2 * (1.0 + uFlux);
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  uv.x *= aspect;
  // ground observer looking toward the horizon, a little upward
  vec3 rd = normalize(vec3(uv.x * 0.9, uv.y * 0.6 + 0.12, 1.0));

  vec3 sky = skyColor(rd);
  vec3 col = sky;

  // Only march where the ray rises toward the cloud slab.
  if(rd.y > 0.012){
    // entry/exit of the horizontal slab (camera at y=0)
    float tBase = BASE / rd.y;
    float tTop  = TOP  / rd.y;
    float tEnter = min(tBase, tTop);
    float tExit  = max(tBase, tTop);
    tExit = min(tExit, 90.0); // don't march to infinity near the horizon

    float span = tExit - tEnter;
    if(span > 0.0){
      const int STEPS = 48;
      float dt = span / float(STEPS);
      // dither the start to hide banding
      float jitter = hash(vec3(gl_FragCoord.xy, uTime)) * dt;
      float t = tEnter + jitter;
      float T = 1.0;            // transmittance
      vec3  scattered = vec3(0.0);
      // ambient sky light the clouds sit in (cool up-light)
      vec3 ambient = mix(uSkyHorizon, uSkyZenith, 0.4) * 0.9;

      for(int i=0;i<STEPS;i++){
        if(T < 0.02) break;
        vec3 p = rd * t;
        float d = densityAt(p);
        if(d > 0.01){
          float shadow = lightMarch(p);
          float lit = exp(-shadow * 0.9);
          // powder / edge darkening for volume
          float powder = 1.0 - exp(-d * 2.0);
          vec3 sunTerm = uSunCol * lit * (0.7 + uFlux * 0.5);
          vec3 sampleCol = (ambient + sunTerm) * powder;
          float alpha = d * dt * 0.85;
          scattered += T * alpha * sampleCol;
          T *= 1.0 - alpha;
        }
        t += dt;
      }
      col = scattered + sky * T;
    }
  } else {
    // below the horizon: settle into a soft warm haze band
    float b = smoothstep(0.0, -0.25, rd.y);
    col = mix(col, uSkyHorizon * 0.85, b);
  }

  // exposure + gentle onset lift (smoothed upstream, never a strobe)
  col *= uExposure * (1.0 + uFlux * 0.25);

  // filmic-ish tone + subtle vignette to seat the frame
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.92));
  float vig = smoothstep(1.5, 0.35, length((gl_FragCoord.xy/uRes - 0.5) * vec2(aspect, 1.0)));
  col *= mix(0.82, 1.0, vig);

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

// ── palette + sun direction from the day phase ───────────────────────────────

type V3 = [number, number, number];

function lerp3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// dawn → midday → dusk anchors
const HORIZON_DAWN: V3 = [0.98, 0.72, 0.62];
const HORIZON_MID: V3 = [0.78, 0.86, 0.98];
const HORIZON_DUSK: V3 = [1.0, 0.66, 0.4];

const ZENITH_DAWN: V3 = [0.36, 0.46, 0.72];
const ZENITH_MID: V3 = [0.24, 0.5, 0.86];
const ZENITH_DUSK: V3 = [0.3, 0.32, 0.62];

const SUN_DAWN: V3 = [1.0, 0.72, 0.5];
const SUN_MID: V3 = [1.0, 0.98, 0.94];
const SUN_DUSK: V3 = [1.0, 0.6, 0.32];

function phaseLerp(a: V3, mid: V3, b: V3, p: number): V3 {
  return p <= 0.5 ? lerp3(a, mid, p / 0.5) : lerp3(mid, b, (p - 0.5) / 0.5);
}

interface Derived {
  sunDir: V3;
  sunCol: V3;
  horizon: V3;
  zenith: V3;
  coverage: number;
  thickness: number;
  wisp: number;
  exposure: number;
}

/** Turn the music/day state into shader-ready values. Centroid warms/cools the
 *  light; progress sweeps the sun on a full day arc. */
function derive(s: SkyState): Derived {
  const p = s.progress;
  // Sun elevation: low at dawn/dusk, high at midday. Azimuth sweeps L→R.
  const elev = Math.sin(p * Math.PI); // 0 at ends, 1 at noon
  const y = 0.02 + elev * 0.85;
  const az = (p - 0.5) * 1.7; // -0.85 → 0.85
  const x = Math.sin(az) * 0.9;
  const z = Math.cos(az) * 0.9;
  const len = Math.hypot(x, y, z) || 1;
  const sunDir: V3 = [x / len, y / len, z / len];

  // Centroid nudges light warmth: high centroid → cooler/whiter.
  const warm = 1 - s.centroid * 0.35;
  const sunColBase = phaseLerp(SUN_DAWN, SUN_MID, SUN_DUSK, p);
  const sunCol: V3 = [
    sunColBase[0],
    sunColBase[1] * (0.9 + s.centroid * 0.12),
    sunColBase[2] * (0.85 + s.centroid * 0.2) * (2 - warm),
  ];

  const horizon = phaseLerp(HORIZON_DAWN, HORIZON_MID, HORIZON_DUSK, p);
  const zenith = phaseLerp(ZENITH_DAWN, ZENITH_MID, ZENITH_DUSK, p);

  return {
    sunDir,
    sunCol,
    horizon,
    zenith,
    coverage: s.energy,
    thickness: 0.15 + s.energy * 0.85,
    wisp: s.centroid,
    // brighter at midday, softer at the ends; louder = a touch more bloom.
    exposure: (0.92 + elev * 0.28) * (1 + s.energy * 0.18),
  };
}

export class SkyRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private lostHandler: (e: Event) => void;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error("createProgram failed");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("createVertexArray failed");
    this.vao = vao;

    for (const name of [
      "uRes", "uTime", "uDrift", "uSunDir", "uSunCol", "uSkyHorizon",
      "uSkyZenith", "uCoverage", "uThickness", "uWisp", "uFlux", "uExposure",
    ]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }

    this.lostHandler = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", this.lostHandler, false);
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.gl.viewport(0, 0, pw, ph);
  }

  render(s: SkyState): void {
    const gl = this.gl;
    const d = derive(s);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.uTime, s.time);
    gl.uniform1f(this.loc.uDrift, s.drift);
    gl.uniform3f(this.loc.uSunDir, d.sunDir[0], d.sunDir[1], d.sunDir[2]);
    gl.uniform3f(this.loc.uSunCol, d.sunCol[0], d.sunCol[1], d.sunCol[2]);
    gl.uniform3f(this.loc.uSkyHorizon, d.horizon[0], d.horizon[1], d.horizon[2]);
    gl.uniform3f(this.loc.uSkyZenith, d.zenith[0], d.zenith[1], d.zenith[2]);
    gl.uniform1f(this.loc.uCoverage, d.coverage);
    gl.uniform1f(this.loc.uThickness, d.thickness);
    gl.uniform1f(this.loc.uWisp, d.wisp);
    gl.uniform1f(this.loc.uFlux, s.flux);
    gl.uniform1f(this.loc.uExposure, d.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.lostHandler, false);
    try {
      gl.deleteProgram(this.prog);
      gl.deleteVertexArray(this.vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* ignore */
    }
  }
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
// A painterly layered-gradient sky with a few soft blurred cloud blobs that
// still drift and respond to energy. No WebGL2 required.

interface Blob {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
}
let blobs: Blob[] | null = null;

function makeBlobs(): Blob[] {
  const out: Blob[] = [];
  for (let i = 0; i < 7; i++) {
    out.push({
      x: Math.random(),
      y: 0.35 + Math.random() * 0.35,
      r: 0.12 + Math.random() * 0.14,
      speed: 0.004 + Math.random() * 0.01,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

function rgb(c: V3): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

export function drawFallbackSky(canvas: HTMLCanvasElement, s: SkyState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!blobs) blobs = makeBlobs();

  const d = derive(s);
  const elev = Math.sin(s.progress * Math.PI);

  // vertical sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(d.zenith));
  g.addColorStop(0.62, rgb(lerp3(d.zenith, d.horizon, 0.6)));
  g.addColorStop(1, rgb(d.horizon));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sun glow — position tracks the day arc
  const sunX = (0.5 + Math.sin((s.progress - 0.5) * 1.7) * 0.42) * w;
  const sunY = (0.9 - elev * 0.7) * h;
  const sunR = Math.min(w, h) * (0.28 + s.flux * 0.08);
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  const sc = d.sunCol;
  sg.addColorStop(0, `rgba(${Math.round(sc[0] * 255)},${Math.round(sc[1] * 255)},${Math.round(sc[2] * 255)},${0.9})`);
  sg.addColorStop(0.25, `rgba(${Math.round(sc[0] * 255)},${Math.round(sc[1] * 255)},${Math.round(sc[2] * 255)},${0.35 + s.flux * 0.2})`);
  sg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);

  // soft cloud blobs
  ctx.save();
  ctx.filter = "blur(18px)";
  for (const b of blobs) {
    b.x = (b.x + b.speed * s.drift * 0.5) % 1.2;
    const cx = ((b.x - 0.1) % 1.2) * w;
    const cy = (b.y + Math.sin(s.time * 0.1 + b.phase) * 0.02) * h;
    const r = b.r * Math.min(w, h) * (0.8 + s.energy * 0.6);
    const alpha = 0.18 + s.energy * 0.4;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, `rgba(255,255,255,${alpha})`);
    cg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function resetFallback(): void {
  blobs = null;
}
