// ─────────────────────────────────────────────────────────────────────────────
// 14128-choirtabs · clock.ts — the zero-server ensemble transport + shared clock.
//
//   THE MODEL (synchronized local-engine, not shared-instance): every open tab
//   runs its OWN Web Audio graph and plays the WHOLE choir locally. Tabs never
//   stream audio to each other — they exchange only tiny state (who is present,
//   each voice's chosen track + canon delay, transport, clock ticks) over the
//   browser's BroadcastChannel (same-origin, same-browser, NO server, NO WebRTC).
//   What keeps every local engine phase-locked is a shared clock.
//
//   THE SHARED CLOCK (leader-elected): the tab with the lowest id is, by unanimous
//   agreement, the LEADER. It owns the master tempo and broadcasts periodic "tick"
//   messages carrying the continuous beat position. Followers treat a tick's
//   ARRIVAL as "the beat is this value right now" — BroadcastChannel delivery on one
//   device is effectively instantaneous — and extrapolate locally between ticks off
//   performance.now(). Drop a tick and a follower free-runs at the same tempo until
//   the next one, so the clock degrades softly instead of stalling.
//
//   Leadership is emergent and self-healing: close the leader's tab and the new
//   lowest id simply starts ticking, carrying its already-tracking beat forward.
// ─────────────────────────────────────────────────────────────────────────────

/** The single shared channel named in the brief. Same-origin, same-browser. */
const CHANNEL = "choirtabs";

// ── Musical grid (shared by clock, engine, and visuals) ──────────────────────
export const BPM = 72;
export const BEATS_PER_BAR = 4;
export const LOOP_BARS = 4; // the looping phrase every voice sings
export const LOOP_BEATS = LOOP_BARS * BEATS_PER_BAR; // 16
export const BEAT_DUR_SEC = 60 / BPM; // 0.8333…

const TICK_MS = 200; // leader clock-sync cadence
const HEARTBEAT_MS = 1000; // presence refresh cadence
const PEER_TIMEOUT_MS = 3600; // drop a peer unheard-from this long

export interface PeerVoice {
  id: string;
  trackId: string;
  delayBars: number;
  lastSeen: number; // performance.now() ms
}

type Msg =
  | { t: "hello"; from: string }
  | { t: "voice"; from: string; trackId: string; delayBars: number }
  | { t: "tick"; from: string; beat: number; playing: boolean }
  | { t: "transport"; from: string; playing: boolean }
  | { t: "bye"; from: string };

/** A probabilistically-unique per-tab id. Uses crypto when present (never the
 *  platform RNG or the epoch clock); falls back to a performance.now()-seeded
 *  counter. This is the one sanctioned use of a clock — for identity only. */
function makeId(): string {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  if (g.crypto?.getRandomValues) {
    const a = new Uint32Array(2);
    g.crypto.getRandomValues(a);
    return (
      a[0].toString(36).padStart(7, "0") + a[1].toString(36).padStart(7, "0")
    );
  }
  makeId.n = (makeId.n + 1) | 0;
  const p = Math.floor(performance.now() * 1000) >>> 0;
  return "f" + p.toString(36) + makeId.n.toString(36);
}
makeId.n = 0;

export class Choir {
  readonly id: string;
  /** False when BroadcastChannel is unavailable — the choir still runs solo. */
  readonly available: boolean;

  private channel: BroadcastChannel | null = null;
  private readonly peers = new Map<string, PeerVoice>();

  // Self voice params (this tab's slot in the canon).
  private selfTrackId: string;
  private selfDelayBars: number;

  // Shared transport.
  private playing = false;

  // Continuous-beat anchor: beat === beatAnchorValue at performance-time
  // beatAnchorPerf, advancing one beat per BEAT_DUR_SEC thereafter.
  private beatAnchorPerf: number;
  private beatAnchorValue = 0;

  private lastTick = 0;
  private lastBeat = 0; // last heartbeat send

