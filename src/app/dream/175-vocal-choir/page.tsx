'use client'

import { useEffect, useRef, useState } from 'react'

const SEMITONE = Math.pow(2, 1 / 12)
const C3 = 130.81 // Hz

// Pentatonic demo sequence (semitone offsets from C3)
const DEMO_SEQ = [0, 4, 7, 9, 12, 9, 7, 4].map(n => C3 * Math.pow(SEMITONE, n))

// Convert azimuth (° left-right) + elevation (° up-down) to HRTF cartesian
function azelToXYZ(azDeg: number, elDeg: number): [number, number, number] {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]
}

function autocorrPitch(buf: Float32Array<ArrayBuffer>, sr: number): number {
  const half = buf.length >> 1
  let lag = -1
  let bestCorr = 0
  let prevCorr = 1
  let found = false
  for (let t = 1; t < half; t++) {
    let diff = 0
    for (let i = 0; i < half; i++) diff += Math.abs(buf[i] - buf[i + t])
    const corr = 1 - diff / half
    if (corr > 0.9 && corr > prevCorr) {
      found = true
      if (corr > bestCorr) { bestCorr = corr; lag = t }
    } else if (found) {
      break
    }
    prevCorr = corr
  }
  return lag > 0 ? sr / lag : -1
}

interface Voice {
  osc: OscillatorNode
  gainNode: GainNode
  amp: number
}

// Voice definitions: [semitone offset, azimuth°, elevation°, hex color, label]
const VOICE_DEFS: Array<[number, number, number, string, string]> = [
  [4,  -45, 20,  '#a78bfa', '3rd'],   // major third — upper-left, violet
  [7,   45, 20,  '#5eead4', '5th'],   // perfect fifth — upper-right, teal
  [-12,  0, -20, '#fb7185', 'bass'],  // bass octave — lower-center, rose
]

const SEMITONE_OFFSETS = VOICE_DEFS.map(d => d[0])
const VOICE_COLORS = VOICE_DEFS.map(d => d[3])
const VOICE_LABELS = VOICE_DEFS.map(d => d[4])

