import { U } from "./shared";

export const FRAG =
  U +
  `
// Resonant Rings — soft concentric circles breathing smoothly with the
// music (Karel 2026-09-30: "circular shapes expanding and contracting
// smoothly to the music def works"). Radii ride u_bass (already a
// slewed envelope upstream — motion is a breath, never a snap); rims
// are dusted with glitter that shimmers on u_treble. No fill, no
// gradient wash — thin luminous rims on darkness.

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  // CONSTANT shared anchor (Karel 2026-09-30: "circles if layered
  // should have the same centerpoint so the circles stay concentric")
  // — every instance of this shader, on any layer, centers here.
  vec2 c = vec2(-0.08, 0.05);
  vec2 p = uv - c;
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec3 col = vec3(0.0);

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Each ring breathes with the bass at its own depth and phase —
    // the set expands and contracts like a chord, not a piston.
    float breathe = u_bass * (0.16 + fi * 0.05);
    float radius = 0.16 + fi * 0.17 + breathe + sin(u_time * 0.11 + fi * 1.7) * 0.02;
    float d = abs(r - radius);
    // Thin soft rim.
    float rim = smoothstep(0.014, 0.0, d) * 0.55 + smoothstep(0.09, 0.0, d) * 0.10;
    // Mid warms the inner rings' hue toward gold; outer stay teal.
    vec3 teal = vec3(0.30, 0.85, 0.88);
    vec3 gold = vec3(0.95, 0.82, 0.55);
    vec3 ringCol = mix(teal, gold, u_mid * (1.0 - fi * 0.2));
    float fade = 1.0 - fi * 0.14;
    col += ringCol * rim * fade * 0.5;

    // Glitter dust on the rim — treble makes it shimmer.
    float cells = 90.0 + fi * 30.0;
    float a = ang * cells / 6.28318;
    float cell = floor(a);
    float h = hash(cell * 13.7 + fi * 101.3);
    if (h < 0.34) {
      float sparkD = length(vec2(d, fract(a) - 0.5) * vec2(1.0, 6.28318 * radius / cells));
      float tw = 0.4 + 0.6 * sin(u_time * (3.0 + h * 6.0) * (0.5 + u_treble * 1.4) + h * 40.0);
      col += ringCol * smoothstep(0.012, 0.0, sparkD) * tw * 0.8;
    }
  }


  // 8-bit dither — soft glow gradients band without it (Karel 2026-09-30).
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
