"use client"

/**
 * 387-drop-engine — Generative EDM Build-and-Drop Arc Engine
 *
 * The lab's first EDM/club journey engine (all other engines are ambient or
 * analytical). Procedurally composes a continuous club track cycling through:
 *   GROOVE → BUILD (riser + filter sweep + snare roll) → DROP → RELEASE → loop
 *
 * Every loop varies: riser type, lead motif transposition, fill pattern.
 * Single tension scalar [0,1] drives both audio and visuals simultaneously.
 *
 * Contrast with the existing psychedelic 6-phase journey engine which is slow,
 * introspective, and ambient — this is energetic, beat-locked, and club-ready.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { SynthEngine } from "./synth"
import { BeatScheduler } from "./scheduler"
import { VizEngine, type VizState } from "./viz"
import type { ArcState, ArcPhase } from "./arc"

type EngineState = "idle" | "running" | "error"

// ── Phase colours (Tailwind-safe) ─────────────────────────────────────────────
const PHASE_COLORS: Record<ArcPhase, string> = {
  GROOVE:  "text-violet-300",
  BUILD:   "text-violet-300",
  DROP:    "text-violet-300",
  RELEASE: "text-violet-300",
}

const PHASE_BG: Record<ArcPhase, string> = {
  GROOVE:  "border-violet-500/40",
  BUILD:   "border-violet-500/40",
  DROP:    "border-violet-500/60",
  RELEASE: "border-violet-500/40",
}

export default function DropEnginePage() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null)
  const vizRef      = useRef<VizEngine | null>(null)
  const synthRef    = useRef<SynthEngine | null>(null)
  const schedRef    = useRef<BeatScheduler | null>(null)
  const rafRef      = useRef<number>(0)
  const lastFrameTs = useRef<number>(0)

  // Arc state for UI readout (updated from scheduler callback)
  const arcStateRef  = useRef<ArcState | null>(null)
  const prevPhaseRef = useRef<ArcPhase>("GROOVE")

  // One-frame flags (set in scheduler callback, read in rAF, then cleared)
  const beatFiredRef = useRef(false)
  const dropFiredRef = useRef(false)

  // UI state
  const [engineState, setEngineState]  = useState<EngineState>("idle")
  const [glError, setGlError]          = useState<string | null>(null)
  const [phase, setPhase]              = useState<ArcPhase>("GROOVE")
  const [tension, setTension]          = useState(0)
  const [bar, setBar]                  = useState(0)

  // User intensity: held-pointer charges it 0→1 over 3 seconds
  const intensityRef    = useRef(0)
  const holdingRef      = useRef(false)
  const holdStartRef    = useRef(0)
  const [displayIntens, setDisplayIntens] = useState(0)

  // ── Resize canvas to fill container ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(() => {
      // The VizEngine's internal ResizeObserver handles canvas pixel sizing.
    })
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [])

  // ── rAF loop ───────────────────────────────────────────────────────────────
  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame)
    const dt = Math.min(0.1, (ts - (lastFrameTs.current || ts)) / 1000)
    lastFrameTs.current = ts

    const arc = arcStateRef.current
    const viz = vizRef.current
    if (!arc || !viz) return

    const vizState: VizState = {
      phase:         arc.phase,
      tension:       arc.tension,
      beat:          arc.beat,
      bar:           arc.bar,
      beatFired:     beatFiredRef.current,
      dropFired:     dropFiredRef.current,
      userIntensity: intensityRef.current,
    }
    beatFiredRef.current = false
    dropFiredRef.current = false

    viz.draw(vizState, dt)

    // Update React UI at reduced rate (every ~5 frames)
    if (Math.round(ts / 33) % 5 === 0) {
      setPhase(arc.phase)
      setTension(arc.tension)
      setBar(arc.bar)

      // Update intensity display
      if (holdingRef.current) {
        const held = (performance.now() - holdStartRef.current) / 3000
        intensityRef.current = Math.min(1, held)
        setDisplayIntens(intensityRef.current)
      }
    }
  }, [])

  // ── Start engine ──────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      // Init GL viz
      try {
        vizRef.current = new VizEngine(canvas)
      } catch (e) {
        setGlError(e instanceof Error ? e.message : "WebGL2 unavailable")
      }

      // Init audio
      const synth = new SynthEngine()
      await synth.resume()
      synthRef.current = synth

      // Init scheduler
      const sched = new BeatScheduler(synth, {
        onBeatAdvance: (state, prevPhase) => {
          arcStateRef.current = state
          prevPhaseRef.current = prevPhase
          beatFiredRef.current = true
          if (state.phase === "DROP" && prevPhase !== "DROP") {
            dropFiredRef.current = true
          }
        },
      })
      schedRef.current = sched
      sched.start()

      // Init arc state for rAF
      arcStateRef.current = {
        phase: "GROOVE", bar: 0, beat: 0, tension: 0.05,
        barsPerPhase: 16, loopSeed: 0, motifTranspose: 0,
        riserType: 0, fillPattern: 0, userIntensity: 0,
        dropNow: false, phaseStartTime: 0, totalBars: 0,
      }

      setEngineState("running")
      lastFrameTs.current = performance.now()
      rafRef.current = requestAnimationFrame(runFrame)

    } catch (e) {
      setEngineState("error")
      setGlError(e instanceof Error ? e.message : "Failed to start engine")
    }
  }, [runFrame])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      schedRef.current?.stop()
      synthRef.current?.dispose()
      vizRef.current?.dispose()
    }
  }, [])

  // ── User controls ─────────────────────────────────────────────────────────

  const handleHoldStart = useCallback(() => {
    holdingRef.current = true
    holdStartRef.current = performance.now()
  }, [])

  const handleHoldEnd = useCallback(() => {
    holdingRef.current = false
    if (schedRef.current) {
      schedRef.current.userIntensity = intensityRef.current
    }
    // Decay intensity back to 0 over a few seconds
    const startVal = intensityRef.current
    const startTime = performance.now()
    const decay = () => {
      const elapsed = (performance.now() - startTime) / 4000
      intensityRef.current = Math.max(0, startVal * (1 - elapsed))
      setDisplayIntens(intensityRef.current)
      if (intensityRef.current > 0.01) requestAnimationFrame(decay)
    }
    requestAnimationFrame(decay)
  }, [])

  const handleDropNow = useCallback(() => {
    if (schedRef.current) {
      schedRef.current.dropNow = true
    }
  }, [])

  // ── Phase label progress ───────────────────────────────────────────────────
  const phaseProgress = Math.round((bar / 16) * 100)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-[#080610] overflow-hidden select-none">
      {/* Canvas fills screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-label="EDM drop engine visualizer"
      />

      {/* Idle overlay */}
      {engineState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/60">
          <h1 className="text-3xl font-bold text-foreground tracking-wider text-center px-4">
            DROP ENGINE
          </h1>
          <p className="text-base text-muted-foreground text-center max-w-xs px-6">
            Generative EDM build-and-drop arc engine.
            Procedural tension → riser → drop → release. Loops with variation.
          </p>
          <button
            onPointerDown={handleStart}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-semibold text-xl min-w-[160px] min-h-[52px] transition-colors"
          >
            START
          </button>
          <p className="text-sm text-muted-foreground text-center px-4">
            Tap Start to begin — audio + visuals start together
          </p>
        </div>
      )}

      {/* Error overlay */}
      {engineState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-violet-300 text-base text-center px-6">
            Engine error: {glError ?? "unknown error"}
          </p>
        </div>
      )}

      {/* WebGL fallback notice (audio still runs) */}
      {glError && engineState === "running" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/70 border border-violet-500/40">
          <p className="text-violet-300 text-sm text-center">
            WebGL2 unavailable — audio running without visuals
          </p>
        </div>
      )}

      {/* HUD — top left: phase indicator */}
      {engineState === "running" && (
        <div className={`absolute top-4 left-4 px-4 py-2.5 rounded-xl border bg-black/60 backdrop-blur-sm ${PHASE_BG[phase]}`}>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold tracking-widest ${PHASE_COLORS[phase]}`}>
              {phase}
            </span>
            <span className="text-muted-foreground text-base font-mono">
              {bar + 1}/16
            </span>
          </div>
          {/* Phase progress bar */}
          <div className="mt-1.5 h-1 w-32 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${phaseProgress}%`,
                background: phase === "DROP" ? "#d946ef"
                  : phase === "BUILD" ? "#22d3ee"
                  : phase === "GROOVE" ? "#a78bfa"
                  : "#2dd4bf"
              }}
            />
          </div>
        </div>
      )}

      {/* HUD — top right: tension meter */}
      {engineState === "running" && (
        <div className="absolute top-4 right-4 px-4 py-2.5 rounded-xl border border-border bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-end gap-1">
            <span className="text-muted-foreground text-sm font-mono uppercase tracking-wider">
              TENSION
            </span>
            <span className="text-foreground text-2xl font-mono font-bold">
              {Math.round(tension * 100)}
            </span>
            {/* Vertical bar */}
            <div className="w-3 h-24 bg-muted rounded-full overflow-hidden flex flex-col justify-end">
              <div
                className="w-full rounded-full transition-all duration-75"
                style={{
                  height: `${tension * 100}%`,
                  background: `hsl(${200 + tension * 110}, 90%, 60%)`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Controls — bottom center */}
      {engineState === "running" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
          {/* Intensity charge indicator */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">CHARGE</span>
            <div className="w-32 h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${displayIntens * 100}%`,
                  background: `hsl(${280 + displayIntens * 60}, 85%, 60%)`,
                }}
              />
            </div>
            <span className="text-muted-foreground text-sm font-mono w-8">
              {Math.round(displayIntens * 100)}
            </span>
          </div>

          <div className="flex gap-4">
            {/* PUSH: hold to charge intensity */}
            <button
              onPointerDown={handleHoldStart}
              onPointerUp={handleHoldEnd}
              onPointerLeave={handleHoldEnd}
              className="px-6 py-3 rounded-full bg-violet-700/80 hover:bg-violet-600/90 active:bg-violet-500 text-foreground font-semibold text-base min-w-[120px] min-h-[48px] border border-violet-400/30 transition-colors touch-none"
            >
              HOLD → CHARGE
            </button>

            {/* DROP NOW: early drop trigger */}
            <button
              onPointerDown={handleDropNow}
              className="px-6 py-3 rounded-full bg-violet-700/80 hover:bg-violet-600/90 active:bg-violet-500 text-foreground font-bold text-base min-w-[120px] min-h-[48px] border border-violet-400/40 transition-colors"
            >
              DROP NOW
            </button>
          </div>

          <p className="text-muted-foreground text-sm text-center">
            Hold <span className="text-muted-foreground">CHARGE</span> to bias the next drop intensity
            · <span className="text-muted-foreground">DROP NOW</span> triggers early during BUILD
          </p>
        </div>
      )}

      {/* Design notes affordance */}
      <div className="absolute bottom-4 right-4">
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer hover:text-muted-foreground py-1 px-2">
            design notes
          </summary>
          <div className="absolute bottom-8 right-0 w-72 bg-black/90 border border-border rounded-xl p-4 text-muted-foreground text-xs space-y-2 z-10">
            <p className="font-semibold text-foreground text-sm">387 · Drop Engine</p>
            <p>Lab&apos;s first EDM/club journey engine. Arc: GROOVE→BUILD→DROP→RELEASE→loop, 16 bars each at 126 BPM.</p>
            <p>Tension scalar [0→1] simultaneously drives: noise riser pitch, LP filter sweep, snare-roll acceleration, HP suck-out pre-drop, and all visuals.</p>
            <p>Synthesis: kick (sine+click), snare (filtered noise), hat, bass (saw+sub through LP), supersaw lead, riser. All sum through a DynamicsCompressor limiter.</p>
            <p>Per-loop variation: riser type, lead transposition, fill pattern — so no two loops are identical.</p>
          </div>
        </details>
      </div>
    </div>
  )
}
