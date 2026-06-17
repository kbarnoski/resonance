// World Pulse — Canvas2D fallback nebula.
// A luminous, additively-blended particle field advected by a flow whose
// curl rises with volatility. Trades inject births at a price-mapped x.
// Momentum tints warm (up) <-> cool (down). Looks intentional on its own.

import type { MarketState } from './market'

interface P {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hue: number
  size: number
}

export class Render2D {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private particles: P[] = []
  private raf: number | null = null
  private last = 0
  private flowT = 0
  private dpr = 1
  private state: MarketState | null = null
  private running = false
  private readonly MAX = 1400

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const c = canvas.getContext('2d', { alpha: false })
    if (!c) throw new Error('no 2d context')
    this.ctx = c
    this.resize()
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr))
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr))
  }

  setState(s: MarketState) {
    this.state = s
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.step(dt)
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  // a trade landed — birth particles at price-mapped x
  inject(priceNorm: number, size01: number, sell: boolean) {
    const w = this.canvas.width
    const h = this.canvas.height
    const x = priceNorm * w
    const y = h * (0.35 + Math.random() * 0.3)
    const n = 3 + Math.floor(size01 * 30)
    for (let i = 0; i < n && this.particles.length < this.MAX; i++) {
      const ang = Math.random() * Math.PI * 2
      const spd = (20 + size01 * 160) * (0.4 + Math.random())
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        life: 0,
        maxLife: 2 + Math.random() * 3 + size01 * 3,
        hue: sell ? 205 + Math.random() * 40 : 18 + Math.random() * 36,
        size: (1 + size01 * 4) * this.dpr,
      })
    }
  }

  private step(dt: number) {
    const s = this.state
    const vol = s ? s.volatility : 0.1
    const mom = s ? s.momentum : 0
    this.flowT += dt * (0.15 + vol * 0.9)
    const w = this.canvas.width
    const h = this.canvas.height
    const curl = 0.4 + vol * 2.4

    const list = this.particles
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      // curl-noise-ish flow field (cheap sin/cos turbulence)
      const fx = Math.sin(p.y * 0.004 + this.flowT) + Math.cos(p.x * 0.003 - this.flowT * 0.7)
      const fy = Math.cos(p.x * 0.004 - this.flowT * 0.9) + Math.sin(p.y * 0.003 + this.flowT * 1.1)
      p.vx += fx * curl * 16 * dt
      p.vy += fy * curl * 16 * dt
      // gentle upward buoyancy + drag
      p.vy -= 6 * dt
      p.vx *= 0.985
      p.vy *= 0.985
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life += dt
      // momentum shifts hue toward warm/cool over lifetime
      p.hue += mom * 8 * dt
      if (
        p.life > p.maxLife ||
        p.x < -40 ||
        p.x > w + 40 ||
        p.y < -40 ||
        p.y > h + 40
      ) {
        list.splice(i, 1)
      }
    }

    // ambient nebula drift: keep a baseline population alive even with no trades
    const baseline = 260
    while (this.particles.length < baseline) {
      this.particles.push({
        x: Math.random() * w,
        y: h * (0.2 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0,
        maxLife: 6 + Math.random() * 8,
        hue: 230 + mom * 40 + Math.random() * 30,
        size: (0.8 + Math.random() * 2) * this.dpr,
      })
    }
  }

  private draw() {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const s = this.state
    const mom = s ? s.momentum : 0
    const vol = s ? s.volatility : 0.1

    // deep cosmic background wash with momentum tint, trailing for glow
    const bgWarm = mom > 0 ? mom * 14 : 0
    const bgCool = mom < 0 ? -mom * 16 : 0
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(${5 + bgWarm}, ${4 + bgWarm * 0.4}, ${10 + bgCool}, 0.16)`
    ctx.fillRect(0, 0, w, h)

    // additive particles
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.particles) {
      const lifeT = 1 - p.life / p.maxLife
      const a = Math.max(0, Math.sin(Math.PI * Math.min(1, p.life / p.maxLife)) * 0.7)
      const r = p.size * (1 + (1 - lifeT) * 1.5)
      const light = 55 + vol * 20
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6)
      g.addColorStop(0, `hsla(${p.hue}, 85%, ${light}%, ${a})`)
      g.addColorStop(1, `hsla(${p.hue}, 85%, ${light}%, 0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2)
      ctx.fill()
    }

    // a faint central horizon glow to anchor the composition
    ctx.globalCompositeOperation = 'lighter'
    const cg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.7)
    const glowHue = mom > 0 ? 32 : 220
    cg.addColorStop(0, `hsla(${glowHue}, 60%, 50%, ${0.04 + vol * 0.05})`)
    cg.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = cg
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
}
