"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// ── Cloud-to-pitch mappings ───────────────────────────────────────────────────
const CLOUDS = [
  { color: "#a78bfa", glow: "#7c3aed", freq: 130.81 }, // violet C3
  { color: "#fbbf24", glow: "#d97706", freq: 196.00 }, // amber  G3
  { color: "#fb7185", glow: "#e11d48", freq: 261.63 }, // rose   C4
] as const

const GRAVITY   = 280   // px/s²
const DRIFT_AMP = 12    // px horizontal peak
const DROP_R    = 7     // drop radius CSS px
const FLOOR_Y   = 0.82  // fraction of canvas height

// background stars (stable, golden-ratio spacing)
const STARS = Array.from({ length: 28 }, (_, i) => ({
  nx: (i * 0.618034) % 1,
  ny: ((i * 0.381966) % 1) * 0.75,
  ph: i * 1.07,
}))

interface Drop {
  id: number; ci: number
  x: number; y: number; vy: number; driftPhase: number
}

interface Ripple {
  x: number; y: number; ci: number; r: number; maxR: number; t: number
}

let uid = 0
function mkDrop(ci: number, cx: number, cy: number): Drop {
  return {
    id: uid++, ci,
    x: cx + (Math.random() - 0.5) * 38,
    y: cy + 22,
    vy: 28 + Math.random() * 55,
    driftPhase: Math.random() * Math.PI * 2,
  }
}

