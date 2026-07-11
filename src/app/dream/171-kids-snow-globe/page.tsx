"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// ── C-major pentatonic: top of screen = C4 (high), bottom = C3 (low) ─────────
const PITCHES = [261.63, 220.00, 196.00, 164.81, 130.81] // C4, A3, G3, E3, C3
const COLORS  = ["#f43f5e", "#fbbf24", "#34d399", "#22d3ee", "#a78bfa"]

// ── bell chime synthesis ──────────────────────────────────────────────────────
function playBell(ac: AudioContext, hz: number) {
  const now = ac.currentTime
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = "triangle"
  osc.frequency.value = hz
  gain.gain.setValueAtTime(0.36, now)
  gain.gain.setTargetAtTime(0, now, 0.45)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(now)
  osc.stop(now + 2.2)
}

// ── snowflake shape (3 crossing lines = 6 arms) ───────────────────────────────
function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, color: string, opacity: number
) {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineWidth   = 1.6
  ctx.lineCap     = "round"
  ctx.shadowBlur  = 10
  ctx.shadowColor = color
  for (let a = 0; a < 3; a++) {
    const ang = (a * Math.PI) / 3
    ctx.beginPath()
    ctx.moveTo(-size * Math.cos(ang), -size * Math.sin(ang))
    ctx.lineTo( size * Math.cos(ang),  size * Math.sin(ang))
    ctx.stroke()
  }
  // center bright dot
  ctx.fillStyle  = color
  ctx.shadowBlur = 14
  ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Flake {
  id: number; x: number; y: number; vx: number; vy: number
  phase: number; wobbleAmp: number; wobbleFreq: number; pitchIdx: number
}
interface Spark {
  x: number; y: number; vx: number; vy: number; life: number; color: string
}

// ── constants ─────────────────────────────────────────────────────────────────
const GRAVITY     = 0.16
const GROUND_FRAC = 0.88
const MAX_FLAKES  = 80
const HOLD_MS     = 120

// ── stable star positions (golden-ratio distribution, normalized) ─────────────
const STARS = Array.from({ length: 60 }, (_, i) => ({
  x:  Math.sin(i * 1.618034) * 0.5 + 0.5,
  y: (Math.sin(i * 2.718282) * 0.5 + 0.5) * 0.84,
  ph: i * 0.79,
}))

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef   = useRef<AudioContext | null>(null)
  const flakesRef = useRef<Flake[]>([])
  const sparksRef = useRef<Spark[]>([])
  const dimRef    = useRef({ W: 0, H: 0 })
  const nextId    = useRef(0)
  const heldRef   = useRef(new Map<number, { x: number; y: number; lastMs: number }>())
  const demoRef   = useRef({ active: false, endMs: 0, lastMs: 0 })

  // ── emit snowflakes from (x, y) — pitch determined by tap Y position ─────────
  function emitFlakes(x: number, y: number, count: number) {
    const { H } = dimRef.current
    const pIdx  = Math.min(4, Math.floor((y / H) * 5))
    for (let i = 0; i < count; i++) {
      flakesRef.current.push({
        id:        nextId.current++,
        x:         x + (Math.random() - 0.5) * 26,
        y:         y - Math.random() * 10,
        vx:        (Math.random() - 0.5) * 0.9,
        vy:        -0.15 + Math.random() * 0.35,
        phase:     Math.random() * Math.PI * 2,
        wobbleAmp: 9 + Math.random() * 8,
        wobbleFreq: 0.038 + Math.random() * 0.024,
        pitchIdx:  pIdx,
      })
    }
    if (flakesRef.current.length > MAX_FLAKES) {
      flakesRef.current = flakesRef.current.slice(-MAX_FLAKES)
    }
  }

  // ── start: create AudioContext + ambient pad + demo ───────────────────────────
  function handleStart() {
    const ac = new AudioContext()
    actxRef.current = ac
    // soft ambient pad: C3 + E3 + G3 (barely audible — "living room" warmth)
    for (const [hz, vol] of [[130.81, 0.0042], [164.81, 0.0028], [196.00, 0.0034]]) {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = "triangle"; o.frequency.value = hz; g.gain.value = vol
      o.connect(g); g.connect(ac.destination); o.start()
    }
    // kick off demo mode — timing is set in first RAF frame
    demoRef.current = { active: true, endMs: 0, lastMs: 0 }
    setPhase("play")
  }

  // ── canvas effect: resize + pointer input + RAF loop ─────────────────────────
  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

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

    // pointer helpers
    const getXY = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const { x, y } = getXY(e)
      // burst of 5–8 flakes on tap
      emitFlakes(x, y, 5 + Math.floor(Math.random() * 4))
      heldRef.current.set(e.pointerId, { x, y, lastMs: performance.now() })
    }
    const onMove = (e: PointerEvent) => {
      const h = heldRef.current.get(e.pointerId)
      if (!h) return
      const { x, y } = getXY(e)
      h.x = x; h.y = y
    }
    const onUp   = (e: PointerEvent) => { heldRef.current.delete(e.pointerId) }

    canvas.addEventListener("pointerdown",   onDown)
    canvas.addEventListener("pointermove",   onMove)
    canvas.addEventListener("pointerup",     onUp)
    canvas.addEventListener("pointercancel", onUp)

    // ── RAF loop ─────────────────────────────────────────────────────────────
    let raf = 0, running = true

    const frame = (ts: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      const nowMs   = performance.now()
      const { W, H } = dimRef.current
      const groundY = H * GROUND_FRAC
      const ac      = actxRef.current

      // demo: auto-fall from mid-height for 3.5 s
      const demo = demoRef.current
      if (demo.active) {
        if (demo.endMs === 0) { demo.endMs = nowMs + 3500; demo.lastMs = 0 }
        if (nowMs < demo.endMs && nowMs - demo.lastMs >= 190) {
          demo.lastMs = nowMs
          emitFlakes(W * 0.5, H * 0.40, 1)
        }
        if (nowMs >= demo.endMs) demo.active = false
      }

      // held-finger: continuous snowfall one flake per HOLD_MS
      for (const h of heldRef.current.values()) {
        if (nowMs - h.lastMs >= HOLD_MS) {
          h.lastMs = nowMs
          emitFlakes(h.x, h.y, 1)
        }
      }

      // ── physics ────────────────────────────────────────────────────────────
      const alive: Flake[] = []
      for (const f of flakesRef.current) {
        f.vy += GRAVITY
        // sinusoidal horizontal wobble: dx = A * ω * cos(phase), phase += ω
        f.x  += f.vx + f.wobbleAmp * f.wobbleFreq * Math.cos(f.phase)
        f.y  += f.vy
        f.phase += f.wobbleFreq

        if (f.y >= groundY) {
          // ── land: bell chime + sparkle burst ─────────────────────────────
          if (ac) {
            if (ac.state === "suspended") void ac.resume()
            playBell(ac, PITCHES[f.pitchIdx])
          }
          const col = COLORS[f.pitchIdx]
          for (let i = 0; i < 9; i++) {
            const ang = (i / 9) * Math.PI * 2
            sparksRef.current.push({
              x: f.x, y: groundY,
              vx: Math.cos(ang) * (1.0 + Math.random() * 2.0),
              vy: Math.sin(ang) * (1.0 + Math.random() * 1.5) - 2.4,
              life: 1.0, color: col,
            })
          }
          continue // flake is gone
        }
        // keep if still on screen (allow ±80px horizontal bleed)
        if (f.x > -80 && f.x < W + 80) alive.push(f)
      }
      flakesRef.current = alive

      // ── sparkle decay ──────────────────────────────────────────────────────
      const aliveS: Spark[] = []
      for (const s of sparksRef.current) {
        s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.life -= 0.055
        if (s.life > 0) aliveS.push(s)
      }
      sparksRef.current = aliveS

      // ── draw ───────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)

      // background: deep navy gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
      bgGrad.addColorStop(0, "#07071a")
      bgGrad.addColorStop(1, "#0d0d26")
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // twinkling stars
      for (const st of STARS) {
        const tw = 0.09 + 0.06 * Math.sin(ts * 0.0006 + st.ph)
        ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`
        ctx.beginPath(); ctx.arc(st.x * W, st.y * H, 0.8, 0, Math.PI * 2); ctx.fill()
      }

      // ground snow glow
      const snowGrad = ctx.createLinearGradient(0, groundY - 8, 0, H)
      snowGrad.addColorStop(0, "rgba(180,210,255,0.00)")
      snowGrad.addColorStop(0.4, "rgba(180,210,255,0.04)")
      snowGrad.addColorStop(1,   "rgba(180,210,255,0.12)")
      ctx.fillStyle = snowGrad
      ctx.fillRect(0, groundY - 8, W, H - groundY + 8)

      // snowflakes
      for (const f of flakesRef.current) {
        drawSnowflake(ctx, f.x, f.y, 7, COLORS[f.pitchIdx], 1)
      }

      // sparkles
      for (const s of sparksRef.current) {
        ctx.save()
        ctx.globalAlpha  = Math.max(0, s.life * 0.9)
        ctx.shadowBlur   = 5
        ctx.shadowColor  = s.color
        ctx.fillStyle    = s.color
        ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown",   onDown)
      canvas.removeEventListener("pointermove",   onMove)
      canvas.removeEventListener("pointerup",     onUp)
      canvas.removeEventListener("pointercancel", onUp)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── start screen ─────────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#07071a] flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Snow Globe ❄️</h1>
          <p className="text-muted-foreground text-base max-w-xs">
            Tap anywhere — snowflakes fall and ring a note when they land.
            Tap high for high notes, low for low notes.
          </p>
        </div>
        <button
          onClick={handleStart}
          className="bg-violet-500 hover:bg-violet-400 text-foreground text-xl font-semibold
                     px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
        >
          ▶ Start
        </button>
        <p className="text-muted-foreground text-sm">For kids 3+ · No permissions needed</p>
      </div>
    )
  }

  // ── play screen ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#07071a]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between
                      px-4 pt-3 pb-2 pointer-events-none select-none">
        <span className="text-muted-foreground text-base font-semibold">Snow Globe ❄️</span>
        <Link href="/dream"
          className="text-muted-foreground text-sm pointer-events-auto hover:text-foreground">
          ← dream
        </Link>
      </div>

      {/* hint */}
      <div className="absolute top-14 left-0 right-0 text-center pointer-events-none select-none">
        <span className="text-muted-foreground/70 text-sm">Tap · hold for blizzard</span>
      </div>

      {/* design notes */}
      <div className="absolute bottom-5 right-4 pointer-events-auto">
        <Link href="/dream/171-kids-snow-globe/readme"
          className="text-muted-foreground/70 text-xs hover:text-muted-foreground">notes</Link>
      </div>
    </div>
  )
}
