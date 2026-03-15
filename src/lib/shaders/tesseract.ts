import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// 4D rotation: rotate in the XW plane
vec4 rotXW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(c * p.x - s * p.w, p.y, p.z, s * p.x + c * p.w);
}

// 4D rotation: rotate in the YW plane
vec4 rotYW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(p.x, c * p.y - s * p.w, p.z, s * p.y + c * p.w);
}

// 4D rotation: rotate in the ZW plane
vec4 rotZW(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(p.x, p.y, c * p.z - s * p.w, s * p.z + c * p.w);
}

// 4D rotation: rotate in XY plane (standard 3D Z-axis rotation)
vec4 rotXY(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(c * p.x - s * p.y, s * p.x + c * p.y, p.z, p.w);
}

// 4D rotation: rotate in XZ plane (standard 3D Y-axis rotation)
vec4 rotXZ(vec4 p, float a) {
  float c = cos(a), s = sin(a);
  return vec4(c * p.x - s * p.z, p.y, s * p.x + c * p.z, p.w);
}

// Project 4D point to 2D via perspective
vec2 project4D(vec4 p, float viewDist) {
  float w = viewDist / (viewDist + p.w);
  float z = viewDist / (viewDist + p.z);
  return vec2(p.x * w * z, p.y * w * z);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.3;
  float paletteShift = u_amplitude * 0.35;

  // Rotation speeds — bass drives faster rotation
  float rotSpeed = 0.4 + u_bass * 0.6;

  vec3 color = vec3(0.0);

  // Define 16 vertices of a hypercube as constants
  // All combinations of +/-1 in 4 dimensions
  // We store them as x,y pairs in vec4 arrays: (x0,y0,z0,w0)
  vec4 v0  = vec4(-1.0, -1.0, -1.0, -1.0);
  vec4 v1  = vec4( 1.0, -1.0, -1.0, -1.0);
  vec4 v2  = vec4(-1.0,  1.0, -1.0, -1.0);
  vec4 v3  = vec4( 1.0,  1.0, -1.0, -1.0);
  vec4 v4  = vec4(-1.0, -1.0,  1.0, -1.0);
  vec4 v5  = vec4( 1.0, -1.0,  1.0, -1.0);
  vec4 v6  = vec4(-1.0,  1.0,  1.0, -1.0);
  vec4 v7  = vec4( 1.0,  1.0,  1.0, -1.0);
  vec4 v8  = vec4(-1.0, -1.0, -1.0,  1.0);
  vec4 v9  = vec4( 1.0, -1.0, -1.0,  1.0);
  vec4 v10 = vec4(-1.0,  1.0, -1.0,  1.0);
  vec4 v11 = vec4( 1.0,  1.0, -1.0,  1.0);
  vec4 v12 = vec4(-1.0, -1.0,  1.0,  1.0);
  vec4 v13 = vec4( 1.0, -1.0,  1.0,  1.0);
  vec4 v14 = vec4(-1.0,  1.0,  1.0,  1.0);
  vec4 v15 = vec4( 1.0,  1.0,  1.0,  1.0);

  // Draw multiple nested hypercubes
  for (int layer = 0; layer < 3; layer++) {
    float layerF = float(layer);
    float scale = 0.35 + layerF * 0.2;
    float rotOffset = layerF * 0.4;
    float alphaFade = 1.0 - layerF * 0.25;

    // 4D rotation angles
    float axw = t * rotSpeed + rotOffset;
    float ayw = t * rotSpeed * 0.7 + rotOffset + 1.0;
    float azw = t * rotSpeed * 0.5 + rotOffset + 2.0;
    float axy = t * 0.3 + rotOffset;
    float axz = t * 0.2 + rotOffset;

    // Transform all 16 vertices
    vec4 tv0, tv1, tv2, tv3, tv4, tv5, tv6, tv7;
    vec4 tv8, tv9, tv10, tv11, tv12, tv13, tv14, tv15;

    // Apply 4D rotations then scale
    tv0  = rotXZ(rotXY(rotZW(rotYW(rotXW(v0  * scale, axw), ayw), azw), axy), axz);
    tv1  = rotXZ(rotXY(rotZW(rotYW(rotXW(v1  * scale, axw), ayw), azw), axy), axz);
    tv2  = rotXZ(rotXY(rotZW(rotYW(rotXW(v2  * scale, axw), ayw), azw), axy), axz);
    tv3  = rotXZ(rotXY(rotZW(rotYW(rotXW(v3  * scale, axw), ayw), azw), axy), axz);
    tv4  = rotXZ(rotXY(rotZW(rotYW(rotXW(v4  * scale, axw), ayw), azw), axy), axz);
    tv5  = rotXZ(rotXY(rotZW(rotYW(rotXW(v5  * scale, axw), ayw), azw), axy), axz);
    tv6  = rotXZ(rotXY(rotZW(rotYW(rotXW(v6  * scale, axw), ayw), azw), axy), axz);
    tv7  = rotXZ(rotXY(rotZW(rotYW(rotXW(v7  * scale, axw), ayw), azw), axy), axz);
    tv8  = rotXZ(rotXY(rotZW(rotYW(rotXW(v8  * scale, axw), ayw), azw), axy), axz);
    tv9  = rotXZ(rotXY(rotZW(rotYW(rotXW(v9  * scale, axw), ayw), azw), axy), axz);
    tv10 = rotXZ(rotXY(rotZW(rotYW(rotXW(v10 * scale, axw), ayw), azw), axy), axz);
    tv11 = rotXZ(rotXY(rotZW(rotYW(rotXW(v11 * scale, axw), ayw), azw), axy), axz);
    tv12 = rotXZ(rotXY(rotZW(rotYW(rotXW(v12 * scale, axw), ayw), azw), axy), axz);
    tv13 = rotXZ(rotXY(rotZW(rotYW(rotXW(v13 * scale, axw), ayw), azw), axy), axz);
    tv14 = rotXZ(rotXY(rotZW(rotYW(rotXW(v14 * scale, axw), ayw), azw), axy), axz);
    tv15 = rotXZ(rotXY(rotZW(rotYW(rotXW(v15 * scale, axw), ayw), azw), axy), axz);

    // Project to 2D
    float vd = 3.0;
    vec2 p0  = project4D(tv0,  vd);
    vec2 p1  = project4D(tv1,  vd);
    vec2 p2  = project4D(tv2,  vd);
    vec2 p3  = project4D(tv3,  vd);
    vec2 p4  = project4D(tv4,  vd);
    vec2 p5  = project4D(tv5,  vd);
    vec2 p6  = project4D(tv6,  vd);
    vec2 p7  = project4D(tv7,  vd);
    vec2 p8  = project4D(tv8,  vd);
    vec2 p9  = project4D(tv9,  vd);
    vec2 p10 = project4D(tv10, vd);
    vec2 p11 = project4D(tv11, vd);
    vec2 p12 = project4D(tv12, vd);
    vec2 p13 = project4D(tv13, vd);
    vec2 p14 = project4D(tv14, vd);
    vec2 p15 = project4D(tv15, vd);

    // Edge thickness — treble adds glow
    float edgeWidth = 0.003 + u_treble * 0.004;
    float glowWidth = 0.02 + u_treble * 0.03;

    // Draw all 32 edges of the hypercube
    // Two vertices are connected if they differ in exactly one coordinate
    // That means: edges along X (8), along Y (8), along Z (8), along W (8)

    float edgeDist = 999.0;

    // X-edges (flip bit 0): 0-1, 2-3, 4-5, 6-7, 8-9, 10-11, 12-13, 14-15
    edgeDist = min(edgeDist, sdLine(uv, p0,  p1));
    edgeDist = min(edgeDist, sdLine(uv, p2,  p3));
    edgeDist = min(edgeDist, sdLine(uv, p4,  p5));
    edgeDist = min(edgeDist, sdLine(uv, p6,  p7));
    edgeDist = min(edgeDist, sdLine(uv, p8,  p9));
    edgeDist = min(edgeDist, sdLine(uv, p10, p11));
    edgeDist = min(edgeDist, sdLine(uv, p12, p13));
    edgeDist = min(edgeDist, sdLine(uv, p14, p15));

    // Y-edges (flip bit 1): 0-2, 1-3, 4-6, 5-7, 8-10, 9-11, 12-14, 13-15
    edgeDist = min(edgeDist, sdLine(uv, p0,  p2));
    edgeDist = min(edgeDist, sdLine(uv, p1,  p3));
    edgeDist = min(edgeDist, sdLine(uv, p4,  p6));
    edgeDist = min(edgeDist, sdLine(uv, p5,  p7));
    edgeDist = min(edgeDist, sdLine(uv, p8,  p10));
    edgeDist = min(edgeDist, sdLine(uv, p9,  p11));
    edgeDist = min(edgeDist, sdLine(uv, p12, p14));
    edgeDist = min(edgeDist, sdLine(uv, p13, p15));

    // Z-edges (flip bit 2): 0-4, 1-5, 2-6, 3-7, 8-12, 9-13, 10-14, 11-15
    edgeDist = min(edgeDist, sdLine(uv, p0,  p4));
    edgeDist = min(edgeDist, sdLine(uv, p1,  p5));
    edgeDist = min(edgeDist, sdLine(uv, p2,  p6));
    edgeDist = min(edgeDist, sdLine(uv, p3,  p7));
    edgeDist = min(edgeDist, sdLine(uv, p8,  p12));
    edgeDist = min(edgeDist, sdLine(uv, p9,  p13));
    edgeDist = min(edgeDist, sdLine(uv, p10, p14));
    edgeDist = min(edgeDist, sdLine(uv, p11, p15));

    // W-edges (flip bit 3): 0-8, 1-9, 2-10, 3-11, 4-12, 5-13, 6-14, 7-15
    edgeDist = min(edgeDist, sdLine(uv, p0,  p8));
    edgeDist = min(edgeDist, sdLine(uv, p1,  p9));
    edgeDist = min(edgeDist, sdLine(uv, p2,  p10));
    edgeDist = min(edgeDist, sdLine(uv, p3,  p11));
    edgeDist = min(edgeDist, sdLine(uv, p4,  p12));
    edgeDist = min(edgeDist, sdLine(uv, p5,  p13));
    edgeDist = min(edgeDist, sdLine(uv, p6,  p14));
    edgeDist = min(edgeDist, sdLine(uv, p7,  p15));

    // Edge coloring with multiple palette lookups
    // Palette 1: electric blue-violet wireframe
    vec3 edgeCol1 = palette(
      edgeDist * 10.0 + t * 0.5 + layerF * 0.3 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.5),
      vec3(0.5, 0.8, 1.0),
      vec3(0.0, 0.1, 0.35)
    );

    // Palette 2: warm gold-amber for depth contrast
    vec3 edgeCol2 = palette(
      edgeDist * 8.0 + t * 0.3 + layerF * 0.5 + paletteShift + 0.5,
      vec3(0.5, 0.45, 0.4),
      vec3(0.5, 0.4, 0.3),
      vec3(1.0, 0.7, 0.3),
      vec3(0.0, 0.1, 0.2)
    );

    // Blend based on edge distance for color variation along the edge
    float colBlend = smoothstep(0.0, glowWidth, edgeDist);
    vec3 edgeColor = mix(edgeCol1, edgeCol2, colBlend * 0.5 + 0.25);

    // Sharp edge core
    float edgeCore = smoothstep(edgeWidth, 0.0, edgeDist);
    // Soft glow halo
    float edgeGlow = smoothstep(glowWidth, 0.0, edgeDist);

    color += edgeColor * edgeGlow * 0.4 * alphaFade;
    color += edgeColor * edgeCore * 1.2 * alphaFade;

    // Vertex dots at projected positions — glow at each vertex
    float vertDist = 999.0;
    vertDist = min(vertDist, length(uv - p0));
    vertDist = min(vertDist, length(uv - p1));
    vertDist = min(vertDist, length(uv - p2));
    vertDist = min(vertDist, length(uv - p3));
    vertDist = min(vertDist, length(uv - p4));
    vertDist = min(vertDist, length(uv - p5));
    vertDist = min(vertDist, length(uv - p6));
    vertDist = min(vertDist, length(uv - p7));
    vertDist = min(vertDist, length(uv - p8));
    vertDist = min(vertDist, length(uv - p9));
    vertDist = min(vertDist, length(uv - p10));
    vertDist = min(vertDist, length(uv - p11));
    vertDist = min(vertDist, length(uv - p12));
    vertDist = min(vertDist, length(uv - p13));
    vertDist = min(vertDist, length(uv - p14));
    vertDist = min(vertDist, length(uv - p15));

    float vertGlow = smoothstep(0.025, 0.0, vertDist);
    float vertCore = smoothstep(0.008, 0.0, vertDist);

    // Palette 3: vertex color — bright cyan-white
    vec3 vertCol = palette(
      vertDist * 20.0 + t * 0.8 + paletteShift + 0.2,
      vec3(0.6, 0.6, 0.7),
      vec3(0.4, 0.4, 0.5),
      vec3(0.3, 0.8, 1.0),
      vec3(0.1, 0.15, 0.3)
    );

    color += vertCol * vertGlow * 1.0 * alphaFade;

    // Emissive warm white on vertex cores
    color += vec3(1.3, 1.2, 1.05) * vertCore * 2.0 * alphaFade;

    // Cool white emissive on edge cores closest to camera
    float hotEdge = smoothstep(edgeWidth * 0.5, 0.0, edgeDist);
    color += vec3(1.05, 1.2, 1.45) * hotEdge * 1.8 * alphaFade * (0.5 + u_treble * 1.0);
  }

  // Ambient glow around center
  float centerGlow = smoothstep(0.8, 0.0, length(uv));
  vec3 ambientCol = palette(
    length(uv) + t * 0.1 + paletteShift,
    vec3(0.15, 0.1, 0.2),
    vec3(0.15, 0.1, 0.2),
    vec3(0.6, 0.5, 1.0),
    vec3(0.2, 0.1, 0.4)
  );
  color += ambientCol * centerGlow * 0.1;

  gl_FragColor = vec4(color, 1.0);
}
`;
