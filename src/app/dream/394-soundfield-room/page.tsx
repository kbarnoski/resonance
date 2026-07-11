"use client"

/**
 * 394-soundfield-room — Binaural Ambisonic Soundfield Room
 *
 * An off-screen-first spatial audio experience. Six just-intonation drone
 * voices are encoded into first-order Ambisonic B-format (W, X, Y, Z),
 * rotated coherently with device orientation (head tracking), and decoded
 * to binaural audio via 8 virtual loudspeakers with Web Audio HRTF panners.
 *
 * The screen shows only a dim radar/compass — the experience is for
 * headphones, eyes closed.
 *
 * References: JSAmbisonics (polarch), Google Omnitone.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { AmbisonicField } from "./ambisonics"
import { SynthEngine, VOICE_CONFIGS } from "./synth"

// ── Types ─────────────────────────────────────────────────────────────────────

type AppState = "idle" | "running" | "error"

interface OrientationState {
  yaw: number    // radians — listener's head yaw
  pitch: number
  roll: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2
const AUTO_DEMO_SPEED = 0.12  // radians per second for demo rotation

// ── Radar drawing ─────────────────────────────────────────────────────────────

function drawRadar(
  canvas: HTMLCanvasElement,
  voices: typeof VOICE_CONFIGS,
  yaw: number,
  isDemo: boolean,
): void {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const r = Math.min(W, H) * 0.42

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  ctx.arc(cx, cy, r + 4, 0, TWO_PI)
  ctx.fill()

  // Grid rings
  for (const frac of [0.33, 0.67, 1.0]) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * frac, 0, TWO_PI)
    ctx.strokeStyle = "rgba(167,139,250,0.15)"
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Cross-hairs
  ctx.strokeStyle = "rgba(167,139,250,0.12)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r)
  ctx.stroke()

  // Compass directions (N=front)
  const labels = [
    { angle: 0,               label: "F" },
    { angle: Math.PI / 2,     label: "R" },
    { angle: Math.PI,         label: "B" },
    { angle: -Math.PI / 2,    label: "L" },
  ]
  ctx.font = "11px monospace"
  ctx.fillStyle = "rgba(167,139,250,0.45)"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const { angle, label } of labels) {
    const lx = cx + Math.sin(angle) * (r + 14)
    const ly = cy - Math.cos(angle) * (r + 14)
    ctx.fillText(label, lx, ly)
  }

  // Voice dots — position in field space (yaw offsets the field relative to listener)
  for (const voice of voices) {
    // The soundfield rotates: source appears at (voice.az - yaw) from listener's POV
    const relAz = voice.az - yaw
    const cosEl = Math.cos(voice.el)
    const dotR = r * cosEl  // closer to center if elevated

    const dx = Math.sin(relAz) * dotR
    const dy = -Math.cos(relAz) * dotR  // -Y because canvas Y grows down

    const vx = cx + dx
    const vy = cy + dy

    // Elevation indicator: dot size shrinks when elevated/depressed
    const dotSize = 5 + cosEl * 4

    // Glow
    const grd = ctx.createRadialGradient(vx, vy, 0, vx, vy, dotSize * 2.5)
    grd.addColorStop(0, voice.color + "cc")
    grd.addColorStop(1, voice.color + "00")
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(vx, vy, dotSize * 2.5, 0, TWO_PI)
    ctx.fill()

    // Core dot
    ctx.fillStyle = voice.color
    ctx.beginPath()
    ctx.arc(vx, vy, dotSize, 0, TWO_PI)
    ctx.fill()

    // Elevation tick above dot
    if (Math.abs(voice.el) > 0.05) {
      const elSign = voice.el > 0 ? -1 : 1
      ctx.strokeStyle = voice.color + "99"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(vx, vy - dotSize)
      ctx.lineTo(vx, vy - dotSize - 7 * Math.abs(voice.el) * elSign)
      ctx.stroke()
    }

    // Label
    ctx.font = "10px monospace"
    ctx.fillStyle = "rgba(255,255,255,0.65)"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(voice.name, vx, vy - dotSize - 4)
  }

  // "You" marker — listener at center, facing arrow
  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, TWO_PI)
  ctx.fill()

  // Facing arrow (always points up = forward)
  ctx.strokeStyle = "rgba(255,255,255,0.7)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - 18)
  ctx.stroke()
  // Arrowhead
  ctx.beginPath()
  ctx.moveTo(cx, cy - 22)
  ctx.lineTo(cx - 4, cy - 14)
  ctx.lineTo(cx + 4, cy - 14)
  ctx.closePath()
  ctx.fillStyle = "rgba(255,255,255,0.7)"
  ctx.fill()

  // Demo badge
  if (isDemo) {
    ctx.font = "10px monospace"
    ctx.fillStyle = "rgba(167,139,250,0.6)"
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText("AUTO", cx - r + 4, cy + r - 16)
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SoundfieldRoomPage() {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null)
  const synthRef     = useRef<SynthEngine | null>(null)
  const fieldRef     = useRef<AmbisonicField | null>(null)
  const rafRef       = useRef<number>(0)
  const oriRef       = useRef<OrientationState>({ yaw: 0, pitch: 0, roll: 0 })
  const isDemoRef    = useRef(false)
  const demoYawRef   = useRef(0)
  const lastOriFired = useRef(0)   // timestamp of last DeviceOrientation event
  const lastFrameTs  = useRef(0)
  const isDragging   = useRef(false)
  const dragStartX   = useRef(0)
  const dragStartYaw = useRef(0)

  const [appState, setAppState] = useState<AppState>("idle")
  const [error, setError]       = useState<string | null>(null)
  const [oriDenied, setOriDenied] = useState(false)
  const [isDemo, setIsDemo]     = useState(false)
  const [displayYaw, setDisplayYaw] = useState(0)

  // ── rAF loop ────────────────────────────────────────────────────────────────

  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame)
    const dt = Math.min(0.1, (ts - (lastFrameTs.current || ts)) / 1000)
    lastFrameTs.current = ts

    // Auto-demo: if no orientation event for 3s, slowly rotate
    const sinceOri = ts - lastOriFired.current
    const demoActive = lastOriFired.current === 0 || sinceOri > 3000
    isDemoRef.current = demoActive

    if (demoActive) {
      demoYawRef.current = (demoYawRef.current + AUTO_DEMO_SPEED * dt) % TWO_PI
      oriRef.current.yaw = demoYawRef.current
    }

    const { yaw, pitch, roll } = oriRef.current

    // Update ambisonic rotation
    if (fieldRef.current) {
      fieldRef.current.setOrientation(yaw, pitch, roll)
    }

    // Draw radar
    const canvas = canvasRef.current
    if (canvas) {
      drawRadar(canvas, VOICE_CONFIGS, yaw, demoActive)
    }

    // Update React state occasionally
    if (Math.round(ts / 33) % 4 === 0) {
      setIsDemo(demoActive)
      setDisplayYaw(yaw)
    }
  }, [])

  // ── Device orientation handler ──────────────────────────────────────────────

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha === null) return
    lastOriFired.current = performance.now()

    // DeviceOrientationEvent: alpha=yaw (compass, 0–360), beta=pitch (−180–180), gamma=roll (−90–90)
    // We convert to radians and use them directly.
    // A yaw of alpha degrees means the device is facing alpha° east of north.
    // We invert so the soundfield appears stationary in world space:
    //   listener turns right (+alpha) → field rotates left (−alpha in our convention)
    const yaw   = -(e.alpha  ?? 0) * Math.PI / 180
    const pitch =  (e.beta   ?? 0) * Math.PI / 180
    const roll  =  (e.gamma  ?? 0) * Math.PI / 180

    oriRef.current = { yaw, pitch, roll }
    demoYawRef.current = yaw  // keep demo in sync so it doesn't snap
  }, [])

  // ── Pointer drag fallback ───────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartYaw.current = oriRef.current.yaw
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStartX.current
    const newYaw = dragStartYaw.current - dx * 0.008  // ~0.5 rad per 60px drag
    oriRef.current.yaw = newYaw
    demoYawRef.current = newYaw
    lastOriFired.current = performance.now()  // suppress auto-demo while dragging
  }, [])

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  // ── Start handler ───────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    try {
      // AudioContext MUST be created inside user gesture
      const ctx = new AudioContext()

      const synth = new SynthEngine(ctx)
      synthRef.current = synth

      const field = new AmbisonicField(ctx, synth.masterGain)
      fieldRef.current = field

      // Build voices and connect them into the ambisonic field
      const voiceOutputs = synth.buildVoices()
      for (let i = 0; i < VOICE_CONFIGS.length; i++) {
        const { az, el } = VOICE_CONFIGS[i]
        const encoder = field.createEncoder(az, el)
        voiceOutputs[i].connect(encoder.wEnc)
        voiceOutputs[i].connect(encoder.xEnc)
        voiceOutputs[i].connect(encoder.yEnc)
        voiceOutputs[i].connect(encoder.zEnc)
      }

      // Request device orientation permission (required on iOS 13+)
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (DeviceOrientationEvent as any).requestPermission()
          if (result === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, { passive: true })
          } else {
            setOriDenied(true)
          }
        } catch {
          setOriDenied(true)
        }
      } else if (typeof DeviceOrientationEvent !== "undefined") {
        window.addEventListener("deviceorientation", handleOrientation, { passive: true })
      } else {
        setOriDenied(true)
      }

      setAppState("running")
      lastFrameTs.current = performance.now()
      lastOriFired.current = 0  // will trigger demo immediately
      rafRef.current = requestAnimationFrame(runFrame)

    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start audio")
      setAppState("error")
    }
  }, [handleOrientation, runFrame])

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("deviceorientation", handleOrientation as EventListener)
      fieldRef.current?.dispose()
      synthRef.current?.dispose()
    }
  }, [handleOrientation])

  // ── Canvas resize ───────────────────────────────────────────────────────────

  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const container = canvasContainerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return

    const obs = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      canvas.width  = width  * window.devicePixelRatio
      canvas.height = height * window.devicePixelRatio
      canvas.style.width  = `${width}px`
      canvas.style.height = `${height}px`
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  // ── Derived display ─────────────────────────────────────────────────────────

  const yawDeg = Math.round(((displayYaw * 180 / Math.PI) % 360 + 360) % 360)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full h-screen bg-[#07070f] overflow-hidden select-none"
      onPointerDown={appState === "running" ? handlePointerDown : undefined}
      onPointerMove={appState === "running" ? handlePointerMove : undefined}
      onPointerUp={appState === "running" ? handlePointerUp : undefined}
      onPointerLeave={appState === "running" ? handlePointerUp : undefined}
    >
      {/* ── Idle overlay ── */}
      {appState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-center space-y-3">
            <p className="text-violet-300 text-sm font-mono tracking-widest uppercase">
              394 · Soundfield Room
            </p>
            <h1 className="text-2xl font-bold text-foreground tracking-wide">
              Binaural Ambisonic Space
            </h1>
            <p className="text-base text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Six drone voices float around you in 3D. Turn your head — the entire
              soundfield rotates coherently as a unified space.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl" aria-label="Headphones recommended">🎧</span>
            <p className="text-base text-muted-foreground font-medium">Best with headphones</p>
            <p className="text-sm text-muted-foreground">Eyes closed for full effect</p>
          </div>

          <button
            onClick={handleStart}
            className="px-8 py-2.5 rounded-full bg-violet-700 hover:bg-violet-600 active:bg-violet-800
                       text-foreground font-semibold text-xl min-h-[44px] min-w-[160px] transition-colors
                       border border-violet-500/40"
          >
            Enter Space
          </button>

          <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
            On mobile: tilt and turn your device to navigate the soundfield.
            On desktop: drag left/right to rotate.
          </p>

          <a
            href="./394-soundfield-room/README.md"
            className="text-xs text-muted-foreground hover:text-violet-300 underline underline-offset-2 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Design notes & ambisonics math
          </a>
        </div>
      )}

      {/* ── Error overlay ── */}
      {appState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="text-violet-300 text-base text-center">
            {error ?? "An error occurred"}
          </p>
        </div>
      )}

      {/* ── Running UI ── */}
      {appState === "running" && (
        <>
          {/* Orientation denied notice */}
          {oriDenied && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg
                            bg-black/70 border border-violet-500/40 max-w-xs">
              <p className="text-violet-300 text-sm text-center leading-snug">
                Orientation access denied — drag left/right to rotate the field.
                Auto-demo is running.
              </p>
            </div>
          )}

          {/* Top header */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/30">
            <div>
              <p className="text-violet-300 text-xs font-mono tracking-wider uppercase">394 · Soundfield Room</p>
              <p className="text-muted-foreground text-sm font-mono">
                {yawDeg}°
                {isDemo && <span className="text-violet-300/70 ml-2">· auto-demo</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg" aria-label="Headphones">🎧</p>
              <p className="text-muted-foreground text-xs font-mono">binaural</p>
            </div>
          </div>

          {/* Radar canvas — centered, square, dim */}
          <div
            ref={canvasContainerRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "min(72vw, 72vh)", height: "min(72vw, 72vh)" }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full opacity-80"
              aria-label="Soundfield radar — voice positions around listener"
            />
          </div>

          {/* Voice legend — bottom left */}
          <div className="absolute bottom-16 left-4 space-y-1.5">
            {VOICE_CONFIGS.map((v) => (
              <div key={v.name} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: v.color }}
                />
                <span className="text-muted-foreground text-xs font-mono">{v.name}</span>
                <span className="text-muted-foreground text-xs font-mono">{Math.round(v.freq)}Hz</span>
              </div>
            ))}
          </div>

          {/* Drag hint — bottom center */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
            <p className="text-muted-foreground text-xs font-mono">
              {isDemo ? "auto-rotating · drag or tilt to control" : "tilt or drag to rotate field"}
            </p>
          </div>

          {/* Design notes — bottom right */}
          <div className="absolute bottom-4 right-4">
            <a
              href="./394-soundfield-room/README.md"
              className="text-muted-foreground text-xs hover:text-violet-300 transition-colors font-mono"
              target="_blank"
              rel="noopener noreferrer"
            >
              design notes ↗
            </a>
          </div>

          {/* Ambisonics indicator — top right corner */}
          <div className="absolute top-16 right-4 text-right">
            <p className="text-muted-foreground text-xs font-mono">FOA B-format</p>
            <p className="text-muted-foreground text-xs font-mono">8 virt. spkrs</p>
            <p className="text-muted-foreground text-xs font-mono">HRTF binaural</p>
          </div>
        </>
      )}
    </div>
  )
}
