// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — the warm volumetric "weather" field. A single full-screen WebGL2
// fragment shader accumulates a warm fbm density along a view ray (a cheap
// raymarch), domain-warped so it reads as rolling organic weather rather than a
// grid. Refik Anadol's warm volumetric register is the aesthetic reference: soft,
// cosmic-ambient, non-analytical — no circle-of-fifths, no meters, no datamatics.
//
//  · forecast FRONTS seed faint glowing density lobes AHEAD of the read head —
//    higher-probability branches sit closer and denser; a raised prediction
//    horizon pushes the whole front deeper toward the horizon.
//  · on arrival the fronts CONVERGE into a warm core (the harmony that came).
//  · on surprise the core RUPTURES into turbulent shards of light.
//
// Turbulence + brightness are driven by the safeMaster analyser (bass, overall
// energy). Palette: deep plum → ember → dusk-rose → warm gold on near-black warm
// background; minor chords cool the warmth toward dusk-rose.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FRONTS = 6;

export interface FieldUniforms {
  time: number;
  bass: number;
  bright: number;
  energy: number;
  horizon: number; // 0..1 (prediction horizon 1→4 normalized)
  lean: number; // 0..1
  converge: number; // 0..1 (gathering → arrived)
  warmth: number; // 0..1 slow palette drift / reach
  rupture: number; // 0..1 decaying surprise
  bloomHue: number; // 0..1 hue token of arrived chord
  bloomInt: number; // 0..1 arrival bloom intensity
  bloomMinor: number; // 0..1
  degrade: number; // 0 model present, 1 ambient fallback
  fronts: Float32Array; // MAX_FRONTS * 4 : xOffset(-1..1), prob, hueToken, minor
  frontCount: number;
}

export interface Field {
  render(u: FieldUniforms): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime, uBass, uBright, uEnergy;
uniform float uHorizon, uLean, uConverge, uWarmth, uRupture;
uniform float uBloomHue, uBloomInt, uBloomMinor, uDegrade;
uniform int uFrontCount;
uniform vec4 uFronts[${MAX_FRONTS}];

float hash31(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0,0.0,0.0));
  float n100 = hash31(i + vec3(1.0,0.0,0.0));
  float n010 = hash31(i + vec3(0.0,1.0,0.0));
  float n110 = hash31(i + vec3(1.0,1.0,0.0));
  float n001 = hash31(i + vec3(0.0,0.0,1.0));
  float n101 = hash31(i + vec3(1.0,0.0,1.0));
  float n011 = hash31(i + vec3(0.0,1.0,1.0));
  float n111 = hash31(i + vec3(1.0,1.0,1.0));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  float y0 = mix(x00, x10, f.y);
  float y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 3; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// deep plum → ember → dusk-rose → warm gold; minor cools toward dusk-rose
