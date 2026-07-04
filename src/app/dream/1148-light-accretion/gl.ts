// gl.ts — raw WebGL2 volumetric raymarch renderer for the accretion field.
// Uploads the quantized R8 density grid as a sampler3D each frame and marches a
// full-screen fragment shader front-to-back with emission/absorption. The camera
// drifts slowly inward toward an ever-brightening core (the NDE tunnel). Falls
// back to an additive Canvas2D projection when WebGL2 is unavailable. Molten-gold
// → pearl-white on deep-space near-black. Slow luminance drift only — no strobe.

import type { AccretionField } from "./field";

export function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export interface RenderParams {
  time: number; // seconds since start
  elapsed: number; // seconds of accretion (drives inward drift)
  energy: number;
  flux: number;
  centroid: number;
  reduced: boolean;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
out vec4 fragColor;

uniform sampler3D uVol;
uniform vec2 uRes;
uniform float uTime;
uniform float uCamZ;
uniform float uEnergy;
uniform float uFlux;
uniform float uCentroid;
uniform float uReduced;

bool intersectBox(vec3 ro, vec3 rd, out float t0, out float t1){
  vec3 inv = 1.0 / rd;
  vec3 b = vec3(0.5);
  vec3 tA = (-b - ro) * inv;
  vec3 tB = ( b - ro) * inv;
  vec3 tmn = min(tA, tB);
  vec3 tmx = max(tA, tB);
  t0 = max(max(tmn.x, tmn.y), tmn.z);
  t1 = min(min(tmx.x, tmx.y), tmx.z);
  return t1 > max(t0, 0.0);
}

mat3 rotY(float a){
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // NDE tunnel: camera drifts inward toward the brightening core.
  vec3 ro = vec3(0.0, 0.0, uCamZ);
  vec3 rd = normalize(vec3(uv, -1.3));

  float rot = uTime * (uReduced > 0.5 ? 0.008 : 0.022);
  mat3 R = rotY(rot);
  ro = R * ro;
  rd = R * rd;

  float t0, t1;
  vec3 color = vec3(0.0);
  float transmittance = 1.0;

  vec3 gold  = vec3(1.0, 0.70, 0.28);  // #ffb347
  vec3 pearl = vec3(1.0, 0.957, 0.84); // #fff4d6

  if(intersectBox(ro, rd, t0, t1)){
    t0 = max(t0, 0.0);
    const int STEPS = 96;
    float stepLen = (t1 - t0) / float(STEPS);
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = t0 + stepLen * (0.5 + dither);

    for(int i = 0; i < STEPS; i++){
      vec3 p = ro + rd * t;
      float d = texture(uVol, p + 0.5).r;
      if(d > 0.003){
        float bright = pow(d, 0.6);
        vec3 emis = mix(gold, pearl, smoothstep(0.35, 1.0, d));
        // Core beacon — the being of light — glows brightest at the axis.
        float coreDist = length(p);
        float coreGlow = exp(-coreDist * 2.4) * (0.55 + uEnergy * 1.6);
        emis += pearl * coreGlow * 0.5;
        float dens = d * (0.9 + uFlux * 0.6);
        float absorption = 1.5 + d * 3.0;
        color += transmittance * emis * bright * dens * stepLen * 9.0;
        transmittance *= exp(-absorption * dens * stepLen * 6.0);
        if(transmittance < 0.01) break;
      }
      t += stepLen;
    }
  }

  // Deep-space near-black background bleeds through remaining transmittance.
  vec3 bg = vec3(0.016, 0.024, 0.039); // #04060a
  color += bg * transmittance;

  float vig = 1.0 - 0.28 * dot(uv, uv);
  color *= vig;

  // Tone-map + gamma. Slow, gentle — nothing flickers.
  color = color / (1.0 + color);
  color = pow(color, vec3(0.4545));
  fragColor = vec4(color, 1.0);
}
`;

export class AccretionRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private tex: WebGLTexture;
  private n: number;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, n: number) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.n = n;

    this.program = this.buildProgram(VERT, FRAG);
    gl.useProgram(this.program);

    // Full-screen triangle.
    const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("WebGL2 buffer alloc failed");
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // 3D density texture (R8).
    const tex = gl.createTexture();
    if (!tex) throw new Error("WebGL2 texture alloc failed");
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.R8,
      n,
      n,
      n,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      new Uint8Array(n * n * n),
    );

    for (const name of [
      "uVol",
      "uRes",
      "uTime",
      "uCamZ",
      "uEnergy",
      "uFlux",
      "uCentroid",
      "uReduced",
    ]) {
      this.uni[name] = gl.getUniformLocation(this.program, name);
    }
    gl.uniform1i(this.uni.uVol, 0);
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader alloc failed");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile error: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("program link error: " + log);
    }
    return prog;
  }

  /** Match the drawing-buffer size to the CSS size × dpr. */
  resize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      gl.canvas.width = w;
      gl.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  /** Upload the field's quantized grid and render one raymarched frame. */
  render(field: AccretionField, p: RenderParams): void {
    if (this.disposed) return;
    const gl = this.gl;
    const grid = field.quantize();

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(
      gl.TEXTURE_3D,
      0,
      0,
      0,
      0,
      this.n,
      this.n,
      this.n,
      gl.RED,
      gl.UNSIGNED_BYTE,
      grid,
    );

    // Camera drifts perpetually inward — slow, never arriving (asymptotic).
    const tau = p.reduced ? 120 : 60;
    const camZ = 0.18 + 1.72 * Math.exp(-p.elapsed / tau);

    gl.uniform2f(this.uni.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uni.uTime, p.time);
    gl.uniform1f(this.uni.uCamZ, camZ);
    gl.uniform1f(this.uni.uEnergy, p.energy);
    gl.uniform1f(this.uni.uFlux, p.flux);
    gl.uniform1f(this.uni.uCentroid, p.centroid);
    gl.uniform1f(this.uni.uReduced, p.reduced ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    try {
      gl.deleteTexture(this.tex);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* ignore */
    }
  }
}

// ─── Canvas2D fallback: additive rotating projection of the field ────────────

export class AccretionFallback2D {
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private n: number;
  private accum: Float32Array;
  private img: ImageData;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    n: number,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.ctx = ctx;
    this.n = n;
    this.accum = new Float32Array(n * n);
    this.off = document.createElement("canvas");
    this.off.width = n;
    this.off.height = n;
    const offCtx = this.off.getContext("2d");
    if (!offCtx) throw new Error("Canvas2D offscreen unavailable");
    this.offCtx = offCtx;
    this.img = this.offCtx.createImageData(n, n);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(field: AccretionField, p: RenderParams): void {
    if (this.disposed) return;
    const n = this.n;
    const acc = this.accum;
    acc.fill(0);

    const angle = p.time * (p.reduced ? 0.05 : 0.12);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const half = (n - 1) / 2;
    const d = field.data;
    let peak = 1e-3;

    // Orthographic projection with a slow spin around the vertical axis.
    for (let z = 0; z < n; z++) {
      const zc = z - half;
      for (let y = 0; y < n; y++) {
        const rowBase = n * (y + n * z);
        for (let x = 0; x < n; x++) {
          const val = d[x + rowBase];
          if (val < 0.004) continue;
          const xc = x - half;
          const rx = xc * ca - zc * sa; // rotate in x/z
          const sx = Math.round(rx + half);
          if (sx < 0 || sx >= n) continue;
          const si = sx + n * y;
          acc[si] += val;
          if (acc[si] > peak) peak = acc[si];
        }
      }
    }

    // Map accumulation → molten-gold → pearl additive image.
    const px = this.img.data;
    const inv = 1 / peak;
    for (let i = 0; i < acc.length; i++) {
      const v = Math.min(1, Math.pow(acc[i] * inv, 0.6));
      // gold #ffb347 → pearl #fff4d6
      const r = 255 * (0.02 + v * 0.98);
      const g = 255 * (0.03 + v * (v > 0.6 ? 0.93 : 0.68));
      const b = 255 * (0.06 + v * (v > 0.6 ? 0.78 : 0.28));
      const o = i * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
    this.offCtx.putImageData(this.img, 0, 0);

    // Blit the small buffer up with smoothing for a soft volumetric glow.
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#04060a";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    // Camera drift → gentle zoom over time.
    const tau = p.reduced ? 120 : 60;
    const zoom = 1.0 + 0.9 * (1 - Math.exp(-p.elapsed / tau));
    const dw = w * zoom;
    const dh = h * zoom;
    ctx.drawImage(this.off, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.disposed = true;
  }
}
