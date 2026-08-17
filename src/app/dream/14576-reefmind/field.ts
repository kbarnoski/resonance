// field.ts — the raw WebGL2 ping-pong Gray-Scott membrane.
//
// A pair of RGBA32F textures hold the two chemical concentrations (U in .r,
// V in .g). Each frame runs several Gray-Scott iterations by ping-ponging
// between them through framebuffers. A reduction pass + gl.readPixels hands the
// CPU a tiny down-sampled summary of the V field, from which we derive each of
// the 16 species' bloom amount and horizontal centroid to drive the mix.
//
// No Canvas2D, no three.js — this is the OUTPUT substrate the brief asks for.

import { VS, buildRdFs, buildReduceFs, DISP_FS } from "./glsl";

export const SIM = 256; // simulation resolution
export const READ = 64; // readback resolution (SIM/READ must be integer)
export const ZONES = 4; // 4×4 = 16 species regions
export const SPECIES = ZONES * ZONES;

/** Per-species field summary derived from the reduced V field. */
export interface SpeciesSummary {
  /** Mean V concentration in the zone, ~0..0.45. Higher = blooming/coherent. */
  bloom: number;
  /** V-weighted horizontal centroid within the zone, -1 (left) .. +1 (right). */
  pan: number;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  return p;
}

function floatTex(gl: WebGL2RenderingContext, w: number, h: number, data: Float32Array | null): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

function fbo(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

/** Seed: U=1 (full substrate), V=0, plus one activator blob per zone so every
 *  species can ignite its own pattern. */
function seed(): Float32Array {
  const d = new Float32Array(SIM * SIM * 4);
  for (let i = 0; i < SIM * SIM; i++) {
    d[i * 4] = 1.0;
    d[i * 4 + 3] = 1.0;
  }
  const zw = SIM / ZONES;
  for (let zy = 0; zy < ZONES; zy++) {
    for (let zx = 0; zx < ZONES; zx++) {
      const cx = Math.floor((zx + 0.5) * zw + (Math.random() - 0.5) * zw * 0.3);
      const cy = Math.floor((zy + 0.5) * zw + (Math.random() - 0.5) * zw * 0.3);
      const R = 9;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R) continue;
          const x = (cx + dx + SIM) % SIM;
          const y = (cy + dy + SIM) % SIM;
          const idx = (y * SIM + x) * 4;
          const fall = 1 - Math.sqrt(dx * dx + dy * dy) / R;
          d[idx] = 0.5 + 0.5 * (1 - fall);
          d[idx + 1] = 0.5 * fall;
        }
      }
    }
  }
  return d;
}

