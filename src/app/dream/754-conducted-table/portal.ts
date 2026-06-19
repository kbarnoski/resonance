// portal.ts — Zero-server, shareable-link WebRTC for the conducted table.
//
// Cycle-2 STAR / CONDUCTOR-HUB topology adapted from 729-piano-portal-jam's
// proven 1:1 handshake. The conductor is the HOST hub; each guest fills ONE
// seat. The host stacks one RTCPeerConnection per seat (one Portal each), so
// 3+ players are just N independent host-side portals.
//
// NO backend, NO API route, NO npm signaling deps. The signaling channel is a
// URL: the offer SDP is gzipped → base64url into #o=<token>; the guest decodes,
// auto-answers, and returns #a=<token> for the host to paste.
//
// Across the wire we send only note-EVENTS {seat, phrase, vel, t}; each peer
// renders the phrase LOCALLY from the identical recording. Near-zero bandwidth.
//
// References: JackTrip; The Hub / League of Automatic Music Composers; the AES
// paper "Web-Based Networked Music Performances via WebRTC".

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** A note-event sent over the data channel — phrase index + velocity. */
export interface NoteEvent {
  /** Which seat fired (0-based index). */
  seat: number;
  /** Index into the shared phrase bank. */
  phrase: number;
  /** Velocity 0..1. */
  vel: number;
  /** Sender timestamp (performance.now, ms) — display only. */
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
 * A live portal connection (one peer link = one seat). Wraps the
 * RTCPeerConnection + the single "portal" RTCDataChannel and exposes the
 * two-step handshake plus send/teardown. The host owns one Portal per filled
 * seat; the guest owns exactly one.
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
        if (
          typeof ev.seat === "number" &&
          typeof ev.phrase === "number" &&
          typeof ev.vel === "number"
        ) {
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
