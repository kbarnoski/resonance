import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Ray march helpers ----

// Torus SDF: major radius R, minor radius r
float sdTorus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - r;
}

// Scene SDF
float scene(vec3 p, float R, float r) {
  return sdTorus(p, R, r);
}

// Normal via central differences
vec3 torusNormal(vec3 p, float R, float r) {
  float e = 0.001;
  return normalize(vec3(
    scene(p + vec3(e,0,0), R, r) - scene(p - vec3(e,0,0), R, r),
    scene(p + vec3(0,e,0), R, r) - scene(p - vec3(0,e,0), R, r),
    scene(p + vec3(0,0,e), R, r) - scene(p - vec3(0,0,e), R, r)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  float camDist  = 2.5 - u_bass * 0.3;
  vec3  camPos   = vec3(0.0, 0.0, camDist);
  vec3  rayDir   = normalize(vec3(uv, -1.5));

  // Torus parameters — bass pulses the tube radius
  float R = 0.55;
  float r = 0.22 + u_bass * 0.04;

  // Rotation angles driven by time and audio
  float rotX = t * 0.7 + u_mid * 0.3;
  float rotY = t * 0.5 + u_bass * 0.2;

  // Rotate ray and camera around X then Y
  rayDir.yz = rot2(rotX) * rayDir.yz;
  rayDir.xz = rot2(rotY) * rayDir.xz;
  camPos.yz  = rot2(rotX) * camPos.yz;
  camPos.xz  = rot2(rotY) * camPos.xz;

  vec3 color = vec3(0.0);

  // Ray march
  float dist = 0.0;
  float minD = 999.0;
  bool hit   = false;
  vec3 hitP;

  for (int i = 0; i < 80; i++) {
    vec3 p = camPos + rayDir * dist;
    float d = scene(p, R, r);
    minD = min(minD, d);
    if (d < 0.001) { hit = true; hitP = p; break; }
    if (dist > 8.0) break;
    dist += d * 0.85;
  }

  if (hit) {
    vec3 n = torusNormal(hitP, R, r);

    // Surface UV for coloring
    // Angle around the tube (poloidal)
    vec2 q = vec2(length(hitP.xz) - R, hitP.y);
    float poloidalAngle = atan(q.y, q.x);
    // Angle around the torus hole (toroidal)
    float toroidalAngle = atan(hitP.z, hitP.x);

    float surfU = toroidalAngle  / 6.28318 + t * 0.4;
    float surfV = poloidalAngle  / 6.28318 + t * 0.25;

    // Wireframe: lines along poloidal and toroidal directions
    int numToroidal  = 18;
    int numPoloidal  = 12;
    float toroLines  = abs(fract(float(numToroidal)  * surfU) - 0.5);
    float polLines   = abs(fract(float(numPoloidal) * surfV) - 0.5);
    float lineThick  = 0.04 + u_treble * 0.02;
    float toroWire   = smoothstep(lineThick, 0.0, toroLines);
    float polWire    = smoothstep(lineThick, 0.0, polLines);
    float wire       = max(toroWire, polWire);

    // Palette 1: torus body color (dim fill between wires)
    vec3 bodyCol = palette(
      surfU * 2.0 + t * 0.3 + paletteShift,
      vec3(0.1, 0.1, 0.15),
      vec3(0.1, 0.1, 0.2),
      vec3(0.3, 0.5, 1.0),
      vec3(0.2, 0.1, 0.4)
    );
    // Palette 2: wireframe color (bright lines)
    vec3 wireCol = palette(
      surfU * 3.0 + surfV * 1.5 + t * 0.5 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.6, 1.0, 0.8),
      vec3(0.0, 0.1, 0.35)
    );
    // Palette 3: specular hot-spot (treble)
    vec3 specCol = palette(
      surfV * 2.0 + t * 0.7 + paletteShift + 0.4,
      vec3(0.7, 0.7, 0.6),
      vec3(0.4, 0.4, 0.3),
      vec3(1.0, 0.9, 0.5),
      vec3(0.0, 0.05, 0.15)
    );

    // Diffuse shading
    vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
    float diff = max(dot(n, lightDir), 0.0);

    // Interior glow: points inside the hole are darker
    float innerGlow = smoothstep(R, R - r * 0.5, length(hitP.xz));

    color  = bodyCol * (0.05 + diff * 0.15);
    color += wireCol * wire * (0.8 + u_mid * 0.3);
    color += specCol * wire * (toroWire * polWire) * (0.5 + u_treble * 1.0);
    color += bodyCol * innerGlow * 0.1;

    // Hot core on intersection lines
    float hotCross = toroWire * polWire;
    color += vec3(1.2, 1.1, 1.4) * hotCross * (0.3 + u_treble * 0.8);

    // Rim glow: edge of torus catches light
    float fresnel = pow(1.0 - abs(dot(n, normalize(-rayDir))), 3.0);
    color += wireCol * fresnel * 0.4;

  } else {
    // Miss: glow from proximity (soft aura through the hole)
    float aura = exp(-minD * 6.0) * 0.4;
    vec3 auraCol = palette(
      t * 0.3 + paletteShift + 0.2,
      vec3(0.15, 0.1, 0.2),
      vec3(0.1, 0.1, 0.2),
      vec3(0.5, 0.8, 1.0),
      vec3(0.2, 0.1, 0.35)
    );
    color = auraCol * aura;
  }

  // Recursive depth rings: concentric torus echoes behind
  for (int ring = 1; ring <= 3; ring++) {
    float fr  = float(ring);
    float ringR = R + fr * 0.35;
    float ringr = r * (1.0 - fr * 0.15);

    float ringDist = 0.0;
    bool  ringHit  = false;
    for (int i = 0; i < 40; i++) {
      vec3 p = camPos + rayDir * ringDist;
      float d = sdTorus(p, ringR, ringr);
      if (d < 0.002) { ringHit = true; break; }
      if (ringDist > 10.0) break;
      ringDist += d * 0.9;
    }
    if (ringHit) {
      vec3 rp = camPos + rayDir * ringDist;
      float toroA = atan(rp.z, rp.x) / 6.28318 + t * 0.2;
      float ringWire = smoothstep(0.05, 0.0, abs(fract(float(12) * toroA) - 0.5));
      vec3 ringCol = palette(
        toroA + t * 0.25 + paletteShift + fr * 0.3,
        vec3(0.5, 0.4, 0.5),
        vec3(0.4, 0.3, 0.5),
        vec3(0.7, 0.9, 1.0),
        vec3(0.1, 0.1, 0.3)
      );
      color += ringCol * ringWire * (0.3 / fr);
    }
  }

  // Vignette
  float vign = 1.0 - smoothstep(0.6, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
