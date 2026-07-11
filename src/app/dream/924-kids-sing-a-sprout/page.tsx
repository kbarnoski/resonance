"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"

// ----------------------------------------------------------------------------
// Sing a Sprout — a long-form, stateful kids garden.
// A child hums; each phrase plants a glowing sprout on a Vogel phyllotaxis
// spiral. Sprouts grow & bloom slowly over minutes. The garden keeps a memory
// bank of sung pitches (a stigmergic trace) that biases later growth and is
// gently re-sung back as soft bells.
// ----------------------------------------------------------------------------

// C major pentatonic across ~3 octaves. Every note is consonant — no "wrong"
// notes possible. (C3 .. E6)
const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.0, 220.0,
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5,
]

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // 137.5077... deg in radians
const SPIRAL_SCALE = 0.62 // world-units per sqrt(index)
const MAX_SPROUTS = 240

// Audio safety
const MASTER_GAIN = 0.26
const LOWPASS_HZ = 6000

// Pitch detection
const PITCH_MIN_HZ = 120
const PITCH_MAX_HZ = 900
const RMS_GATE = 0.012

interface Sprout {
  index: number // phyllotaxis index → fixed position
  noteIdx: number // pentatonic ladder index
  bornAt: number // performance.now() ms
  loud: number // 0..1 RMS at birth → size/brightness
  hue: number // base hue (cool→warm as it ages)
}

// Map a frequency to nearest pentatonic ladder index.
function snapToLadder(hz: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < PENTA_HZ.length; i++) {
    const d = Math.abs(Math.log2(PENTA_HZ[i]) - Math.log2(hz))
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// Phyllotaxis position for a given sprout index (Vogel 1979).
function vogelPos(index: number): { x: number; y: number } {
  const r = SPIRAL_SCALE * Math.sqrt(index)
  const theta = index * GOLDEN_ANGLE
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

// RMS-gated autocorrelation pitch detector. Returns Hz or -1.
function runPitch(buf: Float32Array, sampleRate: number): number {
  let rms = 0
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / buf.length)
  if (rms < RMS_GATE) return -1

  const SIZE = buf.length
  const maxLag = Math.floor(sampleRate / PITCH_MIN_HZ)
  const minLag = Math.floor(sampleRate / PITCH_MAX_HZ)
  let bestLag = -1
  let bestCorr = 0
  let lastCorr = 1
  let foundGoodCorrelation = false

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < SIZE - lag; i++) corr += buf[i] * buf[i + lag]
    corr /= SIZE - lag
    if (corr > 0.9 * lastCorr && corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
      foundGoodCorrelation = true
    } else if (foundGoodCorrelation && corr < bestCorr) {
      break
    }
    lastCorr = corr
  }
  if (bestLag <= 0) return -1
  const hz = sampleRate / bestLag
  if (hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) return -1
  return hz
}

