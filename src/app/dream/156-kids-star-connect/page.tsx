'use client'
import { useEffect, useRef, useState } from 'react'

// ── star definitions (xp/yp = fraction of canvas W/H) ──────────────────────
const DEFS = [
  // Cluster A — left sky (5 stars, form a loose diamond + tail)
  { id: 0,  xp: 0.18, yp: 0.22, hz: 261.63, col: '#a78bfa' }, // C4 violet
  { id: 1,  xp: 0.34, yp: 0.13, hz: 329.63, col: '#6ee7b7' }, // E4 emerald
  { id: 2,  xp: 0.50, yp: 0.19, hz: 392.00, col: '#fbbf24' }, // G4 amber
  { id: 3,  xp: 0.38, yp: 0.35, hz: 440.00, col: '#fb7185' }, // A4 rose
  { id: 4,  xp: 0.20, yp: 0.42, hz: 523.25, col: '#67e8f9' }, // C5 cyan
  // Cluster B — right sky (4 stars, form a square)
  { id: 5,  xp: 0.64, yp: 0.14, hz: 196.00, col: '#fbbf24' }, // G3 amber
  { id: 6,  xp: 0.82, yp: 0.10, hz: 220.00, col: '#fb7185' }, // A3 rose
  { id: 7,  xp: 0.88, yp: 0.28, hz: 164.81, col: '#6ee7b7' }, // E3 emerald
  { id: 8,  xp: 0.70, yp: 0.34, hz: 130.81, col: '#a78bfa' }, // C3 violet
  // Cluster C — bottom (4 stars, gentle arc)
  { id: 9,  xp: 0.20, yp: 0.70, hz: 329.63, col: '#6ee7b7' }, // E4 emerald
  { id: 10, xp: 0.40, yp: 0.78, hz: 196.00, col: '#fbbf24' }, // G3 amber
  { id: 11, xp: 0.60, yp: 0.74, hz: 261.63, col: '#a78bfa' }, // C4 violet
  { id: 12, xp: 0.78, yp: 0.66, hz: 392.00, col: '#fbbf24' }, // G4 amber
]

const STAR_R = 18   // interactive star visual radius (canvas px)
const SNAP_D = 56   // snap-to-star distance (px)
const BG_N   = 38   // non-interactive background twinkling stars

// ── helpers ─────────────────────────────────────────────────────────────────
function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}
function triKey(a: number, b: number, c: number): string {
  return [a, b, c].sort((x, y) => x - y).join('-')
}

