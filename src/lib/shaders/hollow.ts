import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Hollow — empty vessel, dark interior with thin luminous edges

float sdEllipse(vec2 p, vec2 ab) {
  p = abs(p);
  if (p.x > p.y) { p = p.yx; ab = ab.yx; }
  float l = ab.y * ab.y - ab.x * ab.x;
  float m = ab.x * p.x / l;
  float n = ab.y * p.y / l;
  float m2 = m * m;
  float n2 = n * n;
  float c = (m2 + n2 - 1.0) / 3.0;
  float c3 = c * c * c;
  float q = c3 + m2 * n2 * 2.0;
  float d = c3 + m2 * n2;
  float g = m + m * n2;
  float co;
  if (d < 0.0) {
    float h = acos(q / c3) / 3.0;
    float s = cos(h);
    float tt = sin(h) * sqrt(3.0);
    float rx = sqrt(-c * (s + tt + 2.0) + m2);
    float ry = sqrt(-c * (s - tt + 2.0) + m2);
    co = (ry + sign(l) * rx + abs(g) / (rx * ry) - m) / 2.0;
  } else {
    float h = 2.0 * m * n * sqrt(d);
    float s = sign(q + h) * pow(abs(q + h), 1.0 / 3.0);
    float u = sign(q - h) * pow(abs(q - h), 1.0 / 3.0);
    float rx = -s - u - c * 4.0 + 2.0 * m2;
    float ry = (s - u) * sqrt(3.0);
    float rm = sqrt(rx * rx + ry * ry);
    co = (ry / sqrt(rm - rx) + 2.0 * g / rm - m) / 2.0;
  }
  vec2 r = ab * vec2(co, sqrt(1.0 - co * co));
  return length(r - p) * sign(p.y - r.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Vessel shape — a hollow form, vaguely like a chalice or urn
  // Outer shell
  float breath = sin(t * 0.4 + u_bass) * 0.02;
  vec2 outerSize = vec2(0.35 + breath, 0.45 + breath * 0.5);
  float outer = sdEllipse(uv - vec2(0.0, -0.05), outerSize);

  // Inner void — slightly smaller, creating thin walls
  vec2 innerSize = outerSize - vec2(0.025, 0.03);
  float inner = sdEllipse(uv - vec2(0.0, -0.03), innerSize);

  // The wall/shell
  float shell = max(outer, -inner);
  float shellMask = smoothstep(0.005, -0.005, shell);

  // The hollow interior
  float interiorMask = smoothstep(0.005, -0.005, inner);

  // Edge glow — luminous rim
  float outerEdge = smoothstep(0.02, 0.0, abs(outer));
  float innerEdge = smoothstep(0.015, 0.0, abs(inner));
  float edges = max(outerEdge, innerEdge);

  // Interior darkness — deep, with subtle noise
  float interiorNoise = fbm(uv * 4.0 + t * 0.05);
  float interiorDepth = interiorMask * (0.3 + interiorNoise * 0.2);

  // Echoes inside — faint reverberations
  float echo = sin(length(uv) * 15.0 + t * 0.5 + interiorNoise * 3.0);
  echo = smoothstep(0.6, 0.8, echo) * interiorMask * 0.03;

  // Shell texture
  float shellTex = fbm(uv * 12.0 + 0.5);

  // Colors
  vec3 shellColor = palette(shellTex * 0.3 + 0.5,
    vec3(0.015, 0.013, 0.018),
    vec3(0.02, 0.018, 0.025),
    vec3(1.0, 1.0, 1.0),
    vec3(0.3, 0.35, 0.5));

  vec3 edgeColor = palette(0.4 + u_amplitude * 0.15,
    vec3(0.03, 0.025, 0.04),
    vec3(0.06, 0.05, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.45, 0.65));

  vec3 interiorColor = palette(0.8,
    vec3(0.002, 0.002, 0.003),
    vec3(0.004, 0.003, 0.006),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.45, 0.65));

  vec3 echoColor = palette(0.35 + u_mid * 0.1,
    vec3(0.008, 0.008, 0.015),
    vec3(0.015, 0.012, 0.025),
    vec3(1.0, 1.0, 1.0),
    vec3(0.45, 0.5, 0.7));

  vec3 bgColor = vec3(0.004, 0.004, 0.006);

  // Compose
  vec3 color = bgColor;
  color = mix(color, interiorColor, interiorMask * 0.5);
  color += echoColor * echo * (1.0 + u_mid * 0.8);
  color = mix(color, shellColor, shellMask);
  color += edgeColor * edges * 0.1 * (1.0 + u_treble * 0.6);

  // Bass: the vessel resonates — edges brighten
  color += edgeColor * edges * u_bass * 0.04;

  // Faint exterior glow
  float extGlow = exp(-max(outer, 0.0) * 5.0) * 0.02;
  color += edgeColor * extGlow;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
