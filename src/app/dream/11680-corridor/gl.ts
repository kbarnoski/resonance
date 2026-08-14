// ─────────────────────────────────────────────────────────────────────────────
// 11680-corridor · gl.ts — WebGL2 fragment-shader VOLUMETRIC corridor raymarcher.
//
//   The near-death tunnel-of-light, taken LITERALLY. Where 11600-cloudveil
//   drifted through an OPEN cloud toward a distant sun, this pours the same
//   participating-medium physics into navigable geometry: a glowing TUBE you fly
//   down the throat of, the sun burning at the vanishing point.
//
//     • CORRIDOR DENSITY FIELD. A gently curving flight-path axis is a slow
//       sin/cos curve of the along-tunnel coordinate z. At each sample, r =
//       distance from the point to that axis; density is a RADIAL SHELL profile
//       (a gaussian ring peaking at target radius R, ~0 on the axis and outside
//       the wall) TIMES a twisted, domain-warped fbm so the walls curdle. The
//       throat stays clear — you see straight down the tube to the light.
//     • BEER-LAMBERT transmittance along the view ray + a short secondary march
//       DOWN-TUNNEL toward the light for self-shadow.
//     • MULTI-OCTAVE HENYEY-GREENSTEIN MULTIPLE SCATTERING (Hillaire's
//       approximation): 3 octaves scaling extinction by a^i, contribution by
//       b^i, phase eccentricity by c^i (a≈b≈c≈0.5). Higher octaves see less
//       shadow, so the corridor walls glow from deep inside, forward-biased
//       toward the light.
//     • FLYTHROUGH. The camera rides the axis at world-z = uCamZ, which JS
//       advances every frame; a beat-locked surge accelerates it on the music.
//
//   Palette lives ONLY here: candle-amber / dawn-gold walls toward a bone-white
//   sun. No cyan, no violet, no green.
// ─────────────────────────────────────────────────────────────────────────────

export interface CorridorParams {
  time: number;
  /** World-z of the camera along the tunnel axis — JS advances this each frame
   *  (baseline drift + beat surge). This is the flythrough. */
  camZ: number;
  energy: number; // 0..1  loudness → wall thickness + scatter gain
  low: number; // 0..1  → end-light swell + wall density
  high: number; // 0..1  → forward-scatter sharpness
  centroid: number; // 0..1  brightness → end-light tint amber↔gold
  /** Henyey-Greenstein anisotropy, ~0.3..0.85 (forward scatter). */
  g: number;
  /** Slow, photosensitive-safe luminance drift, ~0.8..1. */
  luma: number;
  /** 1.0 when the visitor prefers reduced motion (damps swirl/surge). */
  reduced: number;
}

