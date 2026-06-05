// sync.ts — serverless real-time presence + pitch sharing for the Star Pair.
//
// Lineage: this follows the lab's `319-hub-score` BroadcastChannel pattern —
// no server, no network writes, just same-origin tabs gossiping over a named
// channel. Here it is pared down to exactly what two co-players need: each tab
// broadcasts ITS OWN star's pitch (+ a presence heartbeat) ~3×/sec; the other
// tab renders the friend star from whatever it last heard.

export const CHANNEL_NAME = "resonance-star-pair-341";
export const BROADCAST_MS = 330; // ~3 Hz pitch + heartbeat
export const PEER_TIMEOUT_MS = 3000; // no peer for this long → robot friend

export type StarMsg =
  | { t: "star"; id: string; freq: number; at: number }
  | { t: "bye"; id: string };

export function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function openChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}
