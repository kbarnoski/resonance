// audio.ts — Web Audio synth (no samples, no network) for the frost garden.
//
// Kids-safe output chain (mandatory exact shape):
//   every voice -> masterGain (~0.26)
//                -> BiquadFilter lowpass (<=6500 Hz)
//                -> DynamicsCompressor(threshold -10, ratio 20:1)
//                -> destination
//
// - Each newly-STUCK tip fires a soft bell/marimba chime; pitch is chosen from
//   a warm C-major pentatonic by the tip's height, so there are no wrong notes.
//   Chimes are rate-limited so dense growth stays gentle.
// - A warm sustained drone (C2 + G2 + C3) is always on from Start and gently
//   opens up as the garden fills.

// C-major pentatonic across a few octaves (low -> high). Higher tips = higher.
const PENTA_HZ = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
];

export class FrostAudio {
  private ac: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  readonly analyser: AnalyserNode; // tapped OFF master, never to destination

  private lastChimeAt = 0;
  private chimeBudget = 0; // simple token bucket for rate limiting
  private lastBudgetRefill = 0;

  constructor(ac: AudioContext) {
    this.ac = ac;

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;
    this.comp.knee.value = 8;

    this.lowpass = ac.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6000; // <= 6500

    this.master = ac.createGain();
    this.master.gain.value = 0.26;

    // master -> lowpass -> compressor -> destination
    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(ac.destination);

    // Analyser tapped OFF the master (never connected to destination).
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);

    // Always-on warm drone: C2 + G2 + C3.
    this.droneGain = ac.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
    const droneFreqs = [65.41, 98.0, 130.81];
    for (const f of droneFreqs) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    }
    // Soft fade-in (>=40ms attack).
    const now = ac.currentTime;
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.18, now + 1.2);

    this.lastBudgetRefill = ac.currentTime;
    this.chimeBudget = 8;
  }

  // Set drone fullness from garden density (0..1). Busier garden = fuller pad.
  setDensity(d: number): void {
    const clamped = Math.max(0, Math.min(1, d));
    const target = 0.16 + clamped * 0.16;
    const now = this.ac.currentTime;
    this.droneGain.gain.setTargetAtTime(target, now, 0.6);
  }

  // Fire a chime for a freshly-stuck tip at normalized height (0 low, 1 high).
  // Rate-limited via a token bucket (~8/sec) so dense growth stays gentle.
  chime(height: number): void {
    const now = this.ac.currentTime;
    // Refill budget.
    const dt = now - this.lastBudgetRefill;
    if (dt > 0) {
      this.chimeBudget = Math.min(8, this.chimeBudget + dt * 8);
      this.lastBudgetRefill = now;
    }
    if (this.chimeBudget < 1) return;
    // Minimum spacing for gentleness.
    if (now - this.lastChimeAt < 0.06) return;
    this.chimeBudget -= 1;
    this.lastChimeAt = now;

    const h = Math.max(0, Math.min(1, height));
    const idx = Math.min(
      PENTA_HZ.length - 1,
      Math.floor(h * (PENTA_HZ.length - 1) + Math.random() * 0.5),
    );
    const hz = PENTA_HZ[idx];

    // Soft marimba/bell: sine fundamental + faint 2nd partial, gentle attack,
    // exponential decay. Peaks well under master.
    const voice = this.ac.createGain();
    voice.gain.value = 0;
    voice.connect(this.master);

    const o1 = this.ac.createOscillator();
    o1.type = "sine";
    o1.frequency.value = hz;
    const o2 = this.ac.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz * 2.01;
    const g2 = this.ac.createGain();
    g2.gain.value = 0.18;
    o1.connect(voice);
    o2.connect(g2);
    g2.connect(voice);

    const peak = 0.12;
    const dur = 1.6;
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.045); // >=40ms attack
    voice.gain.exponentialRampToValueAtTime(0.0005, now + dur);

    o1.start(now);
    o2.start(now);
    o1.stop(now + dur + 0.05);
    o2.stop(now + dur + 0.05);
    o2.onended = () => {
      try {
        voice.disconnect();
        g2.disconnect();
      } catch {
        // already disconnected
      }
    };
  }

  dispose(): void {
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        // already stopped
      }
      try {
        o.disconnect();
      } catch {
        // ignore
      }
    }
    this.droneOscs = [];
    try {
      this.droneGain.disconnect();
      this.master.disconnect();
      this.lowpass.disconnect();
      this.comp.disconnect();
      this.analyser.disconnect();
    } catch {
      // ignore
    }
  }
}
