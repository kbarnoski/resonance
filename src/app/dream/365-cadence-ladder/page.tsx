"use client"

// 365-cadence-ladder — tonal/functional harmonic analyst
//
// A real-time pedagogical visualiser that names the KEY you're in and the
// harmonic FUNCTION (Roman numeral) of every chord you play — LIVE — and makes
// the pull-and-resolve of harmony VISIBLE as a vertical functional tension ladder.
//
// Algorithm: Krumhansl–Schmuckler key estimation + Riemann tripartite functional
// labeling (Tonic / Subdominant / Dominant) + cadence detection (authentic,
// plagal, deceptive) with hysteresis-guarded modulation detection.
//
// Input: internal auto-play progression (ground truth) + optional Web MIDI.
// Output: three.js functional ladder with DOM label overlay.

import { useCallback, useEffect, useRef, useState } from "react"
import { KeyFinder, type ChordEvent, type KeyState, type CadenceType } from "./key-finder"
import { LadderAudio } from "./audio"
import { LadderScene } from "./scene"

// ── WebGL check ───────────────────────────────────────────────────────────────
function checkWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

// ── Readout state (slow, React-owned) ────────────────────────────────────────
interface Readout {
  key: KeyState | null
  chord: ChordEvent | null
  cadence: CadenceType
  isModulating: boolean
  midiConnected: boolean
}

// ── Cadence labels ────────────────────────────────────────────────────────────
function cadenceLabel(c: CadenceType): string {
  if (c === "authentic")  return "Authentic cadence V → I"
  if (c === "plagal")     return "Plagal cadence IV → I"
  if (c === "deceptive")  return "Deceptive cadence V → vi"
  return ""
}

function cadenceColor(c: CadenceType): string {
  if (c === "authentic")  return "text-emerald-300/95"
  if (c === "plagal")     return "text-violet-300"
  if (c === "deceptive")  return "text-amber-300/95"
  return ""
}

