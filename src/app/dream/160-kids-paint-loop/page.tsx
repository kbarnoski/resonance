'use client'
import { useEffect, useRef, useState } from 'react'

// ── pentatonic pitch table (C3–C5, C-major) ───────────────────────────────────
const PENTA = [130.81, 146.83, 164.81, 196.00, 220.00,
               261.63, 293.66, 329.63, 392.00, 440.00, 523.25]

function snapPentatonic(hz: number): number {
  return PENTA.reduce((a, b) => Math.abs(b - hz) < Math.abs(a - hz) ? b : a)
}

function yToHz(y: number, H: number): number {
  const t = 1 - Math.max(0, Math.min(1, y / H))
  return snapPentatonic(130.81 * Math.pow(4, t))
}

// ── zone config (4 screen columns → 4 timbres) ───────────────────────────────
interface Zone { hue: number; attack: number; decay: number; detune: number }

function zoneAt(x: number, W: number): Zone {
  const t = x / W
  if (t < 0.25) return { hue: 265, attack: 0.012, decay: 0.55, detune: 0 }   // violet – piano
  if (t < 0.50) return { hue: 38,  attack: 0.018, decay: 0.38, detune: 8 }   // amber  – bells
  if (t < 0.75) return { hue: 172, attack: 0.025, decay: 0.42, detune: -6 }  // teal   – chime
  return               { hue: 330, attack: 0.070, decay: 0.70, detune: 4 }   // rose   – pads
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Pt  { x: number; y: number }
interface Spk { x: number; y: number; vx: number; vy: number; life: number; hue: number }

interface Loop {
  id: number
  pts: Pt[]
  zone: Zone
  notes: number[]  // Hz
  noteDur: number  // seconds per note
  loopDur: number  // = notes.length * noteDur
  startTime: number
  nextTime: number
  nextIdx: number
}

let UID = 0

// ── demo strokes (relative coords, scaled at runtime) ─────────────────────────
function buildDemoLoops(W: number, H: number, now: number): Loop[] {
  const makePts = (coords: [number, number][]): Pt[] =>
    coords.map(([rx, ry]) => ({ x: rx * W, y: ry * H }))

  const makeLoop = (pts: Pt[], zone: Zone): Loop => {
    const N = Math.min(16, Math.max(4, Math.floor(pts.length / 2)))
    const notes: number[] = []
    for (let i = 0; i < N; i++) {
      const idx = Math.round(i / (N - 1) * (pts.length - 1))
      notes.push(yToHz(pts[idx].y, H))
    }
    const noteDur = 0.30
    return {
      id: ++UID, pts, zone, notes, noteDur,
      loopDur: notes.length * noteDur,
      startTime: now,
      nextTime: now + 0.04,
      nextIdx: 0,
    }
  }

  const loops: Loop[] = []

  // Violet – left side wavy arc
  const vPts = makePts([
    [0.05,0.70],[0.07,0.60],[0.09,0.50],[0.11,0.42],[0.13,0.36],
    [0.15,0.42],[0.17,0.50],[0.19,0.42],[0.20,0.36],[0.21,0.30],
  ])
  loops.push(makeLoop(vPts, zoneAt(0.10 * W, W)))

  // Teal – mid-right diagonal swoop
  const tPts = makePts([
    [0.55,0.28],[0.58,0.35],[0.61,0.44],[0.63,0.50],
    [0.64,0.56],[0.63,0.62],[0.60,0.66],[0.57,0.60],
  ])
  loops.push(makeLoop(tPts, zoneAt(0.60 * W, W)))

  // Rose – right side gentle rise
  const rPts = makePts([
    [0.80,0.72],[0.82,0.64],[0.84,0.55],[0.86,0.48],
    [0.87,0.42],[0.88,0.48],[0.87,0.56],[0.85,0.64],
  ])
  loops.push(makeLoop(rPts, zoneAt(0.84 * W, W)))

  return loops
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase] = useState<'start' | 'play'>('start')
  const [isDemo, setIsDemo] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef   = useRef<AudioContext | null>(null)
  const loopsRef  = useRef<Loop[]>([])
  const sparksRef = useRef<Spk[]>([])
  const rafRef    = useRef<number>(0)
  const drawRef   = useRef<{ pts: Pt[] } | null>(null)
  const dimRef    = useRef({ W: 0, H: 0 })

  useEffect(() => {
    if (phase !== 'play') return
    const cvMaybe = canvasRef.current
    if (!cvMaybe) return
    const canvas = cvMaybe
    const ctx = canvas.getContext('2d')!
    const ac  = actxRef.current!

    // Ambient pad: C3 + G3
    const padFreqs = [130.81, 196.00]
    const padOscs = padFreqs.map(f => {
      const osc = ac.createOscillator()
      const g   = ac.createGain()
      osc.type = 'sine'; osc.frequency.value = f
      g.gain.value = 0.018
      osc.connect(g); g.connect(ac.destination)
      osc.start(); return osc
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
    window.addEventListener('resize', resize)

    // Seed demo loops after first resize
    if (isDemo && loopsRef.current.length === 0) {
      const { W, H } = dimRef.current
      loopsRef.current = buildDemoLoops(W, H, ac.currentTime)
    }

    function scheduleNote(hz: number, zone: Zone, when: number, dur: number) {
      const osc = ac.createOscillator()
      const env = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz
      osc.detune.value = zone.detune
      env.gain.setValueAtTime(0, when)
      env.gain.linearRampToValueAtTime(0.26, when + zone.attack)
      env.gain.exponentialRampToValueAtTime(0.001,
        when + zone.attack + Math.min(zone.decay, dur * 0.80))
      osc.connect(env); env.connect(ac.destination)
      osc.start(when); osc.stop(when + zone.attack + zone.decay + 0.06)
    }

    function frame() {
      const { W, H } = dimRef.current
      const now = ac.currentTime

      // Dark fade (lets deleted-stroke ghosts fade out naturally)
      ctx.fillStyle = 'rgba(0,0,10,0.18)'
      ctx.fillRect(0, 0, W, H)

      // Faint zone color washes (barely visible, hints at color regions)
      const zoneHues = [265, 38, 172, 330]
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `hsla(${zoneHues[i]},60%,30%,0.028)`
        ctx.fillRect(i * W / 4, 0, W / 4, H)
      }

      // Active loops: schedule audio + draw path + traversal dot
      for (const lp of loopsRef.current) {
        // Audio scheduler (look-ahead 0.13 s)
        while (lp.nextTime < now + 0.13) {
          scheduleNote(lp.notes[lp.nextIdx], lp.zone, lp.nextTime, lp.noteDur)
          lp.nextIdx = (lp.nextIdx + 1) % lp.notes.length
          lp.nextTime += lp.noteDur
        }

        // Visual phase
        const phase = ((now - lp.startTime) % lp.loopDur) / lp.loopDur
        const ptIdx = Math.floor(phase * lp.pts.length)
        const dotPt = lp.pts[Math.min(ptIdx, lp.pts.length - 1)]

        // Draw stroke path
        if (lp.pts.length >= 2) {
          ctx.save()
          ctx.globalCompositeOperation = 'screen'
          ctx.strokeStyle = `hsl(${lp.zone.hue},80%,58%)`
          ctx.lineWidth   = 5
          ctx.lineCap     = 'round'; ctx.lineJoin = 'round'
          ctx.shadowColor = `hsl(${lp.zone.hue},100%,68%)`
          ctx.shadowBlur  = 9
          ctx.beginPath()
          ctx.moveTo(lp.pts[0].x, lp.pts[0].y)
          for (let i = 1; i < lp.pts.length; i++) ctx.lineTo(lp.pts[i].x, lp.pts[i].y)
          ctx.stroke()

          // Traversal dot
          ctx.fillStyle  = `hsl(${lp.zone.hue},100%,88%)`
          ctx.shadowBlur = 22
          ctx.beginPath(); ctx.arc(dotPt.x, dotPt.y, 7, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        }
      }

      // Draw stroke currently being drawn
      const dr = drawRef.current
      if (dr && dr.pts.length >= 2) {
        const zone = zoneAt(dr.pts[0].x, W)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.strokeStyle = `hsl(${zone.hue},80%,58%)`
        ctx.lineWidth   = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.shadowColor = `hsl(${zone.hue},100%,68%)`; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.moveTo(dr.pts[0].x, dr.pts[0].y)
        for (let i = 1; i < dr.pts.length; i++) ctx.lineTo(dr.pts[i].x, dr.pts[i].y)
        ctx.stroke()
        // Bright leading tip
        const tip = dr.pts[dr.pts.length - 1]
        ctx.fillStyle = `hsl(${zone.hue},100%,90%)`; ctx.shadowBlur = 24
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // Sparkles
      const sp = sparksRef.current
      for (let i = sp.length - 1; i >= 0; i--) {
        const s = sp[i]
        s.x += s.vx; s.y += s.vy; s.vy += 0.07; s.life -= 0.035
        if (s.life <= 0) { sp.splice(i, 1); continue }
        const alpha = Math.floor(s.life * 200).toString(16).padStart(2, '0')
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = `hsl(${s.hue},90%,72%)${alpha}`
        ctx.beginPath(); ctx.arc(s.x, s.y, 3.5 * s.life, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // Empty-state hint (when no loops and not drawing)
      if (loopsRef.current.length === 0 && !drawRef.current) {
        ctx.save()
        ctx.globalAlpha = 0.38
        ctx.fillStyle = '#fff'
        ctx.font = '18px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Draw a stroke → it loops as music!', W / 2, H * 0.88)
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    // ── pointer events ─────────────────────────────────────────────────────────
    function onDown(e: PointerEvent) {
      e.preventDefault()
      if (ac.state === 'suspended') void ac.resume()

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left), y = (e.clientY - rect.top)

      // Tap near existing stroke → delete it
      for (let i = 0; i < loopsRef.current.length; i++) {
        const lp = loopsRef.current[i]
        for (const pt of lp.pts) {
          if (Math.hypot(pt.x - x, pt.y - y) < 24) {
            // Burst sparkles along stroke (every 4th point)
            lp.pts.filter((_, k) => k % 4 === 0).forEach(p => {
              for (let j = 0; j < 8; j++) {
                const a = (j / 8) * Math.PI * 2
                const sp = 1.2 + Math.random() * 2.4
                sparksRef.current.push({
                  x: p.x, y: p.y,
                  vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5,
                  life: 1, hue: lp.zone.hue,
                })
              }
            })
            loopsRef.current.splice(i, 1)
            return
          }
        }
      }

      // Start new stroke (cap at 4 simultaneous loops)
      if (loopsRef.current.length >= 4) return
      canvas.setPointerCapture(e.pointerId)
      drawRef.current = { pts: [{ x, y }] }
    }

    function onMove(e: PointerEvent) {
      if (!drawRef.current) return
      const rect = canvas.getBoundingClientRect()
      drawRef.current.pts.push({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    function onUp() {
      const dr = drawRef.current
      drawRef.current = null
      if (!dr || dr.pts.length < 4) return

      const { H } = dimRef.current
      const zone = zoneAt(dr.pts[0].x, dimRef.current.W)

      // Sample up to 18 evenly-spaced pitch points from the stroke
      const N = Math.min(18, Math.max(4, Math.floor(dr.pts.length / 4)))
      const notes: number[] = []
      for (let i = 0; i < N; i++) {
        const idx = Math.round(i / (N - 1) * (dr.pts.length - 1))
        notes.push(yToHz(dr.pts[idx].y, H))
      }

      const noteDur = 0.32
      const now = ac.currentTime
      loopsRef.current.push({
        id: ++UID, pts: dr.pts, zone, notes, noteDur,
        loopDur: notes.length * noteDur,
        startTime: now,
        nextTime: now + 0.04,
        nextIdx: 0,
      })
    }

    canvas.addEventListener('pointerdown',   onDown)
    canvas.addEventListener('pointermove',   onMove)
    canvas.addEventListener('pointerup',     onUp)
    canvas.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown',   onDown)
      canvas.removeEventListener('pointermove',   onMove)
      canvas.removeEventListener('pointerup',     onUp)
      canvas.removeEventListener('pointercancel', onUp)
      padOscs.forEach(o => { try { o.stop() } catch { /* already stopped */ } })
    }
  }, [phase, isDemo])

  // Cleanup AudioContext on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    void actxRef.current?.close()
  }, [])

  function handleStart() {
    actxRef.current = new AudioContext()
    loopsRef.current = []
    setIsDemo(false)
    setPhase('play')
  }

  function handleDemo() {
    actxRef.current = new AudioContext()
    loopsRef.current = []
    setIsDemo(true)
    setPhase('play')
  }

  function clearAll() {
    sparksRef.current = []
    loopsRef.current  = []
  }

  if (phase === 'start') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black gap-6 px-8">
        <p className="text-base font-mono text-muted-foreground">For kids 3+</p>
        <h1 className="text-3xl font-serif text-center text-foreground">Loop Garden</h1>
        <p className="text-base text-muted-foreground text-center max-w-sm leading-relaxed">
          Draw a glowing stroke on the screen — it turns into a looping melody!
          Draw up to four strokes in different colors. Tap any stroke to erase it.
        </p>
        <button
          onClick={handleStart}
          className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-lg font-mono min-h-[56px]
                     hover:bg-violet-500/30 transition-colors"
        >
          ✦&nbsp; Start Drawing!
        </button>
        <button
          onClick={handleDemo}
          className="px-6 py-2.5 rounded-full bg-muted text-muted-foreground text-base font-mono
                     min-h-[44px] hover:bg-accent transition-colors"
        >
          Watch the demo
        </button>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Zero permissions · Zero API · Zero deps
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />

      {isDemo && loopsRef.current.length > 0 && (
        <p className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-2
                      rounded-full bg-black/50 text-muted-foreground text-sm font-mono
                      pointer-events-none select-none">
          Demo — draw your own!
        </p>
      )}

      <div className="absolute bottom-5 right-5">
        <button
          onClick={clearAll}
          className="px-4 py-2.5 rounded-full bg-muted text-muted-foreground text-sm font-mono
                     min-h-[44px] hover:bg-accent transition-colors"
        >
          ↺ Clear
        </button>
      </div>
    </div>
  )
}
