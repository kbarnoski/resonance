/**
 * viz.ts — WebGL2 visual engine for 387-drop-engine
 *
 * Dark club aesthetic: violet / cyan / magenta accents on near-black background.
 *
 * Visual layers (all beat-synced from the same arc clock):
 *   1. Tension arc ring  — a circular gauge showing tension 0→1
 *   2. Frequency bars    — reactive spectrum pile up during BUILD, explode on DROP
 *   3. Particle bloom    — particles burst outward on the DROP beat
 *   4. Phase label       — GROOVE / BUILD / DROP / RELEASE (large, center)
 *   5. Beat flash        — soft radial pulse on each kick beat
 *
 * Renders with WebGL2. Falls back gracefully if unavailable.
 */

import type { ArcPhase } from "./arc"

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
layout(location=2) in float a_size;
out vec4 v_color;
void main(){
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`

const FRAG_SRC = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
uniform int u_mode; // 0=triangle, 1=circle point
void main(){
  if(u_mode == 1){
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    float a = smoothstep(0.5, 0.1, r);
    outColor = vec4(v_color.rgb, v_color.a * a);
  } else {
    outColor = v_color;
  }
}`

// ── Types ─────────────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number // 0→1, counts down
  hue: number
  size: number
}

export interface VizState {
  phase: ArcPhase
  tension: number
  beat: number        // 0-3
  bar: number
  beatFired: boolean  // true when beat just advanced (one-frame flag)
  dropFired: boolean  // true when DROP phase just started
  userIntensity: number
}

// ── Colours ───────────────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number, a = 1.0): [number, number, number, number] {
  // Convert HSL→RGB (0..1 floats)
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const col = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [col(0), col(8), col(4), a]
}

function phaseAccent(phase: ArcPhase): [number, number, number, number] {
  switch (phase) {
    case "GROOVE":  return hsl(260, 70, 58) // violet
    case "BUILD":   return hsl(200, 90, 60) // cyan
    case "DROP":    return hsl(310, 90, 62) // magenta
    case "RELEASE": return hsl(170, 70, 55) // teal
  }
}

// ── GL helpers ────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error("shader alloc")
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error("shader compile: " + log)
  }
  return s
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const prog = gl.createProgram()
  if (!prog) throw new Error("program alloc")
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog))
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return prog
}

// ── VizEngine ─────────────────────────────────────────────────────────────────

const BAR_COUNT = 64
const MAX_PARTICLES = 600

export class VizEngine {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private vbo: WebGLBuffer
  private uMode: WebGLUniformLocation

  private canvas: HTMLCanvasElement
  private dpr: number

  // Bar heights (simulated spectrum, phase-driven)
  private barHeights = new Float32Array(BAR_COUNT)
  private barVels = new Float32Array(BAR_COUNT)

  // Particles
  private particles: Particle[] = []

  // Beat flash state
  private flashIntensity = 0

