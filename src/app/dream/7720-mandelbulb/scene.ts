// ─────────────────────────────────────────────────────────────────────────────
// 7720-mandelbulb · scene.ts — raw WebGL2 distance-estimated Mandelbulb.
//
//   The lab's first raymarched 3D escape-time fractal. A fullscreen fragment
//   shader marches the classic power-n Mandelbulb (Daniel White & Paul Nylander,
//   2009) using the analytic distance estimate
//
//       dist = 0.5 * log(r) * r / dr,   dr = n·r^(n-1)·dr + 1
//
//   iterating z → z^n + c in spherical coordinates. Orbit-trap coloring (the
//   running min distance of the orbit to the origin / the axes) paints the
//   jeweled iridescent palette. The whole sample space slowly rotates so the
//   fractal endlessly unfolds. Raymarching + iterations are capped and the scene
//   renders to a downscaled buffer so it survives a mobile GPU.
//
//   Distance-estimation + raymarching technique after Íñigo Quílez's writeups.
//   Everything here is a pure function of uniforms — no wall-clock, no RNG —
//   so the seeded virtual performer in page.tsx drives a byte-identical arc.
// ─────────────────────────────────────────────────────────────────────────────

/** Cheap capability probe — decides shader vs. on-brand fallback notice. */
export function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export interface RenderParams {
  /** Seconds since start — drives the slow unfolding rotation only. */
  time: number;
  /** Overall energy scalar 0..1 (mic loudness or virtual performer). */
  energy: number;
  /** Low-band energy 0..1 — pushes the fractal power (the "bloom"). */
  bass: number;
  /** High-band energy 0..1 — hue shimmer + specular sparkle. */
  treble: number;
  /** Luminance multiplier from createSafeFlicker (1.0 when the pulse is off). */
  bright: number;
  /** prefers-reduced-motion — slows rotation + the push-in. */
  reduced: boolean;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Power-n Mandelbulb DE raymarcher with orbit-trap coloring.
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uPower;   // fractal exponent n (7 -> 9, grown by sound)
uniform float uEnergy;  // 0..1 overall loudness
uniform float uBass;    // 0..1 low band
uniform float uTreble;  // 0..1 high band
uniform float uCamDist; // camera radius (push-in on loud)
uniform float uSat;     // saturation / color gain
uniform float uBright;  // safe-flicker luminance multiplier
uniform float uReduced; // 1.0 => reduced motion

const int   MARCH_STEPS = 64;
const int   BULB_ITERS  = 8;
const float SURF_EPS    = 0.0009;
const float MAX_DIST    = 6.0;

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,s, 0.,1.,0., -s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,-s, 0.,s,c); }

// Mandelbulb distance estimate. Also returns an orbit trap (min |z| over the
// orbit) and how many iterations survived before escape (for glow / AO tint).
float bulbDE(vec3 pos, float power, out float trap, out float iterN){
  vec3 z = pos;
  float dr = 1.0;
  float r  = 0.0;
  trap = 1e9;
  iterN = 0.0;
  for(int i=0; i<BULB_ITERS; i++){
    r = length(z);
    if(r > 2.0) break;
    iterN += 1.0;
    // spherical coords
    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    // running derivative for the analytic DE
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    // scale + rotate the point
    float zr = pow(r, power);
    theta *= power;
    phi   *= power;
    z = zr * vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta)) + pos;
    // orbit trap: closest the orbit swings to the origin
    trap = min(trap, dot(z, z));
  }
  return 0.5 * log(r) * r / dr;
}

// distance-only wrapper for the gradient normal
float mapDist(vec3 p, float power){
  float t, n;
  return bulbDE(p, power, t, n);
}

vec3 calcNormal(vec3 p, float power){
  vec2 e = vec2(1.0, -1.0) * 0.0006;
  return normalize(
    e.xyy * mapDist(p + e.xyy, power) +
    e.yyx * mapDist(p + e.yyx, power) +
    e.yxy * mapDist(p + e.yxy, power) +
    e.xxx * mapDist(p + e.xxx, power)
  );
}

