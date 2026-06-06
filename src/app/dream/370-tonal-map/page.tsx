"use client"

// 370-tonal-map — Chew Spiral Array tonal map with comet center-of-effect.
//
// Watch your music's modulations as a MAP. A comet of tonal gravity glides
// across labeled key territories (circle-of-fifths layout); its halo widens
// when focus drops during a modulation. The internal demo auto-plays a
// modulating progression (C → G → D → Em → C) so the comet visibly crosses
// territory boundaries.
//
// Stack: Next.js 14 "use client" · three.js orthographic top-down · Web Audio
// API · Krumhansl-Schmuckler key estimation · Chew center-of-effect math.

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { TonalAudio } from "./audio"
import { KeyFinder } from "./key-finder"
import { TonalMapScene } from "./scene"
import { buildChordInfo, centerOfEffect, computeTonalFocus, findTerritory } from "./tonal-map"

// ─── WebGL detection ──────────────────────────────────────────────────────────

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

// ─── HUD state ────────────────────────────────────────────────────────────────

interface HUDState {
  keyName: string
  chordSymbol: string
  roman: string
  focus: number           // [0..1]
  modBanner: string       // "" or "C → G"
  isModulating: boolean
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  const hostRef   = useRef<HTMLDivElement | null>(null)
  const sceneRef  = useRef<TonalMapScene | null>(null)
  const audioRef  = useRef<TonalAudio | null>(null)
  const finderRef = useRef<KeyFinder | null>(null)
  const rafRef    = useRef<number | null>(null)
  const lastTRef  = useRef<number>(0)

  // Persistent state for HUD (updated at most every 4 frames to avoid spam)
  const hudFrameRef    = useRef(0)
  const lastKeyNameRef = useRef("C major")
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [started,  setStarted]  = useState(false)
  const [webgl,    setWebgl]    = useState(true)
  const [hud, setHud] = useState<HUDState>({
    keyName: "C major",
    chordSymbol: "—",
    roman: "—",
    focus: 0.5,
    modBanner: "",
    isModulating: false,
  })

  // ── rAF loop ──────────────────────────────────────────────────────────────

  const runLoop = useCallback((now: number) => {
    const last = lastTRef.current || now
    const dt   = Math.min((now - last) / 1000, 0.05)
    lastTRef.current = now

    const audio  = audioRef.current
    const scene  = sceneRef.current
    const finder = finderRef.current
    if (!audio || !scene || !finder) {
      rafRef.current = requestAnimationFrame(runLoop)
      return
    }

    // Feed active PCs to KeyFinder
    const velocities = new Map<number, number>()
    audio.activePCs.forEach((w, pc) => velocities.set(pc, w))
    finder.addNotes(new Set(audio.activePCs.keys()), velocities, dt)

    // Estimate key
    const keyState = finder.estimateKey()

    // Center of effect
    const coe = centerOfEffect(audio.activePCs)

    // Tonal focus
    const recentPCs = finder.recentPCWeights()
    const focus = computeTonalFocus(recentPCs, coe)

    // Territory for current key
    const territory = findTerritory(keyState.root, keyState.mode)

    // Drive scene
    scene.tick(coe, focus, territory.root)
    scene.render()

    // HUD update (every 4 frames to avoid thrashing React)
    hudFrameRef.current++
    if (hudFrameRef.current % 4 === 0) {
      const chord = buildChordInfo(audio.activePCs, keyState.root, keyState.mode)
      const chordSymbol = chord?.symbol ?? "—"
      const roman       = chord?.roman ?? "—"

      const newKey = keyState.name
      let modBanner = ""
      const isModulating = finder.isModulating()

      if (newKey !== lastKeyNameRef.current && isModulating) {
        const fromShort = lastKeyNameRef.current.replace(" major", "").replace(" minor", "m")
        const toShort   = newKey.replace(" major", "").replace(" minor", "m")
        modBanner = `${fromShort} → ${toShort}`

        // Clear any existing banner timer then set a new one
        if (bannerTimerRef.current != null) clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = setTimeout(() => {
          setHud(prev => ({ ...prev, modBanner: "", isModulating: false }))
        }, 2500)
      }

      if (newKey !== lastKeyNameRef.current) {
        lastKeyNameRef.current = newKey
      }

      setHud(prev => ({
        keyName: newKey,
        chordSymbol,
        roman,
        focus,
        modBanner: modBanner || prev.modBanner,
        isModulating: isModulating || prev.isModulating,
      }))
    }

    rafRef.current = requestAnimationFrame(runLoop)
  }, [])

  // ── Mount: check WebGL ────────────────────────────────────────────────────

  useEffect(() => {
    setWebgl(hasWebGL())
  }, [])

