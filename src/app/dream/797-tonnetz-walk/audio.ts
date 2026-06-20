// ─────────────────────────────────────────────────────────────────────────────
// Warm polyphonic pad synth for the Tonnetz walker.
//
//   • 3 sustained voices (triangle + detuned sine) for the triad — one per
//     chord tone, with portamento so the single moving voice GLIDES while the
//     two common tones hold still. This is the audible signature of smooth
//     voice-leading.
//   • A soft sub-bass on the root.
//   • A sparse, gentle arpeggio plucked from the current chord tones.
//   • A short algorithmic reverb (feedback delay network, no external IR file)
//     for an open, breathing space.
//
// Pure synthesis: zero network, zero assets. Built to start instantly and tear
// down cleanly.
// ─────────────────────────────────────────────────────────────────────────────

const SEMI = 1.0594630943592953; // 2^(1/12)

// MIDI-ish semitone value -> frequency. We anchor so that value 0 = C2.
function semiToFreq(s: number): number {
  return 65.4063913251 * Math.pow(SEMI, s); // C2 = 65.4 Hz
}

interface PadVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  current: number; // current semitone value
}

export interface ArpEvent {
  pitch: number;
  when: number;
}

export class TonnetzAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private padBus: GainNode;
  private voices: PadVoice[] = [];
  private bassOsc: OscillatorNode | null = null;
  private bassGain: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private arpTimer: number | null = null;
  private arpPitches: number[] = [];
  private arpIdx = 0;
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    this.padBus = this.ctx.createGain();
    this.padBus.gain.value = 0.9;

    // Gentle low-pass to keep the pad warm.
    const tone = this.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1800;
    tone.Q.value = 0.3;
    this.padBus.connect(tone);
    tone.connect(this.master);

    this.runReverb(tone);
  }

  // Feedback-delay reverb network. Several delays with feedback give a smeared,
  // diffuse tail without needing a ConvolverNode impulse asset.
  private runReverb(source: AudioNode): void {
    const send = this.ctx.createGain();
    send.gain.value = 0.5;
    source.connect(send);

    const ret = this.ctx.createGain();
    ret.gain.value = 0.42;
    ret.connect(this.master);
    this.reverbReturn = ret;

    const delays = [0.067, 0.111, 0.173, 0.241];
    for (const dt of delays) {
      const d = this.ctx.createDelay(1.0);
      d.delayTime.value = dt;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.55;
      const damp = this.ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2600;
      send.connect(d);
      d.connect(damp);
      damp.connect(fb);
      fb.connect(d); // feedback loop
      damp.connect(ret);
    }
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.started) return;
    this.started = true;

    // Three pad voices.
    for (let i = 0; i < 3; i++) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sine";
      osc2.detune.value = 6; // slow beating for warmth
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.padBus);
      osc.start();
      osc2.start();
      this.voices.push({ osc, osc2, gain, current: 48 });
    }

    // Sub bass.
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0.0;
    this.bassOsc = this.ctx.createOscillator();
    this.bassOsc.type = "sine";
    this.bassOsc.connect(this.bassGain);
    this.bassGain.connect(this.master);
    this.bassOsc.start();

    // Fade master in.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 2.0);
  }

  // Move the pad to a new set of absolute voices (semitone values). Common tones
  // are held; the changed voice glides. `glideSec` is the portamento time.
  setChord(voices: number[], glideSec: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const perVoice = 0.16;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const target = voices[i] ?? v.current;
      const f = semiToFreq(target);
      const glide = Math.abs(target - v.current) < 0.01 ? 0.05 : glideSec;
      for (const o of [v.osc, v.osc2]) {
        o.frequency.cancelScheduledValues(now);
        o.frequency.setValueAtTime(o.frequency.value, now);
        o.frequency.exponentialRampToValueAtTime(f, now + glide);
      }
      // Equal-ish loudness, slightly favour the lowest voice.
      const g = 0.14 - i * 0.02;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(g, now, perVoice);
      v.current = target;
    }

    // Bass = root an octave below the lowest pad voice's pitch class.
    if (this.bassOsc && this.bassGain) {
      const lowest = Math.min(...voices);
      const bassSemi = lowest - 12;
      const bf = semiToFreq(bassSemi);
      this.bassOsc.frequency.cancelScheduledValues(now);
      this.bassOsc.frequency.setValueAtTime(this.bassOsc.frequency.value, now);
      this.bassOsc.frequency.exponentialRampToValueAtTime(bf, now + glideSec);
      this.bassGain.gain.setTargetAtTime(0.16, now, 0.3);
    }

    // Refresh the arpeggio source pitches (an octave up, sparse).
    this.arpPitches = [...voices].sort((a, b) => a - b).map((s) => s + 12);
  }

  // Start a sparse arpeggio that softly outlines the current chord.
  runArp(stepMs: number): void {
    this.stopArp();
    const interval = Math.max(380, stepMs / 4);
    this.arpTimer = window.setInterval(() => {
      if (!this.started || this.arpPitches.length === 0) return;
      // ~55% chance to sound a note each tick -> sparse, meditative.
      if (Math.random() > 0.55) return;
      const pitch =
        this.arpPitches[this.arpIdx % this.arpPitches.length] +
        (Math.random() < 0.25 ? 12 : 0);
      this.arpIdx++;
      this.pluck(pitch);
    }, interval);
  }

  private pluck(semi: number): void {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = semiToFreq(semi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    osc.connect(g);
    g.connect(this.reverbReturn ?? this.master);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 1.7);
  }

  stopArp(): void {
    if (this.arpTimer !== null) {
      window.clearInterval(this.arpTimer);
      this.arpTimer = null;
    }
  }

  setArp(on: boolean, stepMs: number): void {
    if (on) this.runArp(stepMs);
    else this.stopArp();
  }

  // Cheap amplitude proxy for visuals: how loud the pad is right now.
  level(): number {
    return this.master.gain.value;
  }

  pause(): void {
    if (this.ctx.state === "running") void this.ctx.suspend();
    this.stopArp();
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  dispose(): void {
    this.stopArp();
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* context may already be closing */
    }
    window.setTimeout(() => {
      try {
        for (const v of this.voices) {
          v.osc.stop();
          v.osc2.stop();
        }
        this.bassOsc?.stop();
      } catch {
        /* already stopped */
      }
      void this.ctx.close();
    }, 300);
  }
}
