'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'

// ── Pentatonic scale C3–C4 ──────────────────────────────────────────────────
const PENTA = [130.81, 164.81, 196.00, 220.00, 261.63] // C3 E3 G3 A3 C4

// Consonant response for each pentatonic note (P5 / P4 partner)
const RESP: Record<number, number> = {
  130.81: 196.00, // C3 → G3 (P5 up)
  164.81: 220.00, // E3 → A3 (P4 up)
  196.00: 261.63, // G3 → C4 (P4 up)
  220.00: 130.81, // A3 → C3 (P8 down — echoes low)
  261.63: 196.00, // C4 → G3 (P4 down)
}

function pickNote(): number {
  return PENTA[Math.floor(Math.random() * PENTA.length)]
}

function playTone(ctx: AudioContext, hz: number, vol = 0.28, dur = 0.90) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = hz
  osc.connect(env).connect(ctx.destination)
  const t = ctx.currentTime
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(vol, t + 0.04)
  env.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

// ── Types ───────────────────────────────────────────────────────────────────
type Sparkle = {
  x: number; y: number
  vx: number; vy: number
  life: number
  r: number; g: number; b: number
}

type Bubble = {
  x: number; y: number; r: number
  glow: number
  bounceVy: number; bounceY: number
}

type Anim = {
  actx: AudioContext | null
  phase: 'idle' | 'thinking' | 'singing'
  phaseTimer: number
  youNote: number
  you: Bubble
  friend: Bubble
  sparkles: Sparkle[]
  connArc: number
  firstTapDone: boolean
}

// ── Draw a soap bubble ──────────────────────────────────────────────────────
function drawBubble(
  ctx2d: CanvasRenderingContext2D,
  bx: number, by: number, br: number,
  cr: number, cg: number, cb: number,
  glow: number,
) {
  // outer glow halo
  if (glow > 0.03) {
    const og = ctx2d.createRadialGradient(bx, by, br * 0.4, bx, by, br * 2.1)
    og.addColorStop(0, `rgba(${cr},${cg},${cb},${(glow * 0.42).toFixed(2)})`)
    og.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx2d.beginPath()
    ctx2d.arc(bx, by, br * 2.1, 0, Math.PI * 2)
    ctx2d.fillStyle = og
    ctx2d.fill()
  }
  // translucent bubble fill
  const fill = ctx2d.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br)
  fill.addColorStop(0, `rgba(${cr},${cg},${cb},0.30)`)
  fill.addColorStop(1, `rgba(${cr},${cg},${cb},0.07)`)
  ctx2d.beginPath()
  ctx2d.arc(bx, by, br, 0, Math.PI * 2)
  ctx2d.fillStyle = fill
  ctx2d.fill()
  // rim
  ctx2d.beginPath()
  ctx2d.arc(bx, by, br, 0, Math.PI * 2)
  ctx2d.strokeStyle = `rgba(${cr},${cg},${cb},0.82)`
  ctx2d.lineWidth = 2.5
  ctx2d.stroke()
  // top-left crescent highlight
  const hl = ctx2d.createRadialGradient(bx - br * 0.30, by - br * 0.30, 0, bx - br * 0.30, by - br * 0.30, br * 0.55)
  hl.addColorStop(0, 'rgba(255,255,255,0.58)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx2d.beginPath()
  ctx2d.arc(bx, by, br, 0, Math.PI * 2)
  ctx2d.fillStyle = hl
  ctx2d.fill()
  // bottom glint
  ctx2d.beginPath()
  ctx2d.arc(bx + br * 0.20, by + br * 0.56, br * 0.09, 0, Math.PI * 2)
  ctx2d.fillStyle = 'rgba(255,255,255,0.28)'
  ctx2d.fill()
}

// Draw smiley face inside YOU bubble
function drawSmiley(ctx2d: CanvasRenderingContext2D, bx: number, by: number, br: number) {
  const er = br * 0.11
  ctx2d.fillStyle = 'rgba(255,255,255,0.82)'
  // eyes
  ctx2d.beginPath(); ctx2d.arc(bx - br * 0.22, by - br * 0.12, er, 0, Math.PI * 2); ctx2d.fill()
  ctx2d.beginPath(); ctx2d.arc(bx + br * 0.22, by - br * 0.12, er, 0, Math.PI * 2); ctx2d.fill()
  // smile arc
  ctx2d.beginPath()
  ctx2d.arc(bx, by + br * 0.06, br * 0.30, 0.2, Math.PI - 0.2)
  ctx2d.strokeStyle = 'rgba(255,255,255,0.82)'
  ctx2d.lineWidth = br * 0.08
  ctx2d.lineCap = 'round'
  ctx2d.stroke()
}

