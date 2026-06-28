// Renderer for the plate displacement field.
//
// Primary path: raw WebGL2. Each plate's displacement grid is uploaded to a
// R32F texture; a fragment shader computes per-pixel normals from neighbouring
// displacement samples and shades the surface as lit metal — specular highlights
// ripple across the steel as the wave travels, and large displacement / energy
// warms the metal from steel-blue toward white-hot amber.
//
// Fallback: Canvas2D draws a coarser shaded grid of the same field.
//
// No three.js.

export type PlateLayout = {
  cx: number; cy: number; // centre in normalised canvas coords (0..1)
  w: number; h: number;   // size in normalised canvas coords
  grid: number;           // field grid resolution
};

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos; // -1..1 quad
out vec2 v_uv;
uniform vec2 u_center;   // 0..1
uniform vec2 u_half;     // half size 0..1
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  vec2 p = u_center + a_pos * u_half;       // 0..1
  vec2 clip = p * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_field;   // R32F displacement
uniform float u_grid;
uniform float u_energy;      // 0..~1 plate vibrational energy
uniform float u_time;
uniform float u_glow;        // recent strike glow 0..1

float disp(vec2 uv) { return texture(u_field, uv).r; }

void main() {
  vec2 uv = v_uv;
  float texel = 1.0 / u_grid;

  // central displacement + neighbours for normal
  float c  = disp(uv);
  float dx = disp(uv + vec2(texel, 0.0)) - disp(uv - vec2(texel, 0.0));
  float dy = disp(uv + vec2(0.0, texel)) - disp(uv - vec2(0.0, texel));

  // height scale for visible relief
  float hs = 24.0;
  vec3 n = normalize(vec3(-dx * hs, -dy * hs, 1.0));

  // lighting: a key light from upper-left, cool steel ambient
  vec3 L = normalize(vec3(-0.5, 0.6, 0.8));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 48.0);

  // base steel-blue, warming with energy/local amplitude
  float heat = clamp(u_energy * 1.1 + abs(c) * 26.0, 0.0, 1.0);
  vec3 steel = vec3(0.16, 0.21, 0.30);
  vec3 hot   = vec3(0.95, 0.55, 0.18);
  vec3 base  = mix(steel, hot, heat);

  // round vignette so the plate reads as a suspended sheet
  vec2 d = (v_uv - 0.5) * 2.0;
  float edge = smoothstep(1.02, 0.80, length(d));

  vec3 col = base * (0.22 + 0.85 * diff);
  // specular tinted warm when hot, cool when cold
  vec3 specCol = mix(vec3(0.6, 0.7, 0.9), vec3(1.0, 0.92, 0.7), heat);
  col += specCol * spec * (0.9 + heat * 1.6);

  // white-hot bloom at high local amplitude
  float bloom = smoothstep(0.02, 0.08, abs(c)) * (0.5 + u_glow);
  col += vec3(1.0, 0.85, 0.55) * bloom;

  col *= edge;
  // faint rim
  col += vec3(0.2, 0.28, 0.4) * smoothstep(0.78, 1.0, length(d)) * edge * 0.5;

  o = vec4(col, edge);
}`;

type PlateGl = {
  tex: WebGLTexture;
};

export class GlRenderer {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private plates: PlateGl[] = [];
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private grid: number;

  constructor(gl: WebGL2RenderingContext, plateCount: number, grid: number) {
    this.gl = gl;
    this.grid = grid;
    this.prog = this.makeProgram(VERT, FRAG);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    this.vao = vao;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");

    for (let i = 0; i < plateCount; i++) {
      const tex = gl.createTexture();
      if (!tex) throw new Error("tex");
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, grid, grid, 0, gl.RED, gl.FLOAT,
        new Float32Array(grid * grid));
      this.plates.push({ tex });
    }

    for (const u of ["u_center", "u_half", "u_field", "u_grid", "u_energy", "u_time", "u_glow"]) {
      this.loc[u] = gl.getUniformLocation(this.prog, u);
    }
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    if (!p) throw new Error("program");
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  uploadField(plateIndex: number, field: Float32Array) {
    const gl = this.gl;
    const p = this.plates[plateIndex];
    if (!p) return;
    gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.grid, this.grid, gl.RED, gl.FLOAT, field);
  }

  draw(layouts: PlateLayout[], energies: number[], glows: number[], time: number, w: number, h: number) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.045, 0.055, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    for (let i = 0; i < layouts.length; i++) {
      const L = layouts[i];
      const p = this.plates[i];
      if (!p) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.uniform1i(this.loc["u_field"], 0);
      gl.uniform2f(this.loc["u_center"], L.cx, L.cy);
      gl.uniform2f(this.loc["u_half"], L.w * 0.5, L.h * 0.5);
      gl.uniform1f(this.loc["u_grid"], this.grid);
      gl.uniform1f(this.loc["u_energy"], energies[i] ?? 0);
      gl.uniform1f(this.loc["u_glow"], glows[i] ?? 0);
      gl.uniform1f(this.loc["u_time"], time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    for (const p of this.plates) gl.deleteTexture(p.tex);
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
  }
}

// ---- Canvas2D fallback renderer (coarser shaded grid) ----------------------

export class Canvas2dRenderer {
  ctx: CanvasRenderingContext2D;
  private grid: number;

  constructor(ctx: CanvasRenderingContext2D, grid: number) {
    this.ctx = ctx;
    this.grid = grid;
  }

  draw(
    layouts: PlateLayout[],
    fields: (Float32Array | null)[],
    energies: number[],
    w: number, h: number,
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = "#0a0b0e";
    ctx.fillRect(0, 0, w, h);
    const N = this.grid;
    const step = Math.max(1, Math.floor(N / 40)); // coarse

    for (let pi = 0; pi < layouts.length; pi++) {
      const L = layouts[pi];
      const field = fields[pi];
      const energy = energies[pi] ?? 0;
      const px = (L.cx - L.w / 2) * w;
      const py = (L.cy - L.h / 2) * h;
      const pw = L.w * w;
      const ph = L.h * h;
      const cell = pw / (N / step);

      for (let y = 0; y < N; y += step) {
        for (let x = 0; x < N; x += step) {
          const idx = y * N + x;
          const d = field ? field[idx] : 0;
          // shading from neighbour gradient
          const dxv = field ? (field[idx + step] ?? d) - d : 0;
          const light = Math.max(0, Math.min(1, 0.45 - dxv * 18));
          const heat = Math.max(0, Math.min(1, energy * 0.9 + Math.abs(d) * 26));
          const r = Math.round((40 + 200 * heat) * (0.4 + light));
          const g = Math.round((54 + 120 * heat) * (0.4 + light));
          const b = Math.round((78 + 30 * heat) * (0.4 + light));
          // vignette
          const ndx = (x / N - 0.5) * 2, ndy = (y / N - 0.5) * 2;
          const edge = Math.max(0, 1 - Math.hypot(ndx, ndy));
          if (edge <= 0) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${edge})`;
          ctx.fillRect(px + (x / N) * pw, py + (y / N) * ph, cell + 1, (ph / (N / step)) + 1);
        }
      }
    }
  }
}
