import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + VORONOI + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.30;

  // Project onto infinite plane receding into distance
  // uv.y = 0 is horizon, below is the floor extending away
  float horizon = 0.05 + u_bass * 0.03;
  float py = uv.y - horizon;

  vec3 color = vec3(0.0);

  // Sky portion — pure void
  vec3 skyColor = palette(0.78 + paletteShift,
    vec3(0.0),
    vec3(0.01, 0.01, 0.03),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.4));

  if (py >= 0.0) {
    // Above horizon: void sky
    color = skyColor * exp(-py * 8.0);
  } else {
    // Below horizon: perspective-projected obsidian floor
    // Perspective: depth = -horizon_offset / py
    float depth = horizon / (-py + 0.0001);
    depth = clamp(depth, 0.0, 60.0);

    // Floor plane UV with perspective
    vec2 floorUV = vec2(uv.x * depth, depth) * 0.15;
    floorUV += vec2(0.0, t * 0.4); // slow drift forward

    // Voronoi fractures — the obsidian cracking pattern
    vec3 vor1 = voronoi(floorUV * 2.0 + t * 0.1);
    vec3 vor2 = voronoi(floorUV * 4.5 - t * 0.07);
    vec3 vor3 = voronoi(floorUV * 9.0 + t * 0.13);

    // Crack network: edges of voronoi cells = cracks
    float crack1 = 1.0 - smoothstep(0.0, 0.04 + u_bass * 0.02, vor1.y - vor1.x);
    float crack2 = 1.0 - smoothstep(0.0, 0.025, vor2.y - vor2.x);
    float crack3 = 1.0 - smoothstep(0.0, 0.015, vor3.y - vor3.x);
    float cracks = max(crack1, max(crack2 * 0.7, crack3 * 0.4));

    // Surface reflectivity — obsidian is a mirror in some places
    // Fake reflection: distant sky color warped by fbm
    vec2 reflUV = floorUV * 0.3 + fbm(floorUV * 0.5 + t * 0.2) * 0.2;
    float reflNoise = fbm(reflUV + t * 0.15);
    // Reflection is faint and disturbed
    float reflStrength = exp(-depth * 0.06) * (0.08 + u_mid * 0.06);

    // Depth fog — the far distance vanishes into black
    float depthFog = exp(-depth * 0.05);
    float nearFog  = 1.0 - exp(-depth * 0.02);

    // Colors
    // Obsidian base: near-black with very faint dark teal
    vec3 obsidianBase = palette(0.55 + paletteShift + vor1.x * 0.05,
      vec3(0.01, 0.01, 0.015),
      vec3(0.03, 0.04, 0.06),
      vec3(1.0, 1.0, 1.0),
      vec3(0.5, 0.6, 0.7));

    // Crack glow — faint luminescence, deep violet
    vec3 crackColor = palette(0.72 + paletteShift + u_mid * 0.12,
      vec3(0.0, 0.0, 0.01),
      vec3(0.08, 0.04, 0.18),
      vec3(1.0, 1.0, 1.0),
      vec3(0.6, 0.7, 0.9));

    // Reflection color
    vec3 reflColor = palette(0.82 + paletteShift + reflNoise * 0.1,
      vec3(0.0, 0.0, 0.02),
      vec3(0.05, 0.04, 0.08),
      vec3(1.0, 1.0, 1.0),
      vec3(0.1, 0.3, 0.6));

    // Treble sparkle: tiny glints on obsidian surface
    float glint = smoothstep(0.88, 1.0, snoise(floorUV * 14.0 + t)) * u_treble * 0.12;
    glint *= depthFog;

    color = obsidianBase;
    color += crackColor * cracks * (0.3 + u_bass * 0.2) * depthFog;
    color += reflColor * reflStrength;
    color += glint;

    // Fog out toward horizon
    color *= depthFog;
    color = mix(color, skyColor * 0.3, 1.0 - depthFog);
  }

  // Vignette
  float dist = length(uv);
  float vignette = pow(1.0 - smoothstep(0.2, 1.3, dist), 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