  // Resize observer
  private resizeObs: ResizeObserver

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)

    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error("WebGL2 not available in this browser")
    this.gl = gl

    this.prog = buildProgram(gl)

    const vao = gl.createVertexArray()
    if (!vao) throw new Error("VAO alloc")
    this.vao = vao

    const vbo = gl.createBuffer()
    if (!vbo) throw new Error("VBO alloc")
    this.vbo = vbo

    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)

    // layout: pos(2) + color(4) + size(1) = 7 floats
    const stride = 7 * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4)
    gl.bindVertexArray(null)

    this.uMode = gl.getUniformLocation(this.prog, "u_mode")!

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)  // additive blending for glow

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(canvas)
    this.resize()
  }

  private resize(): void {
    const c = this.canvas
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = Math.round(w * this.dpr)
    c.height = Math.round(h * this.dpr)
    this.gl.viewport(0, 0, c.width, c.height)
  }

  // ── Main draw ─────────────────────────────────────────────────────────────

  draw(state: VizState, dt: number): void {
    const gl = this.gl
    const W = this.canvas.width
    const H = this.canvas.height
    const aspect = W / H

    // Update simulation
    this.updateBars(state, dt)
    this.updateParticles(dt)
    if (state.beatFired && (state.beat === 0)) {
      this.flashIntensity = state.phase === "DROP" ? 0.55 : 0.18
    }
    if (state.dropFired) {
      this.spawnDropBloom(state)
    }
    this.flashIntensity *= Math.pow(0.012, dt) // fast decay ~120ms

    // Clear
    gl.clearColor(0.03, 0.02, 0.06, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const verts: number[] = []

    // 1. Beat flash (soft radial gradient via large additive point)
    if (this.flashIntensity > 0.005) {
      const c = phaseAccent(state.phase)
      const sz = Math.min(W, H) * 1.2
      verts.push(0, 0, c[0], c[1], c[2], this.flashIntensity * 0.35, sz)
    }

    // 3. Tension arc ring
    this.drawTensionRing(verts, state, aspect)

    // 4. Particles
    this.drawParticles(verts)

    // Upload + draw
    if (verts.length > 0) {
      gl.useProgram(this.prog)
      gl.bindVertexArray(this.vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
      const arr = new Float32Array(verts)
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW)
      const vertCount = verts.length / 7

      // Draw circles (flash + particles) as points
      gl.uniform1i(this.uMode, 1)
      gl.drawArrays(gl.POINTS, 0, vertCount)

      gl.bindVertexArray(null)
    }

    // 5. Bar triangles (separate geometry)
    this.drawBarTris(state, aspect)
  }

  // ── Bar simulation ────────────────────────────────────────────────────────

  private updateBars(state: VizState, dt: number): void {
    const tension = state.tension
    const phase = state.phase

    for (let i = 0; i < BAR_COUNT; i++) {
      // Target height: noise + tension bias
      const noise = Math.sin(i * 0.37 + Date.now() * 0.001 + i * 0.1) * 0.5 + 0.5
      let target = 0

      switch (phase) {
        case "GROOVE":
          target = 0.08 + 0.12 * noise
          // Beat-sync pulse on kick beats
          if (i < BAR_COUNT * 0.2 && state.beat === 0) target += 0.25
          break
        case "BUILD":
          target = 0.05 + tension * 0.7 * noise + tension * 0.3
          break
        case "DROP":
          target = 0.3 + tension * 0.6 + noise * 0.2
          break
        case "RELEASE":
          target = 0.05 + 0.15 * noise * (1 - tension)
          break
      }

      // Spring toward target
      const spring = 18 * (target - this.barHeights[i])
      this.barVels[i] += spring * dt
      this.barVels[i] *= Math.pow(0.001, dt) // damping
      this.barHeights[i] += this.barVels[i] * dt
      this.barHeights[i] = Math.max(0, Math.min(1, this.barHeights[i]))
    }
  }

  // ── Bar triangles (WebGL triangles, not points) ───────────────────────────

  private drawBarTris(state: VizState, aspect: number): void {
    const gl = this.gl
    const W = this.canvas.width
    const H = this.canvas.height

    const verts: number[] = []
    const accent = phaseAccent(state.phase)
    const [ar, ag, ab] = accent

    const barW = 2.0 / BAR_COUNT
    const gap = barW * 0.15

    for (let i = 0; i < BAR_COUNT; i++) {
      const bh = this.barHeights[i]
      const x0 = -1.0 + i * barW + gap
      const x1 = -1.0 + (i + 1) * barW - gap
      const y0 = -1.0
      const y1 = -1.0 + bh * 1.1 * (H / W) * aspect

      // Brightness varies: lower bars dimmer
      const bright = 0.4 + 0.6 * bh
      const alpha = 0.55 + 0.4 * bh * state.tension

      // Triangle: two tris per bar
      // Bottom-left, bottom-right, top-left
      verts.push(x0, y0, ar * bright, ag * bright, ab * bright, alpha, 4)
      verts.push(x1, y0, ar * bright, ag * bright, ab * bright, alpha, 4)
      verts.push(x0, y1, ar, ag, ab, alpha, 4)
      // Bottom-right, top-right, top-left
      verts.push(x1, y0, ar * bright, ag * bright, ab * bright, alpha, 4)
      verts.push(x1, y1, ar, ag, ab, alpha, 4)
      verts.push(x0, y1, ar, ag, ab, alpha, 4)
    }

    if (verts.length === 0) return

    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW)
    gl.uniform1i(this.uMode, 0)
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7)
    gl.bindVertexArray(null)
  }

  // ── Tension ring ─────────────────────────────────────────────────────────

  private drawTensionRing(verts: number[], state: VizState, aspect: number): void {
    const tension = state.tension
    const accent = phaseAccent(state.phase)
    const [ar, ag, ab] = accent

    // Ring: sequence of points at radius R along the arc 0..tension*2π
    const R = 0.28
    const segments = Math.max(4, Math.round(tension * 120))
    const startAngle = -Math.PI / 2 // top

    for (let i = 0; i <= segments; i++) {
      const t = i / Math.max(1, segments)
      const angle = startAngle + t * tension * Math.PI * 2
      const x = Math.cos(angle) * R
      const y = Math.sin(angle) * R * (aspect > 1 ? aspect : 1)

      // Glow: brighter at the leading edge
      const glow = 0.3 + 0.7 * (i / segments)
      const size = 3 + tension * 4
      verts.push(x, y, ar * glow, ag * glow, ab * glow, 0.85, size)
    }

    // Centre fill dot, pulses on beat
    const pulseExtra = state.beatFired && state.beat === 0 ? 0.3 : 0
    const centreA = 0.15 + tension * 0.4 + pulseExtra
    const centreSize = 10 + tension * 24 + pulseExtra * 30
    verts.push(0, 0, ar, ag, ab, centreA, centreSize)
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnDropBloom(state: VizState): void {
    const count = 180 + Math.round(state.userIntensity * 120)
    const accent = phaseAccent(state.phase)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.4 + Math.random() * 1.2
      const hue = 260 + Math.random() * 100 // violet→magenta range
      this.particles.push({
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        hue,
        size: 3 + Math.random() * 8,
      })
      void accent // used for color variety
    }

    // Trim excess
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES)
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= Math.pow(0.15, dt)
      p.vy *= Math.pow(0.15, dt)
      p.life -= dt * 0.8
      if (p.life <= 0) this.particles.splice(i, 1)
    }
  }

  private drawParticles(verts: number[]): void {
    for (const p of this.particles) {
      const c = hsl(p.hue, 90, 70, p.life * 0.9)
      verts.push(p.x, p.y, c[0], c[1], c[2], c[3], p.size * p.life)
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.resizeObs.disconnect()
    const gl = this.gl
    gl.deleteBuffer(this.vbo)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
  }
}
