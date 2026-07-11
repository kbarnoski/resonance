"use client"
import { useEffect, useRef, useState } from "react"

// C-major pentatonic across 2 octaves
const FREQS = [130.81, 164.81, 196.00, 220.00, 261.63, 329.63, 392.00, 440.00]
const HUES  = [265, 140, 40, 350, 195, 110, 28, 320]
const N_DOTS = 16
const LANTERN_FRAC = 0.30   // radius as fraction of min(W, H)

interface Dot {
  xf: number
  yf: number
  pitchIdx: number
  twinklePhase: number
  glow: number
  gain: GainNode | null
}

export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef   = useRef<AudioContext | null>(null)
  const rafRef    = useRef<number>(0)

  // ── play effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const ac  = actxRef.current!

    // master gain
    const masterGain = ac.createGain()
    masterGain.gain.value = 0.12
    masterGain.connect(ac.destination)

    // ambient pad: C3 + G3
    const padFreqs = [130.81, 196.00]
    const padOscs  = padFreqs.map(f => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = "sine"; o.frequency.value = f; g.gain.value = 0.04
      o.connect(g); g.connect(masterGain); o.start(); return o
    })

    // scatter dots (avoid edges)
    const dots: Dot[] = Array.from({ length: N_DOTS }, (_, i) => ({
      xf:           0.08 + Math.random() * 0.84,
      yf:           0.08 + Math.random() * 0.80,
      pitchIdx:     i % FREQS.length,
      twinklePhase: Math.random() * Math.PI * 2,
      glow:         0,
      gain:         null,
    }))

    // per-dot triangle oscillator
    for (const dot of dots) {
      const o = ac.createOscillator()
      o.type = "triangle"; o.frequency.value = FREQS[dot.pitchIdx]
      const g = ac.createGain(); g.gain.value = 0
      o.connect(g); g.connect(masterGain); o.start()
      dot.gain = g
    }

    // canvas sizing
    let W = 0, H = 0
    const resize = () => {
      const dpr = devicePixelRatio
      W = canvas.offsetWidth
      H = canvas.offsetHeight
      canvas.width  = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener("resize", resize)

    // pointer
    let lpx = -9999, lpy = -9999, held = false
    const getPos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e: PointerEvent) => {
      if (ac.state === "suspended") void ac.resume()
      held = true;  const p = getPos(e); lpx = p.x; lpy = p.y
    }
    const onMove = (e: PointerEvent) => {
      if (!held) return; const p = getPos(e); lpx = p.x; lpy = p.y
    }
    const onUp = () => { held = false }
    canvas.addEventListener("pointerdown", onDown, { passive: true })
    canvas.addEventListener("pointermove", onMove, { passive: true })
    canvas.addEventListener("pointerup",   onUp)
    canvas.addEventListener("pointercancel", onUp)

    let startTs = -1

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame)
      if (startTs < 0) startTs = ts
      const elapsed = (ts - startTs) / 1000

      ctx.fillStyle = "#020208"
      ctx.fillRect(0, 0, W, H)

      const lanternR = Math.min(W, H) * LANTERN_FRAC

      // ── lantern glow ──────────────────────────────────────────────────────
      if (held) {
        // outer warm bloom
        const outer = ctx.createRadialGradient(lpx, lpy, 0, lpx, lpy, lanternR)
        outer.addColorStop(0,   "rgba(255, 210, 90, 0.28)")
        outer.addColorStop(0.4, "rgba(255, 155, 50, 0.10)")
        outer.addColorStop(1,   "rgba(0,0,0,0)")
        ctx.beginPath(); ctx.arc(lpx, lpy, lanternR, 0, Math.PI * 2)
        ctx.fillStyle = outer; ctx.fill()
        // inner hot core
        const inner = ctx.createRadialGradient(lpx, lpy, 0, lpx, lpy, lanternR * 0.17)
        inner.addColorStop(0, "rgba(255, 240, 200, 0.55)")
        inner.addColorStop(1, "rgba(255, 220, 120, 0)")
        ctx.beginPath(); ctx.arc(lpx, lpy, lanternR * 0.17, 0, Math.PI * 2)
        ctx.fillStyle = inner; ctx.fill()
      }

      // ── dots ──────────────────────────────────────────────────────────────
      for (const dot of dots) {
        const nx = dot.xf * W
        const ny = dot.yf * H

        // proximity → glow target (quadratic falloff)
        let target = 0
        if (held) {
          const dist = Math.hypot(nx - lpx, ny - lpy)
          const t = Math.max(0, 1 - dist / lanternR)
          target = t * t
        }
        dot.glow += (target - dot.glow) * 0.07

        // set audio gain
        if (dot.gain) {
          dot.gain.gain.setTargetAtTime(dot.glow * 0.26, ac.currentTime, 0.06)
        }

        // faint ambient twinkle so the canvas isn't all-black before touch
        const tw  = 0.03 + Math.sin(ts * 0.0008 + dot.twinklePhase) * 0.015
        const alpha = Math.max(tw, dot.glow)

        const hue = HUES[dot.pitchIdx]
        const sr  = 5 + dot.glow * 14   // outer star radius (CSS px)
        const ir  = sr * 0.40            // inner radius

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.shadowBlur  = 4 + dot.glow * 30
        ctx.shadowColor = `hsl(${hue}, 85%, 72%)`
        ctx.fillStyle   = `hsl(${hue}, 85%, 72%)`
        // 5-pointed star path
        ctx.beginPath()
        for (let k = 0; k < 10; k++) {
          const r     = k % 2 === 0 ? sr : ir
          const angle = (k * Math.PI / 5) - Math.PI / 2
          if (k === 0) ctx.moveTo(nx + r * Math.cos(angle), ny + r * Math.sin(angle))
          else         ctx.lineTo(nx + r * Math.cos(angle), ny + r * Math.sin(angle))
        }
        ctx.closePath(); ctx.fill()
        ctx.restore()
      }

      // ── hint ──────────────────────────────────────────────────────────────
      if (!held && elapsed > 0.8 && elapsed < 10) {
        const t   = (elapsed - 0.8) / 1.5
        const out = Math.max(0, (10 - elapsed) / 2)
        const op  = Math.min(1, t) * Math.min(1, out) * 0.72
        ctx.save()
        ctx.globalAlpha = op
        ctx.fillStyle   = "white"
        ctx.font        = "18px system-ui, sans-serif"
        ctx.textAlign   = "center"
        ctx.fillText("Hold your finger to light the lantern", W / 2, H * 0.90)
        ctx.restore()
      }
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup",   onUp)
      canvas.removeEventListener("pointercancel", onUp)
      padOscs.forEach(o => { try { o.stop() } catch { /* already stopped */ } })
    }
  }, [phase])

  // ── unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    void actxRef.current?.close()
  }, [])

  function handleStart() {
    actxRef.current = new AudioContext()
    setPhase("play")
  }

  // ── start screen ──────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#020208] gap-6 px-8">
        <p className="text-sm font-mono text-muted-foreground">For kids 3+</p>
        <h1 className="text-3xl font-serif text-center text-foreground">Night Garden</h1>
        <p className="text-base text-muted-foreground text-center max-w-xs leading-relaxed">
          Hidden stars are waiting in the dark — each one holds a note.
          Hold your finger to carry the lantern and wake them up!
        </p>
        <button
          onClick={handleStart}
          className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-lg font-mono min-h-[56px]
                     hover:bg-violet-500/30 transition-colors"
        >
          ✦ Light the Lantern
        </button>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Zero permissions · Zero API · Zero deps
        </p>
      </div>
    )
  }

  // ── play screen ───────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#020208]">
      <canvas ref={canvasRef} className="block w-full h-full touch-none cursor-none" />
    </div>
  )
}
