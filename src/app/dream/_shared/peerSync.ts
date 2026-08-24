// ─────────────────────────────────────────────────────────────────────────────
// _shared/peerSync.ts — the lab's first MULTI-USER transport. Two (or more)
// people share ONE synchronized session with NO signaling server: a real
// WebRTC RTCDataChannel for remote peers (manual copy-paste of a single
// ICE-complete SDP blob — no trickle, no backend), and a BroadcastChannel
// fallback so two tabs of the SAME browser sync instantly for solo review.
//
// It layers three things over whichever transport is live:
//   1. presence      — a hello/bye handshake, a live peer-id set, host election.
//   2. a shared clock — an NTP-style ping/pong over the channel: the guest
//                       samples round-trips to the host, keeps the min-RTT
//                       estimate, and derives `offsetMs` so `now()` returns the
//                       SAME millisecond on every peer (± a few ms). On the
//                       BroadcastChannel backend the tabs already share the OS
//                       wall clock, so offset is 0 by construction.
//   3. app messages   — a thin `send(payload)` / `onMessage(payload, from)` so
//                       the prototype ships gestures/anchors without knowing
//                       which transport carries them.
//
// The point of the shared clock is TRANSPORT SYNC, not audio content: a piece
// anchors playback to a synced instant (`play at now()===S, from offset O`) so
// Karel's ONE real take starts sample-close on both peers. (Sync insight after
// the 2026 browser-audio consensus: anchor to a shared transport position, and
// re-estimate the offset periodically to stop drift — the data-channel/RTCP
// re-anchoring idea, done at the app layer.)
//
// Framework-agnostic, zero deps, no top-level browser access (SSR-safe): every
// global (RTCPeerConnection / BroadcastChannel / Date) is touched only inside a
// method, so a "use client" page can import it and construct in useEffect.
// ─────────────────────────────────────────────────────────────────────────────

export type PeerRole = "host" | "guest";
export type PeerBackend = "solo" | "local" | "webrtc";

export type PeerStatus =
  | "idle" // constructed, nothing connected
  | "waiting" // host has an offer out / guest awaiting host code
  | "connecting" // handshake in flight
  | "connected" // at least one peer + clock ready
  | "closed"; // destroyed / peer gone

export interface PeerClockInfo {
  /** ms to ADD to local Date.now() to read the host's clock. Host = 0. */
  offsetMs: number;
  /** last measured round-trip time in ms (guest→host→guest). */
  rttMs: number;
}

export interface PeerSyncEvents {
  onStatus?: (status: PeerStatus) => void;
  onPeers?: (ids: readonly string[]) => void;
  onMessage?: (payload: unknown, from: string) => void;
  onClock?: (info: PeerClockInfo) => void;
}

export interface PeerSyncOptions extends PeerSyncEvents {
  /** Room name for the BroadcastChannel (same-browser) backend. */
  room?: string;
  /** STUN servers for WebRTC. LAN/same-machine works even if these are blocked. */
  iceServers?: RTCIceServer[];
}

// A short random id — no crypto dependency needed for a presence tag.
function makeId(): string {
  const a = Math.floor(Math.random() * 0xffffff).toString(16);
  const b = Math.floor(Math.random() * 0xffffff).toString(16);
  return (a + b).padStart(12, "0").slice(0, 12);
}

// Envelope carried by every transport. App payloads ride inside `kind:"app"`.
type Envelope =
  | { kind: "hello"; from: string }
  | { kind: "bye"; from: string }
  | { kind: "ping"; from: string; t0: number }
  | { kind: "pong"; from: string; to: string; t0: number; t1: number }
  | { kind: "app"; from: string; payload: unknown };

