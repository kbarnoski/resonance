'use client'

// Starlight Friend — two 4-year-olds share ONE magical night sky.
// Shake the iPad to fling a shooting star; it lights up + chimes in the OTHER
// child's sky too. The reward is "we made this together."
//
// INPUT: device shake (devicemotion) + WebRTC data channel  (tap-pad fallback)
// OUTPUT: three.js GPU starfield
// TECHNIQUE: serverless peer-to-peer co-play (tiny {x,y,hue,t} star events)
// VIBE: calm-joyful deep indigo->violet sky, warm gold/rose/cyan stars
//
// Robustness: a "ghost friend" auto-joins solo so one phone shows two-player
// co-play within ~1s of Start, hands-free. Real peer connects -> ghost bows out.

import { useEffect, useRef, useState } from 'react'
import { makeAudioEngine, type AudioEngine } from './audio'
import { makeScene, type StarScene } from './scene'
import {
  createGuest,
  createHost,
  buildInviteLink,
  readJoinHash,
  netSupported,
  startGhostFriend,
  type GhostFriend,
  type PeerHandle,
  type StarEvent,
} from './net'

type Phase = 'start' | 'play'
type Notice = '' | 'no-motion' | 'no-webgl' | 'no-audio'

export default function Page() {
  const [phase, setPhase] = useState<Phase>('start')
  const [notice, setNotice] = useState<Notice>('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [guestCode, setGuestCode] = useState('') // host shows field; guest shows their answer
  const [hostPaste, setHostPaste] = useState('')
  const [connected, setConnected] = useState(false)
  const [role, setRole] = useState<'host' | 'guest' | null>(null)
  const [canInvite, setCanInvite] = useState(false)

  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<StarScene | null>(null)
  const audioRef = useRef<AudioEngine | null>(null)
  const peerRef = useRef<PeerHandle | null>(null)
  const ghostRef = useRef<GhostFriend | null>(null)
  const connectedRef = useRef(false)
  const joinHashRef = useRef<string | null>(null)

  // Detect whether this load is a guest opening an invite link.
  useEffect(() => {
    if (typeof window === 'undefined') return
    joinHashRef.current = readJoinHash()
    setCanInvite(netSupported())
  }, [])

  // ── core: a star arrives (from me, peer, or ghost) -> sound + light ─────────
  // self=true means this child made it (brighter chime). incoming events render
  // the same pipeline so both skies stay in loose, latency-tolerant sync.
  function landStar(ev: StarEvent, self: boolean) {
    const sc = sceneRef.current
    if (sc) {
      if (typeof ev.vx === 'number' && typeof ev.vy === 'number') {
        sc.flingTo(ev.x, ev.y, ev.vx, ev.vy, ev.hue)
      } else {
        sc.bloomAt(ev.x, ev.y, ev.hue)
      }
    }
    const au = audioRef.current
    if (au) {
      au.whoosh()
      au.chime(ev.hue, self)
    }
  }

  // A real peer connected: stop the ghost friend gracefully.
  function onPeerOpen() {
    connectedRef.current = true
    setConnected(true)
    if (ghostRef.current) {
      ghostRef.current.stop()
      ghostRef.current = null
    }
  }

  // ── Start: gesture-gate audio, request motion perm, build scene ─────────────
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
    } else {
      setNotice('no-audio')
    }

    // 2) iOS: DeviceMotionEvent.requestPermission() must run in this same tap.
    let motionOk = false
    const DME = (
      window as unknown as {
        DeviceMotionEvent?: { requestPermission?: () => Promise<PermissionState> }
      }
    ).DeviceMotionEvent
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      if (DME && typeof DME.requestPermission === 'function') {
        try {
          const res = await DME.requestPermission()
          motionOk = res === 'granted'
        } catch {
          motionOk = false
        }
      } else {
        motionOk = true // non-iOS browsers fire devicemotion without a prompt
      }
    }
    if (!motionOk) setNotice('no-motion') // tap-pad still drives the same pipeline

    setPhase('play')
    // scene + listeners are set up in the play-phase effect below.
    motionGrantedRef.current = motionOk
  }

  const motionGrantedRef = useRef(false)

  // ── play phase: scene, motion/tap input, ghost friend, networking ───────────
  useEffect(() => {
    if (phase !== 'play') return
    const mount = mountRef.current
    if (!mount) return

    // 1) three.js scene
    const sc = makeScene(mount)
    sceneRef.current = sc
    if (!sc.ok) setNotice('no-webgl')

    let raf = 0
    function loop(t: number) {
      if (sceneRef.current && sceneRef.current.ok) sceneRef.current.render(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    function onResize() {
      if (sceneRef.current) sceneRef.current.resize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // 2) a child flings a star -> render local, chime local, send to peer
    let lastFling = 0
    function fling(x: number, y: number, vx: number, vy: number, hue: number) {
      const now = performance.now()
      if (now - lastFling < 90) return // gentle debounce so a shake = one star
      lastFling = now
      const ev: StarEvent = { x, y, hue, t: Date.now(), vx, vy }
      landStar(ev, true)
      if (peerRef.current) peerRef.current.send(ev)
    }

    // 3) shake (devicemotion) — the headline gesture
    let lastShake = 0
    function onMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity || e.acceleration
      if (!acc) return
      const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0)
      // gravity baseline ~9.8; a real shake spikes well above
      const now = performance.now()
      if (mag > 18 && now - lastShake > 360) {
        lastShake = now
        // launch from a random lower point, fling upward-ish into MY (left) sky
        const x = 0.08 + Math.random() * 0.42
        const y = 0.55 + Math.random() * 0.4
        const ang = -Math.PI * (0.35 + Math.random() * 0.5) // up & across
        const speed = 0.14 + Math.random() * 0.08
        const hue = 0.0 + Math.random() * 0.45 // warm gold/rose = "my" stars
        fling(x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, hue)
      }
    }
    if (motionGrantedRef.current) {
      window.addEventListener('devicemotion', onMotion)
    }

    // 4) tap-pad fallback — identical pipeline. Always present (covers the
    //    whole sky) so a no-motion device is never a dead end.
    function onPointer(e: PointerEvent) {
      // ignore taps on UI chrome (buttons stop propagation themselves)
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight
      const ang = -Math.PI * (0.3 + Math.random() * 0.6)
      const speed = 0.12 + Math.random() * 0.08
      const hue = 0.0 + Math.random() * 0.45
      // launch from just below the tap so it streaks up to the finger
      fling(x, Math.min(0.98, y + 0.18), Math.cos(ang) * speed, Math.sin(ang) * speed, hue)
    }
    mount.addEventListener('pointerdown', onPointer)

    // 5) ghost friend — only while no real peer. Bows out on connect.
    if (!connectedRef.current) {
      ghostRef.current = startGhostFriend((ev) => {
        if (connectedRef.current) return
        landStar(ev, false) // friend's star: softer chime, cool hue, right sky
      })
    }

    // 6) networking — if we arrived via an invite link, auto-answer as guest.
    if (joinHashRef.current && netSupported()) {
      setRole('guest')
      const guest = createGuest(joinHashRef.current, (ev) => landStar(ev, false), onPeerOpen)
      peerRef.current = guest
      guest.localCode
        .then((code) => setGuestCode(code))
        .catch(() => {
          /* malformed link -> stay solo with ghost */
        })
      setInviteOpen(true)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('devicemotion', onMotion)
      mount.removeEventListener('pointerdown', onPointer)
      if (ghostRef.current) {
        ghostRef.current.stop()
        ghostRef.current = null
      }
      if (peerRef.current) {
        peerRef.current.close()
        peerRef.current = null
      }
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.dispose()
        audioRef.current = null
      }
    }
  }, [phase])

  // ── invite (host) ────────────────────────────────────────────────────────────
  function handleInvite() {
    if (!netSupported()) return
    setRole('host')
    setInviteOpen(true)
    const host = createHost((ev) => landStar(ev, false), onPeerOpen)
    peerRef.current = host
    host.localCode
      .then((code) => setInviteLink(buildInviteLink(code)))
      .catch(() => setInviteOpen(false))
  }

  async function handleHostAccept() {
    const peer = peerRef.current
    if (!peer || !hostPaste.trim()) return
    try {
      await peer.acceptRemote(hostPaste.trim())
    } catch {
      /* bad code -> stay with ghost */
    }
  }

  function copyText(text: string) {
    try {
      void navigator.clipboard?.writeText(text)
    } catch {
      /* clipboard may be blocked; the field is still selectable */
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (phase === 'start') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-7 bg-[#0b0712] px-8">
        <div className="text-5xl">✨</div>
        <h1 className="text-center text-2xl font-semibold text-white/95">Starlight Friend</h1>
        <p className="max-w-sm text-center text-base leading-relaxed text-white/75">
          Shake to throw a shooting star into the sky. Your star lights up and sings
          in your friend&apos;s sky too — make a starlight song together.
        </p>
        <button
          onClick={handleStart}
          className="mt-2 flex min-h-[72px] min-w-[220px] items-center justify-center gap-3
                     rounded-full bg-violet-500/25 px-10 text-xl font-semibold text-white
                     ring-1 ring-violet-300/40 transition-colors hover:bg-violet-500/35"
        >
          <span className="text-2xl">✨</span> Start
        </button>
        <p className="text-base text-white/60">Tap the sky too · no words needed</p>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0b0712]">
      {/* three.js mount — also the full-screen tap-pad */}
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      {/* always-present "make a star" tap-pad hint (icon, no reading needed) */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 select-none text-center">
        <div className="text-4xl drop-shadow-[0_0_12px_rgba(196,168,255,0.7)]">✨</div>
      </div>

      {/* friend status — color dot, minimal text */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            connected ? 'bg-emerald-300' : 'bg-cyan-300/70'
          }`}
          style={{ boxShadow: '0 0 10px currentColor' }}
        />
        <span className="text-base text-white/75">
          {connected ? 'friend here' : 'starlight friend'}
        </span>
      </div>

      {/* invite button (only if WebRTC + gzip supported, and not already a guest) */}
      {canInvite && role !== 'guest' && (
        <button
          onClick={() => (inviteOpen ? setInviteOpen(false) : handleInvite())}
          className="absolute right-4 top-4 flex min-h-[64px] min-w-[64px] items-center
                     justify-center rounded-full bg-white/10 text-2xl text-white
                     ring-1 ring-white/20 transition-colors hover:bg-white/20"
          aria-label="invite a friend"
        >
          👋
        </button>
      )}

      {/* notices — must be clearly visible (text-rose-300) */}
      {notice !== '' && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 max-w-xs -translate-x-1/2 text-center">
          <p className="text-base text-rose-300">
            {notice === 'no-motion' && 'Shake is off — tap the sky to make a star.'}
            {notice === 'no-webgl' && 'This screen can’t draw stars, but you can still hear them.'}
            {notice === 'no-audio' && 'Sound is off — the stars still shine.'}
          </p>
        </div>
      )}

      {/* invite panel */}
      {inviteOpen && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 p-5 ring-1 ring-white/15 backdrop-blur">
          {role === 'host' && (
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
                  className="min-h-[48px] rounded-lg bg-violet-500/30 px-4 text-base text-white"
                >
                  copy
                </button>
              </div>
              <p className="text-base text-white/75">Then paste their star-code back here:</p>
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
          {role === 'guest' && (
            <div className="flex flex-col gap-3">
              <p className="text-base text-white/95">
                You joined a friend’s sky 🌟 Send them this star-code:
              </p>
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
                  className="min-h-[48px] rounded-lg bg-violet-500/30 px-4 text-base text-white"
                >
                  copy
                </button>
              </div>
              <p className="text-base text-white/75">
                {connected ? 'Connected! Shake to play together 🌟' : 'Waiting for your friend…'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
