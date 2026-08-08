// ─────────────────────────────────────────────────────────────────────────────
// sync.ts — co-presence transport over BroadcastChannel (same-origin tabs).
//
// We send the CALL as a note-list (control data — NEVER audio). Each device
// synthesizes + renders locally, so there is NO shared clock and no lock: a
// call cast from one tab's LEFT stall arrives at the other tab as a phrase
// sweeping in from ITS partner (RIGHT) stall. A heartbeat announces presence;
// when a real partner is heard, the seeded ghost yields. Degrades to a no-op
// (solo + ghost) when BroadcastChannel is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export interface CallMsg {
  t: "call";
  peer: string;
  notes: Array<{ semi: number; dt: number }>; // dt = ms offset from phrase start
  speed: number;
}
export interface BeatMsg {
  t: "beat";
  peer: string;
}
export type SyncMsg = CallMsg | BeatMsg;

export interface Sync {
  peerId: string;
  supported: boolean;
  send: (m: SyncMsg) => void;
  close: () => void;
}

/** Derive the channel name, honouring an optional #room=<id> hash to pair. */
export function channelName(): string {
  let room = "default";
  if (typeof window !== "undefined") {
    const m = window.location.hash.match(/room=([\w-]+)/);
    if (m) room = m[1];
  }
  return `wavehall-8568:${room}`;
}

/** A small seeded id so we never need Math.random for peer identity. */
function peerIdFrom(seedSalt: number): string {
  let a = (seedSalt ^ 0x8568) >>> 0;
  let s = "";
  for (let i = 0; i < 6; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s += ((t >>> 0) % 36).toString(36);
  }
  return "p_" + s;
}

export function createSync(onMessage: (m: SyncMsg) => void): Sync {
  const peerId = peerIdFrom(Math.floor(performance.now() * 1000) | 0);
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(channelName());
      bc.onmessage = (ev: MessageEvent) => {
        const m = ev.data as SyncMsg;
        if (!m || (m as { peer?: string }).peer === peerId) return;
        onMessage(m);
      };
    }
  } catch {
    bc = null;
  }
  return {
    peerId,
    supported: !!bc,
    send(m: SyncMsg) {
      try {
        bc?.postMessage(m);
      } catch {
        /* channel closed */
      }
    },
    close() {
      try {
        bc?.close();
      } catch {
        /* noop */
      }
      bc = null;
    },
  };
}
