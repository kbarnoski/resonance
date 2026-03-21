import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Lament — tears/droplets falling through dark space

float droplet(vec2 p, float size) {
  // Teardrop shape: circle on top, pointed at bottom
  float circle = length(p) - size;
  // Elongate downward
  vec2 tp = p;
  tp.y = max(tp.y, 0.0);
  float tear = length(tp * vec2(1.0, 0.6)) - size;
  tp.y = min(p.y, 0.0);
  float point = length(tp * vec2(2.0, 1.0)) - size * 0.5;
  return min(tear, point);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Multiple falling droplet columns
  float drops = 0.0;
  float trails = 0.0;

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    // Column position
    float xPos = sin(fi * 1.7 + 0.5) * 0.7;
    // Fall speed varies per column
    float speed = 0.3 + fract(sin(fi * 3.7) * 100.0) * 0.4;
    // Fall position with wrap
    float yOff = mod(t * speed + fi * 0.8, 2.4) - 1.2;

    // Droplet size varies
    float size = 0.012 + fract(sin(fi * 7.1) * 50.0) * 0.015;
    size *= 1.0 + u_bass * 0.3;

    vec2 dropPos = vec2(xPos, yOff);
    // Slight horizontal sway
    dropPos.x += sin(t * 0.3 + fi * 2.0) * 0.02;

    float d = droplet(uv - dropPos, size);
    float glow = exp(-max(d, 0.0) * 40.0) * 0.15;
    drops += glow;

    // Trail behind the droplet — fading streak upward
    float trailLength = 0.15 + speed * 0.1;
    float trailX = abs(uv.x - dropPos.x);
    float trailY = uv.y - dropPos.y;
    float trail = smoothstep(0.005, 0.0, trailX) *
                  smoothstep(trailLength, 0.0, trailY) *
                  smoothstep(-0.01, 0.02, trailY);
    trail *= 0.04;
    trails += trail;
  }

  drops = min(drops, 0.3);

  // Impact ripples at the bottom
  float ripples = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float xPos = sin(fi * 1.7 + 0.5) * 0.7;
    float impactTime = mod(t * 0.35 + fi * 0.8, 2.4);
    float rippleAge = max(impactTime - 1.0, 0.0);
    if (rippleAge > 0.0 && rippleAge < 0.6) {
      vec2 rippleCenter = vec2(xPos + sin(t * 0.3 + fi * 2.0) * 0.02, -0.55);
      float rd = length((uv - rippleCenter) * vec2(1.0, 3.0));
      float ring = abs(rd - rippleAge * 0.3) - 0.003;
      float ripple = exp(-max(ring, 0.0) * 50.0) * (1.0 - rippleAge / 0.6);
      ripples += ripple * 0.04;
    }
  }

  // Background: dark with very subtle gradient
  float bgGrad = smoothstep(0.8, -0.8, uv.y) * 0.01;
  vec3 bgColor = palette(0.7,
    vec3(0.004, 0.004, 0.007),
    vec3(0.006, 0.005, 0.01),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.55, 0.75));
  bgColor += bgGrad;

  // Droplet colors: cool, watery, sad
  vec3 dropColor = palette(0.5 + u_amplitude * 0.12,
    vec3(0.015, 0.018, 0.03),
    vec3(0.03, 0.04, 0.07),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.55, 0.75));

  vec3 trailColor = palette(0.6 + u_mid * 0.08,
    vec3(0.008, 0.01, 0.018),
    vec3(0.015, 0.02, 0.035),
    vec3(1.0, 1.0, 1.0),
    vec3(0.45, 0.5, 0.7));

  // Compose
  vec3 color = bgColor;
  color += trailColor * trails * (1.0 + u_mid * 0.5);
  color += dropColor * drops * (1.0 + u_bass * 0.6);
  color += dropColor * ripples * (1.0 + u_treble * 0.4);

  // Subtle background rain texture — very fine
  float rain = snoise(vec2(uv.x * 40.0, uv.y * 4.0 - t * 5.0));
  rain = smoothstep(0.92, 0.98, rain) * 0.01;
  color += trailColor * rain;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
