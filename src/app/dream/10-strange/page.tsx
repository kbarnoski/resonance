'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useMicAnalyser } from '../_shared/use-mic-analyser'

// Lorenz parameters — classic chaotic regime
const SIGMA_DEFAULT = 10
const RHO = 28
const BETA = 8 / 3
const DT = 0.005          // simulation timestep
const TRAIL_LEN = 3000    // how many points to keep
const STEPS_PER_FRAME = 3 // steps per animation frame (~180 steps/s at 60fps)

// Precomputed rotation constants: 35° around y, 15° around x
const COS_Y = Math.cos(0.611)
const SIN_Y = Math.sin(0.611)
const COS_X = Math.cos(0.262)
const SIN_X = Math.sin(0.262)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function mapRange(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  return outLo + (outHi - outLo) * clamp((v - inLo) / (inHi - inLo), 0, 1)
}

// Isometric 3D → 2D projection (y-rotation then x-rotation)
function project(
  x: number, y: number, z: number,
  cx: number, cy: number, scale: number
): [number, number] {
  const x1 = x * COS_Y + z * SIN_Y
  const z1 = -x * SIN_Y + z * COS_Y
  const y1 = y * COS_X - z1 * SIN_X
  return [cx + x1 * scale, cy - y1 * scale]
}

// Advance one Lorenz step — mutates pt in place
function advanceLorenz(pt: { x: number; y: number; z: number }, sigma: number): void {
  const dx = sigma * (pt.y - pt.x)
  const dy = pt.x * (RHO - pt.z) - pt.y
  const dz = pt.x * pt.y - BETA * pt.z
  pt.x += dx * DT
  pt.y += dy * DT
  pt.z += dz * DT
}

type AudioNodes = {
  ctx: AudioContext
  carrier: OscillatorNode
  modulator: OscillatorNode
  modGain: GainNode
  masterGain: GainNode
}

type TrailPoint = { x: number; y: number; z: number; wing: boolean }

