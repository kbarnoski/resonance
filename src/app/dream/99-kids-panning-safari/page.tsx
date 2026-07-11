'use client'
import { useEffect, useRef, useState } from 'react'

interface AnimalDef {
  emoji: string
  color: string
  laneY: number
  speed: number
}

interface AnimalState {
  x: number
  dir: number
  scale: number
  scaleT: number
  nextPlay: number
  bouncePhase: number
}

const ANIMALS: AnimalDef[] = [
  { emoji: '🦆', color: '#fbbf24', laneY: 0.18, speed: 55 },
  { emoji: '🐸', color: '#34d399', laneY: 0.34, speed: 70 },
  { emoji: '🐘', color: '#a78bfa', laneY: 0.50, speed: 40 },
  { emoji: '🐱', color: '#fb7185', laneY: 0.65, speed: 85 },
  { emoji: '🦜', color: '#38bdf8', laneY: 0.80, speed: 100 },
]

function makeAnimalSound(actx: AudioContext, panVal: number, idx: number): void {
  const panner = actx.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, panVal))
  panner.connect(actx.destination)
  const t = actx.currentTime

  if (idx === 0) {
    // Duck: bandpass noise quack
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * 0.2), actx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
    const src = actx.createBufferSource()
    src.buffer = buf
    const f = actx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 3
    const g = actx.createGain()
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    src.connect(f); f.connect(g); g.connect(panner)
    src.start(); src.stop(t + 0.22)
  } else if (idx === 1) {
    // Frog: AM sine ribbit
    const carrier = actx.createOscillator()
    carrier.type = 'sine'; carrier.frequency.value = 140
    const mod = actx.createOscillator()
    mod.type = 'sine'; mod.frequency.value = 18
    const modG = actx.createGain(); modG.gain.value = 80
    mod.connect(modG); modG.connect(carrier.frequency)
    const g = actx.createGain()
    g.gain.setValueAtTime(0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    carrier.connect(g); g.connect(panner)
    carrier.start(); mod.start()
    carrier.stop(t + 0.42); mod.stop(t + 0.42)
  } else if (idx === 2) {
    // Elephant: low sawtooth rumble
    const osc = actx.createOscillator()
    osc.type = 'sawtooth'; osc.frequency.value = 80
    const f = actx.createBiquadFilter()
    f.type = 'lowpass'; f.frequency.value = 280
    const g = actx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.6, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
    osc.connect(f); f.connect(g); g.connect(panner)
    osc.start(); osc.stop(t + 0.75)
  } else if (idx === 3) {
    // Cat: meow frequency glide
    const osc = actx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(580, t)
    osc.frequency.linearRampToValueAtTime(340, t + 0.4)
    const g = actx.createGain()
    g.gain.setValueAtTime(0.55, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.connect(g); g.connect(panner)
    osc.start(); osc.stop(t + 0.5)
  } else {
    // Parrot: chirp glide
    const osc = actx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400, t)
    osc.frequency.linearRampToValueAtTime(1900, t + 0.07)
    osc.frequency.linearRampToValueAtTime(850, t + 0.18)
    const g = actx.createGain()
    g.gain.setValueAtTime(0.55, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    osc.connect(g); g.connect(panner)
    osc.start(); osc.stop(t + 0.25)
  }
}

function startPad(actx: AudioContext): void {
  ;[130.81, 164.81, 196.0].forEach(hz => {
    const osc = actx.createOscillator()
    osc.type = 'triangle'; osc.frequency.value = hz
    const g = actx.createGain(); g.gain.value = 0.022
    osc.connect(g); g.connect(actx.destination); osc.start()
  })
}

export default function KidsPanningSafari() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actxRef = useRef<AudioContext | null>(null)
  const statesRef = useRef<AnimalState[]>([])
  const rafRef = useRef<number>(0)
  const lastTRef = useRef<number>(0)
  const [started, setStarted] = useState(false)

  function handleStart() { setStarted(true) }

  useEffect(() => {
    if (!started) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const actx = new AudioContext()
    actxRef.current = actx
    startPad(actx)

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      if (statesRef.current.length > 0) {
        statesRef.current.forEach((st, i) => {
          st.x = canvas.width * ((i + 1) / (ANIMALS.length + 1))
        })
      }
    }
    resize()
    window.addEventListener('resize', resize)

    statesRef.current = ANIMALS.map((_, i) => ({
      x: canvas.width * ((i + 1) / (ANIMALS.length + 1)),
      dir: i % 2 === 0 ? 1 : -1,
      scale: 1,
      scaleT: 1,
      nextPlay: actx.currentTime + 1.2 + i * 0.9,
      bouncePhase: i * 1.3,
    }))

    const MARGIN = 65

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const px = (e.clientX - rect.left) * scaleX
      const py = (e.clientY - rect.top) * scaleY
      statesRef.current.forEach((st, i) => {
        const ay = ANIMALS[i].laneY * canvas.height + Math.sin(st.bouncePhase) * 5
        if (Math.hypot(px - st.x, py - ay) < 62) {
          makeAnimalSound(actx, (st.x / canvas.width) * 2 - 1, i)
          st.scale = 1.45
          st.scaleT = 0
        }
      })
    }
    canvas.addEventListener('pointerdown', onPointer)

    lastTRef.current = performance.now()

    const draw = (ts: number) => {
      const dt = Math.min((ts - lastTRef.current) / 1000, 0.05)
      lastTRef.current = ts
      const W = canvas.width
      const H = canvas.height
      const now = actx.currentTime

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#070c18')
      bg.addColorStop(0.72, '#0c1624')
      bg.addColorStop(1, '#091508')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Ground strip
      ctx.fillStyle = '#0a1c0b'
      ctx.fillRect(0, H * 0.88, W, H * 0.12)
      // Ground texture line
      ctx.fillStyle = '#12301400'
      ctx.fillRect(0, H * 0.88, W, 1)

      // Static stars
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (let s = 0; s < 38; s++) {
        const sx = (s * 137.508) % W
        const sy = (s * 73.81) % (H * 0.42)
        const r = 0.5 + (s % 3) * 0.4
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
      }

      // Pan ruler line
      const rulerY = H * 0.925
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(30, rulerY, W - 60, 1)

      ANIMALS.forEach((def, i) => {
        const st = statesRef.current[i]

        // Move
        st.x += def.speed * st.dir * dt
        st.bouncePhase += 3.5 * dt
        if (st.x > W - MARGIN) { st.x = W - MARGIN; st.dir = -1 }
        if (st.x < MARGIN) { st.x = MARGIN; st.dir = 1 }

        // Scale bounce animation
        if (st.scaleT < 1) {
          st.scaleT = Math.min(1, st.scaleT + dt * 5)
          st.scale = 1 + 0.45 * Math.sin(st.scaleT * Math.PI)
        } else {
          st.scale = 1
        }

        // Auto-play
        if (now >= st.nextPlay) {
          makeAnimalSound(actx, (st.x / W) * 2 - 1, i)
          st.nextPlay = now + 3.2 + Math.random() * 4.0
        }

        const ax = st.x
        const ay = def.laneY * H + Math.sin(st.bouncePhase) * 5

        ctx.save()

        // Glow halo
        ctx.globalAlpha = 0.18
        ctx.fillStyle = def.color
        ctx.beginPath()
        ctx.arc(ax, ay, 36 * st.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // Dashed drop line to ruler
        ctx.strokeStyle = def.color + '40'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 5])
        ctx.beginPath()
        ctx.moveTo(ax, ay + 28)
        ctx.lineTo(ax, rulerY)
        ctx.stroke()
        ctx.setLineDash([])

        // Pan dot on ruler
        ctx.fillStyle = def.color
        ctx.beginPath(); ctx.arc(ax, rulerY, 5, 0, Math.PI * 2); ctx.fill()

        // Emoji
        const fontSize = Math.round(46 * st.scale)
        ctx.font = `${fontSize}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(def.emoji, ax, ay)

        ctx.restore()
      })

      // L / R labels
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('◄ L', 32, rulerY + 14)
      ctx.textAlign = 'right'
      ctx.fillText('R ►', W - 32, rulerY + 14)

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', resize)
      actx.close()
    }
  }, [started])

  if (!started) {
    return (
      <main className="fixed inset-0 bg-[#070c18] flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-6xl">🌿</div>
        <h1 className="text-3xl font-bold text-foreground text-center">Panning Safari</h1>
        <p className="text-muted-foreground text-base text-center max-w-xs leading-relaxed">
          Five animals roam the savanna. Tap them to hear their calls — the sound moves left and right as they walk!
        </p>
        <button
          onPointerDown={handleStart}
          className="bg-violet-500 text-foreground text-xl font-bold rounded-2xl px-10 py-4 min-h-[60px] min-w-[220px] active:scale-95 transition-transform"
        >
          Let&apos;s go! 🐾
        </button>
        <p className="text-muted-foreground text-sm">🎧 Headphones make it magical</p>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#070c18]">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
      <p className="absolute bottom-2 left-0 right-0 text-center text-muted-foreground/70 text-xs pointer-events-none select-none">
        Tap an animal 🐾
      </p>
    </main>
  )
}
