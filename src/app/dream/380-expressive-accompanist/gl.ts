// gl.ts — WebGL2 renderer for the Expressive Accompanist.
//
// The centerpiece visualization extends the cycle-1 warping-path plot with the
// "expression ribbon": a deepening of the basic path that encodes TWO live
// expressive parameters in the path itself:
//
//   • THICKNESS  → soloist's live dynamics (loud = fat glow, soft = thin)
//   • DASHING    → soloist's live articulation (legato = solid, staccato = segmented)
//
// Additional elements:
//   • 45° in-step diagonal guide (faint, dashed dots)
//   • Translucent bounded-search-window band (violet)
//   • Pulsing current-cell cursor
//   • Expanding fire-rings on accompaniment chords whose SIZE = chord loudness
//
// Pure WebGL2, #version 300 es GLSL. DPR/resize aware. Degrades to an error.

export interface RingFx {
  x: number   // 0..1 data coords
  y: number
  t0: number  // start time ms
  hue: number
  loudness: number  // 0..1, drives ring size
}

// ── Vertex shader ─────────────────────────────────────────────────────────────
const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
layout(location=2) in float a_size;
uniform vec2 u_scale;
uniform vec2 u_offset;
out vec4 v_color;
void main(){
  vec2 p = a_pos * u_scale + u_offset;
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`

// ── Fragment shader ───────────────────────────────────────────────────────────
// u_round=1 → radial soft point  (glow / ring)
// u_round=0 → flat (triangles/quads)
// u_dash:   when 1 → applies a dashing pattern based on gl_FragCoord modulo
const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
uniform int u_round;
uniform float u_dash;   // 0=solid, >0=period in px; if non-zero, staccato dash
void main(){
  if(u_dash > 0.5){
    // Dashed pattern: discard every other segment.
    float period = u_dash;
    float phase = mod(gl_FragCoord.x + gl_FragCoord.y, period);
    if(phase < period * 0.42) discard;
  }
  if(u_round==1){
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    float a = smoothstep(0.5, 0.15, r);
    outColor = vec4(v_color.rgb, v_color.a * a);
  } else {
    outColor = v_color;
  }
}`

function buildShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error("shader alloc failed")
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error("shader compile: " + log)
  }
  return s
}

export class ExpressionRenderer {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private vbo: WebGLBuffer
  private vao: WebGLVertexArrayObject
  private uScale: WebGLUniformLocation | null
  private uOffset: WebGLUniformLocation | null
  private uRound: WebGLUniformLocation | null
  private uDash: WebGLUniformLocation | null
  private refLen: number
  private maxRows: number
  rings: RingFx[] = []

