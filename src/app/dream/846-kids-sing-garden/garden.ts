// Emergent phyllotaxis growth field.
//
// Technique (lightweight Keller-Segel-flavoured phyllotaxis, arXiv 2509.06498):
// the golden-angle spiral is NOT hardcoded. Instead we maintain a growth front
// at a radius that slowly expands; each new growth site is deposited in the
// LARGEST ANGULAR GAP currently on the front, and an inhibition field damps
// sites that fall too close to existing ones. Repeatedly filling the largest
// gap self-organizes the angular increment toward the golden angle (~137.5deg)
// and produces a sunflower-head spiral that the child grows into being.
//
// Vogel's (1979) closed-form sunflower head (r = c*sqrt(n), theta = n*137.5deg)
// is the baseline this emergent process converges toward.

export interface GrowthSite {
  // polar position on the field
  angle: number; // radians
  radius: number; // 0..1 normalized
  // visual / audio
  hue: number; // 0..1
  bornAt: number; // seconds
  vigor: number; // 0..1 drives bloom size & brightness
  freq: number; // pentatonic freq this site sings
  // animated bloom pulse [0..1], decays over time
  pulse: number;
  seed: number; // per-site random for sway phase
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5deg, for reference only

export class GardenField {
  sites: GrowthSite[] = [];
  // growth front
  frontRadius = 0.06;
  maxRadius = 0.98;
  // angles currently occupied on the (recent) front, kept sorted
  private frontAngles: number[] = [];
  // inhibition: minimum angular separation, shrinks as the head fills
  private minSep = 0.9;
  // a small running bias so the emergent angle settles smoothly
  private lastAngle = Math.random() * Math.PI * 2;

  readonly maxSites: number;

  constructor(maxSites = 4000) {
    this.maxSites = maxSites;
  }

  get count(): number {
    return this.sites.length;
  }

  // Find the largest angular gap on the current front and return an angle
  // placed at its centre. This is the core self-organizing rule.
  private largestGapAngle(): number {
    const a = this.frontAngles;
    if (a.length === 0) {
      return this.lastAngle;
    }
    if (a.length === 1) {
      return a[0] + Math.PI; // opposite side
    }
    const sorted = [...a].sort((x, y) => x - y);
    let bestGap = -1;
    let bestMid = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + Math.PI * 2;
      const gap = next - cur;
      if (gap > bestGap) {
        bestGap = gap;
        bestMid = cur + gap / 2;
      }
    }
    return ((bestMid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  // Deposit a new growth site fed by a sung note.
  // pitchNorm 0..1 (low->high), level 0..1 (loudness), now in seconds.
  // Returns the created site (or null if the head is full).
  growSite(
    pitchNorm: number,
    level: number,
    freq: number,
    now: number,
  ): GrowthSite | null {
    if (this.sites.length >= this.maxSites) return null;

    const angle = this.largestGapAngle();

    // Inhibition: if too close to an existing front angle, nudge away.
    let placed = angle;
    for (const fa of this.frontAngles) {
      let diff = Math.abs(placed - fa);
      diff = Math.min(diff, Math.PI * 2 - diff);
      if (diff < this.minSep) {
        placed += this.minSep; // push into freer space
      }
    }
    placed = ((placed % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Radius: site is born at the front; loud notes push the front out faster.
    const radius = Math.min(this.maxRadius, this.frontRadius);

    // Hue from pitch: low = warm rose/gold, high = cool sky/violet.
    // warm gold ~0.10 -> cool violet ~0.78
    const hue = 0.10 + pitchNorm * 0.68;

    const site: GrowthSite = {
      angle: placed,
      radius,
      hue,
      bornAt: now,
      vigor: 0.4 + level * 0.6,
      freq,
      pulse: 1.0,
      seed: Math.random() * Math.PI * 2,
    };
    this.sites.push(site);

    // Update front bookkeeping.
    this.frontAngles.push(placed);
    if (this.frontAngles.length > 24) this.frontAngles.shift();
    this.lastAngle = placed;

    // Advance the growth front; louder => more vigorous expansion.
    const advance = 0.012 + level * 0.03;
    this.frontRadius = Math.min(this.maxRadius, this.frontRadius + advance);

    // As the head fills, inhibition relaxes so the spiral packs tighter.
    this.minSep = Math.max(0.18, this.minSep * 0.985);

    return site;
  }

  // Autonomous self-organizing growth even when the child is quiet:
  // the front keeps creeping and occasionally seeds a faint site, and
  // existing pulses decay. Long-form: richer at minute 5 than minute 1.
  step(dt: number, now: number, quiet: boolean): GrowthSite | null {
    // decay pulses
    for (const s of this.sites) {
      s.pulse *= Math.pow(0.5, dt / 0.9); // ~0.9s halving
    }

    let spawned: GrowthSite | null = null;
    if (quiet && this.sites.length < this.maxSites) {
      // slow ambient growth: seed roughly every ~1.6s of quiet
      this.ambientTimer += dt;
      if (this.ambientTimer > 1.6) {
        this.ambientTimer = 0;
        // ambient sites are gentle and reuse a nearby grown hue
        const ref = this.sites.length
          ? this.sites[Math.floor(Math.random() * this.sites.length)]
          : null;
        const pitchNorm = ref ? (ref.hue - 0.1) / 0.68 : Math.random();
        const freq = ref ? ref.freq : 261.63;
        spawned = this.growSite(pitchNorm, 0.25, freq, now);
        if (spawned) spawned.pulse = 0.5;
      }
    } else {
      this.ambientTimer = 0;
    }
    return spawned;
  }

  private ambientTimer = 0;

  // Held-note acceleration: feed continuous energy into the most recent site
  // and push the front a touch more so a sustained voice clearly grows faster.
  feedHeld(level: number, dt: number): void {
    if (!this.sites.length) return;
    const last = this.sites[this.sites.length - 1];
    last.pulse = Math.min(1, last.pulse + level * dt * 2.0);
    this.frontRadius = Math.min(
      this.maxRadius,
      this.frontRadius + level * dt * 0.02,
    );
  }

  // Reference golden angle for README / debug; intentionally not used to place.
  static get goldenAngle(): number {
    return GOLDEN_ANGLE;
  }
}
