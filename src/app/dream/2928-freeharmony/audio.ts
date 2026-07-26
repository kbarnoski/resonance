// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY — the accompanist's voice
// A small polyphonic synth: a bass root, a 3-voice sustained pad, a gentle arp,
// and (in Auto mode) a soft lead that sings the virtual improviser's line.
// Everything glides with setTargetAtTime — no clicky note-ons, smooth re-voicing
// as the harmony engine changes chords. Master gain stays ≤ 0.15.
// ─────────────────────────────────────────────────────────────────────────────

import { midiToFreq } from "./pitch";

const GLIDE = 0.14; // seconds — pad/bass portamento time constant

interface PadVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class Synth {
  private ctx: AudioContext;
  private master: GainNode;
  private padFilter: BiquadFilterNode;

  private bass: OscillatorNode;
  private bassGain: GainNode;

  private pad: PadVoice[] = [];

  private lead: OscillatorNode;
  private leadGain: GainNode;

  private arp: OscillatorNode;
  private arpGain: GainNode;
  private arpTones: number[] = [];
  private arpIndex = 0;
  private arpClock = 0;

  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // ── Bass ──
    this.bass = ctx.createOscillator();
    this.bass.type = "triangle";
    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0.5;
    this.bass.connect(this.bassGain).connect(this.master);

    // ── Pad (3 detuned saw voices through a warm lowpass) ──
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 1800;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.master);
    const detunes = [-6, 0, 6];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detunes[i];
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      osc.connect(gain).connect(this.padFilter);
      this.pad.push({ osc, gain });
    }

    // ── Lead (auto-mode melody echo) ──
    this.lead = ctx.createOscillator();
    this.lead.type = "sine";
    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = 0;
    this.lead.connect(this.leadGain).connect(this.master);

    // ── Arp (gentle, quiet) ──
    this.arp = ctx.createOscillator();
    this.arp.type = "triangle";
    this.arpGain = ctx.createGain();
    this.arpGain.gain.value = 0;
    this.arp.connect(this.arpGain).connect(this.master);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.bass.start(t);
    this.pad.forEach((v) => v.osc.start(t));
    this.lead.start(t);
    this.arp.start(t);
    // Fade the master in gently to avoid a click.
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.setTargetAtTime(0.15, t, 0.6);
  }

  /** Set the current chord: glide bass + pad voices, feed the arp. */
  setChord(notes: number[], bassMidi: number): void {
    const t = this.ctx.currentTime;
    this.bass.frequency.setTargetAtTime(midiToFreq(bassMidi), t, GLIDE);
    for (let i = 0; i < this.pad.length; i++) {
      const midi = notes[i] !== undefined ? notes[i] : notes[notes.length - 1];
      this.pad[i].osc.frequency.setTargetAtTime(midiToFreq(midi), t, GLIDE);
    }
    // Arp cycles the upper chord tones an octave up.
    this.arpTones = notes.map((n) => n + 12);
  }

  /** Auto-mode: sing the improviser's continuous pitch through the lead voice. */
  setLead(midi: number, active: boolean): void {
    const t = this.ctx.currentTime;
    this.lead.frequency.setTargetAtTime(midiToFreq(midi), t, 0.05);
    this.leadGain.gain.setTargetAtTime(active ? 0.09 : 0, t, 0.08);
  }

  /** Advance the gentle arp; call once per animation frame with dt seconds. */
  tickArp(dt: number): void {
    if (this.arpTones.length === 0) return;
    this.arpClock += dt;
    const step = 0.28; // seconds per arp note
    if (this.arpClock >= step) {
      this.arpClock -= step;
      this.arpIndex = (this.arpIndex + 1) % this.arpTones.length;
      const t = this.ctx.currentTime;
      this.arp.frequency.setTargetAtTime(
        midiToFreq(this.arpTones[this.arpIndex]),
        t,
        0.02,
      );
      // Pluck envelope: quick up, gentle decay — stays very quiet.
      this.arpGain.gain.cancelScheduledValues(t);
      this.arpGain.gain.setValueAtTime(0.05, t);
      this.arpGain.gain.setTargetAtTime(0.0, t, 0.16);
    }
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.2);
    const stopAt = t + 0.4;
    try {
      this.bass.stop(stopAt);
      this.pad.forEach((v) => v.osc.stop(stopAt));
      this.lead.stop(stopAt);
      this.arp.stop(stopAt);
    } catch {
      // already stopped
    }
    window.setTimeout(() => {
      try {
        this.master.disconnect();
        this.padFilter.disconnect();
        this.bassGain.disconnect();
        this.leadGain.disconnect();
        this.arpGain.disconnect();
        this.pad.forEach((v) => v.gain.disconnect());
      } catch {
        // ignore
      }
    }, 500);
  }
}
