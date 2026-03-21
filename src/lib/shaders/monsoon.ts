import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Dark stormy sky background
  float skyGrad = smoothstep(-0.5, 0.8, uv.y);
  vec3 skyDark = palette(0.1 + paletteShift, vec3(0.02, 0.02, 0.05), vec3(0.05, 0.08, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.6, 0.7, 0.8));
  vec3 skyLight = palette(0.3 + paletteShift, vec3(0.05, 0.05, 0.1), vec3(0.1, 0.12, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.65, 0.75));
  vec3 color = mix(skyDark, skyLight, skyGrad);

  // Storm clouds rolling — layered fbm
  vec2 cloudUV = uv * 2.0 + vec2(t * 0.5, 0.0);
  float cloud1 = fbm(cloudUV * 1.5 + vec2(0.0, t * 0.2));
  float cloud2 = fbm(cloudUV * 2.5 + vec2(t * 0.3, -t * 0.1));
  float clouds = smoothstep(0.0, 0.6, cloud1 * 0.6 + cloud2 * 0.4 + 0.1);
  clouds *= smoothstep(-0.3, 0.5, uv.y); // clouds above horizon
  vec3 cloudColor = palette(clouds * 0.4 + 0.15 + paletteShift,
    vec3(0.15, 0.15, 0.2), vec3(0.1, 0.1, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color = mix(color, cloudColor, clouds * 0.7);

  // Lightning flash driven by bass peaks
  float lightningTrigger = smoothstep(0.7, 0.95, u_bass);
  float lightningFlicker = step(0.92, fract(sin(floor(u_time * 30.0) * 43758.5453) * 0.5 + 0.5));
  float lightning = lightningTrigger * lightningFlicker;

  // Lightning bolt — jagged line from top
  float boltX = snoise(vec2(floor(u_time * 8.0), 0.0)) * 0.3;
  float boltDist = abs(uv.x - boltX - snoise(vec2(uv.y * 8.0, floor(u_time * 8.0))) * 0.08);
  float bolt = smoothstep(0.015, 0.0, boltDist) * smoothstep(-0.2, 0.8, uv.y);
  float boltGlow = smoothstep(0.15, 0.0, boltDist) * smoothstep(-0.2, 0.8, uv.y) * 0.3;
  vec3 boltColor = palette(0.65 + paletteShift, vec3(0.7, 0.7, 0.9), vec3(0.3, 0.3, 0.2),
    vec3(1.0, 1.0, 1.0), vec3(0.0, 0.1, 0.3));
  color += (bolt + boltGlow) * boltColor * lightning;

  // Flash illumination on whole scene
  color += lightning * 0.15 * vec3(0.6, 0.65, 0.9);

  // Rain layers with parallax depth (5 layers)
  float rainAccum = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float layerDepth = 0.3 + fi * 0.15;
    float speed = 3.0 + fi * 1.5 + u_amplitude * 2.0;
    float density = 15.0 + fi * 8.0;
    float thickness = 0.012 - fi * 0.0015;

    // Wind sway from treble
    float wind = u_treble * 0.08 * sin(u_time * 2.0 + fi);

    vec2 rainUV = uv * vec2(density, 1.0);
    rainUV.x += fi * 7.7 + wind * uv.y * 5.0;
    float columnId = floor(rainUV.x);
    float columnRand = fract(sin(columnId * 127.1 + fi * 311.7) * 43758.5453);

    // Vertical rain streak
    float rainY = fract(uv.y * (1.0 + fi * 0.3) + u_time * speed + columnRand * 10.0);
    float streak = smoothstep(0.0, 0.3, rainY) * smoothstep(0.7, 0.3, rainY);
    float rainX = abs(fract(rainUV.x) - 0.5);
    streak *= smoothstep(thickness, 0.0, rainX);
    streak *= columnRand > 0.3 ? 1.0 : 0.0; // random dropout

    // Fade with depth
    streak *= layerDepth;
    rainAccum += streak * 0.15;
  }

  vec3 rainColor = palette(0.55 + paletteShift, vec3(0.4, 0.45, 0.6), vec3(0.2, 0.2, 0.3),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color += rainAccum * rainColor;

  // Splash ripples on the ground surface
  float groundLine = smoothstep(-0.35, -0.4, uv.y);
  if (uv.y < -0.3) {
    vec2 splashUV = vec2(uv.x * 6.0, (uv.y + 0.35) * 20.0);
    float splashRing = 0.0;
    for (int s = 0; s < 8; s++) {
      float fs = float(s);
      vec2 center = vec2(
        snoise(vec2(fs * 17.3, floor(u_time * 3.0 + fs))) * 3.0,
        snoise(vec2(fs * 31.7, floor(u_time * 3.0 + fs) + 100.0)) * 0.5
      );
      float age = fract(u_time * 2.0 + fs * 0.37);
      float radius = age * 0.8;
      float ring = abs(length(splashUV - center) - radius);
      ring = smoothstep(0.08, 0.0, ring) * (1.0 - age);
      splashRing += ring * 0.3;
    }
    vec3 splashColor = palette(0.45 + paletteShift, vec3(0.3, 0.35, 0.5), vec3(0.15, 0.15, 0.25),
      vec3(1.0, 1.0, 1.0), vec3(0.4, 0.5, 0.65));
    color = mix(color, splashColor, groundLine * 0.5);
    color += splashRing * splashColor * groundLine;
  }

  // Mist at ground level — bass-reactive density
  float mistDensity = 0.3 + u_bass * 0.3;
  float mist = smoothstep(0.1, -0.4, uv.y);
  float mistNoise = fbm(vec2(uv.x * 3.0 + t, uv.y * 2.0) * 2.0) * 0.5 + 0.5;
  mist *= mistNoise * mistDensity;
  vec3 mistColor = palette(0.2 + paletteShift, vec3(0.15, 0.15, 0.2), vec3(0.1, 0.1, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.45, 0.5, 0.6));
  color = mix(color, mistColor, mist);

  // Mid-frequency wind gusts — horizontal noise bands
  float gust = snoise(vec2(uv.x * 2.0 + u_time * 3.0, uv.y * 0.5)) * u_mid * 0.08;
  color += gust * rainColor;

  // Treble sparkle — tiny bright dots like light catching droplets
  float sparkleGrid = snoise(uv * 40.0 + u_time * 5.0);
  float sparkle = smoothstep(0.85, 0.95, sparkleGrid) * u_treble * 0.4;
  color += sparkle * vec3(0.6, 0.65, 0.8);

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.8;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
