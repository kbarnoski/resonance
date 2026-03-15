import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.30;

  vec3 color = vec3(0.0);
  float transmittedLight = 1.0; // how much light gets through all layers

  // ── Stack of translucent biological membranes at increasing depths ──
  // Each membrane:
  //  - Has a slightly different curvature (FBM surface) — varies with audio
  //  - Catches light differently based on viewing angle vs surface normal
  //  - Absorbs and tints the light passing through it
  //  - Has thickness variation creating interference colors (like soap bubbles)

  int NUM_MEMBRANES = 7;

  for (int m = 0; m < 7; m++) {
    float mf = float(m);
    float depthFrac = mf / 6.0; // 0=nearest, 1=deepest

    // Each membrane has its own drift and oscillation
    float driftSpeed = 0.04 + mf * 0.015;
    float memPhase = mf * 1.73; // golden ratio spacing in phase

    vec2 drift = vec2(
      sin(t * driftSpeed + memPhase) * 0.08,
      cos(t * driftSpeed * 0.7 + memPhase) * 0.06
    );

    // Membrane surface — FBM at different spatial frequencies per layer
    float spatialFreq = 1.5 + mf * 0.7;
    float timeWarp = t * (0.3 + mf * 0.05);

    // The membrane surface as a height field (viewed nearly face-on)
    float surface = fbm(uv * spatialFreq + drift + timeWarp);
    float surface2 = fbm(uv * spatialFreq * 2.1 - drift * 1.3 + timeWarp * 0.7 + surface * 0.3);

    // Combined surface height
    float h = surface * 0.6 + surface2 * 0.4;
    h = h * 0.5 + 0.5; // remap to [0,1]

    // ── Thickness variation ──
    // Thin regions: strong iridescence (like a thinning soap film)
    // Thick regions: deeper, more opaque color
    float thickness = h * 0.5 + 0.3; // [0.3, 0.8] relative thickness

    // ── Surface normal from height gradient ──
    float eps = 0.012;
    float hL = fbm((uv - vec2(eps, 0.0)) * spatialFreq + drift + timeWarp);
    float hR = fbm((uv + vec2(eps, 0.0)) * spatialFreq + drift + timeWarp);
    float hD = fbm((uv - vec2(0.0, eps)) * spatialFreq + drift + timeWarp);
    float hU = fbm((uv + vec2(0.0, eps)) * spatialFreq + drift + timeWarp);
    vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * eps);
    float normalTilt = length(grad); // how much the membrane tilts from flat

    // ── Fresnel-like reflection at edges/tilted regions ──
    // Tilted membrane = more reflective, less transmissive
    float fresnel = pow(normalTilt * 2.0, 1.5);
    fresnel = clamp(fresnel, 0.0, 1.0);

    // ── Thin-film interference colors ──
    // Phase depends on thickness * depth index and viewing
    float interferencePhase = thickness * 12.0 + mf * 1.1 + t * 0.15;
    float thinFilmR = 0.5 + 0.5 * sin(interferencePhase * 2.3);
    float thinFilmG = 0.5 + 0.5 * sin(interferencePhase * 2.3 + 2.09);
    float thinFilmB = 0.5 + 0.5 * sin(interferencePhase * 2.3 + 4.19);
    vec3 thinFilmColor = vec3(thinFilmR, thinFilmG, thinFilmB);

    // ── Membrane bulk color — biological tint ──
    vec3 bulkColor = palette(
      h * 0.7 + mf * 0.08 + t * 0.02 + paletteShift + depthFrac * 0.3,
      vec3(0.45, 0.50, 0.55),
      vec3(0.30, 0.35, 0.40),
      vec3(0.8, 0.9, 1.0),
      vec3(0.0, 0.15, 0.35)
    );

    // Deep membranes shift toward warmer biological tones
    vec3 warmTint = palette(
      h * 0.5 + mf * 0.12 + paletteShift + 0.45,
      vec3(0.5, 0.45, 0.40),
      vec3(0.30, 0.28, 0.25),
      vec3(0.9, 0.8, 0.6),
      vec3(0.05, 0.1, 0.2)
    );
    bulkColor = mix(bulkColor, warmTint, depthFrac * 0.6);

    // ── Mid frequencies ripple the membrane tension ──
    float tensionRipple = sin(uv.x * 8.0 + t * 2.5 + mf) * 0.5 + 0.5;
    tensionRipple *= u_mid * 0.3;
    thinFilmColor = mix(thinFilmColor, thinFilmColor * 1.3, tensionRipple);

    // ── Bass causes membrane to bulge and strain ──
    float bassStrain = u_bass * 0.4 * (1.0 - depthFrac);
    thickness += bassStrain * 0.3;
    fresnel += bassStrain * 0.2;
    fresnel = clamp(fresnel, 0.0, 1.0);

    // ── Opacity: near membranes are more translucent, deep ones accumulate ──
    float opacity = mix(0.12, 0.25, depthFrac) * (0.8 + thickness * 0.4);

    // ── Light catching: reflected light at tilt ──
    // Treble = light sparkle on surface normals
    float trebleAct = smoothstep(0.05, 0.5, u_treble);
    float sparkle = fresnel * trebleAct;

    // ── Per-membrane contribution ──
    vec3 membraneColor = mix(bulkColor, thinFilmColor, clamp(fresnel + (1.0 - thickness) * 0.5, 0.0, 1.0));
    membraneColor += vec3(0.9, 1.0, 1.1) * sparkle * 0.5;

    // Layer compositing: membrane attenuates and tints light from behind
    color = color * (1.0 - opacity) + membraneColor * opacity * transmittedLight;
    transmittedLight *= (1.0 - opacity * 0.5);
  }

  // ── Deep infinite background ──
  // What lies beyond all membranes — a soft bioluminescent source
  vec3 deepLight = palette(
    t * 0.03 + paletteShift + 0.6,
    vec3(0.3, 0.5, 0.6),
    vec3(0.2, 0.4, 0.5),
    vec3(0.6, 1.0, 0.9),
    vec3(0.0, 0.15, 0.3)
  );
  float bgGlow = smoothstep(0.7, 0.0, length(uv)) * 0.4;
  color += deepLight * bgGlow * transmittedLight;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv * vec2(0.85, 1.0)));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