// IQ cosine palette — jeweled iridescence, violet-cyan-magenta.
vec3 pal(float t){
  return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 1.0, 1.0) * t
        + vec3(0.62, 0.44, 0.24)));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // Camera orbits the bulb and pushes in when the sound blooms.
  vec3 ro = vec3(0.0, 0.0, uCamDist);
  vec3 rd = normalize(vec3(uv, -1.7));

  // Slowly rotate the whole sample space => the fractal endlessly unfolds.
  float rs = (uReduced > 0.5) ? 0.04 : 0.11;
  mat3 R = rotY(uTime * rs) * rotX(0.5 * sin(uTime * rs * 0.6) + 0.35);
  ro = R * ro;
  rd = R * rd;

  float power = uPower;
  float t = 0.0;
  float trap = 1e9;
  float iterN = 0.0;
  float glow = 0.0;      // cheap volumetric bloom accumulated along the ray
  bool  hit = false;
  int   stepsUsed = 0;

  for(int i=0; i<MARCH_STEPS; i++){
    vec3 p = ro + rd * t;
    float tr, it;
    float d = bulbDE(p, power, tr, it);
    // near-miss haze: rays that graze the surface pick up a violet glow
    glow += exp(-d * 34.0) * (0.012 + uEnergy * 0.03);
    if(d < SURF_EPS){
      hit = true;
      trap = tr;
      iterN = it;
      break;
    }
    t += d;
    stepsUsed = i;
    if(t > MAX_DIST) break;
  }

  vec3 col;
  // Deep interstellar violet-black so nothing is ever a dead flat black.
  vec3 bg = mix(vec3(0.012, 0.006, 0.030), vec3(0.045, 0.02, 0.09),
                smoothstep(-0.7, 0.9, uv.y)) * (0.6 + uEnergy * 0.5);

  if(hit){
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p, power);

    // Ambient occlusion from how quickly the ray converged (step budget).
    float ao = 1.0 - float(stepsUsed) / float(MARCH_STEPS);
    ao = clamp(ao * 1.15, 0.15, 1.0);

    // Two lights in fractal space for a jeweled read.
    vec3 l1 = normalize(vec3(0.7, 0.9, 0.5));
    vec3 l2 = normalize(vec3(-0.6, 0.3, -0.7));
    float dif = max(dot(n, l1), 0.0) + 0.4 * max(dot(n, l2), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);
    vec3 h = normalize(l1 - rd);
    float spec = pow(max(dot(n, h), 0.0), 40.0);

    // Orbit-trap -> hue. Treble shifts the palette; time drifts it slowly.
    float tt = sqrt(trap) * 1.35 + uTreble * 0.35 + uTime * 0.015
             + iterN * 0.04;
    vec3 base = pal(tt);
    // iteration depth deepens toward the jeweled core
    base = mix(base, base * base * 1.4, clamp(iterN / 8.0, 0.0, 1.0));

    col = base * (0.25 + 0.9 * dif) * ao;
    col += base * fres * (0.6 + uEnergy * 1.1);       // iridescent rim
    col += vec3(1.0, 0.95, 1.0) * spec * (0.5 + uTreble * 1.4); // sparkle
    col += base * glow * 1.4;                          // near-surface bloom
  } else {
    col = bg + pal(uTime * 0.02 + uTreble * 0.3) * glow * 1.2;
  }

  // Saturation / gain lift — "more real than real" on loud passages.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, uSat);
  col *= 0.85 + uEnergy * 0.9;

  // Vignette, safe-flicker luminance, tone-map, gamma.
  float vig = 1.0 - 0.32 * dot(uv, uv);
  col *= vig * uBright;
  col = col / (1.0 + col);
  col = pow(col, vec3(0.4545));

  fragColor = vec4(col, 1.0);
}
`;

/** Raw WebGL2 renderer for the Mandelbulb. One fullscreen triangle, one pass. */
export class MandelbulbScene {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    this.program = this.buildProgram(VERT, FRAG);
    gl.useProgram(this.program);

    const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("WebGL2 buffer alloc failed");
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      "uRes", "uTime", "uPower", "uEnergy", "uBass",
      "uTreble", "uCamDist", "uSat", "uBright", "uReduced",
    ]) {
      this.uni[name] = gl.getUniformLocation(this.program, name);
    }
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader alloc failed");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile error: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("program link error: " + log);
    }
    return prog;
  }

  /** Size the internal buffer. Downscaled + DPR-capped for mobile GPUs:
   *  the long side is clamped to ~720px, then CSS stretches it to fill. */
  resize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    const scale = Math.min(1.4, dpr);
    let w = Math.max(2, Math.floor(cssW * scale));
    let h = Math.max(2, Math.floor(cssH * scale));
    const TARGET_LONG = 720;
    const long = Math.max(w, h);
    if (long > TARGET_LONG) {
      const k = TARGET_LONG / long;
      w = Math.max(2, Math.floor(w * k));
      h = Math.max(2, Math.floor(h * k));
    }
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  render(p: RenderParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Sound grows the geometry: bass drives the exponent 7 -> 9 (the bloom),
    // energy pushes the camera in and lifts saturation, treble adds shimmer.
    const power = 7.0 + Math.min(1, p.bass * 0.7 + p.energy * 0.5) * 2.0;
    const camDist = 2.75 - Math.min(1, p.energy) * (p.reduced ? 0.5 : 0.95);
    const sat = 0.9 + Math.min(1, p.energy) * 1.0 + p.treble * 0.3;

    gl.uniform2f(this.uni.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uni.uTime, p.time);
    gl.uniform1f(this.uni.uPower, power);
    gl.uniform1f(this.uni.uEnergy, Math.min(1, Math.max(0, p.energy)));
    gl.uniform1f(this.uni.uBass, Math.min(1, Math.max(0, p.bass)));
    gl.uniform1f(this.uni.uTreble, Math.min(1, Math.max(0, p.treble)));
    gl.uniform1f(this.uni.uCamDist, camDist);
    gl.uniform1f(this.uni.uSat, sat);
    gl.uniform1f(this.uni.uBright, p.bright);
    gl.uniform1f(this.uni.uReduced, p.reduced ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    try {
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* ignore */
    }
  }
}
