// ─────────────────────────────────────────────────────────────────────────────
// 14336 · tidalstrata — the two-timescale generative engine.
//
// SLOW process (form scaffold, one move every ~30–75 s): a Markov-ish state walk
// over WHICH of Karel's tracks are foregrounded as STRATA (up to 4 at once), a
// rising/falling "sea level" over the ~10-minute arc, and a slowly re-targeted
// "spectral prism" (a peaking filter whose center drifts) on each stratum.
//
// FAST process (per-frame): smooth interpolation of every gain + filter param via
// setTargetAtTime, plus per-stratum spectral energy read for the visuals. Nothing
// clicks; the mass is liquid at the sample scale.
//
// MEMORY: a retired stratum is not stopped — it becomes a faint, heavily lowpassed
// RESIDUE that persists in the background and can RESURFACE minutes later when the
// slow walk recalls it. The engine keeps a log of every layer it has passed.
//
// Every sound is one of Karel's REAL recordings, looped + filtered + gain-shaped.
// Zero oscillators. Every chain terminates at safeMaster's input.
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer, type WelcomeHomeTrack } from "../_shared/welcomeHome";

export const TOTAL_SECONDS = 600; // ~10-minute geological arc
const MAX_ACTIVE = 4;
const MAX_RESIDUE = 3;
const ACTIVE_BASE = 0.5; // equal-power scale: per-stratum level = BASE / sqrt(n)
const RESIDUE_LEVEL = 0.05;

export type StratumPhase = "rising" | "held" | "residue";

export interface StratumView {
  trackId: string;
  title: string;
  hue: number;
  sat: number;
  phase: StratumPhase;
  gain: number; // smoothed 0..1 (from the live AudioParam)
  energy: number; // smoothed spectral energy 0..1
  bornAt: number; // elapsed seconds at (most recent) recruitment
  slot: number; // stable stacking order
}

export interface MemoryEntry {
  title: string;
  hue: number;
  at: number; // elapsed seconds
  event: "surfaced" | "buried" | "resurfaced" | "lost";
}

interface Stratum {
  track: WelcomeHomeTrack;
  hue: number;
  sat: number;
  src: AudioBufferSourceNode;
  filt: BiquadFilterNode;
  gain: GainNode;
  analyser: AnalyserNode;
  bins: Uint8Array<ArrayBuffer>;
  phase: StratumPhase;
  slot: number;
  bornAt: number;
  targetGain: number;
  energy: number;
  // spectral prism
  prismBase: number; // Hz
  prismTarget: number; // Hz (slow-process re-targets this)
  lfoPhase: number;
  lfoRate: number; // rad/s
  lfoDepth: number; // octaves
}

