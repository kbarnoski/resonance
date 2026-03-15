import { U, VISIONARY_PALETTE, ROT2, SMOOTH_NOISE } from "./shared";

// Infinite streams of light particles rising upward forever, seen from within
// the stream. Parallax particle layers at different speeds creating depth.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMOOTH_NOISE + `
// Hash for particle placement
float hash11(float p) {
  return fract(sin(p * 127.1 + 311.7) * 43758.5453);
}
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Single particle layer: grid of soft glowing points drifting upward
float particleLayer(vec2 uv, float depth, float speed, float size, float t) {
  // Perspective scale: closer layers (depth=1) are larger, faster
  float scale = mix(40.0, 8.0, depth); // far = dense small, near = sparse large
  vec2 p = uv * scale;

  // Drift upward (negative y = upward in screen space) with parallax speed
  p.y += t * speed;
  // Gentle horizontal drift
  p.x += sin(t * 0.3 + depth * 3.7) * 0.15;

  vec2 cell = floor(p);
  vec2 f = fract(p);

  float brightness = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellID = cell + g;
      // Random offset within cell — stagger particles
      vec2 offset = vec2(hash21(cellID), hash21(cellID + vec2(13.7, 7.3)));
      vec2 r = g + offset - f;
      float d = length(r);
      // Soft glow falloff
      float particleBrightness = exp(-d * d / (size * size));
      // Twinkle: each particle has its own flicker frequency
      float twinkle = 0.6 + 0.4 * sin(t * (3.0 + hash21(cellID) * 4.0) + hash21(cellID + vec2(5.0)));
      brightness += particleBrightness * twinkle;
    }
  }
  return brightness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.18;
  float paletteShift = u_amplitude * 0.3;

  // Slight fisheye — we're looking up through the stream
  float r = length(uv);
  vec2 uvFish = uv * (1.0 + r * r * 0.15);

  // FBM warp — gives the stream a gentle turbulence
  float warpAmt = 0.04 + u_bass * 0.03;
  vec2 warpedUV = uvFish + vec2(
    fbm(uvFish * 2.0 + vec2(t * 0.2, 0.0)),
    fbm(uvFish * 2.0 + vec2(0.0, t * 0.15))
  ) * warpAmt;

  vec3 color = vec3(0.0);
  float totalDepth = 0.0;

  // 8 parallax layers from deep (small/fast) to near (large/slow)
  // Layer speeds and sizes create strong parallax depth illusion
  int N = 8;
  for (int i = 0; i < N; i++) {
    float fi = float(i) / float(N - 1);          // 0 = deepest, 1 = nearest
    float depth = fi;
    float speed = mix(1.2, 0.2, depth);          // far = fast scroll (parallax), near = slow
    float size = mix(0.18, 0.55, depth);          // far = tiny, near = large
    float layerBrightness = particleLayer(warpedUV, depth, speed * (1.0 + u_bass * 0.4), size, t);

    // Depth attenuation — far layers dimmer
    float depthAtten = mix(0.12, 1.0, depth);
    // Audio: bass pulses near layers, treble brightens far layers
    float audioPulse = (i < 3) ? (1.0 + u_treble * 0.8) : (1.0 + u_bass * 0.6);

    // Palette per layer — depth drives hue shift
    vec3 layerColor = palette(fi * 0.5 + t * 0.04 + paletteShift,
      vec3(0.5, 0.4, 0.7), vec3(0.5, 0.4, 0.4), vec3(1.0, 0.9, 1.2), vec3(0.0, 0.2, 0.5));

    // Nearest layers get warmer color
    vec3 nearColor = palette(fi * 0.6 + u_mid * 0.2 + paletteShift,
      vec3(0.8, 0.6, 0.4), vec3(0.3, 0.3, 0.4), vec3(1.2, 0.8, 0.6), vec3(0.3, 0.1, 0.0));

    vec3 finalColor = mix(layerColor, nearColor, depth);
    color += finalColor * layerBrightness * depthAtten * audioPulse * 0.35;
    totalDepth += layerBrightness * depthAtten;
  }

  // Central column: brighter stream core — vanishing point is straight up
  float colGlow = exp(-uv.x * uv.x * 12.0) * exp(-(uv.y + 0.1) * (uv.y + 0.1) * 3.0);
  vec3 cCore = palette(t * 0.08 + paletteShift * 0.5,
    vec3(0.7, 0.6, 0.9), vec3(0.3, 0.3, 0.2), vec3(0.8, 1.0, 1.2), vec3(0.0, 0.1, 0.3));
  color += cCore * colGlow * (0.3 + u_amplitude * 0.4);

  // Depth fog at bottom — particles below viewer fade to dark
  float bottomFog = smoothstep(-0.2, 0.6, uv.y);
  color *= 0.3 + 0.7 * bottomFog;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
