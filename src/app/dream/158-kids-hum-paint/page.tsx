'use client'
import { useEffect, useRef, useState } from 'react'

// ── pitch detection (autocorrelation, voice range only) ─────────────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length
  let ssq = 0
  for (let i = 0; i < n; i++) ssq += buf[i] * buf[i]
  if (ssq < n * 0.0001) return 0

  // Only search lags in the voice range 75–1100 Hz
  const minLag = Math.floor(sampleRate / 1100)
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / 75))

  let maxAc = 0, bestLag = minLag
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag]
    if (s > maxAc) { maxAc = s; bestLag = lag }
  }
  if (maxAc / ssq < 0.72) return 0
  return sampleRate / bestLag
}

// Map voice frequency to hue (violet-low → cyan-high)
function pitchToHue(freq: number): number {
  const t = Math.max(0, Math.min(1,
    (Math.log2(freq) - Math.log2(75)) / (Math.log2(1100) - Math.log2(75))
  ))
  return t * 280 + 40  // 40° warm amber → 320° rose-violet
}

// Map voice frequency to canvas Y (high pitch = top of canvas)
function pitchToY(freq: number, H: number): number {
  const t = Math.max(0, Math.min(1,
    (Math.log2(freq) - Math.log2(75)) / (Math.log2(1100) - Math.log2(75))
  ))
  return H * 0.86 - t * H * 0.74
}

// ── types ────────────────────────────────────────────────────────────────────

interface Dot { hz: number }

// Twinkle Twinkle in C major (Hz) — classic demo melody
const DEMO_NOTES = [
  261.63, 261.63, 392.00, 392.00, 440.00, 440.00, 392.00,
  349.23, 349.23, 329.63, 329.63, 293.66, 293.66, 261.63,
]

// ── component ────────────────────────────────────────────────────────────────

