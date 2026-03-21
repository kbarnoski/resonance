import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Digital corruption — scan lines, RGB split, block displacement,
// data degradation, the aesthetic of broken signals.

float blockHash(vec2 p) {
  return fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453);
}

float scanLine(float y, float freq, float speed) {
  return smoothstep(0.4, 0.5, sin(y * freq + u_time * speed) * 0.5 + 0.5);
}

float glitchBlock(vec2 uv, float blockSize, float seed) {
  vec2 block = floor(uv / blockSize);
  float h = fract(sin(dot(block + seed, vec2(41.7, 89.3))) * 2745.3);
  float trigger = step(0.85 - u_bass * 0.15, h);
  float timeHash = fract(sin(floor(u_time * 8.0) * 73.1 + h * 371.7) * 1487.3);
  return trigger * step(0.4, timeHash);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec2 baseUV = uv;

  // Horizontal tear — entire rows shift sideways on bass
  float tearY = floor(uv.y * 40.0) / 40.0;
  float tearHash = fract(sin(tearY * 127.1 + floor(u_time * 6.0) * 31.7) * 43758.5);
  float tearActive = step(0.88 - u_bass * 0.12, tearHash);
  float tearOffset = (tearHash * 2.0 - 1.0) * 0.15 * tearActive * u_bass;
  uv.x += tearOffset;

  // Block displacement — rectangular chunks shift position
  float blockActive1 = glitchBlock(baseUV, 0.15, 0.0);
  float blockActive2 = glitchBlock(baseUV, 0.08, 50.0);
  vec2 blockShift = vec2(
    blockHash(floor(baseUV / 0.15) + floor(u_time * 4.0)) * 0.1 - 0.05,
    blockHash(floor(baseUV / 0.15) + floor(u_time * 3.0) + vec2(100.0)) * 0.08 - 0.04
  );
  uv += blockShift * blockActive1 * (0.5 + u_mid * 0.5);
  uv += blockShift * 0.5 * blockActive2 * u_treble;

  // RGB channel split — each channel samples from slightly different position
  float splitAmount = 0.008 + u_bass * 0.02 + tearActive * 0.03;
  float splitAngle = t * 2.0 + snoise(vec2(t * 0.5, 0.0)) * 3.14;
  vec2 rOffset = vec2(cos(splitAngle), sin(splitAngle)) * splitAmount;
  vec2 gOffset = vec2(0.0);
  vec2 bOffset = -rOffset * 1.2;

  // Base signal — dark noise pattern with structure
  float signalR = fbm((uv + rOffset) * 3.0 + t * 0.2);
  float signalG = fbm((uv + gOffset) * 3.0 + t * 0.2);
  float signalB = fbm((uv + bOffset) * 3.0 + t * 0.2);

  // Palette-based coloring for each channel
  vec3 rColor = palette(signalR * 0.4 + paletteShift,
    vec3(0.06, 0.01, 0.01),
    vec3(0.1, 0.02, 0.02),
    vec3(1.0, 0.3, 0.3),
    vec3(0.0, 0.1, 0.2));

  vec3 gColor = palette(signalG * 0.4 + paletteShift + 0.33,
    vec3(0.01, 0.04, 0.01),
    vec3(0.02, 0.06, 0.02),
    vec3(0.3, 1.0, 0.4),
    vec3(0.1, 0.0, 0.2));

  vec3 bColor = palette(signalB * 0.4 + paletteShift + 0.66,
    vec3(0.01, 0.01, 0.06),
    vec3(0.02, 0.02, 0.1),
    vec3(0.3, 0.3, 1.0),
    vec3(0.2, 0.1, 0.0));

  vec3 color = rColor * 0.5 + gColor * 0.3 + bColor * 0.4;

  // Scan lines — horizontal interference bands
  float scan1 = scanLine(gl_FragCoord.y, 3.0, 0.5);
  float scan2 = scanLine(gl_FragCoord.y, 1.2, -0.3);
  float scanMask = 0.7 + scan1 * 0.15 + scan2 * 0.1;
  color *= scanMask;

  // Vertical noise bars — vertical static columns
  float vBar = snoise(vec2(uv.x * 30.0, floor(u_time * 12.0)));
  float vBarMask = smoothstep(0.6, 0.9, vBar) * 0.15 * u_treble;
  color += vec3(vBarMask) * palette(uv.x * 2.0 + paletteShift,
    vec3(0.05, 0.05, 0.06),
    vec3(0.08, 0.06, 0.1),
    vec3(0.6, 0.8, 1.0),
    vec3(0.2, 0.1, 0.3));

  // Data corruption — random bright pixels (digital snow)
  float pixelNoise = fract(sin(dot(floor(gl_FragCoord.xy * 0.5),
    vec2(12.9898, 78.233)) + floor(u_time * 20.0)) * 43758.5453);
  float pixelGlitch = step(0.97 - u_treble * 0.03, pixelNoise);
  color += vec3(pixelGlitch * 0.15);

  // Block corruption overlay — dark blocks eating the signal
  float corruption = glitchBlock(baseUV * 2.0, 0.12, 100.0);
  float corruptNoise = snoise(baseUV * 20.0 + floor(u_time * 15.0)) * 0.5 + 0.5;
  color = mix(color, vec3(corruptNoise * 0.02), corruption * 0.8);

  // Horizontal distortion bands — wobbly scan regions
  float bandY = sin(uv.y * 6.0 + t * 3.0) * sin(uv.y * 13.0 - t * 1.5);
  float band = smoothstep(0.7, 0.95, bandY) * u_mid;
  color = mix(color, color * 1.5 + vec3(0.02, 0.0, 0.03), band * 0.4);

  // Overall darkness — this is a dying signal
  color *= 0.7;

  // Vignette — CRT-style darker edges
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.3, 1.3, vd);
  vignette *= 1.0 - 0.3 * pow(vd, 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
