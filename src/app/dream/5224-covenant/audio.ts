// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the entities ARE the instrument.
//
//   Every +½ defect is a spatial VOICE: an oscillator whose pitch is snapped to
//   a just-intonation pentatonic slot by its persistent ID, stereo-panned by its
//   x-position, swelling in amplitude with age, its vibrato depth driven by how
//   fast it darts. A −½ defect is passive: the whole population of −½ feeds one
//   low drone pad. Births attack softly from below; annihilations glide the
//   dying voice into its nearest neighbour and cancel.
//
//   In open CHAOS the voices are a dense, detuned, darting cloud. When the three
//   +½ lock into the golden braid, their voices snap to a consonant just-major
//   triad and a repeating three-pulse canon clocks to the braid's orbital period
//   — the hypnotic reward. A quiet bed drone underlies everything; the sum runs
//   through a DynamicsCompressor limiter.
//
//   Deterministic (seeded mulberry32); all timing from AudioContext.currentTime.
//   No strobe in sound either: envelopes are slow (≤ a few Hz of amplitude
//   motion), nothing clicks.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./nematic";

export interface VoiceState {
  id: number;
  x01: number; // 0..1 horizontal position → pan
  speed01: number; // 0..1 dart speed → vibrato depth
  age: number; // seconds
  inside: boolean;
}

export interface AudioUpdate {
  plus: VoiceState[];
  minusCount: number;
  braidLocked: boolean;
  braidPeriod: number;
  braidIds: number[]; // the (up to) three interior +½ ids
}

const MAX_VOICES = 12;

// Just-intonation major pentatonic over two octaves, root D3 = 146.83 Hz.
const ROOT = 146.83;
const JUST_PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
function buildScale(): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const r of JUST_PENTA) out.push(ROOT * r * Math.pow(2, oct));
  }
  return out; // 10 slots
}
// Consonant just-major triad (root · 5/4 · 3/2) one octave up — the braid chord.
const TRIAD = [ROOT * 2, ROOT * 2 * (5 / 4), ROOT * 2 * (3 / 2)];

interface Voice {
  id: number;
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  vibOsc: OscillatorNode;
  vibGain: GainNode;
  baseFreq: number;
  dying: boolean;
}

