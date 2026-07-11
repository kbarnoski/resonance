"use client"

// 358-beat-mirror — make the machine's listening legible.
// A real-time beat & tempo tracker: it computes a spectral-flux onset-strength
// signal from live audio, induces tempo by autocorrelating the onset envelope,
// and locks a visual pulse to the predicted beat — showing the BPM it heard and
// how confident it is. Defaults to a synthesized 112 BPM groove (you know the
// right answer, which proves the pipeline); switch to the mic to clap at it.
//
// One requestAnimationFrame loop reads the AnalyserNode, advances the tracker,
// and mutates the three.js scene through refs. React state updates only the
// slow readout (BPM / confidence) a few times a second. Full teardown on unmount.

import { useCallback, useEffect, useRef, useState } from "react"
import { BeatMirrorAudio, type Source } from "./audio"
import { BeatTracker } from "./tracker"
import { BeatScene } from "./scene"

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

interface Readout {
  bpm: number
  confidence: number
}

export default function Page() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<BeatMirrorAudio | null>(null)
  const trackerRef = useRef<BeatTracker | null>(null)
  const sceneRef = useRef<BeatScene | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number>(0)
  const pcmRef = useRef<Float32Array | null>(null)

  const [started, setStarted] = useState(false)
  const [webgl, setWebgl] = useState(true)
  const [source, setSource] = useState<Source>("groove")
  const [micError, setMicError] = useState<string | null>(null)
  const [readout, setReadout] = useState<Readout>({ bpm: 0, confidence: 0 })

  useEffect(() => {
    setWebgl(hasWebGL())
  }, [])

  // The animation loop. Reads PCM → tracker → scene every frame; pushes the
  // slow BPM/confidence readout into React state at most ~8×/sec.
  const startLoop = useCallback(() => {
    let lastReadoutPush = 0
    const loop = () => {
      const audio = audioRef.current
      const tracker = trackerRef.current
      const scene = sceneRef.current
      const analyser = audio?.analyser
      const ctx = audio?.context
      if (audio && tracker && analyser && ctx) {
        const buf =
          pcmRef.current && pcmRef.current.length === analyser.fftSize
            ? pcmRef.current
            : (pcmRef.current = new Float32Array(
                new ArrayBuffer(analyser.fftSize * 4)
              ))
        analyser.getFloatTimeDomainData(
          buf as unknown as Float32Array<ArrayBuffer>
        )
        const now = ctx.currentTime
        const r = tracker.update(buf, now)

        const wall = performance.now()
        const dt = lastFrameRef.current
          ? Math.min((wall - lastFrameRef.current) / 1000, 0.05)
          : 0.016
        lastFrameRef.current = wall

        scene?.update(r, dt)

        if (wall - lastReadoutPush > 120) {
          lastReadoutPush = wall
          setReadout({ bpm: r.bpm, confidence: r.confidence })
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // Create AudioContext + scene INSIDE the user gesture (iOS-safe).
  const onStart = useCallback(async () => {
    if (started) return
    const audio = new BeatMirrorAudio()
    audioRef.current = audio
    const analyser = await audio.start()
    trackerRef.current = new BeatTracker(analyser.fftSize)

    if (webgl && hostRef.current && !sceneRef.current) {
      try {
        sceneRef.current = new BeatScene(hostRef.current)
      } catch {
        setWebgl(false)
      }
    }
    setStarted(true)
    startLoop()
  }, [started, webgl, startLoop])

  const onToggleSource = useCallback(
    async (src: Source) => {
      const audio = audioRef.current
      if (!audio) {
        setSource(src) // remember intent; applied after Start
        return
      }
      await audio.setSource(src)
      setSource(audio.source)
      setMicError(audio.micError)
    },
    []
  )

  // Teardown.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      sceneRef.current?.dispose()
      sceneRef.current = null
      trackerRef.current?.dispose()
      trackerRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  const conf = readout.confidence
  const confLabel =
    conf > 0.55 ? "locked" : conf > 0.28 ? "tracking" : "searching"
  const confColor =
    conf > 0.55
      ? "text-violet-300/95"
      : conf > 0.28
        ? "text-violet-300"
        : "text-violet-300/95"

  return (
    <main className="min-h-screen bg-[#04060b] text-foreground font-mono px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Beat Mirror
          </h1>
          <p className="mt-2 max-w-2xl text-base text-foreground">
            A real-time beat tracker that finds the pulse in live audio and locks
            a visual to it — showing you the BPM it heard, and how sure it is.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Scene */}
          <section className="relative">
            <div
              ref={hostRef}
              className="aspect-[8/5] w-full overflow-hidden rounded-xl border border-border bg-[#04060b]"
            />
            {!started && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="max-w-sm text-center text-base text-muted-foreground">
                  Press Start — a 112 BPM groove plays and the tracker locks to
                  it. Then switch to the mic and clap.
                </p>
              </div>
            )}
            {!webgl && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="max-w-sm text-center text-base text-violet-300">
                  WebGL is unavailable on this device, so the pulse/scope cannot
                  render — the audio and tempo tracking still run.
                </p>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-base text-muted-foreground">
              <span>
                <span className="text-violet-300">━</span> onset strength
              </span>
              <span>
                <span className="text-violet-300">│</span> predicted beat
              </span>
              <span>
                <span className="text-foreground">│</span> detected onset
              </span>
            </div>
          </section>

          {/* Controls + readout */}
          <section className="flex flex-col gap-5">
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={started}
              className="min-h-[44px] w-full rounded-lg bg-violet-500/90 px-4 py-2.5 text-base font-bold text-[#04060b] transition hover:bg-violet-400 disabled:bg-muted disabled:text-muted-foreground"
            >
              {started ? "● Listening" : "▶ Start"}
            </button>

            {/* BPM hero readout */}
            <div className="rounded-xl border border-border bg-muted px-5 py-4">
              <p className="text-base text-muted-foreground">detected tempo</p>
              <p className="mt-1 text-6xl font-bold tabular-nums tracking-tight text-foreground">
                {started && readout.bpm > 0 ? Math.round(readout.bpm) : "––"}
                <span className="ml-2 text-xl font-normal text-muted-foreground">
                  BPM
                </span>
              </p>

              {/* confidence */}
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-base">
                  <span className="text-muted-foreground">confidence</span>
                  <span className={`tabular-nums ${confColor}`}>
                    {confLabel} · {Math.round(conf * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ${
                      conf > 0.55
                        ? "bg-violet-400"
                        : conf > 0.28
                          ? "bg-violet-400"
                          : "bg-violet-400"
                    }`}
                    style={{ width: `${Math.max(3, Math.round(conf * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Source toggle */}
            <div>
              <p className="mb-2 text-base text-muted-foreground">source</p>
              <div className="flex gap-2">
                {(["groove", "mic"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void onToggleSource(s)}
                    className={`min-h-[44px] flex-1 rounded-lg border px-4 py-2.5 text-base transition ${
                      source === s
                        ? "border-violet-400/70 bg-violet-400/15 text-foreground"
                        : "border-border text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {s === "groove" ? "Groove · 112" : "Mic"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-base text-muted-foreground">
                {source === "groove"
                  ? "Internal 112 BPM drum loop — the known answer."
                  : "Listening to the room. Analysis only — never recorded or uploaded."}
              </p>
            </div>

            {micError && (
              <p className="text-base text-violet-300">{micError}</p>
            )}

            <a
              href="/dream/358-beat-mirror/README.md"
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
