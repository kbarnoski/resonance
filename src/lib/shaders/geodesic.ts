import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// ---- Ray march helpers ----

// Sphere SDF
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// Torus SDF for equatorial ring
float sdTorusSmall(vec3 p, float R, float r) {
  return length(vec2(length(p.xz) - R, p.y)) - r;
}

// Normal estimation
vec3 sphereNormal(vec3 p) {
  float e = 0.0005;
  float d = sdSphere(p, 1.0);
  return normalize(vec3(
    sdSphere(p + vec3(e,0,0), 1.0) - d,
    sdSphere(p + vec3(0,e,0), 1.0) - d,
    sdSphere(p + vec3(0,0,e), 1.0) - d
  ));
}

// ---- Geodesic triangulation ----
// Frequency-2 icosahedral geodesic projected onto unit sphere.
// We'll compute the geodesic wireframe analytically on the sphere surface.

// Convert 3D point on unit sphere to spherical coordinates
vec2 sphereUV(vec3 p) {
  return vec2(atan(p.z, p.x) / 6.28318, asin(clamp(p.y, -1.0, 1.0)) / 3.14159 + 0.5);
}

// Icosahedron: 12 vertices on unit sphere
// Using the standard golden-ratio construction
const float IPHI = 1.61803398875; // golden ratio

vec3 icoVertex(int i) {
  float t = 1.0 / sqrt(1.0 + IPHI * IPHI);
  float t2 = IPHI * t;
  // 12 vertices: (0, +-1, +-phi) normalized, and permutations
  // Row 0: (0, +-t, +-t2)
  // Row 1: (+-t, +-t2, 0)
  // Row 2: (+-t2, 0, +-t)
  if (i == 0)  return normalize(vec3( 0.0,  t,  t2));
  if (i == 1)  return normalize(vec3( 0.0,  t, -t2));
  if (i == 2)  return normalize(vec3( 0.0, -t,  t2));
  if (i == 3)  return normalize(vec3( 0.0, -t, -t2));
  if (i == 4)  return normalize(vec3( t,  t2,  0.0));
  if (i == 5)  return normalize(vec3( t, -t2,  0.0));
  if (i == 6)  return normalize(vec3(-t,  t2,  0.0));
  if (i == 7)  return normalize(vec3(-t, -t2,  0.0));
  if (i == 8)  return normalize(vec3( t2, 0.0,  t));
  if (i == 9)  return normalize(vec3( t2, 0.0, -t));
  if (i == 10) return normalize(vec3(-t2, 0.0,  t));
  return normalize(vec3(-t2, 0.0, -t));
}

// Great circle arc distance: angular distance between two directions
// and distance of point p (on unit sphere) from the great circle arc A-B
float arcDist(vec3 p, vec3 a, vec3 b) {
  // Great circle normal
  vec3 n = normalize(cross(a, b));
  // Distance from great circle plane
  float planeDist = abs(dot(p, n));
  // Clamp to arc: check if projection falls within the shorter arc
  float cosAB = dot(a, b);
  float cosPA = dot(p, a);
  float cosPB = dot(p, b);
  // Point is within the arc if it projects correctly
  // Use a simple check: the angular position along the arc
  float arcLen = acos(clamp(cosAB, -1.0, 1.0));
  if (arcLen < 0.001) return planeDist;
  float alongA = acos(clamp(cosPA, -1.0, 1.0));
  float alongB = acos(clamp(cosPB, -1.0, 1.0));
  if (alongA > arcLen + 0.1 || alongB > arcLen + 0.1) {
    // Outside arc: return distance to nearest endpoint
    return min(acos(clamp(cosPA, -1.0, 1.0)), acos(clamp(cosPB, -1.0, 1.0)));
  }
  return asin(clamp(planeDist, 0.0, 1.0));
}

