import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dark microscope field ──
  float bgN = fbm(uv * 1.5 + vec2(t * 0.03, -t * 0.02));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.4,
    vec3(0.01, 0.015, 0.03),
    vec3(0.015, 0.02, 0.04),
    vec3(0.3, 0.4, 0.6),
    vec3(0.0, 0.12, 0.3)
  );
  color = bgColor * (bgN * 0.08 + 0.03);

  // ── Diatom — slowly rotating radial structure ──
  float rotSpeed = 0.15;
  vec2 duv = rot2(t * rotSpeed) * uv;

  float r = length(duv);
  float angle = atan(duv.y, duv.x);

  // ── Outer silica shell — ornate circular edge ──
  float shellRadius = 0.38 + sin(angle * 16.0 + t * 0.3) * 0.01;
  shellRadius += sin(angle * 8.0 - t * 0.2) * 0.015;
  shellRadius *= (1.0 + u_bass * 0.05);

  float shellDist = abs(r - shellRadius);
  float shellEdge = smoothstep(0.008, 0.0, shellDist);
  float shellGlow = smoothstep(0.04, 0.0, shellDist);
  float insideShell = smoothstep(shellRadius + 0.01, shellRadius - 0.01, r);

  // Shell color — crystalline, iridescent silica
  float shellIridescence = sin(angle * 24.0 + r * 30.0 + t * 1.0) * 0.5 + 0.5;
  vec3 shellColor = palette(
    shellIridescence * 0.4 + angle * 0.1 + t * 0.02 + paletteShift,
    vec3(0.4, 0.45, 0.5),
    vec3(0.35, 0.4, 0.45),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.15, 0.35)
  );

  color += shellColor * (shellEdge * 1.2 + shellGlow * 0.2);

  // ── Inner radial ribs — radial symmetry pattern ──
  float numRibs = 32.0;
  float ribAngle = mod(angle + 3.14159, 6.28318) / 6.28318 * numRibs;
  float rib = abs(fract(ribAngle) - 0.5) * 2.0;
  rib = smoothstep(0.3, 0.35, rib); // thin rib lines
  rib = 1.0 - rib;

  // Ribs fade toward center and edge
  float ribFade = smoothstep(0.05, 0.12, r) * smoothstep(shellRadius, shellRadius - 0.08, r);
  rib *= ribFade * insideShell;

  vec3 ribColor = palette(
    angle * 0.15 + r * 0.5 + t * 0.03 + paletteShift + 0.3,
    vec3(0.35, 0.4, 0.45),
    vec3(0.3, 0.35, 0.4),
    vec3(0.7, 0.85, 1.0),
    vec3(0.0, 0.18, 0.4)
  );
  color += ribColor * rib * 0.5;

  // ── Concentric rings — growth rings inside the shell ──
  float rings = sin(r * 60.0 - t * 0.5) * 0.5 + 0.5;
  rings = pow(rings, 4.0) * insideShell;
  rings *= smoothstep(0.05, 0.1, r); // fade at center

  vec3 ringColor = palette(
    r * 1.5 + t * 0.04 + paletteShift + 0.5,
    vec3(0.3, 0.4, 0.5),
    vec3(0.25, 0.35, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.0, 0.2, 0.4)
  );
  color += ringColor * rings * 0.2;

  // ── Central raphe — the slit in the center ──
  float rapheDist = abs(duv.y) * smoothstep(0.2, 0.0, abs(duv.x));
  float rapheGlow = smoothstep(0.008, 0.0, rapheDist) * smoothstep(0.35, 0.0, r);
  vec3 rapheColor = palette(
    t * 0.06 + paletteShift + 0.7,
    vec3(0.5, 0.55, 0.4),
    vec3(0.4, 0.5, 0.35),
    vec3(0.9, 1.0, 0.7),
    vec3(0.0, 0.15, 0.25)
  );
  color += rapheColor * rapheGlow * 0.6;

  // ── Chloroplast glow — living green inside the cell ──
  float chloroN = snoise(duv * 8.0 + t * 0.3);
  float chloroGlow = smoothstep(0.2, 0.6, chloroN) * insideShell;

  vec3 chloroColor = palette(
    chloroN * 0.3 + paletteShift + 0.2,
    vec3(0.15, 0.35, 0.2),
    vec3(0.12, 0.3, 0.15),
    vec3(0.4, 0.9, 0.5),
    vec3(0.0, 0.2, 0.15)
  );
  color += chloroColor * chloroGlow * 0.2;

  // ── Areolae pattern — tiny pores in the silica frustule ──
  // Hexagonal pore pattern
  float poreScale = 35.0;
  vec2 poreUV = duv * poreScale;
  // Hex grid
  vec2 hex = vec2(poreUV.x + poreUV.y * 0.577, poreUV.y * 1.155);
  vec2 hexIdx = floor(hex);
  vec2 hexFrac = fract(hex) - 0.5;
  float poreDist = length(hexFrac);
  float pore = smoothstep(0.25, 0.2, poreDist);
  pore *= insideShell * ribFade;

  color += shellColor * pore * 0.15;

  // ── Bass: shell resonance pulse ──
  float shellPulse = sin(r * 40.0 - t * 3.0) * 0.5 + 0.5;
  shellPulse = pow(shellPulse, 5.0) * shellGlow;
  color += shellColor * shellPulse * u_bass * 0.4;

  // ── Mid: rib luminescence ──
  float ribPulse = sin(angle * numRibs + t * 4.0) * 0.5 + 0.5;
  ribPulse = pow(ribPulse, 6.0) * ribFade * insideShell;
  color += ribColor * ribPulse * u_mid * 0.3;

  // ── Treble: microscopic sparkle on shell surface ──
  float sparkle = snoise(duv * 40.0 + t * 2.0);
  sparkle = smoothstep(0.85, 1.0, sparkle) * u_treble * (shellGlow + insideShell * 0.3);
  color += vec3(0.6, 0.8, 1.0) * sparkle * 0.3;

  // ── Outer diffraction halo ──
  float haloDist = abs(r - shellRadius - 0.03);
  float halo = smoothstep(0.02, 0.0, haloDist) * 0.15;
  float haloColor2 = sin(angle * 6.0 + t * 0.5) * 0.5 + 0.5;
  color += shellColor * halo * (0.5 + haloColor2 * 0.5);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
