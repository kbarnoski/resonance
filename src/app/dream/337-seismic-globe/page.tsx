"use client"

// 337-seismic-globe — hear the living planet.
// Every earthquake recorded on Earth in the last day becomes a sustained voice
// placed in 3-D space around you, while the quakes pulse on a slowly rotating
// three.js globe. The ever-shifting chord IS Earth's current seismic state.
//
// One requestAnimationFrame loop drives globe rotation + pulses by mutating the
// three.js scene and audio nodes through refs — the React tree never re-renders
// per frame. Full teardown on unmount.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchQuakes,
  topByMagnitude,
  FEEDS,
  type FeedId,
  type Quake,
} from "./quakes"
import { SeismicAudio, type VoiceLevel } from "./audio"
import { SeismicGlobe } from "./globe"

const MAX_VOICES = 24
const POLL_MS = 60_000

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

export default function Page() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const globeRef = useRef<SeismicGlobe | null>(null)
  const audioRef = useRef<SeismicAudio | null>(null)
  const quakesRef = useRef<Quake[]>([])
  const rafRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastTimeRef = useRef<number>(0)

  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [feed, setFeed] = useState<FeedId>("2.5_day")
  const [live, setLive] = useState<boolean>(false)
  const [count, setCount] = useState(0)
  const [levels, setLevels] = useState<VoiceLevel[]>([])
  const [webgl, setWebgl] = useState(true)
  const [hrtf, setHrtf] = useState(true)

  // Pull a fresh feed, reconcile the sounding set, and update globe + audio.
  const refresh = useCallback(async (f: FeedId) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const { quakes, source } = await fetchQuakes(f, ac.signal)
    const top = topByMagnitude(quakes, MAX_VOICES)
    quakesRef.current = top
    setLive(source === "live")
    setCount(quakes.length)
    globeRef.current?.setQuakes(top)
    audioRef.current?.update(top)
  }, [])

  // Initialize the globe + first data pull on mount. Auto-starts the sample/live
  // set so the visual is alive hands-free; audio waits for a user gesture.
  useEffect(() => {
    const ok = hasWebGL()
    setWebgl(ok)
    if (ok && hostRef.current) {
      globeRef.current = new SeismicGlobe(hostRef.current)
    }

    void refresh(feed)
    pollRef.current = window.setInterval(() => void refresh(feed), POLL_MS)

    const loop = (now: number) => {
      const last = lastTimeRef.current || now
      const dt = Math.min((now - last) / 1000, 0.05)
      lastTimeRef.current = now
      globeRef.current?.tick(dt, now / 1000)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (pollRef.current != null) clearInterval(pollRef.current)
      abortRef.current?.abort()
      globeRef.current?.dispose()
      globeRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
    }
    // refresh is stable; feed changes are handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch when the feed switches (after mount).
  useEffect(() => {
    if (!started) return
    void refresh(feed)
    if (pollRef.current != null) clearInterval(pollRef.current)
    pollRef.current = window.setInterval(() => void refresh(feed), POLL_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed])

  // Refresh the "loudest voices" list on a slow timer (not per frame).
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = audioRef.current
      if (a) setLevels(a.levels(quakesRef.current).slice(0, 5))
    }, 700)
    return () => clearInterval(id)
  }, [])

  // Create/resume the AudioContext INSIDE the user gesture (iOS-safe).
  const onListen = useCallback(async () => {
    if (!audioRef.current) {
      const a = new SeismicAudio()
      audioRef.current = a
      setHrtf(a.hrtf)
      a.update(quakesRef.current)
    }
    await audioRef.current.resume()
    setStarted(true)
    setPlaying(audioRef.current.state === "running")
  }, [])

  return (
    <main className="min-h-screen bg-[#03060d] text-foreground font-mono px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Seismic Globe
          </h1>
          <p className="mt-2 max-w-2xl text-base text-foreground">
            Every earthquake recorded on Earth in the last day becomes a
            sustained voice placed in 3-D space around you. The slowly shifting
            chord you hear is the planet&apos;s current seismic state.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Globe */}
          <section className="relative">
            <div
              ref={hostRef}
              className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-[#03060d]"
            />
            {!webgl && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="max-w-sm text-center text-base text-violet-300">
                  WebGL is unavailable on this device, so the 3-D globe
                  cannot render — the spatial audio still plays. Press
                  &ldquo;Listen to the planet&rdquo; below.
                </p>
              </div>
            )}
          </section>

          {/* Controls + readout */}
          <section className="flex flex-col gap-5">
            <button
              type="button"
              onClick={() => void onListen()}
              className="min-h-[44px] w-full rounded-lg bg-violet-500/90 px-4 py-2.5 text-base font-bold text-[#03060d] transition hover:bg-violet-400"
            >
              {playing ? "● Listening to the planet" : "▶ Listen to the planet"}
            </button>

            {/* Provenance badge */}
            <div className="text-base">
              {live ? (
                <span className="text-violet-300">
                  ● live USGS feed · {count} quakes
                </span>
              ) : (
                <span className="text-violet-300">
                  ● sample quakes
                </span>
              )}
            </div>
            {!live && (
              <p className="text-base text-violet-300/90">
                live feed unavailable — showing sample quakes
              </p>
            )}
            {started && !hrtf && (
              <p className="text-base text-muted-foreground">
                HRTF spatialization unavailable — using stereo panning fallback.
              </p>
            )}

            {/* Feed switcher */}
            <div>
              <p className="mb-2 text-base text-muted-foreground">feed</p>
              <div className="flex flex-wrap gap-2">
                {FEEDS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFeed(f.id)}
                    className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-base transition ${
                      feed === f.id
                        ? "border-violet-400/70 bg-violet-400/15 text-foreground"
                        : "border-border text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Loudest voices */}
            <div>
              <p className="mb-2 text-base text-muted-foreground">
                loudest voices right now
              </p>
              <ul className="space-y-1.5">
                {levels.length === 0 && (
                  <li className="text-base text-muted-foreground">
                    {started ? "listening…" : "press play to begin"}
                  </li>
                )}
                {levels.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-baseline justify-between gap-3 text-base"
                  >
                    <span className="truncate text-foreground">{v.place}</span>
                    <span className="shrink-0 text-violet-300/90">
                      M{v.mag.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href="/dream/337-seismic-globe/README.md"
              className="mt-auto text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
            >
              Read the design notes ↗
            </a>
          </section>
        </div>
      </div>
    </main>
  )
}
