import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Pyroclast — volcanic eruption debris, hot particles and ash clouds

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.25;

  // Eruption source — bottom center
  vec2 source = vec2(0.0, -0.4);
  vec2 fromSource = uv - source;
  float distFromSource = length(fromSource);
  float angleFromSource = atan(fromSource.y, fromSource.x);

  // Pyroclastic flow — expanding billowing cloud
  float flowExpand = 0.3 + u_bass * 0.15;
  float flowFront = flowExpand + fbm(vec2(angleFromSource * 3.0, t * 0.5)) * 0.15;
  float inFlow = smoothstep(flowFront + 0.1, flowFront - 0.05, distFromSource);

  // Ash cloud turbulence — multiple layers of billowing smoke
  float ashCloud = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 ashUV = fromSource * (2.0 + fi * 0.8);
    ashUV *= rot2(t * 0.1 * (1.0 - fi * 0.15));
    // Expand outward over time
    ashUV += normalize(fromSource + 0.001) * t * (0.3 + fi * 0.1);
    float ash = fbm(ashUV + fi * 7.3) * 0.5 + 0.5;
    ash = pow(ash, 1.2);
    ashCloud += ash * (0.4 - fi * 0.05) * inFlow;
  }

  // Hot debris particles — ejected rocks and lava bombs
  float particles = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Particles shoot upward and outward from source
    float pAngle = angleFromSource + fi * 0.8 + snoise(vec2(fi * 5.0, t * 0.3)) * 0.5;
    float pSpeed = 1.5 + fi * 0.5 + u_mid * 0.3;
    vec2 pDir = vec2(cos(pAngle), sin(pAngle));

    vec2 pUV = uv * (10.0 + fi * 5.0) - pDir * t * pSpeed;
    vec2 pid = floor(pUV);
    vec2 pf = fract(pUV) - 0.5;
    vec2 rnd = hash2(pid + fi * 19.0);
    float d = length(pf - (rnd - 0.5) * 0.3);
    float size = 0.03 + rnd.x * 0.05;

    // Only show particles in the eruption column area
    float columnMask = smoothstep(0.6, 0.1, abs(fromSource.x)) * step(source.y, uv.y);
    float particle = smoothstep(size, size * 0.2, d) * columnMask;

    // Gravity: particles arc downward over distance
    float gravFade = smoothstep(0.8, 0.3, distFromSource);
    particles += particle * gravFade * (0.5 - fi * 0.08);
  }

  // Lava glow at source
  float sourceGlow = exp(-distFromSource * 4.0) * (0.6 + u_bass * 0.5);
  float sourceFlicker = snoise(vec2(t * 3.0, 0.0)) * 0.2 + 0.8;
  sourceGlow *= sourceFlicker;

  // Colors
  // Ash cloud — dark gray with red underlighting
  vec3 ashColor = palette(
    ashCloud * 0.4 + paletteShift,
    vec3(0.12, 0.08, 0.06),
    vec3(0.1, 0.06, 0.04),
    vec3(0.6, 0.4, 0.3),
    vec3(0.05, 0.08, 0.12)
  );

  // Hot particles — glowing orange-yellow
  vec3 hotColor = palette(
    particles * 0.3 + paletteShift + 0.15,
    vec3(0.5, 0.25, 0.05),
    vec3(0.4, 0.2, 0.0),
    vec3(1.0, 0.7, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  // Source glow — white-hot
  vec3 glowColor = palette(
    sourceGlow * 0.3 + paletteShift + 0.3,
    vec3(0.6, 0.35, 0.1),
    vec3(0.4, 0.25, 0.05),
    vec3(1.0, 0.8, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Dark sky
  vec3 skyColor = palette(
    uv.y * 0.2 + paletteShift + 0.6,
    vec3(0.04, 0.03, 0.05),
    vec3(0.03, 0.02, 0.04),
    vec3(0.3, 0.2, 0.3),
    vec3(0.1, 0.05, 0.15)
  );

  // Compose
  vec3 color = skyColor;
  color = mix(color, ashColor, clamp(ashCloud, 0.0, 1.0));
  color += hotColor * particles * (0.8 + u_treble * 0.5);
  color += glowColor * sourceGlow;

  // Underlight the ash cloud from below (lava glow illuminates it)
  float underLight = exp(-distFromSource * 2.0) * ashCloud * 0.4;
  color += vec3(0.3, 0.1, 0.02) * underLight * (0.5 + u_bass * 0.5);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
