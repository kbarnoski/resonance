import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite waterfall — water sheets at multiple depths cascading downward,
// mist rising from an unseen base, spray catching light at all layers.

// Vertical flow noise — elongated turbulence for water streaks
float flowNoise(vec2 p) {
  // Compress horizontally, expand vertically to look like falling water
  return fbm(vec2(p.x * 3.5, p.y * 0.6));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.09;
  float paletteShift = u_amplitude * 0.29;

  // ── Perspective: map screen to world using vanishing-point fall ──
  // The waterfall falls vertically; center-x is the axis.
  // Distance from camera scales with uv.y (top = far, bottom = near).
  // Near the bottom the water is close, massive, fast.

  float fallSpeed = 1.4 + u_bass * 0.6;  // bass drives overall cascade speed

  // Five parallax depth layers — each at a different z-distance
  float totalWater = 0.0;
  float totalMist  = 0.0;

  for (int lyr = 0; lyr < 5; lyr++) {
    float fl     = float(lyr);
    float depth  = 1.0 + fl * 0.7;           // z-distance
    float speed  = fallSpeed / depth;         // closer = faster
    float scale  = 1.0 / depth;              // closer = coarser detail
    float alpha  = 1.0 / (1.0 + fl * 0.5);  // closer = more opaque

    // Lateral offset per layer for parallax
    float xOff = (fl - 2.0) * 0.08;

    // World UV on this layer's sheet
    vec2 wUV = vec2((uv.x + xOff) / scale, uv.y / scale - u_time * speed);

    // Water sheet — vertical flow noise
    float sheet = flowNoise(wUV);
    sheet = sheet * 0.5 + 0.5;
    sheet = pow(sheet, 1.5);

    // Streak highlights — thin vertical lines
    float streak = snoise(vec2(wUV.x * 8.0, wUV.y * 0.3 - u_time * speed * 0.5));
    streak = smoothstep(0.55, 0.75, streak) * 0.6;

    totalWater += (sheet + streak) * alpha;

    // Mist at the base — rises upward from bottom of screen
    float mistY   = -uv.y * depth * 0.5 - u_time * 0.15 / depth;
    float mistUV_x = (uv.x + xOff) * 2.0;
    float mist    = fbm(vec2(mistUV_x + fl * 7.3, mistY + fl * 3.1)) * 0.5 + 0.5;
    float mistMask = smoothstep(0.3, -0.6, uv.y) * alpha * 0.6;
    totalMist += mist * mistMask;
  }

  totalWater = clamp(totalWater / 3.5, 0.0, 1.0);
  totalMist  = clamp(totalMist  / 2.0, 0.0, 1.0);

  // ── Rock face behind waterfall — dark, textured ──
  float rock = fbm(uv * vec2(2.5, 1.5) + vec2(0.0, t * 0.05)) * 0.5 + 0.5;
  rock = pow(rock, 0.7);

  // ── Spray sparkle — treble-driven bright points ──
  float spray = snoise(uv * 25.0 + vec2(t * 3.0, u_time * 2.0));
  spray = pow(max(spray, 0.0), 5.0) * u_treble;
  // Spray is denser near the base
  spray *= smoothstep(0.4, -0.5, uv.y);

  // ── Color ──
  // Rock behind
  vec3 rockCol = palette(
    rock * 0.6 + t * 0.03 + paletteShift + 0.5,
    vec3(0.12, 0.10, 0.14),
    vec3(0.10, 0.08, 0.12),
    vec3(0.4, 0.3, 0.5),
    vec3(0.05, 0.02, 0.1)
  );

  // Water — cool blue-white, shifts with mid audio
  vec3 waterCol = palette(
    totalWater * 0.5 + u_mid * 0.2 + paletteShift + 0.1,
    vec3(0.45, 0.60, 0.70),
    vec3(0.25, 0.30, 0.40),
    vec3(0.5, 0.7, 0.9),
    vec3(0.05, 0.15, 0.3)
  );

  // Mist — lighter, more diffuse
  vec3 mistCol = palette(
    totalMist * 0.4 + paletteShift + 0.35,
    vec3(0.70, 0.75, 0.82),
    vec3(0.12, 0.10, 0.15),
    vec3(0.4, 0.5, 0.7),
    vec3(0.0, 0.05, 0.15)
  );

  // Build scene
  vec3 color = rockCol;
  color = mix(color, waterCol, totalWater * 0.85);
  color = mix(color, mistCol,  totalMist  * 0.6);
  color += vec3(0.9, 0.95, 1.0) * spray * 0.6;

  // Bass pulse — brightens the whole sheet momentarily
  color += waterCol * u_bass * 0.12;

  // Depth fog — top of the screen is high/far, slightly more muted
  float depthMist = smoothstep(-0.2, 0.7, uv.y);
  vec3 distantHaze = palette(
    depthMist * 0.4 + paletteShift + 0.55,
    vec3(0.55, 0.62, 0.72),
    vec3(0.10, 0.10, 0.15),
    vec3(0.3, 0.5, 0.7),
    vec3(0.0, 0.08, 0.2)
  );
  color = mix(color, distantHaze, depthMist * 0.35);

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
