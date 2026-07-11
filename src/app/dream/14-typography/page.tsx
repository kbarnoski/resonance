'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMicAnalyser } from '../_shared/use-mic-analyser'

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],   // sub-bass — deep violet
  [32, 168, 220],  // bass — cyan
  [80, 220, 100],  // low-mid — green
  [240, 220, 70],  // mid — yellow
  [255, 150, 40],  // high-mid — orange
  [255, 60, 120],  // high — magenta/red
]

const PHRASES = [
  'RESONANCE',
  'SOUND INTO LIGHT',
  'BODY OF MUSIC',
  'EACH NOTE A WAVE',
  'FREQUENCIES',
  'OF BEING',
]

const PHRASE_MS = 8000

interface Glyph {
  char: string
  band: number
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  phase: number
}

function targetFontSize(phrase: string, w: number): number {
  return Math.min(80, Math.max(36, (w * 0.82) / (phrase.length * 0.62)))
}

function spawnGlyphs(phrase: string, w: number, h: number): Glyph[] {
  const sz = targetFontSize(phrase, w)
  const cw = sz * 0.62
  const startX = (w - phrase.length * cw) / 2 + cw / 2

  return phrase.split('').map((char, i) => {
    const a = Math.random() * Math.PI * 2
    const dist = 180 + Math.random() * 260
    return {
      char,
      band: i % 6,
      x: w / 2 + Math.cos(a) * dist,
      y: h / 2 + Math.sin(a) * dist,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      tx: startX + i * cw,
      ty: h / 2,
      phase: Math.random() * Math.PI * 2,
    }
  })
}

export default function TypographyDream() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.82,
    gain: 1.8,
    onsetThreshold: 1.65,
  })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef(0)
  const glyphsRef = useRef<Glyph[]>([])
  const phraseIdxRef = useRef(0)
  const lastPhraseRef = useRef(0)
  const lastOnsetRef = useRef(0)
  const [demoMode, setDemoMode] = useState(false)
  const [phraseLabel, setPhraseLabel] = useState(PHRASES[0])

  const active = demoMode || running

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.scale(dpr, dpr)
      glyphsRef.current = spawnGlyphs(PHRASES[phraseIdxRef.current], w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    phraseIdxRef.current = 0
    lastPhraseRef.current = performance.now()
    lastOnsetRef.current = 0
    glyphsRef.current = spawnGlyphs(PHRASES[0], w, h)
    setPhraseLabel(PHRASES[0])

    const tick = (now: number) => {
      let bands: number[]
      let onset = false

      if (demoMode) {
        const t = now * 0.001
        bands = [
          Math.max(0, Math.min(1, 0.30 + 0.26 * Math.sin(t * 0.72))),
          Math.max(0, Math.min(1, 0.42 + 0.33 * Math.sin(t * 1.08 + 0.9))),
          Math.max(0, Math.min(1, 0.24 + 0.21 * Math.sin(t * 1.50 + 1.8))),
          Math.max(0, Math.min(1, 0.27 + 0.21 * Math.sin(t * 1.92 + 2.7))),
          Math.max(0, Math.min(1, 0.20 + 0.17 * Math.sin(t * 2.38 + 3.6))),
          Math.max(0, Math.min(1, 0.22 + 0.15 * Math.sin(t * 2.98 + 4.5))),
        ]
        // Synthetic beat ~76 BPM with slight jitter
        if (now - lastOnsetRef.current > 790 + Math.sin(now * 0.003) * 55) {
          onset = true
          lastOnsetRef.current = now
        }
      } else {
        const frame = getFrame()
        if (frame) {
          bands = frame.bands
          onset = frame.onset
        } else {
          bands = [0, 0, 0, 0, 0, 0]
        }
      }

      // Phrase cycling
      if (now - lastPhraseRef.current > PHRASE_MS) {
        phraseIdxRef.current = (phraseIdxRef.current + 1) % PHRASES.length
        setPhraseLabel(PHRASES[phraseIdxRef.current])
        glyphsRef.current = spawnGlyphs(PHRASES[phraseIdxRef.current], w, h)
        lastPhraseRef.current = now
      }

      // Physics
      const t = now * 0.001
      const glyphs = glyphsRef.current
      for (const g of glyphs) {
        // Spring toward target
        const dx = g.tx - g.x
        const dy = g.ty - g.y
        g.vx = g.vx * 0.76 + dx * 0.066
        g.vy = g.vy * 0.76 + dy * 0.066
        // Drift noise (perpetual gentle float)
        g.vx += Math.sin(t * 0.88 + g.phase) * 0.28
        g.vy += Math.cos(t * 1.12 + g.phase + 1.3) * 0.28
        // Band scatter force
        const e = bands[g.band]
        if (e > 0.22) {
          const f = (e - 0.22) * 14
          g.vx += (Math.random() - 0.5) * f
          g.vy += (Math.random() - 0.5) * f
        }
        // Onset: burst outward from center
        if (onset) {
          const ang = Math.atan2(g.y - h * 0.5, g.x - w * 0.5)
          g.vx += Math.cos(ang) * 9
          g.vy += Math.sin(ang) * 9
        }
        g.x += g.vx
        g.y += g.vy
      }

      // Motion-blur trail
      ctx.fillStyle = 'rgba(0,0,0,0.20)'
      ctx.fillRect(0, 0, w, h)

      const phrase = PHRASES[phraseIdxRef.current]
      const fSize = targetFontSize(phrase, w)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Render by band to batch shadow + fill state changes (6 passes)
      for (let b = 0; b < 6; b++) {
        const bandColor = BAND_COLORS[b]
        const cr = bandColor[0]
        const cg = bandColor[1]
        const cb = bandColor[2]
        const e = bands[b]
        ctx.shadowBlur = 4 + e * 28
        ctx.shadowColor = `rgb(${cr},${cg},${cb})`
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`
        ctx.globalAlpha = 0.7 + e * 0.3

        for (const g of glyphs) {
          if (g.band !== b || g.char === ' ') continue
          const scale = 1 + e * 0.50
          ctx.font = `${Math.round(fSize * scale)}px monospace`
          ctx.fillText(g.char, g.x, g.y)
        }
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [active, demoMode, getFrame])

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 3rem)' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#000' }}
      />

      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Kinetic Typography</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
            Letters float in frequency space. Each letter belongs to a
            musical band — bass letters scatter on low hits, treble letters
            shimmer with high frequencies. Phrases assemble from scatter,
            then cycle every few seconds.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDemoMode(true)}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={start}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start mic
            </button>
          </div>
          {error && (
            <p className="mt-4 text-xs text-violet-300/80 max-w-sm">{error}</p>
          )}
          <Link href="/dream" className="mt-12 text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {active && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-muted-foreground/70 pointer-events-none">
            {phraseLabel}
          </div>
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              onClick={() => { setDemoMode(false); stop() }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
          </div>
          <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/70 tracking-wider pointer-events-none">
            {demoMode ? 'DEMO' : 'MIC'}
          </div>
        </>
      )}
    </div>
  )
}
