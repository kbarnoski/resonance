// net.ts — serverless WebRTC co-play + the "ghost friend" fallback.
//
// Handshake (no signaling server):
//   HOST  : createOffer -> gzip+base64url the SDP into a link with a #hash.
//   GUEST : open link -> read #hash -> setRemote(offer) -> createAnswer ->
//           gzip+base64url the answer into a SHORT code shown on screen.
//   HOST  : pastes the guest code back -> setRemote(answer) -> connected.
//
// Once the data channel is open, both peers exchange tiny StarEvents and each
// renders + synthesizes locally. Near-zero bandwidth. (The Hub / League of
// Automatic Music Composers: small messages travel, each node renders locally.)

export type StarEvent = {
  x: number // 0..1 normalized sky position
  y: number // 0..1
  hue: number // 0..1
  t: number // sender clock ms (informational; we do NOT hard-sync)
  vx?: number // shooting-star direction (optional)
  vy?: number
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

// Copy into a fresh plain-ArrayBuffer-backed view so the type is a clean
// BufferSource (avoids ArrayBufferLike narrowing issues in strict TS).
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

export async function packSdp(sdp: RTCSessionDescriptionInit): Promise<string> {
  return bytesToB64url(await gzip(JSON.stringify(sdp)))
}

export async function unpackSdp(code: string): Promise<RTCSessionDescriptionInit> {
  return JSON.parse(await gunzip(b64urlToBytes(code.trim())))
}

// Wait for ICE gathering to finish so the packed SDP is self-contained
// (no trickle, no server). Resolves on 'complete' or a short timeout.
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
    // Public STUN-free local handshake usually completes fast; cap the wait.
    setTimeout(done, 2500)
  })
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export type PeerHandle = {
  pc: RTCPeerConnection
  // resolves with a packed answer/offer string ready to share
  localCode: Promise<string>
  // call after pasting the remote answer (host side only)
  acceptRemote: (code: string) => Promise<void>
  send: (ev: StarEvent) => void
  close: () => void
}

// HOST: build an offer peer. onEvent fires for stars the guest flings.
// onOpen fires when the channel connects (so the ghost friend can bow out).
export function createHost(
  onEvent: (ev: StarEvent) => void,
  onOpen: () => void,
): PeerHandle {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const ch = pc.createDataChannel('stars', { ordered: false, maxRetransmits: 0 })
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
  onEvent: (ev: StarEvent) => void,
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
  onEvent: (ev: StarEvent) => void,
  onOpen: () => void,
) {
  ch.onopen = () => onOpen()
  ch.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data as string) as StarEvent
      if (typeof ev.x === 'number' && typeof ev.y === 'number') onEvent(ev)
    } catch {
      /* ignore malformed */
    }
  }
}

function makeSender(getCh: () => RTCDataChannel | null) {
  return (ev: StarEvent) => {
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
// A gentle simulated second player. Flings its OWN shooting stars every few
// seconds in a different sky region / hue, so a solo glance shows two-player
// co-play, alive within ~1s. Bows out the moment a real peer connects.
export type GhostFriend = {
  stop: () => void
}

export function startGhostFriend(emit: (ev: StarEvent) => void): GhostFriend {
  let timer: ReturnType<typeof setTimeout> | null = null
  let alive = true

  // The ghost lives in the RIGHT half of the sky with cooler cyan/violet hues,
  // so it reads visually as "the other child."
  function schedule(delay: number) {
    timer = setTimeout(() => {
      if (!alive) return
      const x = 0.55 + Math.random() * 0.4 // right side
      const y = 0.12 + Math.random() * 0.6
      const hue = 0.55 + Math.random() * 0.4 // cyan -> violet end
      const ang = Math.PI * (0.6 + Math.random() * 0.6)
      emit({
        x,
        y,
        hue,
        t: Date.now(),
        vx: Math.cos(ang) * 0.18,
        vy: Math.sin(ang) * 0.18,
      })
      schedule(2600 + Math.random() * 2600)
    }, delay)
  }
  // first star within ~1s of Start
  schedule(800 + Math.random() * 400)

  return {
    stop: () => {
      alive = false
      if (timer) clearTimeout(timer)
    },
  }
}
