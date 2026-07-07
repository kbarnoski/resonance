// ─────────────────────────────────────────────────────────────────────────────
// 1254-dissolve · field.ts — the full-screen WebGL2 dissociative void field.
//
//   Sparse luminous geometry drifting through a vast exponential-fog void: a
//   low-poly wireframe plane recedes into cold ash-fog (the "surroundings" that
//   bodies melt into), and each played note blooms a thin luminous RING at its
//   scale-degree position. NOT a flat Canvas2D field, NOT a 3D object you orbit,
//   NOT a dense fractal — a thin, cold, near-empty depth.
//
//   The desync engine (driven from page.tsx) feeds this shader:
//     • uTime     — the VISUAL clock, dilated slower than real time as desync rises
//                   (time dilation: the drift stalls, everything stretches).
//     • per-note uAge — the note's own dilated age; onset LAG + dilation happen on
//                   the CPU, so the ring appears late and moves in slow motion.
//     • uDesync   — thickens/blurs the rings and SHEARS the plane (body-schema
//                   melt / vertex domain-warp).
//     • uEnergy   — the coupled drive: the audio envelope when bound, a DETUNED LFO
//                   when unbound (the slow visual rhythm drifts out of phase).
//     • uSlowAmp (= 1-desync) — thins the slow luminous rhythm as desync deepens.
//     • uShimmer (= desync)   — raises a FINE, LOW-CONTRAST high-frequency grain.
//   That last pair is the literal EEG mapping of ketamine dissociation (PubMed
//   41453872): slow binding rhythms desynchronise DOWN while high-gamma shimmer
//   climbs UP.
//
//   Palette: near-monochrome bone / steel / ash with a faint cold tint. As desync
//   deepens the void floor lifts so geometry loses contrast and melts into the
//   surroundings.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_NOTES = 12;

export const VERT_SRC = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;     // dilated visual clock
uniform float uReal;     // wall clock (for grain seed only)
uniform float uDesync;   // 0..1
uniform float uEnergy;   // coupled visual drive (audio env when bound / detuned LFO when not)
uniform float uSlowAmp;  // 1-desync: amplitude of the slow luminous rhythm
uniform float uShimmer;  // desync: fine high-frequency grain amount
uniform float uFlicker;  // safe luminance multiplier [floor,1]; 1.0 when steady
uniform float uReduced;  // 1.0 if prefers-reduced-motion

