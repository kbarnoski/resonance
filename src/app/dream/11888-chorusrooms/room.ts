// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms · room.ts — the zero-server ensemble transport + shared clock.
//
//   THE MODEL (synchronized local-engine, not shared-instance): every open tab
//   runs its OWN Web Audio graph and renders the WHOLE ensemble locally. Tabs never
//   stream audio to each other — they exchange only tiny state messages over the
//   browser's BroadcastChannel (same-origin, same-device, NO server, NO WebRTC,
//   NO signaling). What keeps the local engines phase-locked is a shared clock.
//
//   THE SHARED CLOCK (leader-elected): every tab keeps a local bar phase advancing
//   at a fixed tempo off performance.now() (never the wall clock). The tab with the
//   lowest id is, by unanimous agreement, the CONDUCTOR; on each bar wrap it
//   broadcasts a "downbeat". BroadcastChannel delivery on one device is effectively
//   instantaneous, so every follower treats a downbeat's arrival as "phase ≈ 0 now"
//   and gently nudges its local phase into agreement. Miss a downbeat and the tab
//   free-runs at the same tempo until the next one — so it degrades softly.
//
//   Leadership is emergent and self-healing: close the conductor's tab and the new
//   lowest id simply starts emitting downbeats. Everyone hears the same bar.
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL = "resonance-11888-chorusrooms";

/** One shared bar = a slow ambient canon cycle. */
export const BAR_MS = 7000;

const HEARTBEAT_MS = 1000; // liveness + pointer refresh cadence
const POINTER_MIN_MS = 60; // throttle for pointer-driven sends
const PEER_TIMEOUT_MS = 3600; // drop a peer unheard-from for this long

interface PeerState {
  id: string;
  px: number;
  py: number;
  lastSeen: number; // performance.now() ms
}

type Msg =
  | { t: "hello"; from: string }
  | { t: "state"; from: string; px: number; py: number }
  | { t: "downbeat"; from: string; bar: number }
  | { t: "bye"; from: string };

/** A probabilistically-unique per-tab id. Uses crypto when present (never the
 *  platform RNG or epoch clock); falls back to a performance.now()-seeded counter. */
function makeId(): string {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) {
    const a = new Uint32Array(2);
    g.crypto.getRandomValues(a);
    return a[0].toString(36).padStart(7, "0") + a[1].toString(36).padStart(7, "0");
  }
  // Deterministic-safe fallback: performance.now() bits + a module counter.
  makeId.n = (makeId.n + 1) | 0;
  const p = Math.floor(performance.now() * 1000) >>> 0;
  return "f" + p.toString(36) + makeId.n.toString(36);
}
makeId.n = 0;

export class Room {
  readonly id: string;
  /** False when BroadcastChannel is unavailable — the room still runs solo. */
  readonly available: boolean;

  private channel: BroadcastChannel | null = null;
  private readonly peers = new Map<string, PeerState>();
  private readonly self = { px: 0.5, py: 0.45 };

  private barStart: number; // performance.now() ms of the current bar's phase 0
  private bar = 0;
  private lastBeat = 0; // last heartbeat send
  private lastPointer = 0; // last pointer send
  private pointerDirty = false;

  constructor() {
    this.id = makeId();
    this.barStart = performance.now();
    this.lastBeat = this.barStart;
    let ok = false;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(CHANNEL);
        this.channel.onmessage = (e: MessageEvent) => this.receive(e.data as Msg);
        ok = true;
        this.post({ t: "hello", from: this.id });
      }
    } catch {
      this.channel = null;
      ok = false;
    }
    this.available = ok;
  }

  private post(m: Msg): void {
    try {
      this.channel?.postMessage(m);
    } catch {
      /* channel closing — ignore */
    }
  }

  private receive(m: Msg): void {
    if (!m || m.from === this.id) return;
    const now = performance.now();
    switch (m.t) {
      case "hello": {
        this.touch(m.from, now);
        // Greet the newcomer so it learns us immediately; if we conduct, hand it
        // the downbeat so it can lock on without waiting a whole bar.
        this.post({ t: "state", from: this.id, px: this.self.px, py: this.self.py });
        if (this.isLeader()) this.post({ t: "downbeat", from: this.id, bar: this.bar });
        break;
      }
      case "state": {
        const p = this.touch(m.from, now);
        p.px = m.px;
        p.py = m.py;
        break;
      }
      case "downbeat": {
        this.touch(m.from, now);
        // Accept the clock only from the elected conductor (lowest id). A downbeat
        // means "phase 0 right now": nudge our local bar-start toward this instant.
        if (m.from === this.leaderId() && m.from !== this.id) {
          this.barStart += (now - this.barStart) * 0.34;
          this.bar = m.bar;
        }
        break;
      }
      case "bye":
        this.peers.delete(m.from);
        break;
    }
  }

  private touch(id: string, now: number): PeerState {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, px: 0.5, py: 0.45, lastSeen: now };
      this.peers.set(id, p);
    } else {
      p.lastSeen = now;
    }
    return p;
  }

  /** Lowest id among self + live peers — the conductor by unanimous agreement. */
  private leaderId(): string {
    let min = this.id;
    for (const id of this.peers.keys()) if (id < min) min = id;
    return min;
  }

  isLeader(): boolean {
    return this.leaderId() === this.id;
  }

  /** Id of the current conductor (lowest id among self + live peers). */
  getLeaderId(): string {
    return this.leaderId();
  }

  /** Advance the shared clock, cull dead peers, emit heartbeats/downbeats. */
  update(now: number): void {
    // Cull silent peers.
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > PEER_TIMEOUT_MS) this.peers.delete(id);
    }

    // Advance bars. The conductor announces each wrap; followers free-run.
    const leading = this.isLeader();
    let guard = 0;
    while (now - this.barStart >= BAR_MS && guard++ < 64) {
      this.barStart += BAR_MS;
      this.bar++;
      if (leading) this.post({ t: "downbeat", from: this.id, bar: this.bar });
    }

    // Heartbeat (liveness + pointer), with a faster path while the pointer moves.
    const due = now - this.lastBeat >= HEARTBEAT_MS;
    const moved = this.pointerDirty && now - this.lastPointer >= POINTER_MIN_MS;
    if (due || moved) {
      this.post({ t: "state", from: this.id, px: this.self.px, py: this.self.py });
      this.lastBeat = now;
      this.lastPointer = now;
      this.pointerDirty = false;
    }
  }

  /** Current shared bar phase in [0,1). Safe to call between updates. */
  getPhase(now: number): number {
    const p = (now - this.barStart) / BAR_MS;
    return p - Math.floor(p);
  }

  getBar(): number {
    return this.bar;
  }

  setPointer(x: number, y: number): void {
    this.self.px = x;
    this.self.py = y;
    this.pointerDirty = true;
  }

  getSelf(): { id: string; px: number; py: number } {
    return { id: this.id, px: this.self.px, py: this.self.py };
  }

  getPeers(): PeerState[] {
    return [...this.peers.values()];
  }

  close(): void {
    this.post({ t: "bye", from: this.id });
    try {
      this.channel?.close();
    } catch {
      /* already closed */
    }
    this.channel = null;
    this.peers.clear();
  }
}
