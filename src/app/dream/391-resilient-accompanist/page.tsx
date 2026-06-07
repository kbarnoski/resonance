"use client"

// Resilient Accompanist — Cycle 3 of the Resonance "Accompanist" thread.
//
// Cycle 1 (375-tempo-canon) followed the soloist's TEMPO via online DTW.
// Cycle 2 (380-expressive-accompanist) added DYNAMICS + ARTICULATION coupling.
// Cycle 3 adds ROBUSTNESS: an accompanist that survives the soloist's MISTAKES —
// wrong notes, skips, hesitations, accidental repeats — and gracefully finds its
// place again instead of derailing.
//
// The mechanism (Approach A): run TWO followers in parallel —
//   • OnlineDTW  — smooth and fast when the soloist plays correctly,
//   • ScoreHMM   — error-aware (self / skip / back transitions), robust to mistakes,
// and a confidence SUPERVISOR with hysteresis that hands control to whichever is
// trustworthy. When DTW's confidence collapses on a wrong-note run, the HMM takes
// over; when confidence recovers, DTW takes back over.
//
// Renderer is SVG (the jury banned WebGL2 / three.js this cycle). The baked demo
// deliberately fumbles so a phone reviewer can HEAR and SEE the recovery hands-free.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  REFERENCE,
  HARMONY,
  KEY_MAP,
  makePerformance,
  midiToName,
} from "./score"
import type { FumbleTag } from "./score"
import { DualFollower } from "./supervisor"
import type { Controller } from "./supervisor"
import { ResilientAudio } from "./audio"
import {
  VIEW,
  noteX,
  pitchY,
  confidenceColor,
  confidencePolyline,
  fumbleColor,
} from "./viz"
import type { FumbleMarker } from "./viz"

type InputMode = "idle" | "demo" | "live"

const REF_LEN = REFERENCE.length

