import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// Perspective project 3D -> 2D
vec2 proj(vec3 p, float fov) {
  float z = p.z + fov;
  return p.xy * (fov / max(z, 0.01));
}

// Signed distance from point to projected line segment
float projLine(vec2 uv, vec3 a, vec3 b, float fov) {
  vec2 pa = proj(a, fov);
  vec2 pb = proj(b, fov);
  return sdLine(uv, pa, pb);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.28;

  // Camera drifts along Z axis — flies down the helix
  float camZ = t * 1.8 + u_bass * 0.4;
  float fov = 1.8;
  float rotSpeed = 0.6 + u_mid * 0.3;

  vec3 color = vec3(0.0);

  // Helix geometry parameters
  float helixRadius = 0.18;
  float helixPitch  = 0.38; // vertical rise per full turn
  int   numSegs     = 48;   // segments per strand per pass

  // Two strands: strand 0 and strand 1 offset by PI
  for (int strand = 0; strand < 2; strand++) {
    float strandOffset = float(strand) * 3.14159;

    float minDist = 999.0;

    for (int i = 0; i < numSegs; i++) {
      float fi  = float(i);
      float fi1 = float(i + 1);

      // Parameter along the helix
      float s0 = fi  / float(numSegs);
      float s1 = fi1 / float(numSegs);

      // The helix spans many turns in Z; camZ scrolls it forward
      float totalTurns = 6.0;
      float theta0 = s0 * totalTurns * 6.28318 + t * rotSpeed + strandOffset;
      float theta1 = s1 * totalTurns * 6.28318 + t * rotSpeed + strandOffset;
      float z0 = s0 * totalTurns * helixPitch - camZ;
      float z1 = s1 * totalTurns * helixPitch - camZ;

      vec3 a = vec3(helixRadius * cos(theta0), helixRadius * sin(theta0), z0);
      vec3 b = vec3(helixRadius * cos(theta1), helixRadius * sin(theta1), z1);

      // Cull segments behind camera
      if (a.z + fov < 0.01 && b.z + fov < 0.01) continue;

      float d = projLine(uv, a, b, fov);

      // Depth-based brightness (closer = brighter)
      float avgZ = (a.z + b.z) * 0.5 + fov;
      float bright = fov / max(avgZ, 0.1);
      bright = clamp(bright, 0.0, 2.5);

      float segIndex = s0 * float(numSegs) + float(strand) * float(numSegs);

      // Line thickness varies with depth
      float thick = (0.004 + u_treble * 0.003) * bright * 0.6;
      float glow  = smoothstep(thick * 6.0, 0.0, d) * bright;
      float core  = smoothstep(thick, 0.0, d) * bright;

      // Palette 1: cold blue-violet strand
      vec3 col1 = palette(
        s0 * 2.0 + t * 0.5 + paletteShift + float(strand) * 0.5,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.4, 0.6),
        vec3(0.6, 0.9, 1.0),
        vec3(0.0, 0.15, 0.4)
      );
      // Palette 2: warm accent on rung connectors
      vec3 col2 = palette(
        s0 * 1.5 + t * 0.3 + paletteShift + 0.3,
        vec3(0.5, 0.4, 0.3),
        vec3(0.5, 0.3, 0.2),
        vec3(1.0, 0.6, 0.3),
        vec3(0.05, 0.1, 0.2)
      );
      vec3 lineCol = mix(col1, col2, float(strand) * 0.5);

      color += lineCol * glow * 0.35;
      color += lineCol * core * 1.1;
      minDist = min(minDist, d);
    }

    // Rungs: cross-bars connecting the two strands at regular intervals
    int numRungs = 18;
    for (int r = 0; r < numRungs; r++) {
      float fr = float(r);
      float rungS = fr / float(numRungs);
      float totalTurns = 6.0;
      float theta = rungS * totalTurns * 6.28318 + t * rotSpeed;
      float rungZ = rungS * totalTurns * helixPitch - camZ;

      vec3 aRung = vec3(helixRadius * cos(theta),                helixRadius * sin(theta),                rungZ);
      vec3 bRung = vec3(helixRadius * cos(theta + 3.14159), helixRadius * sin(theta + 3.14159), rungZ);

      if (aRung.z + fov < 0.01 && bRung.z + fov < 0.01) continue;

      float d = projLine(uv, aRung, bRung, fov);
      float avgZ = rungZ + fov;
      float bright = fov / max(avgZ, 0.1);
      bright = clamp(bright, 0.0, 2.0);

      float thick = 0.003 * bright * 0.5;
      float glow  = smoothstep(thick * 5.0, 0.0, d) * bright;
      float core  = smoothstep(thick, 0.0, d) * bright;

      vec3 rungCol = palette(
        rungS * 3.0 + t * 0.7 + paletteShift + 0.15,
        vec3(0.5, 0.5, 0.4),
        vec3(0.4, 0.5, 0.4),
        vec3(0.8, 1.0, 0.6),
        vec3(0.1, 0.0, 0.2)
      );
      color += rungCol * glow * 0.3;
      color += rungCol * core * 1.0;
    }
  }

  // Central vanishing-point glow
  float vpGlow = smoothstep(0.6, 0.0, length(uv));
  vec3 vpCol = palette(
    t * 0.15 + paletteShift,
    vec3(0.1, 0.08, 0.15),
    vec3(0.1, 0.08, 0.2),
    vec3(0.5, 0.8, 1.0),
    vec3(0.2, 0.1, 0.35)
  );
  color += vpCol * vpGlow * 0.07;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
