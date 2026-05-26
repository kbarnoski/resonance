"use client"
import { useEffect, useRef, useState } from "react"

// ── audio ─────────────────────────────────────────────────────────────────────
const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63] // C3 E3 G3 A3 C4

function pluckNote(ac: AudioContext, pitchIdx: number) {
  const hz    = FREQS[pitchIdx]
  const decay = 0.60 - pitchIdx * 0.05  // C3=0.60s → C4=0.40s
  const now   = ac.currentTime
  // two-oscillator pair ±5¢ for warmth
  for (const detune of [-5, 5]) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = "sine"
    osc.frequency.value = hz
    osc.detune.value = detune
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.20, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(now)
    osc.stop(now + decay + 0.05)
  }
}

// ── visual config ─────────────────────────────────────────────────────────────
const HUE     = [265, 142, 38, 350, 174]     // violet emerald amber rose cyan
const BOB_R   = [26, 22, 19, 16, 14]         // bigger = lower pitch (BANDIMAL rule)
const LEN_FR  = [0.42, 0.32, 0.22, 0.14, 0.08] // pendulum length as fraction of H
const VISUAL_G = 1800                         // visual gravity px/s²

// ── types ─────────────────────────────────────────────────────────────────────
interface Spark {
  x: number; y: number; vx: number; vy: number; r: number; life: number
}

interface Pendulum {
  idx:       number
  theta:     number   // angle (0 = straight down)
  omega:     number   // angular velocity rad/s
  L:         number   // string length px
  ax:        number   // anchor x
  ay:        number   // anchor y
  prevSign:  number   // sign(theta) at last frame, for zero-crossing detection
  lastPluck: number   // ms timestamp of last note
  flash:     number   // 0..1, decays after pluck
  sparks:    Spark[]
}

function buildSparks(x: number, y: number, hue: number): Spark[] {
  return Array.from({ length: 12 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.5
    const spd   = 1.8 + Math.random() * 2.4
    return { x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
             r: 2 + Math.random() * 1.5, life: 1 }
  })
}

