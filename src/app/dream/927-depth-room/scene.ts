// scene.ts — fullscreen WebGL2 fragment-shader "depth room".
//
// A 16x12 depth grid is uploaded as an R32F texture and read back with
// bilinear filtering in the shader. Near pixels glow warm and bloom; far
// pixels recede into cool dark. Iso-bands + a soft volumetric haze react to
// the nearest-zone energy. Reads as: YOU, sculpted in light by distance.
//
// The SAME texture is driven by live depth OR the synthetic fallback field,
// so the visual is never blank.

import { GRID_W, GRID_H } from "./depth";

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_depth;   // R channel = depth (near=1, far=0)
uniform vec2  u_res;
uniform float u_time;
uniform float u_near;        // near-zone energy 0..1
uniform float u_motion;      // motion-in-depth 0..1
uniform vec2  u_centroid;    // nearest-region centroid (uv space)

// smooth bilinear sample of the low-res depth grid
float depthAt(vec2 uv) {
  return texture(u_depth, uv).r;
}

vec3 palette(float d) {
  // far = cool deep indigo; near = warm amber/rose
  vec3 farC  = vec3(0.04, 0.05, 0.12);
  vec3 midC  = vec3(0.22, 0.10, 0.40);
  vec3 nearC = vec3(1.00, 0.62, 0.34);
  vec3 c = mix(farC, midC, smoothstep(0.25, 0.6, d));
  c = mix(c, nearC, smoothstep(0.6, 1.0, d));
  return c;
}

void main() {
  vec2 uv = v_uv;
  // mirror horizontally so it feels like a mirror/room
  vec2 suv = vec2(1.0 - uv.x, 1.0 - uv.y);

  float d = depthAt(suv);

  // gentle gradient warp for parallax — push near pixels outward
  vec2 grad;
  float e = 1.0 / 64.0;
  grad.x = depthAt(suv + vec2(e, 0.0)) - depthAt(suv - vec2(e, 0.0));
  grad.y = depthAt(suv + vec2(0.0, e)) - depthAt(suv - vec2(0.0, e));
  float relief = clamp(0.5 + dot(normalize(grad + 1e-5), vec2(0.6, -0.8)) * d, 0.0, 1.0);

  vec3 col = palette(d);
  col *= 0.55 + 0.7 * relief;

  // iso depth contour bands — quiet topographic lines
  float bands = sin(d * 38.0 - u_time * 0.6);
  float iso = smoothstep(0.86, 1.0, bands) * 0.18 * d;
  col += iso * vec3(1.0, 0.85, 0.7);

  // near-zone bloom: a warm halo around the nearest region centroid
  vec2 cuv = vec2(1.0 - u_centroid.x, 1.0 - u_centroid.y);
  float dist = distance(uv, cuv);
  float bloom = exp(-dist * dist * (7.0 - 4.0 * u_near)) * u_near;
  col += bloom * vec3(1.0, 0.55, 0.35) * (0.9 + 0.5 * sin(u_time * 1.7));

  // volumetric haze — soft drifting fog that thickens when room is far/empty
  float haze = 0.5 + 0.5 * sin(uv.x * 5.0 + u_time * 0.3)
                     * sin(uv.y * 4.0 - u_time * 0.21);
  col += haze * (1.0 - u_near) * 0.06 * vec3(0.35, 0.4, 0.6);

  // motion shimmer — fine grain that appears with movement-in-depth
  float g = fract(sin(dot(uv * u_res, vec2(12.99, 78.23))) * 43758.5453);
  col += (g - 0.5) * u_motion * 0.10;

  // vignette to seat the room
  float vig = smoothstep(1.15, 0.35, distance(uv, vec2(0.5)));
  col *= 0.45 + 0.55 * vig;

  // soft filmic-ish tone
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.85));

  outColor = vec4(col, 1.0);
}`;

export interface DepthScene {
  render: (
    grid: Float32Array,
    near: number,
    motion: number,
    cx: number,
    cy: number,
    time: number,
  ) => void;
  resize: () => void;
  dispose: () => void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

export function runScene(canvas: HTMLCanvasElement): DepthScene | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // fullscreen triangle pair
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // depth texture (R32F, linear filtered)
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    GRID_W,
    GRID_H,
    0,
    gl.RED,
    gl.FLOAT,
    new Float32Array(GRID_W * GRID_H),
  );

  const uDepth = gl.getUniformLocation(prog, "u_depth");
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uNear = gl.getUniformLocation(prog, "u_near");
  const uMotion = gl.getUniformLocation(prog, "u_motion");
  const uCentroid = gl.getUniformLocation(prog, "u_centroid");
  gl.uniform1i(uDepth, 0);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    render(grid, near, motion, cx, cy, time) {
      resize();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        GRID_W,
        GRID_H,
        gl.RED,
        gl.FLOAT,
        grid,
      );
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uNear, near);
      gl.uniform1f(uMotion, motion);
      gl.uniform2f(uCentroid, cx, cy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize,
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

// Canvas2D fallback (last resort, if WebGL2 unavailable). Draws the grid as
// warm/cool blocks so the room still shows distance even without WebGL2.
export function drawCanvas2DFallback(
  ctx: CanvasRenderingContext2D,
  grid: Float32Array,
  near: number,
): void {
  const { width, height } = ctx.canvas;
  const cw = width / GRID_W;
  const cardh = height / GRID_H;
  ctx.fillStyle = "#05060d";
  ctx.fillRect(0, 0, width, height);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const d = grid[gy * GRID_W + (GRID_W - 1 - gx)];
      const r = Math.floor(20 + d * 235);
      const g = Math.floor(30 + d * 130);
      const b = Math.floor(60 + (1 - d) * 120);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(gx * cw, gy * cardh, cw + 1, cardh + 1);
    }
  }
  ctx.fillStyle = `rgba(255,180,120,${0.12 * near})`;
  ctx.fillRect(0, 0, width, height);
}
