"use client"

// Tempo Canon — an online dynamic-time-warping score follower that plays the
// accompaniment in sync with YOUR rubato. You play the Ode to Joy melody (demo,
// computer keyboard, or MIDI); the follower aligns your live notes to the
// reference score with streaming DTW and fires the bass + chord accompaniment
// locked to your position and tempo. The warping path — a diagonal that BENDS
// as you rush or drag — is the centerpiece visual, drawn on the GPU (WebGL2).

import { useCallback, useEffect, useRef, useState } from "react"
import {
  REFERENCE,
  HARMONY,
  KEY_MAP,
  makePerformance,
  midiToName,
} from "./score"
import { OnlineDTW } from "./dtw"
import { TempoAudio } from "./audio"
import { WarpRenderer } from "./gl"

type InputMode = "idle" | "demo" | "live"

export default function TempoCanonPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<WarpRenderer | null>(null)
  const audioRef = useRef<TempoAudio | null>(null)
  const dtwRef = useRef<OnlineDTW | null>(null)
  const rafRef = useRef<number>(0)
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const midiAccessRef = useRef<MIDIAccess | null>(null)

  // The renderer needs a frozen "rows" estimate; the live note count can exceed
  // the reference length, so size the performance axis generously.
  const ROWS = REFERENCE.length + 6

  const [glError, setGlError] = useState<string | null>(null)
  const [midiStatus, setMidiStatus] = useState<string>("not requested")
  const [mode, setMode] = useState<InputMode>("idle")
  const [position, setPosition] = useState(0)
  const [bpm, setBpm] = useState(0)
  const [harmonyLabel, setHarmonyLabel] = useState("—")
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [echoOn, setEchoOn] = useState(true)

  // Tempo estimate: maintained from inter-onset interval + path slope.
  const lastOnsetRef = useRef<number>(0)
  const bpmEmaRef = useRef<number>(0)

  // ─── One played note flows through here, whatever the source ───────────────
  const handlePlayedNote = useCallback(
    (midi: number, sourceKey?: string) => {
      const dtw = dtwRef.current
      const audio = audioRef.current
      const renderer = rendererRef.current
      if (!dtw || !audio) return

      const res = dtw.step(midi)

      // Tempo from inter-onset interval, modulated by the path slope so the
      // accompaniment breathes with rushing/dragging even within a steady IOI.
      const nowMs = performance.now()
      const dt = lastOnsetRef.current ? nowMs - lastOnsetRef.current : 0
      lastOnsetRef.current = nowMs
      if (dt > 60 && dt < 4000) {
        const rawBpm = 60000 / dt
        const prev = bpmEmaRef.current
        const ema = prev ? prev * 0.6 + rawBpm * 0.4 : rawBpm
        bpmEmaRef.current = ema
        // slope > 1 (rushing) nudges reported tempo up; < 1 (dragging) down.
        setBpm(Math.round(ema * (0.7 + 0.3 * res.slope)))
      }

      const h = HARMONY[Math.min(res.col, HARMONY.length - 1)]
      setPosition(res.col)
      setHarmonyLabel(`${h.roman} · ${midiToName(h.bass)}`)
      if (sourceKey) setLastKey(sourceKey)

      // Accompaniment is the star — fire on every committed note. Duration
      // scales inversely with slope: dragging (slope<1) → longer rings.
      const durScale = res.slope > 0 ? 1 / Math.max(0.5, res.slope) : 1
      audio.accompany(h, durScale)
      if (echoOn) audio.melodyEcho(midi)

      renderer?.addRing(res.col, dtw.path.length - 1, res.col * 0.4, nowMs)
    },
    [echoOn],
  )

  // ─── Set up GL + audio + DTW once ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      rendererRef.current = new WarpRenderer(canvas, REFERENCE.length, ROWS)
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "WebGL2 unavailable")
    }
    audioRef.current = new TempoAudio()
    dtwRef.current = new OnlineDTW(REFERENCE, 5)

    // Render loop.
    const renderer = rendererRef.current
    const loop = () => {
      const dtw = dtwRef.current
      if (renderer && dtw) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const rect = canvas.getBoundingClientRect()
        renderer.resize(rect.width, rect.height, dpr)
        // Window bounds from the last committed col (visual only between notes).
        const lastCol = dtw.path.length ? dtw.path[dtw.path.length - 1].col : 0
        renderer.render(
          dtw.path,
          Math.max(0, lastCol),
          Math.min(REFERENCE.length - 1, lastCol + 5),
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
      // Detach MIDI listeners.
      const access = midiAccessRef.current
      if (access) {
        access.inputs.forEach((inp) => (inp.onmidimessage = null))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Reset alignment state for a fresh run ─────────────────────────────────
  const resetFollower = useCallback(() => {
    dtwRef.current?.reset()
    lastOnsetRef.current = 0
    bpmEmaRef.current = 0
    setPosition(0)
    setBpm(0)
    setHarmonyLabel("—")
  }, [])

  // ─── The headline feature: play the baked rubato performance ───────────────
  const runDemo = useCallback(async () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    await audioRef.current?.resume()
    resetFollower()
    setMode("demo")

    const perf = makePerformance()
    let i = 0
    const playNext = () => {
      if (i >= perf.length) {
        setMode("idle")
        return
      }
      const ev = perf[i]
      handlePlayedNote(ev.midi)
      i += 1
      if (i < perf.length) {
        demoTimerRef.current = setTimeout(playNext, perf[i].dtMs)
      } else {
        setMode("idle")
      }
    }
    // First note after a short lead-in.
    demoTimerRef.current = setTimeout(playNext, 350)
  }, [handlePlayedNote, resetFollower])

  const stopDemo = useCallback(() => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    demoTimerRef.current = null
    setMode("idle")
  }, [])

  // ─── Computer keyboard input ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.repeat) return
      const km = KEY_MAP.find((k) => k.key === e.key.toLowerCase())
      if (!km) return
      e.preventDefault()
      if (mode === "demo") stopDemo()
      if (mode !== "live") {
        await audioRef.current?.resume()
        // If switching from idle into a fresh live run, reset only if at start.
        if (dtwRef.current && dtwRef.current.path.length === 0) resetFollower()
        setMode("live")
      }
      handlePlayedNote(km.midi, km.key)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, handlePlayedNote, resetFollower, stopDemo])

  // ─── Web MIDI input (graceful) ─────────────────────────────────────────────
  const requestMidi = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      setMidiStatus("Web MIDI not supported in this browser")
      return
    }
    try {
      const access = await navigator.requestMIDIAccess()
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
          const note = data[1]
          const vel = data[2]
          if (status === 0x90 && vel > 0) {
            if (mode === "demo") stopDemo()
            await audioRef.current?.resume()
            if (mode !== "live") setMode("live")
            handlePlayedNote(note)
          }
        }
      })
    } catch (e) {
      setMidiStatus(
        "access denied: " + (e instanceof Error ? e.message : "unknown"),
      )
    }
  }, [mode, handlePlayedNote, stopDemo])

  const refLen = REFERENCE.length

  return (
    <main className="min-h-screen bg-[#06060b] text-white px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Tempo Canon</h1>
          <p className="mt-2 text-base text-white/75 max-w-2xl">
            A live score-follower that plays the accompaniment in sync with your
            rubato. You play the <span className="text-white/95">Ode to Joy</span>{" "}
            melody; online DTW aligns your performance to the score in real time
            and the bass &amp; chords lock to your position and tempo.
          </p>
        </header>

        {/* Primary control */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            onClick={mode === "demo" ? stopDemo : runDemo}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-400/30 text-base font-medium transition-colors"
          >
            {mode === "demo" ? "■ Stop demo" : "Play demo ▸"}
          </button>
          <button
            onClick={() => {
              stopDemo()
              resetFollower()
              setMode("idle")
            }}
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

        {/* The warping-path GPU visual */}
        <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-white/10 bg-black">
          {glError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-rose-300 text-base">
                WebGL2 is unavailable, so the warping-path visual can&apos;t
                render here ({glError}). The follower and audio still work — try
                the demo or your keyboard.
              </p>
            </div>
          ) : (
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          )}
          {/* Axis labels */}
          <span className="pointer-events-none absolute left-3 top-3 text-xs font-mono text-white/55">
            ↑ your performance time
          </span>
          <span className="pointer-events-none absolute right-3 bottom-3 text-xs font-mono text-white/55">
            reference score time →
          </span>
        </div>

        {/* Live readouts */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Readout label="Mode" value={modeLabel(mode)} />
          <Readout
            label="Score position"
            value={`${Math.min(position + 1, refLen)} / ${refLen}`}
          />
          <Readout label="Tempo" value={bpm ? `${bpm} BPM` : "—"} />
          <Readout label="Harmony" value={harmonyLabel} />
        </div>

        {/* Keyboard map */}
        <section className="mt-7">
          <h2 className="text-xl font-medium mb-3">Play it yourself</h2>
          <p className="text-base text-white/75 mb-3 max-w-2xl">
            Tap the home-row keys to play the melody. The follower aligns
            whatever you play — rush and the path steepens; drag and it flattens.
            The accompaniment follows you.
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
                <span className="text-base font-mono uppercase text-white/95">
                  {k.key}
                </span>
                <span className="text-xs text-white/55">{k.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-base text-white/55">MIDI: {midiStatus}</p>
        </section>

        {/* Design notes */}
        <section className="mt-8 border-t border-white/10 pt-5">
          <h2 className="text-xl font-medium mb-2">Design notes</h2>
          <p className="text-base text-white/75 max-w-2xl">
            The engine is online (streaming) dynamic time warping — a bounded
            search window grows the alignment path one note at a time, in the
            spirit of Dixon&apos;s MATCH (2005). Local tempo comes from the{" "}
            <span className="text-white/95">slope of the warping path</span>:
            steeper than 45° means you&apos;re rushing, shallower means
            dragging. Full method, references (incl. Matchmaker, arXiv
            2510.10087), and honest caveats are in{" "}
            <span className="font-mono text-violet-300">README.md</span> in this
            prototype&apos;s folder.
          </p>
        </section>
      </div>
    </main>
  )
}

function modeLabel(m: InputMode): string {
  if (m === "demo") return "Demo (rubato)"
  if (m === "live") return "Live"
  return "Idle"
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/55 font-mono">
        {label}
      </div>
      <div className="mt-1 text-base text-white/95 font-mono">{value}</div>
    </div>
  )
}
