/**
 * audio.ts — Firebird voice synth for 524-kids-hand-firebird
 *
 * Architecture:
 *   Master bus: masterGain → lowpass (≤8 kHz) → DynamicsCompressor brick-wall → destination
 *   Ambient pad: 3 pentatonic sines, always-on, never silent
 *   Voice: warm formant-like sine choir that blooms when hand opens
 *   Harmonic sparkle: higher pentatonic tones appear when fingers spread
 *
 * MUST be created inside a user gesture (iOS AudioContext unlock).
 * All parameter changes use setTargetAtTime for smooth, safe envelopes.
 * No sudden loud transients — master limited at −6 dBFS.
 */

// Pentatonic scale (C4 major pentatonic, just intonation)
// C4 D4 E4 G4 A4 — ratios 1, 9/8, 5/4, 3/2, 5/3
const C4 = 261.63;
const PENTA_FREQS = [
  C4,                    // C4
  C4 * (9 / 8),          // D4
  C4 * (5 / 4),          // E4
  C4 * (3 / 2),          // G4
  C4 * (5 / 3),          // A4
];

// Lower octave for pad
const PENTA_LOW = PENTA_FREQS.map((f) => f / 2);

export interface FirebirdAudio {
  ctx: AudioContext;
  /**
   * Update synth state every frame (or ~30fps).
   * openness: 0=fist, 1=fully open
   * height: 0=bottom, 1=top of screen
   * spread: 0=fingers together, 1=fan
   * speed: hand motion speed 0..1
   */
  update(params: {
    openness: number;
    height: number;
    spread: number;
    speed: number;
  }): void;
  dispose(): void;
}

export function buildFirebirdAudio(): FirebirdAudio {
  const Ctx =
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext as typeof AudioContext;
  const ctx = new Ctx();

  // ── Master bus ─────────────────────────────────────────────────────────────
  // masterGain → lowpass → limiter → destination
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);

  const masterLp = ctx.createBiquadFilter();
  masterLp.type = "lowpass";
  masterLp.frequency.value = 7800;
  masterLp.Q.value = 0.5;
  masterLp.connect(limiter);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.22;
  masterGain.connect(masterLp);

  // ── Ambient pad — always on, never silent ──────────────────────────────────
  // 3 detuned unison pairs on C4/G4/E4 (tonic, 5th, 3rd)
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 800;
  padFilter.Q.value = 0.6;
  padFilter.connect(masterGain);

  const padGain = ctx.createGain();
  padGain.gain.value = 0.35;
  padGain.connect(padFilter);

  const padOscs: OscillatorNode[] = [];
  const padNotes = [0, 2, 4]; // C E G (indices into PENTA_LOW)
  for (const noteIdx of padNotes) {
    const baseFreq = PENTA_LOW[noteIdx];
    for (const detune of [-3, 3]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseFreq * Math.pow(2, detune / 1200);
      const g = ctx.createGain();
      g.gain.value = 0.06;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      padOscs.push(osc);
    }
    // gentle 2nd harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = baseFreq * 2.005;
    const g2 = ctx.createGain();
    g2.gain.value = 0.025;
    osc2.connect(g2);
    g2.connect(padGain);
    osc2.start();
    padOscs.push(osc2);
  }

  // ── Voice — warm choir that blooms with hand openness ─────────────────────
  // 5-voice pentatonic choir, gain grows as hand opens
  const voiceFilter = ctx.createBiquadFilter();
  voiceFilter.type = "lowpass";
  voiceFilter.frequency.value = 1200;
  voiceFilter.Q.value = 0.8;
  voiceFilter.connect(masterGain);

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.0; // starts silent, blooms
  voiceGain.connect(voiceFilter);

  const voiceOscs: OscillatorNode[] = [];
  for (let i = 0; i < PENTA_FREQS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = PENTA_FREQS[i];
    const g = ctx.createGain();
    g.gain.value = 0.07;
    osc.connect(g);
    g.connect(voiceGain);
    osc.start();
    voiceOscs.push(osc);

    // detuned pair for warmth
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = PENTA_FREQS[i] * 1.006;
    const g2 = ctx.createGain();
    g2.gain.value = 0.04;
    osc2.connect(g2);
    g2.connect(voiceGain);
    osc2.start();
    voiceOscs.push(osc2);
  }

  // ── Sparkle layer — high harmonic tones for spread/speed ──────────────────
  const sparkleGain = ctx.createGain();
  sparkleGain.gain.value = 0.0;
  sparkleGain.connect(masterGain);

  const sparkleFilter = ctx.createBiquadFilter();
  sparkleFilter.type = "bandpass";
  sparkleFilter.frequency.value = 3200;
  sparkleFilter.Q.value = 1.2;
  sparkleFilter.connect(masterGain);

  // High sparkle oscillators on 2 octaves up
  const sparkleOscs: OscillatorNode[] = [];
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = PENTA_FREQS[i] * 4;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    osc.connect(g);
    g.connect(sparkleGain);
    g.connect(sparkleFilter);
    osc.start();
    sparkleOscs.push(osc);
  }

  // ── State-driven update ────────────────────────────────────────────────────
  function update(params: {
    openness: number;
    height: number;
    spread: number;
    speed: number;
  }): void {
    const now = ctx.currentTime;
    const { openness, height, spread, speed } = params;

    // Voice blooms with openness — smooth 0.3s tau
    const targetVoiceGain = openness * openness * 0.5;
    voiceGain.gain.setTargetAtTime(targetVoiceGain, now, 0.3);

    // Voice pitch mapped from hand height (pentatonic, nothing wrong)
    // height 0→ C4, height 1→ A5 (one octave + a 6th up)
    const heightIdx = Math.min(PENTA_FREQS.length - 1, Math.floor(height * PENTA_FREQS.length));
    const baseFreq = PENTA_FREQS[heightIdx];
    for (let i = 0; i < PENTA_FREQS.length; i++) {
      const targetFreq = baseFreq * (PENTA_FREQS[i] / PENTA_FREQS[0]);
      if (voiceOscs[i * 2]) {
        voiceOscs[i * 2].frequency.setTargetAtTime(
          Math.min(targetFreq, 3000),
          now,
          0.15,
        );
      }
      if (voiceOscs[i * 2 + 1]) {
        voiceOscs[i * 2 + 1].frequency.setTargetAtTime(
          Math.min(targetFreq * 1.006, 3000),
          now,
          0.15,
        );
      }
    }

    // Pad filter opens with openness
    padFilter.frequency.setTargetAtTime(
      600 + openness * 1200 + height * 300,
      now,
      0.8,
    );

    // Voice filter brightens with spread
    voiceFilter.frequency.setTargetAtTime(
      1000 + spread * 2000 + openness * 800,
      now,
      0.4,
    );

    // Sparkle grows with spread + speed
    const targetSparkle = (spread * 0.5 + speed * 0.3) * openness;
    sparkleGain.gain.setTargetAtTime(targetSparkle * 0.15, now, 0.2);
    sparkleFilter.frequency.setTargetAtTime(
      2000 + spread * 2000 + height * 1000,
      now,
      0.3,
    );

    // Master warmth rises with openness
    masterGain.gain.setTargetAtTime(
      0.18 + openness * 0.08 + speed * 0.03,
      now,
      0.5,
    );
  }

  function dispose(): void {
    for (const osc of [...padOscs, ...voiceOscs, ...sparkleOscs]) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    void ctx.close();
  }

  return { ctx, update, dispose };
}