export default function VocalChoirPage() {
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const sRef = useRef({
    actx: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    voices: [] as Voice[],
    stream: null as MediaStream | null,
    mode: 'idle' as 'idle' | 'demo' | 'mic',
    tbuf: null as Float32Array<ArrayBuffer> | null,
    uAmp: 0,
    pitch: C3,
    demoOsc: null as OscillatorNode | null,
  })
  const [phase, setPhase] = useState<'idle' | 'demo' | 'mic'>('idle')
  const [errMsg, setErrMsg] = useState('')

  function boot(stream: MediaStream | null) {
    const s = sRef.current
    if (s.actx) return
    const actx = new AudioContext()
    s.actx = actx

    const analyser = actx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.5
    s.analyser = analyser
    s.tbuf = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>

    // Set up HRTF listener at origin
    if (actx.listener.positionX) {
      actx.listener.positionX.value = 0
      actx.listener.positionY.value = 0
      actx.listener.positionZ.value = 0
      actx.listener.forwardX.value = 0
      actx.listener.forwardY.value = 0
      actx.listener.forwardZ.value = -1
      actx.listener.upX.value = 0
      actx.listener.upY.value = 1
      actx.listener.upZ.value = 0
    }

    // Create three harmony voices
    s.voices = VOICE_DEFS.map(([stOff, az, el]) => {
      const osc = actx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = C3 * Math.pow(SEMITONE, stOff)
      const gainNode = actx.createGain()
      gainNode.gain.value = 0
      const pan = actx.createPanner()
      pan.panningModel = 'HRTF'
      pan.distanceModel = 'inverse'
      pan.refDistance = 1
      const [x, y, z] = azelToXYZ(az, el)
      pan.setPosition(x, y, z)
      osc.connect(gainNode)
      gainNode.connect(pan)
      pan.connect(actx.destination)
      osc.start()
      gainNode.gain.setTargetAtTime(0.2, actx.currentTime, 0.25)
      return { osc, gainNode, amp: 0 }
    })

    if (stream) {
      actx.createMediaStreamSource(stream).connect(analyser)
      s.mode = 'mic'
      setPhase('mic')
    } else {
      // Demo oscillator cycles through pentatonic
      const dOsc = actx.createOscillator()
      dOsc.type = 'sine'
      dOsc.frequency.value = C3
      const dGain = actx.createGain()
      dGain.gain.value = 0.12
      dOsc.connect(dGain)
      dGain.connect(analyser)
      dGain.connect(actx.destination)
      dOsc.start()
      s.demoOsc = dOsc
      s.mode = 'demo'
      setPhase('demo')

      let idx = 0
      const advance = () => {
        if (!s.actx || !s.demoOsc) return
        const f = DEMO_SEQ[idx % DEMO_SEQ.length]
        s.demoOsc.frequency.linearRampToValueAtTime(f, s.actx.currentTime + 0.08)
        s.pitch = f
        idx++
        setTimeout(advance, 1600)
      }
      advance()
    }

    animate(actx, analyser)
  }

  function animate(actx: AudioContext, analyser: AnalyserNode) {
    const s = sRef.current
    let lastDetect = 0

    function frame(ts: number) {
      rafRef.current = requestAnimationFrame(frame)
      const canvas = cvsRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2

      ctx.fillStyle = '#020204'
      ctx.fillRect(0, 0, W, H)

      // Pitch detection at ~30 Hz
      if (ts - lastDetect > 33 && s.tbuf) {
        lastDetect = ts
        analyser.getFloatTimeDomainData(s.tbuf)

        let sq = 0
        for (let i = 0; i < s.tbuf.length; i++) sq += s.tbuf[i] * s.tbuf[i]
        const rawAmp = Math.sqrt(sq / s.tbuf.length)
        s.uAmp += (rawAmp - s.uAmp) * 0.3

        if (s.mode === 'mic') {
          const f = autocorrPitch(s.tbuf, actx.sampleRate)
          if (f > 60 && f < 1400) s.pitch = f
        }

        s.voices.forEach((v, i) => {
          const tf = s.pitch * Math.pow(SEMITONE, SEMITONE_OFFSETS[i] ?? 0)
          v.osc.frequency.linearRampToValueAtTime(tf, actx.currentTime + 0.05)
          v.amp += (s.uAmp - v.amp) * 0.2
        })
      }

      // Layout: upper voices flank center, bass below, user in middle
      const upos: [number, number] = [cx, H * 0.52]
      const vpos: [number, number][] = [
        [cx - W * 0.28, H * 0.26],
        [cx + W * 0.28, H * 0.26],
        [cx,            H * 0.78],
      ]

      // Connector lines
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      vpos.forEach(([vx, vy]) => {
        ctx.beginPath()
        ctx.moveTo(upos[0], upos[1])
        ctx.lineTo(vx, vy)
        ctx.stroke()
      })

      // Harmony orbs
      vpos.forEach(([ox, oy], i) => {
        const r = 14 + Math.min((s.voices[i]?.amp ?? 0) * 70, 28)
        const col = VOICE_COLORS[i] ?? '#ffffff'
        const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 3.2)
        grd.addColorStop(0,    col + 'cc')
        grd.addColorStop(0.42, col + '44')
        grd.addColorStop(1,    col + '00')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(ox, oy, r * 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowColor = col
        ctx.shadowBlur = 18
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(ox, oy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = col
        ctx.font = '13px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(VOICE_LABELS[i] ?? '', ox, oy + r + 7)
      })

      // User orb
      const ur = 16 + Math.min(s.uAmp * 88, 32)
      const ugrd = ctx.createRadialGradient(upos[0], upos[1], 0, upos[0], upos[1], ur * 3.2)
      ugrd.addColorStop(0,    'rgba(255,255,255,0.92)')
      ugrd.addColorStop(0.40, 'rgba(255,255,255,0.22)')
      ugrd.addColorStop(1,    'rgba(255,255,255,0)')
      ctx.fillStyle = ugrd
      ctx.beginPath()
      ctx.arc(upos[0], upos[1], ur * 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'white'
      ctx.shadowBlur = 24
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.arc(upos[0], upos[1], ur, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '13px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('you', upos[0], upos[1] + ur + 7)

      // Note name above user orb
      const NOTES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
      const midi = Math.round(12 * Math.log2(Math.max(s.pitch, 20) / 440) + 69)
      const noteLabel = NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
      ctx.fillStyle = 'rgba(255,255,255,0.50)'
      ctx.font = '12px ui-monospace, monospace'
      ctx.textBaseline = 'bottom'
      ctx.fillText(noteLabel, upos[0], upos[1] - ur - 6)
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  async function clickMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      sRef.current.stream = stream
      boot(stream)
    } catch {
      setErrMsg('Mic access denied — playing demo instead.')
      boot(null)
    }
  }

  useEffect(() => {
    const canvas = cvsRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
      const s = sRef.current
      s.stream?.getTracks().forEach(t => t.stop())
      s.actx?.close()
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-black text-foreground">
      <div className="flex-1 relative min-h-0">
        <canvas ref={cvsRef} className="w-full h-full" />

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
            <h1 className="text-2xl font-semibold text-foreground">Vocal Choir</h1>
            <p className="text-base text-muted-foreground text-center max-w-sm">
              Sing or hum any note. Three harmony voices materialise around you in 3D
              space — a major third, a perfect fifth, and a bass octave track every pitch
              you make.
            </p>
            <p className="text-sm text-muted-foreground">Wear headphones for the full 3D effect.</p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={clickMic}
                className="min-h-[44px] px-5 py-2.5 bg-violet-500/20 border border-violet-500/40 rounded-lg text-violet-300 text-base hover:bg-violet-500/30 transition-colors"
              >
                Start mic
              </button>
              <button
                onClick={() => boot(null)}
                className="min-h-[44px] px-5 py-2.5 bg-muted border border-border rounded-lg text-foreground text-base hover:bg-accent transition-colors"
              >
                Demo
              </button>
            </div>
            {errMsg && <p className="text-violet-300 text-base mt-1">{errMsg}</p>}
          </div>
        )}
      </div>

      <footer className="px-4 py-2 flex items-center gap-3 border-t border-border shrink-0">
        <span className="text-muted-foreground text-xs">/dream/175-vocal-choir</span>
        {phase !== 'idle' && (
          <span className="text-violet-300/95 text-xs">
            {phase === 'mic' ? '● mic' : '▶ demo'}
          </span>
        )}
        <a
          href="README.md"
          className="ml-auto text-muted-foreground/70 text-xs hover:text-muted-foreground"
        >
          design notes
        </a>
      </footer>
    </div>
  )
}