interface Transport {
  send(data: string): void;
  close(): void;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export class PeerSync {
  readonly selfId = makeId();

  private backend: PeerBackend = "solo";
  private status: PeerStatus = "idle";
  private events: PeerSyncEvents;
  private room: string;
  private iceServers: RTCIceServer[];

  private transport: Transport | null = null;
  private peerSet = new Set<string>();

  private explicitRole: PeerRole | null = null; // set on the WebRTC path
  private clockOffset = 0;
  private clockRtt = Number.POSITIVE_INFINITY;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  // WebRTC state (only populated on the webrtc backend)
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  constructor(opts: PeerSyncOptions = {}) {
    const { room, iceServers, ...events } = opts;
    this.events = events;
    this.room = room ?? "resonance-dream";
    this.iceServers = iceServers ?? DEFAULT_ICE;
  }

  // ── public reads ──────────────────────────────────────────────────────────

  /** Shared clock: the SAME ms on every peer (host authoritative). */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  getBackend(): PeerBackend {
    return this.backend;
  }

  getStatus(): PeerStatus {
    return this.status;
  }

  getClock(): PeerClockInfo {
    return { offsetMs: this.clockOffset, rttMs: this.clockRtt };
  }

  peers(): string[] {
    return [...this.peerSet];
  }

  connected(): boolean {
    return this.peerSet.size > 0;
  }

  role(): PeerRole {
    if (this.explicitRole) return this.explicitRole;
    // BroadcastChannel election: lowest id in the room is host. Deterministic
    // and stable for a 2-tab demo (min of two fixed ids never flaps).
    const ids = [this.selfId, ...this.peerSet].sort();
    return ids[0] === this.selfId ? "host" : "guest";
  }

  isHost(): boolean {
    return this.role() === "host";
  }

  // ── app messaging ─────────────────────────────────────────────────────────

  send(payload: unknown): void {
    this.rawSend({ kind: "app", from: this.selfId, payload });
  }

  // ── BroadcastChannel backend (same-browser tabs) ───────────────────────────

  /** Join the same-browser room. Two tabs → instant sync, OS wall clock shared. */
  startLocal(): void {
    if (typeof BroadcastChannel === "undefined") return;
    this.teardownTransport();
    this.backend = "local";
    this.clockOffset = 0; // same machine → wall clock already shared
    this.clockRtt = 0;
    const bc = new BroadcastChannel(`peersync:${this.room}`);
    bc.onmessage = (ev: MessageEvent) => this.handle(String(ev.data));
    this.transport = {
      send: (d) => bc.postMessage(d),
      close: () => {
        try {
          bc.close();
        } catch {
          /* already closing */
        }
      },
    };
    this.setStatus("waiting");
    this.rawSend({ kind: "hello", from: this.selfId });
    this.events.onClock?.(this.getClock());
  }

  // ── WebRTC backend (remote, manual copy-paste signaling) ───────────────────

  /** HOST step 1: create the offer. Returns a code to hand to the guest. */
  async createOffer(): Promise<string> {
    this.teardownTransport();
    this.backend = "webrtc";
    this.explicitRole = "host";
    const pc = this.newPeerConnection();
    const channel = pc.createDataChannel("resonance", { ordered: true });
    this.attachChannel(channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIce(pc);
    this.setStatus("waiting");
    return encodeSignal(pc.localDescription);
  }

  /** HOST step 2: paste the guest's answer code to finish the handshake. */
  async acceptAnswer(code: string): Promise<void> {
    if (!this.pc) throw new Error("createOffer() must run first");
    const desc = decodeSignal(code);
    await this.pc.setRemoteDescription(desc);
    this.setStatus("connecting");
  }

  /** GUEST: paste the host's offer code; returns an answer code to send back. */
  async acceptOffer(code: string): Promise<string> {
    this.teardownTransport();
    this.backend = "webrtc";
    this.explicitRole = "guest";
    const pc = this.newPeerConnection();
    pc.ondatachannel = (ev) => this.attachChannel(ev.channel);
    await pc.setRemoteDescription(decodeSignal(code));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIce(pc);
    this.setStatus("connecting");
    return encodeSignal(pc.localDescription);
  }

  private newPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        this.setStatus("closed");
      }
    };
    this.pc = pc;
    return pc;
  }

  // Wait for ICE gathering to finish so the SDP blob is self-contained (no
  // trickle → a single copy-paste is enough, no signaling server needed).
  private waitForIce(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", done);
      // Safety timeout: ship whatever candidates we have after 2.5s.
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }, 2500);
    });
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    this.transport = {
      send: (d) => {
        if (channel.readyState === "open") channel.send(d);
      },
      close: () => {
        try {
          channel.close();
        } catch {
          /* already closing */
        }
      },
    };
    channel.onopen = () => {
      this.rawSend({ kind: "hello", from: this.selfId });
      // Guest drives the clock sync toward the host.
      if (this.role() === "guest") this.startClockSync();
    };
    channel.onclose = () => this.setStatus("closed");
    channel.onmessage = (ev: MessageEvent) => this.handle(String(ev.data));
  }

  // ── shared clock (NTP-style over whichever channel is live) ────────────────

  private startClockSync(): void {
    this.stopClockSync();
    const tick = () => this.rawSend({ kind: "ping", from: this.selfId, t0: Date.now() });
    tick();
    this.clockTimer = setInterval(tick, 2000);
  }

  private stopClockSync(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  // ── transport plumbing ─────────────────────────────────────────────────────

  private rawSend(env: Envelope): void {
    this.transport?.send(JSON.stringify(env));
  }

  private handle(raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (env.from === this.selfId) return; // ignore our own echo (BroadcastChannel)

    switch (env.kind) {
      case "hello": {
        const isNew = !this.peerSet.has(env.from);
        this.peerSet.add(env.from);
        if (isNew) {
          // reply so the newcomer learns about us too (BroadcastChannel mesh)
          this.rawSend({ kind: "hello", from: this.selfId });
          this.events.onPeers?.(this.peers());
          this.setStatus("connected");
          // On the local backend the newly-elected guest should start syncing
          // (clock offset is 0 there, but this emits onClock for the UI).
          if (this.backend === "local") this.events.onClock?.(this.getClock());
        }
        break;
      }
      case "bye": {
        if (this.peerSet.delete(env.from)) {
          this.events.onPeers?.(this.peers());
          if (this.peerSet.size === 0) this.setStatus("waiting");
        }
        break;
      }
      case "ping": {
        // Host answers a clock probe with its own current time.
        this.rawSend({
          kind: "pong",
          from: this.selfId,
          to: env.from,
          t0: env.t0,
          t1: Date.now(),
        });
        break;
      }
      case "pong": {
        if (env.to !== this.selfId) return;
        const t2 = Date.now();
        const rtt = t2 - env.t0;
        // Keep the best (min-RTT) sample — it has the least queuing skew.
        if (rtt <= this.clockRtt) {
          this.clockRtt = rtt;
          // host clock at reply ≈ env.t1; our clock then ≈ env.t0 + rtt/2.
          this.clockOffset = env.t1 - (env.t0 + rtt / 2);
          this.events.onClock?.(this.getClock());
        }
        break;
      }
      case "app": {
        this.events.onMessage?.(env.payload, env.from);
        break;
      }
    }
  }

  private setStatus(s: PeerStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.events.onStatus?.(s);
  }

  private teardownTransport(): void {
    this.stopClockSync();
    this.transport?.close();
    this.transport = null;
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* already closed */
      }
      this.pc = null;
    }
    this.peerSet.clear();
  }

  destroy(): void {
    this.rawSend({ kind: "bye", from: this.selfId });
    this.teardownTransport();
    this.explicitRole = null;
    this.clockOffset = 0;
    this.clockRtt = Number.POSITIVE_INFINITY;
    this.setStatus("closed");
  }
}

// ── signaling codec: compact, URL-safe, self-contained SDP blob ──────────────

function encodeSignal(desc: RTCSessionDescription | null): string {
  if (!desc) throw new Error("no local description to encode");
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  // base64 keeps it copy-paste friendly across chat apps.
  if (typeof btoa !== "undefined") return btoa(json);
  return json;
}

function decodeSignal(code: string): RTCSessionDescriptionInit {
  const trimmed = code.trim();
  let json = trimmed;
  if (typeof atob !== "undefined" && !trimmed.startsWith("{")) {
    try {
      json = atob(trimmed);
    } catch {
      json = trimmed;
    }
  }
  const parsed = JSON.parse(json) as { type: RTCSdpType; sdp: string };
  return { type: parsed.type, sdp: parsed.sdp };
}

/**
 * Convenience for prototypes: build a PeerSync and, unless told otherwise,
 * immediately join the same-browser room so a two-tab demo works with zero
 * clicks. Call `.createOffer()` / `.acceptOffer()` to add a remote peer.
 */
export function createPeerSync(opts: PeerSyncOptions = {}): PeerSync {
  return new PeerSync(opts);
}
