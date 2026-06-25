'use client'

// Sky Conductor — two 4-year-olds are a tiny orchestra.
//
//   • The CONDUCTOR sweeps the iPad left/right (or drags on screen) to set the
//     gentle tempo and walk a warm I–IV–V–vi chord progression. The current
//     chord colors the whole sky.
//   • The PLAYER taps anywhere to drop bright notes; each tap snaps to a chord
//     tone of the conductor's CURRENT chord, so it ALWAYS harmonizes — there is
//     no wrong note. Higher taps = higher chord tones.
//
// Both children HEAR the full result: a warm chord bed (the context) + a melody
// voiced into it. The harmony is SOCIAL/STRUCTURAL: two complementary parts.
//
// INPUT  : deviceorientation tilt (conductor) + taps (player), WebRTC role events
// OUTPUT : raw WebGPU sky (raw WebGL2 fallback) + Web Audio chord bed & bells
// ROBUST : no friend -> a "ghost friend" auto-plays the other role within ~1s;
//          no WebRTC -> solo (full experience); no WebGPU -> WebGL2 -> notice.

import { useCallback, useEffect, useRef, useState } from 'react'
import { makeAudioEngine, type AudioEngine } from './audio'
import {
  PROGRESSION,
  PROGRESSION_LEN,
  BEATS_PER_CHORD,
  sweepToBpm,
  voiceTap,
  BPM_MIN,
  BPM_MAX,
} from './harmony'
import { initSkyGpu } from './gpu'
import { initSkyGl } from './glfallback'
import {
  chordHueToRgb,
  type Bloom,
  type SkyRenderer,
  type SkyState,
} from './scene-types'
import {
  createGuest,
  createHost,
  buildInviteLink,
  readJoinHash,
  netSupported,
  startGhostConductor,
  startGhostPlayer,
  type GhostFriend,
  type PeerHandle,
  type NetEvent,
} from './net'

type Phase = 'start' | 'play'
type Role = 'conductor' | 'player'
type Notice = '' | 'no-gpu' | 'no-audio' | 'no-tilt'

