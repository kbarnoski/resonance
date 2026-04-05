import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Tempest — Electrical storm: branching lightning with thunder-pulse bloom effects

// 3-octave fbm for cloud turbulence
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Lightning bolt — jagged branching path
float bolt(vec2 uv, vec2 start, vec2 end, float seed) {
  vec2 dir = end - start;
  float len = length(dir);
  vec2 n = normalize(dir);
  vec2 perp = vec2(-n.y, n.x);

  // Project uv onto bolt direction
  vec2 rel = uv - start;
  float along = dot(rel, n) / len;
  float across = dot(rel, perp);

  if (along < 0.0 || along > 1.0) return 0.0;

  // Jagged displacement
  float jag = snoise(vec2(along * 8.0 + seed, seed * 3.0 + u_time * 2.0)) * 0.08;
  jag += snoise(vec2(along * 20.0 + seed * 2.0, u_time * 5.0)) * 0.03;

  float dist = abs(across - jag);

  // Core glow — sharp bright center
  float core = exp(-dist * dist * 800.0);
  // Surrounding glow
  float glow = exp(-dist * dist * 40.0);

  // Fade at ends
  float fade = smoothstep(0.0, 0.05, along) * smoothstep(1.0, 0.9, along);

  return (core * 0.8 + glow * 0.4) * fade;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Storm clouds — dark turbulent masses
  vec2 cloudUV = uv * 1.5 + vec2(t * 0.3, t * 0.1);
  float clouds = fbm3(cloudUV);
  float clouds2 = fbm3(cloudUV * 1.8 + vec2(30.0));
  float cloudDensity = smoothstep(-0.2, 0.4, clouds * 0.6 + clouds2 * 0.4);

  // Thunder pulse — periodic flash that illuminates clouds
  float thunderPhase = sin(t * 8.0) * sin(t * 12.3) * sin(t * 5.7);
  float thunderPulse = pow(max(thunderPhase, 0.0), 8.0);
  thunderPulse *= (0.5 + u_bass * 0.8);

  // Lightning bolts — appear during thunder pulses
  float lightning = 0.0;

  // Main bolt
  float boltTrigger = step(0.6, thunderPulse);
  vec2 boltStart = vec2(sin(floor(t * 3.0) * 3.7) * 0.3, 0.5);
  vec2 boltEnd = vec2(sin(floor(t * 3.0) * 2.1) * 0.4, -0.4);
  lightning += bolt(uv, boltStart, boltEnd, floor(t * 3.0)) * boltTrigger;

  // Branch bolt
  vec2 branchStart = mix(boltStart, boltEnd, 0.4) + vec2(0.05, 0.0);
  vec2 branchEnd = branchStart + vec2(0.2, -0.25);
  lightning += bolt(uv, branchStart, branchEnd, floor(t * 3.0) + 10.0) * boltTrigger * 0.6;

  // Secondary bolt — slightly delayed
  float bolt2Trigger = step(0.7, thunderPulse);
  vec2 b2Start = vec2(cos(floor(t * 3.0 + 0.5) * 4.1) * 0.25, 0.45);
  vec2 b2End = vec2(cos(floor(t * 3.0 + 0.5) * 2.8) * 0.35, -0.35);
  lightning += bolt(uv, b2Start, b2End, floor(t * 3.0) + 20.0) * bolt2Trigger * 0.5;

  lightning *= (0.6 + u_treble * 0.6);

  // Cloud internal illumination — flash spreads through clouds
  float cloudIllum = thunderPulse * cloudDensity * 0.6;
  cloudIllum *= (0.5 + u_mid * 0.5);

  // Rain streaks
  float rain = snoise(vec2(uv.x * 30.0, uv.y * 3.0 - u_time * 4.0));
  rain = pow(max(rain, 0.0), 5.0) * 0.15 * (1.0 - cloudDensity * 0.5);

  // Wind-driven cloud motion
  float windStreak = snoise(vec2(uv.x * 0.5 + t * 1.5, uv.y * 3.0));
  windStreak = smoothstep(0.2, 0.5, windStreak) * 0.1;

  // ── Color ──
  // Dark storm sky
  vec3 stormSky = palette(
    clouds * 0.2 + t * 0.03,
    vec3(0.03, 0.03, 0.06),
    vec3(0.03, 0.04, 0.07),
    vec3(0.3, 0.3, 0.5),
    vec3(0.10, 0.12, 0.22)
  );

  // Storm cloud — dark purple-grey
  vec3 cloudColor = palette(
    cloudDensity * 0.3 + clouds2 * 0.15 + t * 0.04,
    vec3(0.06, 0.05, 0.10),
    vec3(0.05, 0.05, 0.10),
    vec3(0.4, 0.35, 0.6),
    vec3(0.12, 0.10, 0.25)
  );

  // Lightning color — blue-white electric
  vec3 lightningColor = vec3(0.7, 0.75, 1.0);

  // Thunder illumination color — warm flash
  vec3 flashColor = palette(
    thunderPulse * 0.3 + t * 0.05,
    vec3(0.25, 0.22, 0.35),
    vec3(0.20, 0.18, 0.30),
    vec3(0.5, 0.5, 0.8),
    vec3(0.15, 0.12, 0.30)
  );

  // Build sky
  vec3 color = mix(stormSky, cloudColor, cloudDensity * 0.7);

  // Wind streaks
  color += cloudColor * windStreak;

  // Cloud illumination from lightning
  color = mix(color, flashColor, cloudIllum);

  // Lightning bolts
  color += lightningColor * lightning;

  // Thunder bloom — entire scene brightens
  color += flashColor * thunderPulse * 0.15;

  // Rain
  color += vec3(0.3, 0.35, 0.45) * rain;

  // Vignette — heavier for storm mood
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
