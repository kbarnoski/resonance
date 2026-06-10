// ─────────────────────────────────────────────────────────────────────────────
// decay.ts — the disintegration engine.
//
// This is the heart of the piece. A loop is held as a single mutable
// Float32Array of samples (the "tape"). It is divided into REGIONS. Each region
// carries PERSISTENT decay state that only ever moves toward death:
//
//   survival   1 → 0   how much of the region's content remains (amplitude)
//   cutoff     bright → dark   an accumulating one-pole lowpass corner (Hz)
//   torn       false → true    once a region fully dies, it stays torn open
//
// Each PASS over the loop applies a small, RANDOM, IRREVERSIBLE round of damage:
//   - a few regions lose a slice of survival
//   - bright regions darken (cutoff drops)
//   - dropouts: short windows of samples are permanently zeroed inside the tape
//
// Crucially the damage is written back into the SAMPLE BUFFER itself — once a
// window is zeroed it is gone for every future pass. The survival array and the
// running lowpass are applied to the live buffer too, so the tape genuinely
// erodes. There is no "reset" path. Listening consumes it.
// ─────────────────────────────────────────────────────────────────────────────

export type RegionState = {
  /** 1 = full content, 0 = silent. Monotonically non-increasing. */
  survival: number;
  /** Accumulating one-pole lowpass corner in Hz. Only ever drops. */
  cutoff: number;
  /** Once a region is effectively dead it stays torn (a visible gap). */
  torn: boolean;
  /** Lowpass filter memory for in-place buffer filtering of this region. */
  lpMem: number;
};

export type DecayConfig = {
  sampleRate: number;
  /** Total loop length in samples. */
  length: number;
  /** Number of regions the loop is divided into. */
  regionCount: number;
};

export class DisintegrationTape {
  readonly sampleRate: number;
  readonly length: number;
  readonly regionCount: number;
  /** The living audio. Mutated in place every pass. */
  readonly samples: Float32Array;
  /** Pristine reference (never mutated) — used only to seed re-excitation. */
  private readonly pristine: Float32Array;
  readonly regions: RegionState[];
  /** Number of full passes the loop has lived through. */
  passCount = 0;
  /** Global temporary slow-down of decay (the "hold to remember" gesture). 1 = normal. */
  decayScale = 1;

  constructor(cfg: DecayConfig, source: Float32Array) {
    this.sampleRate = cfg.sampleRate;
    this.length = cfg.length;
    this.regionCount = cfg.regionCount;
    this.samples = new Float32Array(source); // working copy — this is the tape
    this.pristine = new Float32Array(source); // immutable seed
    const startCutoff = Math.min(16000, cfg.sampleRate / 2.2);
    this.regions = Array.from({ length: cfg.regionCount }, () => ({
      survival: 1,
      cutoff: startCutoff,
      torn: false,
      lpMem: 0,
    }));
  }

  private regionBounds(i: number): [number, number] {
    const per = this.length / this.regionCount;
    return [Math.floor(i * per), Math.floor((i + 1) * per)];
  }

  /** Average survival across the whole loop, 1 → 0. Drives the room-tone floor. */
  meanSurvival(): number {
    let s = 0;
    for (const r of this.regions) s += r.survival;
    return s / this.regionCount;
  }

  /** True once almost everything is gone — the true end. */
  isNearlyGone(): boolean {
    return this.meanSurvival() < 0.04;
  }

