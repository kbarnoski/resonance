"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// ── Pentatonic pitches per petal C3→C4 ───────────────────────────────────────
const PETAL_HZ = [130.81, 164.81, 196.00, 220.00, 261.63]

// ── X-zone: left=violet/piano, center-left=amber/bells, center-right=teal/pluck, right=rose/pad
type Timbre = "piano" | "bells" | "pluck" | "pad"
interface Zone { timbre: Timbre; petalColor: string; glowColor: string; stemColor: string }
function getZone(xFrac: number): Zone {
  if (xFrac < 0.25) return { timbre: "piano", petalColor: "#c4b5fd", glowColor: "#a78bfa", stemColor: "#5b21b6" }
  if (xFrac < 0.50) return { timbre: "bells", petalColor: "#fde68a", glowColor: "#fbbf24", stemColor: "#92400e" }
  if (xFrac < 0.75) return { timbre: "pluck", petalColor: "#99f6e4", glowColor: "#2dd4bf", stemColor: "#0f766e" }
  return                    { timbre: "pad",   petalColor: "#fda4af", glowColor: "#f43f5e", stemColor: "#9f1239" }
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function playNote(ac: AudioContext, hz: number, timbre: Timbre, vol = 1.0) {
  const t = ac.currentTime
  if (timbre === "piano") {
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = "triangle"; o.frequency.value = hz
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28 * vol, t + 0.005)
    g.gain.setTargetAtTime(0, t + 0.005, 0.42)
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 2)
  } else if (timbre === "bells") {
    for (const [f, v] of [[hz, 0.24 * vol], [hz * 2, 0.07 * vol]] as [number, number][]) {
      const o = ac.createOscillator(); const g = ac.createGain()
      o.type = "triangle"; o.frequency.value = f
      g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t, 0.52)
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 2.5)
    }
  } else if (timbre === "pluck") {
    const P = Math.round(ac.sampleRate / hz)
    const len = P + Math.round(ac.sampleRate * 1.8)
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < P; i++) d[i] = (Math.random() - 0.5) * 2
    for (let i = P; i < len; i++) d[i] = 0.4965 * (d[i - P] + d[i - P - 1])
    const s = ac.createBufferSource(); const g = ac.createGain()
    s.buffer = buf; g.gain.value = 0.42 * vol
    s.connect(g); g.connect(ac.destination); s.start()
  } else {
    const o = ac.createOscillator(); const g = ac.createGain()
    o.type = "sine"; o.frequency.value = hz
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.20 * vol, t + 0.07)
    g.gain.setTargetAtTime(0, t + 0.07, 0.85)
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 4)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Flower {
  id: number
  x: number; rootY: number; stemTip: number
  timbre: Timbre; petalColor: string; glowColor: string; stemColor: string
  holdSec: number; petalCount: number; notesFired: Set<number>
  state: "growing" | "bloomed" | "fading"
  opacity: number; swayPhase: number; nextLoopMs: number
}

const MAX_FLOWERS = 6
const PETAL_GAP   = 0.75  // seconds between petals
const STEM_SPEED  = 14    // CSS px per second of hold
const STEM_MAX    = 125   // max stem CSS px
const SOIL_FRAC   = 0.78  // soil strip starts at 78% of canvas height

// ── Background stars (stable golden-ratio distribution) ───────────────────────
const STARS = Array.from({ length: 38 }, (_, i) => ({
  nx:  Math.sin(i * 1.618034) * 0.5 + 0.5,
  ny: (Math.sin(i * 2.718282) * 0.5 + 0.5) * 0.72,
  ph:  i * 0.91,
}))

