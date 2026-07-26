// Transport layer. Three tiers, ONE event protocol. We never send audio — only
// these compact control events cross the wire; each client synthesises locally.

import { GHOST_SEED, mulberry32, N_STRINGS } from "./strings";

export type NetEvent =
  | { type: "pluck"; player: number; stringIndex: number; x: number; velocity: number; t: number }
  | { type: "cursor"; player: number; x: number; y: number; t: number };

export type EventSink = (ev: NetEvent) => void;

// ── Tier 1: seeded ghost partner ────────────────────────────────────────────
// A virtual second player driven entirely by mulberry32(GHOST_SEED). It plucks
// the shared field with human-ish phrasing so the piece is alive and duetting
// the instant you press Start — and is the deterministic headless-review peer.
export interface Ghost {
  tick(now: number): void;
  reset(now: number): void;
}

export function makeGhost(player: number, sink: EventSink): Ghost {
  const rng = mulberry32(GHOST_SEED);
  let started = false;
  let nextPluck = 0;
  let lastCursor = 0;
  let cx = 0.5;
  let cy = 0.5;
  let tx = 0.5;
  let ty = 0.5;

  function reset(now: number): void {
    started = true;
    nextPluck = now + 650;
    lastCursor = now;
    cx = tx = 0.3 + rng() * 0.4;
    cy = ty = 0.3 + rng() * 0.4;
  }

  function tick(now: number): void {
    if (!started) reset(now);

    // ease the ghost cursor toward its current target
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    if (now - lastCursor > 55) {
      lastCursor = now;
      sink({ type: "cursor", player, x: cx, y: cy, t: now });
    }

    if (now >= nextPluck) {
      const stringIndex = Math.max(
        0,
        Math.min(N_STRINGS - 1, Math.round(cy * (N_STRINGS - 1))),
      );
      sink({
        type: "pluck",
        player,
        stringIndex,
        x: cx,
        velocity: 0.35 + rng() * 0.55,
        t: now,
      });
      // pick a fresh region + human-ish rest before the next pluck
      tx = 0.12 + rng() * 0.76;
      ty = 0.08 + rng() * 0.84;
      nextPluck = now + 320 + rng() * 1500;
    }
  }

  return { tick, reset };
}

// Shared transport surface for the two live tiers.
export interface Transport {
  readonly kind: "loopback" | "webrtc";
  send(ev: NetEvent): void;
  close(): void;
}

// ── Tier 2: BroadcastChannel loopback (two tabs, one machine) ────────────────
export function broadcastAvailable(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

export function makeLoopback(opts: {
  selfId: string;
  onEvent: EventSink;
  onPeer: (connected: boolean) => void;
}): Transport {
  const bc = new BroadcastChannel("dream-2912-ensemble");
  let peer = false;

  const setPeer = (v: boolean) => {
    if (v !== peer) {
      peer = v;
      opts.onPeer(v);
    }
  };

  bc.onmessage = (m: MessageEvent) => {
    const data = m.data as { from: string; ev: NetEvent | { type: string } };
    if (!data || data.from === opts.selfId) return;
    const ev = data.ev;
    if (ev.type === "hello") {
      setPeer(true);
      bc.postMessage({ from: opts.selfId, ev: { type: "ack" } });
      return;
    }
    if (ev.type === "ack") {
      setPeer(true);
      return;
    }
    if (ev.type === "bye") {
      setPeer(false);
      return;
    }
    opts.onEvent(ev as NetEvent);
  };

  bc.postMessage({ from: opts.selfId, ev: { type: "hello" } });

  return {
    kind: "loopback",
    send(ev) {
      bc.postMessage({ from: opts.selfId, ev });
    },
    close() {
      try {
        bc.postMessage({ from: opts.selfId, ev: { type: "bye" } });
        bc.close();
      } catch {
        // channel already gone
      }
    },
  };
}

// ── Tier 3: manual-SDP WebRTC (two real devices, no signalling server) ───────
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
    // fall through after a moment even if a candidate is still trickling
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
        opts.onEvent(JSON.parse(m.data as string) as NetEvent);
      } catch {
        // ignore malformed frame
      }
    };
  };

  pc.ondatachannel = (e) => wire(e.channel);

  return {
    kind: "webrtc",
    async createInvite() {
      wire(pc.createDataChannel("ensemble"));
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
        // already closed
      }
    },
  };
}

// Small non-sim-path id for distinguishing tabs / peers.
export function makePeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Math.floor(performance.now())}-${Math.floor(performance.now() % 997)}`;
}
