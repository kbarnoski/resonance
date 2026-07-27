// Networking layer for 3144-latency. Two implementations behind one interface:
//
//   LoopbackPeer — the DEFAULT, headless-safe partner. Echoes messages back
//   after an adjustable round-trip latency (+ seeded jitter), so a single
//   device measures a real round trip and hears a real canon with no phone.
//
//   RtcPeer — opt-in real WebRTC data channel via manual SDP copy-paste
//   (no signaling server, no api route). Public STUN only. If it fails the
//   app stays in loopback — nothing here throws to the render loop.
//
// Timing uses performance.now() throughout (house rule); randomness is seeded
// mulberry32 (house rule).

import { mulberry32 } from "./wheel";

export type NetMsg =
  | { type: "ping"; t: number; from: number }
  | { type: "pong"; t: number; from: number }
  | { type: "tap"; angle: number; subdiv: number; off: number; t: number; from: number };

export interface Peer {
  onMessage: ((m: NetMsg) => void) | null;
  onStateChange: ((state: string) => void) | null;
  send(m: NetMsg): void;
  close(): void;
}

export class LoopbackPeer implements Peer {
  onMessage: ((m: NetMsg) => void) | null = null;
  onStateChange: ((state: string) => void) | null = null;
  private latency = 140;
  private jitter = 14;
  private rng: () => number;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(seed = 0x51a7) {
    this.rng = mulberry32(seed);
  }

  setLatency(ms: number): void {
    this.latency = ms;
  }

  send(m: NetMsg): void {
    // Round-trip delay with a little seeded jitter so the raw arrival wobbles
    // — that wobble is exactly what the snap engine tames.
    const d = Math.max(4, this.latency + (this.rng() * 2 - 1) * this.jitter);
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.onMessage) return;
      if (m.type === "ping") {
        this.onMessage({ type: "pong", t: m.t, from: m.from });
      } else if (m.type === "tap") {
        // Your own tap returned over the "wire" — the round trip made visible.
        this.onMessage(m);
      }
    }, d);
    this.timers.add(id);
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.onMessage = null;
    this.onStateChange = null;
  }
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class RtcPeer implements Peer {
  onMessage: ((m: NetMsg) => void) | null = null;
  onStateChange: ((state: string) => void) | null = null;
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;

  constructor() {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc.onconnectionstatechange = () =>
      this.onStateChange?.(this.pc.connectionState);
  }

  private bind(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => this.onStateChange?.("open");
    dc.onclose = () => this.onStateChange?.("closed");
    dc.onmessage = (e) => {
      try {
        this.onMessage?.(JSON.parse(e.data) as NetMsg);
      } catch {
        /* ignore malformed frame */
      }
    };
  }

  /** Offerer: create the data channel + offer, return SDP to hand to a friend. */
  async createOffer(): Promise<string> {
    const dc = this.pc.createDataChannel("canon");
    this.bind(dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.waitForIce();
    return JSON.stringify(this.pc.localDescription);
  }

  /** Answerer: accept a pasted offer, return an answer SDP to send back. */
  async acceptOffer(remote: string): Promise<string> {
    this.pc.ondatachannel = (e) => this.bind(e.channel);
    await this.pc.setRemoteDescription(JSON.parse(remote));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForIce();
    return JSON.stringify(this.pc.localDescription);
  }

  /** Offerer: finish the handshake with the pasted answer. */
  async acceptAnswer(remote: string): Promise<void> {
    await this.pc.setRemoteDescription(JSON.parse(remote));
  }

  // Non-trickle: wait until ICE gathering completes so one SDP paste carries
  // every candidate. Bounded so a stalled gather never hangs the UI.
  private waitForIce(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === "complete") return resolve();
      const check = () => {
        if (this.pc.iceGatheringState === "complete") {
          this.pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      this.pc.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 2500);
    });
  }

  send(m: NetMsg): void {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(m));
    }
  }

  close(): void {
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
    this.onMessage = null;
    this.onStateChange = null;
  }
}
