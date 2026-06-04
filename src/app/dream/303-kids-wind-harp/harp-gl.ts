// Raw WebGL2 renderer for the wind-harp.
//
// We draw, over a soft dark vertical gradient, a row of ~7 glowing strings.
// Each string is the swinging Verlet chain from physics.ts, rendered as a
// smooth curve. To keep it matte (no additive bloom) we draw each string as a
// thin filled ribbon (a triangle strip expanded along the curve normal) with a
// soft radial falloff across its width, blended NORMAL (over) — so strings sit
// on the gradient like glowing threads rather than blasting light.
//
// Two draw passes:
//   1. full-screen gradient quad (background)
//   2. per-string ribbon (built CPU-side each frame from the node positions,
//      streamed into one dynamic VBO)
//
// All coordinates come in normalised [0,1] (x right, y DOWN to match physics).
// We flip y into clip space here.

import type { HarpString } from "./physics";

const BG_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Soft dark gradient: deep indigo at top easing to near-black at the bottom,
// with a very gentle vignette. Matte. A slow breathing term keeps it alive.
const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform float u_time;
void main() {
  float y = v_uv.y;
  vec3 top = vec3(0.07, 0.06, 0.13);
  vec3 bot = vec3(0.02, 0.02, 0.05);
  vec3 col = mix(bot, top, smoothstep(0.0, 1.0, y));
  // gentle centre glow that breathes
  vec2 c = v_uv - vec2(0.5, 0.42);
  float r = length(c * vec2(1.0, 1.3));
  float breathe = 0.5 + 0.5 * sin(u_time * 0.25);
  col += vec3(0.05, 0.045, 0.09) * (1.0 - smoothstep(0.0, 0.85, r)) * (0.6 + 0.4 * breathe);
  // soft vignette
  col *= 1.0 - 0.35 * smoothstep(0.55, 1.1, length(v_uv - 0.5));
  o = vec4(col, 1.0);
}`;

// Ribbon shader: per-vertex position (clip), an across-width coordinate in
// [-1,1] for the soft edge falloff, a colour, and a glow intensity.
const STR_VERT = `#version 300 es
in vec2 a_pos;       // clip space
in float a_side;     // -1..1 across the ribbon width
in vec3 a_color;
in float a_glow;     // 0..1 brightness for this string
out float v_side;
out vec3 v_color;
out float v_glow;
void main() {
  v_side = a_side;
  v_color = a_color;
  v_glow = a_glow;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Soft-edged matte thread: core bright, edges fade. Plain alpha (over) blend.
const STR_FRAG = `#version 300 es
precision highp float;
in float v_side;
in vec3 v_color;
in float v_glow;
out vec4 o;
void main() {
  float edge = 1.0 - abs(v_side);          // 1 at core, 0 at edge
  float core = smoothstep(0.0, 1.0, edge);
  float a = pow(core, 1.6) * (0.45 + 0.55 * v_glow);
  // a touch of extra centre brightness so a freshly plucked string blooms a bit
  vec3 col = v_color * (0.7 + 0.9 * v_glow) + vec3(0.12) * pow(edge, 6.0) * v_glow;
  o = vec4(col, a);
}`;

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

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

// Warm string colours (low -> high), modal and gentle, matte tones.
export const STRING_COLORS: [number, number, number][] = [
  [0.95, 0.45, 0.35], // warm coral
  [0.97, 0.62, 0.34], // amber
  [0.95, 0.82, 0.40], // gold
  [0.55, 0.85, 0.55], // soft green
  [0.40, 0.80, 0.85], // teal
  [0.55, 0.62, 0.95], // periwinkle
  [0.78, 0.55, 0.95], // lilac
];

export interface HarpRenderer {
  render: (
    strings: HarpString[],
    glows: number[],
    aspect: number,
    time: number,
  ) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createHarpRenderer(gl: WebGL2RenderingContext): HarpRenderer {
  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const strProg = link(gl, STR_VERT, STR_FRAG);

  // full-screen quad
  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const quadVao = gl.createVertexArray()!;
  const quadVbo = gl.createBuffer()!;
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const bgPosLoc = gl.getAttribLocation(bgProg, "a_pos");
  gl.enableVertexAttribArray(bgPosLoc);
  gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);
  const bgTimeLoc = gl.getUniformLocation(bgProg, "u_time");

  // dynamic ribbon buffer. Interleaved: pos.xy, side, color.rgb, glow => 7 floats
  const FLOATS = 7;
  const strVao = gl.createVertexArray()!;
  const strVbo = gl.createBuffer()!;
  gl.bindVertexArray(strVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, strVbo);
  const stride = FLOATS * 4;
  const aPos = gl.getAttribLocation(strProg, "a_pos");
  const aSide = gl.getAttribLocation(strProg, "a_side");
  const aColor = gl.getAttribLocation(strProg, "a_color");
  const aGlow = gl.getAttribLocation(strProg, "a_glow");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aSide);
  gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(aGlow);
  gl.vertexAttribPointer(aGlow, 1, gl.FLOAT, false, stride, 24);
  gl.bindVertexArray(null);

  // CPU scratch buffer; grown lazily. Each string is one triangle-strip but we
  // separate strings with degenerate vertices so we can draw them all in one
  // call.
  let scratch = new Float32Array(0);

  function nx(x: number): number {
    return x * 2 - 1;
  }
  function ny(y: number): number {
    // physics y is 0 top -> 1 bottom; clip is +1 top -> -1 bottom
    return 1 - y * 2;
  }

  function render(
    strings: HarpString[],
    glows: number[],
    aspect: number,
    time: number,
  ): void {
    // background
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(bgTimeLoc, time);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- build ribbons ----
    // half-width of a string in clip units (kept constant in screen px-ish by
    // not scaling with aspect on x). Base ~3px feel.
    const baseHalf = 0.008;

    // Count vertices: per string, (nodes*2) ribbon verts + 2 degenerate joins.
    let totalVerts = 0;
    for (const s of strings) totalVerts += s.nodes.length * 2 + 2;
    const need = totalVerts * FLOATS;
    if (scratch.length < need) scratch = new Float32Array(need);

    let o = 0;
    for (let si = 0; si < strings.length; si++) {
      const s = strings[si];
      const col = STRING_COLORS[si % STRING_COLORS.length];
      const glow = glows[si] ?? 0;
      const nodes = s.nodes;
      // brighter / slightly fatter when glowing
      const half = baseHalf * (1 + glow * 1.4);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        // curve tangent from neighbours, then normal (perpendicular) in clip
        const a = nodes[Math.max(0, i - 1)];
        const b = nodes[Math.min(nodes.length - 1, i + 1)];
        let tx = nx(b.x) - nx(a.x);
        let ty = ny(b.y) - ny(a.y);
        const tl = Math.hypot(tx, ty) || 1e-6;
        tx /= tl;
        ty /= tl;
        // normal = perpendicular; correct for aspect so width looks even
        const nxn = -ty;
        const nyn = tx;
        const cx = nx(n.x);
        const cy = ny(n.y);
        const ox = nxn * half;
        const oy = nyn * half * aspect;

        // first vertex of this string: emit a degenerate to detach from prev
        if (i === 0 && si > 0) {
          // repeat the previous emitted vertex (already at o-FLOATS) then this
          const prevBase = o - FLOATS;
          for (let k = 0; k < FLOATS; k++) scratch[o + k] = scratch[prevBase + k];
          o += FLOATS;
          // and the upcoming first vertex duplicated below handles the join
        }

        // left vertex (side -1)
        scratch[o] = cx - ox;
        scratch[o + 1] = cy - oy;
        scratch[o + 2] = -1;
        scratch[o + 3] = col[0];
        scratch[o + 4] = col[1];
        scratch[o + 5] = col[2];
        scratch[o + 6] = glow;
        // duplicate first to complete the degenerate strip join
        if (i === 0 && si > 0) {
          for (let k = 0; k < FLOATS; k++) scratch[o + FLOATS + k] = scratch[o + k];
          o += FLOATS;
        }
        o += FLOATS;

        // right vertex (side +1)
        scratch[o] = cx + ox;
        scratch[o + 1] = cy + oy;
        scratch[o + 2] = 1;
        scratch[o + 3] = col[0];
        scratch[o + 4] = col[1];
        scratch[o + 5] = col[2];
        scratch[o + 6] = glow;
        o += FLOATS;
      }
    }

    const vertCount = o / FLOATS;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // matte over-blend
    gl.useProgram(strProg);
    gl.bindVertexArray(strVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, strVbo);
    gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    gl.bindVertexArray(null);
  }

  function resize(w: number, h: number): void {
    gl.viewport(0, 0, w, h);
  }

  function dispose(): void {
    gl.deleteBuffer(quadVbo);
    gl.deleteBuffer(strVbo);
    gl.deleteVertexArray(quadVao);
    gl.deleteVertexArray(strVao);
    gl.deleteProgram(bgProg);
    gl.deleteProgram(strProg);
  }

  return { render, resize, dispose };
}
