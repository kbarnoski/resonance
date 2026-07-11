"use client"
import { useEffect, useRef, useState } from "react"

// ── audio ─────────────────────────────────────────────────────────────────────
const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63] // C3 E3 G3 A3 C4

function triggerPop(ac: AudioContext, pitchIdx: number) {
  const hz    = FREQS[pitchIdx]
  const decay = 0.40 + (4 - pitchIdx) * 0.08 // lower pitch = longer ring
  const now   = ac.currentTime
  for (const detune of [0, 7]) {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = "triangle"
    o.frequency.value = hz
    o.detune.value    = detune
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.22, now + 0.016)
    g.gain.exponentialRampToValueAtTime(0.001, now + decay)
    o.connect(g)
    g.connect(ac.destination)
    o.start(now)
    o.stop(now + decay + 0.05)
  }
}

// ── visual config ─────────────────────────────────────────────────────────────
const HUE   = [265, 142, 38, 350, 174]  // violet emerald amber rose cyan
const RADII = [52, 44, 36, 28, 20]      // bigger = lower pitch (BANDIMAL rule)

// ── types ─────────────────────────────────────────────────────────────────────
interface Spark {
  x: number; y: number; vx: number; vy: number; r: number; life: number; hue: number
}

interface Bubble {
  id:        number
  x:         number; y: number
  pitchIdx:  number
  swayFreq:  number; swayPhase: number
  born:      number
  popped:    boolean; popAt: number
  sparks:    Spark[]
}

let uid = 0

function buildBubble(W: number, H: number, spreadY?: number): Bubble {
  const pi = Math.floor(Math.random() * 5)
  const r  = RADII[pi]
  return {
    id:        uid++,
    x:         r + Math.random() * (W - 2 * r),
    y:         spreadY ?? (H + r + Math.random() * 40),
    pitchIdx:  pi,
    swayFreq:  0.0005 + Math.random() * 0.0004,
    swayPhase: Math.random() * Math.PI * 2,
    born:      performance.now(),
    popped:    false,
    popAt:     0,
    sparks:    [],
  }
}

