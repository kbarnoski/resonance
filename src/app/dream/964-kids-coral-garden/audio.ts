// Web Audio brain for the coral garden.
//
// - Always-on soft drone (low C + G pad) so it is never silent.
// - A gentle clock (~380-520ms). Each tick plays the most-active growing tip's
//   pitch, mapped from vertical screen position to a C-major pentatonic note
//   (top of screen = higher). Soft mallet/bell voice. The contour traces a slow
//   evolving melody.
// - Branch events -> a brighter bell one octave up.
// - No wrong notes (everything snaps to pentatonic). Polyphony normalized so
//   loudness does not scale with garden size.
// - Kids-safe master chain:
//     masterGain (<=0.26) -> lowpass ~6.5kHz -> compressor(-10, 20:1) -> dest
// - After ~12 min, slowly fade toward a soft "goodnight".

// C-major pentatonic across octaves (Hz), low -> high.
// C3 D3 E3 G3 A3 / C4 D4 E4 G4 A4 / C5 D5 E5 G5 A5
const PENTA: number[] = [
  130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
];

export class CoralAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private droneGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private startTime: number;
  private droneOscs: OscillatorNode[] = [];
  private droneLfos: OscillatorNode[] = [];
  // recent voices to normalize polyphony (timestamps in seconds)
  private recentVoices: number[] = [];
  private goodnight = false;

  constructor() {
    type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as WithWebkit).webkitAudioContext!;
    this.ctx = new Ctor();
    this.startTime = this.ctx.currentTime;

    // master chain
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6500;
    lowpass.Q.value = 0.4;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.3;

    this.master.connect(lowpass);
    lowpass.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // gentle fade-in of the master to target
    this.master.gain.setValueAtTime(0.0, this.startTime);
    this.master.gain.linearRampToValueAtTime(0.26, this.startTime + 4);

    // always-on drone: low C + G pad with slow detune shimmer
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneGain.connect(this.master);
    this.makeDrone(65.41, 0); // C2
    this.makeDrone(98.0, 0.6); // G2
    this.makeDrone(130.81, 1.2); // C3, quieter
  }

  private makeDrone(freq: number, phase: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    // slow amplitude shimmer
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.05 + phase * 0.03;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg);
    lg.connect(g.gain);
    osc.connect(g);
    g.connect(this.droneGain);
    osc.start();
    lfo.start();
    this.droneOscs.push(osc);
    this.droneLfos.push(lfo);
  }

  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  // seconds since start
  elapsed(): number {
    return this.ctx.currentTime - this.startTime;
  }

  // normalized per-voice gain ~ 1/sqrt(activeVoices)
  private voiceGain(): number {
    const now = this.ctx.currentTime;
    this.recentVoices = this.recentVoices.filter((t) => now - t < 0.7);
    const n = Math.max(1, this.recentVoices.length);
    return 1 / Math.sqrt(n);
  }

  // Map a vertical position (0 = top, 1 = bottom) to a pentatonic note.
  noteForY(yNorm: number): number {
    const clamped = Math.min(0.999, Math.max(0, yNorm));
    // top of screen -> higher pitch
    const idx = Math.floor((1 - clamped) * PENTA.length);
    return PENTA[Math.min(PENTA.length - 1, idx)];
  }

  // Soft mallet/bell voice. attack >= 30ms, gentle decay.
  private voice(freq: number, gainScale: number, bright: boolean): void {
    if (freq <= 0) return;
    const now = this.ctx.currentTime;
    this.recentVoices.push(now);

    const osc = this.ctx.createOscillator();
    osc.type = bright ? "triangle" : "sine";
    osc.frequency.value = freq;

    // a soft second partial for a bell-ish shimmer
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.01;

    const g = this.ctx.createGain();
    const g2 = this.ctx.createGain();

    const base = 0.5 * gainScale * this.voiceGain() * (this.goodnight ? 0.5 : 1);
    const attack = 0.035;
    const decay = bright ? 1.6 : 2.4;

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(base, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(base * 0.18, now + attack);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay * 0.6);

    osc.connect(g);
    osc2.connect(g2);
    g.connect(this.master);
    g2.connect(this.master);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + attack + decay + 0.1);
    osc2.stop(now + attack + decay + 0.1);
  }

  // Melody note from a tip's vertical position.
  playTip(yNorm: number): void {
    this.voice(this.noteForY(yNorm), 0.9, false);
  }

  // Branch -> brighter bell one octave up of a tip note.
  playBranch(yNorm: number): void {
    const f = this.noteForY(yNorm) * 2;
    this.voice(Math.min(f, 1760), 0.55, true);
  }

  // Planting a new seed -> a gentle chime (a soft pentatonic arpeggio touch).
  playChime(yNorm: number): void {
    this.voice(this.noteForY(yNorm), 0.7, true);
  }

  // Begin the slow goodnight fade.
  startGoodnight(): void {
    if (this.goodnight) return;
    this.goodnight = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.16, now + 30);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
    this.droneGain.gain.linearRampToValueAtTime(0.32, now + 30);
  }

  isGoodnight(): boolean {
    return this.goodnight;
  }

  close(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      // ignore — context may already be closing
    }
    for (const o of this.droneOscs) {
      try {
        o.stop(now + 0.3);
      } catch {
        // already stopped
      }
    }
    for (const l of this.droneLfos) {
      try {
        l.stop(now + 0.3);
      } catch {
        // already stopped
      }
    }
    window.setTimeout(() => {
      void this.ctx.close().catch(() => undefined);
    }, 350);
  }
}
