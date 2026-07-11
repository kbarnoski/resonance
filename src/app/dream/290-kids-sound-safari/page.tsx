'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ *
 * 290 · Kids Sound Safari
 * Turn your whole body in a circle to find six hidden singing animals
 * placed around your head with HRTF binaural panning. The AudioListener's
 * forward direction follows your device heading (DeviceOrientation alpha).
 * Audio-first: the screen is just a faint warm compass + a found-row.
 * ------------------------------------------------------------------ */

interface AnimalDef {
  id: string
  emoji: string
  color: string
  bearing: number // degrees, clockwise from "north" (where the child starts facing)
  rootHz: number // base pitch of its motif
  scale: number[] // semitone offsets for a tiny happy phrase
  type: 'sine' | 'triangle'
}

// Six animals at fixed compass bearings around the listener.
const ANIMALS: AnimalDef[] = [
  { id: 'frog', emoji: '🐸', color: '#34d399', bearing: 0, rootHz: 174.6, scale: [0, 5, 7], type: 'triangle' },
  { id: 'bird', emoji: '🐦', color: '#38bdf8', bearing: 60, rootHz: 659.3, scale: [0, 4, 7, 12], type: 'sine' },
  { id: 'whale', emoji: '🐳', color: '#818cf8', bearing: 120, rootHz: 110.0, scale: [0, 3, 7], type: 'sine' },
  { id: 'cricket', emoji: '🦗', color: '#a3e635', bearing: 180, rootHz: 880.0, scale: [0, 0, 7], type: 'triangle' },
  { id: 'owl', emoji: '🦉', color: '#fbbf24', bearing: 240, rootHz: 261.6, scale: [0, -3, 0], type: 'sine' },
  { id: 'bee', emoji: '🐝', color: '#fb7185', bearing: 300, rootHz: 392.0, scale: [0, 2, 4], type: 'triangle' },
]

const FIND_TOLERANCE = 25 // degrees within which an animal counts as "faced"
const RADIUS = 3 // metres-ish, distance of each animal from the listener

// Smallest signed angle difference a-b, normalised to [-180, 180].
function angleDelta(a: number, b: number): number {
  let d = ((a - b + 180) % 360) - 180
  if (d < -180) d += 360
  return d
}

type Phase = 'start' | 'play'

interface VoiceNode {
  panner: PannerNode
  osc: OscillatorNode
  gain: GainNode
  filter: BiquadFilterNode
}

