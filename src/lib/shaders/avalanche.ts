import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Avalanche — cascading snow and debris, destructive flowing mass

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.18;
  float paletteShift = u_amplitude * 0.25;

  // Tilt the scene — avalanche flows diagonally down-left
  vec2 flowDir = normalize(vec2(-0.6, -0.8));
  float flowAxis = dot(uv, flowDir);
  float crossAxis = dot(uv, vec2(-flowDir.y, flowDir.x));

  // Avalanche front — moving wave of debris
  float frontSpeed = 0.5 + u_bass * 0.2;
  float frontPos = -0.3 + fract(t * 0.15) * 1.5;
  float frontNoise = snoise(vec2(crossAxis * 4.0, t * 0.5)) * 0.1;
  float behindFront = smoothstep(frontPos + frontNoise + 0.1, frontPos + frontNoise - 0.05, flowAxis);

  // Snow cloud — billowing powder above the slide
  float cloudHeight = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 cloudUV = vec2(crossAxis * (2.0 + fi), flowAxis * 3.0 + t * frontSpeed * (1.0 + fi * 0.2));
    cloudUV *= rot2(fi * 0.15);
    float cloud = fbm(cloudUV + fi * 5.7) * 0.5 + 0.5;
    cloudHeight += cloud * (0.4 - fi * 0.06);
  }
  cloudHeight = pow(cloudHeight, 1.3);

  // Debris chunks — larger particles in the flow
  float debris = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 debrisUV = uv * (5.0 + fi * 3.0);
    debrisUV += flowDir * t * (2.0 + fi * 0.5);
    debrisUV *= rot2(fi * 0.3);
    vec2 id = floor(debrisUV);
    vec2 f = fract(debrisUV) - 0.5;
    vec2 rnd = hash2(id + fi * 13.0);
    float d = length(f - (rnd - 0.5) * 0.4);
    float size = 0.05 + rnd.x * 0.08;
    float chunk = smoothstep(size, size * 0.5, d);
    debris += chunk * behindFront * (0.5 - fi * 0.1);
  }

  // Mountain slope underneath — visible where avalanche hasn't covered
  float slope = smoothstep(-0.3, 0.5, flowAxis);
  float slopeNoise = fbm(uv * 3.0) * 0.5 + 0.5;

  // Fractured snow surface — cracks in the snowpack
  float crack = abs(snoise(vec2(crossAxis * 8.0, flowAxis * 12.0 + t * 0.3)));
  crack = smoothstep(0.02, 0.0, crack) * behindFront * 0.5;

  // Colors
  vec3 snowColor = palette(
    cloudHeight * 0.3 + paletteShift,
    vec3(0.65, 0.68, 0.72),
    vec3(0.2, 0.2, 0.22),
    vec3(0.5, 0.55, 0.65),
    vec3(0.15, 0.18, 0.25)
  );

  vec3 debrisColor = palette(
    debris * 0.4 + paletteShift + 0.3,
    vec3(0.35, 0.33, 0.3),
    vec3(0.15, 0.13, 0.1),
    vec3(0.6, 0.55, 0.5),
    vec3(0.1, 0.12, 0.15)
  );

  vec3 slopeColor = palette(
    slopeNoise * 0.3 + slope * 0.2 + paletteShift + 0.5,
    vec3(0.5, 0.52, 0.55),
    vec3(0.15, 0.15, 0.18),
    vec3(0.5, 0.5, 0.6),
    vec3(0.2, 0.22, 0.3)
  );

  vec3 skyColor = palette(
    uv.y * 0.2 + paletteShift + 0.7,
    vec3(0.35, 0.38, 0.45),
    vec3(0.1, 0.1, 0.15),
    vec3(0.4, 0.45, 0.6),
    vec3(0.2, 0.25, 0.35)
  );

  // Compose
  vec3 color = mix(skyColor, slopeColor, slope);
  color = mix(color, snowColor, behindFront * cloudHeight);
  color += debrisColor * debris * (0.7 + u_mid * 0.4);
  color += vec3(0.2, 0.18, 0.15) * crack;

  // Treble: fine ice particles in the powder cloud
  float ice = snoise(uv * 35.0 + flowDir * t * 5.0);
  ice = pow(max(ice, 0.0), 5.0) * u_treble * 0.3 * behindFront;
  color += vec3(0.8, 0.82, 0.85) * ice;

  // Bass: rumble — slight red tint to debris
  color += vec3(0.08, 0.02, 0.0) * u_bass * behindFront * 0.3;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
