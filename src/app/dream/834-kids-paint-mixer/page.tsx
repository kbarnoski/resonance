'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createAudioEngine, type AudioEngine } from './audio'
import { createGLRenderer, type GLRenderer, type PaintBlob } from './gl'
import { rgbToHSV } from './pigment'

// ── Initial blob positions ───────────────────────────────────────────────────
function makeInitialBlobs(): PaintBlob[] {
  return [
    { x: 0.25, y: 0.30, r: 0.22, vx: 0.0006,  vy: 0.0003  },
    { x: 0.50, y: 0.72, r: 0.22, vx: -0.0005, vy: -0.0004 },
    { x: 0.75, y: 0.30, r: 0.22, vx: -0.0007, vy: 0.0005  },
  ]
}

// Blob display colors for the drag handles
const BLOB_COLORS = [
  'rgba(220,50,80,0.85)',   // magenta-red
  'rgba(240,200,30,0.85)',  // yellow
  'rgba(50,100,220,0.85)',  // blue/cyan
]
const BLOB_LABELS = ['🔴', '🟡', '🔵']

// CSS fallback blob colors for mix-blend-mode
const CSS_BLOB_COLORS = ['#dc3250', '#f0c81e', '#3264dc']

// ── Blob auto-drift ───────────────────────────────────────────────────────────
// Each blob drifts on a slow sinusoidal path; velocity is derived from the
// sinusoid derivative so it doesn't accumulate. idleFactor ramps the speed
// up from 0 to 1 over 1.5 s of no interaction so the transition is smooth.
function driftBlobs(blobs: PaintBlob[], idleMs: number): PaintBlob[] {
  const idleFactor = Math.min(1, idleMs / 1500)
  const t = Date.now() * 0.001
  return blobs.map((b: PaintBlob, i: number) => {
    const phase = i * 2.094
    // Bounded sinusoidal velocity (no accumulation)
    const vx = Math.sin(t * 0.3 + phase) * 0.0004 * idleFactor
    const vy = Math.cos(t * 0.25 + phase + 1) * 0.0004 * idleFactor
    let nx = b.x + vx
    let ny = b.y + vy
    const m = b.r * 0.4
    if (nx < m)     nx = m
    if (nx > 1 - m) nx = 1 - m
    if (ny < m)     ny = m
    if (ny > 1 - m) ny = 1 - m
    return { ...b, x: nx, y: ny, vx, vy }
  })
}

// ── CSS fallback blob sampling ────────────────────────────────────────────────
function sampleCSSColor(
  canvas: HTMLCanvasElement,
  blobs: PaintBlob[],
): [number, number, number] {
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return [200, 180, 140]
  const w = canvas.width
  const h = canvas.height
  ctx2d.clearRect(0, 0, w, h)
  ctx2d.fillStyle = '#faf5e8'
  ctx2d.fillRect(0, 0, w, h)
  ctx2d.save()
  ctx2d.globalCompositeOperation = 'multiply'
  blobs.forEach((b: PaintBlob, i: number) => {
    const px = b.x * w
    const py = b.y * h
    const rPx = b.r * Math.min(w, h)
    const grad = ctx2d.createRadialGradient(px, py, 0, px, py, rPx)
    grad.addColorStop(0,   CSS_BLOB_COLORS[i] + 'ff')
    grad.addColorStop(0.6, CSS_BLOB_COLORS[i] + 'cc')
    grad.addColorStop(1,   CSS_BLOB_COLORS[i] + '00')
    ctx2d.fillStyle = grad
    ctx2d.beginPath()
    ctx2d.arc(px, py, rPx, 0, Math.PI * 2)
    ctx2d.fill()
  })
  ctx2d.restore()
  const cx = Math.round(w / 2)
  const cy = Math.round(h / 2)
  const d = ctx2d.getImageData(cx, cy, 1, 1).data
  return [d[0], d[1], d[2]]
}

// ── BlobHandle: visual drag target rendered as CSS overlay ───────────────────
interface BlobHandleProps {
  x: number
  y: number
  color: string
  label: string
  idx: number
}