// Geodesic midpoint on sphere
vec3 midpoint(vec3 a, vec3 b) {
  return normalize(a + b);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  vec3 camPos = vec3(0.0, 0.0, 2.8 - u_bass * 0.2);
  vec3 rayDir = normalize(vec3(uv, -1.6));

  // Rotate sphere
  float rotY = t * 0.35 + u_mid * 0.15;
  float rotX = t * 0.22 + u_bass * 0.08;
  rayDir.xz  = rot2(rotY) * rayDir.xz;
  rayDir.yz  = rot2(rotX) * rayDir.yz;
  camPos.xz  = rot2(rotY) * camPos.xz;
  camPos.yz  = rot2(rotX) * camPos.yz;

  vec3 color = vec3(0.0);

  // Ray-sphere intersection
  float sphereR = 1.0;
  vec3 oc = camPos;
  float b  = dot(oc, rayDir);
  float c  = dot(oc, oc) - sphereR * sphereR;
  float disc = b * b - c;

  if (disc >= 0.0) {
    float sqrtDisc = sqrt(disc);
    float t1 = -b - sqrtDisc;
    float t2 = -b + sqrtDisc;

    // Both front and back face for transparency effect
    for (int face = 0; face < 2; face++) {
      float tHit = (face == 0) ? t1 : t2;
      if (tHit < 0.0) continue;

      vec3 hitP = camPos + rayDir * tHit;
      vec3 n    = normalize(hitP) * (face == 0 ? 1.0 : -1.0);

      // Compute geodesic wireframe distance on sphere surface
      // We iterate over icosahedron edges and frequency-2 subdivisions
      float minEdgeDist = 999.0;

      // Icosahedron edges: 30 edges
      // For brevity we check a representative set + midpoint subdivisions
      // Edge pairs (i,j) that are adjacent in the icosahedron
      int edgePairs[60]; // 30 edges * 2 indices
      // Adjacency: standard icosahedron edges
      // top vertex 0: connected to 4,6,8,10,2
      // Store as sequential pairs
      int ep[60];
      ep[0]=0; ep[1]=4;   ep[2]=0; ep[3]=6;   ep[4]=0; ep[5]=8;
      ep[6]=0; ep[7]=10;  ep[8]=0; ep[9]=2;    ep[10]=1; ep[11]=4;
      ep[12]=1; ep[13]=6; ep[14]=1; ep[15]=9;  ep[16]=1; ep[17]=11;
      ep[18]=1; ep[19]=3; ep[20]=2; ep[21]=8;  ep[22]=2; ep[23]=10;
      ep[24]=2; ep[25]=5; ep[26]=2; ep[27]=7;  ep[28]=3; ep[29]=9;
      ep[30]=3; ep[31]=11; ep[32]=3; ep[33]=5; ep[34]=3; ep[35]=7;
      ep[36]=4; ep[37]=8; ep[38]=4; ep[39]=9;  ep[40]=4; ep[41]=6;
      ep[42]=5; ep[43]=8; ep[44]=5; ep[45]=9;  ep[46]=6; ep[47]=10;
      ep[48]=6; ep[49]=11; ep[50]=7; ep[51]=10; ep[52]=7; ep[53]=11;
      ep[54]=8; ep[55]=10; ep[56]=9; ep[57]=11; ep[58]=10; ep[59]=11;

      for (int e = 0; e < 30; e++) {
        int ia = ep[e*2];
        int ib = ep[e*2+1];
        vec3 va = icoVertex(ia);
        vec3 vb = icoVertex(ib);

        // Frequency-2: add midpoint, creating 2 sub-edges
        vec3 vm = midpoint(va, vb);

        float d1 = arcDist(hitP, va, vm);
        float d2 = arcDist(hitP, vm, vb);
        minEdgeDist = min(minEdgeDist, min(d1, d2));
      }

      // Wire thickness — treble makes it glow more
      float lineThick = 0.04 + u_treble * 0.015;
      float wireGlow  = smoothstep(lineThick * 2.5, 0.0, minEdgeDist);
      float wireCore  = smoothstep(lineThick, 0.0, minEdgeDist);

      // Depth: back face is dimmer
      float depthFade = (face == 0) ? 1.0 : 0.35;

      // Palette 1: main wireframe color
      vec2 sUV = sphereUV(hitP);
      vec3 wireCol1 = palette(
        sUV.x * 2.0 + sUV.y + t * 0.4 + paletteShift,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.4, 0.6),
        vec3(0.7, 1.0, 0.5),
        vec3(0.0, 0.1, 0.4)
      );
      // Palette 2: back-face glow color
      vec3 wireCol2 = palette(
        sUV.x * 1.5 + t * 0.25 + paletteShift + 0.45,
        vec3(0.4, 0.4, 0.5),
        vec3(0.3, 0.3, 0.5),
        vec3(0.5, 0.8, 1.0),
        vec3(0.2, 0.1, 0.35)
      );
      vec3 wireCol = (face == 0) ? wireCol1 : wireCol2;

      color += wireCol * wireGlow * 0.4 * depthFade;
      color += wireCol * wireCore * 1.2 * depthFade;

      // Fresnel rim
      float fresnel = pow(1.0 - abs(dot(n, normalize(camPos - hitP))), 4.0);
      color += wireCol * fresnel * 0.2 * depthFade;
    }
  } else {
    // Near miss: soft ambient glow
    float miss = exp(-disc * -2.0) * 0.0;
    miss = smoothstep(0.1, 0.0, abs(disc)) * 0.15;
    vec3 missCol = palette(
      t * 0.2 + paletteShift + 0.3,
      vec3(0.1, 0.1, 0.18),
      vec3(0.1, 0.1, 0.2),
      vec3(0.4, 0.7, 1.0),
      vec3(0.2, 0.1, 0.35)
    );
    color += missCol * miss;
  }

  // Nested spheres in depth: smaller fainter concentric geodesics
  for (int shell = 1; shell <= 3; shell++) {
    float shellR = 1.0 + float(shell) * 0.45;
    vec3 ocS = camPos;
    float bS  = dot(ocS, rayDir);
    float cS  = dot(ocS, ocS) - shellR * shellR;
    float dS  = bS * bS - cS;
    if (dS < 0.0) continue;
    float tS  = -bS - sqrt(dS);
    if (tS < 0.0) tS = -bS + sqrt(dS);
    if (tS < 0.0) continue;
    vec3 hS   = camPos + rayDir * tS;
    vec3 sUVS = vec3(sphereUV(normalize(hS)), 0.0);

    // Simple lat/lon wireframe on outer shells
    float latLines = abs(fract(sUVS.y * 8.0) - 0.5);
    float lonLines = abs(fract(sUVS.x * 16.0) - 0.5);
    float shellWire = min(latLines, lonLines);
    float shellGlow = smoothstep(0.06, 0.0, shellWire) * (0.18 / float(shell));

    vec3 shellCol = palette(
      sUVS.x + t * 0.15 + paletteShift + float(shell) * 0.3,
      vec3(0.4, 0.4, 0.5),
      vec3(0.3, 0.3, 0.5),
      vec3(0.6, 0.8, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += shellCol * shellGlow;
  }

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
