// Aurora Tilt Audio Engine
// Warm modal pad synth with tilt-driven tension voicing.
//
// Home (tension=0): open fifth + octave, consonant sus2 warmth.
// Tense (tension=1): upper partials slide to sus4/added-9 voicing + slow tremolo.
//
// Signal chain: oscillators → gain → lowpass (~8.8kHz) → DynamicsCompressor → destination
// All voices sine + detuned triangle, kids-safe softness.

export interface AuroraAudio {
  setTension: (t: number) => void; // 0 = calm home, 1 = full tilt tension
  close: () => void;
}

// Root C3 = 130.81 Hz
const ROOT = 130.81;

// Home voicing (open, consonant): C3, G3, C4, G4
const HOME_RATIOS  = [1, 1.5,    2,    3   ] as const;
const HOME_GAINS   = [0.30, 0.20, 0.16, 0.10] as const;

// Tense voicing: C3, F3 (sus4), D4 (add9), Bb4 (flat-7) — yearning but not ugly
const TENSE_RATIOS = [1, 1.3333, 2.25, 3.5 ] as const;
const TENSE_GAINS  = [0.28, 0.18, 0.14, 0.08] as const;

// Per-voice detuning (cents) for warm ensemble thickening
const DETUNE_CENTS = [0, +4, -3, +7] as const;

function centsToRatio(c: number): number {
  return Math.pow(2, c / 1200);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Voice {
  osc:     OscillatorNode;
  osc2:    OscillatorNode;   // triangle sub-layer for warmth
  gain:    GainNode;
  gain2:   GainNode;
  lfo?:    OscillatorNode;   // tremolo LFO (upper voices when tense)
  lfoGain?:GainNode;
}

export function makeAuroraAudio(actx: AudioContext): AuroraAudio {
  // ── Master chain: gain → lowpass → compressor → destination ──────────────
  const master = actx.createGain();
  master.gain.value = 0.72;

  const lpf = actx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 8800; // < 9kHz kids-safe softness
  lpf.Q.value = 0.7;

  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -6;  // brick-wall ~ -6 dBFS
  comp.knee.value      = 4;
  comp.ratio.value     = 20;
  comp.attack.value    = 0.003;
  comp.release.value   = 0.18;

  master.connect(lpf);
  lpf.connect(comp);
  comp.connect(actx.destination);

  // ── Four voices (one per partial) ────────────────────────────────────────
  const voices: Voice[] = [];

  for (let i = 0; i < 4; i++) {
    const detRatio = centsToRatio(DETUNE_CENTS[i]);
    const baseHz   = ROOT * HOME_RATIOS[i] * detRatio;

    const osc  = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = baseHz;
    gain.gain.value = HOME_GAINS[i];

    // Triangle sub-layer: +2.5 cents offset for natural beating warmth
    const osc2  = actx.createOscillator();
    const gain2 = actx.createGain();
    osc2.type = "triangle";
    osc2.frequency.value = baseHz * centsToRatio(2.5);
    gain2.gain.value = HOME_GAINS[i] * 0.35;

    let lfo: OscillatorNode | undefined;
    let lfoGain: GainNode | undefined;

    if (i >= 2) {
      // Tremolo LFO for upper voices: silent at rest, grows with tension
      lfo = actx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 3.2 + i * 0.7; // 3.2 / 3.9 Hz
      lfoGain = actx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
    }

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(master);
    gain2.connect(master);

    osc.start();
    osc2.start();

    voices.push({ osc, osc2, gain, gain2, lfo, lfoGain });
  }

  // ── Tension dial ─────────────────────────────────────────────────────────
  // Voice-leads all four partials between home and tense voicings.
  // Called from requestAnimationFrame — uses setTargetAtTime for smooth glide.

  let prevTension = 0;

  function setTension(t: number): void {
    const now  = actx.currentTime;
    const glide = 0.35;
    const delta = Math.abs(t - prevTension);
    prevTension = t;

    for (let i = 0; i < voices.length; i++) {
      const detRatio = centsToRatio(DETUNE_CENTS[i]);
      const homeHz   = ROOT * HOME_RATIOS[i]  * detRatio;
      const tenseHz  = ROOT * TENSE_RATIOS[i] * detRatio;
      const targetHz = lerp(homeHz, tenseHz, t);

      const homeG   = HOME_GAINS[i];
      const tenseG  = TENSE_GAINS[i];
      const targetG = lerp(homeG, tenseG, t);

      voices[i].osc.frequency.setTargetAtTime(targetHz, now, glide);
      voices[i].osc2.frequency.setTargetAtTime(targetHz * centsToRatio(2.5), now, glide);
      voices[i].gain.gain.setTargetAtTime(targetG, now, glide);
      voices[i].gain2.gain.setTargetAtTime(targetG * 0.35, now, glide);

      // Tremolo for upper voices
      if (i >= 2 && voices[i].lfoGain && voices[i].lfo) {
        const depth = t * targetG * 0.55;
        const tc    = delta > 0.05 ? 0.5 : 0.15;
        voices[i].lfoGain!.gain.setTargetAtTime(depth, now, tc);
        voices[i].lfo!.frequency.setTargetAtTime(lerp(2.5, 7.0, t), now, 0.6);
      }
    }

    // Master gain subtly louder when tense
    master.gain.setTargetAtTime(lerp(0.62, 0.80, t), now, 0.4);
  }

  // Fade in on start
  master.gain.setValueAtTime(0, actx.currentTime);
  master.gain.linearRampToValueAtTime(0.62, actx.currentTime + 1.2);

  // ── Close ─────────────────────────────────────────────────────────────────
  function close(): void {
    const now = actx.currentTime;
    master.gain.setTargetAtTime(0, now, 0.3);
    setTimeout(() => {
      for (const v of voices) {
        try { v.osc.stop(); }  catch { /* already stopped */ }
        try { v.osc2.stop(); } catch { /* already stopped */ }
        if (v.lfo) try { v.lfo.stop(); } catch { /* already stopped */ }
      }
      actx.close().catch(() => undefined);
    }, 900);
  }

  return { setTension, close };
}
