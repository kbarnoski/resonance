// ════════════════════════════════════════════════════════════════════════════
// GLSL for 1047-tracer-drift.
//
// Two fragment programs share one full-screen-triangle vertex shader:
//
//  1) FEEDBACK_FRAG — the heart of the piece. Reads the PREVIOUS accumulation
//     frame (uPrev) sampled with a slight zoom + rotation + fBm warp, multiplies
//     it by a decay factor (the tracer/positive-afterimage look), then composites
//     fresh content OVER it:
//       - a slow fBm "breathing" surface, drifting,
//       - two slightly-detuned line/dot lattices -> moire,
//       - faint animated blue-noise-ish grain -> visual snow.
//     Output -> the next accumulation texture (ping-pong).
//
//  2) PRESENT_FRAG — samples the latest accumulation texture and tone-maps it
//     to the screen (gentle, luminous, NOT neon) with a soft vignette.
//
// No raymarching, no reaction-diffusion. Pastel-drift palette. Slow luminance
// only — never high-contrast flashing.
// ════════════════════════════════════════════════════════════════════════════

export const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// shared GLSL noise helpers
const NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.02;
    amp *= 0.5;
  }
  return v;
}
`;

export const FEEDBACK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;   // previous accumulation frame
uniform vec2 uRes;
uniform float uTime;
uniform float uIntensity;  // 0..1 arc come-up
uniform float uLowEnergy;  // 0..1 -> trail length / zoom / warp amp
uniform float uLevel;      // 0..1 -> saturation
uniform float uAspect;

${NOISE}

// pastel-drift palette: soft lilac, peach, mint, rose, pale cyan.
vec3 pastel(float t) {
  t = fract(t);
  // five soft anchors around a hue ring, low-to-mid saturation
  vec3 lilac = vec3(0.78, 0.70, 0.92);
  vec3 peach = vec3(0.98, 0.82, 0.72);
  vec3 mint  = vec3(0.74, 0.93, 0.82);
  vec3 rose  = vec3(0.98, 0.76, 0.84);
  vec3 cyan  = vec3(0.74, 0.90, 0.95);
  float s = t * 5.0;
  int i = int(floor(s));
  float f = smoothstep(0.0, 1.0, fract(s));
  vec3 a, b;
  if (i == 0) { a = lilac; b = peach; }
  else if (i == 1) { a = peach; b = mint; }
  else if (i == 2) { a = mint; b = rose; }
  else if (i == 3) { a = rose; b = cyan; }
  else { a = cyan; b = lilac; }
  return mix(a, b, f);
}

void main() {
  vec2 uv = vUv;
  vec2 c = vec2(0.5);
  vec2 p = uv - c;
  p.x *= uAspect;

  // ── feedback sample transform: slight zoom + rotation + fBm warp ──────────
  // more low energy -> stronger pull (longer, more liquid trails)
  float zoom = 1.0 + (0.0016 + 0.0090 * uLowEnergy) * (0.6 + 0.4 * uIntensity);
  float ang  = (0.0008 + 0.0040 * uLowEnergy) * (0.5 + 0.5 * uIntensity);
  float cs = cos(ang), sn = sin(ang);
  mat2 rot = mat2(cs, -sn, sn, cs);

  // breathing fBm warp of the feedback fetch
  float warpAmp = (0.0010 + 0.0060 * uLowEnergy) * (0.4 + 0.6 * uIntensity);
  vec2 wq = uv * 2.4 + vec2(uTime * 0.020, -uTime * 0.015);
  vec2 warp = vec2(
    fbm(wq) - 0.5,
    fbm(wq + 17.3) - 0.5
  ) * warpAmp;

  vec2 sp = rot * (p / zoom);
  sp.x /= uAspect;
  vec2 prevUv = sp + c + warp;

  vec3 prev = texture(uPrev, prevUv).rgb;

  // decay (the afterimage fade). Longer trails when low energy is high, but
  // always gentle — never a hard strobe of the buffer. Keep it slow.
  float decay = 0.86 + 0.115 * smoothstep(0.0, 1.0, uLowEnergy) * uIntensity;
  decay = clamp(decay, 0.80, 0.978);
  prev *= decay;
  // a touch of hue rotation per pass makes trails drift in colour (chromatic
  // lag), exaggerated as colour "drifts apart" mid-trip.
  float drift = (0.004 + 0.012 * uIntensity);
  prev = mix(prev, prev.gbr, drift);

  // ── fresh content: breathing surface + moire lattices + snow ─────────────
  // slow drifting fBm surface ("breathing")
  vec2 bq = uv * 3.0 + vec2(-uTime * 0.012, uTime * 0.009);
  float surf = fbm(bq + warp * 30.0);
  float surf2 = fbm(bq * 1.7 + 5.0 - uTime * 0.006);
  float field = surf * 0.7 + surf2 * 0.3;

  // colour drifts apart with intensity: spread the palette lookup
  float spread = 0.10 + 0.22 * uIntensity;
  float hue = field + uTime * 0.010 + length(p) * spread;
  vec3 col = pastel(hue);

  // luminous soft body, gentle — keep it pastel, not neon
  float body = smoothstep(0.30, 0.85, field);
  vec3 content = col * (0.18 + 0.55 * body);

  // ── two slightly-detuned lattices -> moire ───────────────────────────────
  float latScale = 60.0 + 30.0 * uIntensity;
  float a1 = 0.0;
  float a2 = 0.06 + 0.05 * sin(uTime * 0.02); // tiny detune angle
  vec2 r1 = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * p * latScale;
  vec2 r2 = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * p * (latScale * 1.012);
  float dots1 = 0.5 + 0.5 * cos(r1.x) * cos(r1.y);
  float dots2 = 0.5 + 0.5 * cos(r2.x) * cos(r2.y);
  float moire = dots1 * dots2;
  float moireAmt = 0.05 + 0.10 * uIntensity;
  content += pastel(hue + 0.4) * moire * moireAmt;

  // ── visual snow: faint animated grain, low alpha ─────────────────────────
  float snow = hash21(gl_FragCoord.xy + fract(uTime) * 91.7);
  float snowAmt = (0.015 + 0.045 * (1.0 - 0.5 * uIntensity)); // faint, persistent
  content += (snow - 0.5) * snowAmt;

  // composite fresh content OVER decayed feedback (additive-ish screen blend)
  vec3 outc = prev + content * (0.5 + 0.5 * uIntensity);
  outc = min(outc, vec3(1.4)); // soft ceiling, allow gentle bloom

  fragColor = vec4(outc, 1.0);
}
`;

export const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uLevel; // -> saturation

vec3 adjustSat(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}

void main() {
  vec3 c = texture(uTex, vUv).rgb;

  // gentle filmic-ish tone map so highlights stay luminous, not clipped neon
  c = c / (c + vec3(0.55)) * 1.45;

  // loudness -> saturation (subtle, stays pastel)
  float sat = 0.85 + 0.45 * clamp(uLevel, 0.0, 1.0);
  c = adjustSat(c, sat);

  // soft vignette for a held, dreamy frame
  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.95, 0.35, length(d));
  c *= mix(0.78, 1.0, vig);

  // lift blacks slightly toward a pale dusk, NOT a dark void
  c = mix(vec3(0.05, 0.045, 0.07), c, 0.94) + vec3(0.012, 0.010, 0.016);

  fragColor = vec4(c, 1.0);
}
`;
