'use client'

import { useEffect, useRef, useState } from 'react'

// ── helpers ────────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']

function pitchHue(pc: number): number {
  return (pc * 30 + 260) % 360
}

function chordColor(root: number, quality: string, alpha = 1): string {
  const h = pitchHue(root)
  const s = quality === 'maj' ? 82 : 56
  return `hsla(${h},${s}%,52%,${alpha})`
}

function chordLabel(root: number, quality: string): string {
  return quality === 'maj' ? NOTE_NAMES[root] : NOTE_NAMES[root] + 'm'
}

// Chord templates: root position major + minor triads for all 12 pitch classes
const MAJ_T = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
const MIN_T = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]

type Template = { root: number; quality: string; vec: number[] }

function buildTemplates(): Template[] {
  const out: Template[] = []
  for (let r = 0; r < 12; r++) {
    out.push({ root: r, quality: 'maj', vec: MAJ_T.map((_, i) => MAJ_T[(i - r + 12) % 12]) })
    out.push({ root: r, quality: 'min', vec: MIN_T.map((_, i) => MIN_T[(i - r + 12) % 12]) })
  }
  return out
}

const TEMPLATES = buildTemplates()

function extractChroma(data: Uint8Array, sampleRate: number): Float32Array {
  const chroma = new Float32Array(12)
  const N = data.length
  for (let i = 1; i < N; i++) {
    const freq = i * sampleRate / (2 * N)
    if (freq < 65 || freq > 1800) continue   // C2–A♯6
    const midi = 12 * Math.log2(freq / 440) + 69
    const pc = ((Math.round(midi) % 12) + 12) % 12
    const v = data[i] / 255
    chroma[pc] += v * v
  }
  let mx = 0
  for (let i = 0; i < 12; i++) if (chroma[i] > mx) mx = chroma[i]
  if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] /= mx
  return chroma
}

function matchChord(chroma: Float32Array): { root: number; quality: string } {
  let best = { root: 0, quality: 'maj', score: -1 }
  for (const t of TEMPLATES) {
    let s = 0
    for (let i = 0; i < 12; i++) s += chroma[i] * t.vec[i]
    if (s > best.score) best = { root: t.root, quality: t.quality, score: s }
  }
  return best
}

function midiToHz(m: number): number { return 440 * Math.pow(2, (m - 69) / 12) }

function scheduleChord(actx: AudioContext, dest: AudioNode, midis: number[], t: number, dur: number) {
  midis.forEach(m => {
    const osc  = actx.createOscillator()
    const gain = actx.createGain()
    osc.connect(gain)
    gain.connect(dest)
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(m)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.11, t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.start(t)
    osc.stop(t + dur + 0.06)
  })
}

type Block = { root: number; quality: string; startT: number; endT: number }
type Mode  = 'idle' | 'mic' | 'demo'

// ── component ──────────────────────────────────────────────────────────────────

