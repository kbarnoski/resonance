import { U, VISIONARY_PALETTE, SMOOTH_NOISE, VORONOI } from "./shared";

// Infinite crystalline voronoi surface receding into distance with prismatic
// light reflecting off facets. Voronoi + perspective depth.
export const FRAG = U + VISIONARY_PALETTE + SMOOTH_NOISE + VORONOI + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Perspective projection: treat uv as a floor receding to horizon
  // y drives depth — top of screen is far away
  // Shift origin so we look slightly downward
  vec2 pUV = uv + vec2(0.0, 0.2);

  // Perspective divide: points near horizon (pUV.y ~ 0) recede to infinity
  float horizon = 0.05;
  float eyeHeight = 0.55;
  float clipY = max(pUV.y + eyeHeight, horizon);
  float depth = eyeHeight / clipY;         // 1 = at feet, 0+ = far away

  // World-space XZ coordinates on the crystal floor
  float worldX = pUV.x * depth * 3.5;
  float worldZ = depth * 5.0 - t * 0.8 + u_bass * 0.3; // scroll forward

  vec2 worldPos = vec2(worldX, worldZ);

  // Voronoi on world floor — large scale
  vec3 v1 = voronoi(worldPos * 1.0 + vec2(t * 0.05, 0.0));
  // Smaller scale voronoi for facet detail
  vec3 v2 = voronoi(worldPos * 2.8 + vec2(0.0, t * 0.1));
  // Finest crystal grain — treble driven
  vec3 v3 = voronoi(worldPos * 7.0 * (1.0 + u_treble * 0.3));

  // Edge detection: F2 - F1 gives cell borders — bright crystalline edges
  float edge1 = 1.0 - smoothstep(0.0, 0.06, v1.y - v1.x);
  float edge2 = 1.0 - smoothstep(0.0, 0.04, v2.y - v2.x);
  float edge3 = 1.0 - smoothstep(0.0, 0.025, v3.y - v3.x);

  // Specular glint: bright point where edges cross — prismatic
  float specular = edge1 * edge2 * (0.8 + u_mid * 0.5);
  float microGlint = edge2 * edge3 * u_treble * 0.6;

  // Interior facet shading — each cell has unique tint based on F1 distance
  float cellID = v1.x * 7.3 + v1.y * 3.1; // pseudo-random per cell
  float facetTilt = sin(cellID * 13.7 + t * 0.3) * 0.5 + 0.5; // simulated surface tilt

  // Depth fog — far plane (depth near 0) fades to deep void color
  float fog = exp(-1.5 / (depth + 0.05));  // dense fog at horizon
  float depthShade = depth * 0.85;         // attenuation by distance

  // Reflective sky: top of screen reflects a bright sky color into crystal
  float skyReflect = (1.0 - depth) * (0.3 + u_amplitude * 0.2);

  // Palette lookups
  vec3 c1 = palette(cellID * 0.15 + t * 0.06 + paletteShift,
    vec3(0.4, 0.5, 0.7), vec3(0.4, 0.4, 0.3), vec3(1.0, 1.0, 0.8), vec3(0.0, 0.3, 0.6));
  vec3 c2 = palette(edge1 * 0.8 + facetTilt * 0.4 + u_mid * 0.2 + paletteShift,
    vec3(0.7, 0.8, 0.9), vec3(0.3, 0.2, 0.4), vec3(1.2, 0.8, 1.0), vec3(0.1, 0.0, 0.3));
  vec3 c3 = palette(skyReflect + paletteShift * 0.6,
    vec3(0.6, 0.7, 0.8), vec3(0.4, 0.3, 0.3), vec3(0.8, 1.2, 1.0), vec3(0.4, 0.2, 0.0));

  vec3 color = c1 * facetTilt * depthShade;          // base facet color
  color += c2 * (edge1 * 0.5 + edge2 * 0.3) * depthShade;  // crystal edges
  color += vec3(1.0) * specular * depthShade;         // prismatic specular
  color += c3 * skyReflect;                            // sky reflection
  color += vec3(0.9, 1.0, 1.0) * microGlint;          // treble micro-glints
  color = mix(vec3(0.0), color, fog);                  // depth fog to void

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
