'use client'

import { useEffect, useRef } from 'react'

interface Row {
  text: string
  y: number
  scatter: number
  charOffsets: Array<{ dx: number; dy: number }>
}

interface Trail {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const SCALES = [
  { name: 'QUANTUM',    eventsPerSec: 8,   toneFreq: 4000, toneGain: 0.11, rowSpeed: 90, fontSize: 10, rowHeight: 14 },
  { name: 'BIOLOGICAL', eventsPerSec: 1,   toneFreq: 440,  toneGain: 0.17, rowSpeed: 26, fontSize: 11, rowHeight: 16 },
  { name: 'COSMIC',     eventsPerSec: 0.1, toneFreq: 110,  toneGain: 0.26, rowSpeed: 3,  fontSize: 20, rowHeight: 28 },
]

const SCALE_MS = 40_000
const FLASH_DUR = 0.2
const SCATTER_DUR = 0.8

const PTYPES = [
  'μ+', 'μ-', 'e+', 'e-', 'γ', 'π+', 'π-', 'π0',
  'K+', 'K-', 'p', 'p̄', 'n', 'τ+', 'τ-', 'νe', 'ν̄e', 'νμ', 'ν̄μ',
]

function buildEvent(): string {
  const type = PTYPES[Math.floor(Math.random() * PTYPES.length)]
  const pt  = (Math.random() * 200 + 0.5).toFixed(1)
  const eta = ((Math.random() - 0.5) * 5.2).toFixed(3)
  const phi = ((Math.random() - 0.5) * Math.PI * 2).toFixed(3)
  const m   = (Math.random() * 5).toFixed(4)
  const q   = Math.random() > 0.5 ? '+1' : '-1'
  return `[${type.padEnd(3)}] pt=${pt.padStart(7)} eta=${eta.padStart(7)} phi=${phi.padStart(7)} m=${m.padStart(6)} q=${q}`
}

function randomOffsets(len: number): Array<{ dx: number; dy: number }> {
  return Array.from({ length: len }, () => ({
    dx: (Math.random() - 0.5) * 64,
    dy: (Math.random() - 0.5) * 30,
  }))
}

function fireTone(ac: AudioContext, freq: number, gain: number) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  env.gain.setValueAtTime(0, ac.currentTime)
  env.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.03)
  env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.14)
  osc.connect(env)
  env.connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + 0.17)
}