uniform int   uCount;
uniform vec2  uPos[${MAX_NOTES}];
uniform float uAge[${MAX_NOTES}];  // dilated note age (s)
uniform float uFreqN[${MAX_NOTES}]; // 0..1 pitch tint
uniform float uVel[${MAX_NOTES}];
uniform float uOn[${MAX_NOTES}];   // 1 once the (lagged) note has appeared

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  // centered, aspect-correct coords: y in [-0.5,0.5]
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // ── The void: a cold ash floor that LIFTS with desync so geometry melts in ──
  float floorLum = mix(0.018, 0.060, uDesync);
  vec3 col = vec3(0.82, 0.90, 1.00) * floorLum; // faint cold-steel ambient
  col *= 1.0 - 0.35 * length(uv);               // gentle vignette into the void

  // ── Low-poly wireframe plane receding into exponential fog ──────────────────
  // Camera hovers above a plane and looks slightly down + forward.
  vec3 ro = vec3(0.0, 0.55, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y * 0.72 - 0.34, 1.0));
  if (rd.y < -0.002) {
    float t = ro.y / -rd.y;
    vec3 hit = ro + rd * t;      // world (x, 0, z) on the plane
    vec2 g = vec2(hit.x, hit.z);
    // slow forward drift — dilated, so it STALLS as dissociation deepens
    g.y += uTime * 0.10;
    // vertex/domain-warp SHEAR: the plane melts as desync rises (body-schema)
    float w = uDesync * (uReduced > 0.5 ? 0.5 : 1.0);
    g.x += sin(g.y * 0.55 + uReal * 0.18) * 0.55 * w;
    g.y += sin(g.x * 0.47 - uReal * 0.13) * 0.55 * w;
    // thin grid lines: distance to the nearest integer lattice line
    vec2 gr = abs(fract(g) - 0.5);
    float d = min(gr.x, gr.y);
    float line = smoothstep(0.03, 0.0, d);
    float fog = exp(-t * 0.14);  // exponential depth-fog into the void
    // the slow luminous rhythm: breathes with uEnergy, thinned by uSlowAmp
    float breath = 0.55 + uSlowAmp * 0.55 * uEnergy;
    vec3 steel = vec3(0.42, 0.50, 0.60);
    col += line * fog * steel * 0.9 * breath;
  }

  // ── Sparse luminous rings: one per played note, at its scale-degree anchor ──
  for (int i = 0; i < ${MAX_NOTES}; i++) {
    if (i >= uCount) break;
    if (uOn[i] < 0.5) continue;
    float age = uAge[i];
    vec2 dp = uv - uPos[i];
    float dist = length(dp);
    float r0 = 0.03 + age * 0.10;                       // ring slowly expands
    float thick = 0.008 + uDesync * 0.045 + age * 0.012; // thickens/blurs when unbound
    float x = (dist - r0) / thick;
    float ring = exp(-x * x);
    float env = exp(-age * 1.25);                       // a crisp flash when bound
    float intens = ring * env * (0.45 + 0.55 * uVel[i]);
    // near-monochrome bone→cold-steel tint by pitch
    vec3 bone = vec3(0.90, 0.93, 0.98);
    vec3 cold = vec3(0.58, 0.72, 0.86);
    vec3 tint = mix(cold, bone, uFreqN[i]);
    // as it ages + dissociates, the ring desaturates toward ash and melts in
    tint = mix(tint, vec3(0.55, 0.58, 0.62), uDesync * 0.6);
    col += intens * tint * 1.15;
  }

  // ── Fine, LOW-CONTRAST high-frequency grain (the gamma-up shimmer) ──────────
  // Spatial per-pixel noise (mean ~0) re-seeded ~8x/s — film grain, NOT a
  // full-screen luminance strobe. Amplitude stays tiny and rises only with desync.
  float seed = floor(uReal * 8.0);
  float grain = hash21(gl_FragCoord.xy + seed * vec2(31.7, 19.3)) - 0.5;
  col += grain * uShimmer * 0.05;

  // safe global luminance multiplier (1.0 = steady; smooth, never a strobe)
  col *= uFlicker;

  // gentle tonemap — cold highlights bloom softly, no hard clip
  col = col / (1.0 + col * 0.9);
  col = pow(max(col, 0.0), vec3(0.85));

  fragColor = vec4(col, 1.0);
}
`;

export interface FieldRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer | null;
  u: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    real: WebGLUniformLocation | null;
    desync: WebGLUniformLocation | null;
    energy: WebGLUniformLocation | null;
    slowAmp: WebGLUniformLocation | null;
    shimmer: WebGLUniformLocation | null;
    flicker: WebGLUniformLocation | null;
    reduced: WebGLUniformLocation | null;
    count: WebGLUniformLocation | null;
    pos: WebGLUniformLocation | null;
    age: WebGLUniformLocation | null;
    freqN: WebGLUniformLocation | null;
    vel: WebGLUniformLocation | null;
    on: WebGLUniformLocation | null;
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("dissolve shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the full-screen-triangle field rig. Returns null if WebGL2 or the shader
 *  is unavailable so the caller can fall back gracefully. */
export function makeFieldRig(canvas: HTMLCanvasElement): FieldRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
    alpha: false,
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("dissolve program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  const uni = (n: string) => gl.getUniformLocation(program, n);
  return {
    gl,
    program,
    buffer,
    u: {
      res: uni("uRes"),
      time: uni("uTime"),
      real: uni("uReal"),
      desync: uni("uDesync"),
      energy: uni("uEnergy"),
      slowAmp: uni("uSlowAmp"),
      shimmer: uni("uShimmer"),
      flicker: uni("uFlicker"),
      reduced: uni("uReduced"),
      count: uni("uCount"),
      pos: uni("uPos"),
      age: uni("uAge"),
      freqN: uni("uFreqN"),
      vel: uni("uVel"),
      on: uni("uOn"),
    },
  };
}

export interface FieldState {
  time: number;
  real: number;
  desync: number;
  energy: number;
  slowAmp: number;
  shimmer: number;
  flicker: number;
  reduced: number;
  count: number;
  pos: Float32Array; // length MAX_NOTES*2
  age: Float32Array; // length MAX_NOTES
  freqN: Float32Array;
  vel: Float32Array;
  on: Float32Array;
}

/** Push one frame of uniforms and draw the full-screen triangle. */
export function drawField(rig: FieldRig, s: FieldState): void {
  const { gl, u } = rig;
  gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(u.time, s.time);
  gl.uniform1f(u.real, s.real);
  gl.uniform1f(u.desync, s.desync);
  gl.uniform1f(u.energy, s.energy);
  gl.uniform1f(u.slowAmp, s.slowAmp);
  gl.uniform1f(u.shimmer, s.shimmer);
  gl.uniform1f(u.flicker, s.flicker);
  gl.uniform1f(u.reduced, s.reduced);
  gl.uniform1i(u.count, s.count);
  gl.uniform2fv(u.pos, s.pos);
  gl.uniform1fv(u.age, s.age);
  gl.uniform1fv(u.freqN, s.freqN);
  gl.uniform1fv(u.vel, s.vel);
  gl.uniform1fv(u.on, s.on);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function disposeFieldRig(rig: FieldRig): void {
  const { gl } = rig;
  try {
    gl.deleteProgram(rig.program);
    if (rig.buffer) gl.deleteBuffer(rig.buffer);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    /* context already gone */
  }
}
