import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

// Layers of rotating sacred geometry at different depths, the farthest layers
// tiny and dim, creating an infinite tunnel of symbols.
export const FRAG = U + VISIONARY_PALETTE + ROT2 + SDF_PRIMITIVES + `
// Compose sacred geometry SDFs into a single glyph shape
float sacredGlyph(vec2 p, float seed, float size) {
  float s = fract(seed * 5.7);
  float result = 1e6;

  // Circle ring
  float ring = abs(sdCircle(p, size * 0.8)) - size * 0.04;
  result = min(result, ring);

  // Inner triangle (varies by seed)
  float triRot = seed * 6.28318;
  vec2 pTri = rot2(triRot) * p;
  float tri = abs(sdTriangle(pTri, size * 0.55)) - size * 0.03;
  result = min(result, tri);

  // Inverted triangle if seed > 0.5 (Star of David style)
  if (s > 0.5) {
    vec2 pTri2 = rot2(triRot + 3.14159) * p;
    float tri2 = abs(sdTriangle(pTri2, size * 0.55)) - size * 0.03;
    result = min(result, tri2);
  }

  // Central dot
  float dot_ = sdCircle(p, size * 0.1);
  result = min(result, dot_);

  // Radial spokes (4 or 6 depending on seed)
  float spokeCount = (s > 0.4) ? 6.0 : 4.0;
  float spokeAngle = atan(p.y, p.x);
  float spokeR = length(p);
  float spokePhase = mod(spokeAngle + seed * 1.57, 6.28318 / spokeCount);
  spokePhase = abs(spokePhase - 3.14159 / spokeCount);
  float spoke = spokePhase * spokeR - size * 0.025;
  float spokeLen = smoothstep(size * 0.15, size * 0.12, abs(spokeR - size * 0.5));
  result = min(result, max(spoke, -spokeLen + size * 0.9));

  return result;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // 12 depth layers — layer 0 = nearest (large, slow, bright), 11 = farthest (tiny, fast, dim)
  int LAYERS = 12;
  for (int i = 0; i < LAYERS; i++) {
    float fi = float(i) / float(LAYERS - 1);         // 0=near, 1=far
    float depth = fi;

    // Perspective scale: exponential size reduction with depth
    float scale = exp(-depth * 2.6) * (0.55 + u_bass * 0.04); // near=large, far=tiny

    // Each layer rotates at its own speed — alternating directions with depth
    float rotSpeed = mix(0.08, 1.8, depth) * (mod(float(i), 2.0) * 2.0 - 1.0);
    float layerAngle = t * rotSpeed + float(i) * 0.47;

    // Layer-specific glyph seed (each layer has different geometry)
    float glyphSeed = fract(float(i) * 0.618033);    // golden ratio distribution

    // Transform uv into this layer's space
    vec2 layerUV = rot2(layerAngle) * uv;

    // Each layer also has a slight xy offset that breathes with audio
    float offsetAmp = scale * 0.15;
    vec2 layerOffset = vec2(
      sin(t * 0.3 + float(i) * 1.1) * offsetAmp * u_mid,
      cos(t * 0.4 + float(i) * 0.9) * offsetAmp * u_mid
    );
    layerUV += layerOffset;

    // SDF of the glyph at this layer's scale
    float d = sacredGlyph(layerUV, glyphSeed, scale);

    // Edge glow — thin bright lines of the glyph
    float glyphGlow = 1.0 - smoothstep(0.0, scale * 0.06, abs(d));
    float glyphFill = 1.0 - smoothstep(0.0, scale * 0.03, d); // inside fill

    // Depth attenuation — far layers are dim and blue-shifted
    float depthAtten = exp(-depth * 2.8);
    float brightness = glyphGlow * depthAtten * (0.4 + u_amplitude * 0.5);

    // Treble: adds shimmer to distant layers
    float trebleShimmer = (1.0 - depthAtten) * u_treble * glyphGlow * 0.5;

    // Palette — hue shifts with depth, creating a spectrum tunnel
    float huePhase = depth * 0.7 + float(i) * 0.08 + t * 0.05 + paletteShift;
    vec3 c1 = palette(huePhase,
      vec3(0.5, 0.4, 0.6), vec3(0.5, 0.4, 0.5), vec3(1.0, 0.8, 1.2), vec3(0.0, 0.2, 0.5));

    float huePhase2 = huePhase + 0.3 + u_mid * 0.15;
    vec3 c2 = palette(huePhase2,
      vec3(0.3, 0.5, 0.7), vec3(0.5, 0.3, 0.4), vec3(0.8, 1.2, 0.9), vec3(0.3, 0.0, 0.1));

    color += c1 * brightness;
    color += c2 * glyphFill * depthAtten * 0.15 * (0.5 + u_bass * 0.4);
    color += vec3(0.9, 1.0, 1.0) * trebleShimmer * 0.4;
  }

  // Tunnel depth glow: soft ambient from the infinite receding layers
  float tunnelGlow = exp(-length(uv) * 2.0) * 0.12 * (1.0 + u_amplitude * 0.6);
  vec3 cTunnel = palette(t * 0.06 + paletteShift,
    vec3(0.3, 0.2, 0.5), vec3(0.3, 0.3, 0.4), vec3(1.0, 0.8, 1.4), vec3(0.2, 0.0, 0.3));
  color += cTunnel * tunnelGlow;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