function buildSparks(b: Bubble): Spark[] {
  const h = HUE[b.pitchIdx]
  return Array.from({ length: 18 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4
    const spd   = 2.4 + Math.random() * 3.2
    return {
      x: b.x, y: b.y,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      r: 2.5 + Math.random() * 2,
      life: 1,
      hue: h,
    }
  })
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const actxRef    = useRef<AudioContext | null>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const rafRef     = useRef<number>(0)
  const dimRef     = useRef({ W: 0, H: 0 })
  const gestureSet = useRef<Set<number>>(new Set())

  // ── main render + audio loop ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const ac  = actxRef.current!

    // Ambient pad: C3 + G3 triangle, barely audible
    const padOscs = [130.81, 196.00].map(f => {
      const o = ac.createOscillator(); const g = ac.createGain()
      o.type = "triangle"; o.frequency.value = f; g.gain.value = 0.007
      o.connect(g); g.connect(ac.destination); o.start(); return o
    })

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      dimRef.current = { W, H }
      canvas.width  = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener("resize", resize)

    // Seed 10 bubbles spread across visible area immediately
    const { W, H } = dimRef.current
    bubblesRef.current = []
    for (let i = 0; i < 10; i++) {
      bubblesRef.current.push(buildBubble(W, H, H * 0.08 + Math.random() * H * 0.78))
    }

    // Ongoing spawn: new bubble every 1.2–1.9 s while under the cap
    let spawnTimer: number
    const scheduleSpawn = () => {
      spawnTimer = window.setTimeout(() => {
        const { W: w, H: h } = dimRef.current
        if (bubblesRef.current.filter(b => !b.popped).length < 14) {
          bubblesRef.current.push(buildBubble(w, h))
        }
        scheduleSpawn()
      }, 1200 + Math.random() * 700)
    }
    scheduleSpawn()

    // ── hit test (shared by down + move) ─────────────────────────────────
    const tryPop = (cx: number, cy: number) => {
      for (const b of bubblesRef.current) {
        if (b.popped || gestureSet.current.has(b.id)) continue
        const r  = RADII[b.pitchIdx]
        const dx = b.x - cx, dy = b.y - cy
        if (dx * dx + dy * dy < (r + 10) * (r + 10)) {
          b.popped = true
          b.popAt  = performance.now()
          b.sparks = buildSparks(b)
          gestureSet.current.add(b.id)
          triggerPop(ac, b.pitchIdx)
        }
      }
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      if (ac.state === "suspended") void ac.resume()
      gestureSet.current.clear()
      const rect = canvas.getBoundingClientRect()
      tryPop(e.clientX - rect.left, e.clientY - rect.top)
    }
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0) return
      const rect = canvas.getBoundingClientRect()
      tryPop(e.clientX - rect.left, e.clientY - rect.top)
    }

    canvas.addEventListener("pointerdown", onDown, { passive: false })
    canvas.addEventListener("pointermove", onMove, { passive: true })

    // ── render loop ───────────────────────────────────────────────────────
    let last = performance.now()
    const frame = (ts: number) => {
      const { W: w, H: h } = dimRef.current
      const dt = Math.min((ts - last) / 1000, 0.05)
      last = ts

      // Background gradient
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.78)
      bg.addColorStop(0, "#09091a")
      bg.addColorStop(1, "#020208")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      const dead: number[] = []

      for (let i = 0; i < bubblesRef.current.length; i++) {
        const b   = bubblesRef.current[i]
        const r   = RADII[b.pitchIdx]
        const hue = HUE[b.pitchIdx]

        if (!b.popped) {
          // Float upward + gentle side-to-side sway
          b.y -= 0.52
          b.x += Math.sin(ts * b.swayFreq + b.swayPhase) * 0.22
          b.x  = Math.max(r + 2, Math.min(w - r - 2, b.x))

          if (b.y < -r - 20) { dead.push(i); continue }

          // Fade in on spawn
          const alpha = Math.min((ts - b.born) / 500, 1)
          ctx.save()
          ctx.globalAlpha = alpha

          // Glow halo
          ctx.shadowColor = `hsl(${hue},80%,65%)`
          ctx.shadowBlur  = 24

          // Semi-transparent fill
          ctx.beginPath()
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${hue},70%,50%,0.14)`
          ctx.fill()

          // Coloured rim
          ctx.strokeStyle = `hsl(${hue},85%,68%)`
          ctx.lineWidth   = 2.5
          ctx.stroke()

          // Inner highlight — 3D soap-bubble look
          ctx.shadowBlur  = 0
          ctx.beginPath()
          ctx.arc(b.x - r * 0.28, b.y - r * 0.28, r * 0.22, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(255,255,255,0.26)"
          ctx.fill()

          ctx.restore()

        } else {
          // Expanding ring on pop
          const elapsed = ts - b.popAt
          const t = Math.min(elapsed / 300, 1)
          if (t < 1) {
            ctx.save()
            ctx.globalAlpha = (1 - t) * 0.75
            ctx.beginPath()
            ctx.arc(b.x, b.y, r * (1 + t * 0.7), 0, Math.PI * 2)
            ctx.strokeStyle = `hsl(${hue},85%,68%)`
            ctx.lineWidth   = 2
            ctx.shadowColor = `hsl(${hue},80%,65%)`
            ctx.shadowBlur  = 14
            ctx.stroke()
            ctx.restore()
          }

          // Sparkles
          let anyLive = false
          for (const sp of b.sparks) {
            sp.x += sp.vx; sp.y += sp.vy
            sp.vx *= 0.93;  sp.vy *= 0.93
            sp.life -= dt * 1.5
            if (sp.life <= 0) continue
            anyLive = true
            ctx.save()
            ctx.globalAlpha = sp.life
            ctx.shadowColor = `hsl(${sp.hue},90%,70%)`
            ctx.shadowBlur  = 5
            ctx.fillStyle   = `hsl(${sp.hue},90%,72%)`
            ctx.beginPath()
            ctx.arc(sp.x, sp.y, sp.r * sp.life, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }

          if (!anyLive && t >= 1) dead.push(i)
        }
      }

      // Remove dead entries back-to-front to preserve indices
      for (let i = dead.length - 1; i >= 0; i--) bubblesRef.current.splice(dead[i], 1)

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(spawnTimer)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      padOscs.forEach(o => { try { o.stop() } catch { /* already stopped */ } })
    }
  }, [phase])

  // Cleanup AudioContext on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    void actxRef.current?.close()
  }, [])

  function handleStart() {
    actxRef.current = new AudioContext()
    bubblesRef.current = []
    setPhase("play")
  }

  if (phase === "start") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#020208] gap-6 px-8">
        <p className="text-sm font-mono text-muted-foreground">For kids 3+</p>
        <h1 className="text-3xl font-semibold text-center text-foreground">Bubble Pop</h1>
        <p className="text-base text-muted-foreground text-center max-w-xs leading-relaxed">
          Colorful bubbles float up — tap or drag to pop them! Each bubble
          plays its own note. Bigger bubbles sing lower.
        </p>
        <button
          onClick={handleStart}
          className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-lg font-mono min-h-[56px]
                     hover:bg-violet-500/30 transition-colors"
        >
          ✦ Start!
        </button>
        <p className="text-xs text-muted-foreground/70 mt-2">
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
