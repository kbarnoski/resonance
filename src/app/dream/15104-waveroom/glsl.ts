// glsl.ts — GLSL ES 3.00 sources for the waveroom FDTD acoustic field.
//
// Raw WebGL2. Two programs share one full-screen-quad vertex shader:
//   (1) the FDTD leapfrog update (ping-pong RGBA32F float textures), and
//   (2) the display pass with a signed / diverging pressure colormap.
//
// The simulation texture packs three fields per texel:
//   .r = u      (current pressure)
//   .g = u_prev (pressure one step ago — the leapfrog needs both)
//   .b = E      (a decaying peak-hold of |u|, the standing-wave energy map:
//                antinodes accumulate, nodes stay dark)
//
// All art colour (the teal↔coral diverging map) lives here in the shader
// strings — never as chrome classes — per the palette rule.

/** Full-screen quad. layout(location=0) a_pos ∈ [-1,1]², v_uv ∈ [0,1]². */
export const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * 2D scalar wave equation, discretised with the standard leapfrog stencil:
 *
 *   u_next = 2·u − u_prev + C2·∇²u − DAMP·(u − u_prev)
 *
 * where C2 = (c·dt/dx)² must satisfy the 2D CFL stability limit (C2 ≤ 0.5).
 * We run at C2 = 0.49 — as reflective as the physics allows so standing waves
 * build up strongly. Walls are Neumann (reflecting) via CLAMP_TO_EDGE sampling;
 * a thin absorbing perimeter bleeds the very outermost cells so a driven room
 * cannot integrate to a blow-up. The music's live waveform is injected as a
 * Gaussian point source (a driven speaker cone) each substep.
 */
export function buildSimFs(sim: number): string {
  const px = (1 / sim).toFixed(8);
  return `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2  u_src;     // source position, uv space
uniform float u_srcAmp;  // signed drive this substep
in vec2 v_uv;
out vec4 o;

const float C2   = 0.49;    // CFL-safe wave speed²
const float DAMP = 0.0006;  // gentle bulk loss so it never runs away
const float EDECAY = 0.992;  // peak-hold decay for the energy/mode map

void main() {
  vec2 px = vec2(${px}, ${px});
  vec4 c  = texture(u_tex, v_uv);
  float u     = c.r;
  float uprev = c.g;
  float eprev = c.b;

  // 5-point Laplacian. CLAMP_TO_EDGE makes off-grid samples mirror the edge
  // value → zero-gradient (reflecting / Neumann) walls that fold wavefronts
  // back into the room and let standing waves form.
  float lap =
      texture(u_tex, v_uv + vec2(-px.x, 0.0)).r
    + texture(u_tex, v_uv + vec2( px.x, 0.0)).r
    + texture(u_tex, v_uv + vec2( 0.0,-px.y)).r
    + texture(u_tex, v_uv + vec2( 0.0, px.y)).r
    - 4.0 * u;

  float unext = 2.0 * u - uprev + C2 * lap - DAMP * (u - uprev);

  // Point-source injection: a small Gaussian splat driven by the live signal.
  float d = distance(v_uv, u_src);
  float sigma = 3.0 * px.x;
  unext += u_srcAmp * exp(-(d * d) / (2.0 * sigma * sigma));

  // Thin absorbing perimeter (outer ~5%) so the driven field stays bounded
  // while the interior walls stay strongly reflective.
  float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
  float absorb = smoothstep(0.06, 0.0, edge);
  unext *= 1.0 - 0.045 * absorb;

  // Peak-hold energy → the standing-wave map (antinodes bright, nodes dark).
  float E = max(eprev * EDECAY, abs(unext));

  o = vec4(unext, u, E, 1.0);
}`;
}

/**
 * Display: a signed / diverging pressure colormap.
 *   rarefaction (u<0) → teal pole
 *   zero pressure     → near-black
 *   compression (u>0) → coral pole
 * The peak-hold energy field (.b) is layered on as a cool antinode bloom so the
 * standing-wave structure — bright bands at antinodes, dark seams at nodes — is
 * legible even between wavefronts. Source and listener are drawn as rings.
 */
export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2  u_src;
uniform vec2  u_listener;
uniform float u_aspect;   // canvas w/h — keeps the marker rings circular
in vec2 v_uv;
out vec4 o;

vec3 diverging(float s) {
  // s ∈ [-1,1]. Two distinct poles that read as a scientific acoustic field.
  vec3 nearBlack = vec3(0.020, 0.030, 0.045);
  vec3 teal      = vec3(0.020, 0.620, 0.640);  // rarefaction pole
  vec3 tealHot   = vec3(0.520, 0.980, 0.960);
  vec3 coral     = vec3(0.980, 0.360, 0.300);  // compression pole
  vec3 coralHot  = vec3(1.000, 0.760, 0.560);
  float a = abs(s);
  vec3 col;
  if (s < 0.0) {
    col = mix(nearBlack, teal, smoothstep(0.0, 0.55, a));
    col = mix(col, tealHot, smoothstep(0.55, 1.0, a));
  } else {
    col = mix(nearBlack, coral, smoothstep(0.0, 0.55, a));
    col = mix(col, coralHot, smoothstep(0.55, 1.0, a));
  }
  return col;
}

void main() {
  vec4 c = texture(u_tex, v_uv);
  float p = c.r;
  float E = c.b;

  // Compress dynamic range so both faint ripples and loud fronts read.
  float s = tanh(p * 6.0);
  vec3 col = diverging(s);

  // Standing-wave map: a cool antinode bloom from the peak-hold energy.
  float em = tanh(E * 4.0);
  col += vec3(0.10, 0.34, 0.40) * pow(em, 1.5) * 0.55;

  // Faint reflecting-wall frame.
  float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
  col += vec3(0.10, 0.16, 0.20) * smoothstep(0.010, 0.0, edge);

  // Aspect-corrected distances for circular markers.
  vec2 a = vec2(u_aspect, 1.0);
  float ds = distance(v_uv * a, u_src * a);
  float dl = distance(v_uv * a, u_listener * a);

  // Source: a steady coral ring (the driven speaker cone).
  float sRing = smoothstep(0.016, 0.012, abs(ds - 0.020));
  col = mix(col, vec3(1.000, 0.560, 0.440), sRing * 0.9);
  col += vec3(0.30, 0.10, 0.06) * smoothstep(0.020, 0.0, ds);

  // Listener: a bright ring + crosshair (where you are hearing the room).
  float lRing = smoothstep(0.020, 0.015, abs(dl - 0.028));
  col = mix(col, vec3(0.960, 0.985, 1.000), lRing);
  vec2 rel = (v_uv - u_listener) * a;
  float cross = smoothstep(0.004, 0.0, abs(rel.x)) + smoothstep(0.004, 0.0, abs(rel.y));
  cross *= smoothstep(0.045, 0.0, dl);
  col = mix(col, vec3(0.960, 0.985, 1.000), clamp(cross, 0.0, 1.0) * 0.7);
  col += vec3(0.20, 0.28, 0.34) * smoothstep(0.045, 0.0, dl) * 0.5;

  // Vignette.
  vec2 q = v_uv * 2.0 - 1.0;
  col *= 1.0 - 0.22 * dot(q, q);

  o = vec4(col, 1.0);
}`;
