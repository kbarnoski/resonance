// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the society SINGS. The two sub-populations become two choral voices.
// Each voice is a stack of detuned oscillators; the DETUNE spread is driven by
// that community's coherence (rA / rB): low coherence → wide detune → many
// partials beating against each other (rough, a cluster-chord cacophony); high
// coherence → the stack collapses toward unison (a chorus locking in).
//
// The pitch INTERVAL between the two voices tracks the frequency gap (unison when
// the crowd agrees → a tritone at maximum conflict), so you literally hear the
// argument. Global order r opens a lowpass, fades in a consonant fifth-drone, and
// deepens a slow collective tremolo — the crowd finding a shared pulse.
// ─────────────────────────────────────────────────────────────────────────────

const PARTIALS = 5; // oscillators per community voice
const ROOT_A = 146.83; // D3 — the "slow" community's base pitch
const MAX_SPREAD_CENTS = 34; // widest detune when a community is incoherent
const MASTER = 0.22;

interface Voice {
  oscs: OscillatorNode[];
  detunes: AudioParam[];
  freqs: AudioParam[];
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class SocietyVoices {
  readonly ctx: AudioContext;
  private master: GainNode;
  private tremVCA: GainNode;
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private sub: OscillatorNode;
  private subGain: GainNode;
  private fifth: OscillatorNode;
  private fifthGain: GainNode;
  private voiceA: Voice;
  private voiceB: Voice;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    // slow collective tremolo — depth tracks global order r
    this.tremVCA = ctx.createGain();
    this.tremVCA.gain.value = 0.75;
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 2.6;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0.0;
    this.lfo.connect(this.lfoDepth).connect(this.tremVCA.gain);

    this.tremVCA.connect(this.master).connect(ctx.destination);

    // sub-bass body
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = ROOT_A / 2;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.16;
    this.sub.connect(this.subGain).connect(this.tremVCA);

    // consonant fifth-drone that fades in only when the whole field locks
    this.fifth = ctx.createOscillator();
    this.fifth.type = "triangle";
    this.fifth.frequency.value = ROOT_A * 1.5;
    this.fifthGain = ctx.createGain();
    this.fifthGain.gain.value = 0.0;
    this.fifth.connect(this.fifthGain).connect(this.tremVCA);

    this.voiceA = this.makeVoice(ROOT_A, "sawtooth", 0.16);
    this.voiceB = this.makeVoice(ROOT_A, "sawtooth", 0.14);
  }

  private makeVoice(freq: number, type: OscillatorType, level: number): Voice {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = level;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.7;
    filter.connect(gain).connect(this.tremVCA);

    const oscs: OscillatorNode[] = [];
    const detunes: AudioParam[] = [];
    const freqs: AudioParam[] = [];
    for (let i = 0; i < PARTIALS; i++) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      // symmetric fixed positions -1..1 scaled by the live spread each frame
      o.detune.value = 0;
      o.connect(filter);
      oscs.push(o);
      detunes.push(o.detune);
      freqs.push(o.frequency);
    }
    return { oscs, detunes, freqs, filter, gain };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    void ctx.resume();
    const t = ctx.currentTime;
    this.lfo.start();
    this.sub.start();
    this.fifth.start();
    for (const o of this.voiceA.oscs) o.start();
    for (const o of this.voiceB.oscs) o.start();
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(MASTER, t + 2.0);
  }

  /** Feed the live field readout to the synth every frame. */
  update(
    rGlobal: number,
    rA: number,
    rB: number,
    gap: number,
    meanSpeed: number,
  ): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const tau = 0.08;

    // interval between the two voices: unison (agreement) → tritone (conflict)
    const semis = gap * 6;
    const freqB = ROOT_A * Math.pow(2, semis / 12);

    const spreadA = MAX_SPREAD_CENTS * (1 - rA);
    const spreadB = MAX_SPREAD_CENTS * (1 - rB);
    const half = (PARTIALS - 1) / 2;
    for (let i = 0; i < PARTIALS; i++) {
      const pos = (i - half) / half; // -1..1
      this.voiceA.freqs[i].setTargetAtTime(ROOT_A, t, tau);
      this.voiceA.detunes[i].setTargetAtTime(pos * spreadA, t, tau);
      this.voiceB.freqs[i].setTargetAtTime(freqB, t, tau);
      this.voiceB.detunes[i].setTargetAtTime(pos * spreadB, t, tau);
    }

    // lowpass opens as the whole field agrees — clarity emerges from consensus
    const cutoff = 480 + rGlobal * rGlobal * 3200;
    this.voiceA.filter.frequency.setTargetAtTime(cutoff, t, 0.12);
    this.voiceB.filter.frequency.setTargetAtTime(cutoff, t, 0.12);

    // consonant fifth rewards a locked field; tremolo depth tracks r
    this.fifthGain.gain.setTargetAtTime(0.12 * Math.max(0, rGlobal - 0.4), t, 0.2);
    this.lfoDepth.gain.setTargetAtTime(0.28 * rGlobal, t, 0.15);
    // the shared pulse quickens slightly with the crowd's mean rotation speed
    this.lfo.frequency.setTargetAtTime(2.0 + Math.abs(meanSpeed) * 0.6, t, 0.3);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      await this.ctx.close().catch(() => {});
      return;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    await new Promise((r) => setTimeout(r, 460));
    await this.ctx.close().catch(() => {});
  }
}