function ringTone(
  actx: AudioContext,
  hz: number,
  amp: number,
  dur: number,
  startAt?: number,
) {
  const t = startAt ?? actx.currentTime
  const osc = actx.createOscillator()
  const env = actx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = hz
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(amp, t + 0.018)
  env.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(env)
  env.connect(actx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function playInterval(actx: AudioContext, hz1: number, hz2: number) {
  ringTone(actx, hz1, 0.17, 1.8)
  ringTone(actx, hz2, 0.17, 1.8)
}

function playChordNotes(actx: AudioContext, hzList: number[]) {
  hzList.forEach((hz, i) => {
    ringTone(actx, hz, 0.20, 2.6, actx.currentTime + i * 0.055)
  })
}

// ── types ────────────────────────────────────────────────────────────────────
type Star   = { id: number; x: number; y: number; hz: number; col: string }
type BgStar = { xp: number; yp: number; r: number; phase: number }
type Flash  = { a: number; b: number; c: number; t: number }
type Spark  = { x: number; y: number; vx: number; vy: number; t: number; col: string }

// ── component ────────────────────────────────────────────────────────────────
export default function Page() {
  const [started, setStarted] = useState(false)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const actxRef      = useRef<AudioContext | null>(null)
  const starsRef     = useRef<Star[]>([])
  const edgesRef     = useRef<Set<string>>(new Set())
  const edgeTimesRef = useRef<Map<string, number>>(new Map())
  const trisRef      = useRef<Set<string>>(new Set())
  const dragRef      = useRef<{ fromId: number; cx: number; cy: number } | null>(null)
  const flashesRef   = useRef<Flash[]>([])
  const sparksRef    = useRef<Spark[]>([])
  const bgRef        = useRef<BgStar[]>([])

  useEffect(() => {
    if (!started) return
    const cv = canvasRef.current
    if (!cv) return
    const av = actxRef.current
    if (!av) return
    const canvas = cv    // narrowed to HTMLCanvasElement for closure capture
    const actx   = av   // narrowed to AudioContext for closure capture
    const ctx = canvas.getContext('2d')!

    let W = 0, H = 0

    function resize() {
      const dpr = window.devicePixelRatio || 1
      W = window.innerWidth
      H = window.innerHeight
      canvas.width  = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
      starsRef.current = DEFS.map(d => ({
        id: d.id, x: d.xp * W, y: d.yp * H, hz: d.hz, col: d.col,
      }))
      if (bgRef.current.length === 0) {
        bgRef.current = Array.from({ length: BG_N }, () => ({
          xp: Math.random(), yp: Math.random(),
          r: Math.random() * 1.1 + 0.4, phase: Math.random() * Math.PI * 2,
        }))
      }
    }
    resize()
    window.addEventListener('resize', resize)

    // Ambient C3+G3 pad — just audible under the stars
    const padFreqs = [130.81, 196.00]
    const padNodes = padFreqs.map(hz => {
      const osc = actx.createOscillator()
      const g   = actx.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz
      g.gain.value = 0.007
      osc.connect(g)
      g.connect(actx.destination)
      osc.start()
      return { osc, g }
    })

    function nearStar(px: number, py: number, exclude?: number): number | null {
      let best = -1, bd = SNAP_D
      for (const s of starsRef.current) {
        if (s.id === exclude) continue
        const d = Math.hypot(s.x - px, s.y - py)
        if (d < bd) { bd = d; best = s.id }
      }
      return best >= 0 ? best : null
    }

    const startTs = performance.now()
    let raf = 0

    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#000008'
      ctx.fillRect(0, 0, W, H)

      // Background twinkling stars
      for (const bs of bgRef.current) {
        const alpha = 0.28 + 0.18 * Math.sin(ts * 0.00085 + bs.phase)
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(bs.xp * W, bs.yp * H, bs.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Connection lines (existing edges)
      for (const key of edgesRef.current) {
        const parts = key.split('-')
        const ai = Number(parts[0]), bi = Number(parts[1])
        const sa = starsRef.current[ai], sb = starsRef.current[bi]
        if (!sa || !sb) continue
        const t0    = edgeTimesRef.current.get(key) ?? ts
        const alpha = Math.min(1, (ts - t0) / 380) * 0.68
        ctx.save()
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
        ctx.lineWidth   = 1.5
        ctx.shadowColor = 'rgba(180,180,255,0.85)'
        ctx.shadowBlur  = 7
        ctx.beginPath()
        ctx.moveTo(sa.x, sa.y)
        ctx.lineTo(sb.x, sb.y)
        ctx.stroke()
        ctx.restore()
      }

      // Triangle flashes
      flashesRef.current = flashesRef.current.filter(f => {
        const age = ts - f.t
        if (age < 0) return true     // not yet — keep
        if (age > 900) return false  // expired — drop
        const alpha = (1 - age / 900) * 0.22
        const sa = starsRef.current[f.a]
        const sb = starsRef.current[f.b]
        const sc = starsRef.current[f.c]
        if (!sa || !sb || !sc) return false
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#ccd0ff'
        ctx.beginPath()
        ctx.moveTo(sa.x, sa.y)
        ctx.lineTo(sb.x, sb.y)
        ctx.lineTo(sc.x, sc.y)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        return true
      })

      // Sparkles
      sparksRef.current = sparksRef.current.filter(sp => {
        const age = ts - sp.t
        if (age < 0) return true
        if (age > 1100) return false
        const alpha = (1 - age / 1100) * 0.92
        const x = sp.x + sp.vx * age * 0.001
        const y = sp.y + sp.vy * age * 0.001
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle   = sp.col
        ctx.shadowColor = sp.col
        ctx.shadowBlur  = 5
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        return true
      })

      // Rubber-band line during drag
      const drag = dragRef.current
      if (drag !== null) {
        const src = starsRef.current[drag.fromId]
        if (src) {
          ctx.save()
          ctx.setLineDash([5, 7])
          ctx.strokeStyle = 'rgba(255,255,255,0.36)'
          ctx.lineWidth   = 1.5
          ctx.beginPath()
          ctx.moveTo(src.x, src.y)
          ctx.lineTo(drag.cx, drag.cy)
          ctx.stroke()
          ctx.restore()
        }
      }

      // Interactive stars
      const pulse = 1 + 0.09 * Math.sin(ts * 0.0019)
      for (const s of starsRef.current) {
        const connCount = [...edgesRef.current].filter(k => {
          const p = k.split('-')
          return Number(p[0]) === s.id || Number(p[1]) === s.id
        }).length
        const glow = (14 + connCount * 5) * pulse
        ctx.save()
        ctx.shadowColor = s.col
        ctx.shadowBlur  = glow
        ctx.globalAlpha = 0.88
        ctx.fillStyle   = s.col
        ctx.beginPath()
        ctx.arc(s.x, s.y, STAR_R * pulse, 0, Math.PI * 2)
        ctx.fill()
        // Bright white core
        ctx.globalAlpha = 1
        ctx.shadowBlur  = 0
        ctx.fillStyle   = '#ffffff'
        ctx.beginPath()
        ctx.arc(s.x, s.y, STAR_R * 0.35, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // Hint text (fades out after 9s)
      const hintAge = ts - startTs
      if (hintAge < 9000) {
        const raw = hintAge < 2000
          ? hintAge / 2000
          : Math.max(0, 1 - (hintAge - 2000) / 7000)
        ctx.save()
        ctx.globalAlpha = raw * 0.70
        ctx.fillStyle   = '#ffffff'
        ctx.font        = '18px monospace'
        ctx.textAlign   = 'center'
        ctx.fillText('Draw a line between the stars  ✦', W / 2, H - 30)
        ctx.restore()
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    // ── pointer handlers ────────────────────────────────────────────────────
    function onDown(e: PointerEvent) {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const px   = e.clientX - rect.left
      const py   = e.clientY - rect.top
      const id   = nearStar(px, py)
      if (id !== null) {
        dragRef.current = { fromId: id, cx: px, cy: py }
        canvas.setPointerCapture(e.pointerId)
      }
    }

    function onMove(e: PointerEvent) {
      if (!dragRef.current) return
      const rect = canvas.getBoundingClientRect()
      dragRef.current = {
        ...dragRef.current,
        cx: e.clientX - rect.left,
        cy: e.clientY - rect.top,
      }
    }

    function onUp(e: PointerEvent) {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return

      const rect = canvas.getBoundingClientRect()
      const px   = e.clientX - rect.left
      const py   = e.clientY - rect.top
      const toId = nearStar(px, py, drag.fromId)
      if (toId === null) return

      const key = edgeKey(drag.fromId, toId)
      if (edgesRef.current.has(key)) return // already connected

      edgesRef.current.add(key)
      edgeTimesRef.current.set(key, performance.now())

      if (actx.state === 'suspended') void actx.resume()

      const sa = starsRef.current[drag.fromId]
      const sb = starsRef.current[toId]
      if (!sa || !sb) return

      playInterval(actx, sa.hz, sb.hz)

      // Detect newly completed triangles
      for (let k = 0; k < DEFS.length; k++) {
        if (k === drag.fromId || k === toId) continue
        const hasAK = edgesRef.current.has(edgeKey(drag.fromId, k))
        const hasBK = edgesRef.current.has(edgeKey(toId, k))
        if (!hasAK || !hasBK) continue

        const tk = triKey(drag.fromId, toId, k)
        if (trisRef.current.has(tk)) continue
        trisRef.current.add(tk)

        const sc = starsRef.current[k]
        if (!sc) continue

        playChordNotes(actx, [sa.hz, sb.hz, sc.hz])

        const now = performance.now()
        flashesRef.current.push({ a: drag.fromId, b: toId, c: k, t: now })

        const cx = (sa.x + sb.x + sc.x) / 3
        const cy = (sa.y + sb.y + sc.y) / 3
        for (let n = 0; n < 15; n++) {
          const ang  = (n / 15) * Math.PI * 2
          const spd  = 26 + Math.random() * 34
          sparksRef.current.push({
            x: cx, y: cy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            t: now,
            col: [sa.col, sb.col, sc.col][n % 3],
          })
        }
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup',   onUp)
    canvas.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup',   onUp)
      canvas.removeEventListener('pointercancel', onUp)
      padNodes.forEach(({ osc, g }) => {
        try { osc.stop() } catch { /* already stopped */ }
        osc.disconnect()
        g.disconnect()
      })
      actx.close()
    }
  }, [started])

  function handleClear() {
    edgesRef.current.clear()
    edgeTimesRef.current.clear()
    trisRef.current.clear()
    flashesRef.current = []
    sparksRef.current  = []
  }

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-foreground gap-6 px-8">
        <p className="text-base font-mono text-muted-foreground">For kids 3+</p>
        <h1 className="text-3xl font-serif text-center text-foreground">
          Constellation Song
        </h1>
        <p className="text-base text-muted-foreground text-center max-w-sm leading-relaxed">
          The stars are waiting. Draw a line from one star to another — hear
          the notes ring out. Connect three stars to close a shape and hear a
          chord light up the sky.
        </p>
        <button
          className="mt-4 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-base font-mono min-h-[48px] min-w-[44px]
                     hover:bg-violet-500/30 transition-colors"
          onClick={() => {
            actxRef.current = new AudioContext()
            setStarted(true)
          }}
        >
          ✦ &nbsp;Begin
        </button>
        <p className="text-sm text-muted-foreground/70 mt-2">Zero permissions · Zero API · Zero deps</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        style={{ background: '#000008' }}
      />
      <button
        onClick={handleClear}
        className="absolute bottom-5 right-5 px-4 py-2.5 rounded-full
                   bg-muted text-muted-foreground text-sm font-mono
                   min-h-[44px] min-w-[44px] hover:bg-accent transition-colors"
      >
        ↺ Clear
      </button>
    </div>
  )
}
