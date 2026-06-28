// render.ts — display of the Gray-Scott field as glowing bioluminescent ink,
// plus a Canvas2D reaction-diffusion fallback for devices without float
// render targets.
//
// The GPU display pass samples the sim's B channel and maps it to an inky
// glow on dark water: deep teal-violet base, cyan/emerald rim light where the
// pattern is actively forming. The Canvas2D fallback runs a coarse CPU
// Gray-Scott on a small grid and paints it with putImageData, scaled up.

import { INK_GARDEN_PARAMS, stepCell, type GrayScottParams } from "./sim";

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Display: turn (A,B) into bioluminescent ink on dark water.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2  u_texel;
uniform float u_time;
uniform vec3  u_ink;   // user-chosen ink hue (linear-ish rgb)

void main(){
  vec2 s = texture(u_state, v_uv).xy;
  float b = s.y;

  // edge/gradient term => rim light where the pattern is forming
  float bx = texture(u_state, v_uv + vec2(u_texel.x,0.0)).y
           - texture(u_state, v_uv - vec2(u_texel.x,0.0)).y;
  float by = texture(u_state, v_uv + vec2(0.0,u_texel.y)).y
           - texture(u_state, v_uv - vec2(0.0,u_texel.y)).y;
  float edge = clamp(length(vec2(bx, by)) * 6.0, 0.0, 1.0);

  // dark water base with a faint living shimmer
  float shimmer = 0.04 + 0.03 * sin(u_time*0.7 + v_uv.x*14.0)
                            * cos(u_time*0.5 + v_uv.y*11.0);
  vec3 water = vec3(0.01, 0.03, 0.06) + shimmer * vec3(0.0,0.04,0.07);

  // body of the ink: chosen hue, brightened by B
  float body = smoothstep(0.18, 0.7, b);
  vec3 ink = u_ink * body;

  // glowing rim: bright cyan-white where the front is moving
  vec3 rim = mix(u_ink, vec3(0.7,1.0,0.95), 0.6) * edge * (0.5 + body);

  vec3 col = water + ink * 0.9 + rim * 0.9;
  // soft bloom-ish lift
  col += pow(body, 2.0) * u_ink * 0.4;
  col = col / (col + 0.6); // tonemap to keep it gentle, never blown out
  outColor = vec4(col, 1.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("display shader error:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export interface DisplayRenderer {
  draw(tex: WebGLTexture, simSize: number, time: number, ink: [number, number, number]): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export function makeDisplay(
  gl: WebGL2RenderingContext,
): DisplayRenderer | null {
  const vs = compile(gl, gl.VERTEX_SHADER, QUAD_VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const loc = {
    state: gl.getUniformLocation(prog, "u_state"),
    texel: gl.getUniformLocation(prog, "u_texel"),
    time: gl.getUniformLocation(prog, "u_time"),
    ink: gl.getUniformLocation(prog, "u_ink"),
  };

  let vw = 1;
  let vh = 1;

  return {
    draw(tex, simSize, time, ink) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vw, vh);
      gl.uniform2f(loc.texel, 1 / simSize, 1 / simSize);
      gl.uniform1f(loc.time, time);
      gl.uniform3f(loc.ink, ink[0], ink[1], ink[2]);
      gl.uniform1i(loc.state, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w, h) {
      vw = w;
      vh = h;
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
    },
  };
}

// ── Canvas2D fallback: coarse CPU Gray-Scott ──────────────────────────────
// Runs a small grid (e.g. 96×96) on the CPU using the shared stepCell rule,
// painted with putImageData and scaled up by CSS. Slower and chunkier, but it
// still grows real Turing patterns and still drives the same sonification.

export interface CpuRdSim {
  readonly width: number;
  readonly height: number;
  step(iterations: number): void;
  splat(x: number, y: number, radius: number): void;
  draw(ctx: CanvasRenderingContext2D, time: number, ink: [number, number, number]): void;
  readBackB(readW: number, readH: number): Float32Array;
  dispose(): void;
}

export function makeCpuRdSim(
  size = 96,
  params: GrayScottParams = INK_GARDEN_PARAMS,
): CpuRdSim {
  const w = size;
  const h = size;
  const n = w * h;
  let A = new Float32Array(n).fill(1);
  let B = new Float32Array(n).fill(0);
  let A2 = new Float32Array(n);
  let B2 = new Float32Array(n);
  const img = new ImageData(w, h);

  function lapAt(arr: Float32Array, x: number, y: number): number {
    const xl = (x - 1 + w) % w;
    const xr = (x + 1) % w;
    const yu = (y - 1 + h) % h;
    const yd = (y + 1) % h;
    const c = arr[y * w + x];
    return (
      c * -1 +
      0.2 * (arr[y * w + xl] + arr[y * w + xr] + arr[yu * w + x] + arr[yd * w + x]) +
      0.05 *
        (arr[yu * w + xl] + arr[yu * w + xr] + arr[yd * w + xl] + arr[yd * w + xr])
    );
  }

  function step(iterations: number) {
    for (let it = 0; it < iterations; it++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const next = stepCell(A[i], B[i], lapAt(A, x, y), lapAt(B, x, y), params);
          A2[i] = next.a;
          B2[i] = next.b;
        }
      }
      [A, A2] = [A2, A];
      [B, B2] = [B2, B];
    }
  }

  function splat(px: number, py: number, radius: number) {
    const cx = px * w;
    const cy = (1 - py) * h; // y-up to grid y-down
    const r = radius * w;
    const r2 = r * r;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < r2) {
          const i = y * w + x;
          B[i] = Math.min(1, B[i] + 0.9);
          A[i] = Math.max(0, A[i] - 0.2);
        }
      }
    }
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    ink: [number, number, number],
  ) {
    const d = img.data;
    for (let i = 0; i < n; i++) {
      const b = B[i];
      const body = Math.max(0, Math.min(1, (b - 0.18) / 0.5));
      const sh = 0.03 + 0.02 * Math.sin(time * 0.7 + (i % w) * 0.2);
      const r = (0.01 + sh * 0 + ink[0] * body * 0.9) * 255;
      const g = (0.03 + sh + ink[1] * body * 0.9) * 255;
      const bl = (0.06 + sh + ink[2] * body * 0.9) * 255;
      const j = i * 4;
      d[j] = Math.min(255, r + body * body * 90);
      d[j + 1] = Math.min(255, g + body * body * 120);
      d[j + 2] = Math.min(255, bl + body * body * 120);
      d[j + 3] = 255;
    }
    // paint to an offscreen-sized canvas then let CSS scale; here we draw 1:1
    // into the canvas backing store which is sized to w×h.
    ctx.putImageData(img, 0, 0);
  }

  function readBackB(readW: number, readH: number): Float32Array {
    const out = new Float32Array(readW * readH);
    for (let y = 0; y < readH; y++) {
      for (let x = 0; x < readW; x++) {
        const sx = Math.floor((x / readW) * w);
        const sy = Math.floor((y / readH) * h);
        out[y * readW + x] = B[sy * w + sx];
      }
    }
    return out;
  }

  return {
    width: w,
    height: h,
    step,
    splat,
    draw,
    readBackB,
    dispose() {
      A = new Float32Array(0);
      B = new Float32Array(0);
      A2 = new Float32Array(0);
      B2 = new Float32Array(0);
    },
  };
}