export default function ResilientAccompanistPage() {
  const followerRef   = useRef<DualFollower | null>(null)
  const audioRef      = useRef<ResilientAudio | null>(null)
  const rafRef        = useRef<number>(0)
  const demoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const midiAccessRef = useRef<MIDIAccess | null>(null)
  const lastDurMsRef  = useRef<number>(0)

  // ── Live render state held in refs so the RAF loop reads fresh values ─────────
  const dtwPosRef     = useRef<number>(0)
  const hmmPosRef     = useRef<number>(0)
  const controllerRef = useRef<Controller>("dtw")
  const beliefRef     = useRef<number[]>(new Array(REF_LEN).fill(0))
  const confHistRef   = useRef<number[]>([])
  const markersRef    = useRef<FumbleMarker[]>([])

  // ── UI state (React-rendered SVG) ─────────────────────────────────────────────
  const [svgError]     = useState<string | null>(null)
  const [midiStatus,   setMidiStatus]   = useState("not requested")
  const [mode,         setMode]         = useState<InputMode>("idle")
  const [dtwPos,       setDtwPos]       = useState(0)
  const [hmmPos,       setHmmPos]       = useState(0)
  const [controller,   setController]   = useState<Controller>("dtw")
  const [confidence,   setConfidence]   = useState(1)
  const [harmonyLabel, setHarmonyLabel] = useState("—")
  const [lastKey,      setLastKey]      = useState<string | null>(null)
  const [dynPct,       setDynPct]       = useState(50)
  const [articLabel,   setArticLabel]   = useState("—")
  const [, forceTick]  = useState(0) // ticks the SVG re-render from the RAF loop

  const modeRef = useRef<InputMode>("idle")
  useEffect(() => { modeRef.current = mode }, [mode])

  // ── Core: one played-note pipe (all inputs flow through here) ──────────────────
  // playedMidi may DIFFER from the score (that's the whole point). nextTag is the
  // baked demo's narration label, used ONLY to title a fumble marker; the
  // followers never receive it. Live input infers the tag from the result.
  const handlePlayedNote = useCallback(
    (
      playedMidi: number,
      velocity: number,
      durationMs: number,
      nowMs: number,
      sourceKey?: string,
      demoTag?: FumbleTag,
    ) => {
      const follower = followerRef.current
      const audio = audioRef.current
      if (!follower || !audio) return

      const res = follower.step(playedMidi, velocity, durationMs, nowMs)

      // Persist render state into refs.
      dtwPosRef.current = res.dtw.col
      hmmPosRef.current = res.hmm.map
      controllerRef.current = res.controller
      beliefRef.current = res.hmm.belief
      const hist = confHistRef.current
      hist.push(res.dtw.confidence)
      if (hist.length > 96) hist.shift()

      // ── Fumble detection (independent of the demo's narration) ────────────────
      // wrong-note: a clear local mismatch. skip: position jumped >1. hesitation:
      // a long inter-onset gap or a repeat (no advance). Pop a labeled marker.
      const trustedPos = res.position
      let detected: FumbleMarker["kind"] | null = null
      if (res.dtw.localCost >= 1.5 || res.dtw.confidence < follower.loThreshold) {
        detected = "wrong"
      } else if (demoTag === "skip") {
        detected = "skip"
      } else if (demoTag === "hesitate") {
        detected = "hesitation"
      }
      // Prefer the demo's authored tag when present (cleaner labels).
      if (demoTag === "wrong") detected = "wrong"
      if (demoTag === "skip") detected = "skip"
      if (demoTag === "hesitate") detected = "hesitation"

      if (detected) {
        const label =
          detected === "wrong" ? "wrong note"
          : detected === "skip" ? "skip ahead"
          : "hesitation"
        markersRef.current.push({ index: trustedPos, kind: detected, label, ageMs: 0 })
        if (markersRef.current.length > 6) markersRef.current.shift()
      }

      // ── Audible handover cue ──────────────────────────────────────────────────
      if (res.switchEvent === "to-hmm") audio.fumbleBlip("lost")
      else if (res.switchEvent === "to-dtw") audio.fumbleBlip("found")

      // ── Drive the accompaniment at the TRUSTED position (cycle 2 coupling) ─────
      const h = HARMONY[Math.min(trustedPos, HARMONY.length - 1)]
      const durScale = res.dtw.slope > 0 ? 1 / Math.max(0.5, res.dtw.slope) : 1
      audio.accompany(h, res.dtw.smoothedVelocity, res.dtw.smoothedArticulation, durScale)
      audio.melodyEcho(playedMidi, velocity)

      // ── Sync UI state ─────────────────────────────────────────────────────────
      setDtwPos(res.dtw.col)
      setHmmPos(res.hmm.map)
      setController(res.controller)
      setConfidence(res.dtw.confidence)
      setHarmonyLabel(`${h.roman} · ${midiToName(h.bass)}`)
      const velPct = Math.round((res.dtw.smoothedVelocity / 127) * 100)
      setDynPct(velPct)
      const ar = res.dtw.smoothedArticulation
      setArticLabel(ar > 0.55 ? "legato" : ar > 0.35 ? "mixed" : "staccato")
      if (sourceKey) setLastKey(sourceKey)
    },
    [],
  )

  // ── Setup on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current = new ResilientAudio()
    followerRef.current = new DualFollower(REFERENCE, 5)

    // Light RAF loop: age fumble markers + tick the SVG so cursors animate.
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = now - last
      last = now
      for (const m of markersRef.current) m.ageMs += dt
      markersRef.current = markersRef.current.filter((m) => m.ageMs < 4500)
      forceTick((t) => (t + 1) & 0xffff)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
      void audioRef.current?.dispose()
      audioRef.current = null
      followerRef.current = null
      const access = midiAccessRef.current
      if (access) access.inputs.forEach((inp) => { inp.onmidimessage = null })
    }
  }, [])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const resetFollower = useCallback(() => {
    followerRef.current?.reset()
    lastDurMsRef.current = 0
    dtwPosRef.current = 0
    hmmPosRef.current = 0
    controllerRef.current = "dtw"
    beliefRef.current = new Array(REF_LEN).fill(0)
    confHistRef.current = []
    markersRef.current = []
    setDtwPos(0)
    setHmmPos(0)
    setController("dtw")
    setConfidence(1)
    setHarmonyLabel("—")
    setDynPct(50)
    setArticLabel("—")
    setLastKey(null)
  }, [])

  // ── Demo (baked, fumbling performance) ────────────────────────────────────────
  const runDemo = useCallback(async () => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    await audioRef.current?.resume()
    resetFollower()
    setMode("demo")
    modeRef.current = "demo"

    const perf = makePerformance()
    let i = 0
    const playNext = () => {
      if (i >= perf.length) {
        demoTimerRef.current = setTimeout(() => {
          setMode("idle")
          modeRef.current = "idle"
        }, 1400)
        return
      }
      const ev = perf[i]
      handlePlayedNote(ev.midi, ev.velocity, ev.durationMs, performance.now(), undefined, ev.tag)
      i += 1
      if (i < perf.length) {
        demoTimerRef.current = setTimeout(playNext, perf[i].dtMs)
      } else {
        demoTimerRef.current = setTimeout(() => {
          setMode("idle")
          modeRef.current = "idle"
        }, 1400)
      }
    }
    demoTimerRef.current = setTimeout(playNext, 300)
  }, [handlePlayedNote, resetFollower])

  const stopDemo = useCallback(() => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current)
    demoTimerRef.current = null
    setMode("idle")
    modeRef.current = "idle"
  }, [])

  // ── Auto-play demo ~1.5s after mount (wrapped for autoplay blocking) ──────────
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (autoPlayedRef.current) return
    autoPlayedRef.current = true
    const tid = setTimeout(async () => {
      try {
        await audioRef.current?.resume()
        await runDemo()
      } catch {
        // Autoplay blocked — the big Play button starts it.
      }
    }, 1500)
    return () => clearTimeout(tid)
  }, [runDemo])

  // ── Keyboard input (stable effect, refs for mutable handlers) ─────────────────
  const handlePlayedNoteRef = useRef(handlePlayedNote)
  useEffect(() => { handlePlayedNoteRef.current = handlePlayedNote }, [handlePlayedNote])
  const stopDemoRef = useRef(stopDemo)
  useEffect(() => { stopDemoRef.current = stopDemo }, [stopDemo])
  const resetFollowerRef = useRef(resetFollower)
  useEffect(() => { resetFollowerRef.current = resetFollower }, [resetFollower])

  useEffect(() => {
    const keyDownTimes = new Map<string, number>()
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.repeat) return
      const km = KEY_MAP.find((k) => k.key === e.key.toLowerCase())
      if (!km) return
      e.preventDefault()
      if (modeRef.current === "demo") stopDemoRef.current()
      if (modeRef.current !== "live") {
        await audioRef.current?.resume()
        if (followerRef.current && dtwPosRef.current === 0 && hmmPosRef.current === 0) {
          resetFollowerRef.current()
        }
        setMode("live")
        modeRef.current = "live"
      }
      const prevDur = lastDurMsRef.current
      lastDurMsRef.current = 0
      keyDownTimes.set(km.key, performance.now())
      handlePlayedNoteRef.current(km.midi, 88, prevDur, performance.now(), km.key)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const km = KEY_MAP.find((k) => k.key === e.key.toLowerCase())
      if (!km) return
      const downAt = keyDownTimes.get(km.key)
      if (downAt !== undefined) {
        lastDurMsRef.current = performance.now() - downAt
        keyDownTimes.delete(km.key)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  // ── Web MIDI (optional) ───────────────────────────────────────────────────────
  const requestMidi = useCallback(async () => {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      setMidiStatus("Web MIDI not supported in this browser")
      return
    }
    try {
      const access = await (navigator as Navigator & {
        requestMIDIAccess: () => Promise<MIDIAccess>
      }).requestMIDIAccess()
      midiAccessRef.current = access
      const count = access.inputs.size
      setMidiStatus(
        count > 0
          ? `connected — ${count} input${count > 1 ? "s" : ""}`
          : "granted — no MIDI inputs found",
      )
      access.inputs.forEach((input) => {
        input.onmidimessage = async (msg: MIDIMessageEvent) => {
          const data = msg.data
          if (!data) return
          const status = data[0] & 0xf0
          const note = data[1]
          const vel = data[2]
          if (status === 0x90 && vel > 0) {
            if (modeRef.current === "demo") stopDemoRef.current()
            await audioRef.current?.resume()
            if (modeRef.current !== "live") { setMode("live"); modeRef.current = "live" }
            const prevDur = lastDurMsRef.current
            lastDurMsRef.current = 0
            handlePlayedNoteRef.current(note, vel, prevDur, performance.now())
          } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
            lastDurMsRef.current = 300
          }
        }
      })
    } catch (e) {
      setMidiStatus("access denied: " + (e instanceof Error ? e.message : "unknown"))
    }
  }, [])

  // ── Derived SVG geometry (read fresh refs every tick) ─────────────────────────
  const dtwX = noteX(dtwPosRef.current, REF_LEN)
  const hmmX = noteX(hmmPosRef.current, REF_LEN)
  const conf = confHistRef.current.length
    ? confHistRef.current[confHistRef.current.length - 1]
    : 1
  const confPoly = confidencePolyline(confHistRef.current)
  const belief = beliefRef.current
  const ctrl = controllerRef.current
  const markers = markersRef.current

  return (
    <main className="min-h-screen bg-[#07060d] text-white px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl relative">

        {/* corner hint → README */}
        <span className="absolute right-0 top-0 text-xs font-mono text-white/55 hidden sm:block">
          Read the design notes → README.md
        </span>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Resilient Accompanist
          </h1>
          <p className="mt-2 text-base text-white/80 max-w-2xl">
            A machine accompanist that survives your mistakes — wrong notes, skips,
            hesitations — and gracefully finds its place again instead of derailing.
            Two followers run in parallel (smooth DTW + error-aware HMM); a
            confidence supervisor hands control to whichever is trustworthy.
          </p>
        </header>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            onClick={mode === "demo" ? stopDemo : runDemo}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-400/30 text-base font-medium transition-colors"
          >
            {mode === "demo" ? "■ Stop demo" : "▸ Play fumble demo"}
          </button>
          <button
            onClick={() => { stopDemo(); resetFollower(); setMode("idle") }}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 border border-white/10 text-base transition-colors"
          >
            Reset
          </button>
          <button
            onClick={requestMidi}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 border border-white/10 text-base transition-colors"
          >
            Connect MIDI
          </button>
        </div>

        {/* ── SVG visualization ────────────────────────────────────────────── */}
        <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black">
          {svgError ? (
            <div className="p-6 text-center">
              <p className="text-rose-300 text-base leading-relaxed">
                The visualization could not render ({svgError}). The follower and
                audio still work — press &ldquo;Play fumble demo&rdquo; or use your keyboard.
              </p>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
              className="w-full h-auto block"
              role="img"
              aria-label="Score timeline with DTW and HMM cursors and a confidence band"
            >
              {/* confidence band background */}
              <rect
                x={VIEW.padX} y={VIEW.bandY}
                width={VIEW.width - 2 * VIEW.padX} height={VIEW.bandH}
                fill="#ffffff" opacity={0.04} rx={6}
              />
              {/* lo / hi threshold guide lines */}
              {[0.42, 0.7].map((th) => (
                <line
                  key={th}
                  x1={VIEW.padX} x2={VIEW.width - VIEW.padX}
                  y1={VIEW.bandY + VIEW.bandH - th * VIEW.bandH}
                  y2={VIEW.bandY + VIEW.bandH - th * VIEW.bandH}
                  stroke={th === 0.42 ? "#fb7185" : "#34d399"}
                  strokeWidth={1} strokeDasharray="4 6" opacity={0.4}
                />
              ))}
              {/* confidence history polyline */}
              {confPoly && (
                <polyline
                  points={confPoly}
                  fill="none"
                  stroke={confidenceColor(conf)}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              <text
                x={VIEW.padX} y={VIEW.bandY - 8}
                className="font-mono" fontSize={14} fill="#ffffffcc"
              >
                DTW confidence
              </text>

              {/* HMM belief cloud (faint bars under each tick) */}
              {belief.map((b, i) => {
                if (b < 0.02) return null
                const x = noteX(i, REF_LEN)
                const h = b * 54
                return (
                  <rect
                    key={`belief-${i}`}
                    x={x - 5} y={VIEW.trackY + 14 - h}
                    width={10} height={h}
                    fill="#a78bfa" opacity={0.35} rx={2}
                  />
                )
              })}

              {/* score timeline ticks (the reference notes) */}
              <line
                x1={VIEW.padX} x2={VIEW.width - VIEW.padX}
                y1={VIEW.trackY} y2={VIEW.trackY}
                stroke="#ffffff" strokeWidth={1.5} opacity={0.25}
              />
              {REFERENCE.map((n, i) => {
                const x = noteX(i, REF_LEN)
                const y = pitchY(n.midi, REFERENCE)
                return (
                  <g key={`tick-${i}`}>
                    <line x1={x} x2={x} y1={VIEW.trackY - 6} y2={VIEW.trackY + 6}
                      stroke="#ffffff" strokeWidth={1.5} opacity={0.3} />
                    <circle cx={x} cy={y} r={3} fill="#ffffff" opacity={0.5} />
                    <text x={x} y={VIEW.trackY + 24} textAnchor="middle"
                      className="font-mono" fontSize={11} fill="#ffffff8c">
                      {midiToName(n.midi).replace(/\d/, "")}
                    </text>
                  </g>
                )
              })}

              {/* DTW cursor */}
              <g opacity={ctrl === "dtw" ? 1 : 0.55}>
                {ctrl === "dtw" && (
                  <line x1={dtwX} x2={dtwX} y1={VIEW.trackY - 70} y2={VIEW.trackY + 36}
                    stroke="#34d399" strokeWidth={10} opacity={0.18} strokeLinecap="round" />
                )}
                <line x1={dtwX} x2={dtwX} y1={VIEW.trackY - 56} y2={VIEW.trackY + 30}
                  stroke="#34d399" strokeWidth={2.5} />
                <polygon
                  points={`${dtwX - 7},${VIEW.trackY - 56} ${dtwX + 7},${VIEW.trackY - 56} ${dtwX},${VIEW.trackY - 44}`}
                  fill="#34d399"
                />
                <text x={dtwX} y={VIEW.trackY - 62} textAnchor="middle"
                  className="font-mono" fontSize={13} fill="#34d399">DTW</text>
              </g>

              {/* HMM cursor */}
              <g opacity={ctrl === "hmm" ? 1 : 0.55}>
                {ctrl === "hmm" && (
                  <line x1={hmmX} x2={hmmX} y1={VIEW.trackY - 36} y2={VIEW.trackY + 50}
                    stroke="#a78bfa" strokeWidth={10} opacity={0.2} strokeLinecap="round" />
                )}
                <line x1={hmmX} x2={hmmX} y1={VIEW.trackY - 30} y2={VIEW.trackY + 44}
                  stroke="#a78bfa" strokeWidth={2.5} strokeDasharray="5 4" />
                <polygon
                  points={`${hmmX - 7},${VIEW.trackY + 44} ${hmmX + 7},${VIEW.trackY + 44} ${hmmX},${VIEW.trackY + 32}`}
                  fill="#a78bfa"
                />
                <text x={hmmX} y={VIEW.trackY + 60} textAnchor="middle"
                  className="font-mono" fontSize={13} fill="#c4b5fd">HMM</text>
              </g>

              {/* fumble markers (pop above the timeline, fade with age) */}
              {markers.map((m, k) => {
                const x = noteX(m.index, REF_LEN)
                const op = Math.max(0, 1 - m.ageMs / 4500)
                const col = fumbleColor(m.kind)
                return (
                  <g key={`mk-${k}`} opacity={op}>
                    <line x1={x} x2={x} y1={28} y2={VIEW.trackY - 8}
                      stroke={col} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                    <rect x={x - 44} y={12} width={88} height={26} rx={6}
                      fill={col} opacity={0.18} stroke={col} strokeWidth={1} />
                    <text x={x} y={29} textAnchor="middle"
                      className="font-mono" fontSize={13} fill={col}>{m.label}</text>
                  </g>
                )
              })}
            </svg>
          )}

          {/* who is in control banner */}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className={`text-xs font-mono rounded px-2 py-1 border ${
              controller === "dtw"
                ? "text-emerald-300/95 border-emerald-400/40 bg-emerald-500/10"
                : "text-violet-300 border-violet-400/40 bg-violet-500/10"
            }`}>
              in control: {controller === "dtw" ? "DTW (smooth)" : "HMM (robust)"}
            </span>
          </div>
        </div>

        {/* ── Readouts ──────────────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Readout label="Mode" value={labelForMode(mode)} />
          <Readout label="DTW pos" value={`${Math.min(dtwPos + 1, REF_LEN)} / ${REF_LEN}`} />
          <Readout label="HMM pos" value={`${Math.min(hmmPos + 1, REF_LEN)} / ${REF_LEN}`} />
          <Readout label="Harmony" value={harmonyLabel} />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-white/55 font-mono mb-2">
              DTW confidence
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${Math.max(3, Math.round(confidence * 100))}%`,
                  backgroundColor: confidenceColor(confidence),
                }}
              />
            </div>
            <div className="mt-1 text-xs font-mono text-right" style={{ color: confidenceColor(confidence) }}>
              {Math.round(confidence * 100)}%
            </div>
          </div>
          <MeterReadout label="Soloist dynamics" pct={dynPct} barColor="bg-violet-400" />
          <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-white/55 font-mono mb-2">
              Articulation
            </div>
            <span className={`text-base font-mono ${
              articLabel === "legato" ? "text-violet-300"
              : articLabel === "staccato" ? "text-amber-300/95"
              : "text-white/80"
            }`}>{articLabel}</span>
          </div>
        </div>

        {/* ── Keyboard map ─────────────────────────────────────────────────── */}
        <section className="mt-7">
          <h2 className="text-xl font-medium mb-3">Play it yourself — and fumble</h2>
          <p className="text-base text-white/80 mb-3 max-w-2xl">
            Home-row keys play the C-major scale. Play &ldquo;Twinkle Twinkle&rdquo;
            (C C G G A A G…) — then deliberately hit a wrong key, skip ahead, or
            pause and repeat a note. Watch the supervisor hand control to the HMM
            and the accompaniment hold its place instead of derailing.
          </p>
          <div className="flex flex-wrap gap-2">
            {KEY_MAP.map((k) => (
              <div
                key={k.key}
                className={`flex flex-col items-center justify-center min-w-[54px] min-h-[54px] rounded-lg border text-center transition-colors ${
                  lastKey === k.key
                    ? "bg-violet-500/30 border-violet-300/50"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <span className="text-base font-mono uppercase text-white/95">{k.key}</span>
                <span className="text-xs text-white/55">{k.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-base text-white/55">
            MIDI: <span className="text-white/80">{midiStatus}</span>
          </p>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="mt-8 border-t border-white/10 pt-5">
          <h2 className="text-xl font-medium mb-3">The dual DTW ⇄ HMM supervisor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-base text-white/80">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-emerald-300/95 font-medium mb-1">DTW (smooth)</div>
              Online DTW (Dixon&apos;s MATCH, 2005): bounded-window path growth,
              D(i,j)=cost+min(↑,←,↖). Fast and steady when you play correctly.
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-violet-300 font-medium mb-1">HMM (robust)</div>
              Left-to-right HMM with explicit error transitions (self / skip / back),
              after Nakamura et al. A wrong note only dents a state&apos;s likelihood,
              so belief mass survives and snaps back.
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <div className="text-amber-300/95 font-medium mb-1">Supervisor</div>
              Watches DTW confidence with hysteresis: drops to the HMM when it
              collapses on a wrong-note run, returns to DTW once it clearly recovers.
            </div>
          </div>
          <p className="mt-4 text-base text-white/55 max-w-2xl">
            The baked demo deliberately fumbles in order — clean phrase, a
            wrong-note run, recovery, a skip-ahead, a hesitation/repeat, then a
            clean resolution — so you can hear and see each catch. Full design notes
            and references:{" "}
            <span className="font-mono text-violet-300 text-sm">
              src/app/dream/391-resilient-accompanist/README.md
            </span>
          </p>
        </section>

      </div>
    </main>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function labelForMode(m: InputMode): string {
  if (m === "demo") return "Demo (auto)"
  if (m === "live") return "Live"
  return "Idle"
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/55 font-mono">{label}</div>
      <div className="mt-1 text-base text-white/95 font-mono">{value}</div>
    </div>
  )
}

function MeterReadout({ label, pct, barColor }: { label: string; pct: number; barColor: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/55 font-mono mb-2">{label}</div>
      <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${barColor}`}
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-white/55 font-mono text-right">{pct}%</div>
    </div>
  )
}