export class Field {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private rdProg: WebGLProgram;
  private reduceProg: WebGLProgram;
  private dispProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadBuf: WebGLBuffer;
  private tex: [WebGLTexture, WebGLTexture];
  private fbos: [WebGLFramebuffer, WebGLFramebuffer];
  private readTex: WebGLTexture;
  private readFbo: WebGLFramebuffer;
  private uRdTime: WebGLUniformLocation | null;
  private ping: 0 | 1 = 0;
  private readBuf = new Float32Array(READ * READ * 4);

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false }) as
      | WebGL2RenderingContext
      | null;
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error("Float framebuffers (EXT_color_buffer_float) are not supported here.");

    this.gl = gl;
    this.canvas = canvas;
    this.rdProg = link(gl, VS, buildRdFs(SIM));
    this.reduceProg = link(gl, VS, buildReduceFs(SIM, READ));
    this.dispProg = link(gl, VS, DISP_FS);
    this.uRdTime = gl.getUniformLocation(this.rdProg, "u_time");

    // Shared full-screen quad (every program uses layout(location=0) a_pos).
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const t0 = floatTex(gl, SIM, SIM, seed());
    const t1 = floatTex(gl, SIM, SIM, null);
    this.tex = [t0, t1];
    this.fbos = [fbo(gl, t0), fbo(gl, t1)];

    this.readTex = floatTex(gl, READ, READ, null);
    this.readFbo = fbo(gl, this.readTex);
  }

  /** Advance the reaction-diffusion field by `steps` Gray-Scott iterations. */
  step(steps: number, timeSec: number): void {
    const gl = this.gl;
    gl.useProgram(this.rdProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, SIM, SIM);
    if (this.uRdTime) gl.uniform1f(this.uRdTime, timeSec);
    for (let s = 0; s < steps; s++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.ping ^ 1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.ping = (this.ping ^ 1) as 0 | 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Reduce the current V field and read it back → per-species bloom + pan. */
  readSummaries(): SpeciesSummary[] {
    const gl = this.gl;
    gl.useProgram(this.reduceProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, READ, READ);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, READ, READ, gl.RGBA, gl.FLOAT, this.readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const zw = READ / ZONES; // texels per zone edge
    const sumV = new Float64Array(SPECIES);
    const sumWX = new Float64Array(SPECIES);

    for (let ty = 0; ty < READ; ty++) {
      const zoneRow = Math.floor(ty / zw); // readPixels y=0 is bottom; matches shader uv.y
      for (let tx = 0; tx < READ; tx++) {
        const zoneCol = Math.floor(tx / zw);
        const zi = zoneRow * ZONES + zoneCol;
        const v = this.readBuf[(ty * READ + tx) * 4];
        // horizontal position within the zone, 0..1
        const localX = (tx - zoneCol * zw + 0.5) / zw;
        sumV[zi] += v;
        sumWX[zi] += v * localX;
      }
    }

    const perZone = zw * zw;
    const out: SpeciesSummary[] = [];
    for (let i = 0; i < SPECIES; i++) {
      const bloom = sumV[i] / perZone;
      const cx = sumV[i] > 1e-4 ? sumWX[i] / sumV[i] : 0.5; // 0..1
      out.push({ bloom, pan: cx * 2 - 1 });
    }
    return out;
  }

  /** Draw the glowing membrane to the canvas at its current pixel size. */
  draw(): void {
    const gl = this.gl;
    gl.useProgram(this.dispProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Perturb the chemistry: stamp activator blobs into the current field.
   *  Points are in simulation space (0..SIM). Used for mic-seeded ripples. */
  inject(points: Array<{ x: number; y: number; r: number }>): void {
    if (!points.length) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    for (const p of points) {
      const R = Math.max(3, Math.min(20, Math.round(p.r)));
      const D = R * 2 + 1;
      const blob = new Float32Array(D * D * 4);
      for (let i = 0; i < D * D; i++) {
        blob[i * 4] = 1.0;
        blob[i * 4 + 3] = 1.0;
      }
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          const fall = 1 - Math.sqrt(d2) / R;
          const idx = ((dy + R) * D + (dx + R)) * 4;
          blob[idx] = 0.5 + 0.5 * (1 - fall);
          blob[idx + 1] = 0.5 * fall;
        }
      }
      const x = Math.max(R, Math.min(SIM - R - 1, Math.round(p.x)));
      const y = Math.max(R, Math.min(SIM - R - 1, Math.round(p.y)));
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x - R, y - R, D, D, gl.RGBA, gl.FLOAT, blob);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Full teardown of every GL resource. */
  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.rdProg);
      gl.deleteProgram(this.reduceProg);
      gl.deleteProgram(this.dispProg);
      gl.deleteVertexArray(this.vao);
      gl.deleteBuffer(this.quadBuf);
      gl.deleteTexture(this.tex[0]);
      gl.deleteTexture(this.tex[1]);
      gl.deleteTexture(this.readTex);
      gl.deleteFramebuffer(this.fbos[0]);
      gl.deleteFramebuffer(this.fbos[1]);
      gl.deleteFramebuffer(this.readFbo);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* context already gone */
    }
  }
}
