// ─────────────────────────────────────────────────────────────────────────────
// 7032-chladni · sim.ts — GLSL for the GPU sand simulation.
//
//   The sand is stepped entirely on the GPU via WebGL2 transform feedback: the
//   UPDATE vertex shader reads each grain's position, evaluates the plate field
//   Z(x,y) = Σ w·sin(mπx)·sin(nπy) and its analytic gradient, then advects the
//   grain DOWN the gradient of |Z| toward the nearest nodal line — with jitter
//   that scales with local vibration energy (grains dance at antinodes, settle
//   on the still nodal lines). Output is fed back into a ping-pong buffer.
//
//   The RENDER pass draws the grains as additive point sprites, brightening
//   the ones that have settled so the nodal figure reads as glowing sand.
// ─────────────────────────────────────────────────────────────────────────────

/** Transform-feedback UPDATE shader: advect grains toward nodal lines. */
export const UPDATE_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_seed;

uniform int   u_count;
uniform vec3  u_modes[8];   // (m, n, weight)
uniform float u_norm;       // normalizes |Z| into ~[0,1]
uniform float u_step;       // gradient-descent step
uniform float u_jitter;     // base jitter magnitude
uniform float u_shake;      // 0..1 how hard the plate is driven (audio amp)
uniform float u_frame;      // frame counter for temporal decorrelation

out vec2  v_pos;
out float v_seed;

float hash(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}

void main(){
  const float PI = 3.14159265;
  vec2 p = a_pos;
  float Z = 0.0;
  vec2 g = vec2(0.0);
  for(int k=0;k<8;k++){
    if(k>=u_count) break;
    float m = u_modes[k].x, n = u_modes[k].y, w = u_modes[k].z;
    float sx = sin(m*PI*p.x), sy = sin(n*PI*p.y);
    float cx = cos(m*PI*p.x), cy = cos(n*PI*p.y);
    Z   += w*sx*sy;
    g.x += w*m*PI*cx*sy;
    g.y += w*n*PI*sx*cy;
  }
  Z *= u_norm; g *= u_norm;
  float energy = clamp(abs(Z), 0.0, 1.0);

  // Descend |Z|: step opposite to sign(Z)*gradient toward the nodal line.
  vec2 grad = sign(Z)*g;
  float glen = length(grad);
  vec2 dir = glen > 1e-4 ? grad/glen : vec2(0.0);
  p -= dir * u_step * energy;

  // Jitter dances hardest where the plate shakes hardest (antinodes), and
  // nearly vanishes on the still nodal lines — so grains settle there.
  float r1 = hash(a_pos*91.7 + vec2(a_seed*13.1, u_frame*0.017));
  float r2 = hash(a_pos*57.3 + vec2(a_seed*29.7, -u_frame*0.023));
  float j = u_jitter * u_shake * (0.06 + 0.94*energy);
  p += (vec2(r1,r2)-0.5)*2.0*j;

  // Reflect at the plate edges — sand stays on the plate.
  if(p.x<0.0) p.x = -p.x;
  if(p.x>1.0) p.x = 2.0-p.x;
  if(p.y<0.0) p.y = -p.y;
  if(p.y>1.0) p.y = 2.0-p.y;
  p = clamp(p, 0.0, 1.0);

  v_pos = p;
  v_seed = a_seed;
}`;

/** Minimal fragment for the update program (rasterizer is discarded). */
export const UPDATE_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 frag;
void main(){ frag = vec4(0.0); }`;

/** RENDER vertex shader: place grain, compute settle energy for its color. */
export const RENDER_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_seed;

uniform vec2  u_fit;    // (s/W, s/H) keeps the plate square
uniform int   u_count;
uniform vec3  u_modes[8];
uniform float u_norm;
uniform float u_point;

out float v_energy;

void main(){
  const float PI = 3.14159265;
  float Z = 0.0;
  for(int k=0;k<8;k++){
    if(k>=u_count) break;
    Z += u_modes[k].z * sin(u_modes[k].x*PI*a_pos.x) * sin(u_modes[k].y*PI*a_pos.y);
  }
  v_energy = clamp(abs(Z*u_norm), 0.0, 1.0);
  vec2 ndc = (a_pos*2.0-1.0)*u_fit;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = u_point;
}`;

/** RENDER fragment: soft round grain; settled grains glow warm and bright. */
export const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in float v_energy;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if(r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  float settle = 1.0 - v_energy;
  vec3 dim  = vec3(0.388, 0.400, 0.945); // indigo — grains still migrating
  vec3 hot  = vec3(0.690, 0.263, 0.878); // magenta
  vec3 lite = vec3(0.769, 0.710, 0.992); // light violet — settled on a node
  vec3 col = mix(dim, mix(hot, lite, settle), settle);
  float glow = a * (0.22 + 0.78*settle);
  frag = vec4(col*glow, glow);
}`;

/** BACKGROUND vertex shader: the plate square. */
export const BG_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_quad; // -1..1
uniform vec2 u_fit;
out vec2 v_uv;
void main(){
  v_uv = a_quad*0.5 + 0.5;
  gl_Position = vec4(a_quad*u_fit, 0.0, 1.0);
}`;

/** BACKGROUND fragment: deep-violet plate, soft vignette + faint inner frame. */
export const BG_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
void main(){
  vec2 c = v_uv - 0.5;
  float vig = smoothstep(0.75, 0.15, length(c));
  vec3 base = mix(vec3(0.020,0.012,0.040), vec3(0.060,0.035,0.110), vig);
  float edge = min(min(v_uv.x, 1.0-v_uv.x), min(v_uv.y, 1.0-v_uv.y));
  float frame = smoothstep(0.02, 0.0, edge)*0.5;
  base += vec3(0.35,0.24,0.55)*frame;
  frag = vec4(base, 1.0);
}`;
