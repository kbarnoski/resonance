import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + SDF_PRIMITIVES + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.28;

  // Look up from ground — perspective projection
  // uv.y remapped so we're looking upward into sky
  vec2 uvP = uv;
  uvP.y += 0.25; // shift horizon down so we look up

  // Monolith: a tall thin rectangle centered
  // Width driven by bass, it looms
  float monoWidth = 0.08 + u_bass * 0.02;
  // In perspective: the top vanishes up
  // Map uv to a corridor-space: x is side, y is depth toward top
  float distFromCenter = abs(uvP.x);
  float perspY = uvP.y; // negative = below horizon, positive = the monolith rising

  // The monolith edges converge as we look up
  // At height h, half-width = monoWidth / (1 + h * perspectiveStrength)
  float perspStrength = 1.8 + u_bass * 0.4;
  float halfW = monoWidth / (1.0 + max(perspY, 0.0) * perspStrength);

  // SDF for the monolith face
  float monoSDF = distFromCenter - halfW;

  // Fog/darkness rising with height — the top vanishes into void
  float heightFog = exp(-max(perspY, 0.0) * (1.2 + u_mid * 0.5));

  // Interior of monolith: very dark, near-black obsidian surface
  // Surface detail: faint vertical striations from fbm
  vec2 surfaceUV = vec2(uvP.x / halfW, perspY * (1.0 + perspStrength * 0.5));
  float surfaceDetail = fbm(surfaceUV * 3.0 + t * 0.3) * 0.15;
  float edgeGlow = exp(-abs(monoSDF) * 18.0) * heightFog;

  // Sky above: absolute darkness with faint stars from treble noise
  float starField = 0.0;
  if (uvP.y > 0.0) {
    vec2 starUV = uvP * 12.0 + t * 0.05;
    float star = snoise(starUV) * snoise(starUV * 2.3 + 1.7);
    starField = smoothstep(0.3, 0.5, star) * 0.04 * u_treble * (1.0 - smoothstep(0.0, 0.3, perspY));
  }

  // Ground plane below horizon — flat dark stone
  float groundLine = smoothstep(-0.01, 0.01, -uvP.y - 0.02);
  float groundRipple = fbm(vec2(uvP.x * 4.0, t) + vec2(0.0, uvP.y * -8.0)) * 0.06;

  // Atmospheric fog that wraps the base — bass driven
  float baseFog = exp(-abs(uvP.y + 0.1) * 6.0) * (0.3 + u_bass * 0.4);

  // Colors — deep, crushing palette
  // Monolith core: near black with cold blue edge
  vec3 monoColor = palette(surfaceDetail + paletteShift,
    vec3(0.02, 0.02, 0.04),
    vec3(0.04, 0.06, 0.12),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.3));

  // Edge glow: cold violet-blue
  vec3 glowColor = palette(0.65 + paletteShift + u_mid * 0.1,
    vec3(0.0, 0.0, 0.02),
    vec3(0.1, 0.05, 0.2),
    vec3(1.0, 1.0, 1.0),
    vec3(0.6, 0.7, 0.9));

  // Sky / void color
  vec3 voidColor = palette(0.8 + paletteShift,
    vec3(0.0, 0.0, 0.01),
    vec3(0.02, 0.01, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.2, 0.5));

  // Ground mist
  vec3 mistColor = palette(0.55 + paletteShift + u_bass * 0.15,
    vec3(0.01, 0.01, 0.03),
    vec3(0.06, 0.04, 0.1),
    vec3(1.0, 1.0, 1.0),
    vec3(0.3, 0.5, 0.7));

  vec3 color = voidColor;

  // Place monolith
  float inMonolith = 1.0 - smoothstep(0.0, 0.003, monoSDF);
  float monoMask = step(0.0, uvP.y - 0.02); // only above ground
  color = mix(color, monoColor * heightFog, inMonolith * monoMask);
  color += glowColor * edgeGlow * 0.6 * monoMask;

  // Ground
  color = mix(color, mistColor * (0.3 + groundRipple), groundLine);

  // Base atmosphere fog — bass breathing
  color += mistColor * baseFog * 0.5;

  // Stars
  color += starField;

  // Vignette — crushingly heavy
  float dist = length(uv);
  float vignette = 1.0 - smoothstep(0.3, 1.4, dist);
  vignette = pow(vignette, 2.2);
  color *= vignette;

  // Extra darkness at top corners — the void
  float cornerDark = smoothstep(0.4, 1.2, length(uv * vec2(1.0, 0.6) + vec2(0.0, 0.3)));
  color *= 1.0 - cornerDark * 0.7;

  gl_FragColor = vec4(color, 1.0);
}`;
