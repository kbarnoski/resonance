// shaders.ts — raw WebGL2 GLSL (no three.js). A single fullscreen triangle
// fragment shader draws the ENERGY(t) ridge: a horizontal timeline
// landscape whose height/brightness is the energy curve, drop sections
// hot-tinted, section boundaries ticked, a playhead bead sweeping across.
// Designed to read as "build-and-drop structure" on a silent, static frame.

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export const SAMPLES = 128;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 u_res;
uniform float u_time;
uniform float u_playhead;   // 0..1 normalized playhead position
uniform float u_playE;      // energy at playhead
uniform float u_pump;       // 0..1 smoothed sidechain swell (slow, no strobe)
uniform float u_reduce;     // 1 = prefers-reduced-motion

#define N ${SAMPLES}
uniform float u_energy[N];  // sampled ENERGY(t) across the timeline
uniform float u_hot[N];     // 1 inside DROP sections, else 0

#define NS 8
uniform float u_sec[NS];    // normalized section-start positions
uniform int u_secN;

float samp(float u){
  float x = clamp(u, 0.0, 1.0) * float(N - 1);
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, N - 1);
  return mix(u_energy[i0], u_energy[i1], x - float(i0));
}
float sampHot(float u){
  float x = clamp(u, 0.0, 1.0) * float(N - 1);
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, N - 1);
  return mix(u_hot[i0], u_hot[i1], x - float(i0));
}

// Palette stays inside the violet family: cool violet in the calm
// sections, hot magenta/pink tint in the DROP sections, brightening
// toward white-violet at peak energy.
vec3 palette(float e, float hot){
  vec3 cool = vec3(0.34, 0.18, 0.78);
  vec3 warm = vec3(0.86, 0.24, 0.96);
  vec3 base = mix(cool, warm, hot * 0.85);
  return mix(base, vec3(0.95, 0.82, 1.0), e * e * 0.6);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float u = uv.x;
  float e = samp(u);
  float hot = sampHot(u);

  float baseY = 0.30;
  float top = baseY + e * 0.46;

  vec3 col = vec3(0.020, 0.015, 0.052);
  col += vec3(0.020, 0.010, 0.060) * (1.0 - uv.y);

  vec3 pcol = palette(e, hot);

  // filled body under the ridge
  if(uv.y < top && uv.y > baseY){
    float g = (uv.y - baseY) / max(0.0001, top - baseY);
    col = mix(col, pcol * mix(0.22, 1.0, g), 0.9);
  }
  // faint mirror reflection below the baseline
  if(uv.y < baseY && uv.y > baseY - 0.10){
    float r = (baseY - uv.y) / 0.10;
    col = mix(col, pcol * 0.16 * (1.0 - r), 0.5);
  }

  // slow shimmer on the ridge crest (well under 3 Hz, damped when reduced)
  float shimmer = 0.6 + 0.4 * sin(u_time * 0.7 + u * 9.0);
  shimmer = mix(1.0, shimmer, 1.0 - u_reduce);
  float line = smoothstep(0.02, 0.0, abs(uv.y - top)) * (0.6 + 0.4 * e);
  col += pcol * line * 1.4 * shimmer;

  // glow above the crest
  if(uv.y > top){
    col += pcol * exp(-(uv.y - top) * 14.0) * e * 0.6;
  }

  // section boundary ticks
  for(int i = 0; i < NS; i++){
    if(i >= u_secN) break;
    col += vec3(0.40, 0.35, 0.62) *
           smoothstep(0.0035, 0.0, abs(u - u_sec[i])) * 0.5;
  }

  // playhead: vertical sweep line + a bead riding the ridge crest
  col += vec3(1.0, 0.95, 1.0) *
         smoothstep(0.006, 0.0, abs(u - u_playhead)) * (0.8 + u_pump * 0.6);
  float asp = u_res.x / u_res.y;
  vec2 bead = vec2(u_playhead, baseY + u_playE * 0.46);
  float db = distance(vec2(uv.x * asp, uv.y), vec2(bead.x * asp, bead.y));
  col += vec3(1.0, 0.9, 1.0) * smoothstep(0.03, 0.0, db) * (1.2 + u_pump);

  // gentle global swell with the pump (smoothed, clamped — never a flash)
  col *= 1.0 + u_pump * 0.12 * (1.0 - u_reduce);

  frag = vec4(col, 1.0);
}`;
