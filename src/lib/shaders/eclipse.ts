import { U, VISIONARY_PALETTE, ROT2, SMOOTH_NOISE } from "./shared";

// Dark body with flaming corona, but the corona reveals infinite depth behind
// it — like looking through a ring-shaped window into eternity.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMOOTH_NOISE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.11;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Eclipse geometry
  float diskRadius = 0.18 + u_bass * 0.02;    // the dark body
  float coronaInner = diskRadius;
  float coronaOuter = diskRadius + 0.55 + u_amplitude * 0.1;

  float insideDisk = 1.0 - smoothstep(diskRadius - 0.005, diskRadius + 0.005, r);
  float inCorona = smoothstep(coronaInner, coronaInner + 0.01, r) *
                   (1.0 - smoothstep(coronaOuter, coronaOuter + 0.05, r));

  // ─── BEHIND THE ECLIPSE: infinite depth void ───
  // The disk occludes an infinitely deep space — simulate with polar vortex
  // This would be visible if we could see through, but here it peeks at corona edges

  // Corona FBM turbulence — solar-like flares
  float coronaNoise1 = fbm(vec2(angle * 1.8, r * 4.0 + t * 0.8) + vec2(t * 0.3, 0.0));
  float coronaNoise2 = fbm(vec2(angle * 3.5 + t * 0.4, r * 7.0 - t * 0.5));

  // Corona radial falloff from disk edge
  float coronaFall = exp(-(r - diskRadius) * 5.5) * inCorona;
  float coronaFall2 = exp(-(r - diskRadius) * 2.5) * inCorona;

  // Flares: localized bright jets shooting outward
  float flareAngle = abs(sin(angle * 6.0 + t * 0.7 + u_mid * 2.0));
  float flare = pow(flareAngle, 8.0 + u_bass * 4.0) * coronaFall * 2.0;

  // Corona glow — warm inner, cooler outer
  float coronaGlow = (coronaFall * (0.6 + coronaNoise1 * 0.5) +
                      coronaFall2 * coronaNoise2 * 0.3) * (0.8 + u_amplitude * 0.5);

  // ─── INFINITE DEPTH RING ───
  // At the very rim of the dark disk, a bright annular "window" to eternity
  float rimWidth = 0.012 + u_treble * 0.008;
  float rimGlow = exp(-pow((r - diskRadius) / rimWidth, 2.0)) * (1.5 + u_amplitude * 1.0);

  // The "beyond" — looking through the ring into infinite deep space
  // Simulate with receding spiral pattern visible just inside the corona
  float beyondAngle = angle + t * 0.4;
  float beyondLogR = log((r / diskRadius) * 3.0 + 1.0);
  float beyondSpiral = sin(beyondLogR * 8.0 - beyondAngle * 4.0 - t * 2.0);
  float beyondDepth = exp(-beyondLogR * 2.0) * inCorona * 0.4;
  float beyondPattern = (0.5 + 0.5 * beyondSpiral) * beyondDepth;

  // Outer space background — stars receding to infinity
  float starField = pow(fract(sin(dot(floor(uv * 60.0), vec2(127.1, 311.7))) * 43758.5), 20.0);
  starField *= (1.0 - insideDisk) * (1.0 - coronaFall2 * 0.8) * 0.6;

  // Palette
  vec3 cCorona = palette(coronaGlow * 0.4 + angle * 0.05 + t * 0.05 + paletteShift,
    vec3(0.9, 0.6, 0.2), vec3(0.4, 0.3, 0.2), vec3(1.0, 0.8, 0.5), vec3(0.0, 0.1, 0.2));
  vec3 cRim = palette(angle * 0.1 + t * 0.08 + paletteShift * 0.7,
    vec3(1.0, 0.95, 0.85), vec3(0.1, 0.1, 0.2), vec3(0.5, 0.8, 1.0), vec3(0.0, 0.1, 0.3));
  vec3 cBeyond = palette(beyondLogR * 0.3 + t * 0.07 + paletteShift,
    vec3(0.3, 0.4, 0.8), vec3(0.4, 0.3, 0.5), vec3(1.0, 0.8, 1.2), vec3(0.2, 0.0, 0.4));

  vec3 color = vec3(0.0);
  color += cCorona * coronaGlow;
  color += cCorona * flare;
  color += cRim * rimGlow;
  color += cBeyond * beyondPattern;
  color += vec3(0.9, 0.95, 1.0) * starField;

  // Dark disk — absorbs almost all light, slight limb darkening
  float limbDark = 1.0 - smoothstep(diskRadius * 0.6, diskRadius, r);
  color *= 1.0 - insideDisk * (1.0 - limbDark * 0.08);

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
