// ─────────────────────────────────────────────────────────────────────────────
// 1316-moire-drift / shader.ts — GLSL ES 3.00 for the interference field.
//
//   Two (really three) high-frequency gratings are built in cortical (log r,
//   theta) space and SUPERIMPOSED. Overlaid gratings physically add, and when
//   two nearly-equal frequencies add you get a low-frequency BEAT term — that
//   slow emergent envelope IS a Klüver form constant (concentric rings ↦
//   tunnels, radial rays ↦ spokes, diagonals ↦ spirals; Bressloff–Cowan). The
//   movable "top" grating is translated (uShift), rotated (uDtheta) and
//   frequency-detuned (uDetune) against the fixed base; its temporal phase
//   advances so the whole moiré ENVELOPE drifts at exactly uBeatHz — the same
//   number the audio oscillator pair beats at.
//
//   Op-art rendering: near-binary black / bone ink via a smoothstep with an
//   fwidth() anti-alias edge (Bridget Riley stripes), one accent colour tracing
//   the drifting moiré nodes that blooms toward neon at the entropy peak.
// ─────────────────────────────────────────────────────────────────────────────

// Full-screen triangle — no vertex buffer, positions from gl_VertexID.
export const VERT_SRC = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;      // canvas pixels
uniform float uTime;     // seconds
uniform float uDtheta;   // rotation offset between layers (radians)
uniform float uDetune;   // 0..1 spatial-frequency detune (Δk)
uniform float uBeatHz;   // temporal moiré beat (Hz) — SAME number as audio
uniform float uEntropy;  // 0..1 slow arc (grating octaves / drift / looseness)
uniform float uEnergy;   // 0..1 pointer energy
uniform vec2  uShift;    // movable-layer translation (screen units)
uniform float uReduced;  // 1.0 if prefers-reduced-motion

const float TAU = 6.28318530718;

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// screen (centered, aspect-normalized) -> cortical (log r, theta)
vec2 toCortex(vec2 p) {
  float r = max(length(p), 1e-4);
  return vec2(log(r), atan(p.y, p.x));
}

// ONE accent colour: electric cyan at rest -> saturated magenta / lime at peak
vec3 accentColor(float t) {
  vec3 cyan    = vec3(0.16, 0.95, 1.00);
  vec3 magenta = vec3(1.00, 0.20, 0.85);
  vec3 lime    = vec3(0.60, 1.00, 0.25);
  vec3 a = mix(cyan, magenta, smoothstep(0.0, 0.7, t));
  a = mix(a, lime, smoothstep(0.6, 1.0, t) * 0.45);
  return a;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  p *= 2.3;

  // fixed base layer, and the movable layer (translated + rotated)
  vec2 cA = toCortex(p);
  vec2 cB = toCortex(rot(p - uShift, uDtheta));

  // grating density; entropy adds a finer octave (REBUS: priors relax)
  float kBase = 7.0 + uEntropy * 6.0;
  float delta = 0.015 + uDetune * 0.22;    // fractional detune -> moiré ring spacing
  float kA = kBase;
  float kB = kBase * (1.0 + delta);

  // temporal phase so the moiré ENVELOPE drifts at exactly uBeatHz
  float beat = uTime * TAU * uBeatHz;
  float creep = uTime * (0.05 + uEntropy * 0.12);   // gentle inward drift

  // --- tunnels: concentric rings vary with log r ---
  float ringA = sin(kA * 3.0 * cA.x + creep);
  float ringB = sin(kB * 3.0 * cB.x + creep + beat);

  // --- spokes: radial rays vary with theta (rotation offset beats them) ---
  float spokeA = sin(kA * cA.y);
  float spokeB = sin(kA * cB.y + beat * 0.5);

  // --- spirals: diagonal in cortical space ---
  float spiA = sin(kA * 2.1 * (0.7 * cA.x + 0.7 * cA.y) + creep);
  float spiB = sin(kB * 2.1 * (0.7 * cB.x + 0.7 * cB.y) + creep + beat);

  // hex-ish lattice term that only wakes up near the peak
  float honey = sin(kA * (cA.y + 0.5)) * sin(kB * cB.x * 2.0 + beat);

  // which form constant dominates: steered by rotation offset + entropy
  float wTunnel = 0.65;
  float wSpoke  = (0.18 + 0.5 * uEntropy) * (0.5 + 0.5 * sin(uDtheta * 1.3));
  float wSpiral = uEntropy;

  // superposition = the moiré (overlaid gratings add)
  float field =
      wTunnel * (ringA + ringB)
    + wSpoke  * (spokeA + spokeB) * 0.7
    + wSpiral * (spiA + spiB)
    + uEntropy * 0.5 * honey;
  float norm = wTunnel * 2.0 + wSpoke * 1.4 + wSpiral * 2.0 + uEntropy * 0.5;
  field /= max(norm, 0.5);

  // op-art ink: crisp near-binary black / bone, fwidth anti-alias
  float aa = fwidth(field) * 1.2 + 0.02;
  float ink = smoothstep(-aa, aa, field);

  // low-frequency moiré envelope (the emergent form constant) for accent glow
  float env = ringA * ringB + spiA * spiB;   // difference-frequency term
  float nodes = smoothstep(0.55, 1.0, 1.0 - abs(env));

  vec3 black = vec3(0.025, 0.028, 0.045);
  vec3 bone  = vec3(0.93, 0.91, 0.84);
  vec3 col = mix(black, bone, ink);

  // accent traces the drifting moiré; blooms with energy + entropy (neon at peak)
  float neonAmt = smoothstep(0.35, 1.0, uEntropy);
  vec3 accent = accentColor(uEntropy);
  float glow = nodes * (0.22 + 0.9 * uEnergy) * (0.35 + 0.65 * neonAmt);
  col += accent * glow;

  // at peak tint bone toward iridescent
  col = mix(col, col * vec3(1.0, 0.95, 1.1) + accent * 0.06 * neonAmt, neonAmt * 0.5);

  // vignette to keep the edges from blowing out
  float vig = smoothstep(1.9, 0.2, length(p));
  col *= mix(0.6, 1.0, vig);

  // reduced-motion: pull contrast down toward mid-grey
  float g = dot(col, vec3(0.33));
  col = mix(col, vec3(g), uReduced * 0.35);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
