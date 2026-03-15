import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Solstice — two light sources on opposite horizons, world's edge.
// The plane extends forever in all directions — an endless flat cosmos.
// Light from source A and source B crosses and interferes, casting
// infinite shadow patterns across the eternal ground.

// Perspective projection of the infinite plane
// Returns distance-from-viewer and plane UV for a ray cast from eye
struct PlaneHit {
  bool hit;
  float dist;
  vec2 planeUV;
  vec3 normal;
};

PlaneHit castRayToPlane(vec2 screenUV, float t) {
  PlaneHit ph;

  // Camera tilt — looking slightly downward at the horizon
  float tiltX = -0.25 + sin(t * 0.2) * 0.03;
  vec3 rd = normalize(vec3(screenUV.x, screenUV.y + tiltX, 1.3));
  vec3 ro = vec3(sin(t * 0.1) * 0.3, 0.55, 0.0); // eye above plane

  // Plane at y = 0, extends infinitely in xz
  if (rd.y >= -0.001) {
    ph.hit = false;
    return ph;
  }

  float dist = -ro.y / rd.y;
  ph.hit = true;
  ph.dist = dist;
  ph.planeUV = ro.xz + rd.xz * dist;
  ph.normal = vec3(0.0, 1.0, 0.0);
  return ph;
}

// Diffuse illumination from a distant point light on the horizon
// Light is at infinite distance (directional) but appears at horizon
float lightFromSource(vec2 planeUV, vec3 lightDir, vec3 normal, float roughness) {
  // Lambert diffuse
  float diff = max(dot(normal, lightDir), 0.0);

  // Distance-based attenuation from projected source point
  // Even though source is "on the horizon," we give it pseudo-distance falloff
  float projectedDist = length(planeUV - lightDir.xz * 50.0);
  float attenuation = 1.0 / (projectedDist * 0.01 + 0.5);

  return diff * (0.4 + roughness * 0.6) * attenuation;
}

// Shadow from an obstacle — simplified geometric shadow
// For an infinite flat plane, shadows are cast by raised features
float shadowField(vec2 uv, vec3 lightDir, float t) {
  // Generate some occluding features via noise
  float occluder = fbm(uv * 0.4 + t * 0.01) * 0.5 + 0.5;
  occluder = smoothstep(0.55, 0.7, occluder);

  // Shadow projected in light direction
  vec2 shadowDir = -lightDir.xz / (lightDir.y + 0.001);
  float shadowAtOccluder = fbm((uv - shadowDir * occluder) * 0.4 + t * 0.01) * 0.5 + 0.5;
  shadowAtOccluder = smoothstep(0.55, 0.7, shadowAtOccluder);

  // Shadow region where occluder blocks the light
  return 1.0 - shadowAtOccluder * occluder;
}

// Ground texture — an abstract endless crystal plane
float groundTexture(vec2 uv, float t) {
  float n1 = snoise(uv * 2.0 + t * 0.02) * 0.5 + 0.5;
  float n2 = snoise(uv * 5.0 - t * 0.015) * 0.5 + 0.5;
  float crack = 1.0 - smoothstep(0.0, 0.02, abs(snoise(uv * 1.5 + t * 0.01)));
  return n1 * 0.5 + n2 * 0.3 + crack * 0.2;
}

