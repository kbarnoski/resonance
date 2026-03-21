import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // The serpent ring — circular body with undulating thickness
  float ringRadius = 0.45 + u_bass * 0.05;
  float bodyWidth = 0.06 + 0.02 * sin(a * 12.0 - t * 4.0) + u_mid * 0.02;

  // Ring distance
  float ringDist = abs(r - ringRadius) - bodyWidth;

  // Scale pattern along the body — diamond shapes
  float scaleAngle = a * 20.0 - t * 3.0;
  float scaleRadial = (r - ringRadius) * 60.0;
  float scales = sin(scaleAngle) * sin(scaleRadial);
  scales = smoothstep(0.2, 0.8, scales);

  // Head and tail meeting point — thicker at a=PI
  float headAngle = mod(a + 3.14159 - t * 0.5, 6.28318) - 3.14159;
  float headBulge = exp(-headAngle * headAngle * 8.0) * 0.04;
  float tailTaper = smoothstep(0.0, 0.5, abs(headAngle)) * 0.02;
  float bodyShape = abs(r - ringRadius) - (bodyWidth + headBulge - tailTaper);

  // Eye of the serpent near the head
  vec2 headPos = vec2(cos(-t * 0.5 + 3.14159), sin(-t * 0.5 + 3.14159)) * ringRadius;
  float eye = length(uv - headPos * 1.02) - 0.015;
  float eyeGlow = smoothstep(0.02, 0.0, abs(eye));

  // Inner flowing energy — swirl inside the ring
  vec2 innerUV = rot2(t * 0.8) * uv;
  float innerFlow = fbm(innerUV * 4.0 + t * 0.5);
  float innerMask = smoothstep(ringRadius - 0.1, ringRadius - 0.25, r);

  // Outer aura — energy radiating outward
  float outerAura = fbm(vec2(a * 3.0, r * 5.0 - t * 0.8));
  float outerMask = smoothstep(ringRadius + 0.15, ringRadius + 0.08, r)
                  * smoothstep(ringRadius + 0.3, ringRadius + 0.15, r);

  // Spine line running through the center of the body
  float spine = abs(r - ringRadius);
  float spineGlow = smoothstep(0.01, 0.0, spine) * smoothstep(-0.08, 0.0, -abs(bodyShape));

  // Body edge glow
  float bodyEdge = 1.0 - smoothstep(0.0, 0.015, abs(bodyShape));
  float bodyFill = 1.0 - smoothstep(0.0, bodyWidth * 1.5, abs(r - ringRadius));

  // Serpent scales palette — emerald / gold
  vec3 col1 = palette(
    a / 6.28 + t * 0.1 + paletteShift,
    vec3(0.3, 0.5, 0.3),
    vec3(0.4, 0.5, 0.3),
    vec3(0.6, 0.9, 0.4),
    vec3(0.1, 0.3, 0.15)
  );

  // Deep serpent body — bronze / dark green
  vec3 col2 = palette(
    r * 3.0 + scales * 0.5 + paletteShift,
    vec3(0.4, 0.35, 0.2),
    vec3(0.3, 0.3, 0.2),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.2, 0.1)
  );

  // Inner energy — cyan / violet
  vec3 col3 = palette(
    innerFlow * 2.0 + t * 0.3 + paletteShift + 0.5,
    vec3(0.5, 0.4, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.8, 1.0),
    vec3(0.2, 0.1, 0.5)
  );

  vec3 color = vec3(0.0);

  // Body fill with scale pattern
  float scaledBody = bodyFill * (0.5 + 0.5 * scales);
  color += col2 * scaledBody * (0.7 + u_bass * 0.4);

  // Body edge
  color += col1 * bodyEdge * 1.5;

  // Spine highlight
  color += vec3(1.2, 1.1, 0.8) * spineGlow * 0.8;

  // Inner vortex energy
  color += col3 * innerMask * (0.3 + innerFlow * 0.4) * (0.6 + u_mid * 0.6);

  // Outer aura
  color += col1 * outerMask * outerAura * 0.3 * (0.5 + u_treble * 0.5);

  // Eye glow — fierce amber
  color += vec3(1.5, 1.0, 0.3) * eyeGlow * 2.0;

  // Subtle flowing particles along the ring
  float particles = sin(a * 40.0 - t * 8.0 + r * 20.0);
  particles = smoothstep(0.8, 1.0, particles) * bodyFill;
  color += col3 * particles * 0.6 * u_treble;

  // Emissive at head
  float headGlow = exp(-headAngle * headAngle * 15.0);
  color += vec3(1.3, 1.1, 0.6) * headGlow * bodyFill * 0.8;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
