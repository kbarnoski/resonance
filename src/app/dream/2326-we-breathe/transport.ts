// transport.ts — the load-bearing novelty: a REAL cross-context breathing room.
//
// Every open tab/window of this page is a living presence. We gossip presence
// state over a same-origin BroadcastChannel (no server, no fetch, no socket).
// Each presence is a Kuramoto phase-oscillator; presences couple weakly toward
// the collective phase. The order parameter R = |mean(e^{iθ})| over ALL present
// phases is a pure EMERGENT READOUT — there is no master intensity knob.
//
//   • Open this page in a second tab and a genuine second oscillator joins the
//     coupling — often OUT of phase, so R drops and the field fractures before
//     it re-entrains. Fracture is as real as sync.
//   • With few/no real peers we spawn a deterministic seeded chorus (mulberry32
//     @ 0x2326) so a solo reviewer still sees a full, coupling room.
//
// Coupling K is MODEST and FIXED. Nobody is in control of R.

import { mulberry32, DEMO_SEED, hash2 } from "./rng";

export const CHANNEL_NAME = "resonance-we-breathe";
const HEARTBEAT_MS = 120; // gossip cadence
const EVICT_MS = 1500; // drop a remote peer unheard this long
const K = 0.9; // FIXED coupling strength (rad/s). Not a UI dial.
const TWO_PI = Math.PI * 2;
const SYNTH_INITIAL = 5; // seeded chorus size when alone

export type PresenceKind = "self" | "remote" | "synthetic";

export interface Presence {
  id: string;
  kind: PresenceKind;
  phase: number; // 0..2π breath phase (current, extrapolated for remotes)
  rate: number; // Hz — personal resting breath rate
  energy: number; // 0..1 breath amplitude
  hue: number; // 0..1 warm-dawn hue index
  pos: [number, number]; // stable screen placement 0..1
  // remote extrapolation bookkeeping
  reportedPhase: number;
  reportedAt: number;
  lastHeard: number;
  // synthetic retirement fade
  retiring: boolean;
}

export interface Snapshot {
  presences: Presence[]; // self + synthetics + live remotes
  R: number; // collective coherence 0..1 (EMERGENT readout)
  meanPhase: number; // collective breath phase
  meanEnergy: number; // average breath amplitude
  realPeers: number; // live remote count (excludes self + synthetic)
  synthetic: boolean; // true while any synthetic presence is present
  channelOk: boolean; // false => BroadcastChannel unsupported, pure-synth mode
}

interface WirePresence {
  id: string;
  phase: number;
  rate: number;
  energy: number;
  hue: number;
}

/** Warm resting breath rate + warm hue derived from an id (stable per tab). */
function makeAvatar(id: string): { rate: number; hue: number } {
  const [a, b] = hash2(id);
  return { rate: 0.16 + a * 0.12, hue: b }; // 0.16–0.28 Hz, warm hue 0..1
}

export class Room {
  readonly selfId: string;
  private channel: BroadcastChannel | null = null;
  readonly channelOk: boolean;

  private self: Presence;
  private remotes = new Map<string, Presence>();
  private synths: Presence[] = [];

  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private synthRng: () => number;
  private synthDrift: { freq: number; phase: number; base: number }[] = [];

  // self drive
  private selfEnergy = 0.15;

  constructor() {
    this.selfId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "self-" + Math.random().toString(36).slice(2);
    const av = makeAvatar(this.selfId);
    this.self = {
      id: this.selfId,
      kind: "self",
      phase: Math.random() * TWO_PI,
      rate: av.rate,
      energy: 0.15,
      hue: av.hue,
      pos: [0.5, 0.5], // self anchors near centre
      reportedPhase: 0,
      reportedAt: 0,
      lastHeard: 0,
      retiring: false,
    };

    this.channelOk =
      typeof window !== "undefined" && typeof BroadcastChannel !== "undefined";

    // Deterministic seeded chorus.
    this.synthRng = mulberry32(DEMO_SEED);
    this.spawnSynthChorus(SYNTH_INITIAL);
  }

  private spawnSynthChorus(n: number): void {
    for (let i = 0; i < n; i++) {
      const id = `synth-${i}`;
      const rate = 0.15 + this.synthRng() * 0.15; // 0.15–0.30 Hz (a bit wider)
      const hue = this.synthRng();
      const phase = this.synthRng() * TWO_PI;
      const [px, py] = hash2(id);
      this.synths.push({
        id,
        kind: "synthetic",
        phase,
        rate,
        energy: 0.3 + this.synthRng() * 0.4,
        hue,
        pos: [0.12 + px * 0.76, 0.14 + py * 0.72],
        reportedPhase: 0,
        reportedAt: 0,
        lastHeard: 0,
        retiring: false,
      });
      // Slow seeded breath-rate drift so R breathes over ~30s (deterministic).
      this.synthDrift.push({
        freq: 0.02 + this.synthRng() * 0.03,
        phase: this.synthRng() * TWO_PI,
        base: rate,
      });
    }
  }