// ── Component ───────────────────────────────────────────────────────────────
export default function KidsBubbleDuet() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<Anim>({
    actx: null,
    phase: 'idle',
    phaseTimer: 0,
    youNote: 196.00,
    you:    { x: 0, y: 0, r: 0, glow: 0.55, bounceVy: 0, bounceY: 0 },
    friend: { x: 0, y: 0, r: 0, glow: 0,    bounceVy: 0, bounceY: 0 },
    sparkles: [],
    connArc: 0,
    firstTapDone: false,
  })
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = animRef.current
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = canvas.clientWidth  * dpr
      canvas.height = canvas.clientHeight * dpr
      const W = canvas.width, H = canvas.height
      const br = Math.min(W, H) * 0.172
      a.you.x    = W * 0.28; a.you.y    = H * 0.44; a.you.r    = br
      a.friend.x = W * 0.72; a.friend.y = H * 0.44; a.friend.r = br * 0.93
    }
    resize()
    window.addEventListener('resize', resize)

    const handleTap = (e: PointerEvent) => {
      // unlock AudioContext on first touch
      if (!a.actx) {
        const actx = new AudioContext()
        a.actx = actx
        const pad = (hz: number, g: number) => {
          const o = actx.createOscillator()
          const gn = actx.createGain()
          o.type = 'sine'
          o.frequency.value = hz
          gn.gain.value = g
          o.connect(gn).connect(actx.destination)
          o.start()
        }
        pad(130.81, 0.013) // C3
        pad(196.00, 0.008) // G3
      }
      if (a.phase !== 'idle') return
      // hit-test YOU bubble with generous +24 px tolerance
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width  / rect.width)
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height)
      if (Math.hypot(px - a.you.x, py - a.you.y) > a.you.r + 24) return

      a.firstTapDone = true
      const note = pickNote()
      a.youNote = note
      a.you.bounceVy = -10
      a.you.glow = 1.0
      a.phase = 'thinking'
      a.phaseTimer = 1200
      playTone(a.actx, note, 0.30, 0.90)
      // rose sparkle burst from YOU
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
        const spd = 2.5 + Math.random() * 2.5
        a.sparkles.push({ x: a.you.x, y: a.you.y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 1, life: 1, r: 251, g: 113, b: 133 })
      }
    }
    canvas.addEventListener('pointerdown', handleTap)

    let prev = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(now - prev, 50)
      prev = now
      const W = canvas.width, H = canvas.height

      // ── Phase transitions ─────────────────────────────────────────────────
      if (a.phase === 'thinking') {
        a.phaseTimer -= dt
        a.friend.glow = Math.min(1.0, a.friend.glow + dt * 0.0016)
        if (a.phaseTimer <= 0) {
          a.phase = 'singing'
          a.phaseTimer = 900
          a.friend.glow = 1.0
          a.friend.bounceVy = -7
          a.connArc = 1.0
          const resp = RESP[a.youNote] ?? PENTA[2]
          if (a.actx) playTone(a.actx, resp, 0.28, 0.90)
          // cyan sparkles arc from friend toward you
          const ang = Math.atan2(a.you.y - a.friend.y, a.you.x - a.friend.x)
          for (let i = 0; i < 16; i++) {
            const spread = (Math.random() - 0.5) * 0.55
            const spd = 3.5 + Math.random() * 2.5
            a.sparkles.push({
              x: a.friend.x, y: a.friend.y,
              vx: Math.cos(ang + spread) * spd,
              vy: Math.sin(ang + spread) * spd,
              life: 1, r: 34, g: 211, b: 238,
            })
          }
        }
      } else if (a.phase === 'singing') {
        a.phaseTimer -= dt
        a.connArc = Math.max(0, a.phaseTimer / 900)
        if (a.phaseTimer <= 0) {
          a.phase = 'idle'
          a.friend.glow = 0
          a.connArc = 0
          a.you.glow = 0.55
        }
      } else {
        // idle: YOU bubble pulses invitingly
        a.you.glow = 0.40 + 0.22 * Math.sin(now * 0.0021)
        a.friend.glow = Math.max(0, a.friend.glow - dt * 0.0012)
      }

      // ── Bounce physics (spring return to y=0) ────────────────────────────
      a.you.bounceVy += 0.88
      a.you.bounceY  += a.you.bounceVy
      if (a.you.bounceY >= 0) { a.you.bounceY = 0; a.you.bounceVy = 0 }

      a.friend.bounceVy += 0.88
      a.friend.bounceY  += a.friend.bounceVy
      if (a.friend.bounceY >= 0) { a.friend.bounceY = 0; a.friend.bounceVy = 0 }

      // ── Sparkle update ────────────────────────────────────────────────────
      a.sparkles = a.sparkles.filter(s => s.life > 0)
      for (const s of a.sparkles) {
        s.x += s.vx
        s.y += s.vy
        s.vy += 0.12
        s.life -= dt / 680
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.fillStyle = '#060812'
      ctx.fillRect(0, 0, W, H)

      // background stars
      for (let i = 0; i < 45; i++) {
        const sx = ((i * 71 + 13) % 97) / 97 * W
        const sy = ((i * 53 + 7)  % 89) / 89 * H
        const blink = 0.22 + 0.55 * Math.sin(now * 0.0006 + i * 2.1)
        ctx.globalAlpha = blink * 0.45
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(sx, sy, 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      const youY = a.you.y    + a.you.bounceY
      const frY  = a.friend.y + a.friend.bounceY

      // dashed connection arc during FRIEND's response
      if (a.connArc > 0.02) {
        ctx.save()
        ctx.globalAlpha = a.connArc * 0.55
        ctx.setLineDash([7, 9])
        ctx.strokeStyle = 'rgba(180,228,255,1)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(a.you.x, youY)
        const midX = (a.you.x + a.friend.x) / 2
        const midY = Math.min(youY, frY) - H * 0.07
        ctx.quadraticCurveTo(midX, midY, a.friend.x, frY)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      // sparkles
      for (const s of a.sparkles) {
        ctx.globalAlpha = Math.max(0, s.life)
        ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // bubbles
      drawBubble(ctx, a.you.x,    youY, a.you.r,    251, 113, 133, a.you.glow)
      drawBubble(ctx, a.friend.x, frY,  a.friend.r,  34, 211, 238, a.friend.glow)

      // smiley in YOU bubble
      drawSmiley(ctx, a.you.x, youY, a.you.r)
      // music note in FRIEND bubble
      const fnSz = Math.round(a.friend.r * 0.60)
      ctx.fillStyle = 'rgba(255,255,255,0.80)'
      ctx.font = `${fnSz}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('♪', a.friend.x, frY)

      // character labels below bubbles
      const lblSz = Math.round(H * 0.030)
      ctx.font = `bold ${lblSz}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(251,113,133,0.80)'
      ctx.fillText('YOU', a.you.x, youY + a.you.r + 8)
      ctx.fillStyle = 'rgba(34,211,238,0.80)'
      ctx.fillText('FRIEND', a.friend.x, frY + a.friend.r + 8)

      // hint before first tap
      if (!a.firstTapDone) {
        const hp = 0.65 + 0.35 * Math.sin(now * 0.0024)
        ctx.globalAlpha = hp
        ctx.fillStyle = 'rgba(255,200,210,1)'
        ctx.font = `bold ${Math.round(H * 0.040)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Tap the pink bubble!', W / 2, H * 0.82)
        ctx.globalAlpha = 1
      }

      // phase status label
      const pSz = Math.round(H * 0.030)
      ctx.font = `${pSz}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (a.phase === 'thinking') {
        ctx.fillStyle = 'rgba(34,211,238,0.70)'
        ctx.fillText('♪ Friend is listening…', W / 2, H * 0.78)
      } else if (a.phase === 'idle' && a.firstTapDone) {
        ctx.fillStyle = 'rgba(251,113,133,0.60)'
        ctx.fillText('your turn ♪', W / 2, H * 0.78)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handleTap)
    }
  }, [])

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#060812] text-white select-none">
      <div className="w-full max-w-md px-4 pb-6 pt-6">
        <h1 className="text-2xl font-mono text-center mb-1 text-white">
          Bubble Duet
        </h1>
        <p className="text-white/75 text-base text-center mb-4">
          Tap the pink bubble — your friend will sing back!
        </p>
        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl touch-none cursor-pointer"
          style={{ height: 'min(82vw, 470px)', display: 'block' }}
        />
        <div className="flex justify-between mt-4 px-1">
          <Link
            href="."
            className="text-white/55 text-sm font-mono hover:text-white/80 transition-colors"
          >
            ← dream lab
          </Link>
          <span className="text-white/30 text-xs font-mono">
            for kids 3+
          </span>
        </div>
      </div>
    </main>
  )
}
