// cathedral.ts — 564-piano-splat-cathedral
//
// Anisotropic depth-sorted Gaussian-splat cathedral renderer.
//
// Architecture: procedurally generated cathedral — a nave flanked by columns,
// connecting arches, a vaulted ceiling, and a rose window at the far end.
// Each structural element is a cluster of anisotropic splats whose principal
// axis aligns to the surface (column: vertical, arch: tangent, vault: normal).
//
// Upgrades over cycle-1 (557-piano-splat-galaxy):
//   1. ANISOTROPIC splats: each splat carries a 3D orientation axis + aspect
//      ratio. In the vertex shader we project to screen space as an oriented
//      ellipse; the fragment shader evaluates an elliptical Gaussian in local
//      UV. Splats on columns look like flat vertical flakes; arch splats follow
//      the curve tangent; vault splats lie flat against the ceiling.
//   2. DEPTH SORTING + alpha-over compositing: every frame we sort live splats
//      back-to-front by view-space Z. We use an index sort (Array.sort on
//      indices keyed by view-Z), then repack the upload buffer. Blend mode:
//      SRC_ALPHA, ONE_MINUS_SRC_ALPHA (over-compositing), depth test OFF.
//      Near columns visibly occlude far ones — the structural depth the galaxy
//      lacked.
//
// CPU pool: struct-of-arrays, 10k splats total.
// GPU: raw WebGL2, instanced draw, one quad per splat.
//
// References:
//   Kerbl et al., "3D Gaussian Splatting for Real-Time Radiance Field
//     Rendering," SIGGRAPH 2023 — anisotropic splat formalism.
//   Zwicker et al., "EWA Volume Splatting," 2001 — anisotropic projection.
//   antimatter15/splat — CPU depth sort for WebGL splatting.
//   James Turrell — architectural light; Refik Anadol — volumetric data arch.

export const MAX_SPLATS = 10000;

// Per-instance float layout:
//   pos(3) axisX(3) axisY(3) halfSizeA(1) halfSizeB(1) color(3) alpha(1)
// = 15 floats per splat
const INST_FLOATS = 15;

// ─── mat4 helpers (column-major, no deps) ─────────────────────────────────────

function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY * 0.5);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function mat4LookAt(
  ex: number, ey: number, ez: number,
  cx: number, cy: number, cz: number,
): Float32Array {
  // z axis = normalize(eye - center)
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;

  // x axis = normalize(cross(worldUp=[0,1,0], z))
  // cross([0,1,0], z) = [1*zz - 0*zy, 0*zx - 0*zz, 0*zy - 1*zx] = [zz, 0, -zx]
  let xx = zz, xy = 0, xz = -zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;

  // y axis = cross(z, x)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0]=xx; m[1]=yx; m[2]=zx; m[3]=0;
  m[4]=xy; m[5]=yy; m[6]=zy; m[7]=0;
  m[8]=xz; m[9]=yz; m[10]=zz; m[11]=0;
  m[12]=-(xx*ex + xy*ey + xz*ez);
  m[13]=-(yx*ex + yy*ey + yz*ez);
  m[14]=-(zx*ex + zy*ey + zz*ez);
  m[15]=1;
  return m;
}

// ─── Hue → RGB ────────────────────────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// ─── Cathedral architecture definition ────────────────────────────────────────
//
// The cathedral is defined as a list of "structural elements." Each element
// is a named cluster of splat positions+orientations that are spawned when
// the music "raises" that element. Elements are listed roughly in build order.
// The nave floor is implicit; everything grows up from it.
//
// Coordinate system:
//   +Z = forward (toward rose window, far end of nave)
//   +X = right
//   +Y = up
//   Origin = nave floor center, near end.

const NAVE_LENGTH = 18;   // Z extent of nave
const NAVE_WIDTH  = 6;    // X extent (half = 3)
const COLUMN_H    = 7;    // height of columns
const ARCH_RISE   = 2;    // extra height of arches above column tops
const VAULT_H     = COLUMN_H + ARCH_RISE + 2; // peak of vaulted ceiling

