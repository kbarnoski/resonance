// glsl.ts — GLSL sources for the reefmind reaction-diffusion membrane.
// Raw WebGL2 (GLSL ES 3.00). Three programs share one full-screen-quad vertex
// shader: (1) the Gray-Scott update, (2) a box-reduction used to read a tiny
// summary of the field back to the CPU, and (3) the display/palette pass.
//
// All teal/aqua/cyan art colour lives here inside the shader strings — never as
// chrome classes — per the brief's palette rule.

/** Full-screen quad. layout(location=0) a_pos ∈ [-1,1]², v_uv ∈ [0,1]². */
export const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Gray-Scott reaction-diffusion update (ping-pong). U,V live in the R,G channels
 * of a float texture. The feed (f) and kill (k) rates vary per 4×4 zone AND
 * drift slowly with time, so each of the 16 species-regions settles into its own
 * regime (spots ↔ stripes ↔ mazes) and never stops evolving — the field arranges
 * itself. 9-point Laplacian (cardinal 0.2, diagonal 0.05).
 */
export function buildRdFs(sim: number): string {
  const px = (1 / sim).toFixed(8);
  return `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_time;
in vec2 v_uv;
out vec4 o;

const float DU = 0.2097;
const float DV = 0.1050;

void main() {
  vec2 px = vec2(${px}, ${px});
  vec4 c  = texture(u_tex, v_uv);
  float u = c.r, v = c.g;

  float lu = -u, lv = -v;
  lu += 0.2 * (texture(u_tex, v_uv + vec2(-px.x, 0.0)).r
             + texture(u_tex, v_uv + vec2( px.x, 0.0)).r
             + texture(u_tex, v_uv + vec2( 0.0,-px.y)).r
             + texture(u_tex, v_uv + vec2( 0.0, px.y)).r);
  lv += 0.2 * (texture(u_tex, v_uv + vec2(-px.x, 0.0)).g
             + texture(u_tex, v_uv + vec2( px.x, 0.0)).g
             + texture(u_tex, v_uv + vec2( 0.0,-px.y)).g
             + texture(u_tex, v_uv + vec2( 0.0, px.y)).g);
  lu += 0.05 * (texture(u_tex, v_uv + vec2(-px.x,-px.y)).r
              + texture(u_tex, v_uv + vec2( px.x,-px.y)).r
              + texture(u_tex, v_uv + vec2(-px.x, px.y)).r
              + texture(u_tex, v_uv + vec2( px.x, px.y)).r);
  lv += 0.05 * (texture(u_tex, v_uv + vec2(-px.x,-px.y)).g
              + texture(u_tex, v_uv + vec2( px.x,-px.y)).g
              + texture(u_tex, v_uv + vec2(-px.x, px.y)).g
              + texture(u_tex, v_uv + vec2( px.x, px.y)).g);

  // Per-zone feed/kill + slow autonomous drift so patterns keep morphing.
  float col = floor(v_uv.x * 4.0);
  float row = floor(v_uv.y * 4.0);
  float zi  = row * 4.0 + col;
  float f = 0.0270 + 0.0210 * (col / 3.0) + 0.0060 * sin(u_time * 0.050 + zi * 1.30);
  float k = 0.0565 + 0.0090 * (row / 3.0) + 0.0028 * cos(u_time * 0.037 + zi * 0.70);

  float uvv = u * v * v;
  float nu = clamp(u + DU * lu - uvv + f * (1.0 - u), 0.0, 1.0);
  float nv = clamp(v + DV * lv + uvv - (f + k) * v, 0.0, 1.0);
  o = vec4(nu, nv, 0.0, 1.0);
}`;
}

/**
 * Box-reduction: averages each SIM/READ block of the V channel down to one
 * output texel. The result (READ×READ) is read back with gl.readPixels to derive
 * each species' bloom amount + horizontal centroid on the CPU.
 */
export function buildReduceFs(sim: number, read: number): string {
  const px = (1 / sim).toFixed(8);
  const block = Math.round(sim / read); // taps per axis
  return `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 px = vec2(${px}, ${px});
  float s = 0.0;
  for (int j = 0; j < ${block}; j++) {
    for (int i = 0; i < ${block}; i++) {
      vec2 off = (vec2(float(i), float(j)) - ${((block - 1) / 2).toFixed(1)}) * px;
      s += texture(u_tex, v_uv + off).g;
    }
  }
  o = vec4(s / ${(block * block).toFixed(1)}, 0.0, 0.0, 1.0);
}`;
}

/** Display: V concentration → bioluminescent teal→aqua→cyan→white on near-black. */
export const DISP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  float v = texture(u_tex, v_uv).g;

  vec3 nearBlack = vec3(0.010, 0.022, 0.030);
  vec3 teal      = vec3(0.000, 0.320, 0.420);
  vec3 aqua      = vec3(0.000, 0.680, 0.720);
  vec3 cyan      = vec3(0.280, 0.950, 0.980);
  vec3 white     = vec3(0.850, 1.000, 1.000);

  vec3 col = nearBlack;
  col = mix(col, teal,  smoothstep(0.05, 0.25, v));
  col = mix(col, aqua,  smoothstep(0.20, 0.45, v));
  col = mix(col, cyan,  smoothstep(0.40, 0.62, v));
  col = mix(col, white, smoothstep(0.55, 0.74, v));
  col += cyan * 0.16 * smoothstep(0.30, 0.70, v); // bloom glow

  // Faint zone lattice so the 16 species-regions stay legible.
  vec2 g = fract(v_uv * 4.0);
  float line = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  col += vec3(0.0, 0.05, 0.07) * smoothstep(0.02, 0.0, line);

  vec2 q = v_uv * 2.0 - 1.0;
  col *= 1.0 - 0.24 * dot(q, q); // vignette
  o = vec4(col, 1.0);
}`;