  start(): void {
    if (!this.channelOk) return;
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (ev: MessageEvent) => this.onWire(ev.data);
    } catch {
      this.channel = null;
    }
    this.hbTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    // Announce immediately so a freshly-opened tab appears fast.
    this.heartbeat();
  }

  private onWire(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const w = data as Partial<WirePresence>;
    if (typeof w.id !== "string" || w.id === this.selfId) return;
    if (
      typeof w.phase !== "number" ||
      typeof w.rate !== "number" ||
      typeof w.energy !== "number" ||
      typeof w.hue !== "number"
    )
      return;
    const now = performance.now();
    const existing = this.remotes.get(w.id);
    if (existing) {
      existing.reportedPhase = w.phase;
      existing.reportedAt = now;
      existing.lastHeard = now;
      existing.rate = w.rate;
      existing.energy = w.energy;
      existing.hue = w.hue;
    } else {
      const [px, py] = hash2(w.id);
      this.remotes.set(w.id, {
        id: w.id,
        kind: "remote",
        phase: w.phase,
        rate: w.rate,
        energy: w.energy,
        hue: w.hue,
        pos: [0.1 + px * 0.8, 0.12 + py * 0.76],
        reportedPhase: w.phase,
        reportedAt: now,
        lastHeard: now,
        retiring: false,
      });
    }
  }

  private heartbeat(): void {
    const now = performance.now();
    // Broadcast our own state.
    if (this.channel) {
      const wire: WirePresence = {
        id: this.selfId,
        phase: this.self.phase % TWO_PI,
        rate: this.self.rate,
        energy: this.self.energy,
        hue: this.self.hue,
      };
      try {
        this.channel.postMessage(wire);
      } catch {
        /* channel torn down mid-flight */
      }
    }
    // Evict stale remotes.
    for (const [id, p] of this.remotes) {
      if (now - p.lastHeard > EVICT_MS) this.remotes.delete(id);
    }
    // Retire synthetics gently as real peers arrive; keep up to 2 ambient.
    const realPeers = this.remotes.size;
    const desired = realPeers === 0 ? SYNTH_INITIAL : Math.min(2, SYNTH_INITIAL);
    let active = this.synths.filter((s) => !s.retiring).length;
    if (active > desired) {
      for (const s of this.synths) {
        if (active <= desired) break;
        if (!s.retiring) {
          s.retiring = true;
          active--;
        }
      }
    } else if (active < desired && realPeers === 0) {
      // A peer left and we're alone again — un-retire to repopulate.
      for (const s of this.synths) {
        if (active >= desired) break;
        if (s.retiring) {
          s.retiring = false;
          active++;
        }
      }
    }
  }

  /** Drive self energy from a smoothed breath envelope (mic or pointer-hold). */
  setSelfEnergy(e: number): void {
    this.selfEnergy = Math.max(0, Math.min(1, e));
  }

  /** Advance all locally-integrated oscillators one step and read out R.
   *  Remotes are NOT integrated here (their own tab owns them); we extrapolate
   *  their phase from their last heartbeat for smooth coupling + display. */
  step(dt: number): Snapshot {
    const now = performance.now();
    const d = Math.min(dt, 0.05); // clamp long frames

    // Ease self energy toward its driven target.
    this.self.energy += (this.selfEnergy - this.self.energy) * Math.min(1, d * 4);

    // Extrapolate remote phases from their last report.
    for (const p of this.remotes.values()) {
      const age = (now - p.reportedAt) / 1000;
      p.phase = p.reportedPhase + TWO_PI * p.rate * age;
    }

    // Apply seeded rate drift to synthetics (deterministic, slow).
    const tSec = now / 1000;
    for (let i = 0; i < this.synths.length; i++) {
      const dr = this.synthDrift[i];
      if (!dr) continue;
      this.synths[i].rate =
        dr.base + 0.025 * Math.sin(TWO_PI * dr.freq * tSec + dr.phase);
      // Retiring synths fade energy to zero, then are removed.
      const s = this.synths[i];
      if (s.retiring) s.energy += (0 - s.energy) * Math.min(1, d * 1.5);
    }
    this.synths = this.synths.filter((s) => !(s.retiring && s.energy < 0.02));

    // Assemble the full population (self + synth + remote) for coupling.
    const all: Presence[] = [this.self, ...this.synths, ...this.remotes.values()];
    const N = all.length;

    // Kuramoto step for the oscillators WE own (self + synthetics). Each couples
    // toward the mean field of ALL present phases.
    const owned: Presence[] = [this.self, ...this.synths];
    for (const p of owned) {
      let coupling = 0;
      for (const q of all) {
        if (q === p) continue;
        coupling += Math.sin(q.phase - p.phase);
      }
      const dtheta = TWO_PI * p.rate + (K / N) * coupling;
      p.phase += dtheta * d;
    }

    // Order parameter R + mean phase over the WHOLE room.
    let sx = 0;
    let sy = 0;
    let eSum = 0;
    for (const p of all) {
      sx += Math.cos(p.phase);
      sy += Math.sin(p.phase);
      eSum += p.energy;
    }
    const R = N > 0 ? Math.hypot(sx, sy) / N : 0;
    const meanPhase = Math.atan2(sy, sx);
    const meanEnergy = N > 0 ? eSum / N : 0;

    return {
      presences: all,
      R,
      meanPhase,
      meanEnergy,
      realPeers: this.remotes.size,
      synthetic: this.synths.length > 0,
      channelOk: this.channelOk,
    };
  }

  dispose(): void {
    if (this.hbTimer !== null) clearInterval(this.hbTimer);
    this.hbTimer = null;
    if (this.channel) {
      try {
        this.channel.onmessage = null;
        this.channel.close();
      } catch {
        /* ignore */
      }
    }
    this.channel = null;
    this.remotes.clear();
    this.synths = [];
  }
}