export interface StructuralElement {
  name: string;
  kind: "column" | "arch" | "vault" | "floor" | "rose" | "transsept" | "ambient";
  // Pre-generated splat positions + orientations in world space.
  // Stored as flat arrays: positions (N*3), axisA (N*3), axisB (N*3),
  // sizeA (N), sizeB (N).
  positions: Float32Array;
  axisA: Float32Array;  // primary axis (e.g. vertical for column)
  axisB: Float32Array;  // secondary axis (cross-product of axisA and normal)
  sizeA: Float32Array;  // major half-radius (world units)
  sizeB: Float32Array;  // minor half-radius
  baseHue: number;      // 0..1 hue for stone colour
  count: number;
}

/** Generate a column cluster: vertical splats stacked along Y. */
function genColumn(cx: number, cz: number, count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = t * COLUMN_H;
    const jx = (Math.random() - 0.5) * 0.35;
    const jz = (Math.random() - 0.5) * 0.35;
    positions[i*3]   = cx + jx;
    positions[i*3+1] = y + (Math.random() - 0.5) * 0.2;
    positions[i*3+2] = cz + jz;
    // Column axis = vertical (0,1,0), secondary = horizontal
    axisA[i*3]=0; axisA[i*3+1]=1; axisA[i*3+2]=0;
    axisB[i*3]=1; axisB[i*3+1]=0; axisB[i*3+2]=0;
    // Tall thin flakes (major axis vertical, minor horizontal)
    sizeA[i] = 0.18 + Math.random() * 0.12;
    sizeB[i] = 0.06 + Math.random() * 0.06;
  }
  return { kind: "column", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Generate an arch: semicircular arc of splats connecting two column tops. */
function genArch(x1: number, x2: number, z: number, topY: number, count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);

  const cx = (x1 + x2) * 0.5;
  const radius = Math.abs(x2 - x1) * 0.5;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * (i / (count - 1)); // 0..π (semicircle, left to right)
    const px = cx + Math.cos(Math.PI - angle) * radius;
    const py = topY + Math.sin(angle) * ARCH_RISE;
    const jitter = (Math.random() - 0.5) * 0.15;
    positions[i*3]   = px + jitter;
    positions[i*3+1] = py + (Math.random() - 0.5) * 0.12;
    positions[i*3+2] = z  + (Math.random() - 0.5) * 0.15;
    // Arch tangent direction
    const tx = -Math.sin(Math.PI - angle);
    const ty =  Math.cos(angle);
    const tl = Math.hypot(tx, ty) || 1;
    axisA[i*3]=tx/tl; axisA[i*3+1]=ty/tl; axisA[i*3+2]=0;
    axisB[i*3]=0; axisB[i*3+1]=0; axisB[i*3+2]=1;
    sizeA[i] = 0.2 + Math.random() * 0.1;
    sizeB[i] = 0.05 + Math.random() * 0.04;
  }
  return { kind: "arch", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Generate vault panels: flat anisotropic splats on the ceiling surface. */
function genVaultPanel(zStart: number, zEnd: number, count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const angle = u * Math.PI; // along cross-section arc
    const arcR = NAVE_WIDTH * 0.5;
    const xCurve = Math.cos(Math.PI * 0.5 + angle * 0.5) * arcR * 0.8;
    const yCurve = VAULT_H - (1 - Math.sin(Math.PI * 0.5 + (angle - Math.PI * 0.5) * 0.7)) * ARCH_RISE * 0.6;
    const zCurve = zStart + v * (zEnd - zStart);
    positions[i*3]   = xCurve + (Math.random() - 0.5) * 0.3;
    positions[i*3+1] = yCurve + (Math.random() - 0.5) * 0.25;
    positions[i*3+2] = zCurve + (Math.random() - 0.5) * 0.25;
    // Vault normal ~ upward-ish; lay splat flat on ceiling surface
    axisA[i*3]=0; axisA[i*3+1]=0; axisA[i*3+2]=1;  // Z-aligned (along nave)
    axisB[i*3]=1; axisB[i*3+1]=0; axisB[i*3+2]=0;  // X-aligned (across nave)
    sizeA[i] = 0.22 + Math.random() * 0.15;
    sizeB[i] = 0.12 + Math.random() * 0.10;
  }
  return { kind: "vault", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Rose window: disc of splats arranged in concentric petal rings. */
function genRoseWindow(count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);

  const wz = NAVE_LENGTH;
  const wcx = 0;
  const wcy = COLUMN_H + ARCH_RISE;

  for (let i = 0; i < count; i++) {
    // Fibonacci-ish spiral for even coverage.
    const ring = Math.floor(i / 8);
    const slot = i % 8;
    const r = (ring / (count / 8)) * 2.8;
    const theta = slot * (Math.PI * 2 / 8) + ring * 0.5;
    const petals = 8;
    const petal = theta * petals;
    const petalR = r * (0.8 + 0.2 * Math.cos(petal));
    const px = wcx + Math.cos(theta) * petalR;
    const py = wcy + Math.sin(theta) * petalR;
    positions[i*3]   = px + (Math.random() - 0.5) * 0.1;
    positions[i*3+1] = py + (Math.random() - 0.5) * 0.1;
    positions[i*3+2] = wz + (Math.random() - 0.5) * 0.1;
    // Rose window faces forward (normal = Z), splats lie in XY plane.
    axisA[i*3]=1; axisA[i*3+1]=0; axisA[i*3+2]=0;
    axisB[i*3]=0; axisB[i*3+1]=1; axisB[i*3+2]=0;
    // Elongated along radial direction.
    const ra = Math.atan2(py - wcy, px - wcx);
    axisA[i*3]=Math.cos(ra); axisA[i*3+1]=Math.sin(ra); axisA[i*3+2]=0;
    axisB[i*3]=-Math.sin(ra); axisB[i*3+1]=Math.cos(ra); axisB[i*3+2]=0;
    sizeA[i] = 0.1 + Math.random() * 0.08;
    sizeB[i] = 0.04 + Math.random() * 0.04;
  }
  return { kind: "rose", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Floor: flat splats along nave floor. */
function genFloor(count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random() - 0.5) * NAVE_WIDTH;
    positions[i*3+1] = (Math.random() - 0.5) * 0.1;
    positions[i*3+2] = Math.random() * NAVE_LENGTH;
    axisA[i*3]=1; axisA[i*3+1]=0; axisA[i*3+2]=0;
    axisB[i*3]=0; axisB[i*3+1]=0; axisB[i*3+2]=1;
    sizeA[i] = 0.25 + Math.random() * 0.3;
    sizeB[i] = 0.12 + Math.random() * 0.15;
  }
  return { kind: "floor", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Transept: crossing arms. */
function genTranssept(side: number, count: number): Omit<StructuralElement, "name" | "baseHue"> {
  const positions = new Float32Array(count * 3);
  const axisA = new Float32Array(count * 3);
  const axisB = new Float32Array(count * 3);
  const sizeA = new Float32Array(count);
  const sizeB = new Float32Array(count);
  const tz = NAVE_LENGTH * 0.55;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const x = side * (NAVE_WIDTH * 0.5 + t * 4.5);
    const y = Math.random() * COLUMN_H;
    positions[i*3]   = x;
    positions[i*3+1] = y + (Math.random() - 0.5) * 0.5;
    positions[i*3+2] = tz + (Math.random() - 0.5) * 0.5;
    // Transept: horizontal + vertical splats
    axisA[i*3]=1; axisA[i*3+1]=0; axisA[i*3+2]=0;
    axisB[i*3]=0; axisB[i*3+1]=1; axisB[i*3+2]=0;
    sizeA[i] = 0.15 + Math.random() * 0.12;
    sizeB[i] = 0.08 + Math.random() * 0.06;
  }
  return { kind: "transsept", positions, axisA, axisB, sizeA, sizeB, count };
}

/** Build all structural elements in order. Music "raises" them in sequence. */
export function buildCathedralElements(): StructuralElement[] {
  const elements: StructuralElement[] = [];
  const SPLATS_PER_COL = 120;
  const SPLATS_PER_ARCH = 80;
  const SPLATS_VAULT = 200;
  const SPLATS_FLOOR = 160;
  const SPLATS_ROSE = 240;
  const SPLATS_TRANSEPT = 140;
  const SPLATS_AMBIENT = 80;

  // Stone palette: warm golden amber, cool cerulean, deep violet, rose.
  const stoneHues = [0.08, 0.06, 0.62, 0.72, 0.82, 0.12, 0.55];

  let hueIdx = 0;
  const nextHue = () => stoneHues[hueIdx++ % stoneHues.length];

  // 1. Floor — immediate context
  elements.push({ name: "floor", ...genFloor(SPLATS_FLOOR), baseHue: nextHue() });

  // 2–9. Columns (4 pairs along nave, at Z = 2, 6, 10, 14)
  const columnZs = [2, 5, 8, 11, 14];
  for (const cz of columnZs) {
    elements.push({ name: `col-L-${cz}`, ...genColumn(-NAVE_WIDTH * 0.5 + 0.5, cz, SPLATS_PER_COL), baseHue: nextHue() });
    elements.push({ name: `col-R-${cz}`, ...genColumn( NAVE_WIDTH * 0.5 - 0.5, cz, SPLATS_PER_COL), baseHue: nextHue() });
  }

  // 10–14. Arches connecting column tops
  for (const cz of columnZs) {
    elements.push({ name: `arch-${cz}`,
      ...genArch(-NAVE_WIDTH * 0.5 + 0.5, NAVE_WIDTH * 0.5 - 0.5, cz, COLUMN_H, SPLATS_PER_ARCH),
      baseHue: nextHue() });
  }

  // 15. Transept (the crossing)
  elements.push({ name: "transept-L", ...genTranssept(-1, SPLATS_TRANSEPT), baseHue: nextHue() });
  elements.push({ name: "transept-R", ...genTranssept( 1, SPLATS_TRANSEPT), baseHue: nextHue() });

  // 16–19. Vault panels (4 bays)
  const vaultBays = [[0, 4.5], [4.5, 9], [9, 13.5], [13.5, NAVE_LENGTH]];
  for (const [zs, ze] of vaultBays) {
    elements.push({ name: `vault-${zs}`, ...genVaultPanel(zs, ze, SPLATS_VAULT), baseHue: nextHue() });
  }

  // 20. Rose window — the climax
  elements.push({ name: "rose-window", ...genRoseWindow(SPLATS_ROSE), baseHue: nextHue() });

  // 21. Ambient glow — final diffuse fill
  {
    const aCount = SPLATS_AMBIENT;
    const pos = new Float32Array(aCount * 3);
    const aA = new Float32Array(aCount * 3);
    const aB = new Float32Array(aCount * 3);
    const sA = new Float32Array(aCount);
    const sB = new Float32Array(aCount);
    for (let i = 0; i < aCount; i++) {
      pos[i*3]   = (Math.random() - 0.5) * NAVE_WIDTH;
      pos[i*3+1] = 1 + Math.random() * (VAULT_H - 2);
      pos[i*3+2] = Math.random() * NAVE_LENGTH;
      aA[i*3]=0; aA[i*3+1]=1; aA[i*3+2]=0;
      aB[i*3]=1; aB[i*3+1]=0; aB[i*3+2]=0;
      sA[i] = 0.35 + Math.random() * 0.4;
      sB[i] = 0.35 + Math.random() * 0.4;
    }
    elements.push({ name: "ambient", kind: "ambient",
      positions: pos, axisA: aA, axisB: aB, sizeA: sA, sizeB: sB,
      baseHue: 0.08, count: aCount });
  }

  return elements;
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

// Each splat instance:
//   aPos(3), aAxisA(3), aAxisB(3), aSizeA(1), aSizeB(1), aColor(3), aAlpha(1)
// Total 15 floats.
// The vertex shader projects the anisotropic oriented splat to screen-space,
// outputting the local UV in the ellipse's principal frame for the fragment.

const VERT_SRC = `#version 300 es
precision highp float;
// Quad corner in [-1,1]^2 (billboard quad)
layout(location=0) in vec2 aCorner;
// Per-instance
layout(location=1) in vec3 aPos;
layout(location=2) in vec3 aAxisA;   // principal world axis (normalised)
layout(location=3) in vec3 aAxisB;   // secondary world axis (normalised)
layout(location=4) in float aSizeA;  // half-size along axis A (world)
layout(location=5) in float aSizeB;  // half-size along axis B (world)
layout(location=6) in vec3 aColor;
layout(location=7) in float aAlpha;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uViewport; // (width, height) in pixels

out vec2 vLocal;   // local coords in ellipse frame, scaled so 1.0 = Gaussian 0
out vec3 vColor;
out float vAlpha;

void main() {
  // Splat centre in view space
  vec4 vsCenter = uView * vec4(aPos, 1.0);

  // Project axes to view space (3x3 part of view, no translation)
  vec3 vsA = mat3(uView) * aAxisA;
  vec3 vsB = mat3(uView) * aAxisB;

  // EWA projection: project axis tips to clip space, subtract centre.
  // This gives the screen-space ellipse axes accounting for perspective.
  vec4 clipCenter = uProj * vsCenter;
  float wc = clipCenter.w;

  vec4 clipTipA = uProj * (vsCenter + vec4(vsA * aSizeA, 0.0));
  vec4 clipTipB = uProj * (vsCenter + vec4(vsB * aSizeB, 0.0));

  vec2 ndcCenter = clipCenter.xy / wc;
  vec2 screenA   = (clipTipA.xy / clipTipA.w - ndcCenter) * uViewport * 0.5;
  vec2 screenB   = (clipTipB.xy / clipTipB.w - ndcCenter) * uViewport * 0.5;

  // The ellipse semi-axes in screen pixels.
  float lenA = max(length(screenA), 1.0);
  float lenB = max(length(screenB), 1.0);
  vec2 dirA  = normalize(screenA);
  vec2 dirB  = normalize(screenB);

  // Expand quad to cover the ellipse bounding box (plus 2-sigma margin).
  float kA = lenA * 2.0; // 2-sigma coverage
  float kB = lenB * 2.0;
  // Corner in screen pixels:
  vec2 screenCorner = dirA * (aCorner.x * kA) + dirB * (aCorner.y * kB);
  // Convert back to NDC:
  vec2 ndcOffset = screenCorner / (uViewport * 0.5);

  // Build the local UV in the ellipse frame (so Gaussian eval is |vLocal|^2).
  vLocal = vec2(
    dot(screenCorner, dirA) / max(lenA, 0.001),
    dot(screenCorner, dirB) / max(lenB, 0.001)
  );

  // Clip position:
  gl_Position = vec4(ndcCenter + ndcOffset, clipCenter.z / wc, 1.0);

  vColor = aColor;
  vAlpha = aAlpha;
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 > 4.0) discard; // 2-sigma cutoff
  float g = exp(-r2);          // elliptical Gaussian (evaluated in ellipse frame)
  // Small additive emissive core for glow at the very centre.
  float core = exp(-r2 * 8.0) * 0.35;
  float finalAlpha = g * vAlpha;
  vec3 finalColor = vColor * (g + core);
  fragColor = vec4(finalColor, finalAlpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// ─── Live Splat Pool ───────────────────────────────────────────────────────────
//
// Struct-of-arrays. A "live splat" corresponds to a single rendered Gaussian
// from one of the cathedral's structural elements. When an element is "raised"
// by an onset, we spawn its splats into the pool with a brightness that fades in
// and then slowly stabilises (the element persists at a dim steady glow).

/** Per-live-splat state (struct-of-arrays). */
interface SplatPool {
  // World position
  px: Float32Array; py: Float32Array; pz: Float32Array;
  // Orientation axes (principal)
  aax: Float32Array; aay: Float32Array; aaz: Float32Array;
  abx: Float32Array; aby: Float32Array; abz: Float32Array;
  sA: Float32Array; sB: Float32Array;
  // Color
  cr: Float32Array; cg: Float32Array; cb: Float32Array;
  // Life / alpha
  alpha: Float32Array;
  baseAlpha: Float32Array; // target steady-state alpha
  brightAlpha: Float32Array; // temporary flash alpha
  flashTimer: Float32Array;  // flash decay timer
  alive: Uint8Array;
  count: number;
  head: number;
}

function makeSplatPool(): SplatPool {
  const N = MAX_SPLATS;
  return {
    px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
    aax: new Float32Array(N), aay: new Float32Array(N), aaz: new Float32Array(N),
    abx: new Float32Array(N), aby: new Float32Array(N), abz: new Float32Array(N),
    sA: new Float32Array(N), sB: new Float32Array(N),
    cr: new Float32Array(N), cg: new Float32Array(N), cb: new Float32Array(N),
    alpha: new Float32Array(N), baseAlpha: new Float32Array(N),
    brightAlpha: new Float32Array(N), flashTimer: new Float32Array(N),
    alive: new Uint8Array(N),
    count: 0, head: 0,
  };
}

// ─── Renderer public interface ─────────────────────────────────────────────────

export interface CathedralRenderer {
  raiseElement: (elemIdx: number, hue: number, loudness: number) => void;
  flashElement: (elemIdx: number, intensity: number) => void;
  setNaveBreath: (t: number) => void;
  setRoseWindowPulse: (t: number) => void;
  frame: (dt: number) => void;
  resize: () => void;
  orbit: (dx: number, dy: number) => void;
  zoom: (factor: number) => void;
  liveCount: () => number;
  builtCount: () => number;
  dispose: () => void;
}

export function makeCathedralRenderer(
  canvas: HTMLCanvasElement,
  elements: StructuralElement[],
): CathedralRenderer | null {
  const glRaw = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!glRaw) return null;
  const gl: WebGL2RenderingContext = glRaw;

  // ── Compile shaders ──
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uView = gl.getUniformLocation(prog, "uView");
  const uProj = gl.getUniformLocation(prog, "uProj");
  const uViewport = gl.getUniformLocation(prog, "uViewport");

  // ── VAO + Buffers ──
  const quad = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Instance buffer: INST_FLOATS * 4 bytes each.
  const instBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, MAX_SPLATS * INST_FLOATS * 4, gl.DYNAMIC_DRAW);
  const stride = INST_FLOATS * 4;

  // layout(location=1) aPos(3)
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(1, 1);
  // layout(location=2) aAxisA(3)
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(2, 1);
  // layout(location=3) aAxisB(3)
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 24);
  gl.vertexAttribDivisor(3, 1);
  // layout(location=4) aSizeA(1)
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 36);
  gl.vertexAttribDivisor(4, 1);
  // layout(location=5) aSizeB(1)
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 40);
  gl.vertexAttribDivisor(5, 1);
  // layout(location=6) aColor(3)
  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 44);
  gl.vertexAttribDivisor(6, 1);
  // layout(location=7) aAlpha(1)
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 56);
  gl.vertexAttribDivisor(7, 1);

  gl.bindVertexArray(null);

  // ── CPU pool ──
  const pool = makeSplatPool();
  const instData = new Float32Array(MAX_SPLATS * INST_FLOATS);

  // ── Element build state ──
  // For each element: which splats in the pool belong to it (index array).
  // We keep a separate "element state" tracking whether it's been raised.
  const elemState: Array<{
    raised: boolean;
    poolIndices: number[];  // indices into pool arrays
    hue: number;
    raisedAt: number;       // performance.now() when raised
  }> = elements.map(() => ({ raised: false, poolIndices: [], hue: 0, raisedAt: 0 }));

  // Sorting scratch arrays.
  const sortIndices = new Int32Array(MAX_SPLATS);
  const sortKeys = new Float32Array(MAX_SPLATS);

  // ── Camera state ──
  let camYaw = Math.PI;   // start looking down nave (toward rose window)
  let camPitch = 0.05;
  let camDist = 14.0;
  let autoYaw = 0.0;
  let flyZ = -1.0;        // camera Z starts at near end, flies toward rose window

  // Breath + pulse state
  let naveBreath = 0;
  let roseWindowPulse = 0;

  // ── Element management ──

  function allocSplat(pool_: SplatPool): number {
    const idx = pool_.head % MAX_SPLATS;
    pool_.head = (pool_.head + 1) % MAX_SPLATS;
    if (pool_.count < MAX_SPLATS) pool_.count++;
    return idx;
  }

  function raiseElement(elemIdx: number, hue: number, loudness: number) {
    if (elemIdx < 0 || elemIdx >= elements.length) return;
    const state = elemState[elemIdx];
    const elem = elements[elemIdx];
    state.hue = hue;
    state.raisedAt = performance.now();

    const [r, g, b] = hsvToRgb(hue, 0.55, 0.9);
    // Stone colour has some warm tint toward the element's baseHue.
    const [sr, sg, sb] = hsvToRgb(elem.baseHue * 0.7 + hue * 0.3, 0.5, 0.85);

    const newIndices: number[] = [];
    for (let s = 0; s < elem.count; s++) {
      const idx = allocSplat(pool);
      newIndices.push(idx);
      pool.px[idx] = elem.positions[s*3];
      pool.py[idx] = elem.positions[s*3+1];
      pool.pz[idx] = elem.positions[s*3+2];
      pool.aax[idx] = elem.axisA[s*3];
      pool.aay[idx] = elem.axisA[s*3+1];
      pool.aaz[idx] = elem.axisA[s*3+2];
      pool.abx[idx] = elem.axisB[s*3];
      pool.aby[idx] = elem.axisB[s*3+1];
      pool.abz[idx] = elem.axisB[s*3+2];
      pool.sA[idx]  = elem.sizeA[s];
      pool.sB[idx]  = elem.sizeB[s];
      // Color: blend element structural colour with onset hue light.
      const j = 0.75 + Math.random() * 0.5;
      pool.cr[idx] = (sr * 0.6 + r * 0.4) * j;
      pool.cg[idx] = (sg * 0.6 + g * 0.4) * j;
      pool.cb[idx] = (sb * 0.6 + b * 0.4) * j;
      // Flash in, then settle at steady-state dim glow.
      const steadyAlpha = 0.15 + loudness * 0.15;
      pool.baseAlpha[idx]   = steadyAlpha;
      pool.brightAlpha[idx] = Math.min(1.0, steadyAlpha + loudness * 0.5);
      pool.flashTimer[idx]  = 2.0; // 2s flash decay
      pool.alpha[idx]       = pool.brightAlpha[idx];
      pool.alive[idx]       = 1;
    }

    state.poolIndices = newIndices;
    state.raised = true;
  }

  function flashElement(elemIdx: number, intensity: number) {
    if (elemIdx < 0 || elemIdx >= elements.length) return;
    const state = elemState[elemIdx];
    if (!state.raised) return;
    for (const idx of state.poolIndices) {
      if (!pool.alive[idx]) continue;
      pool.brightAlpha[idx] = Math.min(0.95, pool.baseAlpha[idx] + intensity * 0.6);
      pool.flashTimer[idx]  = 1.0;
      pool.alpha[idx]       = pool.brightAlpha[idx];
    }
  }

  function setNaveBreath(t: number) { naveBreath = t; }
  function setRoseWindowPulse(t: number) { roseWindowPulse = t; }

  function liveCount() { return pool.count; }
  function builtCount() { return elemState.filter(s => s.raised).length; }

  // ── Per-frame ──

  function frame(dt: number) {
    const w = canvas.width;
    const h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.01, 0.008, 0.018, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (pool.count === 0) return;

    autoYaw += dt * 0.008; // very slow auto-rotate when not dragging
    // Slow forward fly: camera Z position moves from -1 toward rose window.
    flyZ = Math.min(flyZ + dt * 0.4, NAVE_LENGTH - 2.5);

    // Camera position: orbit around a point ahead on the nave floor.
    const lookAtZ = Math.min(flyZ + camDist * 0.55, NAVE_LENGTH);
    const lookAtY = COLUMN_H * 0.45;
    const eYaw = camYaw + autoYaw;
    const cp = Math.cos(camPitch);
    const ex = Math.sin(eYaw) * cp * (camDist * 0.3);
    const ey = lookAtY + Math.sin(camPitch) * camDist * 0.35;
    const ez = flyZ + Math.cos(eYaw) * cp * (camDist * 0.2) - camDist * 0.15;

    const view = mat4LookAt(ex, ey, ez, 0, lookAtY * 0.8, lookAtZ * 0.85);
    const proj = mat4Perspective(0.9, w / Math.max(1, h), 0.15, 120);

    // Update splat alphas (flash decay + nave breath + rose pulse).
    const now = performance.now() * 0.001;
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (!pool.alive[i]) continue;
      // Flash decay.
      if (pool.flashTimer[i] > 0) {
        pool.flashTimer[i] = Math.max(0, pool.flashTimer[i] - dt);
        const ft = pool.flashTimer[i];
        const lerp = ft > 0 ? ft / 2.0 : 0;
        pool.alpha[i] = pool.baseAlpha[i] + (pool.brightAlpha[i] - pool.baseAlpha[i]) * lerp;
      }
      // Nave breath: modulate alpha of all live splats gently.
      const breathMod = 1.0 + naveBreath * 0.15 * Math.sin(now * 1.5 + pool.pz[i] * 0.3);
      pool.alpha[i] = Math.min(0.98, pool.alpha[i] * breathMod);
    }

    // Rose window pulse: flash all rose-window splats.
    if (roseWindowPulse > 0.01) {
      const roseElemIdx = elements.findIndex(e => e.name === "rose-window");
      if (roseElemIdx >= 0) {
        const roseState = elemState[roseElemIdx];
        if (roseState.raised) {
          for (const idx of roseState.poolIndices) {
            if (!pool.alive[idx]) continue;
            pool.alpha[idx] = Math.min(0.98, pool.alpha[idx] + roseWindowPulse * 0.4);
          }
        }
      }
    }

    // ── Depth sort (back-to-front) ──
    // Compute view-space Z for each live splat, build index array, sort.
    let liveCnt = 0;
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (!pool.alive[i]) continue;
      // View-space Z = dot(camera forward, splat world position - eye)
      // We use the view matrix row 2 (Z row, column-major).
      const vsZ = view[2]*pool.px[i] + view[6]*pool.py[i] + view[10]*pool.pz[i] + view[14];
      sortIndices[liveCnt] = i;
      sortKeys[liveCnt] = vsZ;
      liveCnt++;
    }

    // Sort: build an array of [poolIndex, viewZ] pairs, sort by viewZ
    // descending (back-to-front: most-negative Z first).
    // We reuse sortKeys[j] = viewZ of sortIndices[j] so we can sort by
    // position in the live list (0..liveCnt-1) rather than the pool index.
    const liveOrder = Array.from({ length: liveCnt }, (_, j) => j);
    liveOrder.sort((ja, jb) => sortKeys[jb] - sortKeys[ja]); // desc by viewZ

    // ── Pack instance data in sorted order ──
    for (let j = 0; j < liveCnt; j++) {
      const i = sortIndices[liveOrder[j]];
      const o = j * INST_FLOATS;
      instData[o]    = pool.px[i];
      instData[o+1]  = pool.py[i];
      instData[o+2]  = pool.pz[i];
      instData[o+3]  = pool.aax[i];
      instData[o+4]  = pool.aay[i];
      instData[o+5]  = pool.aaz[i];
      instData[o+6]  = pool.abx[i];
      instData[o+7]  = pool.aby[i];
      instData[o+8]  = pool.abz[i];
      instData[o+9]  = pool.sA[i];
      instData[o+10] = pool.sB[i];
      instData[o+11] = pool.cr[i];
      instData[o+12] = pool.cg[i];
      instData[o+13] = pool.cb[i];
      instData[o+14] = pool.alpha[i];
    }

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniform2f(uViewport, w, h);

    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, liveCnt * INST_FLOATS);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // alpha-over compositing
    gl.disable(gl.DEPTH_TEST);

    gl.bindVertexArray(vao);
    if (liveCnt > 0) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, liveCnt);
    gl.bindVertexArray(null);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function orbit(dx: number, dy: number) {
    camYaw -= dx * 0.004;
    camPitch = Math.max(-0.9, Math.min(0.9, camPitch + dy * 0.004));
  }

  function zoom(factor: number) {
    camDist = Math.max(2, Math.min(30, camDist * factor));
  }

  function dispose() {
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(instBuf);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }

  return { raiseElement, flashElement, setNaveBreath, setRoseWindowPulse,
    frame, resize, orbit, zoom, liveCount, builtCount, dispose };
}