export default function KidsSoundSafari() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [phase, setPhase] = useState<Phase>('start')
  const [found, setFound] = useState<string[]>([])
  const [controlNote, setControlNote] = useState<string>('Turn your phone to look around — or drag.')

  // --- audio refs ---
  const actxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Record<string, VoiceNode>>({})

  // --- state refs (mutable, read inside rAF) ---
  const headingRef = useRef(0) // degrees, current facing direction
  const foundRef = useRef<Set<string>>(new Set())
  const facingRef = useRef<string | null>(null) // currently-faced animal id
  const bloomRef = useRef<Record<string, number>>({}) // id -> bloom amount 0..1
  const celebratedRef = useRef(false)

  // --- control / degradation refs ---
  const lastOrientationRef = useRef(0) // timestamp of last sensor event
  const sensorActiveRef = useRef(false)
  const autoTourRef = useRef(false)
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 })
  const rafRef = useRef<number | null>(null)

  // ---------------------------------------------------------------- //
  // Listener orientation: feature-detect modern AudioParams vs legacy. //
  // ---------------------------------------------------------------- //
  const applyListenerHeading = useCallback((headingDeg: number) => {
    const actx = actxRef.current
    if (!actx) return
    const listener = actx.listener
    const rad = (headingDeg * Math.PI) / 180
    // Forward vector on the horizontal plane. Up is +Y.
    const fx = Math.sin(rad)
    const fz = -Math.cos(rad)
    if ('forwardX' in listener && listener.forwardX) {
      const now = actx.currentTime
      listener.forwardX.setTargetAtTime(fx, now, 0.04)
      listener.forwardZ.setTargetAtTime(fz, now, 0.04)
      listener.forwardY.setTargetAtTime(0, now, 0.04)
      listener.upX.setTargetAtTime(0, now, 0.04)
      listener.upY.setTargetAtTime(1, now, 0.04)
      listener.upZ.setTargetAtTime(0, now, 0.04)
    } else if (typeof listener.setOrientation === 'function') {
      listener.setOrientation(fx, 0, fz, 0, 1, 0)
    }
  }, [])

  const placePanner = useCallback((panner: PannerNode, bearingDeg: number) => {
    const rad = (bearingDeg * Math.PI) / 180
    const x = Math.sin(rad) * RADIUS
    const z = -Math.cos(rad) * RADIUS
    if ('positionX' in panner && panner.positionX) {
      panner.positionX.value = x
      panner.positionY.value = 0
      panner.positionZ.value = z
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(x, 0, z)
    }
  }, [])

  // ---------------------------------------------------------------- //
  // Build the always-on soundscape: one HRTF voice per animal + pad.  //
  // ---------------------------------------------------------------- //
  const buildAudio = useCallback(() => {
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const actx = new Ctor()
    actxRef.current = actx

    const master = actx.createGain()
    master.gain.value = 0.0
    master.gain.setTargetAtTime(0.9, actx.currentTime, 1.2)
    master.connect(actx.destination)
    masterRef.current = master

    // Soft always-on ambient pad (centred above) so it never feels broken.
    const padOsc = actx.createOscillator()
    padOsc.type = 'sine'
    padOsc.frequency.value = 130.8
    const padOsc2 = actx.createOscillator()
    padOsc2.type = 'sine'
    padOsc2.frequency.value = 196.0
    const padGain = actx.createGain()
    padGain.gain.value = 0.05
    const padLfo = actx.createOscillator()
    padLfo.type = 'sine'
    padLfo.frequency.value = 0.08
    const padLfoGain = actx.createGain()
    padLfoGain.gain.value = 0.025
    padLfo.connect(padLfoGain)
    padLfoGain.connect(padGain.gain)
    padOsc.connect(padGain)
    padOsc2.connect(padGain)
    padGain.connect(master)
    padOsc.start()
    padOsc2.start()
    padLfo.start()

    // One continuous, quiet, HRTF-panned "humming" voice per animal.
    // It swells + brightens when faced; sings a phrase on first find.
    const voices: Record<string, VoiceNode> = {}
    for (const a of ANIMALS) {
      const panner = actx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = 1
      panner.rolloffFactor = 0.6
      placePanner(panner, a.bearing)

      const osc = actx.createOscillator()
      osc.type = a.type
      osc.frequency.value = a.rootHz

      const filter = actx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 700
      filter.Q.value = 0.7

      const gain = actx.createGain()
      gain.gain.value = 0.0 // idle: a faint hum, raised below

      // gentle vibrato so the hum feels alive / animal-like
      const vib = actx.createOscillator()
      vib.type = 'sine'
      vib.frequency.value = 4 + Math.random() * 2
      const vibGain = actx.createGain()
      vibGain.gain.value = a.rootHz * 0.012
      vib.connect(vibGain)
      vibGain.connect(osc.frequency)
      vib.start()

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(panner)
      panner.connect(master)
      osc.start()

      // settle to a faint idle hum
      gain.gain.setTargetAtTime(0.035, actx.currentTime + 0.3, 0.8)

      voices[a.id] = { panner, osc, gain, filter }
    }
    voicesRef.current = voices

    applyListenerHeading(headingRef.current)
  }, [applyListenerHeading, placePanner])

  // ---------------------------------------------------------------- //
  // Play a short happy phrase for an animal (the "found!" sing).      //
  // ---------------------------------------------------------------- //
  const singPhrase = useCallback((a: AnimalDef, extraGain = 1) => {
    const actx = actxRef.current
    const master = masterRef.current
    if (!actx || !master) return
    const start = actx.currentTime + 0.02
    const panner = actx.createPanner()
    panner.panningModel = 'HRTF'
    placePanner(panner, a.bearing)
    panner.connect(master)

    a.scale.forEach((semi, i) => {
      const osc = actx.createOscillator()
      osc.type = a.type
      const f = a.rootHz * Math.pow(2, semi / 12)
      osc.frequency.value = f
      const g = actx.createGain()
      const t0 = start + i * 0.16
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.22 * extraGain, t0 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32)
      osc.connect(g)
      g.connect(panner)
      osc.start(t0)
      osc.stop(t0 + 0.36)
    })
  }, [placePanner])

  // ---------------------------------------------------------------- //
  // Celebration: everyone sings a soft chord together.               //
  // ---------------------------------------------------------------- //
  const celebrate = useCallback(() => {
    ANIMALS.forEach((a, i) => {
      window.setTimeout(() => singPhrase(a, 0.8), i * 90)
    })
  }, [singPhrase])

  const resetHunt = useCallback(() => {
    foundRef.current = new Set()
    celebratedRef.current = false
    setFound([])
    const voices = voicesRef.current
    const actx = actxRef.current
    if (actx) {
      for (const id in voices) voices[id].gain.gain.setTargetAtTime(0.035, actx.currentTime, 0.5)
    }
  }, [])

  // ---------------------------------------------------------------- //
  // Per-frame: update listener heading, swell faced animal, draw.    //
  // ---------------------------------------------------------------- //
  const frame = useCallback(() => {
    const canvas = canvasRef.current
    const actx = actxRef.current
    if (!canvas || !actx) {
      rafRef.current = requestAnimationFrame(frame)
      return
    }

    // --- degradation: if no sensor events for ~2s, enable fallbacks ---
    const now = performance.now()
    if (!sensorActiveRef.current && now - lastOrientationRef.current > 2000) {
      if (!autoTourRef.current) {
        autoTourRef.current = true
      }
    }
    if (autoTourRef.current && !dragRef.current.active) {
      headingRef.current = (headingRef.current + 0.18) % 360 // slow hands-free auto-tour
    }

    applyListenerHeading(headingRef.current)

    // --- find logic: which animal (if any) are we facing? ---
    let bestId: string | null = null
    let bestAbs = FIND_TOLERANCE
    for (const a of ANIMALS) {
      const d = Math.abs(angleDelta(a.bearing, headingRef.current))
      if (d < bestAbs) {
        bestAbs = d
        bestId = a.id
      }
    }
    facingRef.current = bestId

    // --- audio + bloom response ---
    const voices = voicesRef.current
    for (const a of ANIMALS) {
      const v = voices[a.id]
      if (!v) continue
      const isFacing = a.id === bestId
      const closeness = isFacing ? 1 - bestAbs / FIND_TOLERANCE : 0
      // swell gain + brighten filter toward front-centre
      const targetGain = 0.035 + closeness * 0.28
      v.gain.gain.setTargetAtTime(targetGain, actx.currentTime, 0.08)
      v.filter.frequency.setTargetAtTime(700 + closeness * 2600, actx.currentTime, 0.08)
      // bloom for drawing
      const cur = bloomRef.current[a.id] ?? 0
      const target = isFacing ? closeness : foundRef.current.has(a.id) ? 0.25 : 0
      bloomRef.current[a.id] = cur + (target - cur) * 0.12
    }

    // --- first-find event ---
    if (bestId && bestAbs < FIND_TOLERANCE * 0.55 && !foundRef.current.has(bestId)) {
      foundRef.current.add(bestId)
      const def = ANIMALS.find((x) => x.id === bestId)
      if (def) {
        singPhrase(def, 1.1)
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)
      }
      setFound([...foundRef.current])
      if (foundRef.current.size === ANIMALS.length && !celebratedRef.current) {
        celebratedRef.current = true
        window.setTimeout(celebrate, 600)
        // gentle reset after the celebration so it loops forever
        window.setTimeout(resetHunt, 7000)
      }
    }

    drawScene(canvas)
    rafRef.current = requestAnimationFrame(frame)
  }, [applyListenerHeading, celebrate, resetHunt, singPhrase])

  // ---------------------------------------------------------------- //
  // Canvas: faint warm compass + the faced animal bloom.             //
  // ---------------------------------------------------------------- //
  const drawScene = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // dusk-meadow near-black wash
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) * 0.32

    // soft warm radial glow at centre
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8)
    glow.addColorStop(0, 'rgba(60,40,30,0.55)')
    glow.addColorStop(1, 'rgba(10,10,15,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    // faint compass ring
    ctx.strokeStyle = 'rgba(251,191,150,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()

    const heading = headingRef.current

    // Draw each animal as a soft dot on the ring at its *relative* bearing.
    // Relative bearing = animal.bearing - heading, so the faced one sits at top.
    for (const a of ANIMALS) {
      const rel = ((a.bearing - heading) * Math.PI) / 180
      const ax = cx + Math.sin(rel) * R
      const ay = cy - Math.cos(rel) * R
      const bloom = bloomRef.current[a.id] ?? 0
      const isFound = foundRef.current.has(a.id)

      // faint dot for every animal so the ring reads as a place to explore
      ctx.beginPath()
      ctx.fillStyle = isFound ? a.color : 'rgba(255,240,220,0.18)'
      ctx.globalAlpha = isFound ? 0.4 : 0.5
      ctx.arc(ax, ay, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      if (bloom > 0.02) {
        const size = 18 + bloom * 64
        const dot = ctx.createRadialGradient(ax, ay, 0, ax, ay, size)
        dot.addColorStop(0, a.color)
        dot.addColorStop(1, 'rgba(10,10,15,0)')
        ctx.globalAlpha = 0.25 + bloom * 0.55
        ctx.fillStyle = dot
        ctx.beginPath()
        ctx.arc(ax, ay, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // The faced animal blooms BIG at centre.
    const facing = facingRef.current
    if (facing) {
      const def = ANIMALS.find((x) => x.id === facing)
      const bloom = bloomRef.current[facing] ?? 0
      if (def && bloom > 0.04) {
        const size = 40 + bloom * 120
        ctx.globalAlpha = 0.18 + bloom * 0.6
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.4)
        g.addColorStop(0, def.color)
        g.addColorStop(1, 'rgba(10,10,15,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, size * 1.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = Math.min(1, 0.4 + bloom)
        ctx.font = `${Math.round(size)}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(def.emoji, cx, cy + size * 0.04)
        ctx.globalAlpha = 1
      }
    }

    // tiny "you are facing here" marker at the top of the ring
    ctx.fillStyle = 'rgba(251,191,150,0.5)'
    ctx.beginPath()
    ctx.moveTo(cx, cy - R - 10)
    ctx.lineTo(cx - 7, cy - R - 22)
    ctx.lineTo(cx + 7, cy - R - 22)
    ctx.closePath()
    ctx.fill()
  }, [])

  // ---------------------------------------------------------------- //
  // DeviceOrientation handler.                                        //
  // ---------------------------------------------------------------- //
  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha == null) return
    // alpha increases counter-clockwise; invert so turning right turns scene right
    headingRef.current = (360 - e.alpha) % 360
    lastOrientationRef.current = performance.now()
    sensorActiveRef.current = true
    autoTourRef.current = false
    setControlNote('')
  }, [])

  // ---------------------------------------------------------------- //
  // Start: user gesture → permission, audio, listeners, loop.        //
  // ---------------------------------------------------------------- //
  const handleStart = useCallback(async () => {
    if (phase === 'play') return
    setPhase('play')

    buildAudio()
    const actx = actxRef.current
    if (actx && actx.state === 'suspended') {
      try {
        await actx.resume()
      } catch {
        /* ignore */
      }
    }

    lastOrientationRef.current = performance.now()

    // iOS 13+ requires permission inside the click handler.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission()
        if (res === 'granted') {
          window.addEventListener('deviceorientation', onOrientation)
        }
      } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', onOrientation)
      }
    } catch {
      // permission rejected — fallbacks below still make it fully demoable
    }

    // After ~2s with no sensor events, surface the drag/keys hint.
    window.setTimeout(() => {
      if (!sensorActiveRef.current) {
        setControlNote('No motion sensor — drag, use ← →, or just watch it tour itself.')
      }
    }, 2100)
  }, [phase, buildAudio, onOrientation])

  // ---------------------------------------------------------------- //
  // Drag + keyboard fallbacks.                                        //
  // ---------------------------------------------------------------- //
  useEffect(() => {
    if (phase !== 'play') return

    const onDown = (e: PointerEvent) => {
      dragRef.current.active = true
      dragRef.current.lastX = e.clientX
      autoTourRef.current = false
    }
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.lastX
      dragRef.current.lastX = e.clientX
      headingRef.current = (headingRef.current + dx * 0.5 + 360) % 360
      lastOrientationRef.current = performance.now() // count drag as "activity"
    }
    const onUp = () => {
      dragRef.current.active = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        headingRef.current = (headingRef.current + 8) % 360
        autoTourRef.current = false
        lastOrientationRef.current = performance.now()
      } else if (e.key === 'ArrowLeft') {
        headingRef.current = (headingRef.current - 8 + 360) % 360
        autoTourRef.current = false
        lastOrientationRef.current = performance.now()
      }
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [phase])

  // ---------------------------------------------------------------- //
  // Start the animation loop when we enter play.                      //
  // ---------------------------------------------------------------- //
  useEffect(() => {
    if (phase !== 'play') return
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [phase, frame])

  // ---------------------------------------------------------------- //
  // Cleanup on unmount.                                               //
  // ---------------------------------------------------------------- //
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('deviceorientation', onOrientation)
      const actx = actxRef.current
      if (actx && actx.state !== 'closed') {
        actx.close().catch(() => {})
      }
    }
  }, [onOrientation])

  const allFound = found.length === ANIMALS.length

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0f] text-foreground">
      {/* Canvas compass lives behind everything */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* design-notes link (lab convention) */}
      <a
        href="./README.md"
        className="absolute right-4 top-4 z-20 text-base text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </a>

      {phase === 'start' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-7 px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Sound Safari <span aria-hidden>🐸🐦🐳</span>
          </h1>
          <p className="max-w-md text-lg text-foreground">
            Six animals are hiding all around you, singing. Turn your whole body in a slow circle to
            find them with your ears.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[88px] min-w-[88px] rounded-full bg-violet-400 px-12 py-6 text-2xl font-bold text-[#1a1205] shadow-lg shadow-violet-500/30 transition active:scale-95"
          >
            ▶ Start
          </button>
          <p className="max-w-sm text-base text-muted-foreground">
            Headphones make the magic stronger — but speakers work too.
          </p>
        </div>
      )}

      {phase === 'play' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 px-6 pb-8">
          {controlNote && (
            <p className="rounded-full bg-black/40 px-4 py-2 text-base text-violet-300">{controlNote}</p>
          )}

          {/* found row — color + character, no reading required */}
          <div className="flex items-center justify-center gap-3">
            {ANIMALS.map((a) => {
              const isFound = found.includes(a.id)
              return (
                <div
                  key={a.id}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl transition"
                  style={{
                    backgroundColor: isFound ? a.color : 'rgba(255,255,255,0.06)',
                    opacity: isFound ? 1 : 0.5,
                    filter: isFound ? 'none' : 'grayscale(1)',
                  }}
                  aria-label={isFound ? `found ${a.id}` : `${a.id} not found yet`}
                >
                  {isFound ? a.emoji : '·'}
                </div>
              )
            })}
          </div>

          {allFound && (
            <p className="text-xl font-semibold text-violet-300/95">You found everyone! 🎉</p>
          )}
        </div>
      )}
    </main>
  )
}
