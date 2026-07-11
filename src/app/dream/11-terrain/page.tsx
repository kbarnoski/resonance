'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

// ── grid constants ───────────────────────────────────────────────────────────
const COLS = 64   // frequency columns (log-spaced 30 Hz → ~20 kHz)
const ROWS = 80   // time-history depth (frames)

// ── audio pipeline ───────────────────────────────────────────────────────────
type AudioState = {
  ctx: AudioContext
  analyser: AnalyserNode
  freqData: Uint8Array<ArrayBuffer>
  binMap: number[]
  stream?: MediaStream
}

// Log-frequency mapping: column c → FFT bin index (30 Hz → nyquist, log scale)
function buildBinMap(binCount: number, nyquist: number): number[] {
  return Array.from({ length: COLS }, (_, c) => {
    const t = c / (COLS - 1)
    const freq = 30 * Math.pow(nyquist / 30, t)
    return Math.min(binCount - 1, Math.round((freq / nyquist) * binCount))
  })
}

function extractRow(freqData: Uint8Array<ArrayBuffer>, binMap: number[]): Float32Array {
  const row = new Float32Array(COLS)
  for (let c = 0; c < COLS; c++) row[c] = freqData[binMap[c]] / 255
  return row
}

function makeAnalyser(ctx: AudioContext): AnalyserNode {
  const an = ctx.createAnalyser()
  an.fftSize = 2048
  an.smoothingTimeConstant = 0.78
  return an
}

function launchDemoAudio(): AudioState {
  const ctx = new AudioContext()
  const analyser = makeAnalyser(ctx)

  // 6 oscillators at representative frequencies with slow amplitude LFOs
  const configs: Array<[number, OscillatorType, number, number]> = [
    [55,   'sine',     0.22, 0.19],
    [110,  'sine',     0.18, 0.27],
    [440,  'triangle', 0.14, 0.16],
    [880,  'triangle', 0.12, 0.38],
    [3300, 'sawtooth', 0.09, 0.51],
    [9000, 'sawtooth', 0.06, 0.63],
  ]

  configs.forEach(([freq, type, amp, lfoRate]) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()

    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = amp
    lfo.frequency.value = lfoRate
    lfoGain.gain.value = amp * 0.6

    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    osc.connect(gain)
    gain.connect(analyser)
    lfo.start()
    osc.start()
  })
  // analyser not connected to destination — produces no audible output

  const nyquist = ctx.sampleRate / 2
  const binMap = buildBinMap(analyser.frequencyBinCount, nyquist)
  return { ctx, analyser, freqData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)), binMap }
}

async function launchMicAudio(): Promise<AudioState> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = new AudioContext()
  const analyser = makeAnalyser(ctx)
  ctx.createMediaStreamSource(stream).connect(analyser)
  // not connected to destination — no echo

  const nyquist = ctx.sampleRate / 2
  const binMap = buildBinMap(analyser.frequencyBinCount, nyquist)
  return { ctx, analyser, freqData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)), binMap, stream }
}

// ── rendering helpers ────────────────────────────────────────────────────────
// Simplified fake perspective: scale factor s = 1 (newest/nearest) → ~0 (oldest/horizon)
// This produces the same visual as a camera above the terrain looking forward.

function terrainScale(r: number): number {
  return 1 - r / ROWS
}

function terrainX(col: number, r: number, cx: number, W: number): number {
  return cx + (col - COLS / 2) * (W / COLS) * 1.45 * terrainScale(r)
}

function terrainY(amp: number, r: number, cy: number, H: number): number {
  const s = terrainScale(r)
  // Ground at cy + 0.44*H*s; peaks rise above by 0.37*H*s
  return cy + H * 0.44 * s - amp * H * 0.37 * s
}

// Frequency-based hue: bass=blue, mid=teal, treble=orange
function ridgeColor(col: number, amp: number, r: number): string {
  const t = col / (COLS - 1)
  const depth = Math.pow(1 - r / ROWS, 0.42)
  let re: number, gr: number, bl: number
  if (t < 0.33) {
    const s = t / 0.33
    re = Math.round(18 + s * 44); gr = Math.round(20 + s * 100); bl = Math.round(185 + s * 55)
  } else if (t < 0.67) {
    const s = (t - 0.33) / 0.34
    re = Math.round(62 + s * 178); gr = Math.round(120 + s * 78); bl = Math.round(240 - s * 215)
  } else {
    const s = (t - 0.67) / 0.33
    re = Math.round(240 + s * 15); gr = Math.round(198 - s * 155); bl = 20
  }
  const bright = (0.08 + amp * 0.92) * depth
  return `rgb(${Math.round(re * bright)},${Math.round(gr * bright)},${Math.round(bl * bright)})`
}

