// audio.ts — Web Audio synthesis + a look-ahead scheduler.
//
// Each voice is a clean FM-triangle tone with an ADSR envelope. The master
// chain is kept deliberately safe:
//   master gain (≤0.28) → lowpass (~9 kHz) → DynamicsCompressor → dest
// Polyphony is capped (oldest voices stolen) so it can never pile up.

const MAX_POLY = 14;

export interface SoundedNote {
  voice: number;
  midi: number;
  startTime: number; // AudioContext time
  endTime: number;
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// muted, distinct timbres per voice (used for both sound + color mapping)
const VOICE_GAIN = [0.5, 0.42, 0.4, 0.36];

export class AudioVoices {
  ctx: AudioContext;
  private master: GainNode;
  private active: { osc: OscillatorNode; mod: OscillatorNode; gain: GainNode; end: number }[] = [];
  // notes currently sounding, exposed for the visualizer's "now" marker
  sounded: SoundedNote[] = [];

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9000;
    lp.Q.value = 0.4;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.master.connect(lp);
    lp.connect(comp);
    comp.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  fadeIn() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.26, t + 1.2);
  }

  fadeOut() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0, t + 0.4);
  }

  // schedule one note to play at absolute AudioContext time `when`
  play(voice: number, midi: number, when: number, durSec: number) {
    if (this.active.length >= MAX_POLY) this.stealOldest();

    const freq = midiToFreq(midi);
    const ctx = this.ctx;

    // FM: a modulator detuned to a harmonic, lightly indexing the carrier.
    const carrier = ctx.createOscillator();
    carrier.type = "triangle";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.01; // near 2nd harmonic for a reedy edge
    const modGain = ctx.createGain();
    modGain.gain.value = freq * 0.6; // modest FM index
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const gain = ctx.createGain();
    const peak = VOICE_GAIN[Math.min(voice, VOICE_GAIN.length - 1)];

    // ADSR
    const a = 0.012;
    const d = 0.08;
    const sLevel = peak * 0.7;
    const rel = Math.min(0.25, durSec * 0.5);
    const end = when + durSec;

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + a);
    gain.gain.linearRampToValueAtTime(sLevel, when + a + d);
    gain.gain.setValueAtTime(sLevel, Math.max(when + a + d, end - rel));
    gain.gain.linearRampToValueAtTime(0.0001, end);

    carrier.connect(gain);
    gain.connect(this.master);

    carrier.start(when);
    mod.start(when);
    carrier.stop(end + 0.02);
    mod.stop(end + 0.02);

    const rec = { osc: carrier, mod, gain, end };
    this.active.push(rec);
    carrier.onended = () => {
      const i = this.active.indexOf(rec);
      if (i >= 0) this.active.splice(i, 1);
    };

    this.sounded.push({ voice, midi, startTime: when, endTime: end });
    // trim the visual record
    if (this.sounded.length > 400) this.sounded.splice(0, this.sounded.length - 400);
  }

  private stealOldest() {
    const rec = this.active.shift();
    if (!rec) return;
    try {
      const t = this.ctx.currentTime;
      rec.gain.gain.cancelScheduledValues(t);
      rec.gain.gain.setValueAtTime(rec.gain.gain.value, t);
      rec.gain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      rec.osc.stop(t + 0.06);
      rec.mod.stop(t + 0.06);
    } catch {
      /* already stopped */
    }
  }

  async close() {
    try {
      this.fadeOut();
      await new Promise((r) => setTimeout(r, 60));
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
