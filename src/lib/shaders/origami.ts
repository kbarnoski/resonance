import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Rotate view slowly
  vec2 uvR = rot2(t * 0.07) * uv;

  // Scale for the triangular grid
  float scale = 5.0 + u_mid * 1.0;
  vec2 p = uvR * scale;

  // Create a triangular grid by combining two diagonal axes
  // Each cell is split into two triangles by the diagonal

  // Skewed grid for equilateral triangles
  vec2 skew = vec2(p.x + p.y * 0.5774, p.y * 1.1547); // 1/sqrt(3), 2/sqrt(3)
  vec2 cellId = floor(skew);
  vec2 cellLocal = fract(skew);

  // Which triangle: upper or lower within the parallelogram cell
  float isUpper = step(cellLocal.x + cellLocal.y, 1.0);

  // Triangle identifier
  float triId = cellId.x * 17.0 + cellId.y * 31.0 + isUpper * 7.0;

  // Triangle centroid for fold angle calculation
  vec2 centroid;
  if (isUpper > 0.5) {
    centroid = (vec2(0.0, 0.0) + vec2(1.0, 0.0) + vec2(0.0, 1.0)) / 3.0;
  } else {
    centroid = (vec2(1.0, 0.0) + vec2(0.0, 1.0) + vec2(1.0, 1.0)) / 3.0;
  }

  // Distance from local point to centroid (within triangle)
  float dCenter = length(cellLocal - centroid);

  // === FOLD SIMULATION ===
  // Each triangle facet has a fold angle driven by noise and audio
  // This simulates light hitting angled paper surfaces

  // Fold angle per triangle: based on position and time
  float foldNoise = snoise(cellId * 0.4 + t * 0.3);
  float foldAngle = foldNoise * 0.8 + u_bass * sin(triId * 0.7 + t * 2.0) * 0.4;

  // Simulate a 3D normal for the folded facet
  // The fold axis varies per triangle
  float foldAxis = triId * 0.3 + t * 0.15;
  vec3 foldNormal = normalize(vec3(
    sin(foldAngle) * cos(foldAxis),
    sin(foldAngle) * sin(foldAxis),
    cos(foldAngle)
  ));

  // Light direction: slowly rotating overhead light
  vec3 lightDir = normalize(vec3(
    cos(t * 0.4) * 0.5,
    sin(t * 0.3) * 0.5,
    0.8
  ));

  // Second light for fill (from below-left)
  vec3 light2Dir = normalize(vec3(-0.4, -0.3, 0.6));

  // Diffuse lighting on each facet
  float diffuse1 = max(dot(foldNormal, lightDir), 0.0);
  float diffuse2 = max(dot(foldNormal, light2Dir), 0.0);

  // Specular highlight for crisp paper feel
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir1 = normalize(lightDir + viewDir);
  float spec1 = pow(max(dot(foldNormal, halfDir1), 0.0), 32.0);

  vec3 halfDir2 = normalize(light2Dir + viewDir);
  float spec2 = pow(max(dot(foldNormal, halfDir2), 0.0), 16.0);

  // Facet base color
  vec3 facetCol = palette(
    triId * 0.04 + t * 0.15 + paletteShift,
    vec3(0.55, 0.55, 0.55),
    vec3(0.4, 0.4, 0.5),
    vec3(0.9, 0.7, 0.5),
    vec3(0.0, 0.1, 0.25)
  );

  // Secondary facet palette for variety
  vec3 facetCol2 = palette(
    triId * 0.04 + t * 0.15 + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.6),
    vec3(0.35, 0.4, 0.5),
    vec3(0.6, 0.9, 0.7),
    vec3(0.1, 0.15, 0.35)
  );

  // Mix facet colors based on fold angle
  vec3 surfaceCol = mix(facetCol, facetCol2, smoothstep(-0.3, 0.3, foldNoise));

  // Apply lighting
  float ambient = 0.15;
  color += surfaceCol * (ambient + diffuse1 * 0.55 + diffuse2 * 0.3);

  // Specular highlights: bright paper glint
  vec3 specCol = palette(
    foldAngle + t * 0.4 + paletteShift + 0.3,
    vec3(0.9, 0.9, 0.9),
    vec3(0.3, 0.2, 0.3),
    vec3(0.8, 0.6, 1.0),
    vec3(0.0, 0.05, 0.1)
  );
  color += specCol * spec1 * 0.7;
  color += specCol * 0.7 * spec2 * 0.3;

  // === CREASE LINES ===
  // Sharp dark lines at triangle edges (the folds)

  // Edge distances in the skewed triangle grid
  float edgeDist;
  if (isUpper > 0.5) {
    float e1 = cellLocal.x;
    float e2 = cellLocal.y;
    float e3 = 1.0 - cellLocal.x - cellLocal.y;
    edgeDist = min(min(e1, e2), max(e3, 0.0));
  } else {
    float e1 = 1.0 - cellLocal.x;
    float e2 = 1.0 - cellLocal.y;
    float e3 = cellLocal.x + cellLocal.y - 1.0;
    edgeDist = min(min(e1, e2), max(e3, 0.0));
  }

  // Sharp crease: dark line
  float creaseWidth = 0.03 + u_treble * 0.01;
  float crease = smoothstep(creaseWidth, creaseWidth * 0.3, edgeDist);

  // Crease darkening
  color *= 1.0 - crease * 0.7;

  // Crease highlight: light catches the edge
  float creaseHighlight = smoothstep(creaseWidth * 0.5, 0.0, edgeDist);
  vec3 creaseCol = palette(
    triId * 0.06 + t * 0.3 + paletteShift + 0.6,
    vec3(0.6, 0.6, 0.7),
    vec3(0.3, 0.3, 0.5),
    vec3(0.5, 0.8, 1.0),
    vec3(0.05, 0.1, 0.3)
  );
  color += creaseCol * creaseHighlight * 0.25;

  // Bass response: certain facets flash brighter
  float bassFlash = smoothstep(0.3, 0.8, sin(triId * 1.7 + t * 4.0)) * u_bass;
  color += surfaceCol * bassFlash * 0.25;

  // Treble: crisp edge sparkle
  color += vec3(1.0, 0.95, 0.88) * creaseHighlight * u_treble * 0.3;

  // Subtle shadow in valleys (facets angled away from light)
  float shadow = smoothstep(0.3, 0.0, diffuse1) * 0.15;
  color *= 1.0 - shadow;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