export interface CorridorRenderer {
  resize(w: number, h: number): void;
  render(p: CorridorParams): void;
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
uniform float uCamZ;
uniform float uEnergy;
uniform float uLow;
uniform float uHigh;
uniform float uCentroid;
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
  for(int i = 0; i < 3; i++){
    v += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

// The gently curving flight-path axis: where the tunnel's centre sits at
// along-tunnel coordinate z. Slow sin/cos so the corridor snakes, never jolts.
vec2 axisXY(float z){
  return vec2(0.95 * sin(z * 0.11 + 1.3),
              0.72 * cos(z * 0.09 + 0.7));
}

// Henyey-Greenstein phase: forward-biased scattering toward the tunnel's end.
float hg(float c, float g){
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * c;
  return (1.0 - g2) / (12.566370614 * pow(max(denom, 1e-4), 1.5));
}

// Density of the participating medium at world point p. A RADIAL SHELL around
// the curving axis (clear throat, glowing wall, empty beyond) curdled by a
// twisted, domain-warped fbm. One fbm fetch keeps the secondary light march
// real-time.
float corridorDensity(vec3 p){
  vec2 ax  = axisXY(p.z);
  vec2 rel = p.xy - ax;
  float r  = length(rel);

  // target wall radius breathes slowly with the low band (the tube inhales)
  float R = 2.15 + 0.16 * sin(uTime * 0.2) + 0.30 * uLow;
  float w = 1.15;
  float shell = exp(-(r - R) * (r - R) / (w * w)); // gaussian ring: 0 on axis

  // twist the wall coordinates along the tube so the walls swirl as they recede
  float tw = p.z * 0.16 + uTime * (uReduced > 0.5 ? 0.04 : 0.09);
  float ct = cos(tw), st = sin(tw);
  vec2 rr = vec2(ct * rel.x - st * rel.y, st * rel.x + ct * rel.y);

  // cheap domain swirl (no extra noise fetches) → curdled, roiling walls
  vec3 q = vec3(rr, p.z * 0.5);
  float warp = uReduced > 0.5 ? 0.28 : 0.5;
  q.x += warp * sin(q.z * 0.8 + uTime * 0.2);
  q.y += warp * cos(q.z * 0.7 - uTime * 0.15);

  float n = fbm(q * 0.7);
  // smoothstep carves gaps + billows into the shell so it reads as cloud, not glass
  float wall = shell * smoothstep(0.18, 0.92, n + 0.28);
  wall *= (1.0 + 0.7 * uEnergy + 0.5 * uLow);
  return max(wall, 0.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;

  // ---- camera rides the axis, looking down the throat of the tunnel ----------
  float cz = uCamZ;
  vec3 ro = vec3(axisXY(cz), cz);
  // forward = tangent of the flight path; the light sits at the vanishing point
  vec3 fwd = normalize(vec3(axisXY(cz + 0.6) - axisXY(cz), 0.6));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  const float FOV = 1.12;
  vec3 rd = normalize(fwd + uv.x * right * FOV + uv.y * up * FOV);

  const float absorption = 1.4;
  const float stepSize   = 0.16;
  const int   STEPS      = 54;
  const int   LSTEPS     = 4;
  const float lStep      = 0.34;

  // deterministic per-pixel jitter kills slab banding without any RNG state
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  float cosSun = dot(rd, fwd);          // 1 straight down the tunnel

  // walls: candle-amber → dawn-gold as the spectrum brightens
  vec3 wallCol = mix(vec3(1.0, 0.72, 0.40), vec3(1.0, 0.88, 0.62), uCentroid);
  vec3 ambient = vec3(0.16, 0.09, 0.05); // candle ambient fill
  float scatterGain = (1.3 + 2.2 * uEnergy) * (1.0 + 0.4 * uHigh);

  vec3  col = vec3(0.0);
  float transmittance = 1.0;
  vec3  p = ro + rd * stepSize * jitter;

  for(int i = 0; i < STEPS; i++){
    if(transmittance < 0.02) break;
    float dens = corridorDensity(p);
    if(dens > 0.001){
      // secondary march DOWN-TUNNEL toward the light → this sample's shadow
      float lt = 1.0;
      vec3  lp = p;
      for(int j = 0; j < LSTEPS; j++){
        lp += fwd * lStep;
        float ld = corridorDensity(lp);
        lt *= exp(-ld * absorption * lStep); // Beer-Lambert toward the light
      }

      // MULTI-OCTAVE HENYEY-GREENSTEIN MULTIPLE SCATTERING (Hillaire): higher
      // octaves reduce extinction (pow(lt, a^i)→1) + eccentricity (g·c^i), so
      // light seeps deep into the walls and glows them from inside.
      float scat = 0.0;
      float ai = 1.0, bi = 1.0, ci = 1.0;
      for(int o = 0; o < 3; o++){
        float ph  = hg(cosSun, uG * ci);
        float lto = pow(lt, ai);
        scat += bi * ph * lto;
        ai *= 0.5; bi *= 0.5; ci *= 0.5;
      }

      float dl = dens * absorption * stepSize;
      vec3  lit  = wallCol * scat * scatterGain;
      col += transmittance * dl * (lit + ambient);
      transmittance *= exp(-dl); // Beer-Lambert on the view ray
    }
    p += rd * stepSize;
  }

  // ---- the light burning at the end of the tunnel ----------------------------
  vec3 endTint = mix(vec3(1.0, 0.66, 0.34), vec3(1.0, 0.90, 0.64), uCentroid); // amber↔gold
  float sd   = max(cosSun, 0.0);
  float disc = pow(sd, 48.0);   // hot bone-white core at the vanishing point
  float halo = pow(sd, 3.0);    // broad glow flooding up the throat
  vec3  sun  = mix(vec3(1.0, 0.97, 0.90), endTint, 0.35) * disc * (2.0 + 1.6 * uLow)
             + endTint * halo * (0.5 + 0.8 * uLow);
  col += transmittance * sun;

  // warm depth behind the walls so the tube never opens onto black
  vec3 bg = mix(vec3(0.03, 0.018, 0.012), endTint * 0.22, halo);
  col += transmittance * bg * 0.6;

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
    console.error("corridor shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeCorridorRenderer(canvas: HTMLCanvasElement): CorridorRenderer | null {
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
    console.error("corridor program link error:", gl.getProgramInfoLog(prog));
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
  const uCamZ = loc("uCamZ");
  const uEnergy = loc("uEnergy");
  const uLow = loc("uLow");
  const uHigh = loc("uHigh");
  const uCentroid = loc("uCentroid");
  const uG = loc("uG");
  const uLuma = loc("uLuma");
  const uReduced = loc("uReduced");

  return {
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(p: CorridorParams) {
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, p.time);
      gl.uniform1f(uCamZ, p.camZ);
      gl.uniform1f(uEnergy, p.energy);
      gl.uniform1f(uLow, p.low);
      gl.uniform1f(uHigh, p.high);
      gl.uniform1f(uCentroid, p.centroid);
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