function buildPendulums(W: number, H: number): Pendulum[] {
  // Alternate starting directions so bobs don't all swing the same way
  const thetaStart = [0.38, -0.34, 0.38, -0.34, 0.38]
  return LEN_FR.map((frac, i) => ({
    idx:       i,
    theta:     thetaStart[i],
    omega:     0,
    L:         frac * H,
    ax:        W * (i + 1) / 6,
    ay:        H * 0.07,
    prevSign:  Math.sign(thetaStart[i]),
    lastPluck: 0,
    flash:     0,
    sparks:    [],
  }))
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const actxRef      = useRef<AudioContext | null>(null)
  const pendulumsRef = useRef<Pendulum[]>([])
  const rafRef       = useRef<number>(0)
  const dimRef       = useRef({ W: 0, H: 0 })

  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const ac  = actxRef.current!

    // Soft ambient pad: C3 + G3 sine
    const padOscs = [130.81, 196.00].map(f => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = "sine"; o.frequency.value = f; g.gain.value = 0.005
      o.connect(g); g.connect(ac.destination); o.start(); return o
    })

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W   = window.innerWidth
      const H   = window.innerHeight
      dimRef.current    = { W, H }
      canvas.width      = W * dpr
      canvas.height     = H * dpr
      ctx.scale(dpr, dpr)
      pendulumsRef.current = buildPendulums(W, H)
    }
    resize()
    window.addEventListener("resize", resize)

    // ── pointer: tap any pendulum bob to push it ──────────────────────────
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      if (ac.state === "suspended") void ac.resume()
      const rect = canvas.getBoundingClientRect()
      const cx   = e.clientX - rect.left
      const cy   = e.clientY - rect.top

      // Find nearest bob (generous hit area = 3× bob radius + 20px)
      let best: Pendulum | null = null
      let bestDist = Infinity
      for (const p of pendulumsRef.current) {
        const bobX = p.ax + Math.sin(p.theta) * p.L
        const bobY = p.ay + Math.cos(p.theta) * p.L
        const dx = cx - bobX, dy = cy - bobY
        const d  = Math.sqrt(dx * dx + dy * dy)
        const hit = BOB_R[p.idx] * 3 + 20
        if (d < hit && d < bestDist) { bestDist = d; best = p }
      }

      // If no bob nearby, push the nearest pendulum overall
      if (!best) {
        for (const p of pendulumsRef.current) {
          const bobX = p.ax + Math.sin(p.theta) * p.L
          const bobY = p.ay + Math.cos(p.theta) * p.L
          const dx = cx - bobX, dy = cy - bobY
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < bestDist) { bestDist = d; best = p }
        }
      }

      if (best) {
        // Push toward center: add angular velocity opposing current angle
        const sign = best.theta >= 0 ? -1 : 1
        best.omega += sign * 2.2
        // Clamp omega to prevent wild swings
        best.omega = Math.max(-5, Math.min(5, best.omega))
      }
    }

    canvas.addEventListener("pointerdown", onDown, { passive: false })

    // ── render + physics loop ─────────────────────────────────────────────
    let last = performance.now()

    const frame = (ts: number) => {
      const { W: w, H: h } = dimRef.current
      const dt = Math.min((ts - last) / 1000, 0.05)
      last = ts

      // Background
      ctx.fillStyle = "#020208"
      ctx.fillRect(0, 0, w, h)

      // Top anchor bar
      ctx.strokeStyle = "rgba(255,255,255,0.10)"
      ctx.lineWidth   = 2
      ctx.beginPath()
      ctx.moveTo(0, h * 0.07)
      ctx.lineTo(w, h * 0.07)
      ctx.stroke()

      for (const p of pendulumsRef.current) {
        const hue = HUE[p.idx]
        const r   = BOB_R[p.idx]

        // Physics: θ'' = -(G/L)·sin(θ) − damp·θ'
        const accel = -(VISUAL_G / p.L) * Math.sin(p.theta) - 0.12 * p.omega
        p.omega    += accel * dt
        p.theta    += p.omega * dt

        // Hard clamp at ±1.15 rad (≈66°) with bounce
        if (p.theta >  1.15) { p.theta =  1.15; p.omega = -Math.abs(p.omega) * 0.85 }
        if (p.theta < -1.15) { p.theta = -1.15; p.omega =  Math.abs(p.omega) * 0.85 }

        // Zero-crossing detection: pluck when bob passes through center (fast enough)
        const currSign = p.theta >= 0 ? 1 : -1
        if (currSign !== p.prevSign && Math.abs(p.omega) > 0.35 && ts - p.lastPluck > 200) {
          pluckNote(ac, p.idx)
          p.lastPluck = ts
          p.flash     = 1.0
          const bobX = p.ax + Math.sin(p.theta) * p.L
          const bobY = p.ay + Math.cos(p.theta) * p.L
          p.sparks.push(...buildSparks(bobX, bobY, hue))
        }
        p.prevSign = currSign

        // Decay flash
        p.flash = Math.max(0, p.flash - dt * 3)

        // Bob world position
        const bobX = p.ax + Math.sin(p.theta) * p.L
        const bobY = p.ay + Math.cos(p.theta) * p.L

        // Draw string (with glow on pluck)
        ctx.save()
        ctx.strokeStyle = `hsla(${hue},60%,65%,${0.30 + p.flash * 0.55})`
        ctx.lineWidth   = 1.5
        ctx.shadowColor = `hsl(${hue},80%,65%)`
        ctx.shadowBlur  = 4 + p.flash * 14
        ctx.beginPath()
        ctx.moveTo(p.ax, p.ay)
        ctx.lineTo(bobX, bobY)
        ctx.stroke()
        ctx.restore()

        // Small anchor dot
        ctx.save()
        ctx.fillStyle   = `hsla(${hue},55%,60%,0.70)`
        ctx.shadowColor = `hsl(${hue},80%,65%)`
        ctx.shadowBlur  = 5
        ctx.beginPath()
        ctx.arc(p.ax, p.ay, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Bob glow + fill
        ctx.save()
        ctx.shadowColor = `hsl(${hue},85%,65%)`
        ctx.shadowBlur  = 16 + p.flash * 24
        ctx.beginPath()
        ctx.arc(bobX, bobY, r, 0, Math.PI * 2)
        ctx.fillStyle = `hsl(${hue},75%,${52 + p.flash * 18}%)`
        ctx.fill()
        // Inner highlight (3D look)
        ctx.shadowBlur  = 0
        ctx.beginPath()
        ctx.arc(bobX - r * 0.28, bobY - r * 0.28, r * 0.28, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(255,255,255,0.32)"
        ctx.fill()
        ctx.restore()

        // Sparks
        const liveSparks: Spark[] = []
        for (const sp of p.sparks) {
          sp.x    += sp.vx
          sp.y    += sp.vy
          sp.vx   *= 0.94
          sp.vy   *= 0.94
          sp.life -= dt * 2.2
          if (sp.life <= 0) continue
          liveSparks.push(sp)
          ctx.save()
          ctx.globalAlpha = sp.life
          ctx.shadowColor = `hsl(${hue},90%,70%)`
          ctx.shadowBlur  = 5
          ctx.fillStyle   = `hsl(${hue},90%,72%)`
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, sp.r * sp.life, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        p.sparks = liveSparks
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown", onDown)
      padOscs.forEach(o => { try { o.stop() } catch { /* already stopped */ } })
    }
  }, [phase])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    void actxRef.current?.close()
  }, [])

  function handleStart() {
    actxRef.current = new AudioContext()
    setPhase("play")
  }

  if (phase === "start") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#020208] gap-6 px-8">
        <p className="text-sm font-mono text-white/55">For kids 3+</p>
        <h1 className="text-3xl font-serif text-center text-white/95">Pendulum Harp</h1>
        <p className="text-base text-white/75 text-center max-w-xs leading-relaxed">
          Five glowing pendulums, each a different note. They swing on their own
          — tap any pendulum to give it a push and make it sing!
        </p>
        <button
          onClick={handleStart}
          className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-lg font-mono min-h-[56px]
                     hover:bg-violet-500/30 transition-colors"
        >
          ✦ Start!
        </button>
        <p className="text-xs text-white/40 mt-2">
          Zero permissions · Zero API · Zero deps
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#020208]">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
    </div>
  )
}