// ── Component ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [phase, setPhase]  = useState<"start" | "play">("start")
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const actxRef    = useRef<AudioContext | null>(null)
  const flowersRef = useRef<Flower[]>([])
  const dimRef     = useRef({ W: 0, H: 0 })
  const nextId     = useRef(0)
  const heldRef    = useRef(new Map<number, number>()) // pointerId → flower id

  function handleStart() {
    const ac = new AudioContext()
    actxRef.current = ac
    // Soft wind: looped white noise → lowpass 180 Hz
    const wLen = ac.sampleRate * 2
    const wBuf = ac.createBuffer(1, wLen, ac.sampleRate)
    const wd   = wBuf.getChannelData(0)
    for (let i = 0; i < wLen; i++) wd[i] = (Math.random() - 0.5) * 2
    const wsrc = ac.createBufferSource(); wsrc.buffer = wBuf; wsrc.loop = true
    const wflt = ac.createBiquadFilter(); wflt.type = "lowpass"; wflt.frequency.value = 180
    const wgn  = ac.createGain(); wgn.gain.value = 0.016
    wsrc.connect(wflt); wflt.connect(wgn); wgn.connect(ac.destination); wsrc.start()
    setPhase("play")
  }

  function buildFlower(x: number, rootY: number): Flower {
    const { W } = dimRef.current
    const z = getZone(x / W)
    return {
      id: nextId.current++, x, rootY, stemTip: rootY,
      timbre: z.timbre, petalColor: z.petalColor, glowColor: z.glowColor, stemColor: z.stemColor,
      holdSec: 0, petalCount: 0, notesFired: new Set(),
      state: "growing", opacity: 1,
      swayPhase: Math.random() * Math.PI * 2, nextLoopMs: 0,
    }
  }

  useEffect(() => {
    if (phase !== "play") return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { innerWidth: W, innerHeight: H } = window
      dimRef.current = { W, H }
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.scale(dpr, dpr)
    }
    resize(); window.addEventListener("resize", resize)

    const getXY = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const { W, H } = dimRef.current
      const soilY = H * SOIL_FRAC
      const { x, y } = getXY(e)
      if (y < soilY) return
      const active = flowersRef.current.filter(f => f.state !== "fading")
      if (active.length >= MAX_FLOWERS) return
      canvas.setPointerCapture(e.pointerId)
      const fl = buildFlower(Math.max(0, Math.min(W, x)), soilY - 2)
      flowersRef.current.push(fl)
      heldRef.current.set(e.pointerId, fl.id)
    }

    const onUp = (e: PointerEvent) => {
      const fid = heldRef.current.get(e.pointerId)
      heldRef.current.delete(e.pointerId)
      if (fid === undefined) return
      const fl = flowersRef.current.find(f => f.id === fid)
      if (!fl || fl.state !== "growing") return
      // Ensure at least 1 petal fires even on a quick tap
      if (fl.petalCount === 0) {
        fl.petalCount = 1; fl.stemTip = fl.rootY - 10
        const ac = actxRef.current
        if (ac) {
          if (ac.state === "suspended") void ac.resume()
          playNote(ac, PETAL_HZ[0], fl.timbre)
          fl.notesFired.add(0)
        }
      }
      fl.state = "bloomed"
      fl.nextLoopMs = performance.now() + 3500
    }

    canvas.addEventListener("pointerdown",   onDown)
    canvas.addEventListener("pointerup",     onUp)
    canvas.addEventListener("pointercancel", onUp)

    let raf = 0; let running = true
    let prevTs = 0; let grandFired = false
    const startMs = performance.now(); let demoPlanted = false

    const frame = (ts: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      if (prevTs === 0) prevTs = ts
      const dt    = Math.min(0.05, (ts - prevTs) / 1000)
      prevTs      = ts
      const nowMs = performance.now()
      const { W, H } = dimRef.current
      const soilY = H * SOIL_FRAC
      const ac    = actxRef.current

      // Demo: plant violet + rose flower at 0.7s (pre-bloomed, shows the mechanic)
      if (!demoPlanted && nowMs - startMs > 700) {
        demoPlanted = true
        const f1 = buildFlower(W * 0.22, soilY - 2)
        const f2 = buildFlower(W * 0.78, soilY - 2)
        for (const fl of [f1, f2]) {
          fl.holdSec = 4.0
          fl.stemTip = soilY - 2 - Math.min(STEM_MAX, 4.0 * STEM_SPEED)
          fl.petalCount = Math.min(5, Math.floor(4.0 / PETAL_GAP) + 1)
          for (let p = 0; p < fl.petalCount; p++) fl.notesFired.add(p)
          fl.state = "bloomed"
          fl.nextLoopMs = nowMs + 2500 + Math.random() * 1500
        }
        flowersRef.current.push(f1, f2)
      }

      // Grow held flowers
      for (const [pid, fid] of heldRef.current) {
        const fl = flowersRef.current.find(f => f.id === fid)
        if (!fl || fl.state !== "growing") { heldRef.current.delete(pid); continue }
        fl.holdSec += dt
        fl.stemTip  = soilY - 2 - Math.min(STEM_MAX, fl.holdSec * STEM_SPEED)
        const newPC = Math.min(5, Math.floor(fl.holdSec / PETAL_GAP) + 1)
        if (newPC > fl.petalCount) {
          for (let p = fl.petalCount; p < newPC; p++) {
            if (!fl.notesFired.has(p) && ac) {
              if (ac.state === "suspended") void ac.resume()
              playNote(ac, PETAL_HZ[p], fl.timbre)
              fl.notesFired.add(p)
            }
          }
          fl.petalCount = newPC
        }
      }

      // Grand chord: all 6 bloomed simultaneously → all fade over 12 s
      const active = flowersRef.current.filter(f => f.state !== "fading")
      if (!grandFired && active.length === MAX_FLOWERS && active.every(f => f.state === "bloomed")) {
        grandFired = true
        if (ac) {
          active.forEach((fl, fi) => {
            for (let p = 0; p < fl.petalCount; p++) {
              const ms = fi * 90 + p * 55
              setTimeout(() => {
                if (ac.state === "suspended") void ac.resume()
                playNote(ac, PETAL_HZ[p], fl.timbre, 0.45)
              }, ms)
            }
          })
        }
        for (const fl of active) { fl.state = "fading"; fl.nextLoopMs = Infinity }
        setTimeout(() => {
          if (!running) return
          flowersRef.current = []; grandFired = false
        }, 13500)
      }

      // Per-flower updates (sway + loop chord + fade)
      for (const fl of flowersRef.current) {
        if (fl.state === "growing") {
          fl.swayPhase += dt * 0.25
        } else if (fl.state === "bloomed") {
          fl.swayPhase += dt * 0.65
          if (nowMs >= fl.nextLoopMs && ac) {
            if (ac.state === "suspended") void ac.resume()
            for (let p = 0; p < fl.petalCount; p++) playNote(ac, PETAL_HZ[p], fl.timbre, 0.28)
            fl.nextLoopMs = nowMs + 4200
          }
        } else if (fl.state === "fading") {
          fl.swayPhase += dt * 0.45
          fl.opacity    = Math.max(0, fl.opacity - dt / 12)
        }
      }

      // ── Draw ─────────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)

      // Sky: near-black navy → deep purple → warm amber at horizon
      const sky = ctx.createLinearGradient(0, 0, 0, soilY)
      sky.addColorStop(0,   "#050510")
      sky.addColorStop(0.6, "#180a2a")
      sky.addColorStop(1,   "#3d1808")
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, soilY)

      // Stars
      for (const st of STARS) {
        const tw = 0.07 + 0.05 * Math.sin(ts * 0.0006 + st.ph)
        ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`
        ctx.beginPath(); ctx.arc(st.nx * W, st.ny * soilY, 0.85, 0, Math.PI * 2); ctx.fill()
      }

      // Soil
      const soil = ctx.createLinearGradient(0, soilY, 0, H)
      soil.addColorStop(0,   "#3b1e0a")
      soil.addColorStop(0.4, "#1f0f05")
      soil.addColorStop(1,   "#0d0702")
      ctx.fillStyle = soil; ctx.fillRect(0, soilY, W, H - soilY)

      // Soil edge
      ctx.strokeStyle = "rgba(100,55,15,0.4)"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, soilY); ctx.lineTo(W, soilY); ctx.stroke()

      // Flowers
      for (const fl of flowersRef.current) {
        ctx.save(); ctx.globalAlpha = fl.opacity
        const sway = Math.sin(fl.swayPhase) * (fl.state === "bloomed" ? 5 : 1.5)
        const tipX = fl.x + sway
        const tipY = fl.stemTip
        const stemLen = fl.rootY - tipY

        // Stem
        ctx.strokeStyle = "#2d6b2d"; ctx.lineWidth = 2.5
        ctx.shadowBlur = 5; ctx.shadowColor = "#1a4a1a"
        ctx.beginPath(); ctx.moveTo(fl.x, fl.rootY); ctx.lineTo(tipX, tipY); ctx.stroke()
        ctx.shadowBlur = 0

        if (fl.petalCount > 0) {
          const PR = 6 + Math.min(13, stemLen / 7)
          // Petals
          for (let p = 0; p < fl.petalCount; p++) {
            const ang = (p / fl.petalCount) * Math.PI * 2 - Math.PI / 2
            ctx.save()
            ctx.translate(tipX + Math.cos(ang) * PR, tipY + Math.sin(ang) * PR)
            ctx.rotate(ang)
            ctx.fillStyle  = fl.petalColor
            ctx.shadowBlur = 14; ctx.shadowColor = fl.glowColor
            ctx.beginPath(); ctx.ellipse(0, 0, PR * 0.58, PR * 0.36, 0, 0, Math.PI * 2); ctx.fill()
            ctx.restore()
          }
          // Center dot
          ctx.shadowBlur = 18; ctx.shadowColor = fl.glowColor
          ctx.fillStyle  = fl.glowColor
          ctx.beginPath(); ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0
        }
        ctx.restore()
      }

      // Hint text (no active flowers)
      if (flowersRef.current.filter(f => f.state !== "fading").length === 0) {
        ctx.save()
        ctx.globalAlpha = 0.48; ctx.fillStyle = "#d4b896"
        ctx.font = "16px sans-serif"; ctx.textAlign = "center"
        ctx.fillText("Hold the soil to grow a flower", W * 0.5, soilY + 36)
        ctx.restore()
      }
    }

    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("pointerdown",   onDown)
      canvas.removeEventListener("pointerup",     onUp)
      canvas.removeEventListener("pointercancel", onUp)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "start") {
    return (
      <div className="fixed inset-0 bg-[#050510] flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Garden Bloom 🌸</h1>
          <p className="text-muted-foreground text-base max-w-xs">
            Hold the soil to grow a glowing flower. Each petal plays a note.
            Hold longer for a richer chord.
          </p>
        </div>
        <button
          onClick={handleStart}
          className="bg-violet-700 hover:bg-violet-600 text-foreground text-xl font-semibold
                     px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] transition-colors"
        >
          ▶ Start
        </button>
        <p className="text-muted-foreground text-sm">For kids 3+ · No permissions needed</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#050510]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between
                      px-4 pt-3 pb-2 pointer-events-none select-none">
        <span className="text-muted-foreground text-base font-semibold">Garden Bloom 🌸</span>
        <Link href="/dream"
          className="text-muted-foreground text-sm pointer-events-auto hover:text-foreground">
          ← dream
        </Link>
      </div>
      <div className="absolute top-14 left-0 right-0 text-center pointer-events-none select-none">
        <span className="text-muted-foreground/70 text-sm">Hold the soil · longer hold = more petals</span>
      </div>
      <div className="absolute bottom-5 right-4 pointer-events-auto">
        <Link href="/dream/173-kids-garden-bloom/readme"
          className="text-muted-foreground/70 text-xs hover:text-muted-foreground">notes</Link>
      </div>
    </div>
  )
}
