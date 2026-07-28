// ─────────────────────────────────────────────────────────────────────────────
// ensemble.ts — a three-voice synth ensemble with its own inertial pulse.
//
//   AudioContext lookahead scheduler (setInterval ~25 ms, ~140 ms ahead) plays a
//   fixed phrase (Am–F–C–G) across three continuous-pitch voices:
//     · bass  — triangle, root of the chord
//     · pad   — sawtooth, sustained triad
//     · lead  — square/triangle, an eighth-note melody
//
//   The ensemble reads the BeatEngine's grid (period + totalBeats). When you
//   conduct steadily the grid locks and the voices stay in tune. When you rush
//   or drag, `instability` rises and the ensemble STRAINS: voices detune up to
//   ~40 cents and the lead starts dropping notes. You can genuinely get it wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./beat";

const LOOKAHEAD = 0.14; // schedule this far ahead (seconds)
const MAX_DETUNE = 40; // cents at full instability

type VoiceName = "bass" | "pad" | "lead";

// MIDI helpers ----------------------------------------------------------------
function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Am – F – C – G, one chord per bar (4 beats). [bassMidi, triad, leadScale]
const PROG: { bass: number; triad: number[]; lead: number[] }[] = [
  { bass: 45, triad: [57, 60, 64], lead: [69, 72, 64, 67] }, // Am
  { bass: 41, triad: [53, 57, 60], lead: [65, 69, 60, 65] }, // F
  { bass: 48, triad: [60, 64, 67], lead: [72, 67, 64, 72] }, // C
  { bass: 43, triad: [55, 59, 62], lead: [67, 71, 62, 74] }, // G
];

export class Ensemble {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private gains: Record<VoiceName, GainNode>;
  private rng = mulberry32(0x3416 ^ 0x55);

  private nextBeat = 0; // next integer beat index to schedule
  private started = false;

  // per-voice envelope memory (visual readout only)
  private lvl: Record<VoiceName, { t: number; vel: number; dur: number }> = {
    bass: { t: -10, vel: 0, dur: 0.5 },
    pad: { t: -10, vel: 0, dur: 2 },
    lead: { t: -10, vel: 0, dur: 0.25 },
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 3200;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    this.gains = {
      bass: ctx.createGain(),
      pad: ctx.createGain(),
      lead: ctx.createGain(),
    };
    this.gains.bass.gain.value = 0.5;
    this.gains.pad.gain.value = 0.22;
    this.gains.lead.gain.value = 0.3;
    for (const k of Object.keys(this.gains) as VoiceName[]) {
      this.gains[k].connect(this.filter);
    }
  }

  /** Fade in. Must be called from a user gesture (ctx already resumed there). */
  start(currentBeat: number) {
    this.started = true;
    this.nextBeat = Math.ceil(currentBeat);
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.22, now + 0.8);
  }

  /**
   * Lookahead scheduler tick. Reads the shared grid.
   * @param totalBeats current grid position (float)
   * @param gridPeriod current ensemble seconds/beat
   * @param instability 0..1
   */
  schedule(totalBeats: number, gridPeriod: number, instability: number) {
    if (!this.started) return;
    const nowAudio = this.ctx.currentTime;
    let guard = 0;
    while (guard++ < 64) {
      const beatsAhead = this.nextBeat - totalBeats;
      const when = nowAudio + beatsAhead * gridPeriod;
      if (when > nowAudio + LOOKAHEAD) break;
      if (when >= nowAudio - 0.03) {
        this.playBeat(this.nextBeat, Math.max(when, nowAudio), gridPeriod, instability);
      }
      this.nextBeat++;
    }
  }

  private playBeat(beat: number, when: number, period: number, instab: number) {
    const bar = Math.floor(beat / 4);
    const beatInBar = ((beat % 4) + 4) % 4;
    const chord = PROG[((bar % 4) + 4) % 4];
    const detuneAmt = instab * MAX_DETUNE;

    // BASS — every beat, root (drops an octave feel on downbeat via lower reg)
    const bassMidi = chord.bass + (beatInBar === 0 ? 0 : 0);
    this.voice("bass", "triangle", mtof(bassMidi), when, period * 0.9, 0.5, detuneAmt);

    // PAD — sustained triad, retriggered at the bar start
    if (beatInBar === 0) {
      for (const m of chord.triad) {
        this.voice("pad", "sawtooth", mtof(m), when, period * 4 * 0.95, 0.16, detuneAmt);
      }
    }

    // LEAD — two eighth notes per beat; drops notes as instability rises
    for (let e = 0; e < 2; e++) {
      const dropProb = instab * 0.85;
      if (this.rng() < dropProb) continue; // the lead stumbles
      const idx = (beatInBar * 2 + e) % chord.lead.length;
      const midi = chord.lead[idx] + (e === 1 ? 0 : 0);
      const t = when + e * period * 0.5;
      const osc: OscillatorType = instab > 0.5 ? "square" : "triangle";
      this.voice("lead", osc, mtof(midi), t, period * 0.42, 0.28, detuneAmt);
    }
  }

  private voice(
    name: VoiceName,
    type: OscillatorType,
    freq: number,
    when: number,
    dur: number,
    peak: number,
    detuneAmt: number,
  ) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    // instability detunes the voice; deterministic sign from the seeded PRNG
    const cents = (this.rng() - 0.5) * 2 * detuneAmt;
    osc.detune.setValueAtTime(cents, when);

    const g = ctx.createGain();
    const a = Math.min(0.02, dur * 0.2);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0008, when + dur);

    osc.connect(g);
    g.connect(this.gains[name]);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };

    const mem = this.lvl[name];
    mem.t = when;
    mem.vel = peak;
    mem.dur = dur;
  }

  /** Approximate current per-voice level [0..1] for the visualiser. */
  levels(): [number, number, number] {
    const now = this.ctx.currentTime;
    const one = (n: VoiceName) => {
      const m = this.lvl[n];
      const age = now - m.t;
      if (age < 0 || age > m.dur) return 0;
      const env = age < 0.02 ? age / 0.02 : Math.exp(-3 * (age / m.dur));
      return Math.min(1, (m.vel / 0.5) * env);
    };
    return [one("bass"), one("pad"), one("lead")];
  }

  dispose() {
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.disconnect();
      this.filter.disconnect();
      for (const k of Object.keys(this.gains) as VoiceName[]) {
        this.gains[k].disconnect();
      }
    } catch {
      /* already torn down */
    }
  }
}
