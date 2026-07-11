"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// ── audio: 6-note C-major pentatonic, Karplus-Strong pluck ───────────────────
const FREQS = [329.63, 261.63, 220.00, 196.00, 164.81, 130.81] // E4→C3 (top→bottom)
const COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#818cf8", "#a78bfa"]

function buildKS(ac: AudioContext, hz: number, dur = 2.2): AudioBuffer {
  const sr = ac.sampleRate
  const P  = Math.round(sr / hz)
  const N  = Math.round(sr * dur)
  const ab = ac.createBuffer(1, N, sr)
  const d  = ab.getChannelData(0)
  const dl = new Float32Array(P)
  for (let i = 0; i < P; i++) dl[i] = Math.random() * 2 - 1
  for (let i = 0; i < N; i++) {
    d[i] = dl[i % P]
    dl[i % P] = (dl[i % P] + dl[(i + 1) % P]) * 0.4985
  }
  return ab
}

function playKS(ac: AudioContext, buf: AudioBuffer, vol = 0.65) {
  const src = ac.createBufferSource()
  src.buffer = buf
  const g = ac.createGain()
  g.gain.value = vol
  src.connect(g); g.connect(ac.destination)
  src.start()
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Ramp {
  id: number; x1: number; y1: number; x2: number; y2: number
  pitchIdx: number; flash: number; lastNote: number
}
interface Marble {
  id: number; x: number; y: number; vx: number; vy: number
  colorIdx: number; trail: Array<{ x: number; y: number }>
}
interface DrawState { active: boolean; x1: number; y1: number; cx: number; cy: number }

// ── constants ─────────────────────────────────────────────────────────────────
const G = 0.22           // gravity px/frame
const RESTITUTION = 0.68 // energy kept after ramp bounce
const FRICTION    = 0.92 // tangential energy kept after bounce
const R = 9              // marble radius px
const TRAIL = 16         // trail length
const MAX_M = 6          // max marbles
const MAX_R = 10         // max ramps
const AUTO_MS = 4200     // auto-launch interval ms
const NOTE_GUARD = 200   // ms between repeated notes on same ramp

// ── pitch index from Y position (top of canvas = high pitch) ─────────────────
function pitchIdx(midY: number, H: number): number {
  return Math.min(5, Math.floor((midY / H) * 6))
}

// ── ramp-marble collision (reflect off line segment, return true if bounced) ──
function collideRamp(m: Marble, ramp: Ramp, ts: number): boolean {
  if (ts - ramp.lastNote < NOTE_GUARD) return false
  const dx = ramp.x2 - ramp.x1, dy = ramp.y2 - ramp.y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return false
  const len = Math.sqrt(len2)
  // outward normal (pointing "up" in canvas coords — negative y direction)
  let nx = -dy / len, ny = dx / len
  if (ny > 0) { nx = -nx; ny = -ny }
  // closest point on segment to marble
  const t = Math.max(0, Math.min(1, ((m.x - ramp.x1) * dx + (m.y - ramp.y1) * dy) / len2))
  const cx = ramp.x1 + t * dx, cy = ramp.y1 + t * dy
  const px = m.x - cx, py = m.y - cy
  const dist = Math.sqrt(px * px + py * py)
  if (dist > R + 3) return false
  const approach = m.vx * nx + m.vy * ny
  if (approach >= 0) return false // moving away already
  // tangential components
  const tvx = m.vx - approach * nx
  const tvy = m.vy - approach * ny
  // reflect: tangent kept (with friction), normal flipped (with restitution)
  m.vx = tvx * FRICTION + (-approach * RESTITUTION) * nx
  m.vy = tvy * FRICTION + (-approach * RESTITUTION) * ny
  // push out of ramp
  const overlap = R + 3 - dist
  m.x += nx * overlap; m.y += ny * overlap
  return true
}

// ── build 3 demo ramps ────────────────────────────────────────────────────────
function demoRamps(W: number, H: number): Ramp[] {
  const specs = [
    { x1: W*0.08, y1: H*0.22, x2: W*0.42, y2: H*0.34 },
    { x1: W*0.38, y1: H*0.46, x2: W*0.72, y2: H*0.58 },
    { x1: W*0.58, y1: H*0.65, x2: W*0.92, y2: H*0.76 },
  ]
  return specs.map((s, i) => ({
    id: i, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
    pitchIdx: pitchIdx((s.y1 + s.y2) / 2, H),
    flash: 0, lastNote: 0,
  }))
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const actxRef    = useRef<AudioContext | null>(null)
  const ksBufs     = useRef<AudioBuffer[]>([])
  const rampsRef   = useRef<Ramp[]>([])
  const marblesRef = useRef<Marble[]>([])
  const drawRef    = useRef<DrawState>({ active: false, x1: 0, y1: 0, cx: 0, cy: 0 })
  const dimRef     = useRef({ W: 0, H: 0 })
  const nextId     = useRef(100) // start after demo ramp IDs
  const lastAuto   = useRef(0)
  const colorCycle = useRef(0)

  // ── launch one marble ────────────────────────────────────────────────────────
  function spawnMarble() {
    const { W } = dimRef.current
    if (!W || marblesRef.current.length >= MAX_M) return
    const ci = colorCycle.current % COLORS.length
    colorCycle.current++
    marblesRef.current.push({
      id: nextId.current++,
      x: W * (0.08 + Math.random() * 0.84),
      y: -R - 4,
      vx: (Math.random() - 0.5) * 1.8,
      vy: 0.5,
      colorIdx: ci,
      trail: [],
    })
  }

  // ── start handler ────────────────────────────────────────────────────────────
  function handleStart() {
    const ac = new AudioContext()
    actxRef.current = ac
    ksBufs.current = FREQS.map(f => buildKS(ac, f))
    // soft ambient pad: C3 + G3
    for (const hz of [130.81, 196.00]) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = "sine"; o.frequency.value = hz; g.gain.value = 0.005
      o.connect(g); g.connect(ac.destination); o.start()
    }
    setPhase("play")
    setTimeout(spawnMarble, 300)
  }

  // ── drop marble button ───────────────────────────────────────────────────────
  function handleDrop() {
    const ac = actxRef.current
    if (ac?.state === "suspended") void ac.resume()
    spawnMarble()
  }

  // ── clear button ─────────────────────────────────────────────────────────────
  function handleClear() {
    const { W, H } = dimRef.current
    marblesRef.current = []
    rampsRef.current = demoRamps(W, H)
    nextId.current = 100
    colorCycle.current = 0
    lastAuto.current = 0
  }

  // ── canvas effect: resize + ramp init + pointer draw + RAF ──────────────────
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
      if (rampsRef.current.length === 0) rampsRef.current = demoRamps(W, H)
    }
    resize()
    window.addEventListener("resize", resize)

    // ── pointer events for drawing ramps ─────────────────────────────────────
    const getXY = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const { x, y } = getXY(e)
      drawRef.current = { active: true, x1: x, y1: y, cx: x, cy: y }
    }
    const onMove = (e: PointerEvent) => {
      if (!drawRef.current.active) return
      const { x, y } = getXY(e)
      drawRef.current.cx = x; drawRef.current.cy = y
    }
    const onUp = () => {
      const dr = drawRef.current
      if (!dr.active) return
      dr.active = false
      const dx = dr.cx - dr.x1, dy = dr.cy - dr.y1
      if (Math.sqrt(dx*dx + dy*dy) > 30 && rampsRef.current.length < MAX_R) {
        const { H } = dimRef.current
        const midY = (dr.y1 + dr.cy) / 2
        rampsRef.current.push({
          id: nextId.current++,
          x1: dr.x1, y1: dr.y1, x2: dr.cx, y2: dr.cy,
          pitchIdx: pitchIdx(midY, H),
          flash: 0, lastNote: 0,
        })
      }
    }
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup",   onUp)
    canvas.addEventListener("pointercancel", onUp)

    // ── render loop ───────────────────────────────────────────────────────────
    let raf = 0, running = true

    const frame = (ts: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)

      const { W, H } = dimRef.current
      const ac = actxRef.current

      // auto-launch
      if (ts - lastAuto.current > AUTO_MS) {
        lastAuto.current = ts
        spawnMarble()
      }

      // physics
      const ramps = rampsRef.current
      const marbles = marblesRef.current
      for (const m of marbles) {
        m.vy += G
        m.x  += m.vx
        m.y  += m.vy
        m.trail.push({ x: m.x, y: m.y })
        if (m.trail.length > TRAIL) m.trail.shift()
        // wall bounce
        if (m.x - R < 0)  { m.x = R;     m.vx =  Math.abs(m.vx) * 0.6 }
        if (m.x + R > W)  { m.x = W - R; m.vx = -Math.abs(m.vx) * 0.6 }
        // ramp collisions
        for (const rp of ramps) {
          if (collideRamp(m, rp, ts)) {
            rp.flash = 1.0; rp.lastNote = ts
            if (ac && ksBufs.current[rp.pitchIdx]) {
              if (ac.state === "suspended") void ac.resume()
              playKS(ac, ksBufs.current[rp.pitchIdx], 0.60)
            }
            // spark on marble
            m.vy -= 0.5 // slight upward kick for liveliness
          }
        }
      }
      // decay flashes
      for (const rp of ramps) rp.flash = Math.max(0, rp.flash - 0.035)
      // remove fallen marbles
      marblesRef.current = marbles.filter(m => m.y - R < H + 40)

      // ── draw ────────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#05050f"
      ctx.fillRect(0, 0, W, H)

      // starfield
      ctx.fillStyle = "rgba(255,255,255,0.18)"
      for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 1.618) * 0.5 + 0.5) * W
        const sy = (Math.sin(i * 2.718) * 0.5 + 0.5) * H * 0.85
        ctx.beginPath(); ctx.arc(sx, sy, 0.9, 0, Math.PI * 2); ctx.fill()
      }

      // draw ramps
      for (const rp of ramps) {
        const col = COLORS[rp.pitchIdx]
        const glow = 6 + rp.flash * 18
        ctx.save()
        ctx.shadowColor = col; ctx.shadowBlur = glow
        const alpha = Math.round((0.60 + rp.flash * 0.40) * 255).toString(16).padStart(2, "0")
        ctx.strokeStyle = col + alpha
        ctx.lineWidth   = 5 + rp.flash * 3
        ctx.lineCap = "round"
        ctx.beginPath(); ctx.moveTo(rp.x1, rp.y1); ctx.lineTo(rp.x2, rp.y2); ctx.stroke()
        ctx.restore()
      }

      // draw ramp preview (while user is dragging)
      const dr = drawRef.current
      if (dr.active) {
        const { H: H2 } = dimRef.current
        const midY = (dr.y1 + dr.cy) / 2
        const pi = pitchIdx(midY, H2)
        const col = COLORS[pi]
        ctx.save()
        ctx.shadowColor = col; ctx.shadowBlur = 8
        ctx.strokeStyle = col + "66"
        ctx.lineWidth = 4; ctx.lineCap = "round"
        ctx.setLineDash([10, 7])
        ctx.beginPath(); ctx.moveTo(dr.x1, dr.y1); ctx.lineTo(dr.cx, dr.cy); ctx.stroke()
        ctx.restore()
      }

      // draw marbles
      for (const m of marblesRef.current) {
        const col = COLORS[m.colorIdx % COLORS.length]
        // trail
        for (let i = 0; i < m.trail.length - 1; i++) {
          const a = (i / m.trail.length) * 0.55
          ctx.beginPath()
          ctx.arc(m.trail[i].x, m.trail[i].y, R * 0.45 * (i / m.trail.length), 0, Math.PI * 2)
          ctx.fillStyle = col + Math.round(a * 255).toString(16).padStart(2, "0")
          ctx.fill()
        }
        // marble body
        ctx.save()
        ctx.shadowColor = col; ctx.shadowBlur = 14
        ctx.fillStyle = col
        ctx.beginPath(); ctx.arc(m.x, m.y, R, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = "rgba(255,255,255,0.35)"
        ctx.beginPath(); ctx.arc(m.x - R * 0.3, m.y - R * 0.3, R * 0.38, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup",   onUp)
      canvas.removeEventListener("pointercancel", onUp)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── start screen ─────────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#05050f] flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Marble Music 🎵</h1>
          <p className="text-muted-foreground text-base max-w-xs">
            Draw ramps — drop marbles — hear the notes bounce!
          </p>
        </div>
        <button
          onClick={handleStart}
          className="bg-violet-500 hover:bg-violet-400 text-foreground text-xl font-semibold
                     px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
        >
          ▶ Start
        </button>
        <p className="text-muted-foreground text-sm">For kids 4+ · Zero permissions needed</p>
      </div>
    )
  }

  // ── play screen ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#05050f]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-2
                      pointer-events-none select-none">
        <span className="text-muted-foreground text-base font-semibold">Marble Music 🎵</span>
        <Link href="/dream" className="text-muted-foreground text-sm pointer-events-auto hover:text-foreground">
          ← dream
        </Link>
      </div>

      {/* hint */}
      <div className="absolute top-14 left-0 right-0 text-center pointer-events-none select-none">
        <span className="text-muted-foreground/70 text-sm">Draw a ramp · Marbles bounce the notes</span>
      </div>

      {/* controls */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 px-6">
        <button
          onClick={handleDrop}
          className="bg-violet-600/80 hover:bg-violet-500 backdrop-blur text-foreground text-lg font-semibold
                     px-6 py-3 rounded-2xl min-h-[56px] min-w-[140px] transition-colors"
        >
          Drop 🎵
        </button>
        <button
          onClick={handleClear}
          className="bg-muted hover:bg-accent backdrop-blur text-foreground text-base font-medium
                     px-6 py-3 rounded-2xl min-h-[56px] min-w-[100px] transition-colors"
        >
          Clear
        </button>
      </div>

      {/* design notes */}
      <div className="absolute bottom-6 right-4 pointer-events-auto">
        <Link href="/dream/169-kids-marble-run/readme"
          className="text-muted-foreground/70 text-xs hover:text-muted-foreground">notes</Link>
      </div>
    </div>
  )
}