export class CovenantAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private bedGain: GainNode;
  private minusGain: GainNode;
  private minusFilter: BiquadFilterNode;
  private scale: number[];
  private rng: () => number;
  private voices = new Map<number, Voice>();
  private started = false;

  // canon scheduler
  private nextBeat = 0;
  private beatIndex = 0;

  constructor(seed: number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.scale = buildScale();
    this.rng = mulberry32(seed ^ 0x5224);

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.limiter);

    // ── quiet bed drone: two very low detuned saws through a soft lowpass ──
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0.06;
    const bedFilter = this.ctx.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = 380;
    bedFilter.connect(this.bedGain);
    this.bedGain.connect(this.master);
    for (const det of [-4, 5]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = ROOT / 2; // one octave below root
      o.detune.value = det;
      o.connect(bedFilter);
      o.start();
    }

    // ── −½ passive drone pad (level scales with the −½ population) ──
    this.minusGain = this.ctx.createGain();
    this.minusGain.gain.value = 0;
    this.minusFilter = this.ctx.createBiquadFilter();
    this.minusFilter.type = "lowpass";
    this.minusFilter.frequency.value = 520;
    this.minusFilter.connect(this.minusGain);
    this.minusGain.connect(this.master);
    for (const mul of [1, 1.5]) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = ROOT * 0.75 * mul; // a low fifth-ish pad
      o.detune.value = (this.rng() - 0.5) * 8;
      o.connect(this.minusFilter);
      o.start();
    }
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  async resume(): Promise<void> {
    this.started = true;
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* pre-gesture rejection — ignore */
      }
    }
  }

  private slotFreq(id: number, locked: boolean, braidIds: number[]): number {
    if (locked) {
      const k = braidIds.indexOf(id);
      if (k >= 0) return TRIAD[k % TRIAD.length];
    }
    return this.scale[id % this.scale.length];
  }

  private makeVoice(v: VoiceState, freq: number): Voice {
    const { ctx } = this;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const vibOsc = ctx.createOscillator();
    vibOsc.type = "sine";
    vibOsc.frequency.value = 4.5 + this.rng() * 1.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 0;
    vibOsc.connect(vibGain);
    vibGain.connect(osc.detune);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = v.x01 * 2 - 1;

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);

    // soft rising attack: pitch glides up a whole tone, gain swells over ~0.8s
    osc.frequency.setValueAtTime(freq * 0.89, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.7);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.8);

    osc.start(now);
    vibOsc.start(now);
    return { id: v.id, osc, gain, pan, vibOsc, vibGain, baseFreq: freq, dying: false };
  }

  private killVoice(vc: Voice, glideTo: number | null): void {
    if (vc.dying) return;
    vc.dying = true;
    const now = this.ctx.currentTime;
    // annihilation: glide into the nearest living voice's pitch, then cancel
    if (glideTo) {
      vc.osc.frequency.cancelScheduledValues(now);
      vc.osc.frequency.setValueAtTime(vc.osc.frequency.value, now);
      vc.osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), now + 0.4);
    }
    vc.gain.gain.cancelScheduledValues(now);
    vc.gain.gain.setValueAtTime(vc.gain.gain.value, now);
    vc.gain.gain.linearRampToValueAtTime(0, now + 0.45);
    const stopAt = now + 0.5;
    try {
      vc.osc.stop(stopAt);
      vc.vibOsc.stop(stopAt);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      try {
        vc.osc.disconnect();
        vc.gain.disconnect();
        vc.pan.disconnect();
        vc.vibGain.disconnect();
      } catch {
        /* noop */
      }
    }, 600);
  }

  /** Called every animation frame with the current entity snapshot. */
  update(u: AudioUpdate): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // Select which +½ get a voice: interior + oldest first, capped.
    const ranked = [...u.plus].sort(
      (a, b) => Number(b.inside) - Number(a.inside) || b.age - a.age,
    );
    const chosen = ranked.slice(0, MAX_VOICES);
    const chosenIds = new Set(chosen.map((v) => v.id));

    // Deaths: voices whose defect is gone → annihilate into a neighbour.
    for (const [id, vc] of this.voices) {
      if (!chosenIds.has(id) && !vc.dying) {
        let nearest: Voice | null = null;
        for (const [oid, ov] of this.voices) {
          if (oid !== id && !ov.dying) {
            nearest = ov;
            break;
          }
        }
        this.killVoice(vc, nearest ? nearest.baseFreq : null);
        this.voices.delete(id);
      }
    }

    // Births + per-frame modulation.
    for (const v of chosen) {
      const freq = this.slotFreq(v.id, u.braidLocked, u.braidIds);
      let vc = this.voices.get(v.id);
      if (!vc) {
        vc = this.makeVoice(v, freq);
        this.voices.set(v.id, vc);
      }
      if (vc.dying) continue;

      // pan follows x; amplitude swells with age; vibrato tracks dart speed.
      vc.pan.pan.setTargetAtTime(v.x01 * 2 - 1, now, 0.08);
      const ampTarget = (0.02 + 0.05 * Math.min(1, v.age / 3)) * (v.inside ? 1.25 : 1);
      vc.gain.gain.setTargetAtTime(ampTarget, now, 0.15);
      vc.vibGain.gain.setTargetAtTime(4 + v.speed01 * 26, now, 0.2);

      // pitch: detuned & darting in chaos, snapped clean in the braid
      const target = freq;
      const detune = u.braidLocked && u.braidIds.includes(v.id)
        ? 0
        : (this.rng() - 0.5) * 22 * (0.4 + v.speed01);
      if (vc.baseFreq !== target) {
        vc.osc.frequency.setTargetAtTime(target, now, 0.25);
        vc.baseFreq = target;
      }
      vc.osc.detune.setTargetAtTime(detune, now, 0.3);
    }

    // −½ passive drone pad — thickens with the −½ population.
    const minusLevel = Math.min(0.14, u.minusCount * 0.012);
    this.minusGain.gain.setTargetAtTime(minusLevel, now, 0.4);

    // ── the braid canon: a repeating three-pulse round on the triad ──
    if (u.braidLocked && u.braidIds.length >= 3) {
      const beat = u.braidPeriod / 3;
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      while (this.nextBeat < now + 0.2) {
        const id = u.braidIds[this.beatIndex % 3];
        const vc = this.voices.get(id);
        if (vc && !vc.dying) {
          const t = this.nextBeat;
          // gentle swell (no click) — the hypnotic pulse
          vc.gain.gain.setValueAtTime(vc.gain.gain.value, t);
          vc.gain.gain.linearRampToValueAtTime(0.14, t + beat * 0.18);
          vc.gain.gain.linearRampToValueAtTime(0.06, t + beat * 0.9);
        }
        this.beatIndex++;
        this.nextBeat += beat;
      }
    } else {
      this.beatIndex = 0;
      this.nextBeat = 0;
    }
  }

  dispose(): void {
    for (const [, vc] of this.voices) {
      try {
        vc.osc.stop();
        vc.vibOsc.stop();
        vc.osc.disconnect();
        vc.gain.disconnect();
        vc.pan.disconnect();
        vc.vibGain.disconnect();
      } catch {
        /* noop */
      }
    }
    this.voices.clear();
    try {
      this.master.disconnect();
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
