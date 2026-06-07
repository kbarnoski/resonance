// ReefAudio — the band-chord engine.
//
// The reef is divided into horizontal depth bands. Each band sustains ONE held
// voice of a D-Dorian stack. When a band first gets coral its voice fades in;
// as the reef climbs through bands the chord STACKS and thickens. Each newly
// locked branch also rings a soft transient bell in its band's pitch.
//
// Web Audio API only. A DynamicsCompressor acts as a brick-wall limiter so the
// output can NEVER blast. An always-on faint root means it's never fully silent.

// D-Dorian stack, bottom → top: D2 (root drone), A2, D3, E3, F3, A3.
// (root, fifth, octave, ninth, dorian-third-up, fifth-up — fills toward Dm11 colour)
const BAND_HZ = [73.42, 110.0, 146.83, 164.81, 174.61, 220.0];

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode; // slightly detuned partner for warmth
  gain: GainNode;
  active: boolean;
}

export class ReefAudio {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private voices: Voice[] = [];
  private started = false;

  // Create + resume the AudioContext inside a user gesture (autoplay-safe).
  async start(): Promise<boolean> {
    if (this.started) return true;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new Ctx();
      this.ac = ac;

      // Brick-wall limiter so nothing can ever get loud.
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 6;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.limiter = limiter;

      const master = ac.createGain();
      master.gain.value = 0.0;
      this.master = master;

      master.connect(limiter);
      limiter.connect(ac.destination);

      // Build one sustained voice per band (all silent except the root).
      this.voices = BAND_HZ.map((hz, i) => {
        const osc = ac.createOscillator();
        const osc2 = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc2.type = "sine";
        osc.frequency.value = hz;
        osc2.frequency.value = hz * 1.005; // gentle chorus
        gain.gain.value = 0.0;
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(master);
        osc.start();
        osc2.start();
        return { osc, osc2, gain, active: i === 0 };
      });

      await ac.resume().catch(() => {});

      // Fade master in, and bring up the always-on faint root drone.
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0, now);
      master.gain.linearRampToValueAtTime(0.9, now + 1.2);
      this.rampVoice(0, 0.05, 1.5); // faint root, always present

      this.started = true;
      return true;
    } catch {
      return false;
    }
  }

  private rampVoice(index: number, target: number, dur: number) {
    if (!this.ac) return;
    const v = this.voices[index];
    if (!v) return;
    const now = this.ac.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(target, now + dur);
  }

  // Update which bands are active → fade their sustained voices in/out.
  // Higher bands sit a touch quieter so the chord stays warm, not shrill.
  setBands(active: boolean[]) {
    if (!this.started) return;
    for (let i = 0; i < this.voices.length; i++) {
      const on = !!active[i];
      const v = this.voices[i];
      if (on && !v.active) {
        v.active = true;
        const level = i === 0 ? 0.16 : 0.13 * Math.pow(0.86, i);
        this.rampVoice(i, level, 2.2);
      } else if (!on && v.active && i !== 0) {
        v.active = false;
        this.rampVoice(i, 0.0, 1.4);
      }
    }
  }

  // Soft transient bell when a branch locks, pitched to its band's voice.
  ringBell(band: number) {
    if (!this.ac || !this.master || !this.started) return;
    const ac = this.ac;
    const now = ac.currentTime;
    const baseHz = BAND_HZ[Math.max(0, Math.min(BAND_HZ.length - 1, band))];
    const hz = baseHz * 2; // bell an octave up — bright but soft
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz * (0.99 + Math.random() * 0.02);
    const peak = 0.05 + band * 0.004;
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 0.9);
    osc.connect(env);
    env.connect(this.master);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  dispose() {
    if (!this.ac) return;
    const ac = this.ac;
    try {
      if (this.master) {
        const now = ac.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.linearRampToValueAtTime(0.0, now + 0.2);
      }
    } catch {
      /* noop */
    }
    setTimeout(() => {
      try {
        for (const v of this.voices) {
          try {
            v.osc.stop();
            v.osc2.stop();
          } catch {
            /* noop */
          }
        }
        ac.close().catch(() => {});
      } catch {
        /* noop */
      }
    }, 260);
    this.voices = [];
    this.master = null;
    this.limiter = null;
    this.ac = null;
    this.started = false;
  }
}
