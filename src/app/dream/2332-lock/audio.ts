// ─────────────────────────────────────────────────────────────────────────────
// 2332-lock · audio.ts — the stimulus pulse + an entrainment-tracking drone.
//
//   TWO click voices so the phase relationship is AUDIBLE, not just visible:
//     • beatClick()  — the STIMULUS woodblock, the pulse the user chases.
//     • tapClick()   — the user's / autopilot's own tap, a softer mint click.
//   When entrained the two clicks coincide (one reinforced attack); when locked
//   in anti-phase you hear the tap click syncopating BETWEEN the beats — the
//   wrong-phase state is a distinct sound.
//
//   A sustained DRONE bed tracks entrainment on two independent axes:
//     • coherence (PLV × tempo) opens the lowpass and collapses the detune
//       from a choppy beating cluster toward a unified, gently shimmering pad.
//     • phaseAlign smooths a tremolo chop.
//   Kept calm and cosmic-ambient — a settling INTO lock, never a bright climax.
//
//   Master ≤ 0.18 through a DynamicsCompressor, 1 s fade-in, silent until start.
// ─────────────────────────────────────────────────────────────────────────────

const MASTER = 0.16;

interface DronePartial {
  osc: OscillatorNode;
  gain: GainNode;
  baseCents: number; // sign of its detune contribution
}

export class LockAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private droneFilter: BiquadFilterNode;
  private droneGain: GainNode;
  private tremGain: GainNode;
  private tremLfo: OscillatorNode;
  private tremDepth: GainNode;
  private partials: DronePartial[] = [];
  private started = false;
  private reduced: boolean;

  constructor(ctx: AudioContext, reduced: boolean) {
    this.ctx = ctx;
    this.reduced = reduced;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── drone chain: partials → filter → tremolo → droneGain → comp ──────────
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 340;
    this.droneFilter.Q.value = 0.7;

    this.tremGain = ctx.createGain();
    this.tremGain.gain.value = 1;
    // tremolo LFO modulates tremGain.gain around 1 with variable depth
    this.tremLfo = ctx.createOscillator();
    this.tremLfo.type = "sine";
    this.tremLfo.frequency.value = reduced ? 1.2 : 3.1;
    this.tremDepth = ctx.createGain();
    this.tremDepth.gain.value = 0.42; // start choppy (unlocked)
    this.tremLfo.connect(this.tremDepth);
    this.tremDepth.connect(this.tremGain.gain);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;

    this.droneFilter.connect(this.tremGain);
    this.tremGain.connect(this.droneGain);
    this.droneGain.connect(this.comp);

    // Two just-intonation anchors (root + fifth), each a detuned pair → beating.
    const root = 98; // ~G2, low and calm
    const voices: Array<[number, number]> = [
      [root, +1],
      [root, -1],
      [root * 1.5, +1],
      [root * 1.5, -1],
      [root * 2, +0.5],
    ];
    for (const [f, sign] of voices) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > root * 1.9 ? 0.12 : 0.3;
      osc.connect(g);
      g.connect(this.droneFilter);
      this.partials.push({ osc, gain: g, baseCents: sign });
    }
  }

  /** Start oscillators and fade the master in over 1 s. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    for (const p of this.partials) p.osc.start(now);
    this.tremLfo.start(now);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER, now + 1.0);
  }

  /** Track entrainment. coherence & phaseAlign are two independent axes. */
  update(coherence: number, phaseAlign: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const tc = 0.12;

    // coherence opens the lowpass (dark → open, but calm — ceiling ~1500 Hz)
    const cutoff = 320 + coherence * 1180;
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, tc);

    // coherence collapses the detune: choppy beating cluster → near unison
    const cents = 34 * (1 - coherence) + 2;
    for (const p of this.partials) {
      p.osc.detune.setTargetAtTime(p.baseCents * cents, now, tc);
    }

    // phaseAlign smooths the tremolo chop (independent of coherence)
    const depth = 0.42 * (1 - phaseAlign) * (this.reduced ? 0.5 : 1) + 0.03;
    this.tremDepth.gain.setTargetAtTime(depth, now, tc);

    // a touch more drone level as things unify, kept modest
    this.droneGain.gain.setTargetAtTime(0.42 + coherence * 0.2, now, tc);
  }

  /** The stimulus pulse — a soft filtered woodblock. `bright` tracks tempo so
   *  the pitch drifts subtly with the sweep. */
  beatClick(bright: number): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620 + bright * 260;
    bp.Q.value = 5;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(720 + bright * 220, t);
    osc.frequency.exponentialRampToValueAtTime(360 + bright * 120, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.comp);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** The user's / autopilot's own tap — a softer, higher mint click. */
  tapClick(human: boolean): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1240, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.03);
    const g = this.ctx.createGain();
    const peak = human ? 0.06 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g);
    g.connect(this.comp);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Fade out and tear everything down. */
  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.15);
    } catch {
      /* noop */
    }
    const stopAt = now + 0.4;
    try {
      for (const p of this.partials) p.osc.stop(stopAt);
      this.tremLfo.stop(stopAt);
    } catch {
      /* already stopped */
    }
  }
}