vec3 warmPalette(float t, float minorness){
  vec3 plum  = vec3(0.11, 0.03, 0.08);
  vec3 ember = vec3(0.52, 0.12, 0.06);
  vec3 rose  = vec3(0.85, 0.30, 0.30);
  vec3 gold  = vec3(1.00, 0.74, 0.40);
  vec3 c;
  if(t < 0.33) c = mix(plum, ember, t / 0.33);
  else if(t < 0.66) c = mix(ember, rose, (t - 0.33) / 0.33);
  else c = mix(rose, gold, (t - 0.66) / 0.34);
  vec3 dusk = vec3(0.46, 0.13, 0.26);
  c = mix(c, mix(c, dusk, 0.6), minorness);
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(uv, 0.0);
  vec3 rd = normalize(vec3(uv * 0.5, 1.0));

  const int STEPS = 26;
  float ZMAX = 3.0;
  float stepSize = ZMAX / float(STEPS);
  float turb = 0.5 + uBass * 1.5 + uEnergy * 0.4;
  float gatherZ = mix(1.1, 2.7, uHorizon);

  vec3 acc = vec3(0.0);
  float trans = 1.0;

  for(int i = 0; i < STEPS; i++){
    float z = (float(i) + 0.5) * stepSize;
    vec3 pos = ro + rd * z;

    vec3 q = pos * vec3(1.15, 1.15, 0.9);
    q += vec3(uTime * 0.05, uTime * 0.02, -uTime * 0.13); // front rolls in
    vec3 w = vec3(fbm(q * 0.7 + 1.3), fbm(q * 0.7 + 5.1), 0.5);
    q += (0.55 + 0.55 * turb) * (w - 0.5);
    float base = fbm(q);
    float dens = smoothstep(0.5, 0.95, base) * (0.45 + 0.9 * turb) * 0.5;
    dens += 0.02; // never fully empty — a warm haze you stand inside

    float temp = 0.28 + 0.18 * uWarmth + 0.12 * base + 0.08 * sin(z * 1.3 - uTime * 0.1);
    float minorness = uBloomMinor * 0.25;

    // forecast fronts ahead of the read head
    for(int fI = 0; fI < ${MAX_FRONTS}; fI++){
      if(fI >= uFrontCount) break;
      vec4 fr = uFronts[fI];
      float prob = fr.y;
      // emphasis: lean shifts weight from the likeliest toward lower-prob lanes
      float emph = mix(0.3 + 0.7 * prob, 0.3 + 0.7 * (1.0 - prob), uLean);
      float fz = mix(gatherZ, 1.0, prob * (1.0 - uConverge));
      fz = mix(fz, 1.0, uConverge);
      float fx = fr.x * (1.0 - uConverge) * (0.6 + 0.4 * (1.0 - prob));
      vec2 d2 = vec2(pos.x - fx, (z - fz) * 0.8);
      float lobe = exp(-dot(d2, d2) * 2.3) * emph * (0.6 + 0.8 * uBright);
      dens += lobe * 0.9;
      temp = mix(temp, 0.34 + fr.z * 0.5, clamp(lobe * 1.6, 0.0, 0.85));
      minorness = mix(minorness, fr.w, clamp(lobe, 0.0, 0.7));
    }

    // arrival bloom: convergence core at the read head
    vec2 dc = vec2(pos.x, (z - 1.0) * 0.8);
    float core = exp(-dot(dc, dc) * 3.0);
    float bloom = core * uBloomInt;
    dens += bloom * 1.3;
    temp = mix(temp, 0.4 + uBloomHue * 0.5, clamp(bloom * 1.4, 0.0, 0.9));
    minorness = mix(minorness, uBloomMinor, clamp(bloom, 0.0, 0.7));
    // rupture: scatter the bloom into turbulent shards of light
    if(uRupture > 0.001){
      float sc = fbm(pos * 5.0 + uTime * 1.3);
      float shard = core * uRupture * smoothstep(0.35, 0.9, sc);
      dens += shard * 1.7;
      temp += shard * 0.45;
    }

    vec3 col = warmPalette(clamp(temp, 0.0, 1.0), clamp(minorness, 0.0, 1.0));
    float emit = dens * (0.85 + 1.15 * uBright);
    acc += trans * col * emit * stepSize * 2.3;
    trans *= exp(-dens * stepSize * 4.5);
    if(trans < 0.02) break;
  }

  vec3 bg = vec3(0.043, 0.027, 0.020); // near-black warm #0b0705
  vec3 outc = bg * trans + acc;
  outc = outc / (outc + vec3(0.62)) * 1.62; // soft warm tone curve
  outc = pow(outc, vec3(0.9));
  fragColor = vec4(outc, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

/** Create the field on a canvas. Returns null if WebGL2 is unavailable. */
export function createField(canvas: HTMLCanvasElement): Field | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();

  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    bass: gl.getUniformLocation(prog, "uBass"),
    bright: gl.getUniformLocation(prog, "uBright"),
    energy: gl.getUniformLocation(prog, "uEnergy"),
    horizon: gl.getUniformLocation(prog, "uHorizon"),
    lean: gl.getUniformLocation(prog, "uLean"),
    converge: gl.getUniformLocation(prog, "uConverge"),
    warmth: gl.getUniformLocation(prog, "uWarmth"),
    rupture: gl.getUniformLocation(prog, "uRupture"),
    bloomHue: gl.getUniformLocation(prog, "uBloomHue"),
    bloomInt: gl.getUniformLocation(prog, "uBloomInt"),
    bloomMinor: gl.getUniformLocation(prog, "uBloomMinor"),
    degrade: gl.getUniformLocation(prog, "uDegrade"),
    frontCount: gl.getUniformLocation(prog, "uFrontCount"),
    fronts: gl.getUniformLocation(prog, "uFronts"),
  };

  let vw = canvas.width;
  let vh = canvas.height;

  return {
    render(un) {
      gl.viewport(0, 0, vw, vh);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.res, vw, vh);
      gl.uniform1f(u.time, un.time);
      gl.uniform1f(u.bass, un.bass);
      gl.uniform1f(u.bright, un.bright);
      gl.uniform1f(u.energy, un.energy);
      gl.uniform1f(u.horizon, un.horizon);
      gl.uniform1f(u.lean, un.lean);
      gl.uniform1f(u.converge, un.converge);
      gl.uniform1f(u.warmth, un.warmth);
      gl.uniform1f(u.rupture, un.rupture);
      gl.uniform1f(u.bloomHue, un.bloomHue);
      gl.uniform1f(u.bloomInt, un.bloomInt);
      gl.uniform1f(u.bloomMinor, un.bloomMinor);
      gl.uniform1f(u.degrade, un.degrade);
      gl.uniform1i(u.frontCount, un.frontCount);
      gl.uniform4fv(u.fronts, un.fronts);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w, h, dpr) {
      vw = Math.max(1, Math.floor(w * dpr));
      vh = Math.max(1, Math.floor(h * dpr));
      canvas.width = vw;
      canvas.height = vh;
    },
    dispose() {
      try {
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
        const ext = gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      } catch {
        /* noop */
      }
    },
  };
}

export { MAX_FRONTS };