// earthy per-track palette — ochre / umber / sand / clay (hue 16..48).
function pickTone(i: number): { hue: number; sat: number } {
  const hue = 16 + ((i * 47) % 33); // spread across the warm band
  const sat = 34 + ((i * 29) % 26); // 34..60
  return { hue, sat };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// The 10-minute arc: how many strata "want" to be active at a given moment.
// Starts sparse, swells toward the middle, resolves back down near the end.
export function seaArc(elapsed: number): number {
  const p = clamp(elapsed / TOTAL_SECONDS, 0, 1);
  const swell = Math.pow(Math.sin(Math.PI * p), 0.7); // 0..1, peak mid
  return 1 + swell * 3; // 1..4
}

export class StrataEngine {
  private ctx: AudioContext;
  private dest: AudioNode;
  private tracks: readonly WelcomeHomeTrack[];
  private pool: WelcomeHomeTrack[]; // not-yet-used shuffle
  private cache = new Map<string, AudioBuffer>();
  private dead = new Set<string>(); // tracks whose buffer failed to load
  private strata: Stratum[] = [];
  private log: MemoryEntry[] = [];
  private slotSeq = 0;
  private startTime = 0;
  private lastFrame = 0;
  private nextTickAt = 6; // first slow move a few seconds in
  private seaOffset = 0; // keyboard nudge to sea level
  private prismShift = 0; // keyboard warm/cool: freq multiplier = 2^prismShift
  private disposed = false;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    tracks: readonly WelcomeHomeTrack[],
  ) {
    this.ctx = ctx;
    this.dest = dest;
    this.tracks = tracks;
    this.pool = shuffle(tracks.slice());
  }

  async begin(): Promise<void> {
    this.startTime = this.ctx.currentTime;
    this.lastFrame = this.startTime;
    // Seed the landmass with the first stratum right away (fast first sound),
    // then grow a second in the background so start never blocks on all loads.
    await this.recruitFresh("surfaced");
    void this.recruitFresh("surfaced");
  }

  get elapsed(): number {
    return this.ctx.currentTime - this.startTime;
  }

  get prismShiftValue(): number {
    return this.prismShift;
  }

  get seaOffsetValue(): number {
    return this.seaOffset;
  }

  memory(): MemoryEntry[] {
    return this.log;
  }

  nudgeSea(dir: 1 | -1): void {
    this.seaOffset = clamp(this.seaOffset + dir, -2, 2);
  }

  nudgePrism(dir: 1 | -1): void {
    this.prismShift = clamp(this.prismShift + dir * 0.25, -2, 2);
  }

  // ── buffer loading (lazy + cached) ──────────────────────────────────────────
  private async load(track: WelcomeHomeTrack): Promise<AudioBuffer | null> {
    const hit = this.cache.get(track.id);
    if (hit) return hit;
    try {
      const { buffer } = await loadRealTrackBuffer(this.ctx, track.id);
      this.cache.set(track.id, buffer);
      return buffer;
    } catch {
      // Drop the failed track from every future pool and continue.
      this.dead.add(track.id);
      this.pool = this.pool.filter((t) => t.id !== track.id);
      return null;
    }
  }

  private makeStratum(track: WelcomeHomeTrack, buffer: AudioBuffer): Stratum {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = "peaking";
    const base = 240 + Math.random() * 1100; // 240..1340 Hz prism center
    filt.frequency.value = base;
    filt.Q.value = 1.0;
    filt.gain.value = 7.5; // emphasis, not a hard band-limit

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;

    src.connect(filt);
    filt.connect(gain);
    gain.connect(analyser); // visual tap
    gain.connect(this.dest); // audible path → safeMaster.input
    // random loop offset so simultaneous strata don't phase-lock
    src.start(ctx.currentTime, Math.random() * Math.min(buffer.duration, 30));

    const tone = pickTone(this.slotSeq);
    return {
      track,
      hue: tone.hue,
      sat: tone.sat,
      src,
      filt,
      gain,
      analyser,
      bins: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      phase: "rising",
      slot: this.slotSeq++,
      bornAt: this.elapsed,
      targetGain: 0,
      energy: 0,
      prismBase: base,
      prismTarget: base,
      lfoPhase: Math.random() * Math.PI * 2,
      lfoRate: (Math.PI * 2) / (40 + Math.random() * 50), // 40..90 s period
      lfoDepth: 0.28 + Math.random() * 0.22, // ±octaves
    };
  }

  private async recruitFresh(event: MemoryEntry["event"]): Promise<void> {
    if (this.disposed) return;
    const inUse = new Set(this.strata.map((s) => s.track.id));
    const fromPool = this.pool.find(
      (t) => !inUse.has(t.id) && !this.dead.has(t.id),
    );
    let track: WelcomeHomeTrack;
    if (fromPool) {
      track = fromPool;
      this.pool = this.pool.filter((t) => t.id !== fromPool.id);
    } else {
      // pool exhausted — refill from any live track not currently sounding
      const spare = this.tracks.filter(
        (t) => !inUse.has(t.id) && !this.dead.has(t.id),
      );
      if (spare.length === 0) return;
      track = spare[Math.floor(Math.random() * spare.length)];
    }
    const buffer = await this.load(track);
    if (!buffer || this.disposed) return;
    const st = this.makeStratum(track, buffer);
    this.strata.push(st);
    this.log.push({ title: track.title, hue: st.hue, at: this.elapsed, event });
  }

  private promoteResidue(): boolean {
    const residues = this.strata.filter((s) => s.phase === "residue");
    if (residues.length === 0) return false;
    const st = residues[Math.floor(Math.random() * residues.length)];
    st.phase = "rising";
    st.filt.type = "peaking";
    st.filt.gain.setTargetAtTime(7.5, this.ctx.currentTime, 1.5);
    st.prismBase = 240 + Math.random() * 1100;
    st.prismTarget = st.prismBase;
    st.bornAt = this.elapsed;
    this.log.push({
      title: st.track.title,
      hue: st.hue,
      at: this.elapsed,
      event: "resurfaced",
    });
    return true;
  }

  private bury(st: Stratum): void {
    st.phase = "residue";
    st.filt.type = "lowpass";
    st.filt.frequency.setTargetAtTime(320, this.ctx.currentTime, 4);
    st.filt.Q.setTargetAtTime(0.7, this.ctx.currentTime, 2);
    this.log.push({
      title: st.track.title,
      hue: st.hue,
      at: this.elapsed,
      event: "buried",
    });
    this.enforceResidueCap();
  }

  private enforceResidueCap(): void {
    const residues = this.strata.filter((s) => s.phase === "residue");
    if (residues.length <= MAX_RESIDUE) return;
    // Lose the oldest residue entirely (bounded node count).
    residues.sort((a, b) => a.bornAt - b.bornAt);
    const lost = residues[0];
    this.stopStratum(lost);
    this.strata = this.strata.filter((s) => s !== lost);
    this.log.push({
      title: lost.track.title,
      hue: lost.hue,
      at: this.elapsed,
      event: "lost",
    });
  }

  private stopStratum(st: Stratum): void {
    try {
      st.src.stop();
    } catch {
      /* already stopped */
    }
    try {
      st.src.disconnect();
      st.filt.disconnect();
      st.gain.disconnect();
      st.analyser.disconnect();
    } catch {
      /* ctx closing */
    }
  }

  // ── SLOW process: one structural move ───────────────────────────────────────
  private tick(): void {
    const active = this.strata.filter(
      (s) => s.phase === "rising" || s.phase === "held",
    );
    const desired = clamp(
      Math.round(seaArc(this.elapsed)) + this.seaOffset,
      1,
      MAX_ACTIVE,
    );

    if (active.length < desired) {
      // recall a buried layer ~45% of the time, else surface a fresh track
      if (Math.random() < 0.45 && this.promoteResidue()) {
        /* resurfaced */
      } else {
        void this.recruitFresh("surfaced");
      }
    } else if (active.length > desired) {
      // bury the quietest active stratum into residue memory
      active.sort((a, b) => a.gain.gain.value - b.gain.gain.value);
      this.bury(active[0]);
    }

    // Spectral reshaping: slowly re-target a held stratum's prism center, so the
    // harmonic emphasis of the whole mass migrates over minutes.
    const held = this.strata.filter((s) => s.phase === "held");
    if (held.length > 0 && Math.random() < 0.7) {
      const s = held[Math.floor(Math.random() * held.length)];
      s.prismTarget = 220 + Math.random() * 1400;
    }

    this.nextTickAt = this.elapsed + 30 + Math.random() * 45; // 30..75 s
  }

  // ── FAST process: per-frame smoothing + energy read ─────────────────────────
  frame(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dt = Math.max(0, Math.min(0.1, now - this.lastFrame));
    this.lastFrame = now;
    const el = this.elapsed;

    if (el >= this.nextTickAt) this.tick();

    const activeCount = this.strata.filter(
      (s) => s.phase === "rising" || s.phase === "held",
    ).length;
    const level = ACTIVE_BASE / Math.sqrt(Math.max(1, activeCount));
    const prismMul = Math.pow(2, this.prismShift);

    for (const s of this.strata) {
      // target gain by phase
      if (s.phase === "residue") s.targetGain = RESIDUE_LEVEL;
      else s.targetGain = level;

      // slow, click-free gain glide (geological fades)
      s.gain.gain.setTargetAtTime(s.targetGain, now, 3.2);

      // settle rising → held once it has essentially arrived
      if (s.phase === "rising" && s.gain.gain.value > s.targetGain * 0.85) {
        s.phase = "held";
      }

      // prism drift (fast LFO around a slowly re-targeted base) — active only
      if (s.phase !== "residue") {
        s.lfoPhase += s.lfoRate * dt;
        s.prismBase += (s.prismTarget - s.prismBase) * Math.min(1, dt / 8);
        const octaves = Math.sin(s.lfoPhase) * s.lfoDepth;
        const center = clamp(
          s.prismBase * Math.pow(2, octaves) * prismMul,
          90,
          6000,
        );
        s.filt.frequency.setTargetAtTime(center, now, 0.2);
      }

      // spectral energy for the visuals
      s.analyser.getByteFrequencyData(s.bins);
      let sum = 0;
      const n = Math.floor(s.bins.length * 0.7);
      for (let i = 0; i < n; i++) sum += s.bins[i];
      const e = sum / (n * 255);
      s.energy += (e - s.energy) * 0.2;
    }
  }

  // ── snapshot for rendering ──────────────────────────────────────────────────
  view(): StratumView[] {
    return this.strata.map((s) => ({
      trackId: s.track.id,
      title: s.track.title,
      hue: s.hue,
      sat: s.sat,
      phase: s.phase,
      gain: s.gain.gain.value,
      energy: s.energy,
      bornAt: s.bornAt,
      slot: s.slot,
    }));
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.strata) this.stopStratum(s);
    this.strata = [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
