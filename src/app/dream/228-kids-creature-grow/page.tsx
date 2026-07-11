'use client'

import { useRef, useEffect, useCallback } from 'react'

// C4 D4 E4 G4 A4 C5  — pentatonic, no wrong notes
const NOTE_HZ = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]
const PART_COLOR = ['#06b6d4', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#fbbf24']
const MAX_STAGE = NOTE_HZ.length

type Sparkle = {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  color: string
}

type S = {
  stage: number
  glows: number[]
  celebrateUntil: number
  singPhase: number
  singNextAt: number
  sparkles: Sparkle[]
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * dpr
  canvas.height = canvas.clientHeight * dpr
}

function playTone(actx: AudioContext, freq: number, dur = 0.55) {
  const osc = actx.createOscillator()
  const env = actx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  osc.connect(env)
  env.connect(actx.destination)
  const t = actx.currentTime
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(0.3, t + 0.03)
  env.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function addSparkles(
  sparks: Sparkle[],
  cx: number, cy: number,
  color: string, count: number, spd = 4,
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = spd * (0.5 + Math.random() * 0.8)
    const life = 32 + Math.random() * 22
    sparks.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      life, maxLife: life, color,
    })
  }
}

function drawScene(ctx: CanvasRenderingContext2D, s: S, ts: number) {
  const { width, height } = ctx.canvas
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.29

  // Background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.65)
  bg.addColorStop(0, '#0f0a1e')
  bg.addColorStop(1, '#04020c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Sparkles
  for (const sp of s.sparkles) {
    const alpha = (sp.life / sp.maxLife) * 0.88
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = sp.color
    ctx.shadowColor = sp.color
    ctx.shadowBlur = 7
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (s.stage === 0) {
    // Egg — pulsing lavender ellipse with crack
    const pulse = 1 + 0.06 * Math.sin(ts * 0.0024)
    const ew = r * 0.37 * pulse
    const eh = r * 0.5 * pulse

    const gw = ctx.createRadialGradient(cx, cy, 0, cx, cy, eh * 2.4)
    gw.addColorStop(0, 'rgba(168,85,247,0.28)')
    gw.addColorStop(1, 'rgba(168,85,247,0)')
    ctx.fillStyle = gw
    ctx.beginPath()
    ctx.ellipse(cx, cy, eh * 2.4, eh * 2.4, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.fillStyle = '#eedeff'
    ctx.shadowColor = '#a855f7'
    ctx.shadowBlur = 22
    ctx.beginPath()
    ctx.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = 'rgba(168,85,247,0.55)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - ew * 0.08, cy - eh * 0.28)
    ctx.lineTo(cx + ew * 0.16, cy - eh * 0.06)
    ctx.lineTo(cx - ew * 0.04, cy + eh * 0.12)
    ctx.stroke()
    ctx.restore()
  } else {
    // Creature
    const bodyY = cy + r * 0.08
    const headY = cy - r * 0.44
    const br = r * 0.46
    const hr = r * 0.34

    // Body glow halo
    const halo = ctx.createRadialGradient(cx, bodyY, 0, cx, bodyY, br * 2.1)
    halo.addColorStop(0, 'rgba(147,51,234,0.22)')
    halo.addColorStop(1, 'rgba(147,51,234,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.ellipse(cx, bodyY, br * 2.1, br * 2.1, 0, 0, Math.PI * 2)
    ctx.fill()

    // Wings — behind body
    if (s.stage >= MAX_STAGE) {
      const wg = s.glows[5]
      const wp = 1 + 0.06 * Math.sin(ts * 0.0038)
      ctx.save()
      ctx.globalAlpha = 0.6 + wg * 0.3
      ctx.fillStyle = 'rgba(251,191,36,0.15)'
      ctx.strokeStyle = `rgba(251,191,36,${0.55 + wg * 0.4})`
      ctx.lineWidth = 2
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 9 + wg * 22
      ctx.beginPath()
      ctx.ellipse(cx - br * 0.88, bodyY - br * 0.2, br * 1.45 * wp, br * 0.92 * wp, -0.28, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(cx + br * 0.88, bodyY - br * 0.2, br * 1.45 * wp, br * 0.92 * wp, 0.28, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    // Body
    ctx.save()
    ctx.fillStyle = '#9333ea'
    ctx.shadowColor = '#a855f7'
    ctx.shadowBlur = 15
    ctx.beginPath()
    ctx.ellipse(cx, bodyY, br * 0.7, br, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Head
    ctx.save()
    ctx.fillStyle = '#a855f7'
    ctx.shadowColor = '#c084fc'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(cx, headY, hr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Ears (stage 2)
    if (s.stage >= 2) {
      const eg = s.glows[1]
      const earR = hr * 0.27
      const earX = hr * 0.98
      const earTop = headY - hr * 0.52
      ctx.save()
      ctx.fillStyle = `rgba(16,185,129,${0.82 + eg * 0.18})`
      ctx.shadowColor = '#10b981'
      ctx.shadowBlur = 4 + eg * 18
      ctx.beginPath()
      ctx.arc(cx - earX, earTop, earR, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + earX, earTop, earR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#6ee7b7'
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(cx - earX, earTop, earR * 0.48, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + earX, earTop, earR * 0.48, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Eyes (stage 1)
    if (s.stage >= 1) {
      const eg = s.glows[0]
      const eyeR = hr * 0.22
      const eyeX = hr * 0.38
      const eyeY = headY + hr * 0.06
      ctx.save()
      ctx.fillStyle = `rgba(6,182,212,${0.85 + eg * 0.15})`
      ctx.shadowColor = '#06b6d4'
      ctx.shadowBlur = 5 + eg * 22
      ctx.beginPath()
      ctx.arc(cx - eyeX, eyeY, eyeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + eyeX, eyeY, eyeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(cx - eyeX, eyeY + eyeR * 0.1, eyeR * 0.48, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + eyeX, eyeY + eyeR * 0.1, eyeR * 0.48, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Smile (stage 3)
    if (s.stage >= 3) {
      const sg = s.glows[2]
      ctx.save()
      ctx.strokeStyle = `rgba(245,158,11,${0.85 + sg * 0.15})`
      ctx.lineWidth = 2.5 + sg * 2
      ctx.lineCap = 'round'
      ctx.shadowColor = '#f59e0b'
      ctx.shadowBlur = 4 + sg * 16
      ctx.beginPath()
      ctx.arc(cx, headY + hr * 0.32, hr * 0.44, 0.16 * Math.PI, 0.84 * Math.PI)
      ctx.stroke()
      ctx.restore()
    }

    // Arms (stage 4)
    if (s.stage >= 4) {
      const ag = s.glows[3]
      ctx.save()
      ctx.strokeStyle = `rgba(59,130,246,${0.78 + ag * 0.22})`
      ctx.lineWidth = 5 + ag * 3
      ctx.lineCap = 'round'
      ctx.shadowColor = '#3b82f6'
      ctx.shadowBlur = 5 + ag * 18
      const ay = bodyY - br * 0.3
      const ae = bodyY + br * 0.4
      ctx.beginPath()
      ctx.moveTo(cx - br * 0.7, ay)
      ctx.bezierCurveTo(cx - br * 1.22, ay + br * 0.22, cx - br * 1.28, ae - br * 0.08, cx - br * 1.08, ae)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + br * 0.7, ay)
      ctx.bezierCurveTo(cx + br * 1.22, ay + br * 0.22, cx + br * 1.28, ae - br * 0.08, cx + br * 1.08, ae)
      ctx.stroke()
      ctx.restore()
    }

    // Legs (stage 5)
    if (s.stage >= 5) {
      const lg = s.glows[4]
      ctx.save()
      ctx.strokeStyle = `rgba(236,72,153,${0.78 + lg * 0.22})`
      ctx.lineWidth = 6 + lg * 3
      ctx.lineCap = 'round'
      ctx.shadowColor = '#ec4899'
      ctx.shadowBlur = 5 + lg * 18
      const lt = bodyY + br * 0.72
      const lb = bodyY + br * 1.52
      ctx.beginPath()
      ctx.moveTo(cx - br * 0.28, lt)
      ctx.bezierCurveTo(cx - br * 0.42, lt + br * 0.5, cx - br * 0.52, lb - br * 0.1, cx - br * 0.44, lb)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + br * 0.28, lt)
      ctx.bezierCurveTo(cx + br * 0.42, lt + br * 0.5, cx + br * 0.52, lb - br * 0.1, cx + br * 0.44, lb)
      ctx.stroke()
      ctx.restore()
    }

    // Celebration text
    if (ts < s.celebrateUntil) {
      const fade = Math.min(1, (s.celebrateUntil - ts) / 2000)
      ctx.save()
      ctx.globalAlpha = fade
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fbbf24'
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 12
      ctx.font = `bold ${Math.round(r * 0.2)}px sans-serif`
      ctx.fillText('✨ Fully grown! ✨', cx, cy - r * 1.05)
      ctx.restore()
    }
  }

  // Progress dots
  {
    const dotR = Math.max(6, Math.round(r * 0.054))
    const spacing = dotR * 2.9
    const startX = cx - ((MAX_STAGE - 1) * spacing) / 2
    const dotsY = height - Math.max(dotR * 2.5, 28)
    for (let i = 0; i < MAX_STAGE; i++) {
      const filled = s.stage > i
      ctx.save()
      if (filled) {
        ctx.fillStyle = PART_COLOR[i]!
        ctx.shadowColor = PART_COLOR[i]!
        ctx.shadowBlur = 8
      } else {
        ctx.fillStyle = s.stage === i
          ? 'rgba(255,255,255,0.45)'
          : 'rgba(255,255,255,0.15)'
      }
      ctx.beginPath()
      ctx.arc(startX + i * spacing, dotsY, dotR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Hint text
  if (s.stage === 0) {
    const pulse = 0.5 + 0.4 * Math.sin(ts * 0.0022)
    ctx.save()
    ctx.globalAlpha = 0.5 + pulse * 0.38
    ctx.textAlign = 'center'
    ctx.font = `${Math.round(r * 0.18)}px monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Tap to hatch!', cx, cy + r * 0.94)
    ctx.restore()
  } else if (s.stage === MAX_STAGE && s.singPhase < 0 && ts > s.celebrateUntil) {
    const pulse = 0.5 + 0.4 * Math.sin(ts * 0.002)
    ctx.save()
    ctx.globalAlpha = 0.45 + pulse * 0.38
    ctx.textAlign = 'center'
    ctx.font = `${Math.round(r * 0.16)}px monospace`
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('Tap to sing!', cx, cy + r * 1.18)
    ctx.restore()
  }
}

export default function KidsCreatureGrow() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const stateRef = useRef<S>({
    stage: 0,
    glows: Array.from({ length: MAX_STAGE }, () => 0),
    celebrateUntil: 0,
    singPhase: -1,
    singNextAt: 0,
    sparkles: [],
  })

  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const m = stateRef.current
    const ts = performance.now()

    // Update sparkles
    m.sparkles = m.sparkles.filter(sp => sp.life > 0)
    for (const sp of m.sparkles) {
      sp.x += sp.vx
      sp.y += sp.vy
      sp.vy += 0.22
      sp.vx *= 0.98
      sp.life -= 1
    }

    // Advance sing-back
    if (m.singPhase >= 0 && ts >= m.singNextAt) {
      const ni = m.singPhase
      m.glows[ni] = 1.0
      if (audioRef.current) playTone(audioRef.current, NOTE_HZ[ni]!, 0.5)
      m.singPhase = ni + 1 >= MAX_STAGE ? -1 : ni + 1
      if (m.singPhase >= 0) m.singNextAt = ts + 580
    }

    // Decay glows
    for (let i = 0; i < MAX_STAGE; i++) {
      if (m.glows[i]! > 0) m.glows[i] = Math.max(0, m.glows[i]! - 0.012)
    }

    drawScene(ctx, m, ts)
    rafRef.current = requestAnimationFrame(animate)
  }, [])

  const handlePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const m = stateRef.current
    if (!audioRef.current) audioRef.current = new AudioContext()
    const actx = audioRef.current
    if (actx.state === 'suspended') actx.resume().catch(() => {})

    const canvas = canvasRef.current
    if (!canvas) return

    const ts = performance.now()
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    if (m.stage < MAX_STAGE) {
      const ni = m.stage
      playTone(actx, NOTE_HZ[ni]!)
      m.glows[ni] = 1.0
      m.stage++
      addSparkles(m.sparkles, cx, cy, PART_COLOR[ni]!, 18, 4.5)

      if (m.stage === MAX_STAGE) {
        m.celebrateUntil = ts + 3200
        const burstColors = ['#fbbf24', '#a855f7', '#06b6d4', '#ec4899', '#10b981', '#3b82f6']
        for (let i = 0; i < 60; i++) {
          const angle = (i / 60) * Math.PI * 2
          const spd = 3 + Math.random() * 5.5
          const life = 55 + Math.random() * 35
          m.sparkles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 2.5,
            life, maxLife: life,
            color: burstColors[i % 6]!,
          })
        }
        // Sing-back starts 1 second after celebration
        const ref = stateRef
        setTimeout(() => {
          ref.current.singPhase = 0
          ref.current.singNextAt = performance.now() + 300
        }, 1000)
      }
    } else if (m.singPhase < 0) {
      // Re-sing on tap when fully grown
      m.singPhase = 0
      m.singNextAt = ts + 100
      addSparkles(m.sparkles, cx, cy, '#fbbf24', 24, 3.5)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(() => resizeCanvas(canvas))
    obs.observe(canvas)
    resizeCanvas(canvas)
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(rafRef.current)
      audioRef.current?.close()
    }
  }, [animate])

  return (
    <main className="relative w-full h-screen bg-[#04020c] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 px-6 pt-5 pointer-events-none">
        <h1 className="text-2xl font-serif text-foreground tracking-wide">Creature Grow</h1>
        <p className="text-base text-muted-foreground mt-1">
          Tap to feed your creature a note — six notes to grow!
        </p>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        onPointerDown={handlePointer}
      />
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 pointer-events-none">
        <p className="text-xs text-muted-foreground">
          Zero deps · Zero permissions · Pure Web Audio + Canvas
        </p>
      </div>
    </main>
  )
}
