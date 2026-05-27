"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// Pentatonic C major (low → high), top row = highest pitch
const PITCHES = [
  { freq: 329.63, color: "#f97316", glow: "#ea580c" }, // E4 orange  — row 0 (top)
  { freq: 261.63, color: "#22d3ee", glow: "#0891b2" }, // C4 cyan
  { freq: 220.00, color: "#fb7185", glow: "#e11d48" }, // A3 rose
  { freq: 196.00, color: "#34d399", glow: "#059669" }, // G3 emerald
  { freq: 164.81, color: "#fbbf24", glow: "#d97706" }, // E3 amber
  { freq: 130.81, color: "#a78bfa", glow: "#7c3aed" }, // C3 violet  — row 5 (bottom)
]

const COLS     = 8
const NUM_ROWS = PITCHES.length
const HDR_H    = 52   // header bar height (px)
const CTRL_H   = 76   // control bar height (px)
const PAD      = 10   // left/right margin
const GAP      = 5    // gap between cells

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function playNote(ac: AudioContext, freq: number): void {
  const t = ac.currentTime
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = "triangle"
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.30, t + 0.008)
  g.gain.setTargetAtTime(0, t + 0.010, 0.22)
  o.connect(g)
  g.connect(ac.destination)
  o.start(t)
  o.stop(t + 1.4)
}