export default function ChordCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode,   setMode]   = useState<Mode>('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (mode === 'idle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Audio graph ────────────────────────────────────────────────────────
    const actx     = new AudioContext()
    const analyser = actx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.65
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    // Demo path: oscillators → masterGain → (destination + analyser)
    const masterGain = actx.createGain()
    masterGain.gain.value = 0.55
    masterGain.connect(actx.destination)
    masterGain.connect(analyser)

    let micStream: MediaStream | null = null
    let cancelled = false

    if (mode === 'mic') {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          micStream = stream
          actx.createMediaStreamSource(stream).connect(analyser)
        })
        .catch(() => { if (!cancelled) setErrMsg('Mic unavailable') })
    }

    // ── Demo scheduler (ii–V–I in C, repeating) ───────────────────────────
    const DEMO_SEQ = [
      { midis: [50, 53, 57],     dur: 2.0 },  // Dm: D3 F3 A3
      { midis: [43, 47, 50, 53], dur: 2.0 },  // G7: G2 B2 D3 F3
      { midis: [48, 52, 55],     dur: 2.0 },  // C:  C3 E3 G3
    ]
    let demoPhase = 0
    let demoNextT = actx.currentTime + 0.12

    // ── Analysis state ─────────────────────────────────────────────────────
    const smoothChroma = new Float32Array(12)
    const WIN_SEC  = 30
    const STABLE   = 5     // frames before chord commits
    const blocks: Block[] = []
    let curBlock: Block | null = null
    let pendKey  = ''
    let pendCount = 0

    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const W = canvas.width
      const H = canvas.height
      const nowT = actx.currentTime

      // Demo: schedule chords with 250ms lookahead
      if (mode === 'demo') {
        while (demoNextT < nowT + 0.25) {
          const s = DEMO_SEQ[demoPhase % DEMO_SEQ.length]
          scheduleChord(actx, masterGain, s.midis, demoNextT, s.dur * 0.88)
          demoNextT += s.dur
          demoPhase++
        }
      }

      // FFT → energy + chroma
      analyser.getByteFrequencyData(freqData)
      let energy = 0
      for (let i = 0; i < freqData.length; i++) energy += freqData[i]
      energy /= freqData.length * 255

      const raw = extractChroma(freqData, actx.sampleRate)
      for (let i = 0; i < 12; i++) smoothChroma[i] = smoothChroma[i] * 0.62 + raw[i] * 0.38

      // Chord detection with hysteresis
      const det    = matchChord(smoothChroma)
      const detKey = `${det.root}-${det.quality}`

      if (energy > 0.018) {
        if (detKey === pendKey) { pendCount++ } else { pendKey = detKey; pendCount = 1 }

        if (pendCount >= STABLE) {
          if (!curBlock || curBlock.root !== det.root || curBlock.quality !== det.quality) {
            if (curBlock && nowT - curBlock.startT > 0.25) {
              curBlock.endT = nowT
              blocks.push({ ...curBlock })
            }
            curBlock = { root: det.root, quality: det.quality, startT: nowT, endT: nowT }
          } else {
            curBlock.endT = nowT
          }
        }
        // When pendCount < STABLE: curBlock holds the last confirmed chord (stays displayed)
      } else {
        if (curBlock) {
          curBlock.endT = nowT
          if (curBlock.endT - curBlock.startT > 0.3) blocks.push({ ...curBlock })
          curBlock = null
        }
        pendKey = ''; pendCount = 0
      }

      while (blocks.length && blocks[0].endT < nowT - WIN_SEC - 2) blocks.shift()

      // ── Render ────────────────────────────────────────────────────────────
      ctx.fillStyle = '#07070d'
      ctx.fillRect(0, 0, W, H)

      // Layout
      const labelH  = Math.round(22 * dpr)
      const chromaH = Math.round(H * 0.21)
      const tlH     = Math.round(H * 0.12)
      const gap     = Math.round(5 * dpr)
      const chromaY = H - chromaH
      const tlY     = chromaY - tlH - gap
      const mainH   = tlY

      // ── Chord name (center of main area) ──────────────────────────────────
      const ctrY = Math.round(mainH * 0.44)

      if (curBlock) {
        const lbl = chordLabel(curBlock.root, curBlock.quality)
        const col = chordColor(curBlock.root, curBlock.quality, 1)

        // Radial glow
        const gr  = Math.min(W, mainH) * 0.36
        const grd = ctx.createRadialGradient(W / 2, ctrY, 0, W / 2, ctrY, gr)
        grd.addColorStop(0, chordColor(curBlock.root, curBlock.quality, 0.17))
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, ctrY - gr, W, gr * 2)

        // Name
        const fz = Math.round(Math.min(W * 0.30, mainH * 0.34, 160 * dpr))
        ctx.save()
        ctx.font         = `bold ${fz}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowBlur   = 40 * dpr
        ctx.shadowColor  = col
        ctx.fillStyle    = col
        ctx.fillText(lbl, W / 2, ctrY)
        ctx.restore()

        // Quality label
        const qfz = Math.round(Math.max(14 * dpr, 15 * dpr))
        ctx.save()
        ctx.font         = `${qfz}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle    = 'rgba(255,255,255,0.58)'
        ctx.fillText(curBlock.quality === 'maj' ? 'major' : 'minor', W / 2, ctrY + Math.round(fz * 0.62))
        ctx.restore()
      } else {
        const fz = Math.round(Math.max(24 * dpr, 26 * dpr))
        ctx.save()
        ctx.font         = `${fz}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle    = energy < 0.006
          ? 'rgba(255,255,255,0.14)'
          : 'rgba(255,255,255,0.38)'
        ctx.fillText(energy < 0.006 ? '—' : '· · ·', W / 2, ctrY)
        ctx.restore()
      }

      // ── Timeline ──────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = dpr
      ctx.beginPath(); ctx.moveTo(0, tlY); ctx.lineTo(W, tlY); ctx.stroke()

      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      ctx.fillRect(0, tlY, W, tlH)

      const toX = (t: number) => ((t - (nowT - WIN_SEC)) / WIN_SEC) * W

      const allBlocks = [...blocks, ...(curBlock ? [{ ...curBlock, endT: nowT }] : [])]
      for (const b of allBlocks) {
        const x1 = Math.max(0, toX(b.startT))
        const x2 = Math.min(W, toX(b.endT))
        if (x2 - x1 < 1) continue
        ctx.fillStyle = chordColor(b.root, b.quality, 0.83)
        ctx.fillRect(x1, tlY + 2, x2 - x1 - 1, tlH - 4)
        if (x2 - x1 > 30 * dpr) {
          const lz = Math.round(Math.max(10 * dpr, 11 * dpr))
          ctx.save()
          ctx.font         = `bold ${lz}px monospace`
          ctx.textAlign    = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle    = 'rgba(255,255,255,0.90)'
          ctx.fillText(chordLabel(b.root, b.quality), (x1 + x2) / 2, tlY + tlH / 2)
          ctx.restore()
        }
      }

      // "Now" cursor
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillRect(W - 2 * dpr, tlY, 2 * dpr, tlH)

      // ── Chromagram ────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath(); ctx.moveTo(0, chromaY); ctx.lineTo(W, chromaY); ctx.stroke()

      // Active chord tones (for highlights)
      const activeSet = new Set<number>()
      if (curBlock) {
        const r = curBlock.root, q = curBlock.quality
        const tmpl = TEMPLATES.find(t => t.root === r && t.quality === q)
        if (tmpl) tmpl.vec.forEach((v, i) => { if (v) activeSet.add(i) })
      }

      const barW  = Math.floor(W / 12)
      const maxBH = chromaH - labelH

      for (let i = 0; i < 12; i++) {
        const x     = i * barW
        const barH  = Math.round(smoothChroma[i] * maxBH)
        const h     = pitchHue(i)
        const isAct = activeSet.has(i)
        const alpha = isAct ? 0.45 + smoothChroma[i] * 0.55 : 0.16 + smoothChroma[i] * 0.46

        ctx.fillStyle = `hsla(${h},78%,52%,${alpha})`
        ctx.fillRect(x + 1, chromaY + maxBH - barH, barW - 2, barH)

        // Active tone marker
        if (isAct) {
          ctx.fillStyle = `hsla(${h},88%,72%,0.60)`
          ctx.fillRect(x + 1, chromaY + maxBH, barW - 2, 2 * dpr)
        }

        // Note label
        const lz = Math.round(Math.max(9 * dpr, 9 * dpr))
        ctx.save()
        ctx.font         = `${lz}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle    = isAct
          ? `rgba(255,255,255,${0.82 + smoothChroma[i] * 0.18})`
          : `rgba(255,255,255,${0.28 + smoothChroma[i] * 0.40})`
        ctx.fillText(NOTE_NAMES[i], x + barW / 2, chromaY + maxBH + labelH / 2)
        ctx.restore()
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      micStream?.getTracks().forEach(t => t.stop())
      actx.close()
    }
  }, [mode])

  // ── Start screen ──────────────────────────────────────────────────────────

  if (mode === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-foreground px-6 py-12">
        <div className="max-w-xs w-full text-center space-y-6">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Chord Canvas</h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">real-time chord detection · harmonic timeline</p>
          </div>
          <p className="text-muted-foreground text-base leading-relaxed">
            Play piano into the mic. Your chord appears as a name — C, F♯m,
            Bdim — and paints a scrolling color timeline. The chromagram below
            shows which pitch classes are active right now.
          </p>
          <div className="space-y-3">
            <button
              onPointerDown={() => setMode('mic')}
              className="w-full py-3 px-6 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-base font-mono rounded-lg transition-colors min-h-[44px]"
            >
              Start mic →
            </button>
            <button
              onPointerDown={() => setMode('demo')}
              className="w-full py-3 px-6 bg-muted hover:bg-accent border border-border text-muted-foreground text-base font-mono rounded-lg transition-colors min-h-[44px]"
            >
              Demo — ii–V–I in C
            </button>
          </div>
          <p className="text-muted-foreground text-xs">24 chord templates · chroma matching · zero ML · zero API</p>
        </div>
      </div>
    )
  }

  // ── Active view ───────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-black/30">
        <div>
          <span className="text-foreground text-base font-semibold">Chord Canvas</span>
          <span className="text-muted-foreground text-xs font-mono ml-3">
            {mode === 'demo' ? 'demo · ii–V–I in C, repeating' : 'mic · play any chord'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {errMsg && <span className="text-violet-300 text-xs">{errMsg}</span>}
          <span className="text-muted-foreground/70 text-xs font-mono">141</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full" style={{ display: 'block' }} />
    </div>
  )
}
