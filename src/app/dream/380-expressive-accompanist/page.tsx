"use client"

// Expressive Accompanist — Cycle 2 of the Resonance "Accompanist" thread.
//
// Cycle 1 (375-tempo-canon) shipped online-DTW tempo following. This deepening
// adds EXPRESSIVE COUPLING: the soloist's velocity drives the accompaniment's
// dynamics, and the soloist's articulation (legato vs staccato) drives the
// accompaniment's articulation. Central thesis of The ACCompanion
// (Cancino-Chacón, Peter, Widmer, IJCAI 2023, arXiv:2304.12939).
//
// Centerpiece: WebGL2 "expression ribbon" — the warping path whose thickness
// encodes live dynamics and whose dashing encodes articulation.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  REFERENCE,
  HARMONY,
  KEY_MAP,
  makePerformance,
  midiToName,
} from "./score"
import { OnlineDTW } from "./dtw"
import { ExpressiveAudio } from "./audio"
import { ExpressionRenderer } from "./gl"

type InputMode = "idle" | "demo" | "live"

export default function ExpressiveAccompanistPage() {
  const canvasRef     = useRef<HTMLCanvasElement | null>(null)
  const rendererRef   = useRef<ExpressionRenderer | null>(null)
  const audioRef      = useRef<ExpressiveAudio | null>(null)
  const dtwRef        = useRef<OnlineDTW | null>(null)
  const rafRef        = useRef<number>(0)
  const demoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const midiAccessRef = useRef<MIDIAccess | null>(null)

  // Carry the previous note's held-duration into the next note's DTW step.
  // Set on key-up / note-off; consumed on the next key-down / note-on.
  const lastDurMsRef  = useRef<number>(0)

  // Performance axis height: ref length + generous buffer.
  const ROWS = REFERENCE.length + 8

  // ── UI state ────────────────────────────────────────────────────────────────
  const [glError,      setGlError]      = useState<string | null>(null)
  const [midiStatus,   setMidiStatus]   = useState("not requested")
  const [mode,         setMode]         = useState<InputMode>("idle")
  const [position,     setPosition]     = useState(0)
  const [bpm,          setBpm]          = useState(0)
  const [harmonyLabel, setHarmonyLabel] = useState("—")
  const [lastKey,      setLastKey]      = useState<string | null>(null)
  const [echoOn,       setEchoOn]       = useState(true)
  const [dynPct,       setDynPct]       = useState(50)
  const [accompDynPct, setAccompDynPct] = useState(50)
  const [articLabel,   setArticLabel]   = useState("—")
  const [isConfident,  setIsConfident]  = useState(false)

  // Tempo EMA state in refs (stable across renders).
  const lastOnsetRef = useRef<number>(0)
  const bpmEmaRef    = useRef<number>(0)

  // Mode ref: so stable callbacks can read current mode without re-binding.
  const modeRef = useRef<InputMode>("idle")
  useEffect(() => { modeRef.current = mode }, [mode])

  // echoOn ref for the same reason.
  const echoOnRef = useRef(true)
  useEffect(() => { echoOnRef.current = echoOn }, [echoOn])

  // ── Core: one played-note pipe ───────────────────────────────────────────────
  // All input sources (demo / keyboard / MIDI) flow through here.
  // midi: pitch, velocity: 0-127, durationMs: held time (0 if unknown),
  // nowMs: wall clock, sourceKey: optional keyboard key for highlight.
  const handlePlayedNote = useCallback(
    (
      midi: number,
      velocity: number,
      durationMs: number,
      nowMs: number,
      sourceKey?: string,
    ) => {
      const dtw      = dtwRef.current
      const audio    = audioRef.current
      const renderer = rendererRef.current
      if (!dtw || !audio) return

      const res = dtw.step(midi, velocity, durationMs, nowMs)

      // Tempo readout from inter-onset interval × path slope.
      const dt = lastOnsetRef.current ? nowMs - lastOnsetRef.current : 0
      lastOnsetRef.current = nowMs
      if (dt > 70 && dt < 4000) {
        const rawBpm = 60000 / dt
        const prev   = bpmEmaRef.current
        const ema    = prev ? prev * 0.6 + rawBpm * 0.4 : rawBpm
        bpmEmaRef.current = ema
        setBpm(Math.round(ema * (0.65 + 0.35 * res.slope)))
      }

      const h = HARMONY[Math.min(res.col, HARMONY.length - 1)]
      setPosition(res.col)
      setHarmonyLabel(`${h.roman} · ${midiToName(h.bass)}`)
      if (sourceKey) setLastKey(sourceKey)
      setIsConfident(res.confident)

      const velPct = Math.round((res.smoothedVelocity / 127) * 100)
      setDynPct(velPct)
      setAccompDynPct(Math.max(5, Math.round(velPct * 0.82)))

      const ar = res.smoothedArticulation
      setArticLabel(ar > 0.55 ? "legato" : ar > 0.35 ? "mixed" : "staccato")

      // Tempo-coupled chord duration: dragging → longer decay.
      const durScale = res.slope > 0 ? 1 / Math.max(0.5, res.slope) : 1
      audio.accompany(h, res.smoothedVelocity, res.smoothedArticulation, durScale)
      if (echoOnRef.current) audio.melodyEcho(midi, velocity)

      // GPU fire-ring: size encodes accompaniment loudness.
      const loudnessNorm = res.smoothedVelocity / 127
      renderer?.addRing(res.col, dtw.path.length - 1, res.col * 0.45, loudnessNorm, nowMs)
    },
    [],
  )

  // ── Set up GL + audio + DTW on mount ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      rendererRef.current = new ExpressionRenderer(canvas, REFERENCE.length, ROWS)
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "WebGL2 unavailable")
    }

    audioRef.current = new ExpressiveAudio()
    dtwRef.current   = new OnlineDTW(REFERENCE, 5)

    const renderer = rendererRef.current
    const loop = () => {
      const dtw = dtwRef.current
      if (renderer && dtw) {
        const dpr  = Math.min(2, window.devicePixelRatio || 1)
        const rect = canvas.getBoundingClientRect()
        renderer.resize(rect.width, rect.height, dpr)
        const lastCol = dtw.path.length ? dtw.path[dtw.path.length - 1].col : 0
        renderer.render(
          dtw.path,
          Math.max(0, lastCol),
          Math.min(REFERENCE.length - 1, lastCol + 5),
          dtw.smoothedVelocity / 127,
          dtw.smoothedArticulation,
          performance.now(),
        )
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
      rendererRef.current?.dispose()
      rendererRef.current = null
      void audioRef.current?.dispose()
      audioRef.current = null
      const access = midiAccessRef.current
      if (access) access.inputs.forEach((inp) => { inp.onmidimessage = null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reset follower ──────────────────────────────────────────────────────────
  const resetFollower = useCallback(() => {
    dtwRef.current?.reset()
    lastOnsetRef.current = 0
    bpmEmaRef.current    = 0
    lastDurMsRef.current = 0
    setPosition(0)
    setBpm(0)
    setHarmonyLabel("—")
    setDynPct(50)
    setAccompDynPct(50)
    setArticLabel("—")
    setIsConfident(false)
    setLastKey(null)
  }, [])

  // ── Demo ────────────────────────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    await audioRef.current?.resume()
    resetFollower()
    setMode("demo")
    modeRef.current = "demo"

    const perf = makePerformance()
    let i = 0
    const playNext = () => {
      if (i >= perf.length) {
        setMode("idle")
        modeRef.current = "idle"
        return
      }
      const ev = perf[i]
      handlePlayedNote(ev.midi, ev.velocity, ev.durationMs, performance.now())
      i += 1
      if (i < perf.length) {
        demoTimerRef.current = setTimeout(playNext, perf[i].dtMs)
      } else {
        demoTimerRef.current = setTimeout(() => {
          setMode("idle")
          modeRef.current = "idle"
        }, 1200)
      }
    }
    demoTimerRef.current = setTimeout(playNext, 300)
  }, [handlePlayedNote, resetFollower])

  const stopDemo = useCallback(() => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    demoTimerRef.current = null
    setMode("idle")
    modeRef.current = "idle"
  }, [])

  // ── Auto-play demo on load ──────────────────────────────────────────────────
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (autoPlayedRef.current) return
    autoPlayedRef.current = true
    const tid = setTimeout(async () => {
      try {
        await audioRef.current?.resume()
        await runDemo()
      } catch {
        // Autoplay blocked by browser policy — user can press the button.
      }
    }, 1800)
    return () => clearTimeout(tid)
  }, [runDemo])

  // ── Computer keyboard — single, stable effect using refs ────────────────────
  // handlePlayedNoteRef is stable (handlePlayedNote has no deps).
  const handlePlayedNoteRef = useRef(handlePlayedNote)
  useEffect(() => { handlePlayedNoteRef.current = handlePlayedNote }, [handlePlayedNote])

  const stopDemoRef = useRef(stopDemo)
  useEffect(() => { stopDemoRef.current = stopDemo }, [stopDemo])

  const resetFollowerRef = useRef(resetFollower)
  useEffect(() => { resetFollowerRef.current = resetFollower }, [resetFollower])

  useEffect(() => {
    // Track key-down times locally for articulation sensing.
    const keyDownTimes = new Map<string, number>()

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.repeat) return
      const km = KEY_MAP.find((k) => k.key === e.key.toLowerCase())
      if (!km) return
      e.preventDefault()

      if (modeRef.current === "demo") stopDemoRef.current()
      if (modeRef.current !== "live") {
        await audioRef.current?.resume()
        if (dtwRef.current && dtwRef.current.path.length === 0) {
          resetFollowerRef.current()
        }
        setMode("live")
        modeRef.current = "live"
      }

      // Carry the previous note's duration into this step.
      const prevDur = lastDurMsRef.current
      lastDurMsRef.current = 0
      keyDownTimes.set(km.key, performance.now())
      handlePlayedNoteRef.current(km.midi, 80, prevDur, performance.now(), km.key)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const km = KEY_MAP.find((k) => k.key === e.key.toLowerCase())
      if (!km) return
      const downAt = keyDownTimes.get(km.key)
      if (downAt !== undefined) {
        lastDurMsRef.current = performance.now() - downAt
        keyDownTimes.delete(km.key)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, []) // stable: all mutable state accessed through refs

  // ── Web MIDI ────────────────────────────────────────────────────────────────
  const requestMidi = useCallback(async () => {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      setMidiStatus("Web MIDI not supported in this browser")
      return
    }
    try {
      const access = await (navigator as Navigator & {
        requestMIDIAccess: () => Promise<MIDIAccess>
      }).requestMIDIAccess()
      midiAccessRef.current = access
      const count = access.inputs.size
      setMidiStatus(
        count > 0
          ? `connected — ${count} input${count > 1 ? "s" : ""}`
          : "granted — no MIDI inputs found",
      )
      access.inputs.forEach((input) => {
        input.onmidimessage = async (msg: MIDIMessageEvent) => {
          const data = msg.data
          if (!data) return
          const status = data[0] & 0xf0
          const note   = data[1]
          const vel    = data[2]
          if (status === 0x90 && vel > 0) {
            // Note-on.
            if (modeRef.current === "demo") stopDemoRef.current()
            await audioRef.current?.resume()
            if (modeRef.current !== "live") {
              setMode("live")
              modeRef.current = "live"
            }
            const prevDur = lastDurMsRef.current
            lastDurMsRef.current = 0
            handlePlayedNoteRef.current(note, vel, prevDur, performance.now())
          } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
            // Note-off: store held time approximation for next note.
            lastDurMsRef.current = 300
          }
        }
      })
    } catch (e) {
      setMidiStatus("access denied: " + (e instanceof Error ? e.message : "unknown"))
    }
  }, [])

  const refLen = REFERENCE.length

  return (
    <main className="min-h-screen bg-[#07060d] text-white px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Expressive Accompanist
          </h1>
          <p className="mt-2 text-base text-white/75 max-w-2xl">
            An online-DTW score follower that couples to the soloist in{" "}
            <span className="text-white/95">three dimensions</span>: tempo,
            dynamics, and articulation — so it feels like a real duet partner.
            Play the Pachelbel Canon melody; the machine plays bass &amp; chords
            matching your loudness and legato/staccato phrase-by-phrase.
          </p>
        </header>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            onClick={mode === "demo" ? stopDemo : runDemo}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-400/30 text-base font-medium transition-colors"
          >
            {mode === "demo" ? "■ Stop demo" : "Play demo ▸"}
          </button>
          <button
            onClick={() => { stopDemo(); resetFollower(); setMode("idle") }}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/5 text-white/75 hover:bg-white/10 border border-white/10 text-base transition-colors"
          >
            Reset
          </button>
          <button
            onClick={requestMidi}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/5 text-white/75 hover:bg-white/10 border border-white/10 text-base transition-colors"
          >
            Connect MIDI
          </button>
          <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-base text-white/75 cursor-pointer">
            <input
              type="checkbox"
              checked={echoOn}
              onChange={(e) => setEchoOn(e.target.checked)}
              className="accent-violet-400"
            />
            Melody echo
          </label>
        </div>

        {/* ── WebGL2 canvas ────────────────────────────────────────────────── */}
        <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-white/10 bg-black">
          {glError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-rose-300 text-base leading-relaxed">
                WebGL2 is unavailable here ({glError}). The follower and audio
                still work — press &ldquo;Play demo&rdquo; or use your keyboard.
              </p>
            </div>
          ) : (
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          )}
          <span className="pointer-events-none absolute left-3 top-3 text-xs font-mono text-white/55">
            ↑ your performance time
          </span>
          <span className="pointer-events-none absolute right-3 bottom-3 text-xs font-mono text-white/55">
            reference score time →
          </span>
          <div className="pointer-events-none absolute left-3 bottom-3 flex flex-col gap-0.5">
            <span className="text-xs text-violet-300/70 font-mono">ribbon width = dynamics</span>
            <span className="text-xs text-violet-300/70 font-mono">ribbon dash = staccato</span>
          </div>
        </div>

        {/* ── Position / tempo / harmony readouts ─────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Readout label="Mode"     value={labelForMode(mode)} />
          <Readout label="Position" value={`${Math.min(position + 1, refLen)} / ${refLen}`} />
          <Readout label="Tempo"    value={bpm ? `${bpm} BPM` : "—"} />
          <Readout label="Harmony"  value={harmonyLabel} />
        </div>

        {/* ── Expression meters (the new cycle-2 readouts) ─────────────────── */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MeterReadout
            label="Soloist dynamics"
            pct={dynPct}
            barColor="bg-violet-400"
          />
          <MeterReadout
            label="Accompaniment dynamics"
            pct={accompDynPct}
            barColor="bg-violet-600"
          />
          <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-white/55 font-mono mb-2">
              Articulation
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-base font-mono ${
                  articLabel === "legato"
                    ? "text-violet-300"
                    : articLabel === "staccato"
                    ? "text-amber-300"
                    : "text-white/75"
                }`}
              >
                {articLabel}
              </span>
              <span
                className={`ml-auto text-xs font-mono rounded px-2 py-0.5 border ${
                  isConfident
                    ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"
                    : "text-white/55 border-white/10 bg-white/5"
                }`}
              >
                {isConfident ? "lock ✓" : "seeking…"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Keyboard map ─────────────────────────────────────────────────── */}
        <section className="mt-7">
          <h2 className="text-xl font-medium mb-3">Play it yourself</h2>
          <p className="text-base text-white/75 mb-3 max-w-2xl">
            Home-row keys play the Pachelbel Canon melody in D major. Hold keys
            longer for legato phrasing, tap quickly for staccato — the
            accompaniment will follow your articulation. Use MIDI for full
            velocity-driven dynamics.
          </p>
          <div className="flex flex-wrap gap-2">
            {KEY_MAP.map((k) => (
              <div
                key={k.key}
                className={`flex flex-col items-center justify-center min-w-[54px] min-h-[54px] rounded-lg border text-center transition-colors ${
                  lastKey === k.key
                    ? "bg-violet-500/30 border-violet-300/50"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <span className="text-base font-mono uppercase text-white/95">{k.key}</span>
                <span className="text-xs text-white/55">{k.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-base text-white/55">
            MIDI: <span className="text-white/75">{midiStatus}</span>
          </p>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="mt-8 border-t border-white/10 pt-5">
          <h2 className="text-xl font-medium mb-3">How the coupling works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-base text-white/75">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-white/95 font-medium mb-1">1. Tempo</div>
              Online DTW (Dixon&apos;s MATCH, 2005): bounded search window grows
              the path one note at a time. Slope of the path = local tempo. Steeper
              than 45° → rushing; shallower → dragging. Chord placement locks to
              your position.
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-white/95 font-medium mb-1">2. Dynamics</div>
              Your note velocity is EMA-smoothed and maps directly to accompaniment
              gain. Soft playing → quiet chords; loud swell → the chords swell with
              you. The ribbon&apos;s{" "}
              <span className="text-violet-300">thickness</span> encodes this live.
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-white/95 font-medium mb-1">3. Articulation</div>
              Duration ÷ inter-onset-interval = articulation ratio. Legato (high ratio)
              → long chord decays. Staccato (low) → detached chords. The ribbon{" "}
              <span className="text-amber-300">dashes</span> when you go staccato.
            </div>
          </div>
          <p className="mt-4 text-base text-white/55 max-w-2xl">
            The baked demo has a deliberate expressive arc: steady intro →
            accelerando → ritardando; crescendo → diminuendo; legato first half →
            staccato second half. Watch the ribbon change as each phase passes.
            Full references and design notes:{" "}
            <span className="font-mono text-violet-300 text-sm">
              src/app/dream/380-expressive-accompanist/README.md
            </span>
          </p>
        </section>

      </div>
    </main>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function labelForMode(m: InputMode): string {
  if (m === "demo") return "Demo (auto)"
  if (m === "live") return "Live"
  return "Idle"
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/55 font-mono">{label}</div>
      <div className="mt-1 text-base text-white/95 font-mono">{value}</div>
    </div>
  )
}

function MeterReadout({
  label,
  pct,
  barColor,
}: {
  label: string
  pct: number
  barColor: string
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/55 font-mono mb-2">{label}</div>
      <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${barColor}`}
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-white/55 font-mono text-right">{pct}%</div>
    </div>
  )
}
