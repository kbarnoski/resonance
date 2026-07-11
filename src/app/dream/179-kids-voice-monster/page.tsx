"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMicAnalyser } from "../_shared/use-mic-analyser"

// ── helpers ───────────────────────────────────────────────────────────────────
const PENTA = [130.81, 164.81, 196.00, 220.00, 261.63, 329.63, 392.00, 440.00]

function snapPenta(hz: number): number {
  return PENTA.reduce((b, f) =>
    Math.abs(Math.log2(f / hz)) < Math.abs(Math.log2(b / hz)) ? f : b, PENTA[0])
}

function centroidToHue(hz: number): number {
  const t = Math.max(0, Math.min(1,
    (Math.log2(Math.max(80, hz)) - Math.log2(80)) / (Math.log2(3200) - Math.log2(80))))
  if (t < 0.40) return 265 + (145 - 265) * (t / 0.40)
  if (t < 0.70) return 145 + (40  - 145) * ((t - 0.40) / 0.30)
  return (40 + 300 * ((t - 0.70) / 0.30)) % 360
}

function singNote(ac: AudioContext, freq: number): void {
  const t = ac.currentTime
  const o = ac.createOscillator(), g = ac.createGain()
  o.type = "sine"; o.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.20, t + 0.025)
  g.gain.setTargetAtTime(0, t + 0.10, 0.22)
  o.connect(g); g.connect(ac.destination)
  o.start(t); o.stop(t + 1.5)
}

function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number
): void {
  const r = h / 2
  ctx.beginPath()
  ctx.arc(x + r,     y + r, r,  Math.PI / 2, -Math.PI / 2)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2,  Math.PI / 2)
  ctx.closePath()
}

const TARGET_SEC   = 30
const VOICE_THRESH = 0.033
const WANDER_SEC   = 5