export default function Page() {
  const [phase, setPhase]       = useState<'start' | 'active'>('start')
  const [micError, setMicError] = useState('')
  const [isDemo, setIsDemo]     = useState(false)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const actxRef     = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timeBufRef  = useRef<Float32Array | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const dotsRef     = useRef<Dot[]>([])
  const xRef        = useRef(20)

  // ── main paint loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    const cvMaybe = canvasRef.current
    if (!cvMaybe) return
    const canvas = cvMaybe  // narrowed: HTMLCanvasElement (no null) for closure capture
    const ctx    = canvas.getContext('2d')!

    let W = 0, H = 0

    function resize() {
      const dpr = window.devicePixelRatio || 1
      W = window.innerWidth
      H = window.innerHeight
      canvas.width  = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#000010'
      ctx.fillRect(0, 0, W, H)
      xRef.current = 20
    }
    resize()
    window.addEventListener('resize', resize)

    const SPEED   = 1.4   // px per rAF frame
    let   prevY   = H / 2
    let   demoIdx = 0
    let   demoFrame = 0

    function loop() {
      let hz = 0, amp = 0

      if (isDemo) {
        demoFrame++
        if (demoFrame % 55 === 0) demoIdx = (demoIdx + 1) % DEMO_NOTES.length
        hz  = DEMO_NOTES[demoIdx]
        amp = 0.50 + 0.28 * Math.sin(demoFrame * 0.09)
      } else {
        const an = analyserRef.current
        const tb = timeBufRef.current
        const ac = actxRef.current
        if (an && tb && ac) {
          an.getFloatTimeDomainData(tb as unknown as Float32Array<ArrayBuffer>)
          hz = detectPitch(tb, ac.sampleRate)
          let rms = 0
          for (let i = 0; i < tb.length; i++) rms += tb[i] * tb[i]
          amp = Math.sqrt(rms / tb.length)
        }
      }

      const x = xRef.current

      if (hz > 0 && amp > 0.009) {
        const y   = pitchToY(hz, H)
        const hue = pitchToHue(hz)
        const w   = 5 + amp * 20

        ctx.save()
        ctx.lineCap     = 'round'
        ctx.lineJoin    = 'round'
        ctx.lineWidth   = w
        ctx.strokeStyle = `hsl(${hue},88%,62%)`
        ctx.shadowColor = `hsl(${hue},100%,72%)`
        ctx.shadowBlur  = 16
        ctx.beginPath()
        ctx.moveTo(Math.max(0, x - SPEED * 2), prevY)
        ctx.lineTo(x, y)
        ctx.stroke()

        // Bright leading dot
        ctx.fillStyle  = `hsl(${hue},100%,80%)`
        ctx.shadowBlur = 22
        ctx.beginPath()
        ctx.arc(x, y, w * 0.52, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        dotsRef.current.push({ hz })
        prevY = y
      } else {
        // Silence: faint center dot so the cursor is always visible
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.beginPath()
        ctx.arc(x, H / 2, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        prevY = H / 2
      }

      xRef.current += SPEED
      if (xRef.current > W - 8) {
        // Wrap: faint separator line then restart from left
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth   = 1
        ctx.beginPath()
        ctx.moveTo(xRef.current, 0)
        ctx.lineTo(xRef.current, H)
        ctx.stroke()
        ctx.restore()
        xRef.current = 12
        prevY        = H / 2
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [phase, isDemo])

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    void actxRef.current?.close()
  }, [])

  // ── handlers ─────────────────────────────────────────────────────────────────

  async function startMic() {
    const actx = new AudioContext()
    actxRef.current = actx
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const src = actx.createMediaStreamSource(stream)
      const an  = actx.createAnalyser()
      an.fftSize = 2048
      analyserRef.current = an
      timeBufRef.current  = new Float32Array(new ArrayBuffer(an.fftSize * 4))
      src.connect(an)  // NOT connected to destination — no feedback loop
      setPhase('active')
    } catch {
      void actx.close()
      actxRef.current = null
      setMicError('Microphone not available — try the demo instead!')
    }
  }

  function startDemo() {
    setIsDemo(true)
    setPhase('active')
  }

  function clearCanvas() {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#000010'
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
    dotsRef.current = []
    xRef.current    = 20
  }

  function playback() {
    // Create AudioContext on demand (user gesture) if not already available
    let tmp = actxRef.current
    if (!tmp) { tmp = new AudioContext(); actxRef.current = tmp }
    const ac = tmp
    if (ac.state === 'suspended') void ac.resume()

    const dots = dotsRef.current
    if (dots.length === 0) return

    // Thin recorded dots to at most 56 notes for a ~2.7 second arc
    const MAX  = 56
    const step   = Math.max(1, Math.floor(dots.length / MAX))
    const subset = dots.filter((_, i) => i % step === 0).slice(0, MAX)
    const gap    = 0.048  // seconds between notes
    const t0     = ac.currentTime + 0.06

    subset.forEach((d, i) => {
      const t   = t0 + i * gap
      const osc = ac.createOscillator()
      const env = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = d.hz
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.13, t + 0.025)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.connect(env)
      env.connect(ac.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  }

  // ── render ───────────────────────────────────────────────────────────────────

  if (phase === 'start') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black gap-6 px-8">
        <p className="text-base font-mono text-white/55">For kids 3+</p>
        <h1 className="text-3xl font-serif text-center text-white/95">
          Voice Painting
        </h1>
        <p className="text-base text-white/75 text-center max-w-sm leading-relaxed">
          Sing or hum — your voice paints the screen! High notes go up,
          low notes drift down. Every pitch glows in its own color.
        </p>
        {micError && (
          <p className="text-rose-300 text-base text-center">{micError}</p>
        )}
        <button
          onClick={() => { void startMic() }}
          className="mt-2 px-8 py-3 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-lg font-mono min-h-[56px]
                     hover:bg-violet-500/30 transition-colors"
        >
          🎤 &nbsp;Start Singing!
        </button>
        <button
          onClick={startDemo}
          className="px-6 py-2.5 rounded-full bg-white/8 text-white/55 text-base font-mono
                     min-h-[44px] hover:bg-white/15 transition-colors"
        >
          Watch the demo
        </button>
        <p className="text-xs text-white/40 mt-2">
          Mic optional · Zero API · Zero deps
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />

      {isDemo && (
        <p className="absolute top-5 left-1/2 -translate-x-1/2
                      px-4 py-2 rounded-full bg-black/50
                      text-white/55 text-sm font-mono pointer-events-none">
          Demo — Twinkle Twinkle ✦
        </p>
      )}

      <div className="absolute bottom-5 right-5 flex gap-3">
        <button
          onClick={playback}
          className="px-4 py-2.5 rounded-full bg-violet-500/20 border border-violet-500/30
                     text-violet-300 text-sm font-mono min-h-[44px]
                     hover:bg-violet-500/30 transition-colors"
        >
          ▶ Hear it!
        </button>
        <button
          onClick={clearCanvas}
          className="px-4 py-2.5 rounded-full bg-white/8 text-white/55 text-sm font-mono
                     min-h-[44px] hover:bg-white/15 transition-colors"
        >
          ↺ Clear
        </button>
      </div>
    </div>
  )
}
