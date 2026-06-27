// gl-fallback.ts — hand-written WebGL2 particle approximation of the pond.
//
// Used only when navigator.gpu is unavailable. We run a lightweight CPU
// SPH-lite step (a coarse cousin of the WebGPU PBF solver) and render the
// particles as additive glowing points via a hand-written WebGL2 program.
// Audio keeps working: this returns the SAME PondStats shape so the music is
// driven by the water's motion exactly as in the WebGPU path.

import type { PondStats, FingerInput } from "./fluid-gpu";

const COUNT = 1400;
const SIM_W = 220;
const SIM_H = 220;
const H = 9;
const REST = 6.0;

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aSpeed;
uniform vec2 uSim;
out float vSpeed;
void main() {
  vec2 ndc = (aPos / uSim) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = 22.0;
  vSpeed = aSpeed;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vSpeed;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, 1.6);
  // teal-green water with amber sun-glints on fast water
  vec3 teal = vec3(0.10, 0.55, 0.50);
  vec3 amber = vec3(1.0, 0.78, 0.36);
  vec3 col = mix(teal, amber, clamp(vSpeed * 1.4, 0.0, 1.0));
  frag = vec4(col * a, a * 0.42);
}`;

export class FluidGL {
  readonly simW = SIM_W;
  readonly simH = SIM_H;
  readonly count = COUNT;
  positions = new Float32Array(COUNT * 2);

  private px = new Float32Array(COUNT);
  private py = new Float32Array(COUNT);
  private vx = new Float32Array(COUNT);
  private vy = new Float32Array(COUNT);
  private interleaved = new Float32Array(COUNT * 3); // x,y,speed

  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private vbo: WebGLBuffer | null = null;
  private uSim: WebGLUniformLocation | null = null;
  private destroyed = false;

  // simple uniform grid for neighbour search
  private cell = H;
  private gw = Math.ceil(SIM_W / H) + 1;
  private gh = Math.ceil(SIM_H / H) + 1;
  private heads: Int32Array;
  private next: Int32Array;

  constructor() {
    this.heads = new Int32Array(this.gw * this.gh);
    this.next = new Int32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SIM_W * 0.4;
      this.px[i] = SIM_W * 0.5 + Math.cos(a) * r;
      this.py[i] = SIM_H * 0.5 + Math.sin(a) * r;
    }
  }

  initGL(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) return false;
    this.gl = gl;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.prog = prog;
    this.uSim = gl.getUniformLocation(prog, "uSim");
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.interleaved.byteLength, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    return true;
  }

  private buildGrid(): void {
    this.heads.fill(-1);
    for (let i = 0; i < COUNT; i++) {
      const cx = Math.max(0, Math.min(this.gw - 1, Math.floor(this.px[i] / this.cell)));
      const cy = Math.max(0, Math.min(this.gh - 1, Math.floor(this.py[i] / this.cell)));
      const c = cy * this.gw + cx;
      this.next[i] = this.heads[c];
      this.heads[c] = i;
    }
  }

  /** CPU SPH-lite step; returns PondStats so audio is driven the same way. */
  step(finger: FingerInput, dt: number): PondStats {
    if (this.destroyed) return { stir: 0, peak: 0, pool: 0, splash: 0 };
    const h = Math.min(dt, 1 / 45);

    // integrate + finger push
    for (let i = 0; i < COUNT; i++) {
      if (finger.active) {
        const dx = this.px[i] - finger.x;
        const dy = this.py[i] - finger.y;
        const dist = Math.hypot(dx, dy);
        const R = 26;
        if (dist < R) {
          const fall = 1 - dist / R;
          const inv = dist > 1e-3 ? 1 / dist : 0;
          this.vx[i] += dx * inv * fall * 90 * h;
          this.vy[i] += dy * inv * fall * 90 * h;
          this.vx[i] += finger.vx * fall * 1.4 * h;
          this.vy[i] += finger.vy * fall * 1.4 * h;
        }
      }
      this.vx[i] *= 0.985;
      this.vy[i] *= 0.985;
    }

    this.buildGrid();

    // density relaxation (one pass, double-relaxation style approximation of PBF)
    for (let i = 0; i < COUNT; i++) {
      const xi = this.px[i] + this.vx[i] * h;
      const yi = this.py[i] + this.vy[i] * h;
      const cx = Math.max(0, Math.min(this.gw - 1, Math.floor(xi / this.cell)));
      const cy = Math.max(0, Math.min(this.gh - 1, Math.floor(yi / this.cell)));
      let dens = 0;
      let pdx = 0;
      let pdy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= this.gw || ny >= this.gh) continue;
          let j = this.heads[ny * this.gw + nx];
          while (j !== -1) {
            if (j !== i) {
              const rx = xi - this.px[j];
              const ry = yi - this.py[j];
              const r = Math.hypot(rx, ry);
              if (r < H && r > 1e-4) {
                const q = 1 - r / H;
                dens += q * q;
                const press = q * q * 0.9;
                pdx += (rx / r) * press;
                pdy += (ry / r) * press;
              }
            }
            j = this.next[j];
          }
        }
      }
      const corr = (dens - REST) * 0.0;
      void corr;
      // push apart to hold rest density
      this.vx[i] += pdx * 0.8;
      this.vy[i] += pdy * 0.8;
    }

    // finalize: boundary, stats
    const center = SIM_W * 0.5;
    const rad = SIM_W * 0.46;
    let sumSpeed = 0;
    let peak = 0;
    let underCount = 0;
    let splash = 0;
    for (let i = 0; i < COUNT; i++) {
      this.px[i] += this.vx[i] * h;
      this.py[i] += this.vy[i] * h;
      const ox = this.px[i] - center;
      const oy = this.py[i] - center;
      const d = Math.hypot(ox, oy);
      if (d > rad) {
        this.px[i] = center + (ox / d) * rad;
        this.py[i] = center + (oy / d) * rad;
        this.vx[i] *= 0.4;
        this.vy[i] *= 0.4;
      }
      this.vx[i] *= 0.92;
      this.vy[i] *= 0.92;
      const speed = Math.hypot(this.vx[i], this.vy[i]);
      const sNorm = Math.min(1, speed / 60);
      sumSpeed += sNorm;
      if (sNorm > peak) peak = sNorm;
      this.positions[i * 2] = this.px[i];
      this.positions[i * 2 + 1] = this.py[i];
      this.interleaved[i * 3] = this.px[i];
      this.interleaved[i * 3 + 1] = this.py[i];
      this.interleaved[i * 3 + 2] = sNorm;
      if (finger.active) {
        const fd = Math.hypot(this.px[i] - finger.x, this.py[i] - finger.y);
        if (fd < 24) underCount++;
        if (fd < 30 && sNorm > 0.5 && sNorm > splash) splash = sNorm;
      }
    }

    const stir = Math.min(1, sumSpeed / COUNT / 0.18);
    const pool = underCount > 0 ? Math.min(1, (underCount / 26) * 0.7) : 0;
    return { stir, peak, pool, splash: splash > 0.5 ? splash : 0 };
  }

  render(): void {
    const gl = this.gl;
    if (!gl || !this.prog || this.destroyed) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uSim, SIM_W, SIM_H);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.interleaved);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  resize(w: number, h: number): void {
    this.gl?.viewport(0, 0, w, h);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    if (!gl) return;
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.prog) gl.deleteProgram(this.prog);
    this.gl = null;
  }
}
