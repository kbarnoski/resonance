// Choir of Strangers — presence sync (the control plane).
//
// This is the whole "collaborative" mechanism, and it obeys the 2026 rule for
// real-time music on the web: transmit CONTROL / TIMING events, never audio.
// A BroadcastChannel carries join / heartbeat / leave messages plus each tab's
// claimed voice, the shared tonic, and a slow LFO phase reference. Every tab
// keeps a live roster of peers and synthesizes its own voice locally.
//
// Voice claiming is a tiny star-topology CRDT: each tab claims the lowest free
// scale degree; ties are broken deterministically by peerId (smaller id wins),
// so two tabs that grab the same degree at once converge without a server.

export const CHANNEL_NAME = "resonance/1832-choir-of-strangers";
export const VOICE_COUNT = 6;

const HEARTBEAT_MS = 1800;
const EXPIRY_MS = 6000;

export type Peer = {
  peerId: string;
  voiceIndex: number;
  tonic: number;
  phase: number;
  lastSeen: number;
};

export type RosterSnapshot = {
  selfId: string;
  myVoice: number;
  tonic: number;
  peers: Peer[]; // other tabs only
};

type Msg =
  | { t: "hello"; id: string; v: number; tonic: number; phase: number }
  | { t: "state"; id: string; v: number; tonic: number; phase: number }
  | { t: "leave"; id: string };

function makeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback: time + counter (inside a runtime call, never at module load).
  return `${Date.now().toString(36)}-${Math.floor(
    performance.now() * 1000,
  ).toString(36)}`;
}

/** Shared breathing phase, in turns [0,1). Derived from the WALL CLOCK, which
 *  every tab shares — so the choir breathes in lockstep with zero audio sent. */
export function breathPhase(hz: number): number {
  const p = (Date.now() / 1000) * hz;
  return p - Math.floor(p);
}

export class ChoirSync {
  private channel: BroadcastChannel | null = null;
  private peers = new Map<string, Peer>();
  private beatTimer: number | null = null;
  private onChange: (snap: RosterSnapshot) => void;

  readonly peerId = makeId();
  myVoice = 0;
  tonic: number;

  constructor(tonic: number, onChange: (snap: RosterSnapshot) => void) {
    this.tonic = tonic;
    this.onChange = onChange;
  }

  start(): void {
    if (this.channel) return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    this.channel = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => this.receive(e.data);

    this.myVoice = this.reclaim();
    this.post({
      t: "hello",
      id: this.peerId,
      v: this.myVoice,
      tonic: this.tonic,
      phase: breathPhase(0.075),
    });
    this.emit();

    this.beatTimer = window.setInterval(() => {
      this.prune();
      this.post({
        t: "state",
        id: this.peerId,
        v: this.myVoice,
        tonic: this.tonic,
        phase: breathPhase(0.075),
      });
      this.emit();
    }, HEARTBEAT_MS);
  }

  private post(msg: Msg): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* channel closing */
    }
  }

  private receive(msg: Msg): void {
    if (!msg || msg.id === this.peerId) return;
    if (msg.t === "leave") {
      this.peers.delete(msg.id);
      this.reconcile();
      return;
    }
    // hello or state: record/refresh this peer.
    this.peers.set(msg.id, {
      peerId: msg.id,
      voiceIndex: msg.v,
      tonic: msg.tonic,
      phase: msg.phase,
      lastSeen: Date.now(),
    });
    // A newcomer's "hello" gets an immediate reply so it learns the roster fast.
    if (msg.t === "hello") {
      this.post({
        t: "state",
        id: this.peerId,
        v: this.myVoice,
        tonic: this.tonic,
        phase: breathPhase(0.075),
      });
    }
    this.reconcile();
  }

  /** Re-run claiming; if our voice changed, announce and notify. */
  private reconcile(): void {
    const before = this.myVoice;
    this.myVoice = this.reclaim();
    if (this.myVoice !== before) {
      this.post({
        t: "state",
        id: this.peerId,
        v: this.myVoice,
        tonic: this.tonic,
        phase: breathPhase(0.075),
      });
    }
    this.emit();
  }

  /** Lowest free scale degree; yield ours only to a strictly-smaller peerId. */
  private reclaim(): number {
    const held = new Map<number, string>(); // voice -> smallest peerId holding it
    for (const p of this.peers.values()) {
      const cur = held.get(p.voiceIndex);
      if (cur === undefined || p.peerId < cur) held.set(p.voiceIndex, p.peerId);
    }
    const owner = held.get(this.myVoice);
    const mustYield = owner !== undefined && owner < this.peerId;
    if (!mustYield) return this.myVoice;
    for (let i = 0; i < VOICE_COUNT; i++) {
      if (!held.has(i)) return i;
    }
    // More tabs than voices: double up on the last degree (unison reinforcement).
    return VOICE_COUNT - 1;
  }

  private prune(): void {
    const cutoff = Date.now() - EXPIRY_MS;
    let dropped = false;
    for (const [id, p] of this.peers) {
      if (p.lastSeen < cutoff) {
        this.peers.delete(id);
        dropped = true;
      }
    }
    if (dropped) this.reconcile();
  }

  private emit(): void {
    this.onChange({
      selfId: this.peerId,
      myVoice: this.myVoice,
      tonic: this.tonic,
      peers: [...this.peers.values()],
    });
  }

  stop(): void {
    if (this.beatTimer !== null) window.clearInterval(this.beatTimer);
    this.beatTimer = null;
    this.post({ t: "leave", id: this.peerId });
    try {
      this.channel?.close();
    } catch {
      /* noop */
    }
    this.channel = null;
    this.peers.clear();
  }
}