// ── component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase,  setPhase]  = useState<"start" | "play">("start")
  const [isDemo, setIsDemo] = useState(false)
  const { running, error, start: startMic, getFrame } =
    useMicAnalyser({ smoothing: 0.78, gain: 2.5 })

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // monster visual state
  const radRef   = useRef(1.0)
  const hueRef   = useRef(265)
  const wobRef   = useRef(0)
  const wandRef  = useRef(false)
  const mouthRef = useRef(0)

  // voice accumulation
  const accRef     = useRef(0)
  const pitchesRef = useRef<number[]>([])
  const capRef     = useRef(0)
  const lastVRef   = useRef(0)

  // state machine
  type Mon = "hungry" | "bouncing" | "singing" | "resting"
  const monRef   = useRef<Mon>("hungry")
  const timerRef = useRef(0)
  const siRef    = useRef(0)

  // demo LFO
  const demoTRef = useRef(0)

  function handleStartMic() {
    startMic()
    setPhase("play")
  }

  function handleDemo() {
    setIsDemo(true)
    setPhase("play")
  }

  useEffect(() => {
    if (phase !== "play") return

    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d")!
    const demo   = isDemo
    const ac     = new AudioContext()

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight
      canvas.width  = W * dpr; canvas.height = H * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener("resize", resize)

    // Ambient: quiet C2 + G2
    for (const [f, v] of [[65.41, 0.010], [98.00, 0.007]] as [number, number][]) {
      const t = ac.currentTime
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = "sine"; o.frequency.value = f
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 3)
      o.connect(g); g.connect(ac.destination); o.start()
    }

    function onDown(e: PointerEvent) {
      e.preventDefault()
      void ac.resume()
      const rect = canvas.getBoundingClientRect()
      const dx = e.clientX - rect.left - W / 2
      const dy = e.clientY - rect.top  - H * 0.52
      const hitR = radRef.current * Math.min(W, H) * 0.20 + 24
      if (Math.hypot(dx, dy) < hitR) {
        wobRef.current = 1.0
        for (let k = 0; k < 4; k++) {
          const t0 = ac.currentTime + k * 0.065
          const o = ac.createOscillator(), g = ac.createGain()
          o.type = "sine"; o.frequency.value = 261.63 * (k + 1)
          g.gain.setValueAtTime(0, t0)
          g.gain.linearRampToValueAtTime(0.13, t0 + 0.010)
          g.gain.setTargetAtTime(0, t0 + 0.018, 0.055)
          o.connect(g); g.connect(ac.destination)
          o.start(t0); o.stop(t0 + 0.35)
        }
      }
    }
    canvas.addEventListener("pointerdown", onDown)

    let raf = 0, prev = 0, startTs = 0

    function frame(ts: number) {
      if (!startTs) startTs = ts
      const dt = Math.min((ts - prev) / 1000, 0.05)
      prev = ts

      // audio input
      let amp = 0, cent = 350
      if (demo) {
        demoTRef.current += dt
        const d = demoTRef.current
        amp  = Math.max(0, 0.13 + 0.11 * Math.sin(d * 0.85) + 0.06 * Math.sin(d * 2.4))
        cent = 240 + 140 * Math.sin(d * 0.32) + 80 * Math.sin(d * 0.78)
      } else {
        const fr = getFrame()
        if (fr) { amp = fr.amplitude; cent = fr.centroid > 0 ? fr.centroid : 350 }
      }

      // smooth hue toward centroid color
      const tH = centroidToHue(cent)
      let dh = tH - hueRef.current
      if (dh >  180) dh -= 360
      if (dh < -180) dh += 360
      hueRef.current += dh * Math.min(1, dt * 2.5)

      // state machine
      const state = monRef.current
      const now   = ts

      if (state === "hungry" || state === "resting") {
        if (amp > VOICE_THRESH) {
          lastVRef.current  = now
          wandRef.current   = false
          mouthRef.current += (0.6 - mouthRef.current) * Math.min(1, dt * 8)
          radRef.current   += (1.0 + amp - radRef.current) * Math.min(1, dt * 7)
          if (state === "hungry") {
            accRef.current += dt
            if (now - capRef.current > 600 && pitchesRef.current.length < 8) {
              const note = snapPenta(cent)
              capRef.current = now
              if (!pitchesRef.current.includes(note)) pitchesRef.current.push(note)
            }
            if (accRef.current >= TARGET_SEC) {
              monRef.current = "bouncing"; timerRef.current = 1.7
            }
          }
        } else {
          mouthRef.current += (0     - mouthRef.current) * Math.min(1, dt * 5)
          radRef.current   += (1.0   - radRef.current)   * Math.min(1, dt * 4)
          wandRef.current   = (now - lastVRef.current) / 1000 > WANDER_SEC
        }
        if (state === "resting") {
          timerRef.current += dt
          if (timerRef.current > 2.5) { monRef.current = "hungry"; timerRef.current = 0 }
        }
      }

      if (state === "bouncing") {
        timerRef.current -= dt
        radRef.current    = 1.85 + 0.18 * Math.sin(ts * 0.018)
        mouthRef.current += (0.85 - mouthRef.current) * Math.min(1, dt * 5)
        if (timerRef.current <= 0) {
          monRef.current = "singing"; siRef.current = 0; timerRef.current = 0
        }
      }

      if (state === "singing") {
        mouthRef.current = 0.35 + 0.65 * Math.abs(Math.sin(ts * 0.0065))
        timerRef.current -= dt
        if (timerRef.current <= 0) {
          const idx = siRef.current, ps = pitchesRef.current
          if (idx < ps.length) {
            singNote(ac, ps[idx]); siRef.current++; timerRef.current = 0.56
          } else {
            monRef.current  = "resting"; accRef.current = 0
            pitchesRef.current = []; capRef.current = 0
            mouthRef.current = 0.05; timerRef.current = 0; radRef.current = 1.0
          }
        }
      }

      if (wobRef.current > 0) wobRef.current = Math.max(0, wobRef.current - dt * 4)

      // ── draw ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#06060e"; ctx.fillRect(0, 0, W, H)

      // twinkling stars
      for (let i = 0; i < 28; i++) {
        const sx = (Math.sin(i * 6.27) * 0.5 + 0.5) * W
        const sy = (Math.cos(i * 3.87) * 0.5 + 0.5) * H
        const ba = (0.15 + 0.18 * Math.sin(ts * 0.0009 + i * 2.6)).toFixed(2)
        ctx.fillStyle = `rgba(255,255,255,${ba})`
        ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill()
      }

      const baseR = Math.min(W, H) * 0.20
      const curR  = radRef.current * baseR
      const cx    = W / 2, cy = H * 0.52
      const hue   = hueRef.current
      const byOff = state === "bouncing" ? Math.sin(ts * 0.018) * 14 : 0

      // monster body — blobby polygon
      ctx.save()
      ctx.shadowBlur  = 30 + curR * 0.18
      ctx.shadowColor = `hsl(${hue | 0},80%,58%)`
      ctx.fillStyle   = `hsl(${hue | 0},72%,48%)`
      ctx.beginPath()
      for (let i = 0; i <= 20; i++) {
        const ang = (i / 20) * Math.PI * 2 - Math.PI / 2
        const r   = curR * (1 + 0.055 * Math.sin(ts * 0.002 + i * 2.1))
        const bx  = cx + r * Math.cos(ang)
        const by  = cy + byOff + r * Math.sin(ang)
        i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by)
      }
      ctx.closePath(); ctx.fill(); ctx.restore()

      // eyes
      const esep = curR * 0.36
      const eyY  = cy + byOff - curR * 0.16
      const eyR  = curR * 0.17
      const wob  = wobRef.current
      const wand = wandRef.current

      for (const sd of [-1, 1] as const) {
        const wigX = sd * wob * 5 * -Math.sin(ts * 0.05)
        const wdX  = wand ? Math.sin(ts * 0.00088 * 3.0)  * esep * 0.28 : 0
        const wdY  = wand ? Math.sin(ts * 0.00088 * 1.85 + 1.2) * eyR * 0.5 : 0
        const ex   = cx + sd * esep + wigX + wdX
        const ey   = eyY + wdY
        const eScY = state === "singing"
          ? 0.65 + 0.35 * Math.abs(Math.sin(ts * 0.0068)) : 1.0

        ctx.save()
        ctx.shadowBlur = 5; ctx.shadowColor = "rgba(255,255,255,0.3)"
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.ellipse(ex, ey, eyR, eyR * eScY, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = "#18082a"
        ctx.beginPath()
        ctx.ellipse(ex + eyR * 0.07, ey + eyR * 0.06,
          eyR * 0.50, eyR * 0.50 * eScY, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = "rgba(255,255,255,0.75)"
        ctx.beginPath()
        ctx.arc(ex + eyR * 0.18, ey - eyR * 0.18, eyR * 0.16, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // mouth
      const mo  = mouthRef.current
      const mcy = cy + byOff + curR * 0.36
      const mr  = curR * 0.30
      ctx.save()
      ctx.strokeStyle = "rgba(0,0,0,0.4)"
      ctx.lineWidth   = Math.max(2, curR * 0.045)
      ctx.lineCap     = "round"
      if (mo < 0.06) {
        ctx.beginPath(); ctx.arc(cx, mcy, mr, 0.12, Math.PI - 0.12); ctx.stroke()
      } else {
        ctx.fillStyle = "#1a0528"
        ctx.beginPath()
        ctx.ellipse(cx, mcy + mr * mo * 0.25, mr, mr * 0.55 * mo, 0, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      }
      ctx.restore()

      // hunger progress bar
      if (state === "hungry") {
        const prog = Math.min(1, accRef.current / TARGET_SEC)
        const bW = Math.min(W * 0.62, 250), bH = 8
        const bX = cx - bW / 2, bY = cy + curR + 30
        ctx.save()
        ctx.globalAlpha = 0.30; ctx.fillStyle = "#ffffff"
        pillPath(ctx, bX, bY, bW, bH); ctx.fill()
        if (prog > 0) {
          ctx.globalAlpha = 0.92
          ctx.fillStyle   = `hsl(${hue | 0},82%,68%)`
          ctx.shadowBlur  = 6; ctx.shadowColor = `hsl(${hue | 0},82%,68%)`
          pillPath(ctx, bX, bY, Math.max(bH, prog * bW), bH); ctx.fill()
        }
        ctx.restore()
      }

      // hint text — fades in then out over first 5.5s
      const elapsed = ts - startTs
      if (state === "hungry" && elapsed < 5500) {
        const alpha = Math.min(0.78, elapsed / 1200 * 0.78)
                    * Math.max(0, 1 - (elapsed - 4000) / 1500)
        if (alpha > 0.01) {
          ctx.save()
          ctx.globalAlpha = alpha; ctx.fillStyle = "#ffffff"
          ctx.font = "bold 16px system-ui,sans-serif"
          ctx.textAlign = "center"
          ctx.fillText(
            demo ? "🎵 demo is feeding the monster…" : "🎤 hum or sing to feed me!",
            cx, cy + curR + 46
          )
          ctx.restore()
        }
      }

      // singing ♪ indicator
      if (state === "singing") {
        ctx.save()
        ctx.fillStyle   = `hsl(${hue | 0},90%,80%)`
        ctx.shadowBlur  = 14; ctx.shadowColor = `hsl(${hue | 0},80%,60%)`
        ctx.font        = "bold 26px system-ui,sans-serif"
        ctx.textAlign   = "center"
        ctx.fillText("♪ ♫ ♪", cx, cy - curR - 20)
        ctx.restore()
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(ts => { prev = ts; frame(ts) })

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("pointerdown", onDown)
      window.removeEventListener("resize", resize)
      void ac.close()
    }
  }, [phase, isDemo, getFrame]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#06060e] flex flex-col items-center
                      justify-center gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Voice Monster 🎤</h1>
          <p className="text-muted-foreground text-base max-w-xs leading-relaxed">
            Hum or sing — the monster grows with your voice!
            Feed it for {TARGET_SEC} seconds and it sings back what it heard.
          </p>
        </div>
        <button
          onClick={handleStartMic}
          className="bg-violet-700 hover:bg-violet-600 text-foreground text-xl font-semibold
                     px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
        >
          🎤 Start singing
        </button>
        {error && (
          <p className="text-violet-300 text-base max-w-xs">{error}</p>
        )}
        <button
          onClick={handleDemo}
          className="text-muted-foreground text-sm underline hover:text-foreground transition-colors"
        >
          Try demo (no mic needed)
        </button>
        <p className="text-muted-foreground text-sm">For kids 3+ · Tap the monster!</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#06060e]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      <div className="absolute top-0 left-0 right-0 h-[52px] flex items-center
                      justify-between px-4 pointer-events-none select-none">
        <span className="text-muted-foreground text-base font-semibold">Voice Monster 🎤</span>
        <Link href="/dream"
          className="text-muted-foreground text-sm pointer-events-auto hover:text-foreground">
          ← dream
        </Link>
      </div>

      {running && (
        <div className="absolute bottom-4 left-4 select-none pointer-events-none">
          <span className="text-violet-300/90 text-sm">🎤 mic live</span>
        </div>
      )}
      {!running && !isDemo && error && (
        <div className="absolute bottom-4 left-4 flex items-center gap-3 select-none">
          <span className="text-violet-300 text-sm">{error}</span>
          <button
            onClick={() => setIsDemo(true)}
            className="text-violet-300 text-sm underline pointer-events-auto
                       hover:text-violet-200 transition-colors"
          >
            demo
          </button>
        </div>
      )}

      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <Link href="/dream/179-kids-voice-monster/readme"
          className="text-muted-foreground/70 text-xs hover:text-muted-foreground">
          notes
        </Link>
      </div>
    </div>
  )
}
