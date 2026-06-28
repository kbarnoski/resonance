// audio.ts — kids-safe "no wrong notes" sound engine for the singing cloud.
//
// Design: a soft always-on drone (root + fifth) plus a small pool of voices
// that snap to a C-major pentatonic scale. Cloud state drives the music:
//   - centroid height  -> pitch register (high cloud = high voices)
//   - openness/energy   -> brightness (filter) + how many voices sing
//   - pinch-gather      -> a bright bell/chime an octave up
//
// Master chain is deliberately gentle:
//   masterGain (<= 0.26) -> lowpass ~6500Hz -> compressor(threshold -10, ratio 20)
// All gains are ramped to avoid clicks; no sudden loud transients.

// C major pentatonic across ~2 octaves: C D E G A C D E G A C
// (frequencies in Hz, C4 = 261.63)
const PENTATONIC_HZ = [
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

const VOICE_COUNT = 6;

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
  targetGain: number;
  noteIndex: number;
};

export type CloudAudioState = {
  // 0 (bottom of frame) .. 1 (top). Higher cloud -> higher pitch register.
  centroidHeight: number;
  // 0 .. 1 — total kinetic energy / motion of the field.
  energy: number;
  // 0 .. 1 — average openness of detected hands (open palm = bright/dense).
  openness: number;
  // number of pinch events that just happened this frame (>=0).
  pinchPulses: number;
};

export class CloudAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private droneRoot: OscillatorNode | null = null;
  private droneFifth: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private voices: Voice[] = [];
  private started = false;
  private disposed = false;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 4000;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    // master -> lowpass -> compressor -> destination
    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture. Resumes context and starts drone+voices. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.started = true;
    const t = this.ctx.currentTime;

    // Gentle fade-in of the master bus.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.22, t + 1.6);

    // --- Always-on drone: root (C2) + fifth (G2) ---
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.connect(this.master);
    this.droneGain.gain.exponentialRampToValueAtTime(0.14, t + 2.2);

    this.droneRoot = this.ctx.createOscillator();
    this.droneRoot.type = "sine";
    this.droneRoot.frequency.value = 65.41; // C2
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.7;
    this.droneRoot.connect(subGain).connect(this.droneGain);
    this.droneRoot.start();

    this.droneFifth = this.ctx.createOscillator();
    this.droneFifth.type = "sine";
    this.droneFifth.frequency.value = 98.0; // G2
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.4;
    this.droneFifth.connect(fifthGain).connect(this.droneGain);
    this.droneFifth.start();

    // --- Voice pool (pentatonic, triangle waves for a warm, soft tone) ---
    for (let i = 0; i < VOICE_COUNT; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(this.master);
      const noteIndex = 3 + i; // start spread up the scale
      osc.frequency.value = PENTATONIC_HZ[noteIndex];
      osc.start();
      this.voices.push({ osc, gain, targetGain: 0, noteIndex });
    }
  }

  /** Per-frame update. Maps cloud state to the singing voices. */
  update(state: CloudAudioState): void {
    if (!this.started || this.disposed) return;
    const t = this.ctx.currentTime;

    const energy = clamp01(state.energy);
    const openness = clamp01(state.openness);
    const height = clamp01(state.centroidHeight);

    // Brightness: openness + energy open the lowpass for a brighter cloud.
    const cutoff = 1400 + (3200 + energy * 1800) * (0.4 + 0.6 * openness);
    this.lowpass.frequency.setTargetAtTime(
      Math.min(6500, cutoff),
      t,
      0.15,
    );

    // Density: how many voices are audible scales with energy+openness.
    const activity = 0.35 * energy + 0.65 * openness;
    const audibleVoices = Math.max(2, Math.round(2 + activity * (VOICE_COUNT - 2)));

    // Pitch register: higher cloud picks notes higher up the scale.
    // Lower bound walks up the pentatonic ladder with height.
    const baseNote = Math.round(height * (PENTATONIC_HZ.length - VOICE_COUNT));

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const wantNote = clampInt(baseNote + i, 0, PENTATONIC_HZ.length - 1);
      if (wantNote !== v.noteIndex) {
        v.noteIndex = wantNote;
        // glide to the new pentatonic pitch — always consonant, no wrong notes
        v.osc.frequency.setTargetAtTime(PENTATONIC_HZ[wantNote], t, 0.08);
      }
      const on = i < audibleVoices;
      // Quiet per-voice level; higher voices a touch softer to stay warm.
      const lvl = on ? 0.05 * (1 - i * 0.06) * (0.5 + 0.5 * activity) : 0;
      v.targetGain = lvl;
      v.gain.gain.setTargetAtTime(lvl, t, 0.12);
    }

    // Pinch -> bright bell an octave up.
    if (state.pinchPulses > 0) {
      this.chime(height);
    }
  }

  /** A short, bright pentatonic bell — triggered by a pinch-gather. */
  private chime(height: number): void {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    const note = clampInt(
      Math.round(height * (PENTATONIC_HZ.length - 1)),
      4,
      PENTATONIC_HZ.length - 1,
    );
    const freq = PENTATONIC_HZ[note] * 2; // octave up, sparkly

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.0;

    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    const pg = this.ctx.createGain();
    pg.gain.value = 0.35;

    osc.connect(g);
    partial.connect(pg).connect(g);
    g.connect(this.master);

    // Soft attack, long-ish bell decay — no harsh transient.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

    osc.start(t);
    partial.start(t);
    osc.stop(t + 1.5);
    partial.stop(t + 1.5);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.08);
    } catch {
      /* ignore */
    }
    const stopAll = () => {
      for (const v of this.voices) {
        try {
          v.osc.stop();
        } catch {
          /* ignore */
        }
      }
      try {
        this.droneRoot?.stop();
      } catch {
        /* ignore */
      }
      try {
        this.droneFifth?.stop();
      } catch {
        /* ignore */
      }
      this.ctx.close().catch(() => {});
    };
    // Let the fade complete before tearing down nodes.
    setTimeout(stopAll, 250);
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clampInt(x: number, lo: number, hi: number): number {
  x = Math.round(x);
  return x < lo ? lo : x > hi ? hi : x;
}
