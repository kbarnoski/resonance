"use client"

/**
 * 400-soundwalk-room — Walk THROUGH a spatial-audio room and FEEL each voice pass.
 *
 * Cycle 2 of the spatial-audio thread. Cycle 1 (394) let you ROTATE a fixed
 * first-order ambisonic field (turn your head). This adds the two missing
 * dimensions: TRANSLATION (6DoF locomotion — you walk through the field) and
 * HAPTICS (you feel each voice brush past via the Vibration API).
 *
 * Output is binaural spatial audio (Web Audio HRTF) + Vibration-API haptics +
 * a DIM top-down Canvas2D wayfinding map. No WebGL, no three.js — the audio and
 * the haptics are the real output; eyes can be closed.
 *
 * See README.md for the 6DoF math and the Sound2Hap haptic mapping.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { SynthEngine, VOICE_CONFIGS } from "./synth"
import { SoundwalkField, Walker, ROOM_HALF } from "./soundwalk"
import { HapticDriver, readRms, HAPTIC_RADIUS, type PassEvent } from "./haptics"

type AppState = "idle" | "running" | "error"

// ── Map drawing ─────────────────────────────────────────────────────────────

interface VoicePulse {
  index: number
  /** 0..1 fades to 0 */
  life: number
  proximity: number
}

