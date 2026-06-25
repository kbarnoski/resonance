// net.ts — serverless WebRTC role co-play + the "ghost friend" fallback.
// Reimplemented (NOT imported) from 918-kids-starlight-friend's handshake.
//
// Handshake (no signaling server):
//   HOST  : createOffer -> gzip+base64url the SDP into a link with a #join hash.
//   GUEST : open link -> read hash -> setRemote(offer) -> createAnswer ->
//           gzip+base64url the answer into a SHORT code shown on screen.
//   HOST  : pastes the guest code back -> setRemote(answer) -> connected.
//
// Once the data channel opens, peers exchange tiny ROLE events:
//   conductor: { role:'conductor', chord:<0..3>, bpm:<n> }
//   player:    { role:'player',    note:<midi> }
// Both peers render + synth locally. (The Hub / League of Automatic Music
// Composers: small messages travel, each node sounds locally.)

export type ConductorEvent = { role: 'conductor'; chord: number; bpm: number }
export type PlayerEvent = { role: 'player'; note: number }
export type NetEvent = ConductorEvent | PlayerEvent

function isNetEvent(v: unknown): v is NetEvent {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o.role === 'conductor') return typeof o.chord === 'number' && typeof o.bpm === 'number'
  if (o.role === 'player') return typeof o.note === 'number'
  return false
}

// ── base64url helpers ────────────────────────────────────────────────────────
function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Feature gate: WebRTC + CompressionStream both required for invites.
export function netSupported(): boolean {
  return (
    typeof RTCPeerConnection !== 'undefined' &&
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined'
  )
}

// Copy into a fresh plain-ArrayBuffer view → a clean BufferSource for strict TS.
function toBufferSource(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength)
  new Uint8Array(out).set(u)
  return out
}

async function gzip(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  void writer.write(toBufferSource(new TextEncoder().encode(text)))
  void writer.close()
  const buf = await new Response(cs.readable).arrayBuffer()
  return new Uint8Array(buf)
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  void writer.write(toBufferSource(bytes))
  void writer.close()
  const buf = await new Response(ds.readable).arrayBuffer()
  return new TextDecoder().decode(buf)
}

async function packSdp(sdp: RTCSessionDescriptionInit): Promise<string> {
  return bytesToB64url(await gzip(JSON.stringify(sdp)))
}

async function unpackSdp(code: string): Promise<RTCSessionDescriptionInit> {
  return JSON.parse(await gunzip(b64urlToBytes(code.trim())))
}

// Wait for ICE gathering so the packed SDP is self-contained (no trickle).
function waitIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(done, 2500)
  })
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export type PeerHandle = {
  pc: RTCPeerConnection
  localCode: Promise<string>
  acceptRemote: (code: string) => Promise<void>
  send: (ev: NetEvent) => void
  close: () => void
}

// HOST: build an offer peer. onEvent fires for the partner's role events.
export function createHost(
  onEvent: (ev: NetEvent) => void,
  onOpen: () => void,
): PeerHandle {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const ch = pc.createDataChannel('orchestra', { ordered: false, maxRetransmits: 0 })
  wireChannel(ch, onEvent, onOpen)

  const localCode = (async () => {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitIce(pc)
    return packSdp(pc.localDescription!)
  })()

  return {
    pc,
    localCode,
    acceptRemote: async (code: string) => {
      const answer = await unpackSdp(code)
      await pc.setRemoteDescription(answer)
    },
    send: makeSender(() => ch),
    close: () => closePc(pc, ch),
  }
}

// GUEST: consume the host offer (from the link hash) and produce an answer code.
export function createGuest(
  offerCode: string,
  onEvent: (ev: NetEvent) => void,
  onOpen: () => void,
): PeerHandle {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  let ch: RTCDataChannel | null = null
  pc.ondatachannel = (e) => {
    ch = e.channel
    wireChannel(ch, onEvent, onOpen)
  }

  const localCode = (async () => {
    const offer = await unpackSdp(offerCode)
    await pc.setRemoteDescription(offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitIce(pc)
    return packSdp(pc.localDescription!)
  })()

  return {
    pc,
    localCode,
    acceptRemote: async () => {
      /* guest does not paste anything back */
    },
    send: makeSender(() => ch),
    close: () => closePc(pc, ch),
  }
}

function wireChannel(
  ch: RTCDataChannel,
  onEvent: (ev: NetEvent) => void,
  onOpen: () => void,
) {
  ch.onopen = () => onOpen()
  ch.onmessage = (e) => {
    try {
      const ev: unknown = JSON.parse(e.data as string)
      if (isNetEvent(ev)) onEvent(ev)
    } catch {
      /* ignore malformed */
    }
  }
}

function makeSender(getCh: () => RTCDataChannel | null) {
  return (ev: NetEvent) => {
    const ch = getCh()
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify(ev))
      } catch {
        /* drop — co-play is latency tolerant */
      }
    }
  }
}

function closePc(pc: RTCPeerConnection, ch: RTCDataChannel | null) {
  try {
    if (ch) ch.close()
  } catch {
    /* noop */
  }
  try {
    pc.close()
  } catch {
    /* noop */
  }
}

// Build a shareable invite link with the offer in the #hash fragment.
export function buildInviteLink(offerCode: string): string {
  const base = window.location.origin + window.location.pathname
  return `${base}#join=${offerCode}`
}

// Read an inbound offer from the current URL hash (guest side).
export function readJoinHash(): string | null {
  const h = window.location.hash || ''
  const m = h.match(/[#&]join=([^&]+)/)
  return m ? m[1] : null
}

// ── ghost friend ─────────────────────────────────────────────────────────────
// A gentle simulated partner that plays the OTHER role so a solo glance hears
// full chord-over-melody within ~1s. Bows out the instant a real peer connects.
//
//   • If the local child is the PLAYER, the ghost CONDUCTS: it walks the chord
//     progression on a slow timer and emits conductor events.
//   • If the local child is the CONDUCTOR, the ghost PLAYS: it sprinkles soft
//     melody notes voiced into whatever chord the conductor is currently on.
export type GhostFriend = { stop: () => void }

// Ghost CONDUCTOR: advances through the progression slowly, emitting chord+bpm.
export function startGhostConductor(
  progressionLen: number,
  emit: (ev: ConductorEvent) => void,
): GhostFriend {
  let alive = true
  let chord = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  // start almost immediately so the sky is alive within ~1s
  const tick = () => {
    if (!alive) return
    emit({ role: 'conductor', chord: chord % progressionLen, bpm: 80 })
    chord++
    timer = setTimeout(tick, 3400) // ~one warm chord every few seconds
  }
  timer = setTimeout(tick, 300)
  return {
    stop: () => {
      alive = false
      if (timer) clearTimeout(timer)
    },
  }
}

// Ghost PLAYER: sprinkles soft melody taps. The caller voices them into the
// current chord (the ghost only supplies a vertical "where" 0..1).
export function startGhostPlayer(emit: (y01: number) => void): GhostFriend {
  let alive = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const tick = () => {
    if (!alive) return
    // a gentle melodic contour: wander up and down the sky
    const y = 0.2 + Math.random() * 0.6
    emit(y)
    timer = setTimeout(tick, 900 + Math.random() * 700)
  }
  timer = setTimeout(tick, 700)
  return {
    stop: () => {
      alive = false
      if (timer) clearTimeout(timer)
    },
  }
}