function BlobHandle({ x, y, color, label }: BlobHandleProps) {
  const SIZE = 72
  return (
    <div
      className="absolute flex items-center justify-center rounded-full pointer-events-none"
      style={{
        left:      `${x * 100}%`,
        top:       `${y * 100}%`,
        width:     SIZE,
        height:    SIZE,
        transform: 'translate(-50%, -50%)',
        background: color,
        boxShadow: `0 0 24px 8px ${color}, 0 0 48px 16px ${color.replace('0.85', '0.35')}`,
        border:    '3px solid rgba(255,255,255,0.8)',
        fontSize:  32,
        zIndex:    20,
      }}
    >
      <span style={{ lineHeight: 1, userSelect: 'none' }}>{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function KidsPaintMixerPage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const overlayRef   = useRef<HTMLCanvasElement>(null)
  const interactRef  = useRef<HTMLDivElement>(null)
  const glRef        = useRef<GLRenderer | null>(null)
  const audioRef     = useRef<AudioEngine | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const rafRef       = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const blobsRef     = useRef<PaintBlob[]>(makeInitialBlobs())
  const dragRef      = useRef<{ idx: number; offX: number; offY: number } | null>(null)
  const lastInteract = useRef<number>(Date.now())
  const lastSample   = useRef<number>(0)
  const glOkRef      = useRef<boolean>(true)

  const [started,     setStarted]     = useState<boolean>(false)
  const [webglError,  setWebglError]  = useState<boolean>(false)
  const [audioError,  setAudioError]  = useState<boolean>(false)
  const [blobPos, setBlobPos] = useState<Array<{ x: number; y: number }>>([
    { x: 0.25, y: 0.30 },
    { x: 0.50, y: 0.72 },
    { x: 0.75, y: 0.30 },
  ])

  // ── Canvas resize ───────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = Math.round(parent.clientWidth  * dpr)
    canvas.height = Math.round(parent.clientHeight * dpr)
    canvas.style.width  = parent.clientWidth  + 'px'
    canvas.style.height = parent.clientHeight + 'px'
    const ov = overlayRef.current
    if (ov) {
      ov.width  = canvas.width
      ov.height = canvas.height
      ov.style.width  = canvas.style.width
      ov.style.height = canvas.style.height
    }
  }, [])

  // ── Coordinate helper ───────────────────────────────────────────────────────
  const canvasNorm = useCallback((clientX: number, clientY: number): [number, number] => {
    const el = canvasRef.current ?? interactRef.current
    if (!el) return [0.5, 0.5]
    const rect = el.getBoundingClientRect()
    return [
      (clientX - rect.left) / rect.width,
      (clientY - rect.top)  / rect.height,
    ]
  }, [])

  // ── Render loop ─────────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const idleMs = Date.now() - lastInteract.current

    // Auto-drift when idle
    if (idleMs > 1500) {
      blobsRef.current = driftBlobs(blobsRef.current, idleMs)
    }

    const gl  = glRef.current
    const t   = (performance.now() - startTimeRef.current) * 0.001

    if (gl && glOkRef.current) {
      gl.draw(blobsRef.current, t)
    } else if (!glOkRef.current) {
      const ov = overlayRef.current
      if (ov) sampleCSSColor(ov, blobsRef.current)
    }

    // Sample color → audio (~20 Hz)
    const now = performance.now()
    if (audioCtxRef.current && audioRef.current && now - lastSample.current > 50) {
      lastSample.current = now
      let sr = 200, sg = 180, sb = 140
      if (gl && glOkRef.current) {
        const cx = blobsRef.current.reduce((s: number, b: PaintBlob) => s + b.x, 0) / 3
        const cy = blobsRef.current.reduce((s: number, b: PaintBlob) => s + b.y, 0) / 3
        const sampled = gl.sampleColor(cx, cy, 0.08)
        sr = sampled[0]; sg = sampled[1]; sb = sampled[2]
      } else {
        const ov = overlayRef.current
        if (ov) {
          const sampled = sampleCSSColor(ov, blobsRef.current)
          sr = sampled[0]; sg = sampled[1]; sb = sampled[2]
        }
      }
      const [h, s, v] = rgbToHSV(sr, sg, sb)
      audioRef.current.setColor(h, s, v)
    }

    // Sync drag handle positions (~30 fps is fine)
    setBlobPos(blobsRef.current.map((b: PaintBlob) => ({ x: b.x, y: b.y })))

    rafRef.current = requestAnimationFrame(runLoop)
  }, [])

  // ── Start (iOS gesture gate) ────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (started) return

    // Resize + create WebGL renderer
    const canvas = canvasRef.current
    if (canvas) {
      resizeCanvas()
      try {
        const renderer = createGLRenderer(canvas)
        glRef.current  = renderer
        glOkRef.current = true
      } catch {
        glOkRef.current = false
        setWebglError(true)
      }
    }

    // Audio context (must be inside gesture handler for iOS)
    try {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      audioRef.current = createAudioEngine(ctx)
    } catch {
      setAudioError(true)
    }

    startTimeRef.current = performance.now()
    setStarted(true)
    lastInteract.current = Date.now()
    rafRef.current = requestAnimationFrame(runLoop)
  }, [started, resizeCanvas, runLoop])

  // ── Native pointer events (attached via useEffect) ────────────────────────
  useEffect(() => {
    const el = interactRef.current
    if (!el) return

    const down = (e: PointerEvent) => {
      if (!started) return
      const [nx, ny] = canvasNorm(e.clientX, e.clientY)
      const blobs = blobsRef.current
      let best = 0, bestD = Infinity
      blobs.forEach((b: PaintBlob, i: number) => {
        const d = Math.hypot(nx - b.x, ny - b.y)
        if (d < bestD) { bestD = d; best = i }
      })
      const b = blobs[best]
      dragRef.current = { idx: best, offX: nx - b.x, offY: ny - b.y }
      el.setPointerCapture(e.pointerId)
      lastInteract.current = Date.now()
    }

    const move = (e: PointerEvent) => {
      if (!dragRef.current || !started) return
      const [nx, ny] = canvasNorm(e.clientX, e.clientY)
      const { idx, offX, offY } = dragRef.current
      const blobs = [...blobsRef.current]
      const b = blobs[idx]
      const margin = b.r * 0.3
      blobs[idx] = {
        ...b,
        x:  Math.max(margin, Math.min(1 - margin, nx - offX)),
        y:  Math.max(margin, Math.min(1 - margin, ny - offY)),
        vx: 0,
        vy: 0,
      }
      blobsRef.current = blobs
      lastInteract.current = Date.now()
    }

    const up = () => { dragRef.current = null }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup',   up)
    el.addEventListener('pointerleave', up)

    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup',   up)
      el.removeEventListener('pointerleave', up)
    }
  }, [started, canvasNorm])

  // ── Resize handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      glRef.current?.destroy()
      glRef.current = null
      audioRef.current?.close()
      audioRef.current = null
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-zinc-900 flex flex-col overflow-hidden select-none touch-none">

      {/* Header */}
      <div className="z-10 flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-sm flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground leading-tight">Paint Mixer</h1>
          <p className="text-base text-muted-foreground">Mix the paints — the color you make is the music you hear</p>
        </div>
        {(webglError || audioError) && (
          <p className="text-violet-300 text-sm ml-4 max-w-xs">
            {webglError ? 'WebGL2 unavailable — using CSS blend mode. ' : ''}
            {audioError ? 'Audio unavailable.' : ''}
          </p>
        )}
      </div>

      {/* Canvas area */}
      <div
        ref={interactRef}
        className="relative flex-1 overflow-hidden cursor-none"
        style={{ touchAction: 'none' }}
      >
        {/* WebGL canvas (always present; hidden until started) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: started && glOkRef.current ? 'block' : 'none' }}
        />

        {/* CSS fallback canvas */}
        {webglError && (
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full"
          />
        )}

        {/* Pre-start: paper background with decorative blobs + Start button */}
        {!started && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#faf5e8 0%,#f0ead5 100%)' }}
          >
            {/* Decorative blob previews */}
            {makeInitialBlobs().map((b: PaintBlob, i: number) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left:       `${b.x * 100}%`,
                  top:        `${b.y * 100}%`,
                  width:      `${b.r * 2 * 100}%`,
                  paddingTop: `${b.r * 2 * 100}%`,
                  transform:  'translate(-50%, -50%)',
                  background: `radial-gradient(circle, ${CSS_BLOB_COLORS[i]}dd 0%, ${CSS_BLOB_COLORS[i]}66 50%, transparent 75%)`,
                  filter:     'blur(8px)',
                  opacity:    0.7,
                }}
              />
            ))}
            {/* Start button — large for kids */}
            <button
              onClick={handleStart}
              className="relative z-10 flex flex-col items-center gap-3 bg-muted hover:bg-card rounded-3xl px-10 py-6 shadow-2xl transition-transform active:scale-95"
              style={{ minHeight: 64, minWidth: 200 }}
            >
              <span className="text-5xl select-none">🎨</span>
              <span className="text-2xl font-bold text-zinc-800">Start Painting!</span>
              <span className="text-base text-zinc-600">Drag the blobs to mix colors</span>
            </button>
          </div>
        )}

        {/* Drag handles — shown after start */}
        {started && blobPos.map((pos: { x: number; y: number }, i: number) => (
          <BlobHandle
            key={i}
            x={pos.x}
            y={pos.y}
            color={BLOB_COLORS[i]}
            label={BLOB_LABELS[i]}
            idx={i}
          />
        ))}
      </div>

      {/* Footer hint */}
      {started && (
        <div className="z-10 text-center py-2 bg-zinc-900/60 text-muted-foreground text-sm flex-shrink-0">
          Drag the blobs · mix the paint · hear the chord change
        </div>
      )}
    </div>
  )
}