function drawMap(
  canvas: HTMLCanvasElement,
  walker: Walker,
  perVoice: { d: number; gain01: number }[],
  pulses: VoicePulse[],
): void {
  const c = canvas.getContext("2d")
  if (!c) return

  const W = canvas.width
  const H = canvas.height
  const dpr = window.devicePixelRatio || 1
  const cx = W / 2
  const cy = H / 2
  // world ±ROOM_HALF maps to the inner square
  const scale = (Math.min(W, H) * 0.42) / ROOM_HALF

  const wx2px = (wx: number) => cx + wx * scale
  const wz2py = (wz: number) => cy - wz * scale // +Z = up on the map

  c.clearRect(0, 0, W, H)

  // Dim backdrop
  c.fillStyle = "rgba(7,7,15,0.6)"
  c.fillRect(0, 0, W, H)

  // Room boundary
  c.strokeStyle = "rgba(167,139,250,0.18)"
  c.lineWidth = 1 * dpr
  c.strokeRect(wx2px(-ROOM_HALF), wz2py(ROOM_HALF), ROOM_HALF * 2 * scale, ROOM_HALF * 2 * scale)

  // Faint grid
  c.strokeStyle = "rgba(167,139,250,0.08)"
  for (let g = -ROOM_HALF; g <= ROOM_HALF + 0.01; g += ROOM_HALF) {
    c.beginPath(); c.moveTo(wx2px(g), wz2py(ROOM_HALF)); c.lineTo(wx2px(g), wz2py(-ROOM_HALF)); c.stroke()
    c.beginPath(); c.moveTo(wx2px(-ROOM_HALF), wz2py(g)); c.lineTo(wx2px(ROOM_HALF), wz2py(g)); c.stroke()
  }

  // Voice dots
  for (let i = 0; i < VOICE_CONFIGS.length; i++) {
    const v = VOICE_CONFIGS[i]
    const px = wx2px(v.wx)
    const py = wz2py(v.wz)
    const near = perVoice[i] ? Math.min(1, perVoice[i].gain01) : 0

    // Haptic-radius ring (so you can see the "brush" zone)
    c.beginPath()
    c.arc(px, py, HAPTIC_RADIUS * scale, 0, Math.PI * 2)
    c.strokeStyle = v.color + "22"
    c.lineWidth = 1 * dpr
    c.stroke()

    // Visual pulse (haptic fallback) — expanding ring on a pass event
    const pulse = pulses.find((p) => p.index === i)
    if (pulse) {
      const pr = (HAPTIC_RADIUS * scale) * (0.3 + (1 - pulse.life) * 1.4)
      c.beginPath()
      c.arc(px, py, pr, 0, Math.PI * 2)
      c.strokeStyle = v.color + Math.round(pulse.life * 200).toString(16).padStart(2, "0")
      c.lineWidth = 2.5 * dpr
      c.stroke()
    }

    // Glow scaled by current loudness
    const glow = 6 * dpr + near * 10 * dpr
    const grd = c.createRadialGradient(px, py, 0, px, py, glow)
    grd.addColorStop(0, v.color + "cc")
    grd.addColorStop(1, v.color + "00")
    c.fillStyle = grd
    c.beginPath(); c.arc(px, py, glow, 0, Math.PI * 2); c.fill()

    // Core dot
    c.fillStyle = v.color
    c.beginPath(); c.arc(px, py, (3 + near * 2) * dpr, 0, Math.PI * 2); c.fill()

    // Label
    c.font = `${11 * dpr}px monospace`
    c.fillStyle = "rgba(255,255,255,0.6)"
    c.textAlign = "center"
    c.textBaseline = "bottom"
    c.fillText(v.ratio, px, py - 8 * dpr)
  }

  // Listener dot + facing arrow
  const lx = wx2px(walker.x)
  const ly = wz2py(walker.z)
  c.fillStyle = "rgba(255,255,255,0.95)"
  c.beginPath(); c.arc(lx, ly, 5 * dpr, 0, Math.PI * 2); c.fill()

  const ax = lx + Math.sin(walker.yaw) * 16 * dpr
  const ay = ly - Math.cos(walker.yaw) * 16 * dpr
  c.strokeStyle = "rgba(255,255,255,0.8)"
  c.lineWidth = 2 * dpr
  c.beginPath(); c.moveTo(lx, ly); c.lineTo(ax, ay); c.stroke()
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SoundwalkRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const synthRef = useRef<SynthEngine | null>(null)
  const fieldRef = useRef<SoundwalkField | null>(null)
  const hapticRef = useRef<HapticDriver | null>(null)
  const walkerRef = useRef<Walker | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef<number>(0)

  // Device-orientation heading (radians) or null if no sensor.
  const headingRef = useRef<number | null>(null)
  const lastOriMsRef = useRef<number>(0)

  // Drag-to-steer
  const draggingRef = useRef(false)
  const dragXRef = useRef(0)

  // Live visual pulses (haptic fallback)
  const pulsesRef = useRef<VoicePulse[]>([])

  const [appState, setAppState] = useState<AppState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [oriDenied, setOriDenied] = useState(false)
  const [hapticsAvailable, setHapticsAvailable] = useState(true)
  const [canvasOk, setCanvasOk] = useState(true)

  // ── Device orientation ────────────────────────────────────────────────────

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.alpha === undefined) return
    lastOriMsRef.current = performance.now()
    // alpha: compass heading 0–360 (CCW in spec). Use it as listener yaw.
    headingRef.current = (e.alpha * Math.PI) / 180
  }, [])

  // ── rAF loop ──────────────────────────────────────────────────────────────

  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame)
    const dt = Math.min(0.05, (ts - (lastTsRef.current || ts)) / 1000)
    lastTsRef.current = ts

    const walker = walkerRef.current
    const field = fieldRef.current
    const synth = synthRef.current
    const haptic = hapticRef.current
    if (!walker || !field || !synth) return

    // Heading from sensor only if it fired recently (else null → auto-face walk dir).
    const sensorFresh = headingRef.current !== null && ts - lastOriMsRef.current < 1500
    const heading = sensorFresh ? headingRef.current : null

    walker.step(dt, heading)

    const perVoice = field.step(walker.x, walker.z, walker.yaw)

    // Per-voice live RMS for Sound2Hap.
    const rmsList: number[] = []
    for (const v of synth.voices) rmsList.push(readRms(v.analyser, v.ampBuf))
    const freqs = VOICE_CONFIGS.map((v) => v.freq)

    if (haptic) {
      const events: PassEvent[] = haptic.update(perVoice, freqs, rmsList, ts)
      for (const ev of events) {
        pulsesRef.current.push({ index: ev.voiceIndex, life: 1, proximity: ev.proximity })
      }
    }

    // Advance + cull pulses.
    pulsesRef.current = pulsesRef.current
      .map((p) => ({ ...p, life: p.life - dt * 1.6 }))
      .filter((p) => p.life > 0)

    const canvas = canvasRef.current
    if (canvas) drawMap(canvas, walker, perVoice, pulsesRef.current)
  }, [])

  // ── Start ─────────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    try {
      // AudioContext MUST be created inside the user gesture (autoplay policy).
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      ctxRef.current = ctx
      if (ctx.state === "suspended") await ctx.resume()

      const synth = new SynthEngine(ctx)
      synthRef.current = synth

      const field = new SoundwalkField(ctx, synth.masterGain)
      fieldRef.current = field

      // synth.voices each carry analyser + ampBuf; wire each voice into the field.
      synth.build()
      for (let i = 0; i < synth.voices.length; i++) {
        const v = synth.voices[i]
        field.addSource(v.output, { wx: v.cfg.wx, wz: v.cfg.wz })
      }

      const walker = new Walker()
      walkerRef.current = walker

      const haptic = new HapticDriver(synth.voices.length)
      hapticRef.current = haptic
      setHapticsAvailable(haptic.supported)

      // Device orientation — request permission INSIDE the Start tap (iOS 13+).
      const DOE = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reqPerm = DOE && (DOE as any).requestPermission
      if (typeof reqPerm === "function") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (DOE as any).requestPermission()
          if (res === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, { passive: true })
          } else {
            setOriDenied(true)
          }
        } catch {
          setOriDenied(true)
        }
      } else if (DOE) {
        window.addEventListener("deviceorientation", handleOrientation, { passive: true })
      } else {
        setOriDenied(true)
      }

      setAppState("running")
      lastTsRef.current = performance.now()
      rafRef.current = requestAnimationFrame(runFrame)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start audio")
      setAppState("error")
    }
  }, [handleOrientation, runFrame])

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    window.removeEventListener("deviceorientation", handleOrientation as EventListener)
    hapticRef.current?.clear()
    synthRef.current?.dispose()
    fieldRef.current?.dispose()
    const ctx = ctxRef.current
    if (ctx && ctx.state !== "closed") {
      // Let the fade-out finish, then close.
      setTimeout(() => { ctx.close().catch(() => {}) }, 700)
    }
    hapticRef.current = null
    synthRef.current = null
    fieldRef.current = null
    walkerRef.current = null
    ctxRef.current = null
    headingRef.current = null
    pulsesRef.current = []
    setAppState("idle")
  }, [handleOrientation])

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("deviceorientation", handleOrientation as EventListener)
      hapticRef.current?.clear()
      synthRef.current?.dispose()
      fieldRef.current?.dispose()
      const ctx = ctxRef.current
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {})
    }
  }, [handleOrientation])

  // ── Canvas sizing + Canvas2D support check ──────────────────────────────────

  useEffect(() => {
    const wrap = canvasWrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    if (!canvas.getContext("2d")) { setCanvasOk(false); return }

    const obs = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    })
    obs.observe(wrap)
    return () => obs.disconnect()
  }, [appState])

  // ── Drag-to-steer ───────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true
    dragXRef.current = e.clientX
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - dragXRef.current
    dragXRef.current = e.clientX
    // Nudge the walk direction proportionally to drag.
    walkerRef.current?.steer((dx / 120))
  }, [])

  const onPointerUp = useCallback(() => { draggingRef.current = false }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-screen bg-[#07070f] overflow-hidden select-none">
      {appState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-center space-y-3 max-w-md">
            <p className="text-violet-300 text-sm font-mono tracking-widest uppercase">
              400 · Soundwalk Room
            </p>
            <h1 className="text-3xl font-serif font-bold text-foreground tracking-wide">
              Walk through the voices
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Seven just-intonation overtones stand around a small room. After you
              start, you auto-walk a wandering path — voices swell, brush past, and
              recede. Each one you pass close to gives a little haptic tap whose feel
              matches its sound.
            </p>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <span className="text-2xl" aria-hidden>🎧</span>
            <p className="text-base text-muted-foreground font-medium">Headphones, eyes closed</p>
            <p className="text-sm text-muted-foreground">Phones also buzz as you pass each voice</p>
          </div>

          <button
            onClick={handleStart}
            className="min-h-[44px] px-6 py-2.5 rounded-full bg-violet-700 hover:bg-violet-600
                       active:bg-violet-800 text-foreground font-semibold text-xl border border-violet-500/40
                       transition-colors"
          >
            Start the walk
          </button>

          <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
            Hands-free auto-walk runs on start. Drag left/right to steer.
            On mobile, turning your device turns your heading.
          </p>

          <a
            href="./400-soundwalk-room/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-violet-300 underline underline-offset-2 transition-colors"
          >
            Read the design notes ↗
          </a>
        </div>
      )}

      {appState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-violet-300 text-base text-center max-w-sm">{error ?? "Something went wrong."}</p>
          <button
            onClick={() => { setAppState("idle"); setError(null) }}
            className="min-h-[44px] px-4 py-2.5 rounded-full bg-violet-700 hover:bg-violet-600 text-foreground text-base"
          >
            Back
          </button>
        </div>
      )}

      {appState === "running" && (
        <div
          className="absolute inset-0"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/30 z-10">
            <div>
              <p className="text-violet-300 text-xs font-mono tracking-wider uppercase">400 · Soundwalk Room</p>
              <p className="text-muted-foreground text-sm font-mono">6DoF · HRTF binaural</p>
            </div>
            <button
              onClick={stopAll}
              className="min-h-[44px] px-4 py-2.5 rounded-full bg-muted hover:bg-accent border border-border
                         text-foreground text-base transition-colors"
            >
              Stop
            </button>
          </div>

          {/* Degradation notices */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 w-full px-4">
            {!hapticsAvailable && (
              <div className="px-4 py-2 rounded-lg bg-black/70 border border-violet-500/40 max-w-sm">
                <p className="text-violet-300 text-sm text-center leading-snug">
                  Haptics unavailable on this device — you&apos;ll still hear the voices pass,
                  and the map ring-pulses when you brush one.
                </p>
              </div>
            )}
            {oriDenied && (
              <div className="px-4 py-2 rounded-lg bg-black/70 border border-violet-500/40 max-w-sm">
                <p className="text-violet-300 text-sm text-center leading-snug">
                  No device-orientation heading — your heading follows the auto-walk.
                  Drag left/right to steer.
                </p>
              </div>
            )}
            {!canvasOk && (
              <div className="px-4 py-2 rounded-lg bg-black/70 border border-violet-500/40 max-w-sm">
                <p className="text-violet-300 text-sm text-center leading-snug">
                  Canvas unavailable — the map can&apos;t draw, but the audio walk is still running.
                </p>
              </div>
            )}
          </div>

          {/* The dim map */}
          <div
            ref={canvasWrapRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "min(76vw, 76vh)", height: "min(76vw, 76vh)" }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full opacity-80"
              aria-label="Top-down map of the soundwalk room — your position and the seven voices"
            />
          </div>

          {/* Legend */}
          <div className="absolute bottom-14 left-4 space-y-1.5 z-10">
            {VOICE_CONFIGS.map((v) => (
              <div key={v.name} className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                <span className="text-muted-foreground text-sm font-mono">{v.ratio}</span>
                <span className="text-muted-foreground text-sm font-mono">{Math.round(v.freq)}Hz</span>
              </div>
            ))}
          </div>

          {/* Hint */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center z-10">
            <p className="text-muted-foreground text-sm font-mono">auto-walking · drag to steer · turn device to look</p>
          </div>

          {/* Design notes */}
          <div className="absolute bottom-4 right-4 z-10">
            <a
              href="./400-soundwalk-room/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground text-sm hover:text-violet-300 transition-colors font-mono"
            >
              design notes ↗
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
