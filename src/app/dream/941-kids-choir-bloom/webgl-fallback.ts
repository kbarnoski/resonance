// Raw WebGL2 fragment-shader metaball fallback for 941-kids-choir-bloom.
// Mirrors the WebGPU field in gpu.ts. NOT three.js — hand-written GL2.

import type { Blob } from "./gpu";

const VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FS = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_bloom;
uniform vec4  u_blob[4];   // x, y, r, energy
uniform vec3  u_color[4];

void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  float aspect = u_res.x / max(1.0, u_res.y);

  vec3 col = vec3(0.06, 0.04, 0.12) + vec3(0.04, 0.02, 0.10) * (1.0 - distance(uv, vec2(0.5, 0.55)));

  float field = 0.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 b = u_blob[i];
    vec2 d = uv - b.xy;
    d.x *= aspect;
    float dist2 = dot(d, d);
    float f = (b.z * b.z) / (dist2 + 0.00015);
    field += f;
    float w = f * (0.6 + 0.8 * b.w);
    glow += u_color[i] * w;
  }

  float merge = smoothstep(0.7, 2.2, field);
  float core  = smoothstep(2.0, 6.0, field);
  vec3 gn = glow / max(field, 0.001);
  float bloomBoost = 1.0 + u_bloom * 1.6;

  col += gn * (merge * 0.9 + core * 1.3) * bloomBoost;
  col += vec3(1.0, 0.96, 0.9) * core * u_bloom * 0.7;

  col = col / (col + vec3(0.9));
  col = pow(col, vec3(0.85));
  outColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export class GlMetaballs {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private canvas: HTMLCanvasElement;
  private loseExt: WEBGL_lose_context | null;
  private u: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    bloom: WebGLUniformLocation | null;
    blob: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
  };
  private blobBuf = new Float32Array(16); // 4 * vec4
  private colorBuf = new Float32Array(12); // 4 * vec3
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.loseExt = gl.getExtension("WEBGL_lose_context");
    this.u = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      bloom: gl.getUniformLocation(program, "u_bloom"),
      blob: gl.getUniformLocation(program, "u_blob"),
      color: gl.getUniformLocation(program, "u_color"),
    };
  }

  static create(canvas: HTMLCanvasElement): GlMetaballs | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    // Full-screen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    return new GlMetaballs(canvas, gl, program);
  }

  resize(w: number, h: number): void {
    this.canvas.width = Math.max(1, Math.floor(w));
    this.canvas.height = Math.max(1, Math.floor(h));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(blobs: Blob[], time: number, bloom: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    for (let i = 0; i < 4; i++) {
      const b = blobs[i];
      this.blobBuf[i * 4 + 0] = b.x;
      this.blobBuf[i * 4 + 1] = b.y;
      this.blobBuf[i * 4 + 2] = b.r;
      this.blobBuf[i * 4 + 3] = b.energy;
      this.colorBuf[i * 3 + 0] = b.color[0];
      this.colorBuf[i * 3 + 1] = b.color[1];
      this.colorBuf[i * 3 + 2] = b.color[2];
    }
    gl.useProgram(this.program);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, time);
    gl.uniform1f(this.u.bloom, bloom);
    gl.uniform4fv(this.u.blob, this.blobBuf);
    gl.uniform3fv(this.u.color, this.colorBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.gl.deleteProgram(this.program);
    } catch {
      // ignore
    }
    this.loseExt?.loseContext();
  }
}
