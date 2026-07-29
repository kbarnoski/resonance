// net.ts — presence transport + the synthetic companion + the self-demo
// autopilot. Three concerns, one tiny wire protocol.
//
// Nothing but intent crosses the network: {kind, pitch, strength, beat}.
// Each peer re-synthesises locally (see audio.ts) and re-draws locally
// (see page.tsx). This keeps the room usable over an ordinary manual-SDP
// WebRTC link with no signalling server and no audio/video streaming.

import { mulberry32, pickComplementaryTone, pullTowardField, tToFreq } from "./harmony";

export type CommonsEvent =
  | { kind: "contribute"; pitch: number; strength: number; beat: number; t: number }
  | { kind: "sync"; beat: number; msIntoBeat: number; t: number };

export type EventSink = (ev: CommonsEvent) => void;

export function makePeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Math.floor(performance.now())}-${Math.floor(performance.now() % 997)}`;
}

// ── Transport surface shared by the live tiers ──────────────────────────────
export interface Transport {
  readonly kind: "loopback" | "webrtc";
  send(ev: CommonsEvent): void;
  close(): void;
}

// ── Tier: BroadcastChannel loopback (two tabs, one machine — for testing
// the duet feeling without a second device) ────────────────────────────────
export function broadcastAvailable(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

export function makeLoopback(opts: {
  selfId: string;
  onEvent: EventSink;
  onPeer: (connected: boolean) => void;
}): Transport {
  const bc = new BroadcastChannel("dream-3504-commons");
  let peer = false;

  const setPeer = (v: boolean) => {
    if (v !== peer) {
      peer = v;
      opts.onPeer(v);
    }
  };

  bc.onmessage = (m: MessageEvent) => {
    const data = m.data as { from: string; ev: CommonsEvent | { kind: string } };
    if (!data || data.from === opts.selfId) return;
    const ev = data.ev;
    if (ev.kind === "hello") {
      setPeer(true);
      bc.postMessage({ from: opts.selfId, ev: { kind: "ack" } });
      return;
    }
    if (ev.kind === "ack") {
      setPeer(true);
      return;
    }
    if (ev.kind === "bye") {
      setPeer(false);
      return;
    }
    opts.onEvent(ev as CommonsEvent);
  };

  bc.postMessage({ from: opts.selfId, ev: { kind: "hello" } });

  return {
    kind: "loopback",
    send(ev) {
      bc.postMessage({ from: opts.selfId, ev });
    },
    close() {
      try {
        bc.postMessage({ from: opts.selfId, ev: { kind: "bye" } });
        bc.close();
      } catch {
        /* channel already gone */
      }
    },
  };
}

// ── Tier: manual-SDP WebRTC (two real devices, no signalling server) ───────
export function webrtcAvailable(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

function waitForIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Fall through even if a candidate is still trickling — better a
    // slightly slower link than a stuck one.
    setTimeout(resolve, 2500);
  });
}

export interface WebrtcLink extends Transport {
  createInvite(): Promise<string>;
  acceptInvite(offer: string): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
}

export function makeWebrtc(opts: {
  onEvent: EventSink;
  onOpen: () => void;
  onClose: () => void;
}): WebrtcLink {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  let dc: RTCDataChannel | null = null;

  const wire = (channel: RTCDataChannel) => {
    dc = channel;
    channel.onopen = () => opts.onOpen();
    channel.onclose = () => opts.onClose();
    channel.onmessage = (m: MessageEvent) => {
      try {
        opts.onEvent(JSON.parse(m.data as string) as CommonsEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
  };

  pc.ondatachannel = (e) => wire(e.channel);

  return {
    kind: "webrtc",
    async createInvite() {
      wire(pc.createDataChannel("commons"));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      return JSON.stringify(pc.localDescription);
    },
    async acceptInvite(offer: string) {
      await pc.setRemoteDescription(JSON.parse(offer) as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      return JSON.stringify(pc.localDescription);
    },
    async acceptAnswer(answer: string) {
      await pc.setRemoteDescription(JSON.parse(answer) as RTCSessionDescriptionInit);
    },
    send(ev) {
      if (dc && dc.readyState === "open") dc.send(JSON.stringify(ev));
    },
    close() {
      try {
        dc?.close();
        pc.close();
      } catch {
        /* already closed */
      }
    },
  };
}

// ── The synthetic companion ──────────────────────────────────────────────
// A gentle, no-stakes presence that stands in for a second person whenever
// none is connected. It never competes: it listens, waits a beat, answers
// with a complementary tone in a different register, and occasionally
// initiates on its own if the room has been quiet a while.
export interface Companion {
  /** Tell the companion a local contribution just landed, so it can plan
   *  an answer a little while later. `elapsed` is milliseconds since the
   *  session (the shared clock) started — NOT wall-clock time. */
  noteLocal(freq: number, elapsed: number): void;
  /** Advance the companion; calls `sink(freq, strength)` when it decides
   *  to contribute. `elapsed` is milliseconds since session start. */
  tick(
    elapsed: number,
    chordIndex: number,
    sink: (freq: number, strength: number) => void
  ): void;
}

export function makeCompanion(seed: number): Companion {
  const rng = mulberry32(seed);
  let lastLocalFreq: number | null = null;
  let pendingAnswerAt: number | null = null;
  let lastAnyContribAt = -Infinity;
  let nextInitiateAt = 6000 + rng() * 4000;

  function noteLocal(freq: number, now: number): void {
    lastLocalFreq = freq;
    lastAnyContribAt = now;
    // Leave space: wait a breath before answering, like a musician who
    // listens before responding rather than talking over.
    pendingAnswerAt = now + 1400 + rng() * 1700;
  }

  function tick(
    now: number,
    chordIndex: number,
    sink: (freq: number, strength: number) => void
  ): void {
    if (pendingAnswerAt !== null && now >= pendingAnswerAt) {
      const freq = pickComplementaryTone(chordIndex, lastLocalFreq, rng);
      sink(freq, 0.4 + rng() * 0.35);
      pendingAnswerAt = null;
      lastAnyContribAt = now;
      nextInitiateAt = now + 6500 + rng() * 5500;
      return;
    }

    // Occasionally initiate on its own, but only once the room has
    // actually been quiet for a while — a companion that arrives and
    // keeps you company, not just an echo.
    if (now >= nextInitiateAt && now - lastAnyContribAt > 5000) {
      const freq = pickComplementaryTone(chordIndex, lastLocalFreq, rng);
      sink(freq, 0.3 + rng() * 0.3);
      lastAnyContribAt = now;
      lastLocalFreq = null;
      nextInitiateAt = now + 7000 + rng() * 6000;
    }
  }

  return { noteLocal, tick };
}

// ── Self-demo autopilot ──────────────────────────────────────────────────
// Drives a synthetic "local" voice, deterministically, whenever the real
// person has been idle for a while — including immediately after Start.
// This is what makes the piece demoable headless: press Start, wait a
// couple seconds, and two presences are already weaving with nobody at the
// keyboard. Any real mic/tap input hands control straight back.
export interface Autopilot {
  /** `elapsed` is milliseconds since session start, not wall-clock time. */
  tick(
    elapsed: number,
    chordIndex: number,
    sink: (freq: number, strength: number) => void
  ): void;
}

export function makeAutopilot(seed: number): Autopilot {
  const rng = mulberry32(seed);
  let nextAt = 1800 + rng() * 900;
  // A slowly wandering melodic contour, so the demo voice glides rather
  // than jumps randomly between calls.
  let contour = 0.5;

  function tick(
    now: number,
    chordIndex: number,
    sink: (freq: number, strength: number) => void
  ): void {
    if (now < nextAt) return;
    contour += (rng() - 0.5) * 0.32;
    contour = Math.max(0.08, Math.min(0.92, contour));
    const raw = tToFreq(contour);
    const target = pullTowardField(raw, chordIndex, 0.3);
    sink(target, 0.35 + rng() * 0.3);
    nextAt = now + 2600 + rng() * 3400;
  }

  return { tick };
}
