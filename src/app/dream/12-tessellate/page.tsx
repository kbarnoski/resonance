'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

// ── grid constants ────────────────────────────────────────────────────────────
const COLS = 40
const ROWS = 28
const N = COLS * ROWS

// ── audio pipeline ────────────────────────────────────────────────────────────
type AudioState = {
  ctx: AudioContext
  analyser: AnalyserNode
  freqData: Uint8Array<ArrayBuffer>
  stream?: MediaStream
}

function buildAnalyser(ctx: AudioContext): AnalyserNode {
  const an = ctx.createAnalyser()
  an.fftSize = 1024
  an.smoothingTimeConstant = 0.5
  return an
}

function launchDemoAudio(): AudioState {
  const ctx = new AudioContext()
  const analyser = buildAnalyser(ctx)

  // Bass oscillator has a fast LFO to create rhythmic energy pulses
  const configs: Array<[number, OscillatorType, number, number]> = [
    [55,   'sine',     0.30, 1.25],
    [110,  'sine',     0.18, 0.29],
    [440,  'triangle', 0.14, 0.37],
    [880,  'triangle', 0.10, 0.47],
    [3300, 'sawtooth', 0.08, 0.59],
    [9000, 'sawtooth', 0.05, 0.71],
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
    lfoGain.gain.value = amp * 0.7
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    osc.connect(gain)
    gain.connect(analyser)
    lfo.start()
    osc.start()
  })
  // not connected to destination — silent demo

  return {
    ctx,
    analyser,
    freqData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
  }
}

async function launchMicAudio(): Promise<AudioState> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = new AudioContext()
  const analyser = buildAnalyser(ctx)
  ctx.createMediaStreamSource(stream).connect(analyser)
  return {
    ctx,
    analyser,
    freqData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
    stream,
  }
}