  constructor(defaultTrackId: string, defaultDelayBars: number) {
    this.id = makeId();
    this.selfTrackId = defaultTrackId;
    this.selfDelayBars = defaultDelayBars;
    this.beatAnchorPerf = performance.now();
    this.lastBeat = this.beatAnchorPerf;

    let ok = false;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(CHANNEL);
        this.channel.onmessage = (e: MessageEvent) =>
          this.receive(e.data as Msg);
        ok = true;
        this.post({ t: "hello", from: this.id });
        this.announceVoice();
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

  private announceVoice(): void {
    this.post({
      t: "voice",
      from: this.id,
      trackId: this.selfTrackId,
      delayBars: this.selfDelayBars,
    });
  }

  private receive(m: Msg): void {
    if (!m || m.from === this.id) return;
    const now = performance.now();
    switch (m.t) {
      case "hello": {
        this.touch(m.from, now);
        // Greet the newcomer: hand it our voice and, if we lead, an immediate
        // tick so it locks onto the clock without waiting.
        this.announceVoice();
        if (this.isLeader())
          this.post({
            t: "tick",
            from: this.id,
            beat: this.getContinuousBeat(now),
            playing: this.playing,
          });
        break;
      }
      case "voice": {
        const p = this.touch(m.from, now);
        p.trackId = m.trackId;
        p.delayBars = m.delayBars;
        break;
      }
      case "tick": {
        this.touch(m.from, now);
        // Accept the clock only from the elected leader. A tick means "the beat
        // is this value right now": re-anchor locally so we extrapolate from it.
        if (m.from === this.leaderId()) {
          this.beatAnchorPerf = now;
          this.beatAnchorValue = m.beat;
          this.playing = m.playing;
        }
        break;
      }
      case "transport": {
        this.touch(m.from, now);
        this.playing = m.playing;
        // The leader owns the beat: when transport starts, reset to a clean
        // downbeat so every voice's canon entry lines up.
        if (m.playing && this.isLeader()) {
          this.beatAnchorPerf = now;
          this.beatAnchorValue = 0;
        }
        break;
      }
      case "bye":
        this.peers.delete(m.from);
        break;
    }
  }

  private touch(id: string, now: number): PeerVoice {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, trackId: this.selfTrackId, delayBars: 0, lastSeen: now };
      this.peers.set(id, p);
    } else {
      p.lastSeen = now;
    }
    return p;
  }

  /** Lowest id among self + live peers — the leader by unanimous agreement. */
  private leaderId(): string {
    let min = this.id;
    for (const id of this.peers.keys()) if (id < min) min = id;
    return min;
  }

  isLeader(): boolean {
    return this.leaderId() === this.id;
  }

  getLeaderId(): string {
    return this.leaderId();
  }

  /** Advance presence bookkeeping and, if leading, emit clock ticks. */
  update(now: number): void {
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > PEER_TIMEOUT_MS) this.peers.delete(id);
    }

    if (this.isLeader() && now - this.lastTick >= TICK_MS) {
      this.lastTick = now;
      this.post({
        t: "tick",
        from: this.id,
        beat: this.getContinuousBeat(now),
        playing: this.playing,
      });
    }

    if (now - this.lastBeat >= HEARTBEAT_MS) {
      this.lastBeat = now;
      this.announceVoice();
    }
  }

  /** Continuous shared beat position (bars*beats + beat + fraction). */
  getContinuousBeat(now: number): number {
    return (
      this.beatAnchorValue + (now - this.beatAnchorPerf) / 1000 / BEAT_DUR_SEC
    );
  }

  getPlaying(): boolean {
    return this.playing;
  }

  /** Toggle the shared transport (any tab may drive it). */
  setPlaying(v: number | boolean, now: number): void {
    const on = !!v;
    this.playing = on;
    if (on) {
      // Snap to a clean downbeat locally for a crisp start; the leader's ticks
      // become the authority a moment later.
      this.beatAnchorPerf = now;
      this.beatAnchorValue = 0;
    }
    this.post({ t: "transport", from: this.id, playing: on });
  }

  setSelfVoice(trackId: string, delayBars: number): void {
    this.selfTrackId = trackId;
    this.selfDelayBars = delayBars;
    this.announceVoice();
  }

  getSelfVoice(): { id: string; trackId: string; delayBars: number } {
    return {
      id: this.id,
      trackId: this.selfTrackId,
      delayBars: this.selfDelayBars,
    };
  }

  getPeerVoices(): PeerVoice[] {
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
