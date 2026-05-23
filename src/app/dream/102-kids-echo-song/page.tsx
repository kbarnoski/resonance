'use client'
import { useEffect, useRef, useState } from 'react'

// C major pentatonic: C3 E3 G3 A3 C4
const NOTES_HZ = [130.81, 164.81, 196.0, 220.0, 261.63]
const NOTE_COLORS = ['#a78bfa', '#2dd4bf', '#4ade80', '#fbbf24', '#fb7185']
const PAD_HZ = [130.81, 164.81, 196.0]

type Phase = 'bird' | 'child' | 'echo' | 'pause'

function playNote(actx: AudioContext, hz: number, when: number): void {
  const t = when
  const osc = actx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = hz
  const osc2 = actx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = hz * 2
  const g = actx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.44, t + 0.06)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
  const g2 = actx.createGain()
  g2.gain.value = 0.2
  osc2.connect(g2); g2.connect(g)
  osc.connect(g); g.connect(actx.destination)
  osc.start(t); osc2.start(t)
  osc.stop(t + 0.65); osc2.stop(t + 0.65)
}

function startPad(actx: AudioContext): void {
  PAD_HZ.forEach(hz => {
    const osc = actx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz
    const g = actx.createGain()
    g.gain.value = 0.022
    osc.connect(g); g.connect(actx.destination); osc.start()
  })
}

