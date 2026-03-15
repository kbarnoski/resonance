import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite twilight — sun just below the horizon, atmospheric scatter
// painting infinite gradient bands across the sky that stretch forever.

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  float paletteShift = u_amplitude * 0.27;

  // ── Atmospheric scatter geometry ──
  // The sun is below the horizon: its position drives the scatter angle.
  float sunX   = sin(t * 0.4) * 0.6;                     // gentle lateral drift
  float sunY   = -0.18 - u_bass * 0.05;                  // just below edge
  vec2 sunPos  = vec2(sunX, sunY);
  vec2 toSun   = uv - sunPos;
  float sunDist = length(toSun);

  // Elevation angle (0 = horizon, 1 = zenith)
  float elevation = (uv.y + 0.5);                         // -0.5..1.5 mapped to 0..1
  elevation = clamp(elevation, 0.0, 1.0);

  // ── Rayleigh scatter — colors the sky band by band ──
  // Lower sky is orange/red/magenta, upper fades to deep indigo.
  float scatter = pow(1.0 - elevation, 3.5);              // strong at horizon
  float scatter2 = pow(1.0 - elevation, 1.5);

  // Mie scatter — cone of warm light around the sub-horizon sun
  float mie = pow(max(0.0, 1.0 - sunDist * 1.8), 4.0) * (0.5 + u_bass * 0.5);

  // ── Sky color — three palette bands ──
  // Band 1: deep upper atmosphere
  vec3 zenithCol = palette(
    elevation * 0.4 + t * 0.08 + paletteShift + 0.7,
    vec3(0.08, 0.06, 0.18),
    vec3(0.12, 0.08, 0.22),
    vec3(0.4, 0.3, 0.7),
    vec3(0.1, 0.05, 0.3)
  );

  // Band 2: mid-sky twilight
  vec3 midCol = palette(
    scatter2 * 0.6 + t * 0.06 + paletteShift + 0.2,
    vec3(0.45, 0.22, 0.30),
    vec3(0.35, 0.18, 0.28),
    vec3(0.7, 0.5, 0.6),
    vec3(0.0, 0.05, 0.15)
  );

  // Band 3: low horizon glow — the warmest zone
  vec3 horizonCol = palette(
    scatter * 0.8 + mie * 0.3 + paletteShift,
    vec3(0.65, 0.38, 0.20),
    vec3(0.30, 0.20, 0.15),
    vec3(0.8, 0.6, 0.4),
    vec3(0.0, 0.02, 0.08)
  );

  // Blend sky top-to-bottom using elevation
  vec3 skyColor = mix(horizonCol, midCol, smoothstep(0.0, 0.35, elevation));
  skyColor      = mix(skyColor,   zenithCol, smoothstep(0.3, 0.8, elevation));

  // ── Mie glow around sub-horizon sun ──
  vec3 mieCol = palette(
    mie * 0.5 + paletteShift + 0.1,
    vec3(0.9, 0.7, 0.5),
    vec3(0.1, 0.1, 0.05),
    vec3(0.6, 0.4, 0.3),
    vec3(0.0, 0.02, 0.05)
  );
  skyColor += mieCol * mie * 1.2;

  // ── Light crepuscular rays from below the horizon ──
  float rayAngle = atan(toSun.y, toSun.x);
  float rayStr = sin(rayAngle * 9.0 + t * 0.8) * 0.5 + 0.5;
  rayStr *= sin(rayAngle * 14.0 - t * 0.5) * 0.5 + 0.5;
  rayStr  = pow(rayStr, 2.5);
  float rayFade = exp(-sunDist * 2.2) * smoothstep(-0.3, 0.1, -uv.y + sunY) * 0.0;
  // Rays visible just above horizon, fan upward
  float rayVis = exp(-abs(uv.y - sunY) * 6.0) * step(sunY, uv.y) * (0.4 + u_mid * 0.6);
  rayFade = exp(-sunDist * 1.5) * rayVis;
  skyColor += mieCol * rayStr * rayFade * 0.5;

  // ── Atmospheric haze — fbm bands along the horizon ──
  float hazeNoise = fbm(vec2(uv.x * 2.5 + t * 0.2, elevation * 3.0)) * 0.5 + 0.5;
  float hazeMask  = exp(-elevation * 5.0) * hazeNoise * (0.5 + u_amplitude * 0.3);
  skyColor += horizonCol * hazeMask * 0.25;

  // ── Earth / silhouette at absolute bottom ──
  float groundLine = smoothstep(-0.42, -0.52, uv.y);
  vec3 groundCol = vec3(0.02, 0.01, 0.03);
  skyColor = mix(skyColor, groundCol, groundLine);

  // Horizon edge glow
  float horizEdge = exp(-abs(uv.y + 0.42) * 30.0) * (0.5 + u_bass * 0.5);
  skyColor += horizonCol * horizEdge * 0.6;

  // Treble: faint stars in upper sky
  vec2 starUV = uv * 7.0;
  vec2 sId = floor(starUV);
  float sH = fract(sin(dot(sId, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.94, sH) * smoothstep(0.4, 0.9, elevation);
  float sDist = length(fract(starUV) - 0.5);
  float starGlow = smoothstep(0.04, 0.0, sDist) * star;
  float twinkle = sin(t * 15.0 + sH * 80.0) * 0.3 + 0.7;
  skyColor += vec3(0.95, 0.92, 1.0) * starGlow * twinkle * u_treble * 0.8;

  // Vignette
  float vignette = 1.0 - smoothstep(0.55, 1.4, length(uv));
  skyColor *= vignette;

  gl_FragColor = vec4(skyColor, 1.0);
}
`;