  /**
   * Apply ONE irreversible pass of damage, then re-render the live buffer so the
   * accumulated state is baked into the actual samples. Called once per loop pass.
   *
   * `rng` lets the caller inject deterministic randomness if desired; defaults to
   * Math.random.
   */
  step(rng: () => number = Math.random): void {
    this.passCount += 1;
    const k = this.decayScale;

    // 1) Pick a handful of regions to wound this pass. Early on damage is gentle
    //    and spread; the loop should still be recognizable for the first minute.
    const wounds = 1 + Math.floor(rng() * 3);
    for (let w = 0; w < wounds; w++) {
      const i = Math.floor(rng() * this.regionCount);
      const r = this.regions[i];
      if (r.survival <= 0) continue;
      // survival bleeds away by a small random amount, scaled by the hold gesture
      const bite = (0.015 + rng() * 0.05) * k;
      r.survival = Math.max(0, r.survival - bite);
      // brightness erodes faster than amplitude — high frequencies die first,
      // exactly like iron-oxide shedding off a tape's high-band.
      r.cutoff = Math.max(180, r.cutoff * (1 - (0.04 + rng() * 0.06) * k));
      if (r.survival < 0.05) r.torn = true;
    }

    // 2) Global slow darkening of every still-living region (entropy everywhere).
    for (const r of this.regions) {
      if (r.survival > 0) {
        r.cutoff = Math.max(180, r.cutoff * (1 - 0.004 * k));
      }
    }

    // 3) Dropouts — permanently zero short random windows in the tape. These are
    //    the audible "holes" that tear open over time. Probability rises as the
    //    loop ages so the back half is full of gaps.
    const dropoutChance = Math.min(0.85, 0.12 + this.passCount * 0.01);
    if (rng() < dropoutChance) {
      const holes = 1 + Math.floor(rng() * 2);
      for (let h = 0; h < holes; h++) {
        const center = Math.floor(rng() * this.length);
        const half = Math.floor(
          (this.sampleRate * (0.004 + rng() * 0.03)) // 4–34 ms windows
        );
        const a = Math.max(0, center - half);
        const b = Math.min(this.length, center + half);
        // soft-edged zeroing so the dropout doesn't click
        for (let s = a; s < b; s++) {
          const edge = Math.min(s - a, b - 1 - s);
          const fade = Math.min(1, edge / 64);
          this.samples[s] *= 1 - fade; // pull toward silence at the core
        }
      }
    }

    // 4) Bake the persistent state into the live buffer: per-region survival gain
    //    and a per-region running lowpass. Because we read AND write `samples`,
    //    the darkening compounds every pass — irreversible by construction.
    for (let i = 0; i < this.regionCount; i++) {
      const r = this.regions[i];
      const [a, b] = this.regionBounds(i);
      // one-pole lowpass coefficient from the region's current cutoff
      const dt = 1 / this.sampleRate;
      const rc = 1 / (2 * Math.PI * r.cutoff);
      const alpha = dt / (rc + dt);
      // apply only a SMALL fraction of the survival drop per pass to the buffer
      // (survival also feeds the playback gain), so amplitude bleeds smoothly.
      const ampBake = 0.985 + 0.015 * r.survival;
      let mem = r.lpMem;
      for (let s = a; s < b; s++) {
        mem = mem + alpha * (this.samples[s] - mem);
        this.samples[s] = mem * ampBake;
      }
      r.lpMem = mem;
    }
  }

  /**
   * The "hold to remember" gesture: briefly slow decay everywhere. It NEVER
   * reverses anything — it only reduces how fast the next passes bite.
   */
  setHold(holding: boolean): void {
    this.decayScale = holding ? 0.35 : 1;
  }

  /**
   * Optional re-excitation: gently bleed a faded region back toward life using
   * the pristine seed — but at a cost: overall decay is nudged faster elsewhere.
   * The listener can shape HOW it dies, never whether. Returns the touched region.
   */
  reExcite(norm: number, rng: () => number = Math.random): number {
    const i = Math.max(
      0,
      Math.min(this.regionCount - 1, Math.floor(norm * this.regionCount))
    );
    const r = this.regions[i];
    // partial, capped revival — can never exceed a faint echo of former life
    const revived = Math.min(0.55, r.survival + 0.18 + rng() * 0.12);
    r.survival = revived;
    r.torn = revived < 0.05;
    r.cutoff = Math.max(r.cutoff, 1200); // a little brightness returns, briefly
    const [a, b] = this.regionBounds(i);
    // re-seed faint pristine content into the (mostly emptied) window
    for (let s = a; s < b; s++) {
      this.samples[s] += this.pristine[s] * 0.35 * revived;
    }
    // the cost: every OTHER region pays a tax — decay accelerates elsewhere.
    for (let j = 0; j < this.regionCount; j++) {
      if (j === i) continue;
      const o = this.regions[j];
      o.survival = Math.max(0, o.survival - 0.02);
      o.cutoff = Math.max(180, o.cutoff * 0.985);
      if (o.survival < 0.05) o.torn = true;
    }
    return i;
  }
}