export default function KidsEchoSong() {
  const [started, setStarted] = useState(false)
  const [phase, setPhase] = useState<Phase>('pause')
  const [litNotes, setLitNotes] = useState<boolean[]>([false, false, false, false, false])
  const [birdGlowing, setBirdGlowing] = useState(false)

  const actxRef = useRef<AudioContext | null>(null)
  const phaseRef = useRef<Phase>('pause')
  const childNotesRef = useRef<number[]>([])
  const roundRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteHitRef = useRef<(n: number) => void>(() => {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!started) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const actx = new AudioContext()
    actxRef.current = actx
    startPad(actx)

    let cancelled = false

    function litNote(idx: number): void {
      setLitNotes(prev => { const n = [...prev]; n[idx] = true; return n })
      setTimeout(() => {
        setLitNotes(prev => { const n = [...prev]; n[idx] = false; return n })
      }, 380)
    }

    function glowBird(): void {
      setBirdGlowing(true)
      setTimeout(() => setBirdGlowing(false), 500)
    }

    function playSequence(phrase: number[], startDelay: number, onDone: () => void): void {
      const GAP = 0.58
      phrase.forEach((noteIdx, i) => {
        const when = actx.currentTime + startDelay + i * GAP
        playNote(actx, NOTES_HZ[noteIdx], when)
        const ms = (startDelay + i * GAP) * 1000
        setTimeout(() => {
          if (cancelled) return
          litNote(noteIdx)
          glowBird()
        }, ms)
      })
      const totalMs = (startDelay + (phrase.length - 1) * GAP + 0.65) * 1000
      setTimeout(() => { if (!cancelled) onDone() }, totalMs)
    }

    function startChildTurn(): void {
      phaseRef.current = 'child'
      setPhase('child')
      childNotesRef.current = []
      timerRef.current = setTimeout(() => {
        if (!cancelled && phaseRef.current === 'child') {
          startEchoTurn()
        }
      }, 3000)
    }

    function startEchoTurn(): void {
      if (phaseRef.current !== 'child') return
      phaseRef.current = 'echo'
      setPhase('echo')
      if (timerRef.current) clearTimeout(timerRef.current)

      const childNotes = childNotesRef.current.slice()
      // Echo child's notes + add one new consonant note
      const echo = childNotes.length > 0 ? [...childNotes] : [Math.floor(Math.random() * 5)]
      const last = echo[echo.length - 1]
      const pool = [0, 1, 2, 3, 4].filter(n => n !== last)
      echo.push(pool[Math.floor(Math.random() * pool.length)])

      playSequence(echo, 0.3, () => {
        if (!cancelled) {
          roundRef.current++
          startBirdTurn()
        }
      })
    }

    function startBirdTurn(): void {
      phaseRef.current = 'bird'
      setPhase('bird')
      const len = Math.min(2 + Math.floor(roundRef.current / 2), 4)
      const phrase = Array.from({ length: len }, () => Math.floor(Math.random() * 5))
      playSequence(phrase, 0.5, startChildTurn)
    }

    noteHitRef.current = (noteIdx: number) => {
      if (phaseRef.current !== 'child') return
      if (actx.state === 'suspended') actx.resume()
      playNote(actx, NOTES_HZ[noteIdx], actx.currentTime)
      litNote(noteIdx)
      childNotesRef.current.push(noteIdx)
      if (childNotesRef.current.length >= 4) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setTimeout(startEchoTurn, 450)
      }
    }

    // Start game after short delay
    setTimeout(startBirdTurn, 600)

    // Star canvas animation
    const stars = Array.from({ length: 65 }, (_, i) => ({
      x: (i * 137.508) % 800,
      y: (i * 89.31 + 10) % 600,
      r: 0.5 + (i % 3) * 0.4,
    }))

    function drawFrame(): void {
      if (!canvas || !ctx2d) return
      const W = canvas.width
      const H = canvas.height
      const grad = ctx2d.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#02060d')
      grad.addColorStop(1, '#0b1321')
      ctx2d.fillStyle = grad
      ctx2d.fillRect(0, 0, W, H)
      for (const s of stars) {
        ctx2d.beginPath()
        ctx2d.arc((s.x / 800) * W, (s.y / 600) * H, s.r, 0, Math.PI * 2)
        ctx2d.fillStyle = 'rgba(255,255,255,0.22)'
        ctx2d.fill()
      }
      rafRef.current = requestAnimationFrame(drawFrame)
    }

    const onResize = () => {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = Math.round(window.innerHeight * 0.65)
    }
    onResize()
    window.addEventListener('resize', onResize)
    rafRef.current = requestAnimationFrame(drawFrame)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      if (timerRef.current) clearTimeout(timerRef.current)
      actx.close()
    }
  }, [started])

  if (!started) {
    return (
      <main className="fixed inset-0 bg-[#060a12] flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-7xl">🦜</div>
        <h1 className="text-3xl font-bold text-white text-center">Echo Song</h1>
        <p className="text-white/75 text-base text-center max-w-xs leading-relaxed">
          The bird sings a song — then tap the colors to sing back!
        </p>
        <button
          onPointerDown={() => setStarted(true)}
          className="bg-violet-500 text-white text-xl font-bold rounded-2xl px-10 py-4 min-h-[60px] min-w-[220px] active:scale-95 transition-transform"
        >
          Let&apos;s sing! 🎵
        </button>
        <p className="text-white/55 text-sm text-center">No microphone needed · tap the colors</p>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 bg-[#060a12] flex flex-col">
      {/* Sky / bird area */}
      <div className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          {/* Bird with glow */}
          <div
            className="text-8xl transition-transform duration-150 select-none"
            style={{
              filter: birdGlowing
                ? 'drop-shadow(0 0 30px #f472b6) drop-shadow(0 0 60px #a78bfa)'
                : 'none',
              transform: birdGlowing ? 'scale(1.15)' : 'scale(1)',
            }}
          >
            🦜
          </div>
          {/* Phase hint — small, tertiary */}
          <p className="text-white/55 text-sm tracking-wide select-none">
            {phase === 'bird' && 'Listen...'}
            {phase === 'child' && 'Your turn! ✨'}
            {phase === 'echo' && 'Echo! 🎵'}
            {phase === 'pause' && ''}
          </p>
        </div>
      </div>

      {/* Note circles — min 80px tall, tap anywhere on the circle */}
      <div className="flex gap-2 p-3 pb-8">
        {NOTES_HZ.map((_, i) => (
          <button
            key={i}
            onPointerDown={(e) => { e.preventDefault(); noteHitRef.current(i) }}
            className="flex-1 rounded-2xl transition-all duration-100 select-none"
            style={{
              minHeight: '80px',
              backgroundColor: litNotes[i] ? NOTE_COLORS[i] : NOTE_COLORS[i] + '50',
              boxShadow: litNotes[i]
                ? `0 0 32px ${NOTE_COLORS[i]}, 0 0 12px ${NOTE_COLORS[i]}aa`
                : 'none',
              transform: litNotes[i] ? 'scale(1.06)' : phase === 'child' ? 'scale(1.02)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </main>
  )
}
