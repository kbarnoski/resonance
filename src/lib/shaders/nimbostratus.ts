import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Nimbostratus — Heavy rain clouds with internal lightning illumination

// 4-octave fbm for cloud billowing
float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Cloud mass — heavy layered stratus
  vec2 cloudUV = uv * 1.8 + vec2(t * 0.4, t * 0.15);
  float cloud1 = fbm4(cloudUV);
  float cloud2 = fbm4(cloudUV * 0.7 + vec2(20.0, 10.0));
  float cloudMass = smoothstep(-0.3, 0.5, cloud1 * 0.55 + cloud2 * 0.45);

  // Cloud thickness variation — denser areas
  float thickness = smoothstep(0.2, 0.7, cloudMass);

  // Internal lightning — sporadic flashes that illuminate clouds from within
  float flashPhase1 = sin(t * 10.0) * sin(t * 7.3);
  float flash1 = pow(max(flashPhase1, 0.0), 12.0);

  float flashPhase2 = sin(t * 13.0 + 2.0) * sin(t * 9.1 + 1.0);
  float flash2 = pow(max(flashPhase2, 0.0), 12.0);

  // Flash positions — moves around inside the cloud
  vec2 flashPos1 = vec2(sin(floor(t * 4.0) * 3.7) * 0.25, cos(floor(t * 4.0) * 2.3) * 0.15 + 0.1);
  vec2 flashPos2 = vec2(cos(floor(t * 4.0 + 1.5) * 2.9) * 0.3, sin(floor(t * 4.0 + 1.5) * 4.1) * 0.12);

  // Light diffusion through cloud — exponential falloff from flash point
  float illum1 = exp(-length(uv - flashPos1) * 3.0) * flash1 * thickness;
  float illum2 = exp(-length(uv - flashPos2) * 2.5) * flash2 * thickness;
  float illumination = (illum1 + illum2 * 0.7);
  illumination *= (0.5 + u_bass * 0.8);

  // Rain — vertical streaks falling from cloud base
  float cloudBase = smoothstep(0.3, 0.1, uv.y + cloud1 * 0.1);
  float rain = snoise(vec2(uv.x * 25.0, uv.y * 2.0 - u_time * 5.0));
  rain = pow(max(rain, 0.0), 4.0) * cloudBase * 0.3;
  rain *= (0.5 + u_mid * 0.4);

  // Heavy rain bands — larger-scale density variation
  float rainBand = sin(uv.x * 6.0 + t * 3.0 + fbm4(uv * 0.8) * 2.0) * 0.5 + 0.5;
  rainBand *= cloudBase * 0.2;

  // Virga — wispy rain that evaporates before reaching ground
  float virga = snoise(vec2(uv.x * 4.0 + t * 0.8, uv.y * 1.5 - t * 1.0));
  virga = smoothstep(0.1, 0.5, virga) * smoothstep(-0.3, -0.1, uv.y) * smoothstep(-0.5, -0.3, uv.y);
  virga *= 0.15;

  // Cloud edge detail
  float edgeDetail = fbm4(cloudUV * 2.5 + vec2(40.0));
  float cloudEdge = smoothstep(0.3, 0.5, cloudMass) - smoothstep(0.5, 0.7, cloudMass);

  // ── Color ──
  // Dark sky behind clouds
  vec3 darkSky = palette(
    t * 0.03,
    vec3(0.03, 0.03, 0.05),
    vec3(0.02, 0.03, 0.06),
    vec3(0.3, 0.3, 0.5),
    vec3(0.10, 0.10, 0.20)
  );

  // Heavy cloud body — dark grey with purple undertone
  vec3 cloudColor = palette(
    cloudMass * 0.2 + thickness * 0.15 + t * 0.04,
    vec3(0.08, 0.07, 0.10),
    vec3(0.06, 0.06, 0.09),
    vec3(0.4, 0.38, 0.55),
    vec3(0.12, 0.10, 0.22)
  );

  // Illuminated cloud — warm flash light diffused through cloud
  vec3 flashColor = palette(
    illumination * 0.4 + t * 0.06 + u_amplitude * 0.15,
    vec3(0.35, 0.30, 0.45),
    vec3(0.25, 0.22, 0.35),
    vec3(0.6, 0.55, 0.8),
    vec3(0.15, 0.12, 0.30)
  );

  // Rain color — slightly lighter than surroundings
  vec3 rainColor = palette(
    rain * 0.3 + t * 0.05,
    vec3(0.10, 0.10, 0.14),
    vec3(0.06, 0.06, 0.10),
    vec3(0.35, 0.38, 0.55),
    vec3(0.12, 0.14, 0.25)
  );

  // Build
  vec3 color = darkSky;

  // Cloud mass
  color = mix(color, cloudColor, cloudMass * 0.8);

  // Cloud edge detail
  color += cloudColor * cloudEdge * edgeDetail * 0.1;

  // Internal lightning illumination
  color = mix(color, flashColor, illumination * 0.7);

  // Flash bloom — brightens entire scene slightly
  float bloom = (flash1 + flash2 * 0.5) * 0.08 * (0.4 + u_bass * 0.4);
  color += flashColor * bloom;

  // Rain
  color += rainColor * rain;
  color += rainColor * rainBand;

  // Virga
  color += cloudColor * virga * 0.5;

  // Vignette — heavy, oppressive
  float vignette = 1.0 - smoothstep(0.35, 1.25, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
