// ─────────────────────────────────────────────────────────────────────────────
// 1105-hidden-eye · gl.ts
//
// Raw WebGL2 output. The CPU builds the SIRDS RGBA buffer and a single-channel
// depth buffer; here we upload both as textures and a fragment shader draws them
// full-screen. Two modes:
//   0 — STEREOGRAM: blit the random-dot field, gentle violet tint + vignette +
//       faint mean-preserving film grain (no monocular depth cue is added).
//   1 — REVEAL/WIGGLE: shade the hidden heightfield directly (Lambert lighting
//       off the depth gradient) with a small horizontal parallax sway so the
//       surface pops via motion — legible hands-free, no free-fusing needed.
// ─────────────────────────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_stereo;
uniform sampler2D u_depth;
uniform vec2 u_res;
uniform vec2 u_texel;
uniform float u_time;
uniform float u_sway;
uniform float u_grain;
uniform int u_mode;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  vec2 cen = (uv - 0.5) * vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  float vig = smoothstep(1.25, 0.35, length(cen));

  vec3 col;
  if (u_mode == 0) {
    col = texture(u_stereo, uv).rgb;
    col = mix(col, col * vec3(0.92, 0.90, 1.06), 0.22);
  } else {
    // parallax: displace the sample horizontally by the local height
    float d0 = texture(u_depth, uv).r;
    vec2 suv = vec2(uv.x + (d0 - 0.5) * u_sway, uv.y);
    float d = texture(u_depth, suv).r;
    float dl = texture(u_depth, suv + vec2(-u_texel.x, 0.0)).r;
    float dr = texture(u_depth, suv + vec2(u_texel.x, 0.0)).r;
    float du = texture(u_depth, suv + vec2(0.0, -u_texel.y)).r;
    float dd = texture(u_depth, suv + vec2(0.0, u_texel.y)).r;
    vec3 n = normalize(vec3((dl - dr) * 4.0, (du - dd) * 4.0, 1.0));
    vec3 L = normalize(vec3(0.4, 0.6, 0.8));
    float lam = clamp(dot(n, L), 0.0, 1.0);
    vec3 far = vec3(0.12, 0.08, 0.22);
    vec3 near = vec3(0.95, 0.75, 0.55);
    vec3 base = mix(far, near, d);
    col = base * (0.35 + 0.75 * lam);
    col += vec3(0.15, 0.10, 0.25) * d * d;
  }

  float g = (hash(gl_FragCoord.xy + u_time) * 2.0 - 1.0) * u_grain;
  col += g;
  col *= vig;
  o = vec4(col, 1.0);
}`;

export interface GLRig {
  gl: WebGL2RenderingContext;
  upload(stereo: Uint8ClampedArray, depth: Uint8Array): void;
  draw(mode: number, time: number, sway: number, grain: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function makeGLRig(canvas: HTMLCanvasElement, sw: number, sh: number): GLRig | null {
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "low-power" });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const stereoTex = makeTexture(gl);
  const depthTex = makeTexture(gl);
  if (!stereoTex || !depthTex) return null;

  const uStereo = gl.getUniformLocation(program, "u_stereo");
  const uDepth = gl.getUniformLocation(program, "u_depth");
  const uRes = gl.getUniformLocation(program, "u_res");
  const uTexel = gl.getUniformLocation(program, "u_texel");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uSway = gl.getUniformLocation(program, "u_sway");
  const uGrain = gl.getUniformLocation(program, "u_grain");
  const uMode = gl.getUniformLocation(program, "u_mode");

  gl.uniform1i(uStereo, 0);
  gl.uniform1i(uDepth, 1);
  gl.uniform2f(uTexel, 1 / sw, 1 / sh);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  return {
    gl,
    upload(stereo: Uint8ClampedArray, depth: Uint8Array) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stereoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, stereo);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, sw, sh, 0, gl.RED, gl.UNSIGNED_BYTE, depth);
    },
    draw(mode: number, time: number, sway: number, grain: number) {
      gl.uniform2f(uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uSway, sway);
      gl.uniform1f(uGrain, grain);
      gl.uniform1i(uMode, mode);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number) {
      gl.viewport(0, 0, w, h);
    },
    destroy() {
      gl.deleteProgram(program);
      gl.deleteTexture(stereoTex);
      gl.deleteTexture(depthTex);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    },
  };
}