function ringNote(ac: AudioContext, freq: number) {
  const t = ac.currentTime
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = "triangle"
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.30, t + 0.008)
  g.gain.setTargetAtTime(0, t + 0.008, 0.46)
  o.connect(g); g.connect(ac.destination)
  o.start(t); o.stop(t + 2.2)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef   = useRef<AudioContext | null>(null)

  function handleStart() {
    actxRef.current = new AudioContext()
    setPhase("play")
  }

  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d")!
    const ac     = actxRef.current!

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    const cPos: { x: number; y: number; r: number }[] = [
      { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 },
    ]

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.scale(dpr, dpr)
      const cY = H * 0.18
      const cR = Math.max(40, Math.min(W * 0.11, 64))
      const gap = W / 4
      for (let i = 0; i < 3; i++) cPos[i] = { x: gap * (i + 1), y: cY, r: cR }
    }
    resize()
    window.addEventListener("resize", resize)

    // ambient pad: C3 + G3
    {
      const t = ac.currentTime
      for (const [f, gv] of [[130.81, 0.020], [196.00, 0.015]] as [number, number][]) {
        const o = ac.createOscillator(); const g = ac.createGain()
        o.type = "sine"; o.frequency.value = f
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gv, t + 2.5)
        o.connect(g); g.connect(ac.destination); o.start(t)
      }
    }

    const drops: Drop[]   = []
    const ripples: Ripple[] = []
    const cloudFlash       = [0, 0, 0]
    const heldPointers     = new Map<number, number>()          // pointerId → cloudIdx
    const holdIntervals    = new Map<number, ReturnType<typeof setInterval>>()

    // auto-rain: cycle through the three clouds, one drop per second each
    let autoIdx = 0
    const autoTimer = setInterval(() => {
      const ci = autoIdx % 3
      autoIdx++
      drops.push(mkDrop(ci, cPos[ci].x, cPos[ci].y))
      cloudFlash[ci] = Math.max(cloudFlash[ci], 0.35)
    }, 1000)

    function nearestCloud(px: number, py: number): number {
      for (let i = 0; i < 3; i++) {
        const { x, y, r } = cPos[i]
        if (Math.hypot(px - x, py - y) < r + 20) return i
      }
      return -1
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const rect = canvas.getBoundingClientRect()
      const ci   = nearestCloud(e.clientX - rect.left, e.clientY - rect.top)
      if (ci < 0) return
      heldPointers.set(e.pointerId, ci)
      cloudFlash[ci] = 1.0
      // burst
      const n = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) drops.push(mkDrop(ci, cPos[ci].x, cPos[ci].y))
      // hold: continuous rain
      const iv = setInterval(() => {
        drops.push(mkDrop(ci, cPos[ci].x, cPos[ci].y))
        cloudFlash[ci] = Math.max(cloudFlash[ci], 0.55)
      }, 200)
      holdIntervals.set(e.pointerId, iv)
    }

    const onUp = (e: PointerEvent) => {
      const iv = holdIntervals.get(e.pointerId)
      if (iv !== undefined) { clearInterval(iv); holdIntervals.delete(e.pointerId) }
      heldPointers.delete(e.pointerId)
    }

    canvas.addEventListener("pointerdown",   onDown)
    canvas.addEventListener("pointerup",     onUp)
    canvas.addEventListener("pointercancel", onUp)

    let prevTs = 0, raf = 0

    function frame(ts: number) {
      const dt = Math.min((ts - prevTs) / 1000, 0.05)
      prevTs = ts

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#070714"; ctx.fillRect(0, 0, W, H)

      // stars
      for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(ts * 0.0008 + s.ph)
        ctx.globalAlpha = 0.10 + 0.08 * tw
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(s.nx * W - 0.8, s.ny * H - 0.8, 1.6, 1.6)
      }
      ctx.globalAlpha = 1

      // floor / water strip
      const fY = H * FLOOR_Y
      const wg = ctx.createLinearGradient(0, fY, 0, H)
      wg.addColorStop(0, "rgba(60,100,180,0.18)")
      wg.addColorStop(1, "rgba(20,50,120,0.06)")
      ctx.fillStyle = wg; ctx.fillRect(0, fY, W, H - fY)
      ctx.strokeStyle = "rgba(140,190,255,0.24)"; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, fY); ctx.lineTo(W, fY); ctx.stroke()

      // drops (reverse iterate so splice is safe)
      for (let di = drops.length - 1; di >= 0; di--) {
        const d = drops[di]
        d.vy += GRAVITY * dt
        d.y  += d.vy * dt
        d.driftPhase += 1.1 * Math.PI * 2 * dt
        d.x += Math.sin(d.driftPhase) * DRIFT_AMP * dt

        if (d.y + DROP_R >= fY) {
          ringNote(ac, CLOUDS[d.ci].freq)
          ripples.push({ x: d.x, y: fY, ci: d.ci, r: 5, maxR: 32 + Math.random() * 20, t: 0 })
          drops.splice(di, 1)
          continue
        }

        const col  = CLOUDS[d.ci].color
        const glow = CLOUDS[d.ci].glow
        ctx.save()
        ctx.shadowBlur = 10; ctx.shadowColor = glow
        ctx.fillStyle  = col; ctx.globalAlpha = 0.9
        // teardrop: circle + upward tail
        ctx.beginPath(); ctx.arc(d.x, d.y, DROP_R, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath()
        ctx.moveTo(d.x - DROP_R * 0.38, d.y - 1)
        ctx.lineTo(d.x + DROP_R * 0.38, d.y - 1)
        ctx.lineTo(d.x, d.y - DROP_R * 1.55)
        ctx.closePath(); ctx.fill()
        ctx.restore()
      }

      // ripples
      for (let ri = ripples.length - 1; ri >= 0; ri--) {
        const rp = ripples[ri]
        rp.t += dt / 0.72
        if (rp.t >= 1) { ripples.splice(ri, 1); continue }
        rp.r = 5 + (rp.maxR - 5) * rp.t
        ctx.save()
        ctx.globalAlpha  = (1 - rp.t) * 0.62
        ctx.strokeStyle  = CLOUDS[rp.ci].color
        ctx.lineWidth    = 1.8
        ctx.shadowBlur   = 6; ctx.shadowColor = CLOUDS[rp.ci].glow
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }

      // clouds
      for (let i = 0; i < 3; i++) {
        const { x, y, r } = cPos[i]
        const fl = cloudFlash[i]
        cloudFlash[i] = Math.max(0, fl - dt * 2.5)

        ctx.save()
        ctx.shadowBlur = 18 + fl * 28; ctx.shadowColor = CLOUDS[i].glow
        ctx.globalAlpha = 0.80 + fl * 0.20
        ctx.fillStyle   = CLOUDS[i].color
        // three-circle cloud shape
        ctx.beginPath(); ctx.arc(x,             y,             r * 0.58, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x - r * 0.40,  y + r * 0.12, r * 0.42, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + r * 0.40,  y + r * 0.12, r * 0.42, 0, Math.PI * 2); ctx.fill()
        ctx.fillRect(x - r * 0.64, y + r * 0.02, r * 1.28, r * 0.38)
        ctx.restore()
      }

      // hint (fades over the first 8s if no interaction)
      if (drops.length <= 1 && heldPointers.size === 0 && ts < 8000) {
        ctx.save()
        ctx.globalAlpha = Math.max(0, 0.5 * (1 - ts / 8000))
        ctx.fillStyle   = "#c4b5fd"
        ctx.font        = "bold 16px sans-serif"; ctx.textAlign = "center"
        ctx.fillText("Tap a cloud ☁️", W / 2, H * 0.50)
        ctx.restore()
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame((ts) => { prevTs = ts; frame(ts) })

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(autoTimer)
      holdIntervals.forEach(iv => clearInterval(iv))
      canvas.removeEventListener("pointerdown",   onDown)
      canvas.removeEventListener("pointerup",     onUp)
      canvas.removeEventListener("pointercancel", onUp)
      window.removeEventListener("resize", resize)
      if (actxRef.current) { actxRef.current.close(); actxRef.current = null }
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#070714] flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">Raindrop Rhythm ☁️</h1>
          <p className="text-white/75 text-base max-w-xs">
            Tap a cloud to make it rain music.
            Each drop plays its note when it lands.
          </p>
        </div>
        <button
          onClick={handleStart}
          className="bg-violet-700 hover:bg-violet-600 text-white text-xl font-semibold
                     px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
        >
          ▶ Start
        </button>
        <p className="text-white/55 text-sm">For kids 3+ · No permissions needed</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#070714]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between
                      px-4 pt-3 pb-2 pointer-events-none select-none">
        <span className="text-white/75 text-base font-semibold">Raindrop Rhythm ☁️</span>
        <Link href="/dream"
          className="text-white/55 text-sm pointer-events-auto hover:text-white/80">
          ← dream
        </Link>
      </div>
      <div className="absolute bottom-5 right-4 pointer-events-auto">
        <Link href="/dream/174-kids-raindrop-rhythm/readme"
          className="text-white/35 text-xs hover:text-white/60">notes</Link>
      </div>
    </div>
  )
}