function fnColor(fn: ChordEvent["fn"] | undefined): string {
  if (fn === "Dominant")    return "text-amber-300/95"
  if (fn === "Subdominant") return "text-violet-300"
  if (fn === "Tonic")       return "text-emerald-300/95"
  return "text-white/75"
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Page() {
  const hostRef    = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const audioRef   = useRef<LadderAudio | null>(null)
  const sceneRef   = useRef<LadderScene | null>(null)
  const finderRef  = useRef<KeyFinder | null>(null)
  const rafRef     = useRef<number | null>(null)
  const lastFrameRef = useRef<number>(0)

  // Note state for pipeline (pitch class → velocity)
  const activeNotesRef  = useRef<Map<number, number>>(new Map())
  const lastChordRef    = useRef<ChordEvent | null>(null)
  const lastKeyRef      = useRef<KeyState | null>(null)
  const cadenceHoldRef  = useRef<{ type: CadenceType; frames: number }>({ type: null, frames: 0 })

  const [started, setStarted]     = useState(false)
  const [hasWebGL, setHasWebGL]   = useState(true)
  const [readout, setReadout]     = useState<Readout>({
    key: null, chord: null, cadence: null, isModulating: false, midiConnected: false,
  })

  useEffect(() => { setHasWebGL(checkWebGL()) }, [])

  // ── MIDI setup ──────────────────────────────────────────────────────────────
  const setupMIDI = useCallback(() => {
    if (!navigator.requestMIDIAccess) return
    navigator.requestMIDIAccess().then((access) => {
      const handleInput = (input: MIDIInput) => {
        input.onmidimessage = (ev: MIDIMessageEvent) => {
          const data = ev.data
          if (!data || data.length < 3) return
          const status = data[0] & 0xf0
          const note   = data[1]
          const vel    = data[2]
          const pc     = note % 12
          if (status === 0x90 && vel > 0) {
            activeNotesRef.current.set(pc, vel)
          } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
            activeNotesRef.current.delete(pc)
          }
        }
      }

      let connected = false
      access.inputs.forEach((input) => {
        handleInput(input)
        connected = true
      })
      if (connected) {
        setReadout(r => ({ ...r, midiConnected: true }))
      }

      access.onstatechange = (e) => {
        const port = e.port
        if (port && port.type === "input" && port.state === "connected") {
          handleInput(port as MIDIInput)
          setReadout(r => ({ ...r, midiConnected: true }))
        }
      }
    }).catch(() => {
      // MIDI unavailable — silent fallback to internal demo
    })
  }, [])

  // ── Animation loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    let lastReadoutPush = 0

    const loop = () => {
      const finder = finderRef.current
      const scene  = sceneRef.current
      if (!finder) { rafRef.current = requestAnimationFrame(loop); return }

      const wall = performance.now()
      const dt   = lastFrameRef.current
        ? Math.min((wall - lastFrameRef.current) / 1000, 0.05)
        : 0.016
      lastFrameRef.current = wall

      // Build active pitch-class set from the shared map
      const activePCs = new Set(activeNotesRef.current.keys())
      const velocities = new Map(activeNotesRef.current)

      // Step 1: update pitch-class profile
      finder.addNotes(activePCs, velocities)

      // Step 2: estimate key (with hysteresis)
      const wasKey  = lastKeyRef.current
      const key     = finder.estimateKey()
      const modulating = finder.isModulating()

      // Detect modulation event (key root or mode changed)
      if (wasKey && (wasKey.root !== key.root || wasKey.mode !== key.mode)) {
        scene?.triggerModulation()
      }
      lastKeyRef.current = key

      // Step 3: chord analysis
      const chord = finder.analyzeChord(activePCs, key)

      // Step 4: cadence detection
      let cadence: CadenceType = null
      if (chord) {
        const lastChord = lastChordRef.current

        // Only detect cadence when chord changes
        if (!lastChord || lastChord.roman !== chord.roman || lastChord.fn !== chord.fn) {
          const isDeceptive = finder.detectDeceptive(chord)
          if (isDeceptive) {
            cadence = "deceptive"
            scene?.triggerCadence("deceptive")
          } else {
            cadence = finder.detectCadence(chord.fn)
            if (cadence) scene?.triggerCadence(cadence)
          }
          finder.updateLastFn(chord.fn)

          // Add new block to scene
          scene?.addChord(chord)
          lastChordRef.current = chord
        }
      }

      // Cadence hold display (~1.2s)
      if (cadence) {
        cadenceHoldRef.current = { type: cadence, frames: 72 }
      } else if (cadenceHoldRef.current.frames > 0) {
        cadenceHoldRef.current.frames--
        if (cadenceHoldRef.current.frames === 0) {
          cadenceHoldRef.current.type = null
        }
      }

      // Step 5: render
      scene?.update(dt)

      // Step 6: push React state at ~8fps
      if (wall - lastReadoutPush > 120) {
        lastReadoutPush = wall
        setReadout(r => ({
          ...r,
          key,
          chord: chord ?? lastChordRef.current,
          cadence: cadenceHoldRef.current.type,
          isModulating: modulating,
        }))
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // ── Start / Begin ───────────────────────────────────────────────────────────
  const onStart = useCallback(async () => {
    if (started) return

    // Create KeyFinder
    finderRef.current = new KeyFinder()

    // Audio
    const audio = new LadderAudio()
    audioRef.current = audio
    audio.onNoteEvent = (pc, vel, on) => {
      if (on) {
        activeNotesRef.current.set(pc, vel)
      } else {
        activeNotesRef.current.delete(pc)
      }
    }
    await audio.start()

    // Scene
    if (hasWebGL && hostRef.current && overlayRef.current) {
      try {
        sceneRef.current = new LadderScene(hostRef.current, overlayRef.current)
      } catch {
        setHasWebGL(false)
      }
    }

    setupMIDI()
    setStarted(true)
    runLoop()
  }, [started, hasWebGL, setupMIDI, runLoop])

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      sceneRef.current?.dispose()
      sceneRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  const { key, chord, cadence, isModulating, midiConnected } = readout

  return (
    <main className="min-h-screen bg-[#04060b] text-white font-mono px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <header className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Cadence Ladder
          </h1>
          <p className="mt-1.5 max-w-2xl text-base text-white/75">
            Real-time key estimation · Roman-numeral functional labeling · cadence detection.
            Harmony made visible — watch tension build and resolve.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">

          {/* Three.js canvas + overlay */}
          <section className="relative">
            {/* Host div — three.js renders into this */}
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-white/10 bg-[#04060b]">
              <div ref={hostRef} className="absolute inset-0" />
              {/* DOM overlay for block labels + zone labels */}
              <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
                {/* Zone labels — always present */}
                <div className="absolute right-3 text-right" style={{ top: "6%", width: "5rem" }}>
                  <div className="text-amber-300/95 text-xs font-bold uppercase tracking-widest">Dominant</div>
                  <div className="text-white/40 text-xs">V  vii°</div>
                </div>
                <div className="absolute right-3 text-right" style={{ top: "40%", width: "5rem" }}>
                  <div className="text-violet-300 text-xs font-bold uppercase tracking-widest">Subdom.</div>
                  <div className="text-white/40 text-xs">IV  ii</div>
                </div>
                <div className="absolute right-3 text-right" style={{ top: "72%", width: "5rem" }}>
                  <div className="text-emerald-300/95 text-xs font-bold uppercase tracking-widest">Tonic</div>
                  <div className="text-white/40 text-xs">I  vi  iii</div>
                </div>
              </div>

              {/* Pre-start overlay */}
              {!started && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <p className="max-w-xs text-center text-base text-white/75">
                    Press <strong className="text-white">Begin</strong> — a known progression plays and the ladder proves itself. Connect a MIDI keyboard to play your own chords.
                  </p>
                </div>
              )}

              {/* WebGL unavailable */}
              {!hasWebGL && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <p className="max-w-sm text-center text-base text-rose-300">
                    WebGL is unavailable on this device — the ladder cannot render. Key analysis and audio still run.
                  </p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
              <span><span className="text-emerald-300/95">━</span> Authentic cadence V→I</span>
              <span><span className="text-violet-300">━</span> Plagal IV→I</span>
              <span><span className="text-amber-300/95">━</span> Deceptive V→vi</span>
            </div>
          </section>

          {/* Controls + readout panel */}
          <section className="flex flex-col gap-4">

            {/* Begin button */}
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={started}
              className="min-h-[44px] w-full rounded-lg bg-emerald-500/90 px-4 py-2.5 text-base font-bold text-[#04060b] transition hover:bg-emerald-400 disabled:bg-white/15 disabled:text-white/75"
            >
              {started ? "● Running" : "▶ Begin"}
            </button>

            {/* Key banner */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/55 uppercase tracking-wider">Current key</p>
              <p className={`mt-1 text-2xl font-bold tracking-tight ${isModulating ? "text-violet-300" : "text-white"}`}>
                {key ? key.name : "——"}
                {isModulating && (
                  <span className="ml-2 text-sm font-normal text-violet-300 animate-pulse">modulating…</span>
                )}
              </p>
              {key && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-violet-400 transition-[width] duration-300"
                      style={{ width: `${Math.round(Math.max(0, Math.min(1, key.confidence)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/55 tabular-nums">
                    {Math.round(key.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Current chord */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/55 uppercase tracking-wider">Active chord</p>
              {chord ? (
                <>
                  <p className="mt-1 text-4xl font-bold tracking-tight text-white tabular-nums">
                    {chord.roman}
                    <span className="ml-2 text-xl font-normal text-white/60">{chord.symbol}</span>
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${fnColor(chord.fn)}`}>
                    {chord.fn}
                    <span className="ml-2 text-white/40 font-normal">
                      tension {Math.round(chord.tension * 100)}%
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-2xl text-white/30">——</p>
              )}
            </div>

            {/* Cadence readout */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 min-h-[72px]">
              <p className="text-xs text-white/55 uppercase tracking-wider">Cadence</p>
              {cadence ? (
                <p className={`mt-1 text-base font-semibold ${cadenceColor(cadence)}`}>
                  {cadenceLabel(cadence)}
                </p>
              ) : (
                <p className="mt-1 text-base text-white/25">—</p>
              )}
            </div>

            {/* Tension meter */}
            {chord && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs text-white/55 uppercase tracking-wider mb-2">Harmonic tension</p>
                <div className="relative h-5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(chord.tension * 100)}%`,
                      background: chord.fn === "Dominant"
                        ? "linear-gradient(to right, #f59e0b, #ef4444)"
                        : chord.fn === "Subdominant"
                        ? "linear-gradient(to right, #818cf8, #a78bfa)"
                        : "linear-gradient(to right, #10b981, #34d399)",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-white/40">
                  <span>Rest</span>
                  <span>Tension</span>
                </div>
              </div>
            )}

            {/* MIDI status */}
            <p className="text-xs text-white/55">
              {midiConnected
                ? "● MIDI keyboard connected"
                : "No MIDI detected — internal demo playing"}
            </p>

            {/* Design notes link */}
            <a
              href="/dream/365-cadence-ladder/README.md"
              className="mt-auto text-base text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              Read the design notes ↗
            </a>
          </section>
        </div>
      </div>
    </main>
  )
}
