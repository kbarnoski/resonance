// WebGL2 renderer for the Cascade Bloom.
//
// Draws the sandpile grid as a field of glowing rounded seed-pods whose
// brightness/hue maps to grain count 0..3:
//   0 = dormant (dim teal glow)
//   1 = amber glow
//   2 = coral / hot orange
//   3 = gold / near-white
//
// Topple flash: per-cell float (0..1) fed as a separate texture — overlaid as
// an additive white-gold bloom ring that expands from the burst origin.
//
// Background: deep indigo, bioluminescent garden vibe.
//
// GLSL ES 3.00 hand-written.

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](
  vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)
);
out vec2 vUv;
void main() {
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uGrid;   // R channel = grain count 0..3 (normalized 0..1)
uniform sampler2D uFlash;  // R channel = burst flash 0..1 per cell
uniform vec2 uGridSize;    // (w, h)
uniform float uTime;       // seconds, for gentle shimmer

// Palette: deep indigo background, pods glow amber→coral→gold→white
const vec3 BG     = vec3(0.040, 0.040, 0.110);
const vec3 BG2    = vec3(0.060, 0.080, 0.160);   // horizon tint
const vec3 TEAL   = vec3(0.090, 0.280, 0.340);   // grain=0 faint presence
const vec3 AMBER  = vec3(0.980, 0.620, 0.150);   // grain=1
const vec3 CORAL  = vec3(1.000, 0.380, 0.250);   // grain=2
const vec3 GOLD   = vec3(1.000, 0.880, 0.600);   // grain=3
const vec3 WHITE  = vec3(1.000, 0.980, 0.940);   // flash full

vec3 grainColor(float t) {
  // t: 0=empty, 0.33=1grain, 0.67=2grains, 1=3grains
  if (t < 0.33) return mix(TEAL, AMBER, t / 0.33);
  if (t < 0.67) return mix(AMBER, CORAL, (t - 0.33) / 0.34);
  return mix(CORAL, GOLD, (t - 0.67) / 0.33);
}

// Rounded-rectangle SDF for the pod shape (aspect = cell w/h)
float roundedBox(vec2 uv, float aspect, float radius) {
  // uv in [0,1]x[0,1], aspect = cellW/cellH
  vec2 p = uv * 2.0 - 1.0;       // [-1,1]
  p.x *= aspect;
  vec2 d = abs(p) - vec2(aspect - radius, 1.0 - radius);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y); // flip y: grid origin top-left

  // Background gradient
  vec3 col = mix(BG, BG2, uv.y);

  // Cell coordinates
  vec2 cellF = uv * uGridSize;
  vec2 cellIdx = floor(cellF);
  vec2 cellUv = fract(cellF);   // [0,1] within the cell

  // Clamp sample coordinate to valid cell (avoids border issues)
  vec2 sampleUv = (cellIdx + 0.5) / uGridSize;
  sampleUv = clamp(sampleUv, vec2(0.0), vec2(1.0));

  float grainRaw = texture(uGrid,  sampleUv).r;  // 0..1 (mapped from 0..3)
  float flash    = texture(uFlash, sampleUv).r;  // 0..1

  // Cell aspect ratio for the pod SDF
  float aspect = uGridSize.x / uGridSize.y;

  // Gentle breathing shimmer per cell (offset by cell position)
  float shimmer = 0.02 * sin(uTime * 1.8 + cellIdx.x * 0.7 + cellIdx.y * 0.9);

  // Pod shape (rounded rect, with padding so cells don't touch)
  const float PAD = 0.08;
  vec2 innerUv = (cellUv - PAD) / (1.0 - 2.0 * PAD);
  float sdf = roundedBox(innerUv, 1.0, 0.38);

  // Core brightness: inner glow
  float inner = 1.0 - smoothstep(-0.05, 0.18, sdf);  // hard core
  float outer = 1.0 - smoothstep(0.0,   0.55, sdf);  // soft glow corona

  // Map grain count to colour
  vec3 podColor = grainColor(grainRaw);

  // Base ambient pod (even empty pods have a faint teal presence)
  float ambientGrain = 0.04 + shimmer;
  float grainBright  = grainRaw * 0.9 + ambientGrain;

  // Pod glow layering
  float podAlpha = outer * (ambientGrain + grainRaw * 0.85);
  float coreAlpha = inner * grainBright;

  vec3 podGlow  = podColor * (0.35 + 0.65 * outer);
  col = mix(col, podGlow,  clamp(podAlpha, 0.0, 1.0));
  col = mix(col, podColor, clamp(coreAlpha, 0.0, 1.0));

  // ── Burst flash ────────────────────────────────────────────────────────────
  if (flash > 0.001) {
    // Additive white-gold ring expanding from center of cell
    float dist = length(cellUv - 0.5);

    // Solid inner flash
    float flashCore = (1.0 - smoothstep(0.0, 0.35, sdf)) * flash;

    // Expanding ring pulse
    float ring = smoothstep(0.0, 0.08, dist) * (1.0 - smoothstep(0.25, 0.55, dist));
    float ringFlash = ring * flash * 1.4;

    vec3 burstColor = mix(GOLD, WHITE, flash);
    col += burstColor * flashCore * 0.7;
    col += burstColor * ringFlash * 0.8;

    // Bleed over onto neighboring cells via the corona
    float corona = (1.0 - smoothstep(0.3, 1.0, sdf)) * flash * 0.25;
    col += burstColor * corona;
  }

  col = clamp(col, 0.0, 1.0);
  outColor = vec4(col, 1.0);
}`;

export type GLRenderer = {
  draw: (
    gridTex: Uint8Array,        // GRID_W * GRID_H, value 0..3
    flashTex: Float32Array,     // GRID_W * GRID_H, value 0..1
    gridW: number,
    gridH: number,
    canvasW: number,
    canvasH: number,
    time: number
  ) => void;
  dispose: () => void;
};

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

export function makeRenderer(gl: WebGL2RenderingContext): GLRenderer {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray()!;

  // ── Textures ────────────────────────────────────────────────────────────────
  function makeTex(): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  const gridTex  = makeTex();
  const flashTex = makeTex();

  // Uniform locations
  const uGrid      = gl.getUniformLocation(prog, "uGrid");
  const uFlash     = gl.getUniformLocation(prog, "uFlash");
  const uGridSize  = gl.getUniformLocation(prog, "uGridSize");
  const uTime      = gl.getUniformLocation(prog, "uTime");

  let lastW = 0;
  let lastH = 0;

  function draw(
    grid: Uint8Array,
    flash: Float32Array,
    gridW: number,
    gridH: number,
    canvasW: number,
    canvasH: number,
    time: number
  ): void {
    if (canvasW !== lastW || canvasH !== lastH) {
      gl.viewport(0, 0, canvasW, canvasH);
      lastW = canvasW;
      lastH = canvasH;
    }

    // Upload grid texture: single channel (R8), values 0..3 → normalized 0..1
    // We convert to a temporary Uint8Array scaled to 0..255
    const gridBytes = new Uint8Array(gridW * gridH);
    for (let i = 0; i < grid.length; i++) {
      gridBytes[i] = Math.round((grid[i] / 3) * 255);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gridTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      gridW, gridH, 0,
      gl.RED, gl.UNSIGNED_BYTE, gridBytes
    );

    // Upload flash texture: R32F (float per cell)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, flashTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R32F,
      gridW, gridH, 0,
      gl.RED, gl.FLOAT, flash
    );

    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    gl.uniform1i(uGrid, 0);
    gl.uniform1i(uFlash, 1);
    gl.uniform2f(uGridSize, gridW, gridH);
    gl.uniform1f(uTime, time);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteTexture(gridTex);
    gl.deleteTexture(flashTex);
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
  }

  return { draw, dispose };
}