  // ── Begin tap ────────────────────────────────────────────────────────────

  const onBegin = useCallback(async () => {
    if (started) return

    // Build scene (needs DOM element)
    if (hostRef.current && hasWebGL()) {
      sceneRef.current = new TonalMapScene(hostRef.current)
    }

    // Build audio (iOS: must be in user gesture)
    const audio = new TonalAudio()
    audioRef.current = audio
    await audio.start()

    // Build key finder
    finderRef.current = new KeyFinder()

    setStarted(true)

    // Start rAF loop
    rafRef.current = requestAnimationFrame(runLoop)
  }, [started, runLoop])

  // ── Teardown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (bannerTimerRef.current != null) clearTimeout(bannerTimerRef.current)
      sceneRef.current?.dispose()
      sceneRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  // ── Focus bar color ───────────────────────────────────────────────────────
  const focusPct = Math.round(hud.focus * 100)
  const focusColor =
    hud.focus > 0.65 ? "bg-emerald-400" :
    hud.focus > 0.35 ? "bg-amber-400"   :
    "bg-rose-400"

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#080d1a] text-white font-mono px-4 py-7 sm:px-7">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <header className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Tonal Map
          </h1>
          <p className="mt-1 max-w-2xl text-base text-white/80">
            Watch a comet of tonal gravity glide across labeled key territories —
            modulations are literal map crossings. The halo widens when the music
            is harmonically unstable.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">

          {/* Canvas host */}
          <section className="relative">
            <div
              ref={hostRef}
              className="aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-[#080d1a]"
            />

            {/* No-WebGL fallback */}
            {!webgl && (
              <div className="absolute inset-0 flex items-center justify-center p-6 rounded-xl">
                <p className="max-w-sm text-center text-base text-rose-300">
                  WebGL is unavailable on this device — the 3-D map cannot render.
                  The audio tonal analysis is still running and you can read the
                  key / chord info in the panel.
                </p>
              </div>
            )}

            {/* Begin button overlay (before started) */}
            {!started && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm">
                <button
                  onClick={() => void onBegin()}
                  className="min-h-[44px] px-8 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-base font-semibold tracking-wide transition-colors"
                >
                  Begin
                </button>
              </div>
            )}

            {/* Modulation banner */}
            {hud.isModulating && hud.modBanner && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-violet-900/80 border border-violet-400/50 backdrop-blur-sm pointer-events-none">
                <span className="text-base font-semibold text-violet-300 tracking-wide">
                  {hud.modBanner}
                </span>
              </div>
            )}
          </section>

          {/* HUD panel */}
          <aside className="flex flex-col gap-4">

            {/* Current key */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-1">Current Key</p>
              <p className="text-2xl font-bold text-emerald-300/95 tracking-tight">
                {hud.keyName}
              </p>
            </div>

            {/* Current chord */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-1">Chord</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {hud.chordSymbol}
                </span>
                <span className="text-base text-amber-300/95 font-semibold">
                  {hud.roman}
                </span>
              </div>
            </div>

            {/* Tonal Focus meter */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-widest text-white/60">Tonal Focus</p>
                <p className="text-base font-semibold text-white/80">{focusPct}%</p>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${focusColor}`}
                  style={{ width: `${focusPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-white/60">
                {hud.focus > 0.65
                  ? "Settled — firmly in key"
                  : hud.focus > 0.35
                  ? "Drifting — tonal tension"
                  : "Modulating — key unstable"}
              </p>
            </div>

            {/* Legend */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-2">Map Legend</p>
              <ul className="space-y-1 text-xs text-white/75">
                <li><span className="text-amber-300/95 font-semibold">● Comet</span> — center of tonal gravity</li>
                <li><span className="text-violet-300 font-semibold">◎ Halo</span> — wide = modulating</li>
                <li><span className="text-emerald-300/95 font-semibold">■ Bright region</span> — active key territory</li>
                <li><span className="text-white/80 font-semibold">— Trail</span> — recent path of the comet</li>
              </ul>
            </div>

            {/* MIDI status */}
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/60">
                {started
                  ? "Web MIDI active (if available) — play any keyboard to override the demo"
                  : "Press Begin to start the modulating demo progression"}
              </p>
            </div>

          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-6 flex items-center justify-between text-xs text-white/60">
          <span>
            Chew Spiral Array · Krumhansl–Kessler profiles · arXiv:2603.27035
          </span>
          <Link
            href={`/dream/370-tonal-map/README.md`}
            className="text-violet-300 hover:text-violet-200 underline underline-offset-2 transition-colors"
          >
            Design notes
          </Link>
        </footer>

      </div>
    </main>
  )
}