export default function StrangePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const audioRef = useRef<AudioNodes | null>(null)
  const lorenzRef = useRef({
    x: 0.1, y: 0, z: 0,
    sigma: SIGMA_DEFAULT,
    trail: [] as TrailPoint[],
  })

  const [mode, setMode] = useState<'idle' | 'demo' | 'mic'>('idle')
  const [hud, setHud] = useState({
    x: 0, y: 0, z: 0,
    sigma: SIGMA_DEFAULT,
    wing: 'right',
    carrierHz: 0,
    modIdx: 0,
  })

  const { error: micError, start: startMic, stop: stopMic, getFrame } = useMicAnalyser({
    smoothing: 0.7,
    gain: 2.0,
    onsetThreshold: 1.6,
  })

  // Build the FM audio graph on first user gesture
  const buildAudioGraph = useCallback((): AudioNodes => {
    if (audioRef.current) return audioRef.current
    const ctx = new AudioContext()
    const modulator = ctx.createOscillator()
    const modGain = ctx.createGain()
    const carrier = ctx.createOscillator()
    const masterGain = ctx.createGain()

    modulator.type = 'sine'
    modulator.frequency.value = 200
    modGain.gain.value = 0

    carrier.type = 'sine'
    carrier.frequency.value = 220

    masterGain.gain.value = 0.28

    // FM chain: modulator → modGain → carrier.frequency param (FM deviation in Hz)
    modulator.connect(modGain)
    modGain.connect(carrier.frequency)
    carrier.connect(masterGain)
    masterGain.connect(ctx.destination)

    modulator.start()
    carrier.start()

    const nodes: AudioNodes = { ctx, carrier, modulator, modGain, masterGain }
    audioRef.current = nodes
    return nodes
  }, [])

  // Map Lorenz xyz to FM synth parameters — called every frame
  const applyFM = useCallback((x: number, y: number, z: number): void => {
    const audio = audioRef.current
    if (!audio) return
    const { ctx, carrier, modulator, modGain } = audio
    const now = ctx.currentTime
    // x → carrier frequency: left wing = low pitch, right wing = high pitch
    const cFreq = mapRange(x, -25, 25, 110, 880)
    // z → FM index: bottom of attractor = pure sine, top = rich harmonics
    const mIdx = mapRange(z, 0, 50, 0, 8)
    // |y| → modulator ratio: near center = simple ratio, far = complex
    const mRatio = mapRange(Math.abs(y), 0, 30, 0.5, 3.5)
    carrier.frequency.setTargetAtTime(cFreq, now, 0.04)
    modulator.frequency.setTargetAtTime(cFreq * mRatio, now, 0.04)
    // modGain = I * f_c so the FM index β = modGain / f_c = mIdx (dimensionless)
    modGain.gain.setTargetAtTime(mIdx * cFreq, now, 0.04)
  }, [])

  // Main animation loop — restarts when mode changes
  useEffect(() => {
    if (mode === 'idle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0
    let H = 0

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Reset attractor to near-origin (small perturbation seeds chaos)
    const lorenz = lorenzRef.current
    lorenz.x = 0.1
    lorenz.y = 0
    lorenz.z = 0
    lorenz.sigma = SIGMA_DEFAULT
    lorenz.trail = []

    let lastHudUpdate = 0

    const render = (now: number) => {
      if (W === 0 || H === 0) {
        animRef.current = requestAnimationFrame(render)
        return
      }

      // Mic mode: RMS amplitude widens σ — louder = more chaotic transitions
      if (mode === 'mic') {
        const frame = getFrame()
        if (frame) lorenz.sigma = SIGMA_DEFAULT + frame.amplitude * 8
      } else {
        lorenz.sigma = SIGMA_DEFAULT
      }

      // Advance Lorenz and record trail
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        advanceLorenz(lorenz, lorenz.sigma)
        lorenz.trail.push({ x: lorenz.x, y: lorenz.y, z: lorenz.z, wing: lorenz.x > 0 })
      }
      if (lorenz.trail.length > TRAIL_LEN) {
        lorenz.trail.splice(0, lorenz.trail.length - TRAIL_LEN)
      }

      applyFM(lorenz.x, lorenz.y, lorenz.z)

      // Canvas geometry — center z at 25 (attractor centroid), shift canvas center down
      const cx = W / 2
      const cy = H / 2 + 20
      const scale = Math.min(W, H) / 95

      // Fade background — slight persistence gives trail glow
      ctx.fillStyle = 'rgba(6, 6, 14, 0.2)'
      ctx.fillRect(0, 0, W, H)

      // Draw trail: oldest = dim, newest = bright; right wing = warm, left = cool
      const trail = lorenz.trail
      const tLen = trail.length
      for (let i = 1; i < tLen; i++) {
        const t = i / tLen   // 0 = oldest, 1 = newest
        const p0 = trail[i - 1]
        const p1 = trail[i]
        const [x0, y0] = project(p0.x, p0.y, p0.z - 25, cx, cy, scale)
        const [x1, y1] = project(p1.x, p1.y, p1.z - 25, cx, cy, scale)

        const alpha = clamp(t * 1.4, 0.02, 0.88)
        const bright = Math.floor(60 + t * 180)

        ctx.strokeStyle = p1.wing
          ? `rgba(255,${bright},${Math.floor(t * 60)},${alpha})`   // warm: orange → yellow
          : `rgba(${Math.floor(t * 60)},${bright},255,${alpha})`   // cool: blue → cyan
        ctx.lineWidth = 0.4 + t * 1.1
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }

      // Current position — bright white glow dot
      const [hx, hy] = project(lorenz.x, lorenz.y, lorenz.z - 25, cx, cy, scale)
      ctx.shadowColor = 'white'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(hx, hy, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.shadowBlur = 0

      // HUD update ~10 Hz (avoids React re-render bottleneck in tight loop)
      if (now - lastHudUpdate > 100) {
        lastHudUpdate = now
        const cFreq = mapRange(lorenz.x, -25, 25, 110, 880)
        const mIdx = mapRange(lorenz.z, 0, 50, 0, 8)
        setHud({
          x: lorenz.x,
          y: lorenz.y,
          z: lorenz.z,
          sigma: lorenz.sigma,
          wing: lorenz.x > 0 ? 'right' : 'left',
          carrierHz: Math.round(cFreq),
          modIdx: +mIdx.toFixed(2),
        })
      }

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [mode, getFrame, applyFM])

  // Close AudioContext on unmount
  useEffect(() => {
    return () => {
      void audioRef.current?.ctx.close()
      audioRef.current = null
    }
  }, [])

  const startDemo = useCallback(() => {
    const audio = buildAudioGraph()
    audio.masterGain.gain.setTargetAtTime(0.28, audio.ctx.currentTime, 0.1)
    setMode('demo')
  }, [buildAudioGraph])

  const startMicMode = useCallback(async () => {
    const audio = buildAudioGraph()
    audio.masterGain.gain.setTargetAtTime(0.28, audio.ctx.currentTime, 0.1)
    await startMic()
    setMode('mic')
  }, [buildAudioGraph, startMic])

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      const { ctx, masterGain } = audioRef.current
      masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
    }
    stopMic()
    setMode('idle')
  }, [stopMic])

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 3rem)' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#06060e' }}
      />

      {mode === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Strange Attractor</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            The Lorenz chaotic system traces a butterfly in 3D space. Its xyz coordinates
            drive FM synthesis in real time — you <em>see</em> and <em>hear</em> chaos
            evolve together. Wing transitions flip pitch; z-height shapes harmonic richness.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-sm mb-8 leading-relaxed">
            Mic mode: your volume reshapes σ (the chaos parameter). Louder = faster wing
            transitions and more turbulent pitch jumps.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={() => { void startMicMode() }}
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
          {/* Lorenz state readout — top left */}
          <div className="absolute top-4 left-4 text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 pointer-events-none font-mono">
            <div>x <span className="text-foreground">{hud.x.toFixed(2)}</span></div>
            <div>y <span className="text-foreground">{hud.y.toFixed(2)}</span></div>
            <div>z <span className="text-foreground">{hud.z.toFixed(2)}</span></div>
            <div className="pt-1 text-muted-foreground/70">σ={hud.sigma.toFixed(1)} ρ=28 β=2.67</div>
          </div>

          {/* FM synth readout — top right */}
          <div className="absolute top-4 right-4 text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 text-right pointer-events-none font-mono">
            <div>
              WING{' '}
              <span className={hud.wing === 'right' ? 'text-violet-300' : 'text-violet-300'}>
                {hud.wing.toUpperCase()}
              </span>
            </div>
            <div>CARRIER <span className="text-foreground">{hud.carrierHz} Hz</span></div>
            <div>FM INDEX <span className="text-foreground">{hud.modIdx}</span></div>
            {mode === 'mic' && <div className="text-violet-300/70 pt-1">MIC LIVE</div>}
          </div>

          {/* Wing legend — bottom left */}
          <div className="absolute bottom-4 left-4 text-[10px] tracking-wider text-muted-foreground/70 space-y-1 pointer-events-none">
            <div><span className="text-violet-300">■</span> right wing — high pitch</div>
            <div><span className="text-violet-300">■</span> left wing — low pitch</div>
            <div className="text-muted-foreground/70 pt-0.5">z-height → harmonic richness</div>
          </div>

          {/* Controls — bottom right */}
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
