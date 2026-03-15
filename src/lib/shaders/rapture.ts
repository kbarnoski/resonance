import { U, VISIONARY_PALETTE, ROT2, SMOOTH_NOISE } from "./shared";

// Explosive fracturing light expanding upward infinitely, shards getting smaller
// as they recede into the distance. FBM with radial expansion + depth layering.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMOOTH_NOISE + `
// Fracture/shard field: returns distance to nearest fracture line
float fractureField(vec2 p, float scale) {
  vec2 sp = p * scale;
  vec2 cell = floor(sp);
  vec2 f = fract(sp);
  // Random fracture direction per cell
  float ang = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5) * 6.28318;
  vec2 dir = vec2(cos(ang), sin(ang));
  // Distance to fracture line through center of cell
  return abs(dot(f - 0.5, vec2(-dir.y, dir.x)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Expansion: the explosion's shards travel outward and upward
  // Remap space logarithmically so near-origin shards = distant/small
  float logR = log(r * 6.0 + 1.0);

  // The epicenter is at slight upward offset (source of explosion below frame)
  vec2 epicenter = vec2(0.0, 0.3 + u_bass * 0.05);
  vec2 fromEpi = uv - epicenter;
  float rEpi = length(fromEpi);
  float angleEpi = atan(fromEpi.y, fromEpi.x);

  // FBM domain warp — shards are not clean lines, they fracture organically
  float warpT = t * 0.4;
  vec2 warpOffset = vec2(
    fbm(uv * 2.5 + vec2(warpT, 0.0)),
    fbm(uv * 2.5 + vec2(0.0, warpT + 1.7))
  ) * (0.15 + u_bass * 0.1);
  vec2 warpedUV = uv + warpOffset;

  // Depth layering: shards at 4 scales receding into distance
  // Smallest = farthest away (highest log depth)
  float frac1 = fractureField(warpedUV + vec2(t * 0.05, -t * 0.12), 3.0 + u_mid * 0.5);
  float frac2 = fractureField(warpedUV * 1.8 + vec2(-t * 0.08, -t * 0.2), 5.5);
  float frac3 = fractureField(warpedUV * 3.2 + vec2(t * 0.1, -t * 0.35), 10.0);
  float frac4 = fractureField(warpedUV * 6.0 + vec2(-t * 0.15, -t * 0.55), 18.0);

  // Each layer is a glowing edge — sharp bright lines = shard boundaries
  float edge1 = 1.0 - smoothstep(0.0, 0.06, frac1);
  float edge2 = 1.0 - smoothstep(0.0, 0.04, frac2);
  float edge3 = 1.0 - smoothstep(0.0, 0.025, frac3);
  float edge4 = 1.0 - smoothstep(0.0, 0.015, frac4) * u_treble;

  // Radial expansion: brightness stronger along radial direction from epicenter
  float radialDir = max(0.0, dot(normalize(fromEpi), vec2(0.0, 1.0)));
  float expansionBoost = 0.5 + radialDir * 0.8 + u_amplitude * 0.4;

  // Upward bias: top of frame is "farther up in the explosion" so shards recede
  float upwardFade = smoothstep(-0.8, 0.8, uv.y); // dimmer at top (far away)
  float upwardBias = 1.0 - upwardFade * 0.5;

  // Depth per layer — far layers (4) are dim
  float d1 = 1.0, d2 = 0.65, d3 = 0.35, d4 = 0.15 + u_treble * 0.1;

  // Glow: interior of each shard cell catches light
  float shardGlow1 = (1.0 - frac1) * exp(-rEpi * 1.5) * 0.4;
  float shardGlow2 = (1.0 - frac2) * exp(-rEpi * 2.0) * 0.25;

  // Palette
  vec3 c1 = palette(logR * 0.3 + t * 0.07 + paletteShift,
    vec3(0.7, 0.5, 0.3), vec3(0.5, 0.4, 0.3), vec3(1.0, 0.8, 0.6), vec3(0.0, 0.1, 0.3));
  vec3 c2 = palette(angleEpi * 0.2 + rEpi * 0.5 + t * 0.05 + u_mid * 0.3 + paletteShift,
    vec3(0.5, 0.3, 0.7), vec3(0.5, 0.4, 0.4), vec3(0.8, 1.2, 1.0), vec3(0.3, 0.0, 0.2));
  vec3 c3 = palette(frac2 * 0.4 + u_treble * 0.3 + paletteShift,
    vec3(0.9, 0.8, 0.6), vec3(0.2, 0.2, 0.3), vec3(1.2, 1.0, 0.8), vec3(0.1, 0.2, 0.0));

  vec3 color = vec3(0.0);
  color += c1 * (edge1 * d1 + shardGlow1) * expansionBoost;
  color += c2 * (edge2 * d2 + shardGlow2 * 0.5) * expansionBoost;
  color += c1 * edge3 * d3 * upwardBias;
  color += c3 * edge4 * d4 * u_treble;

  // Epicenter blast core
  float blastCore = exp(-rEpi * rEpi * 20.0) * (1.2 + u_bass * 1.5);
  vec3 cBlast = palette(t * 0.1 + paletteShift,
    vec3(1.0, 0.9, 0.8), vec3(0.1, 0.1, 0.1), vec3(1.0, 1.0, 0.8), vec3(0.0, 0.05, 0.1));
  color += cBlast * blastCore;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
