import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// The highest heaven: brilliant golden light cascading through cloud-like forms,
// divine radiance pouring downward through luminous atmospheric layers.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Light source at top — divine radiance from above
  vec2 lightDir = normalize(vec2(0.0, 1.0));
  float topGlow = smoothstep(0.5, -0.3, uv.y) * 0.0; // dark below

  // Cloud layers — multiple FBM strata at different heights
  for (int layer = 0; layer < 4; layer++) {
    float fl = float(layer);
    float yOffset = 0.5 - fl * 0.35;
    vec2 cloudUV = uv + vec2(0.0, yOffset);

    // Drift horizontally
    cloudUV.x += t * (0.1 + fl * 0.05) * (mod(fl, 2.0) < 0.5 ? 1.0 : -0.7);

    // FBM cloud shape — max 3 octaves for perf
    float cloud = 0.0;
    float amp = 0.5;
    vec2 p = cloudUV * (2.5 + fl * 0.8);
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int o = 0; o < 3; o++) {
      cloud += amp * snoise(p);
      p = m * p * 2.0;
      amp *= 0.5;
    }

    float cloudMask = smoothstep(-0.1, 0.3, cloud);
    float layerFade = 1.0 / (1.0 + fl * 0.4);

    // Light penetration — brighter at top, golden hues
    float lightPenetration = smoothstep(-0.8, 0.6, uv.y + fl * 0.2);

    vec3 cloudCol = palette(
      fl * 0.15 + cloud * 0.3 + paletteShift,
      vec3(0.7, 0.6, 0.4),
      vec3(0.3, 0.3, 0.25),
      vec3(1.0, 0.85, 0.55),
      vec3(0.0, 0.1, 0.25)
    );

    // Silver lining on cloud edges
    float edge = smoothstep(0.1, 0.3, cloud) - smoothstep(0.3, 0.5, cloud);
    vec3 edgeCol = vec3(1.0, 0.95, 0.85);

    color += cloudCol * cloudMask * layerFade * lightPenetration * (0.5 + 0.4 * u_mid);
    color += edgeCol * edge * layerFade * lightPenetration * 0.4;
  }

  // God rays — shafts of light piercing through clouds
  float a = atan(uv.y - 0.6, uv.x);
  float rayFromTop = length(uv - vec2(0.0, 0.6));
  for (int ray = 0; ray < 6; ray++) {
    float fr = float(ray);
    float rayAngle = -1.5 + fr * 0.5 + sin(t * 0.3 + fr * 0.8) * 0.1;
    float angleDiff = abs(a - rayAngle);
    float rayWidth = 0.04 + 0.02 * sin(t + fr * 1.5);
    float shaft = smoothstep(rayWidth, 0.0, angleDiff);
    shaft *= smoothstep(0.0, 0.2, rayFromTop) * exp(-rayFromTop * 1.5);

    // Modulate by noise for cloud-breakage feel
    float breakage = snoise(vec2(a * 5.0 + fr, rayFromTop * 3.0 + t * 0.2));
    shaft *= smoothstep(-0.2, 0.3, breakage);

    vec3 rayCol = palette(
      fr * 0.12 + paletteShift + 0.3,
      vec3(0.8, 0.7, 0.5),
      vec3(0.2, 0.2, 0.15),
      vec3(1.0, 0.9, 0.7),
      vec3(0.0, 0.05, 0.1)
    );

    color += rayCol * shaft * (0.5 + 0.5 * u_bass) * 0.8;
  }

  // Celestial glow at zenith
  float zenith = exp(-length(uv - vec2(0.0, 0.5)) * 2.0) * (0.6 + 0.4 * u_bass);
  vec3 zenithCol = palette(
    t * 0.06 + paletteShift,
    vec3(0.9, 0.8, 0.6),
    vec3(0.15, 0.15, 0.1),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.08)
  );
  color += zenithCol * zenith;

  // Golden dust particles
  float dust = snoise(uv * 12.0 + vec2(t * 0.5, -t * 1.2));
  dust = pow(max(dust, 0.0), 5.0) * u_treble * 0.35;
  color += vec3(1.0, 0.92, 0.7) * dust * smoothstep(1.0, 0.2, r);

  // Vignette
  color *= smoothstep(1.5, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