// ── component ─────────────────────────────────────────────────────────────────
export default function TessellatePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const audioRef = useRef<AudioState | null>(null)

  // Tile orientation: 0 = A (top-left + bottom-right corner arcs)
  //                   1 = B (top-right + bottom-left corner arcs)
  const gridRef = useRef(new Uint8Array(N))
  // Flash: per-tile brightness boost, decays 0→1→0 after flip
  const flashRef = useRef(new Float32Array(N))

  const [mode, setMode] = useState<'idle' | 'demo' | 'mic'>('idle')
  const [micError, setMicError] = useState<string | null>(null)

  // Onset detection refs
  const smoothedBassRef = useRef(0)
  const fluxHistRef = useRef<number[]>([])
  const lastOnsetRef = useRef(0)
  // Slow hue rotation
  const hueRef = useRef(200)

  const initGrid = useCallback(() => {
    const g = gridRef.current
    for (let i = 0; i < N; i++) g[i] = Math.random() < 0.5 ? 0 : 1
    flashRef.current.fill(0)
    smoothedBassRef.current = 0
    fluxHistRef.current = []
    lastOnsetRef.current = 0
  }, [])

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    const audio = audioRef.current
    if (audio) {
      audio.stream?.getTracks().forEach(t => t.stop())
      void audio.ctx.close()
      audioRef.current = null
    }
    setMode('idle')
  }, [])

  const reshuffle = useCallback(() => {
    const g = gridRef.current
    const fl = flashRef.current
    for (let i = 0; i < N; i++) {
      g[i] = Math.random() < 0.5 ? 0 : 1
      fl[i] = 0.8
    }
  }, [])

  useEffect(() => {
    if (mode === 'idle') return
    initGrid()

    const canvas = canvasRef.current
    if (!canvas) return
    const c2d = canvas.getContext('2d')
    if (!c2d) return

    let W = 0
    let H = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      c2d.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTime = 0
    let demoLastBeat = 0  // timer-based beat for demo mode

    const tick = (now: number) => {
      if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(tick); return }
      const audio = audioRef.current
      if (!audio) { animRef.current = requestAnimationFrame(tick); return }

      const dt = Math.min((now - lastTime) * 0.001, 0.1)
      lastTime = now

      // ── FFT ──────────────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audio.analyser.getByteFrequencyData(audio.freqData as any)
      const buf = audio.freqData
      const bins = buf.length
      const binHz = audio.ctx.sampleRate / audio.analyser.fftSize

      // Bass energy (30–200 Hz)
      const bassLo = Math.max(0, Math.floor(30 / binHz))
      const bassHi = Math.min(bins - 1, Math.ceil(200 / binHz))
      let bassSum = 0
      for (let b = bassLo; b <= bassHi; b++) bassSum += buf[b]
      const bassEnergy = bassSum / ((bassHi - bassLo + 1) * 255)

      // Mid energy (500–3000 Hz) — drives saturation
      const midLo = Math.floor(500 / binHz)
      const midHi = Math.min(bins - 1, Math.ceil(3000 / binHz))
      let midSum = 0
      for (let b = midLo; b <= midHi; b++) midSum += buf[b]
      const midEnergy = midSum / ((midHi - midLo + 1) * 255)

      // Overall amplitude — drives lightness
      let totalSum = 0
      for (let b = 0; b < bins; b++) totalSum += buf[b]
      const amplitude = totalSum / (bins * 255)

      // ── Onset detection ───────────────────────────────────────────────────────
      const flux = Math.max(0, bassEnergy - smoothedBassRef.current * 0.88)
      smoothedBassRef.current = smoothedBassRef.current * 0.85 + bassEnergy * 0.15
      const hist = fluxHistRef.current
      hist.push(flux)
      if (hist.length > 43) hist.shift()
      const avgFlux = hist.reduce((acc, v) => acc + v, 0) / Math.max(1, hist.length)
      let onset = false
      if (flux > avgFlux * 1.65 && flux > 0.03 && now - lastOnsetRef.current > 130) {
        onset = true
        lastOnsetRef.current = now
      }

      // Demo-mode backup beat: fires at ~85 BPM if onset detector is quiet
      if (mode === 'demo' && now - demoLastBeat > 700) {
        demoLastBeat = now
        onset = true
      }

      // ── Tile flips ────────────────────────────────────────────────────────────
      const grid = gridRef.current
      const flash = flashRef.current

      if (onset) {
        // Mass flip ~12% of tiles
        for (let i = 0; i < N; i++) {
          if (Math.random() < 0.12) {
            grid[i] ^= 1
            flash[i] = 1.0
          }
        }
      }

      // Continuous bass-driven drizzle (subtle, quadratic scaling)
      const drizzleP = bassEnergy * bassEnergy * 0.055
      if (drizzleP > 0.0006) {
        for (let i = 0; i < N; i++) {
          if (Math.random() < drizzleP) {
            grid[i] ^= 1
            flash[i] = Math.max(flash[i], 0.55)
          }
        }
      }

      // Decay flash brightness
      const decay = dt / 0.4
      for (let i = 0; i < N; i++) {
        if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - decay)
      }

      // ── Hue rotation ─────────────────────────────────────────────────────────
      hueRef.current = (hueRef.current + dt * 9) % 360  // one rotation per 40s

      // ── Render ───────────────────────────────────────────────────────────────
      c2d.fillStyle = '#050510'
      c2d.fillRect(0, 0, W, H)

      const tw = W / COLS
      const th = H / ROWS
      const rx = tw / 2
      const ry = th / 2
      const hue = hueRef.current
      const compHue = (hue + 165) % 360
      const sat = Math.round(38 + midEnergy * 62)
      const lit = Math.round(22 + amplitude * 52)
      const lineW = Math.max(0.7, Math.min(rx, ry) * 0.18)

      // Build two paths — one per tile orientation — for efficient batch rendering.
      // Arcs use ellipse() so they always connect at edge midpoints on non-square tiles.
      const path0 = new Path2D()
      const path1 = new Path2D()

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const i = row * COLS + col
          const tx = col * tw
          const ty = row * th
          if (grid[i] === 0) {
            // Type A: arc at top-left corner (top-mid → left-mid)
            path0.moveTo(tx + rx, ty)
            path0.ellipse(tx, ty, rx, ry, 0, 0, Math.PI / 2)
            // Type A: arc at bottom-right corner (bottom-mid → right-mid)
            path0.moveTo(tx + rx, ty + th)
            path0.ellipse(tx + tw, ty + th, rx, ry, 0, Math.PI, 3 * Math.PI / 2)
          } else {
            // Type B: arc at top-right corner (right-mid → top-mid)
            path1.moveTo(tx + tw, ty + ry)
            path1.ellipse(tx + tw, ty, rx, ry, 0, Math.PI / 2, Math.PI)
            // Type B: arc at bottom-left corner (left-mid → bottom-mid)
            path1.moveTo(tx, ty + ry)
            path1.ellipse(tx, ty + th, rx, ry, 0, 3 * Math.PI / 2, 2 * Math.PI)
          }
        }
      }

      c2d.lineWidth = lineW
      c2d.strokeStyle = `hsl(${Math.round(hue)},${sat}%,${lit}%)`
      c2d.stroke(path0)
      c2d.strokeStyle = `hsl(${Math.round(compHue)},${sat}%,${lit}%)`
      c2d.stroke(path1)

      // Flash overlay: white highlight on recently-flipped tiles
      c2d.lineWidth = lineW * 1.15
      for (let i = 0; i < N; i++) {
        if (flash[i] < 0.03) continue
        const row = Math.floor(i / COLS)
        const col = i % COLS
        const tx = col * tw
        const ty = row * th
        c2d.globalAlpha = flash[i] * 0.72
        c2d.strokeStyle = '#ddeeff'
        c2d.beginPath()
        if (grid[i] === 0) {
          c2d.moveTo(tx + rx, ty)
          c2d.ellipse(tx, ty, rx, ry, 0, 0, Math.PI / 2)
          c2d.moveTo(tx + rx, ty + th)
          c2d.ellipse(tx + tw, ty + th, rx, ry, 0, Math.PI, 3 * Math.PI / 2)
        } else {
          c2d.moveTo(tx + tw, ty + ry)
          c2d.ellipse(tx + tw, ty, rx, ry, 0, Math.PI / 2, Math.PI)
          c2d.moveTo(tx, ty + ry)
          c2d.ellipse(tx, ty + th, rx, ry, 0, 3 * Math.PI / 2, 2 * Math.PI)
        }
        c2d.stroke()
      }
      c2d.globalAlpha = 1

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [mode, initGrid])

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
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Tessellate</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            A 40×28 grid of Truchet tiles rewires on every beat. Each tile holds one of two
            quarter-arc orientations; together they form flowing curves across the whole grid.
            On a bass hit, 12% of tiles flip simultaneously — the topology rewires in a flash.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-sm mb-8 leading-relaxed">
            Two complementary arc colors rotate through the spectrum. Mids control
            saturation. Flipped tiles light white then fade.
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
            <div>TESSELLATE</div>
            <div className="text-muted-foreground/70">{COLS}×{ROWS} Truchet grid</div>
          </div>

          <div className="absolute top-4 right-4 font-mono text-[10px] tracking-wider text-right pointer-events-none">
            {mode === 'mic' && <div className="text-violet-300/70">MIC LIVE</div>}
            {mode === 'demo' && <div className="text-muted-foreground/70">DEMO</div>}
          </div>

          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              onClick={reshuffle}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded transition"
            >
              reshuffle
            </button>
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
