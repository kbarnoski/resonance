import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// The divine as absence: a dark void that somehow radiates more than light,
// negative space that glows — luminous edges around deep nothingness.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // The void — central dark region that breathes
  float breath = 1.0 + 0.15 * sin(t * 2.0) + u_bass * 0.1;
  float voidR = 0.25 * breath;

  // FBM-shaped void boundary — organic, not circular
  float voidNoise = snoise(vec2(a * 2.0, t * 0.3)) * 0.08
                  + snoise(vec2(a * 4.0, t * 0.5 + 3.0)) * 0.04;
  float voidEdge = voidR + voidNoise;
  float voidMask = smoothstep(voidEdge + 0.05, voidEdge - 0.02, r);

  // The paradox: the void ABSORBS color, creating darkness
  // but its edges RADIATE intensely — brighter than anywhere else
  float edgeGlow = smoothstep(0.08, 0.0, abs(r - voidEdge)) * (1.5 + u_mid * 0.5);

  // Secondary edge — softer outer aura
  float outerAura = smoothstep(0.2, 0.0, abs(r - voidEdge - 0.08)) * 0.4;

  // Radiating presence from the boundary — sacred geometry
  float rayCount = 16.0;
  float rayAngle = mod(a + t * 0.2, 6.28318 / rayCount) - 3.14159 / rayCount;
  float ray = smoothstep(0.03, 0.0, abs(rayAngle)) * smoothstep(voidEdge, voidEdge + 0.4, r);
  ray *= exp(-(r - voidEdge) * 3.0);

  // Noise texture in the luminous field outside the void
  float field = fbm(uv * 3.5 + vec2(t * 0.12, -t * 0.08));
  float fieldMask = smoothstep(-0.2, 0.4, field) * (1.0 - voidMask);

  // Concentric ripples emanating from void boundary
  float ripple = sin((r - voidEdge) * 30.0 - t * 4.0);
  ripple = smoothstep(0.3, 0.8, ripple * 0.5 + 0.5);
  ripple *= smoothstep(0.0, 0.05, r - voidEdge) * exp(-(r - voidEdge) * 4.0);

  // The void is not empty — it has faint internal structure
  float innerStir = snoise(rot2(t * 0.4) * uv * 4.0 + t * 0.2);
  innerStir = smoothstep(0.4, 0.6, innerStir * 0.5 + 0.5) * voidMask * 0.05;

  // Palette — the edge light is golden-white, outer field is deep violet
  vec3 edgeCol = palette(
    a * 0.1 + paletteShift,
    vec3(0.85, 0.8, 0.65),
    vec3(0.2, 0.2, 0.15),
    vec3(1.0, 0.95, 0.8),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 fieldCol = palette(
    field * 0.5 + paletteShift + 0.5,
    vec3(0.3, 0.25, 0.45),
    vec3(0.3, 0.25, 0.35),
    vec3(0.7, 0.8, 1.1),
    vec3(0.25, 0.1, 0.4)
  );

  vec3 rayCol = palette(
    a * 0.08 + paletteShift + 0.2,
    vec3(0.6, 0.55, 0.4),
    vec3(0.35, 0.3, 0.25),
    vec3(1.0, 0.9, 0.6),
    vec3(0.0, 0.1, 0.2)
  );

  // Compose
  color += edgeCol * edgeGlow;
  color += edgeCol * outerAura;
  color += rayCol * ray * (0.6 + 0.4 * u_treble);
  color += fieldCol * fieldMask * 0.25 * (0.5 + 0.5 * u_mid);
  color += edgeCol * ripple * 0.5;
  color += vec3(0.15, 0.1, 0.25) * innerStir; // faint void stirring

  // The void absorbs — darken center
  color *= (1.0 - voidMask * 0.85);

  // But it also paradoxically glows faintly at its very center
  float deepCore = exp(-r * r * 40.0) * 0.08 * (0.5 + 0.5 * sin(t * 3.0));
  color += edgeCol * deepCore;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