// Sky — gradient from horizon to zenith with both light sources blending
vec3 skyColor(vec2 screenUV, float t, float paletteShift) {
  float y = screenUV.y;

  // Two horizon glows from source A and source B
  float horizonGlowA = exp(-pow((y + 0.25) * 6.0, 2.0)) * 0.4; // warm
  float horizonGlowB = exp(-pow((y + 0.25) * 6.0, 2.0)) * 0.3; // cool

  // Sky zenith — deep dark void
  float zenith = smoothstep(0.2, 0.7, y + 0.3);

  vec3 skyA = palette(
    y * 0.4 + t * 0.03 + paletteShift,
    vec3(0.5, 0.4, 0.3),
    vec3(0.4, 0.3, 0.2),
    vec3(0.6, 0.3, 0.1),
    vec3(0.05, 0.0, 0.0)
  );

  vec3 skyB = palette(
    y * 0.4 + t * 0.02 + paletteShift + 0.5,
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.3, 0.5),
    vec3(0.1, 0.4, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  vec3 voidCol = palette(
    t * 0.01 + paletteShift + 0.75,
    vec3(0.02, 0.02, 0.04),
    vec3(0.04, 0.03, 0.07),
    vec3(0.4, 0.2, 0.6),
    vec3(0.1, 0.1, 0.25)
  );

  return mix(mix(skyA * horizonGlowA + skyB * horizonGlowB, voidCol, zenith), voidCol, zenith * 0.5);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.28;

  // ── Two light sources on opposite horizons ──
  // Source A — warm (setting sun / dawn): left horizon
  float srcAAngle = t * 0.15; // slowly orbit around horizon
  vec3 lightA = normalize(vec3(cos(srcAAngle) * 3.0, 0.15 + u_bass * 0.1, sin(srcAAngle) * 3.0));
  vec3 lightAColor = palette(
    srcAAngle * 0.1 + paletteShift,
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.35, 0.15),
    vec3(0.3, 0.15, 0.0),
    vec3(0.03, 0.0, 0.0)
  );

  // Source B — cool (distant blue star): right horizon, opposite side
  float srcBAngle = srcAAngle + 3.14159;
  vec3 lightB = normalize(vec3(cos(srcBAngle) * 3.0, 0.12 + u_mid * 0.08, sin(srcBAngle) * 3.0));
  vec3 lightBColor = palette(
    srcBAngle * 0.1 + paletteShift + 0.5,
    vec3(0.4, 0.45, 0.5),
    vec3(0.3, 0.35, 0.5),
    vec3(0.1, 0.3, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  // ── Ray-cast to infinite plane ──
  PlaneHit ph = castRayToPlane(uv, t);

  vec3 color;

  if (ph.hit && ph.dist < 200.0) {
    vec2 planeUV = ph.planeUV;

    // Distance fog — plane recedes to infinite depth
    float distFog = 1.0 - exp(-ph.dist * 0.018);
    float nearMask = 1.0 - distFog;

    // Ground texture
    float tex = groundTexture(planeUV * 0.5, t);

    // Illumination from each source
    float illumA = lightFromSource(planeUV, lightA, ph.normal, tex);
    float illumB = lightFromSource(planeUV, lightB, ph.normal, tex);

    // Shadow fields from each source — interference pattern
    float shadowA = shadowField(planeUV, lightA, t);
    float shadowB = shadowField(planeUV, lightB, t + 10.0);

    // Shadow interference — crossing shadows create grid-like patterns
    float crossShadow = shadowA * shadowB;
    float eitherShadow = min(shadowA, shadowB);

    // Bass drives shadow sharpness — louder = harder shadows
    crossShadow = mix(crossShadow, step(0.5, crossShadow), u_bass * 0.5);

    // Ground color from source A illumination
    vec3 groundColA = palette(
      tex * 0.6 + planeUV.x * 0.02 + t * 0.01 + paletteShift,
      vec3(0.5, 0.45, 0.35),
      vec3(0.35, 0.28, 0.18),
      vec3(0.4, 0.2, 0.05),
      vec3(0.02, 0.0, 0.0)
    );

    // Ground color from source B illumination
    vec3 groundColB = palette(
      tex * 0.6 + planeUV.y * 0.02 + t * 0.01 + paletteShift + 0.5,
      vec3(0.4, 0.45, 0.5),
      vec3(0.25, 0.3, 0.42),
      vec3(0.1, 0.3, 0.7),
      vec3(0.08, 0.1, 0.25)
    );

    // Mid frequency drives color mixing between the two lights
    float mixT = 0.5 + u_mid * 0.3 * sin(t * 0.5);

    vec3 groundColor = groundColA * illumA * shadowA + groundColB * illumB * shadowB;
    groundColor *= crossShadow;

    // Specular glints — flat plane occasionally catches light (treble)
    float specA = pow(max(0.0, dot(reflect(-lightA, ph.normal), normalize(vec3(uv, -1.0)))), 32.0);
    float specB = pow(max(0.0, dot(reflect(-lightB, ph.normal), normalize(vec3(uv, -1.0)))), 32.0);
    groundColor += lightAColor * specA * u_treble * 0.5;
    groundColor += lightBColor * specB * u_treble * 0.5;

    // Depth fog toward horizon: fog = sky color
    vec3 fogColor = skyColor(vec2(0.0, -0.26), t, paletteShift);
    color = mix(groundColor, fogColor, distFog);

    // Ground luminance boost near camera
    color *= (0.8 + nearMask * 0.4);

  } else {
    // ── Sky above horizon ──
    color = skyColor(uv, t, paletteShift);

    // Light source disc on horizon — two bright points
    float r = length(uv);
    vec2 srcAScreen = lightA.xz * 0.3;
    vec2 srcBScreen = lightB.xz * 0.3;
    srcAScreen.y = -0.27; // pin to horizon line
    srcBScreen.y = -0.27;

    float srcADist = length(uv - srcAScreen);
    float srcBDist = length(uv - srcBScreen);

    color += lightAColor * exp(-srcADist * 18.0) * 1.5 * (1.0 + u_bass * 0.5);
    color += lightBColor * exp(-srcBDist * 18.0) * 1.2 * (1.0 + u_mid * 0.5);

    // Halo spikes — treble drives lens-flare-like star patterns
    float spikeA = max(0.0, 1.0 - abs(uv.x - srcAScreen.x) * 30.0) * exp(-srcADist * 5.0);
    float spikeAV = max(0.0, 1.0 - abs(uv.y - srcAScreen.y) * 30.0) * exp(-srcADist * 5.0);
    color += lightAColor * (spikeA + spikeAV) * u_treble * 0.3;
  }

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  // Tone
  color = color / (color + 0.7);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
