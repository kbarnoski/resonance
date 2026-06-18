// portal.ts — Zero-server, shareable-link WebRTC handshake for the duet.
//
// NO backend, NO API route, NO npm deps. The whole signaling channel is a URL.
//
// Approach (non-trickle ICE → one complete SDP blob → gzip → base64url token):
//   1. Host builds an OFFER, then AWAITS ICE gathering complete so the
//      localDescription is a SINGLE finished blob (no trickle).
//   2. That blob is gzip-compressed (native CompressionStream) and base64url-
//      encoded into a token, embedded in a shareable URL:  …#o=<token>
//   3. Guest opens the URL, decodes the offer, sets it, builds an ANSWER, again
//      awaits ICE-complete, and produces its own return token (…#a=<token>).
//   4. Host pastes the return token → setRemoteDescription → connected.
//
// Reference: JackTrip's WebRTC work + the AES paper "Web-Based Networked Music
// Performances via WebRTC: A Low-Latency PCM Audio Solution" (RTCDataChannel +
// Web Audio). The twist here: we send only note EVENTS, not PCM — both peers
// already hold the same corpus, so bandwidth is near zero.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** A note-event sent over the data channel. p = which player; x,y in 0..1. */
export interface NoteEvent {
  p: 0 | 1;
  x: number;
  y: number;
  /** Sender timestamp (performance.now, ms) — for display only. */
  t: number;
}

export type PortalRole = "host" | "guest";

export interface PortalCallbacks {
  onState: (state: RTCPeerConnectionState) => void;
  onOpen: () => void;
  onClose: () => void;
  onNote: (ev: NoteEvent) => void;
}

/** True only if every native API we rely on is present. */
export function webrtcSupported(): boolean {
  return (
    typeof RTCPeerConnection !== "undefined" &&
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

// ─── base64url <-> bytes ─────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(text));
  void writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  // copy into a fresh ArrayBuffer-backed view to satisfy BufferSource typing
  void writer.write(bytes.slice());
  void writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/** Compress an SDP description into a URL-safe token. */
export async function encodeDescription(
  desc: RTCSessionDescriptionInit,
): Promise<string> {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp });
  return bytesToBase64Url(await gzip(json));
}

/** Decompress a token back into an SDP description. */
export async function decodeDescription(
  token: string,
): Promise<RTCSessionDescriptionInit> {
  const json = await gunzip(base64UrlToBytes(token.trim()));
  const obj = JSON.parse(json) as { t: RTCSdpType; s: string };
  return { type: obj.t, sdp: obj.s };
}

/**
 * Wait until ICE candidate gathering is complete so localDescription is one
 * finished, non-trickle blob. Resolves on 'complete' or after ~2.2s.
 */
function waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", check);
    const timer = setTimeout(finish, 2200);
  });
}

/**
 * A live portal connection. Wraps the RTCPeerConnection + the single "portal"
 * RTCDataChannel and exposes the two-step handshake plus send/teardown.
 */
export class Portal {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private cb: PortalCallbacks;
  role: PortalRole;

  constructor(role: PortalRole, cb: PortalCallbacks) {
    this.role = role;
    this.cb = cb;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.addEventListener("connectionstatechange", () => {
      this.cb.onState(this.pc.connectionState);
    });
    if (role === "guest") {
      // Guest receives the channel the host created.
      this.pc.addEventListener("datachannel", (e) => {
        this.bindChannel(e.channel);
      });
    }
  }

  private bindChannel(ch: RTCDataChannel) {
    this.channel = ch;
    ch.addEventListener("open", () => this.cb.onOpen());
    ch.addEventListener("close", () => this.cb.onClose());
    ch.addEventListener("message", (e) => {
      try {
        const ev = JSON.parse(e.data as string) as NoteEvent;
        if (typeof ev.x === "number" && typeof ev.y === "number") {
          this.cb.onNote(ev);
        }
      } catch {
        /* ignore malformed */
      }
    });
  }

  /** HOST step 1: create the offer, return its shareable token. */
  async createOfferToken(): Promise<string> {
    const ch = this.pc.createDataChannel("portal", { ordered: true });
    this.bindChannel(ch);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceComplete(this.pc);
    return encodeDescription(this.pc.localDescription as RTCSessionDescription);
  }

  /** GUEST step: accept the host's offer token, return the answer token. */
  async acceptOfferToken(offerToken: string): Promise<string> {
    const offer = await decodeDescription(offerToken);
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceComplete(this.pc);
    return encodeDescription(this.pc.localDescription as RTCSessionDescription);
  }

  /** HOST step 2: accept the guest's returned answer token → connected. */
  async acceptAnswerToken(answerToken: string): Promise<void> {
    const answer = await decodeDescription(answerToken);
    await this.pc.setRemoteDescription(answer);
  }

  /** Send a note-event if the channel is open. */
  sendNote(ev: NoteEvent): void {
    const ch = this.channel;
    if (ch && ch.readyState === "open") {
      try {
        ch.send(JSON.stringify(ev));
      } catch {
        /* drop on backpressure */
      }
    }
  }

  get connected(): boolean {
    return this.channel?.readyState === "open";
  }

  /** Full teardown: close channel + peer connection. */
  destroy(): void {
    try {
      this.channel?.close();
    } catch {
      /* ok */
    }
    try {
      this.pc.close();
    } catch {
      /* ok */
    }
    this.channel = null;
  }
}