  constructor(canvas: HTMLCanvasElement, refLen: number, maxRows: number) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true })
    if (!gl) throw new Error("WebGL2 unavailable")
    this.gl = gl
    this.refLen = refLen
    this.maxRows = maxRows

    const vs = buildShader(gl, gl.VERTEX_SHADER, VERT)
    const fs = buildShader(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!prog) throw new Error("program alloc failed")
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog))
    }
    this.prog = prog
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    this.uScale  = gl.getUniformLocation(prog, "u_scale")
    this.uOffset = gl.getUniformLocation(prog, "u_offset")
    this.uRound  = gl.getUniformLocation(prog, "u_round")
    this.uDash   = gl.getUniformLocation(prog, "u_dash")

    const vao = gl.createVertexArray()
    if (!vao) throw new Error("vao alloc failed")
    this.vao = vao
    gl.bindVertexArray(vao)
    const vbo = gl.createBuffer()
    if (!vbo) throw new Error("vbo alloc failed")
    this.vbo = vbo
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    const stride = 7 * 4 // x,y,r,g,b,a,size
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4)
    gl.bindVertexArray(null)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  resize(w: number, h: number, dpr: number): void {
    const cw = Math.floor(w * dpr)
    const ch = Math.floor(h * dpr)
    const cv = this.gl.canvas as HTMLCanvasElement
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw
      cv.height = ch
    }
    this.gl.viewport(0, 0, cw, ch)
  }

  addRing(col: number, row: number, hue: number, loudness: number, now: number): void {
    this.rings.push({
      x: this.refLen > 1 ? col / (this.refLen - 1) : 0,
      y: this.maxRows > 1 ? row / (this.maxRows - 1) : 0,
      t0: now,
      hue,
      loudness: Math.max(0, Math.min(1, loudness)),
    })
    if (this.rings.length > 32) this.rings.shift()
  }

  // Push one vertex (x,y in 0..1 data space) into a flat array.
  private static pushV(
    arr: number[],
    x: number, y: number,
    r: number, g: number, b: number, a: number,
    size: number,
  ): void {
    arr.push(x, y, r, g, b, a, size)
  }

  // Upload + draw a batch of vertices with given primitive and render params.
  private drawBatch(
    verts: number[],
    primitive: number,
    round: number,
    dash: number,
  ): void {
    if (!verts.length) return
    const gl = this.gl
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW)
    gl.uniform1i(this.uRound, round)
    gl.uniform1f(this.uDash, dash)
    gl.drawArrays(primitive, 0, verts.length / 7)
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  // path       — committed DTW cells
  // windowLo/Hi — search window bounds (ref col)
  // dynamics   — soloist smoothed velocity normalized 0..1 (drives ribbon thickness)
  // articulation — soloist smoothed articulation ratio 0..1 (0=staccato, 1=legato)
  // now        — current timestamp ms
  render(
    path: { row: number; col: number }[],
    windowLo: number,
    windowHi: number,
    dynamics: number,
    articulation: number,
    now: number,
  ): void {
    const gl = this.gl
    gl.clearColor(0.035, 0.030, 0.065, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.prog)

    // Plot margins so the path sits inside the canvas with some breathing room.
    const m = 0.13
    gl.uniform2f(this.uScale, 2 * (1 - m), 2 * (1 - m))
    gl.uniform2f(this.uOffset, -(1 - m), -(1 - m))

    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)

    const cx = (c: number) => (this.refLen > 1 ? c / (this.refLen - 1) : 0)
    const cy = (r: number) => (this.maxRows > 1 ? r / (this.maxRows - 1) : 0)

    // ── 1. Window band ─────────────────────────────────────────────────────────
    // Translucent violet band showing the DTW search window.
    {
      const verts: number[] = []
      const x0 = cx(windowLo)
      const x1 = cx(windowHi)
      const [cr, cg, cb, ca] = [0.55, 0.35, 0.90, 0.08]
      ExpressionRenderer.pushV(verts, x0, 0, cr, cg, cb, ca, 1)
      ExpressionRenderer.pushV(verts, x1, 0, cr, cg, cb, ca, 1)
      ExpressionRenderer.pushV(verts, x0, 1, cr, cg, cb, ca, 1)
      ExpressionRenderer.pushV(verts, x1, 0, cr, cg, cb, ca, 1)
      ExpressionRenderer.pushV(verts, x1, 1, cr, cg, cb, ca, 1)
      ExpressionRenderer.pushV(verts, x0, 1, cr, cg, cb, ca, 1)
      this.drawBatch(verts, gl.TRIANGLES, 0, 0)
    }

    // ── 2. In-step 45° guide ────────────────────────────────────────────────────
    // Faint dotted diagonal: "you would be here if you played in strict tempo".
    {
      const verts: number[] = []
      const N = 50
      for (let i = 0; i <= N; i++) {
        const u = i / N
        ExpressionRenderer.pushV(verts, u, u, 0.45, 0.50, 0.60, 0.18, 3.5)
      }
      this.drawBatch(verts, gl.POINTS, 1, 0)
    }

    // ── 3. Expression ribbon — the cycle-2 deepening ───────────────────────────
    // The warping path is rendered as overlapping point sprites, but:
    //   • base size + fat halo scales with live dynamics (loud → thick glow)
    //   • staccato mode activates dashing via u_dash (legato=solid)
    //
    // We draw two layers:
    //   Layer A (outer halo)  — large, dim, driven by dynamics
    //   Layer B (inner core)  — smaller, bright, always solid
    if (path.length > 0) {
      // Thickness: maps dynamics 0..1 → point size range 7..22px for halo.
      const haloSize = 7 + 15 * dynamics
      const coreSize = 4 + 5 * dynamics

      // Dash period: staccato (articulation < 0.45) → dashed; else solid.
      // We use the dashing flag only for the outer halo.
      const dashPeriod = articulation < 0.45 ? 18 : 0

      const haloVerts: number[] = []
      const coreVerts: number[] = []

      for (let i = 0; i < path.length; i++) {
        const a = path[i]
        const ax = cx(a.col)
        const ay = cy(a.row)

        // Halo: violet-ish, driven by dynamics.
        const velAlpha = 0.35 + 0.50 * dynamics
        ExpressionRenderer.pushV(haloVerts, ax, ay, 0.55, 0.45, 0.95, velAlpha, haloSize)

        // Interpolated halo segments for smoothness.
        if (i > 0) {
          const b = path[i - 1]
          const bx = cx(b.col)
          const by = cy(b.row)
          const steps = 5
          for (let s = 1; s < steps; s++) {
            const frac = s / steps
            const ix = bx + (ax - bx) * frac
            const iy = by + (ay - by) * frac
            ExpressionRenderer.pushV(haloVerts, ix, iy, 0.45, 0.40, 0.85, velAlpha * 0.7, haloSize * 0.75)
          }
        }

        // Core: cyan-white, always solid.
        ExpressionRenderer.pushV(coreVerts, ax, ay, 0.65, 0.90, 1.0, 0.90, coreSize)
        if (i > 0) {
          const b = path[i - 1]
          const bx = cx(b.col)
          const by = cy(b.row)
          const steps = 4
          for (let s = 1; s < steps; s++) {
            const frac = s / steps
            const ix = bx + (ax - bx) * frac
            const iy = by + (ay - by) * frac
            ExpressionRenderer.pushV(coreVerts, ix, iy, 0.50, 0.75, 0.95, 0.65, coreSize * 0.8)
          }
        }
      }

      this.drawBatch(haloVerts, gl.POINTS, 1, dashPeriod)
      this.drawBatch(coreVerts, gl.POINTS, 1, 0)
    }

    // ── 4. Accompaniment fire-rings ────────────────────────────────────────────
    // Expanding circles at each chord event; size encodes accompaniment loudness.
    {
      const ringVerts: number[] = []
      const alive: RingFx[] = []
      for (const ring of this.rings) {
        const age = (now - ring.t0) / 750
        if (age >= 1) continue
        alive.push(ring)
        // Louder accompaniment → bigger max ring size.
        const maxSize = 16 + 52 * ring.loudness
        const size = maxSize * age
        const a = (1 - age) * 0.75
        const r = 0.50 + 0.30 * Math.sin(ring.hue)
        const g = 0.55 + 0.25 * Math.cos(ring.hue + 1.0)
        const b = 0.92
        ExpressionRenderer.pushV(ringVerts, ring.x, ring.y, r, g, b, a, size)
      }
      this.rings = alive
      this.drawBatch(ringVerts, gl.POINTS, 1, 0)
    }

    // ── 5. Current-cell cursor ─────────────────────────────────────────────────
    // Bright pulsing dot at the last committed path cell.
    if (path.length > 0) {
      const last = path[path.length - 1]
      const pulse = 15 + 7 * Math.sin(now / 115)
      const verts: number[] = []
      ExpressionRenderer.pushV(verts, cx(last.col), cy(last.row), 1.0, 0.90, 0.65, 0.92, pulse)
      ExpressionRenderer.pushV(verts, cx(last.col), cy(last.row), 1.0, 1.0, 1.0, 1.0, 7)
      this.drawBatch(verts, gl.POINTS, 1, 0)
    }

    gl.bindVertexArray(null)
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteBuffer(this.vbo)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
  }
}
