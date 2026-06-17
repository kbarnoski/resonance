'use client'

import { useEffect, useRef, useState } from 'react'
import {
  applyTrade,
  decayState,
  LiveFeed,
  makeMarketState,
  SyntheticMarket,
  type MarketState,
  type Trade,
} from './market'
import { AudioEngine } from './audio'
import { GpuNebula } from './gpu'
import { Render2D } from './render2d'

const SEED_PRICE = 64000

export default function WorldPulsePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<MarketState>(makeMarketState(SEED_PRICE))
  const audioRef = useRef<AudioEngine | null>(null)
  const gpuRef = useRef<GpuNebula | null>(null)
  const r2dRef = useRef<Render2D | null>(null)

  const [started, setStarted] = useState(false)
  const [live, setLive] = useState(false)
  const [usingGpu, setUsingGpu] = useState<boolean | null>(null)
  // readout, refreshed on a slow timer (ambient, not a ticker)
  const [readout, setReadout] = useState({ price: SEED_PRICE, mom: 0, vol: 0.12 })

  // ---- visuals + market run immediately, before audio ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    const s = stateRef.current

    // trade handler — feeds the shared rolling state + injects visuals/audio
    const onTrade = (tr: Trade) => {
      applyTrade(s, tr)
      const inj = s.lastSize
      gpuRef.current?.inject(s.priceNorm, inj, s.lastSell)
      r2dRef.current?.inject(s.priceNorm, inj, s.lastSell)
      audioRef.current?.strike(inj, s.lastSell)
    }

    // 1) synthetic generator starts instantly so the piece is alive at once
    const synth = new SyntheticMarket(SEED_PRICE, onTrade)
    synth.start()

    // 2) live feed attempt; hand over smoothly if it connects
    let liveActive = false
    const feed = new LiveFeed(
      (tr) => {
        if (liveActive) onTrade(tr)
      },
      (isLive) => {
        if (disposed) return
        liveActive = isLive
        setLive(isLive)
        if (isLive) {
          synth.stop()
        } else {
          // dropped — resume synthetic
          synth.start()
        }
      },
    )
    // give the synthetic a head start, then try to connect
    const connectTimer = setTimeout(() => {
      if (!disposed) feed.connect()
    }, 300)

    // 3) renderer: try WebGPU, else Canvas2D
    const setupRenderer = async () => {
      const gpu = new GpuNebula(canvas)
      let ok = false
      try {
        ok = await gpu.init()
      } catch {
        ok = false
      }
      if (disposed) {
        gpu.destroy()
        return
      }
      if (ok) {
        gpuRef.current = gpu
        gpu.setState(s)
        gpu.start()
        setUsingGpu(true)
      } else {
        gpu.destroy()
        const r2d = new Render2D(canvas)
        r2dRef.current = r2d
        r2d.setState(s)
        r2d.start()
        setUsingGpu(false)
      }
    }
    void setupRenderer()

    // shared per-frame state decay so nothing gets stuck between ticks
    let lastDecay = performance.now()
    let decayRaf = 0
    const decayLoop = (now: number) => {
      const dt = Math.min(0.05, (now - lastDecay) / 1000)
      lastDecay = now
      decayState(s, dt)
      decayRaf = requestAnimationFrame(decayLoop)
    }
    decayRaf = requestAnimationFrame(decayLoop)

    // slow ambient readout
    const readoutTimer = setInterval(() => {
      if (disposed) return
      setReadout({ price: s.price, mom: s.momentum, vol: s.volatility })
    }, 700)

    // resize
    const onResize = () => {
      gpuRef.current?.resize()
      r2dRef.current?.resize()
    }
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      clearTimeout(connectTimer)
      clearInterval(readoutTimer)
      cancelAnimationFrame(decayRaf)
      window.removeEventListener('resize', onResize)
      synth.stop()
      feed.close()
      gpuRef.current?.destroy()
      gpuRef.current = null
      r2dRef.current?.stop()
      r2dRef.current = null
      audioRef.current?.stop()
      audioRef.current = null
    }
  }, [])

  // ---- audio starts on user gesture ----
  const beginAudio = async () => {
    if (audioRef.current) return
    const eng = new AudioEngine()
    eng.setState(stateRef.current)
    audioRef.current = eng
    await eng.start()
    setStarted(true)
  }

  const momLabel =
    readout.mom > 0.08 ? 'rising' : readout.mom < -0.08 ? 'falling' : 'steady'
  const momColor =
    readout.mom > 0.08
      ? 'text-amber-300'
      : readout.mom < -0.08
        ? 'text-sky-300'
        : 'text-violet-300'

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05040a] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* subtle vignette so text stays legible over the nebula */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      {/* header */}
      <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-10">
        <h1 className="font-serif text-3xl tracking-tight text-white sm:text-4xl">
          World Pulse
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-white/80">
          The live fear and greed of the world&rsquo;s markets, witnessed as a
          cosmic weather system &mdash; every trade a breath of light and sound,
          right now, this second.
        </p>

        {!started && (
          <button
            type="button"
            onClick={beginAudio}
            className="mt-2 inline-flex min-h-[44px] w-fit items-center justify-center rounded-full border border-violet-300/40 bg-violet-500/15 px-6 py-2.5 text-base font-medium text-violet-100 transition hover:bg-violet-500/25"
          >
            Listen
          </button>
        )}
        {started && (
          <p className="mt-1 text-base text-white/55">
            Let it drift. The harmony slowly evolves &mdash; it will sound
            different in five minutes.
          </p>
        )}
      </div>

      {/* live amber notice when no real feed */}
      {!live && (
        <div className="absolute left-6 top-1/2 z-10 -translate-y-1/2 sm:left-10">
          <p className="max-w-[15rem] rounded-md bg-black/40 px-3 py-2 text-base leading-snug text-amber-300/95">
            Live feed unavailable &mdash; playing a simulated market.
          </p>
        </div>
      )}

      {/* ambient readout */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-1 font-mono text-base sm:left-10">
        <div className="text-white/80">
          BTC{' '}
          <span className="text-white">
            ${readout.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          {live ? (
            <span className="ml-2 text-base text-emerald-300/90">live</span>
          ) : (
            <span className="ml-2 text-base text-amber-300/95">sim</span>
          )}
        </div>
        <div className="text-white/75">
          momentum <span className={momColor}>{momLabel}</span>
        </div>
        <div className="text-white/75">
          volatility{' '}
          <span className="text-white/80">
            {(readout.vol * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* renderer mode + design notes */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-1 text-right sm:right-10">
        <span className="text-base text-white/55">
          {usingGpu === null
            ? 'starting field…'
            : usingGpu
              ? 'WebGPU nebula'
              : 'Canvas2D field'}
        </span>
        <a
          href="https://github.com/"
          onClick={(e) => e.preventDefault()}
          className="text-base text-white/55 underline-offset-2 hover:text-white/75 hover:underline"
          title="See README.md in this prototype's folder"
        >
          Read the design notes
        </a>
      </div>
    </main>
  )
}