export default function Page() {
  const [phase, setPhase] = useState<"start" | "play">("start")
  const [bpm,   setBpm]   = useState(90)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const actxRef     = useRef<AudioContext | null>(null)
  const cellsRef    = useRef<boolean[][]>(
    Array.from({ length: NUM_ROWS }, () => new Array<boolean>(COLS).fill(false))
  )
  const bouncingRef = useRef<number[][]>(
    Array.from({ length: NUM_ROWS }, () => new Array<number>(COLS).fill(0))
  )
  const cursorRef   = useRef(0)
  const lastBeatRef = useRef(0)
  const bpmRef      = useRef(90)

  function handleStart() {
    actxRef.current = new AudioContext()
    // Seed a starter pentatonic melody
    const c = cellsRef.current
    c[1][0] = true; c[5][0] = true  // C4 + C3 octave on beat 1
    c[3][1] = true                   // G3 on beat 2
    c[1][2] = true                   // C4 on beat 3
    c[0][3] = true                   // E4 on beat 4
    c[3][5] = true                   // G3 on beat 6
    c[1][6] = true                   // C4 on beat 7
    c[0][7] = true                   // E4 on beat 8
    setPhase("play")
  }

  function handleBpm(delta: number) {
    const next = Math.max(40, Math.min(160, bpmRef.current + delta))
    bpmRef.current = next
    setBpm(next)
  }

  function handleClear() {
    for (let r = 0; r < NUM_ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        cellsRef.current[r][c]    = false
        bouncingRef.current[r][c] = 0
      }
  }

  useEffect(() => {
    if (phase !== "play") return

    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d")!
    const ac     = actxRef.current!

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, cellW = 0, cellH = 0, gridY = 0, gridH = 0

    function resize() {
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width  = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
      gridY = HDR_H
      gridH = H - HDR_H - CTRL_H
      cellW = (W - PAD * 2) / COLS
      cellH = gridH / NUM_ROWS
    }
    resize()
    window.addEventListener("resize", resize)

    // Ambient pad: C3 + G3 sine waves
    {
      const t = ac.currentTime
      for (const [f, v] of [[130.81, 0.016], [196.00, 0.012]] as [number, number][]) {
        const o = ac.createOscillator()
        const g = ac.createGain()
        o.type = "sine"; o.frequency.value = f
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 2.5)
        o.connect(g); g.connect(ac.destination); o.start(t)
      }
    }

    const dragged = new Set<string>()

    function tapCell(px: number, py: number, dragMode: boolean): void {
      const col = Math.floor((px - PAD) / cellW)
      const row = Math.floor((py - gridY) / cellH)
      if (col < 0 || col >= COLS || row < 0 || row >= NUM_ROWS) return
      const key = `${row},${col}`
      if (dragMode) {
        if (dragged.has(key) || cellsRef.current[row][col]) return
        dragged.add(key)
        cellsRef.current[row][col]    = true
        bouncingRef.current[row][col] = 1.0
        playNote(ac, PITCHES[row].freq)
      } else {
        dragged.add(key)
        cellsRef.current[row][col] = !cellsRef.current[row][col]
        if (cellsRef.current[row][col]) {
          bouncingRef.current[row][col] = 1.0
          playNote(ac, PITCHES[row].freq)
        }
      }
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      dragged.clear()
      const rect = canvas.getBoundingClientRect()
      tapCell(e.clientX - rect.left, e.clientY - rect.top, false)
    }
    const onMove = (e: PointerEvent) => {
      if (!(e.buttons & 1)) return
      const rect = canvas.getBoundingClientRect()
      tapCell(e.clientX - rect.left, e.clientY - rect.top, true)
    }
    const onUp = () => dragged.clear()

    canvas.addEventListener("pointerdown",   onDown)
    canvas.addEventListener("pointermove",   onMove)
    canvas.addEventListener("pointerup",     onUp)
    canvas.addEventListener("pointercancel", onUp)

    let raf = 0, prevTs = 0

    function frame(ts: number): void {
      const dt = Math.min((ts - prevTs) / 1000, 0.06)
      prevTs = ts

      // Beat clock
      const beatSec = 60 / bpmRef.current
      if (ts / 1000 - lastBeatRef.current >= beatSec) {
        lastBeatRef.current += beatSec
        const col = cursorRef.current
        for (let r = 0; r < NUM_ROWS; r++) {
          if (cellsRef.current[r][col]) {
            playNote(ac, PITCHES[r].freq)
            bouncingRef.current[r][col] = 1.0
          }
        }
        cursorRef.current = (col + 1) % COLS
      }

      // Decay block bounces
      for (let r = 0; r < NUM_ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (bouncingRef.current[r][c] > 0)
            bouncingRef.current[r][c] = Math.max(0, bouncingRef.current[r][c] - dt * 5)

      // ── Render ────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#070714"
      ctx.fillRect(0, 0, W, H)

      for (let r = 0; r < NUM_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = PAD + c * cellW + GAP / 2
          const y = gridY + r * cellH + GAP / 2
          const w = cellW - GAP
          const h = cellH - GAP
          const active   = cellsRef.current[r][c]
          const bounce   = bouncingRef.current[r][c]
          const isCursor = c === (cursorRef.current - 1 + COLS) % COLS

          if (active) {
            const sc = 1 + bounce * 0.08
            ctx.save()
            ctx.translate(x + w / 2, y + h / 2)
            ctx.scale(sc, sc)
            ctx.shadowBlur  = 8 + bounce * 18
            ctx.shadowColor = PITCHES[r].glow
            // Lego block base
            ctx.fillStyle = PITCHES[r].color
            drawRoundRect(ctx, -w / 2, -h / 2, w, h, 7)
            ctx.fill()
            // Plastic sheen (top-to-mid gradient)
            const sheen = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + h * 0.45)
            sheen.addColorStop(0, "rgba(255,255,255,0.28)")
            sheen.addColorStop(1, "rgba(255,255,255,0)")
            ctx.fillStyle = sheen
            drawRoundRect(ctx, -w / 2, -h / 2, w, h, 7)
            ctx.fill()
            // Center stud
            const sR = Math.min(w, h) * 0.14
            ctx.globalAlpha = 0.50
            ctx.fillStyle   = PITCHES[r].glow
            ctx.beginPath(); ctx.arc(0, 0, sR, 0, Math.PI * 2); ctx.fill()
            ctx.globalAlpha = 1
            ctx.restore()
          } else {
            // Empty cell: faint color hint
            ctx.save()
            ctx.globalAlpha = isCursor ? 0.18 : 0.07
            ctx.fillStyle   = PITCHES[r].color
            drawRoundRect(ctx, x, y, w, h, 7)
            ctx.fill()
            ctx.globalAlpha = 1
            ctx.restore()
          }
        }
      }

      // Cursor beam
      const prevCol = (cursorRef.current - 1 + COLS) % COLS
      const cx = PAD + prevCol * cellW + cellW / 2
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth   = 2.5
      ctx.shadowBlur  = 10
      ctx.shadowColor = "rgba(255,255,255,0.7)"
      ctx.beginPath()
      ctx.moveTo(cx, gridY)
      ctx.lineTo(cx, gridY + gridH)
      ctx.stroke()
      ctx.restore()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(ts => {
      prevTs = ts
      lastBeatRef.current = ts / 1000  // initialize beat clock to current time
      frame(ts)
    })

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("pointerdown",   onDown)
      canvas.removeEventListener("pointermove",   onMove)
      canvas.removeEventListener("pointerup",     onUp)
      canvas.removeEventListener("pointercancel", onUp)
      window.removeEventListener("resize", resize)
      if (actxRef.current) { actxRef.current.close(); actxRef.current = null }
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#070714] flex flex-col items-center justify-center
                      gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">Lego Beats 🧱</h1>
          <p className="text-white/75 text-base max-w-xs">
            Tap colorful blocks to build a melody. The cursor sweeps and plays
            your pattern on loop!
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

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-[52px] flex items-center
                      justify-between px-4 pointer-events-none select-none">
        <span className="text-white/75 text-base font-semibold">Lego Beats 🧱</span>
        <Link href="/dream"
          className="text-white/55 text-sm pointer-events-auto hover:text-white/80">
          ← dream
        </Link>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 h-[76px] flex items-center
                      justify-center gap-3 px-4">
        <button
          onClick={() => handleBpm(-10)}
          aria-label="Slower"
          className="bg-indigo-900/80 text-violet-300 text-2xl font-bold rounded-2xl
                     min-h-[56px] min-w-[56px] flex items-center justify-center
                     hover:bg-indigo-800/80 transition-colors"
        >−</button>
        <span className="text-white/80 text-base font-semibold w-16 text-center select-none">
          ♩&nbsp;{bpm}
        </span>
        <button
          onClick={() => handleBpm(+10)}
          aria-label="Faster"
          className="bg-indigo-900/80 text-violet-300 text-2xl font-bold rounded-2xl
                     min-h-[56px] min-w-[56px] flex items-center justify-center
                     hover:bg-indigo-800/80 transition-colors"
        >+</button>
        <div className="mx-2 w-px h-8 bg-white/20" />
        <button
          onClick={handleClear}
          className="bg-slate-800/80 text-slate-300 text-sm font-semibold rounded-2xl
                     px-5 min-h-[56px] hover:bg-slate-700/80 transition-colors"
        >✕ Clear</button>
      </div>

      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <Link href="/dream/177-kids-lego-sequencer/readme"
          className="text-white/35 text-xs hover:text-white/60">notes</Link>
      </div>
    </div>
  )
}