export default function DataCosmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ac: AudioContext | null = null
    let subOsc: OscillatorNode | null = null

    function startAudio() {
      if (ac) return
      ac = new AudioContext()
      subOsc = ac.createOscillator()
      const g = ac.createGain()
      subOsc.type = 'sine'
      subOsc.frequency.value = 38
      g.gain.value = 0.06
      subOsc.connect(g)
      g.connect(ac.destination)
      subOsc.start()
    }

    // Arrow functions preserve TypeScript narrowing across closures
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = canvas.offsetWidth  * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let scaleIdx = 0
    let scaleStart = performance.now()
    let transitioning = false
    let transStart = 0

    const rows: Row[] = []
    const trails: Trail[] = []
    let eventTimer = 0
    let lastTs = performance.now()
    let rafId = 0

    const addRow = () => {
      const scale = SCALES[scaleIdx]
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      const text = buildEvent()
      const isCosmic = scale.name === 'COSMIC'
      const row: Row = {
        text,
        y: isCosmic ? H * 0.5 : H + scale.rowHeight,
        scatter: 1.0,
        charOffsets: randomOffsets(text.length),
      }
      if (isCosmic) rows.length = 0
      rows.push(row)
      if (rows.length > 280) rows.splice(0, rows.length - 280)

      const tx = isCosmic ? W / 2 : 8 + text.length * 5.8 * 0.3
      for (let i = 0; i < 8; i++) {
        trails.push({
          x: tx + (Math.random() - 0.5) * 100,
          y: row.y,
          vx: (Math.random() - 0.5) * 60,
          vy: -(Math.random() * 40 + 10),
          life: 1,
        })
      }
      if (trails.length > 400) trails.splice(0, trails.length - 400)

      if (ac) fireTone(ac, scale.toneFreq, scale.toneGain)
    }

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw)
      const dt = Math.min((now - lastTs) / 1000, 0.05)
      lastTs = now

      const scale = SCALES[scaleIdx]
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      const isCosmic = scale.name === 'COSMIC'

      // Scale auto-advance
      if (!transitioning && now - scaleStart > SCALE_MS) {
        transitioning = true
        transStart = now
        rows.forEach(r => {
          r.scatter = 1.0
          r.charOffsets = randomOffsets(r.text.length)
        })
      }

      if (transitioning) {
        const elap = (now - transStart) / 1000
        if (elap > FLASH_DUR + SCATTER_DUR) {
          scaleIdx = (scaleIdx + 1) % SCALES.length
          scaleStart = now
          rows.length = 0
          eventTimer = 0
          transitioning = false
        }
      } else {
        eventTimer += dt
        const interval = 1 / scale.eventsPerSec
        while (eventTimer >= interval) {
          eventTimer -= interval
          addRow()
        }
      }

      // Update rows
      rows.forEach(r => {
        r.y -= scale.rowSpeed * dt
        if (transitioning) {
          r.scatter = Math.min(1.0, r.scatter + dt * 2.5)
        } else {
          r.scatter = Math.max(0, r.scatter - dt / 0.3)
        }
      })
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].y < -(scale.rowHeight + 6)) rows.splice(i, 1)
      }

      // Update trails
      for (let i = trails.length - 1; i >= 0; i--) {
        const t = trails[i]
        t.x  += t.vx * dt
        t.y  += t.vy * dt
        t.vy += 14 * dt
        t.life -= dt / 1.1
        if (t.life <= 0) trails.splice(i, 1)
      }

      // ── Draw ─────────────────────────────────────────────────────────────

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      // Trail particles
      trails.forEach(t => {
        ctx.beginPath()
        ctx.arc(t.x, t.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${(t.life * 0.42).toFixed(3)})`
        ctx.fill()
      })

      // Text rows
      ctx.font = `${scale.fontSize}px monospace`
      const charW = ctx.measureText('M').width

      ctx.textAlign = 'left'
      rows.forEach(r => {
        const x0 = isCosmic ? (W - r.text.length * charW) / 2 : 8
        if (r.scatter > 0.02) {
          for (let i = 0; i < r.text.length; i++) {
            const bx = x0 + i * charW
            const off = r.charOffsets[i] ?? { dx: 0, dy: 0 }
            const a = Math.max(0, 0.9 - r.scatter * 0.75)
            ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
            ctx.fillText(r.text[i], bx + off.dx * r.scatter, r.y + off.dy * r.scatter)
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.88)'
          ctx.fillText(r.text, x0, r.y)
        }
      })

      // Scale name — bottom right
      ctx.font = 'bold 28px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.48)'
      ctx.textAlign = 'right'
      ctx.fillText(scale.name, W - 20, H - 22)

      // Caption — bottom left
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.26)'
      ctx.textAlign = 'left'
      ctx.fillText("All of nature's data is the same material.", 20, H - 22)

      // Timeline progress bar
      if (!transitioning) {
        const prog = Math.min(1, (now - scaleStart) / SCALE_MS)
        ctx.fillStyle = 'rgba(255,255,255,0.09)'
        ctx.fillRect(0, H - 2, W, 2)
        ctx.fillStyle = 'rgba(255,255,255,0.52)'
        ctx.fillRect(0, H - 2, W * prog, 2)
      }

      // White flash on scale transition
      if (transitioning) {
        const elap = (now - transStart) / 1000
        const flashA = elap < FLASH_DUR ? (1 - elap / FLASH_DUR) * 0.95 : 0
        if (flashA > 0.005) {
          ctx.fillStyle = `rgba(255,255,255,${flashA.toFixed(3)})`
          ctx.fillRect(0, 0, W, H)
        }
      }
    }

    rafId = requestAnimationFrame(draw)

    function onPointerDown() { startAudio() }
    window.addEventListener('pointerdown', onPointerDown)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('pointerdown', onPointerDown)
      if (subOsc) { try { subOsc.stop() } catch { /* already stopped */ } }
      if (ac) ac.close().catch(() => {})
    }
  }, [])

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute top-0 left-0 right-0 p-5 pointer-events-none">
        <h1 className="text-2xl font-mono font-bold text-foreground tracking-widest">DATA-COSM</h1>
        <p className="text-base font-mono text-muted-foreground mt-1">
          particle physics event stream · three temporal scales
        </p>
        <p className="text-sm font-mono text-muted-foreground mt-0.5">
          tap to activate audio · scales auto-advance every 40 s
        </p>
      </div>
    </main>
  )
}