export default function SingASproutPage() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [started, setStarted] = useState(false)
  const [micFailed, setMicFailed] = useState(false)
  const [sproutCount, setSproutCount] = useState(0)
  const [elapsedMin, setElapsedMin] = useState(0)

  // refs that live across the whole session
  const audioRef = useRef<{
    actx: AudioContext
    master: GainNode
    stream: MediaStream | null
    analyser: AnalyserNode | null
    raf: number
  } | null>(null)

  useEffect(() => {
    if (!started) return
    const mount = mountRef.current
    if (!mount) return

    // ---- three.js scene ----
    const width = mount.clientWidth
    const height = mount.clientHeight
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070512)
    scene.fog = new THREE.FogExp2(0x070512, 0.018)

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200)
    camera.position.set(0, 0, 26)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    // soft ground glow plane
    const groundGeo = new THREE.CircleGeometry(40, 48)
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x0d0a26,
      transparent: true,
      opacity: 0.6,
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.position.z = -1
    scene.add(ground)

    // Sprout instanced mesh: a glowing disc per sprout.
    const discGeo = new THREE.CircleGeometry(0.5, 18)
    const discMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const inst = new THREE.InstancedMesh(discGeo, discMat, MAX_SPROUTS)
    inst.count = 0
    inst.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_SPROUTS * 3),
      3
    )
    scene.add(inst)

    // inner bright core (smaller, whiter) for a luminous center
    const coreGeo = new THREE.CircleGeometry(0.22, 14)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const coreInst = new THREE.InstancedMesh(coreGeo, coreMat, MAX_SPROUTS)
    coreInst.count = 0
    scene.add(coreInst)

    const dummy = new THREE.Object3D()
    const tmpColor = new THREE.Color()

    // ---- audio graph ----
    const audio = audioRef.current
    if (!audio) return
    const { actx, master } = audio

    // soft, always-on ambient pad (two detuned saws under a slow LFO filter).
    function makePad() {
      const padGain = actx.createGain()
      padGain.gain.value = 0.0
      padGain.connect(master)
      // fade in slowly
      padGain.gain.setValueAtTime(0.0, actx.currentTime)
      padGain.gain.linearRampToValueAtTime(0.05, actx.currentTime + 6)

      const padFilter = actx.createBiquadFilter()
      padFilter.type = "lowpass"
      padFilter.frequency.value = 700
      padFilter.Q.value = 0.4
      padFilter.connect(padGain)

      // slow LFO opening the filter
      const lfo = actx.createOscillator()
      lfo.frequency.value = 0.03
      const lfoGain = actx.createGain()
      lfoGain.gain.value = 300
      lfo.connect(lfoGain)
      lfoGain.connect(padFilter.frequency)
      lfo.start()

      // root + fifth drone (C2 + G2)
      const freqs = [65.41, 98.0, 130.81]
      const oscs: OscillatorNode[] = []
      for (const f of freqs) {
        const o = actx.createOscillator()
        o.type = "sine"
        o.frequency.value = f
        const od = actx.createOscillator()
        od.type = "sine"
        od.frequency.value = f * 1.005
        o.connect(padFilter)
        od.connect(padFilter)
        o.start()
        od.start()
        oscs.push(o, od)
      }
      return { oscs, lfo, padGain }
    }
    const pad = makePad()

    // a single soft chime / bell voice
    function makeChime(hz: number, when: number, gainScale: number, bell: boolean) {
      const t = Math.max(when, actx.currentTime)
      const g = actx.createGain()
      g.connect(master)
      const peak = (bell ? 0.16 : 0.2) * gainScale
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.02)
      const dur = bell ? 2.8 : 1.6
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

      const o = actx.createOscillator()
      o.type = bell ? "sine" : "triangle"
      o.frequency.value = hz
      const o2 = actx.createOscillator()
      o2.type = "sine"
      o2.frequency.value = hz * (bell ? 2.01 : 2.0)
      const g2 = actx.createGain()
      g2.gain.value = bell ? 0.25 : 0.4
      o.connect(g)
      o2.connect(g2)
      g2.connect(g)
      o.start(t)
      o2.start(t)
      o.stop(t + dur + 0.1)
      o2.stop(t + dur + 0.1)
    }

    // ---- state: the garden + the memory bank ----
    const sprouts: Sprout[] = []
    const memory: number[] = [] // rolling bank of recent sung ladder indices (stigmergic trace)
    const MEMORY_MAX = 64
    let lastPlantedNote = -1
    let lastPlantTime = 0
    const startTime = performance.now()

    // Plant a sprout for a sung note.
    function plantSprout(noteIdx: number, loud: number, isMemoryEcho: boolean) {
      if (sprouts.length >= MAX_SPROUTS) {
        // garden full: gently retire the oldest to keep evolving
        sprouts.shift()
      }
      // bias: where later sprouts grow leans on the memory. We nudge the chosen
      // note toward the running average of remembered notes (the trace pulls).
      let chosen = noteIdx
      if (!isMemoryEcho && memory.length > 6) {
        const avg = memory.reduce((a, b) => a + b, 0) / memory.length
        // 30% pull toward the garden's accumulated "scent"
        chosen = Math.round(noteIdx * 0.7 + avg * 0.3)
        chosen = Math.max(0, Math.min(PENTA_HZ.length - 1, chosen))
      }
      const index = sprouts.length > 0 ? sprouts[sprouts.length - 1].index + 1 : 0
      // hue from note: low notes cool (violet/blue), high notes warm (amber/rose)
      const hue = 0.72 - (chosen / (PENTA_HZ.length - 1)) * 0.62 // 0.72→0.10
      const s: Sprout = {
        index,
        noteIdx: chosen,
        bornAt: performance.now(),
        loud: Math.max(0.25, Math.min(1, loud)),
        hue,
      }
      sprouts.push(s)
      if (!isMemoryEcho) {
        memory.push(chosen)
        if (memory.length > MEMORY_MAX) memory.shift()
      }
      setSproutCount(sprouts.length)
      // immediate chime
      makeChime(PENTA_HZ[chosen], actx.currentTime + 0.005, s.loud, isMemoryEcho)
    }

    // ---- pitch loop (mic or synthetic) ----
    let detectionBuf: Float32Array<ArrayBuffer> | null = null
    if (audio.analyser) {
      detectionBuf = new Float32Array(new ArrayBuffer(audio.analyser.fftSize * 4))
    }

    // synthetic "humming child": a slow rising-and-falling melody used as the
    // auto-demo when there is no mic. Drives plantSprout directly.
    const hummingPattern = [0, 2, 4, 2, 5, 7, 5, 4, 2, 0, 4, 7, 9, 7, 5, 4]
    let hummingStep = 0
    let lastSynthPlant = 0

    let rafId = 0
    let lastMemoryEcho = performance.now()
    const elapsedMinRef = { current: 0 }

    function loop(now: number) {
      rafId = requestAnimationFrame(loop)

      // --- INPUT: detect a sung note ---
      if (audio && audio.analyser && detectionBuf) {
        audio.analyser.getFloatTimeDomainData(detectionBuf)
        let rms = 0
        for (let i = 0; i < detectionBuf.length; i++) {
          rms += detectionBuf[i] * detectionBuf[i]
        }
        rms = Math.sqrt(rms / detectionBuf.length)
        const hz = runPitch(detectionBuf, actx.sampleRate)
        if (hz > 0) {
          const noteIdx = snapToLadder(hz)
          const loud = Math.min(1, rms * 12)
          // debounce: new note OR enough time since last plant
          if (noteIdx !== lastPlantedNote || now - lastPlantTime > 420) {
            if (now - lastPlantTime > 130) {
              plantSprout(noteIdx, loud, false)
              lastPlantedNote = noteIdx
              lastPlantTime = now
            }
          }
        } else {
          lastPlantedNote = -1
        }
      } else {
        // --- FALLBACK: synthetic humming child ---
        // First sprout lands within ~0.4s so an unattended iPad blooms fast.
        if (now - lastSynthPlant > (sprouts.length === 0 ? 350 : 1400)) {
          const noteIdx = hummingPattern[hummingStep % hummingPattern.length] + 5
          hummingStep++
          plantSprout(Math.min(noteIdx, PENTA_HZ.length - 1), 0.55, false)
          lastSynthPlant = now
        }
      }

      // --- MEMORY: re-sing an earlier phrase back, gently, every ~14s ---
      if (now - lastMemoryEcho > 14000 && memory.length > 4) {
        lastMemoryEcho = now
        // pick a small earlier phrase from the bank (stigmergic recall)
        const start = Math.floor(Math.random() * Math.max(1, memory.length - 4))
        const phrase = memory.slice(start, start + 4)
        let t = actx.currentTime + 0.1
        for (const n of phrase) {
          makeChime(PENTA_HZ[n], t, 0.5, true)
          // softly plant memory-echo sprouts too (garden grows from its memory)
          plantSprout(n, 0.4, true)
          t += 0.6
        }
      }

      // --- update elapsed/UI occasionally ---
      const mins = (now - startTime) / 60000
      if (Math.floor(mins * 2) !== Math.floor(elapsedMinRef.current * 2)) {
        elapsedMinRef.current = mins
        setElapsedMin(mins)
      }

      // --- VISUAL: lay out & animate sprouts ---
      let visIndex = 0
      for (let i = 0; i < sprouts.length; i++) {
        const s = sprouts[i]
        const ageS = (now - s.bornAt) / 1000
        const pos = vogelPos(i) // re-pack so retired sprouts compress inward
        // slow growth over MINUTES: scale eases up over ~180s, blooms keep opening
        const growth = 1 - Math.exp(-ageS / 12) // fast first bloom
        const slow = Math.min(1, ageS / 180) // continues to mature for 3 min
        const size = (0.35 + s.loud * 0.65) * (0.4 + growth * 0.7 + slow * 0.5)
        // gentle breathing
        const breathe = 1 + 0.06 * Math.sin(now / 1400 + i)

        dummy.position.set(pos.x, pos.y, 0)
        dummy.scale.setScalar(size * breathe)
        dummy.updateMatrix()
        inst.setMatrixAt(visIndex, dummy.matrix)

        // color: cool→warm as it ages (hue rotates toward warm, light increases)
        const warmShift = Math.min(0.12, slow * 0.12)
        const hue = s.hue - warmShift
        const light = 0.45 + 0.18 * growth + 0.1 * Math.sin(now / 900 + i * 0.7)
        tmpColor.setHSL((hue + 1) % 1, 0.7, Math.min(0.7, light))
        inst.setColorAt(visIndex, tmpColor)

        // bright core scales with growth
        dummy.scale.setScalar(size * breathe * (0.5 + 0.5 * growth))
        dummy.updateMatrix()
        coreInst.setMatrixAt(visIndex, dummy.matrix)

        visIndex++
      }
      inst.count = visIndex
      coreInst.count = visIndex
      inst.instanceMatrix.needsUpdate = true
      coreInst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true

      // slow camera drift outward as garden grows (so minute-5 reads differently)
      const targetZ = 22 + Math.min(38, sprouts.length * 0.16)
      camera.position.z += (targetZ - camera.position.z) * 0.01
      const drift = (now - startTime) / 1000
      camera.position.x = Math.sin(drift * 0.05) * 1.4
      camera.position.y = Math.cos(drift * 0.04) * 1.0
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    rafId = requestAnimationFrame(loop)
    audio.raf = rafId

    function onResize() {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(rafId)
      // stop pad voices
      try {
        for (const o of pad.oscs) o.stop()
        pad.lfo.stop()
      } catch {
        // already stopped
      }
      renderer.dispose()
      discGeo.dispose()
      discMat.dispose()
      coreGeo.dispose()
      coreMat.dispose()
      groundGeo.dispose()
      groundMat.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [started])

  // Teardown audio + mic on unmount.
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        if (audio.stream) {
          for (const tr of audio.stream.getTracks()) tr.stop()
        }
        if (audio.actx.state !== "closed") {
          audio.actx.close().catch(() => {})
        }
        audioRef.current = null
      }
    }
  }, [])

  // Tap handler: create AudioContext, build the safe master chain, request mic.
  async function startGarden() {
    if (audioRef.current) {
      setStarted(true)
      return
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const actx = new Ctx()
    if (actx.state === "suspended") await actx.resume()

    // master chain: gain → lowpass → compressor/limiter → destination
    const master = actx.createGain()
    master.gain.value = MASTER_GAIN
    const lp = actx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = LOWPASS_HZ
    const comp = actx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 12
    comp.attack.value = 0.003
    comp.release.value = 0.25
    master.connect(lp)
    lp.connect(comp)
    comp.connect(actx.destination)

    let stream: MediaStream | null = null
    let analyser: AnalyserNode | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const src = actx.createMediaStreamSource(stream)
      analyser = actx.createAnalyser()
      analyser.fftSize = 2048
      // mic → analyser ONLY. Never to destination (no feedback).
      src.connect(analyser)
      setMicFailed(false)
    } catch {
      setMicFailed(true)
      stream = null
      analyser = null
    }

    audioRef.current = { actx, master, stream, analyser, raf: 0 }
    setStarted(true)
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#070512] text-foreground">
      {/* three.js canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#070512]/95 px-6 text-center">
          <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
            Sing a Sprout
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Hum or sing, and a garden grows from your voice. Keep singing — over
            a few minutes it blooms, and the garden softly sings your song back.
          </p>
          <button
            type="button"
            onClick={startGarden}
            className="min-h-[64px] rounded-full bg-violet-400/90 px-8 py-4 text-xl font-medium text-violet-950 shadow-lg shadow-violet-500/20 transition active:scale-95"
          >
            Sing to your garden
          </button>
          <p className="text-base text-muted-foreground">
            Best with the volume gentle and low.
          </p>
        </div>
      )}

      {/* Live HUD */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 select-none font-mono text-base text-muted-foreground">
          <div className="text-violet-300/95">{sproutCount} sprouts</div>
          <div className="text-muted-foreground">{elapsedMin.toFixed(1)} min growing</div>
        </div>
      )}

      {/* Mic-failed notice */}
      {started && micFailed && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-[60%] text-right text-base text-violet-300">
          No microphone — your garden is humming to itself. Sing along any time.
        </div>
      )}

      {/* design notes link */}
      <a
        href="/dream/924-kids-sing-a-sprout/README.md"
        className="absolute bottom-3 right-4 z-10 font-mono text-base text-violet-300/80 underline-offset-2 hover:underline"
      >
        design notes
      </a>
    </main>
  )
}