// ── component ────────────────────────────────────────────────────────────────
export default function TerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const audioRef = useRef<AudioState | null>(null)
  const gridRef = useRef<Float32Array[]>(
    Array.from({ length: ROWS }, () => new Float32Array(COLS))
  )

  const [mode, setMode] = useState<'idle' | 'demo' | 'mic'>('idle')
  const [micError, setMicError] = useState<string | null>(null)
  const [peakLabel, setPeakLabel] = useState('')

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    const audio = audioRef.current
    if (audio) {
      audio.stream?.getTracks().forEach(t => t.stop())
      void audio.ctx.close()
      audioRef.current = null
    }
    gridRef.current = Array.from({ length: ROWS }, () => new Float32Array(COLS))
    setMode('idle')
    setPeakLabel('')
  }, [])

  // Render loop — restarts on mode change
  useEffect(() => {
    if (mode === 'idle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const c2d = canvas.getContext('2d')
    if (!c2d) return

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`
      c2d.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    let hudAt = 0

    const tick = (now: number) => {
      if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(tick); return }
      const audio = audioRef.current
      if (!audio) { animRef.current = requestAnimationFrame(tick); return }

      // Sample FFT → new terrain row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audio.analyser.getByteFrequencyData(audio.freqData as any)
      const newRow = extractRow(audio.freqData, audio.binMap)

      // Shift history: row 0 = newest (closest)
      const grid = gridRef.current
      for (let r = ROWS - 1; r > 0; r--) grid[r] = grid[r - 1]
      grid[0] = newRow

      const cx = W / 2
      const cy = H * 0.35

      // Clear
      c2d.fillStyle = '#050510'
      c2d.fillRect(0, 0, W, H)

      // Paint terrain back → front (painter's algorithm)
      for (let r = ROWS - 1; r >= 0; r--) {
        const s = terrainScale(r)
        if (s < 0.006) continue  // skip invisible horizon rows

        const rowData = grid[r]

        // Pre-project all columns for this row
        const xs = new Float32Array(COLS)
        const ys = new Float32Array(COLS)
        for (let c = 0; c < COLS; c++) {
          xs[c] = terrainX(c, r, cx, W)
          ys[c] = terrainY(rowData[c], r, cy, H)
        }

        // Fill from ridge to bottom of screen — occludes rows behind
        c2d.beginPath()
        c2d.moveTo(xs[0], H + 4)
        c2d.lineTo(xs[0], ys[0])
        for (let c = 1; c < COLS; c++) c2d.lineTo(xs[c], ys[c])
        c2d.lineTo(xs[COLS - 1], H + 4)
        c2d.closePath()
        c2d.fillStyle = '#050510'
        c2d.fill()

        // Colored ridge line segments
        for (let c = 0; c < COLS - 1; c++) {
          const amp = (rowData[c] + rowData[c + 1]) * 0.5
          if (amp < 0.015) continue
          c2d.beginPath()
          c2d.moveTo(xs[c], ys[c])
          c2d.lineTo(xs[c + 1], ys[c + 1])
          c2d.strokeStyle = ridgeColor(c, amp, r)
          c2d.lineWidth = 0.5 + amp * 2.2
          c2d.stroke()
        }
      }

      // HUD at ~8 Hz
      if (now - hudAt > 130) {
        hudAt = now
        const newest = grid[0]
        let peakC = 0, peakA = 0
        for (let c = 0; c < COLS; c++) {
          if (newest[c] > peakA) { peakA = newest[c]; peakC = c }
        }
        if (peakA > 0.1) {
          const t = peakC / (COLS - 1)
          const nyq = audio.ctx.sampleRate / 2
          const hz = Math.round(30 * Math.pow(nyq / 30, t))
          setPeakLabel(hz > 999 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz} Hz`)
        } else {
          setPeakLabel('')
        }
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [mode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.stream?.getTracks().forEach(t => t.stop())
        void audio.ctx.close()
      }
    }
  }, [])

  const handleDemo = useCallback(() => {
    setMicError(null)
    try {
      audioRef.current = launchDemoAudio()
      setMode('demo')
    } catch {
      setMicError('Could not create audio context.')
    }
  }, [])

  const handleMic = useCallback(() => {
    setMicError(null)
    void launchMicAudio()
      .then(audio => { audioRef.current = audio; setMode('mic') })
      .catch((e: unknown) => {
        setMicError(e instanceof Error ? e.message : 'Microphone unavailable.')
      })
  }, [])

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 3rem)' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#050510' }}
      />

      {mode === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Spectrogram Terrain</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            Your audio history unfolds as a 3D landscape. Bass frequencies form mountains;
            treble draws bright high ridges. Time flows toward you — the past recedes to
            the horizon.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-sm mb-8 leading-relaxed">
            Blue = bass · Teal = mids · Orange–white = treble. Louder = taller peaks.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={handleDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={handleMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              Start mic
            </button>
          </div>
          {micError && (
            <p className="mt-4 text-xs text-violet-300/80 max-w-sm">{micError}</p>
          )}
          <Link href="/dream" className="mt-12 text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== 'idle' && (
        <>
          <div className="absolute top-4 left-4 font-mono text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 pointer-events-none">
            <div>SPECTROGRAM TERRAIN</div>
            <div className="text-muted-foreground/70">30 Hz – 20 kHz · {ROWS} frames</div>
            {peakLabel && <div className="text-violet-300/60 pt-0.5">peak {peakLabel}</div>}
          </div>

          <div className="absolute top-4 right-4 font-mono text-[10px] tracking-wider text-right pointer-events-none">
            {mode === 'mic' && <div className="text-violet-300/70">MIC LIVE</div>}
            {mode === 'demo' && <div className="text-muted-foreground/70">DEMO</div>}
          </div>

          <div className="absolute bottom-4 left-4 text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 pointer-events-none">
            <div><span className="text-violet-400">━</span> bass</div>
            <div><span className="text-violet-400">━</span> mids</div>
            <div><span className="text-violet-400">━</span> treble</div>
          </div>

          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              onClick={stopAll}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
