// ─────────────────────────────────────────────────────────────────────────────
// 11600-cloudveil · gl.ts — WebGL2 fragment-shader VOLUMETRIC raymarcher.
//
//   This is the piece's reason to exist. 65 files in the lab raymarch SDFs
//   (distance fields → hard surfaces); ZERO transport light through a
//   participating medium. This one does REAL volumetric light transport:
//
//     • a full-screen triangle; the fragment shader marches a ray through a 3D
//       density field (domain-warped fbm noise) — the "cloud";
//     • BEER-LAMBERT absorption along the view ray:
//           transmittance *= exp(-density * absorption * stepSize);
//     • at every dense sample a short secondary march toward the SUN gives that
//       sample's light transmittance (self-shadowing / soft occlusion);
//     • an anisotropic HENYEY-GREENSTEIN phase function biases scattering
//       FORWARD toward the sun, so the cloud rim blooms as you drift into it.
//
//   Ported from the physics of atmospheric single-scattering (Maxime Heckel,
//   "Real-time dreamy Cloudscapes with Volumetric Raymarching"), NOT from SDF
//   raymarching. Palette lives ONLY here: warm dawn-gold / candle-amber medium
//   lit by a bone-white sun. No cyan, no violet.
//
//   Audio drives it: energy → density + scatter gain, low → sun intensity +
//   thickness, high → the forward-scatter anisotropy g (glassier bloom).
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudParams {
  time: number;
  energy: number; // 0..1
  low: number; // 0..1
  high: number; // 0..1
  /** Henyey-Greenstein anisotropy, ~0.1..0.85 (forward scatter). */
  g: number;
  /** Slow, photosensitive-safe luminance drift, ~0.75..1. */
  luma: number;
  /** 1.0 when the visitor prefers reduced motion (damps drift/flythrough). */
  reduced: number;
}

export interface CloudRenderer {
  resize(w: number, h: number): void;
  render(p: CloudParams): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform float uEnergy;
uniform float uLow;
uniform float uHigh;
uniform float uG;
uniform float uLuma;
uniform float uReduced;

// ---- 3D value noise + fbm ---------------------------------------------------
float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  mat3 m = mat3(0.00, 0.80, 0.60,
               -0.80, 0.36, -0.48,
               -0.60, -0.48, 0.64) * 1.9;
  for(int i = 0; i < 4; i++){
    v += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

// The sun — a bone-white source the cloud drifts toward.
// (pre-normalized dir of (0.06, 0.14, 1.0); a normalize() call is not a valid
// GLSL ES const initializer, so the constant is baked here.)
const vec3 SUN = vec3(0.05932, 0.13840, 0.98859);

// Henyey-Greenstein phase: forward-biased single-scattering.
float hg(float c, float g){
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * c;
  return (1.0 - g2) / (12.566370614 * pow(max(denom, 1e-4), 1.5));
}

// Density of the participating medium at world point p. Kept to a SINGLE fbm
// call — a cheap trig swirl gives the curdled, tunnel-of-light structure so the
// per-sample cost stays real-time even inside the secondary light march.
float cloudDensity(vec3 p){
  vec3 q = p;
  q.z += uTime * (uReduced > 0.5 ? 0.12 : 0.34); // drift toward the sun
  // cheap domain swirl (no extra noise fetches)
  float warp = uReduced > 0.5 ? 0.18 : 0.32;
  q.x += warp * sin(q.z * 0.7 + uTime * 0.25);
  q.y += warp * cos(q.z * 0.6 - uTime * 0.20);
  float base = fbm(q * 0.62);
  // A soft, endless coverage: threshold lowers with energy so louder passages
  // thicken the veil. max() keeps it a genuine density field (>= 0).
  float cover = 0.46 - 0.16 * uEnergy;
  float d = max(base - cover, 0.0);
  return d * (1.25 + 0.75 * uLow);
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;

  vec3 ro = vec3(0.0, 0.0, -4.0);          // eye
  vec3 rd = normalize(vec3(uv, 1.55));      // gaze toward the sun (+z)

  const float absorption = 1.5;
  const float stepSize   = 0.18;
  const int   STEPS      = 48;
  const int   LSTEPS     = 4;
  const float lStep      = 0.34;

  // deterministic per-pixel jitter kills slab banding without any RNG state
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  float cosSun = dot(rd, SUN);
  float phase  = hg(cosSun, uG);

  vec3  sunCol  = vec3(1.0, 0.86, 0.58);    // warm dawn-gold sunlight
  vec3  ambient = vec3(0.30, 0.19, 0.11);   // candle-amber ambient fill

  vec3  col = vec3(0.0);
  float transmittance = 1.0;
  vec3  p = ro + rd * stepSize * jitter;

  for(int i = 0; i < STEPS; i++){
    if(transmittance < 0.02) break;
    float dens = cloudDensity(p);
    if(dens > 0.001){
      // secondary march toward the sun → this sample's light transmittance
      float lt = 1.0;
      vec3  lp = p;
      for(int j = 0; j < LSTEPS; j++){
        lp += SUN * lStep;
        float ld = cloudDensity(lp);
        lt *= exp(-ld * absorption * lStep);   // Beer-Lambert toward the sun
      }
      float scatter = dens * absorption * stepSize;
      // high-band content adds a glassier forward glint on top of the phase bloom
      vec3  lit = sunCol * lt * phase * (0.9 + 1.5 * uEnergy) * (1.0 + 0.5 * uHigh);
      col += transmittance * scatter * (lit + ambient * 0.5);
      transmittance *= exp(-dens * absorption * stepSize); // Beer-Lambert on view ray
    }
    p += rd * stepSize;
  }

  // the distant sun seen through whatever cloud remains
  float sd   = max(dot(rd, SUN), 0.0);
  float disc = pow(sd, 220.0);
  float halo = pow(sd, 5.0);
  vec3  sun  = vec3(1.0, 0.98, 0.92) * disc * 2.2
             + vec3(1.0, 0.82, 0.52) * halo * (0.5 + 0.6 * uLow);
  col += transmittance * sun;

  // warm dawn backdrop behind the whole volume
  vec3 bg = mix(vec3(0.05, 0.025, 0.015), vec3(0.32, 0.20, 0.11), halo);
  col += transmittance * bg * 0.5;

  col *= uLuma;

  // filmic-ish tonemap + gamma so the glow blooms softly, never clips harsh
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.4545));
  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("cloudveil shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeCloudRenderer(canvas: HTMLCanvasElement): CloudRenderer | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("cloudveil program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const uResolution = loc("uResolution");
  const uTime = loc("uTime");
  const uEnergy = loc("uEnergy");
  const uLow = loc("uLow");
  const uHigh = loc("uHigh");
  const uG = loc("uG");
  const uLuma = loc("uLuma");
  const uReduced = loc("uReduced");

  return {
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(p: CloudParams) {
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, p.time);
      gl.uniform1f(uEnergy, p.energy);
      gl.uniform1f(uLow, p.low);
      gl.uniform1f(uHigh, p.high);
      gl.uniform1f(uG, p.g);
      gl.uniform1f(uLuma, p.luma);
      gl.uniform1f(uReduced, p.reduced);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      try {
        gl.deleteBuffer(buf);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(prog);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