export default function Page() {
  const [phase, setPhase] = useState<Phase>('start')
  const [notice, setNotice] = useState<Notice>('')
  const [role, setRole] = useState<Role>('conductor')
  const [chordIdx, setChordIdx] = useState(0)
  const [bpm, setBpm] = useState(80)
  const [connected, setConnected] = useState(false)
  const [rendererKind, setRendererKind] = useState<'webgpu' | 'webgl2' | 'none'>('none')

  // invite UI
  const [canInvite, setCanInvite] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [guestCode, setGuestCode] = useState('')
  const [hostPaste, setHostPaste] = useState('')
  const [netRole, setNetRole] = useState<'host' | 'guest' | null>(null)

  // refs (mutable, no re-render)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<SkyRenderer | null>(null)
  const audioRef = useRef<AudioEngine | null>(null)
  const peerRef = useRef<PeerHandle | null>(null)
  const ghostRef = useRef<GhostFriend | null>(null)
  const connectedRef = useRef(false)
  const joinHashRef = useRef<string | null>(null)
  const tiltOkRef = useRef(false)

  // role + musical state lives in refs so the rAF/clock loop reads it live
  const roleRef = useRef<Role>('conductor')
  const chordRef = useRef(0)
  const bpmRef = useRef(80)
  const sweepXRef = useRef(0.45) // conductor horizontal control 0..1
  const bloomsRef = useRef<Bloom[]>([])
  const beatPhaseRef = useRef(0)
  // lets the swap button re-point the ghost to the new "other" role
  const ghostStartRef = useRef<(() => void) | null>(null)

  // detect guest-link + capabilities on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    joinHashRef.current = readJoinHash()
    setCanInvite(netSupported())
  }, [])

  // ── apply a chord change locally (audio + visual + HUD) ─────────────────────
  const applyChord = useCallback((idx: number) => {
    const i = ((idx % PROGRESSION_LEN) + PROGRESSION_LEN) % PROGRESSION_LEN
    chordRef.current = i
    setChordIdx(i)
    audioRef.current?.setChord(PROGRESSION[i])
  }, [])

  // ── drop a player note-bloom + chime (already a chord tone) ─────────────────
  const dropNote = useCallback((y01: number, self: boolean, x01?: number) => {
    const chord = PROGRESSION[chordRef.current]
    const midi = voiceTap(chord, y01)
    audioRef.current?.playNote(midi, self)
    const x = x01 ?? 0.18 + Math.random() * 0.64
    const blooms = bloomsRef.current
    blooms.unshift({ x, y: y01, age: 1, bright: self ? 1.0 : 0.7 })
    if (blooms.length > 8) blooms.length = 8
  }, [])

  // ── a real peer connected: stop the ghost ───────────────────────────────────
  const onPeerOpen = useCallback(() => {
    connectedRef.current = true
    setConnected(true)
    if (ghostRef.current) {
      ghostRef.current.stop()
      ghostRef.current = null
    }
  }, [])

  // ── inbound role event from the real peer ───────────────────────────────────
  const onNetEvent = useCallback(
    (ev: NetEvent) => {
      if (ev.role === 'conductor') {
        // partner is conducting → follow their chord + tempo (I am the player)
        bpmRef.current = ev.bpm
        setBpm(ev.bpm)
        applyChord(ev.chord)
      } else {
        // partner is playing → voice their note into MY current chord context.
        // (We receive a midi note; but to keep harmony locked to whoever holds
        //  the conductor context, we re-voice by pitch height.)
        audioRef.current?.playNote(ev.note, false)
        const blooms = bloomsRef.current
        blooms.unshift({ x: 0.18 + Math.random() * 0.64, y: 0.3 + Math.random() * 0.5, age: 1, bright: 0.7 })
        if (blooms.length > 8) blooms.length = 8
      }
    },
    [applyChord],
  )

  // ── Start: gesture-gate audio, request tilt perm, pick renderer ─────────────
  async function handleStart() {
    // 1) Audio MUST be created/resumed inside this user tap (iOS requirement).
    const au = makeAudioEngine()
    if (au) {
      audioRef.current = au
      if (au.ctx.state === 'suspended') {
        try {
          await au.ctx.resume()
        } catch {
          /* ignore */
        }
      }
      au.setChord(PROGRESSION[chordRef.current])
    } else {
      setNotice('no-audio')
    }

    // 2) iOS: DeviceOrientationEvent.requestPermission() in this same tap.
    let tiltOk = false
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<PermissionState> }
      }
    ).DeviceOrientationEvent
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          const res = await DOE.requestPermission()
          tiltOk = res === 'granted'
        } catch {
          tiltOk = false
        }
      } else {
        tiltOk = true // non-iOS fires deviceorientation without a prompt
      }
    }
    tiltOkRef.current = tiltOk
    if (!tiltOk) setNotice('no-tilt') // on-screen drag still drives conducting

    setPhase('play')
  }

  // ── play phase: renderer, clock, input, ghost, networking ───────────────────
  useEffect(() => {
    if (phase !== 'play') return
    const canvas = canvasRef.current
    if (!canvas) return

    let raf = 0
    let disposed = false

    // 1) pick renderer: WebGPU first, then WebGL2, then a DOM notice.
    void (async () => {
      let r: SkyRenderer | null = null
      try {
        r = await initSkyGpu(canvas)
      } catch {
        r = null
      }
      if (disposed) {
        r?.dispose()
        return
      }
      if (!r) {
        try {
          r = initSkyGl(canvas)
        } catch {
          r = null
        }
      }
      rendererRef.current = r
      if (!r) {
        setRendererKind('none')
        setNotice('no-gpu')
      } else {
        setRendererKind(r.kind)
      }
    })()

    // 2) the music clock: advance beat phase + auto-walk chords when conducting.
    let lastT = performance.now()
    let beatAccum = 0 // beats elapsed (fractional)
    let chordBeatAccum = 0 // beats since last chord change (conductor only)

    function loop(now: number) {
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now

      const beatsPerSec = bpmRef.current / 60
      beatAccum += dt * beatsPerSec
      beatPhaseRef.current = beatAccum % 1

      // CONDUCTOR drives the progression: advance a chord every BEATS_PER_CHORD.
      if (roleRef.current === 'conductor') {
        // tempo from the sweep
        const newBpm = sweepToBpm(sweepXRef.current)
        if (Math.abs(newBpm - bpmRef.current) >= 1) {
          bpmRef.current = newBpm
          setBpm(newBpm)
        }
        chordBeatAccum += dt * beatsPerSec
        if (chordBeatAccum >= BEATS_PER_CHORD) {
          chordBeatAccum -= BEATS_PER_CHORD
          const next = (chordRef.current + 1) % PROGRESSION_LEN
          applyChord(next)
          // broadcast my new chord context to the partner
          peerRef.current?.send({ role: 'conductor', chord: next, bpm: bpmRef.current })
        }
      }

      // age out blooms
      const blooms = bloomsRef.current
      for (let i = blooms.length - 1; i >= 0; i--) {
        blooms[i].age -= dt * 0.55
        if (blooms[i].age <= 0) blooms.splice(i, 1)
      }

      // pulse strength from tempo (faster = a touch brighter shimmer)
      const pulse = (bpmRef.current - BPM_MIN) / (BPM_MAX - BPM_MIN)
      const hue = chordHueToRgb(PROGRESSION[chordRef.current].hue)
      const state: SkyState = {
        time: now / 1000,
        hue,
        pulse: Math.max(0, Math.min(1, pulse)),
        beatPhase: beatPhaseRef.current,
        blooms,
      }
      rendererRef.current?.render(state)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    function onResize() {
      rendererRef.current?.resize()
    }
    window.addEventListener('resize', onResize)

    // 3) CONDUCTOR input — device tilt (gamma = left/right) sets the sweep.
    function onOrient(e: DeviceOrientationEvent) {
      if (roleRef.current !== 'conductor') return
      // gamma: -90..90 left-right tilt. Map to 0..1.
      const g = e.gamma ?? 0
      sweepXRef.current = Math.max(0, Math.min(1, (g + 45) / 90))
    }
    if (tiltOkRef.current) {
      window.addEventListener('deviceorientation', onOrient)
    }

    // 4) pointer input — role-dependent.
    //    PLAYER: tap anywhere drops a note voiced into the current chord.
    //    CONDUCTOR (drag fallback): horizontal drag sets the sweep/tempo.
    let dragging = false
    function pointFromEvent(e: PointerEvent): { x: number; y: number } {
      return { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
    }
    function onPointerDown(e: PointerEvent) {
      const { x, y } = pointFromEvent(e)
      if (roleRef.current === 'player') {
        dropNote(y, true, x)
        peerRef.current?.send({ role: 'player', note: voiceTap(PROGRESSION[chordRef.current], y) })
      } else {
        dragging = true
        sweepXRef.current = x
      }
    }
    function onPointerMove(e: PointerEvent) {
      if (roleRef.current === 'conductor' && dragging) {
        sweepXRef.current = e.clientX / window.innerWidth
      }
    }
    function onPointerUp() {
      dragging = false
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // 5) ghost friend — plays the OTHER role until a real peer connects.
    function startGhost() {
      if (connectedRef.current) return
      if (ghostRef.current) {
        ghostRef.current.stop()
        ghostRef.current = null
      }
      if (roleRef.current === 'player') {
        // I play → ghost conducts the progression
        ghostRef.current = startGhostConductor(PROGRESSION_LEN, (ev) => {
          if (connectedRef.current) return
          bpmRef.current = ev.bpm
          setBpm(ev.bpm)
          applyChord(ev.chord)
        })
      } else {
        // I conduct → ghost plays soft melody into my current chord
        ghostRef.current = startGhostPlayer((y01) => {
          if (connectedRef.current) return
          dropNote(y01, false)
        })
      }
    }
    startGhost()
    ghostStartRef.current = startGhost

    // 6) networking — if we arrived via an invite link, auto-answer as guest.
    if (joinHashRef.current && netSupported()) {
      setNetRole('guest')
      const guest = createGuest(joinHashRef.current, onNetEvent, onPeerOpen)
      peerRef.current = guest
      guest.localCode.then((code) => setGuestCode(code)).catch(() => {
        /* malformed link → stay solo with ghost */
      })
      setInviteOpen(true)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('deviceorientation', onOrient)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (ghostRef.current) {
        ghostRef.current.stop()
        ghostRef.current = null
      }
      if (peerRef.current) {
        peerRef.current.close()
        peerRef.current = null
      }
      if (rendererRef.current) {
        rendererRef.current.dispose()
        rendererRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.dispose()
        audioRef.current = null
      }
    }
  }, [phase, applyChord, dropNote, onNetEvent, onPeerOpen])

  // ── swap roles ──────────────────────────────────────────────────────────────
  function swapRoles() {
    const next: Role = roleRef.current === 'conductor' ? 'player' : 'conductor'
    roleRef.current = next
    setRole(next)
    // restart the ghost on the freshly-opposite role
    ghostStartRef.current?.()
  }

  // ── invite (host) ────────────────────────────────────────────────────────────
  function handleInvite() {
    if (!netSupported()) return
    setNetRole('host')
    setInviteOpen(true)
    const host = createHost(onNetEvent, onPeerOpen)
    peerRef.current = host
    host.localCode.then((code) => setInviteLink(buildInviteLink(code))).catch(() => setInviteOpen(false))
  }

  async function handleHostAccept() {
    const peer = peerRef.current
    if (!peer || !hostPaste.trim()) return
    try {
      await peer.acceptRemote(hostPaste.trim())
    } catch {
      /* bad code → stay with ghost */
    }
  }

  function copyText(text: string) {
    try {
      void navigator.clipboard?.writeText(text)
    } catch {
      /* clipboard may be blocked; field is still selectable */
    }
  }

  const chordName = PROGRESSION[chordIdx].name

  // ── render ─────────────────────────────────────────────────────────────────
  if (phase === 'start') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-7 bg-[#0b0712] px-8">
        <div className="text-5xl">🎶</div>
        <h1 className="text-center text-2xl font-semibold text-white/95">Sky Conductor</h1>
        <p className="max-w-md text-center text-base leading-relaxed text-white/75">
          Two friends make music together. One CONDUCTS — sweep the iPad to change
          the sky&apos;s warm chord. The other PLAYS — tap the sky to drop bright notes
          that always fit the chord. No wrong notes, ever.
        </p>
        <button
          onClick={handleStart}
          className="mt-2 flex min-h-[72px] min-w-[220px] items-center justify-center gap-3
                     rounded-full bg-amber-400/25 px-10 text-xl font-semibold text-white
                     ring-1 ring-amber-200/40 transition-colors hover:bg-amber-400/35"
        >
          <span className="text-2xl">🎶</span> Start
        </button>
        <p className="text-base text-white/60">Tilt or drag · tap the sky · no words needed</p>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0b0712]">
      {/* GPU sky — also the full-screen input surface */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* role + chord HUD (icons + a single word; minimal reading) */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        <span className="text-3xl">{role === 'conductor' ? '🪄' : '✨'}</span>
        <span className="text-xl font-semibold text-white/95">
          {role === 'conductor' ? 'You conduct' : 'You play'}
        </span>
      </div>

      {/* current chord color-chip + name */}
      <div className="pointer-events-none absolute left-4 top-16 flex items-center gap-2">
        <span
          className="inline-block h-4 w-4 rounded-full"
          style={{
            background: rgbCss(chordHueToRgb(PROGRESSION[chordIdx].hue)),
            boxShadow: '0 0 12px currentColor',
          }}
        />
        <span className="text-base text-white/75">
          sky chord: {chordName} · {bpm} bpm
        </span>
      </div>

      {/* big friendly hint, role-aware (icon-first) */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 select-none text-center">
        <div className="text-4xl drop-shadow-[0_0_12px_rgba(255,210,140,0.7)]">
          {role === 'conductor' ? '↔️' : '👆'}
        </div>
        <p className="mt-1 text-base text-white/75">
          {role === 'conductor' ? 'sweep / drag to change the chord' : 'tap the sky to play'}
        </p>
      </div>

      {/* SWAP ROLES — big tap target */}
      <button
        onClick={swapRoles}
        className="absolute bottom-6 right-4 flex min-h-[64px] min-w-[64px] items-center
                   justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-base
                   font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
        aria-label="swap roles"
      >
        <span className="text-2xl">🔄</span> swap
      </button>

      {/* friend status */}
      <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full ${connected ? 'bg-emerald-300' : 'bg-amber-300/70'}`}
          style={{ boxShadow: '0 0 10px currentColor' }}
        />
        <span className="text-base text-white/75">{connected ? 'friend here' : 'tiny orchestra'}</span>
      </div>

      {/* invite button (only if WebRTC+gzip supported and not already a guest) */}
      {canInvite && netRole !== 'guest' && (
        <button
          onClick={() => (inviteOpen ? setInviteOpen(false) : handleInvite())}
          className="absolute right-4 top-16 flex min-h-[64px] min-w-[64px] items-center
                     justify-center rounded-full bg-white/10 text-2xl text-white
                     ring-1 ring-white/20 transition-colors hover:bg-white/20"
          aria-label="invite a friend"
        >
          👋
        </button>
      )}

      {/* design-notes corner link (nice-to-have) */}
      <a
        href="https://github.com"
        onClick={(e) => e.preventDefault()}
        className="pointer-events-auto absolute bottom-2 left-3 text-base text-white/40 hover:text-white/70"
        title="Read the design notes (README.md in this folder)"
      >
        design notes
      </a>

      {/* notices — clearly visible */}
      {notice !== '' && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 max-w-xs -translate-x-1/2 text-center">
          <p className="text-base text-rose-300">
            {notice === 'no-tilt' && 'Tilt is off — drag across the sky to conduct.'}
            {notice === 'no-gpu' &&
              'This screen can’t draw the sky, but you can still hear the music.'}
            {notice === 'no-audio' && 'Sound is off — the sky still glows.'}
          </p>
        </div>
      )}

      {/* renderer badge (tiny, for reviewers) */}
      {rendererKind !== 'none' && (
        <div className="pointer-events-none absolute bottom-2 right-3 text-base text-white/35">
          {rendererKind === 'webgpu' ? 'WebGPU' : 'WebGL2'}
        </div>
      )}

      {/* invite panel */}
      {inviteOpen && (
        <div className="absolute inset-x-3 bottom-20 rounded-2xl bg-black/70 p-5 ring-1 ring-white/15 backdrop-blur">
          {netRole === 'host' && (
            <div className="flex flex-col gap-3">
              <p className="text-base text-white/95">Share this link with your friend 👋</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-[48px] flex-1 rounded-lg bg-white/10 px-3 font-mono text-base text-white/90"
                  placeholder="making a link…"
                />
                <button
                  onClick={() => copyText(inviteLink)}
                  className="min-h-[48px] rounded-lg bg-amber-400/30 px-4 text-base text-white"
                >
                  copy
                </button>
              </div>
              <p className="text-base text-white/75">Then paste their music-code back here:</p>
              <div className="flex gap-2">
                <input
                  value={hostPaste}
                  onChange={(e) => setHostPaste(e.target.value)}
                  className="min-h-[48px] flex-1 rounded-lg bg-white/10 px-3 font-mono text-base text-white/90"
                  placeholder="paste friend’s code"
                />
                <button
                  onClick={handleHostAccept}
                  className="min-h-[48px] rounded-lg bg-emerald-500/30 px-4 text-base text-white"
                >
                  join
                </button>
              </div>
            </div>
          )}
          {netRole === 'guest' && (
            <div className="flex flex-col gap-3">
              <p className="text-base text-white/95">You joined a friend’s sky 🎶 Send them this code:</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={guestCode}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-[48px] flex-1 rounded-lg bg-white/10 px-3 font-mono text-base text-white/90"
                  placeholder="making your code…"
                />
                <button
                  onClick={() => copyText(guestCode)}
                  className="min-h-[48px] rounded-lg bg-amber-400/30 px-4 text-base text-white"
                >
                  copy
                </button>
              </div>
              <p className="text-base text-white/75">
                {connected ? 'Connected! Make harmony together 🎶' : 'Waiting for your friend…'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function rgbCss(rgb: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgb(${c(rgb[0])}, ${c(rgb[1])}, ${c(rgb[2])})`
}
