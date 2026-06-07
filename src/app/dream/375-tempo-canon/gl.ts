// gl.ts — WebGL2 renderer for the warping-path visual.
//
// The centerpiece: a 2D plot where X = reference time (score columns) and
// Y = performance time (live note rows). The committed alignment path is a
// glowing polyline that BENDS as the player rushes (steeper than 45°) or drags
// (shallower). We also draw:
//   • the 45° "in-step" guide diagonal,
//   • the bounded DTW search window as a translucent band,
//   • the current cell as a bright pulsing cursor,
//   • accompaniment "fires" as expanding rings on the path.
//
// Everything is drawn with raw WebGL2 + our own shaders. Points/lines are pushed
// into dynamic buffers each frame. Degrades to a thrown error the page catches.

export interface RingFx {
  x: number // ndc-ish data coords (0..1 along ref)
  y: number // 0..1 along performance
  t0: number // start time (ms)
  hue: number
}

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;     // data coords in 0..1
layout(location=1) in vec4 a_color;   // rgba
layout(location=2) in float a_size;   // point size (px)
uniform vec2 u_scale;                 // maps 0..1 -> clip with margins
uniform vec2 u_offset;
out vec4 v_color;
void main(){
  vec2 p = a_pos * u_scale + u_offset;
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
uniform int u_round; // 1 = round soft point, 0 = flat
void main(){
  if(u_round==1){
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    float a = smoothstep(0.5, 0.18, r);
    outColor = vec4(v_color.rgb, v_color.a * a);
  } else {
    outColor = v_color;
  }
}`;

function makeShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader alloc failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader compile: " + log);
  }
  return s;
}

export class WarpRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private uScale: WebGLUniformLocation | null;
  private uOffset: WebGLUniformLocation | null;
  private uRound: WebGLUniformLocation | null;
  private refLen: number;
  private rows: number;
  rings: RingFx[] = [];

  constructor(canvas: HTMLCanvasElement, refLen: number, rows: number) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.refLen = refLen;
    this.rows = rows;

    const vs = makeShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = makeShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.uScale = gl.getUniformLocation(prog, "u_scale");
    this.uOffset = gl.getUniformLocation(prog, "u_offset");
    this.uRound = gl.getUniformLocation(prog, "u_round");

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    if (!vbo) throw new Error("vbo alloc failed");
    this.vbo = vbo;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = 7 * 4; // x,y,r,g,b,a,size
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(w: number, h: number, dpr: number): void {
    const cw = Math.floor(w * dpr);
    const ch = Math.floor(h * dpr);
    const cv = this.gl.canvas as HTMLCanvasElement;
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
    }
    this.gl.viewport(0, 0, cw, ch);
  }

  addRing(col: number, row: number, hue: number, now: number): void {
    this.rings.push({
      x: this.refLen > 1 ? col / (this.refLen - 1) : 0,
      y: this.rows > 1 ? row / (this.rows - 1) : 0,
      t0: now,
      hue,
    });
    if (this.rings.length > 24) this.rings.shift();
  }

  // Push a single vertex (x,y in 0..1 data space) into the array.
  private static pushV(
    arr: number[],
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
    size: number,
  ): void {
    arr.push(x, y, r, g, b, a, size);
  }

  // Render one frame. path = committed cells; cursor highlights the last.
  render(
    path: { row: number; col: number }[],
    windowLo: number,
    windowHi: number,
    now: number,
  ): void {
    const gl = this.gl;
    gl.clearColor(0.03, 0.03, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    // Margin so the plot sits inside the canvas with a little padding.
    const m = 0.12;
    gl.uniform2f(this.uScale, 2 * (1 - m), 2 * (1 - m));
    gl.uniform2f(this.uOffset, -(1 - m), -(1 - m));

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    const cx = (c: number) => (this.refLen > 1 ? c / (this.refLen - 1) : 0);
    const cy = (r: number) => (this.rows > 1 ? r / (this.rows - 1) : 0);

    // 1) Window band: filled quad (two triangles) between windowLo and windowHi
    //    across the full performance axis. Translucent violet.
    {
      const verts: number[] = [];
      const x0 = cx(windowLo);
      const x1 = cx(windowHi);
      const cr = 0.55,
        cg = 0.4,
        cb = 0.95,
        ca = 0.1;
      WarpRenderer.pushV(verts, x0, 0, cr, cg, cb, ca, 1);
      WarpRenderer.pushV(verts, x1, 0, cr, cg, cb, ca, 1);
      WarpRenderer.pushV(verts, x0, 1, cr, cg, cb, ca, 1);
      WarpRenderer.pushV(verts, x1, 0, cr, cg, cb, ca, 1);
      WarpRenderer.pushV(verts, x1, 1, cr, cg, cb, ca, 1);
      WarpRenderer.pushV(verts, x0, 1, cr, cg, cb, ca, 1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.uniform1i(this.uRound, 0);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7);
    }

    // 2) The 45° in-step guide diagonal (faint dotted via point sprites).
    {
      const verts: number[] = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        WarpRenderer.pushV(verts, u, u, 0.5, 0.55, 0.65, 0.22, 4);
      }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.uniform1i(this.uRound, 1);
      gl.drawArrays(gl.POINTS, 0, verts.length / 7);
    }

    // 3) The warping path as a thick glowing polyline, drawn as overlapping
    //    point sprites (interpolated between cells for smoothness).
    if (path.length > 0) {
      const verts: number[] = [];
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const ax = cx(a.col);
        const ay = cy(a.row);
        // glow core
        WarpRenderer.pushV(verts, ax, ay, 0.6, 0.85, 1.0, 0.85, 9);
        if (i > 0) {
          const b = path[i - 1];
          const bx = cx(b.col);
          const by = cy(b.row);
          const steps = 6;
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const ix = bx + (ax - bx) * t;
            const iy = by + (ay - by) * t;
            WarpRenderer.pushV(verts, ix, iy, 0.45, 0.7, 1.0, 0.6, 6);
          }
        }
      }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.uniform1i(this.uRound, 1);
      gl.drawArrays(gl.POINTS, 0, verts.length / 7);
    }

    // 4) Accompaniment fire rings: expanding soft circles drawn as growing
    //    point sprites that fade over ~700ms.
    if (this.rings.length) {
      const verts: number[] = [];
      const alive: RingFx[] = [];
      for (const ring of this.rings) {
        const age = (now - ring.t0) / 700;
        if (age >= 1) continue;
        alive.push(ring);
        const size = 14 + age * 46;
        const a = (1 - age) * 0.7;
        // hue → rough rgb (violet/cyan range)
        const r = 0.5 + 0.3 * Math.sin(ring.hue);
        const g = 0.6 + 0.2 * Math.cos(ring.hue);
        const b = 0.95;
        WarpRenderer.pushV(verts, ring.x, ring.y, r, g, b, a, size);
      }
      this.rings = alive;
      if (verts.length) {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
        gl.uniform1i(this.uRound, 1);
        gl.drawArrays(gl.POINTS, 0, verts.length / 7);
      }
    }

    // 5) Current cell cursor: a bright pulsing dot at the last path cell.
    if (path.length > 0) {
      const last = path[path.length - 1];
      const pulse = 16 + 6 * Math.sin(now / 120);
      const verts: number[] = [];
      WarpRenderer.pushV(verts, cx(last.col), cy(last.row), 1.0, 0.95, 0.7, 0.95, pulse);
      WarpRenderer.pushV(verts, cx(last.col), cy(last.row), 1.0, 1.0, 1.0, 1.0, 7);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.uniform1i(this.uRound, 1);
      gl.drawArrays(gl.POINTS, 0, verts.length / 7);
    }

    gl.bindVertexArray(null);
  }


  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog);
  }
}
