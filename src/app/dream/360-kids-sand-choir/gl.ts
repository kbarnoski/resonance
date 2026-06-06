// WebGL2 renderer for the Sand Choir.
// - Uploads the CA grid as an RGBA8 texture each frame.
// - Draws a fullscreen quad: cell -> warm grain color over deep-indigo field.
// - Draws ~7 glowing "harp strings" as soft matte gold->violet lines with a
//   plucked flash. Anti-glow house style: premultiplied alpha-over, NO additive
//   bloom.
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
  vUv = (p * 0.5 + 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Fragment shader. uStrings packs up to 8 strings: each is (yNorm, flash).
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uGrid;     // CA cell colors (premult-ish, alpha=occupancy)
uniform vec2 uGridSize;      // w,h
uniform float uStringY[8];   // normalized y (0=top) of each string
uniform float uStringFlash[8];
uniform int uStringCount;
uniform float uAspect;       // canvas w/h for flash falloff shaping

const vec3 BG_TOP = vec3(0.055, 0.043, 0.118);   // deep indigo
const vec3 BG_BOT = vec3(0.090, 0.063, 0.150);

// gold (low) -> violet (high)
vec3 stringColor(float t) {
  vec3 gold = vec3(0.98, 0.80, 0.42);
  vec3 rose = vec3(0.92, 0.55, 0.62);
  vec3 violet = vec3(0.62, 0.50, 0.92);
  if (t < 0.5) return mix(gold, rose, t * 2.0);
  return mix(rose, violet, (t - 0.5) * 2.0);
}

void main() {
  // vUv has origin bottom-left; grid uses top-left. Flip y for sampling.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);

  // background vertical gradient
  vec3 col = mix(BG_BOT, BG_TOP, vUv.y);

  // strings drawn UNDER the sand so resting grains visibly sit on them.
  for (int i = 0; i < 8; i++) {
    if (i >= uStringCount) break;
    float sy = uStringY[i];
    float t = float(i) / max(1.0, float(uStringCount - 1));
    float d = abs(uv.y - sy);
    // matte line core
    float line = smoothstep(0.006, 0.0, d);
    // soft surrounding halo (still matte alpha-over, not additive)
    float halo = smoothstep(0.045, 0.0, d) * 0.30;
    float flash = clamp(uStringFlash[i], 0.0, 1.0);
    float a = clamp(line * (0.55 + 0.45 * flash) + halo * (0.4 + 0.9 * flash), 0.0, 1.0);
    vec3 sc = stringColor(t) * (0.8 + 0.6 * flash);
    col = mix(col, sc, a);
  }

  // sand on top
  vec4 g = texture(uGrid, uv);
  if (g.a > 0.01) {
    // soft per-grain shading by slight luminance jitter from position
    col = mix(col, g.rgb, g.a);
  }

  outColor = vec4(col, 1.0);
}`;

export type GLRenderer = {
  draw: (
    grid: Uint8Array,
    gridW: number,
    gridH: number,
    stringY: number[],
    flash: number[],
    canvasW: number,
    canvasH: number
  ) => void;
  dispose: () => void;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export function makeRenderer(gl: WebGL2RenderingContext): GLRenderer {
  const prog = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("program link failed: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uGrid = gl.getUniformLocation(prog, "uGrid");
  const uGridSize = gl.getUniformLocation(prog, "uGridSize");
  const uStringY = gl.getUniformLocation(prog, "uStringY");
  const uStringFlash = gl.getUniformLocation(prog, "uStringFlash");
  const uStringCount = gl.getUniformLocation(prog, "uStringCount");
  const uAspect = gl.getUniformLocation(prog, "uAspect");

  let lastW = 0;
  let lastH = 0;

  function draw(
    grid: Uint8Array,
    gridW: number,
    gridH: number,
    stringY: number[],
    flash: number[],
    canvasW: number,
    canvasH: number
  ): void {
    if (canvasW !== lastW || canvasH !== lastH) {
      gl.viewport(0, 0, canvasW, canvasH);
      lastW = canvasW;
      lastH = canvasH;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gridW,
      gridH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      grid
    );

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uGrid, 0);
    gl.uniform2f(uGridSize, gridW, gridH);

    const yArr = new Float32Array(8);
    const fArr = new Float32Array(8);
    const n = Math.min(8, stringY.length);
    for (let i = 0; i < n; i++) {
      yArr[i] = stringY[i];
      fArr[i] = flash[i] ?? 0;
    }
    gl.uniform1fv(uStringY, yArr);
    gl.uniform1fv(uStringFlash, fArr);
    gl.uniform1i(uStringCount, n);
    gl.uniform1f(uAspect, canvasH > 0 ? canvasW / canvasH : 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteTexture(tex);
    gl.deleteProgram(prog);
    if (vao) gl.deleteVertexArray(vao);
  }

  return { draw, dispose };
}
