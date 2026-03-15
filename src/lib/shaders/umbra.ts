import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.25;

  // Infinite floor plane with perspective projection
  // Horizon is at y = horizon offset
  float horizon = 0.08 + u_bass * 0.04;
  float py = uv.y - horizon;

  vec3 color = vec3(0.0);

  if (py < 0.0) {
    // Floor plane — perspective
    float depth = horizon / (-py + 0.0001);
    depth = clamp(depth, 0.01, 80.0);

    vec2 floorUV = vec2(uv.x * depth * 0.5, depth * 0.5);
    floorUV += vec2(0.0, t * 1.5); // drift forward

    // SHADOW CASTERS: several "objects" (unseen) cast hard sharp shadows
    // We define shadow bands as sharp sinusoidal cutoffs on the floor plane
    // These are the shadows of objects we never see — infinite darkness above
    float shadowAngle1 = 1.2 + u_mid * 0.2;
    float shadowAngle2 = -0.8 + u_mid * 0.15;
    float shadowAngle3 = 2.1;

    // Projected shadow lines converging at vanishing points
    // Each shadow: a linear function in floor space that's hard clipped
    float s1 = floorUV.x * shadowAngle1 - floorUV.y * 0.3 + sin(t * 0.4) * 2.0;
    float s2 = floorUV.x * shadowAngle2 + floorUV.y * 0.2 + cos(t * 0.31 + 1.1) * 3.0;
    float s3 = -floorUV.x * 0.5 + floorUV.y * shadowAngle3 * 0.15 + sin(t * 0.22 + 2.3) * 4.0;

    // Sharp shadow mask — step-function hard shadows
    float hardness = 18.0 + u_bass * 8.0;
    float shadow1 = smoothstep(-0.02, 0.02, sin(s1 * 0.8)) ;
    float shadow2 = smoothstep(-0.015, 0.015, sin(s2 * 1.1));
    float shadow3 = smoothstep(-0.025, 0.025, sin(s3 * 0.6));

    // Additional: fbm-displaced shadow edge for some organic quality
    float noiseDisplace = fbm(floorUV * 0.4 + t * 0.1) * 0.3;
    float orgShadow = step(0.0, sin(floorUV.x * 0.7 + floorUV.y * 0.3 + noiseDisplace * 3.0));

    float totalShadow = min(shadow1 * shadow2, min(shadow3, orgShadow * 0.6 + 0.4));

    // Lit surface: warm single light source from ahead
    // But the surface itself is cold stone
    float stoneN = fbm(floorUV * 0.8 + t * 0.03) * 0.5 + 0.5;

    // Surface in light
    vec3 litColor = palette(stoneN * 0.15 + paletteShift,
      vec3(0.06, 0.05, 0.04),
      vec3(0.08, 0.07, 0.06),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.05, 0.12));

    // Surface in shadow — nearly black
    vec3 shadowColor = palette(0.7 + paletteShift,
      vec3(0.005, 0.004, 0.006),
      vec3(0.01, 0.008, 0.015),
      vec3(1.0, 1.0, 1.0),
      vec3(0.5, 0.6, 0.8));

    // Shadow boundary glow — the penumbra edge (very faint)
    float edgeMask = abs(sin(s1 * 0.8)) * (1.0 - abs(sin(s1 * 0.8)));
    edgeMask = max(edgeMask, abs(sin(s2 * 1.1)) * (1.0 - abs(sin(s2 * 1.1))));
    float edgeGlow = smoothstep(0.15, 0.5, edgeMask) * exp(-depth * 0.04);

    vec3 edgeColor = palette(0.1 + paletteShift + u_mid * 0.08,
      vec3(0.04, 0.02, 0.01),
      vec3(0.08, 0.04, 0.01),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.1, 0.2));

    color = mix(shadowColor, litColor, totalShadow);
    color += edgeColor * edgeGlow * 0.3;

    // Depth fog
    float fog = exp(-depth * 0.038);
    color *= fog;

    // Near-horizon haze: bass-driven murk
    float horizonFog = exp(-max(depth - 3.0, 0.0) * 0.15) * u_bass * 0.1;
    vec3 hazeColor = palette(0.68 + paletteShift,
      vec3(0.008, 0.006, 0.012),
      vec3(0.02, 0.015, 0.03),
      vec3(1.0, 1.0, 1.0),
      vec3(0.4, 0.5, 0.7));
    color += hazeColor * horizonFog;

    // Treble: micro-glint on lit surface edges
    float glint = snoise(floorUV * 8.0 + t) * u_treble * totalShadow * fog * 0.04;
    color += litColor * glint;

  } else {
    // Sky: pure void, tiny hint of ambient at horizon
    float skyFade = exp(-py * 10.0);
    vec3 skyColor = palette(0.72 + paletteShift,
      vec3(0.0),
      vec3(0.008, 0.006, 0.012),
      vec3(1.0, 1.0, 1.0),
      vec3(0.3, 0.4, 0.6));
    color = skyColor * skyFade * 0.4;
  }

  // Vignette
  float vd = length(uv);
  float vignette = pow(1.0 - smoothstep(0.15, 1.3, vd), 2.2);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
