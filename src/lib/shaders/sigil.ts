import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

// Concentric rings of rotating geometric arms receding into infinite depth,
// like looking down an infinite well of sacred symbols.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SDF_PRIMITIVES + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.3;

  // Perspective projection — treat uv as floor plane seen from above
  // depth z recedes as we go inward, so map radius to depth
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Log-depth: compress distant rings into tight center
  float depth = 1.0 / (r + 0.04);          // depth increases toward center
  float logDepth = log(depth * 0.5 + 1.0); // logarithmic compression

  // Each "layer" is a ring-shell at a receding depth level
  float layers = 14.0;
  float layer = fract(logDepth * layers * 0.18 - t * 0.4 + u_bass * 0.15);
  float layerID = floor(logDepth * layers * 0.18 - t * 0.4 + u_bass * 0.15);

  // Arms: N-fold symmetry that changes per layer, rotates alternately
  float arms = 5.0 + mod(layerID * 1.618, 4.0); // golden-ratio arm count variation
  float armAngle = mod(angle + layerID * 0.31 + t * sign(mod(layerID, 2.0) - 0.5) * 0.7, 6.28318 / arms);
  armAngle = abs(armAngle - 3.14159 / arms); // fold into single arm wedge

  // SDF of the arm spine (thin line toward center)
  float armSpine = armAngle * depth * 0.8;
  float armGlyph = smoothstep(0.015, 0.0, armSpine - 0.008 * (1.0 + u_mid * 0.4));

  // Ring pulse at each layer boundary
  float ring = smoothstep(0.04, 0.0, abs(layer - 0.5) - 0.38 + u_bass * 0.04);

  // Cross-arms: small perpendicular marks at midpoint of each arm
  float crossMark = smoothstep(0.012, 0.0, abs(armAngle * depth * 0.8 - 0.0) - 0.003) *
                    smoothstep(0.06, 0.0, abs(layer - 0.5) - 0.25);

  // Depth fog — far layers (near center) fade to deep color
  float fog = exp(-r * 2.8);
  float brightness = (armGlyph + ring * 0.5 + crossMark * 0.8) * (0.3 + 0.7 * (1.0 - fog));

  // Treble adds fine shimmer on arm edges
  float shimmer = u_treble * 0.15 * sin(logDepth * 40.0 + t * 6.0) * armGlyph;

  // Color: 3 palette lookups at different depth phases
  vec3 c1 = palette(layerID * 0.09 + paletteShift,
    vec3(0.5, 0.4, 0.6), vec3(0.5, 0.4, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.2, 0.5));
  vec3 c2 = palette(layer + t * 0.2 + u_mid * 0.3 + paletteShift,
    vec3(0.3, 0.5, 0.5), vec3(0.5, 0.5, 0.4), vec3(1.0, 0.8, 1.2), vec3(0.3, 0.0, 0.2));
  vec3 c3 = palette(fog + paletteShift * 0.5,
    vec3(0.1, 0.1, 0.2), vec3(0.3, 0.2, 0.4), vec3(1.0, 1.0, 2.0), vec3(0.5, 0.4, 0.0));

  vec3 color = c3 * 0.18; // deep void base
  color += c1 * (armGlyph + crossMark) * brightness;
  color += c2 * ring * 0.6 * brightness;
  color += vec3(1.0) * shimmer;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
