/**
 * audio.ts — pelog-like inharmonic ambient drone + breath bloom tones
 * for 408-kids-breath-grove.
 *
 * Tonal world: 5-voice drone tuned to a pelog-like inharmonic set:
 *   ~55 / 82.41 / 110 / 164.5 / 185 Hz, each detuned 8–22 cents
 *   from 12-TET so the chord is warm and "other" (not Western diatonic).
 *
 * Referenced: Indonesian gamelan pelog inharmonic tuning.
 *
 * Architecture:
 *   - Drone oscillators: 5 voices, gate on/off per stage
 *   - Per-exhale bloom: brief bell from the inharmonic set
 *   - Master bus: DynamicsCompressor (limiter) → destination
 *   - All gains set low; no sudden loud transients
 */

export interface GroveAudio {
  setStage: (stage: 1 | 2 | 3 | 4) => void;
  playBloom: (strength: number) => void;
  suspend: () => void;
  resume: () => void;
  close: () => void;
}

// Pelog-like base freqs in Hz, each slightly bent off 12-TET
// Detuning is the "soul" of pelog — each voice has its own character
const PELOG_VOICES = [
  { base: 55.00,  detune:  +14 },   // low drone — slightly sharp
  { base: 82.41,  detune:  -19 },   // E2 analog — flattened (pelog often flat-3)
  { base: 110.00, detune:  +8  },   // A2 — slightly sharp
  { base: 164.81, detune:  -22 },   // E3 — strong pelog flat-3 character
  { base: 185.00, detune:  +11 },   // slightly above F#3 — inharmonic tension
] as const;

// Which voices unlock at each stage (cumulative)
const STAGE_VOICES: Record<1 | 2 | 3 | 4, number> = {
  1: 2,   // 2 low drones
  2: 3,
  3: 4,
  4: 5,
};

// Bloom notes (pick one per exhale) — inharmonic bell tones
const BLOOM_HZ = [220.00, 329.63, 440.00, 493.88, 659.26] as const;
// Detune amounts to keep pelog character in the bloom
const BLOOM_DETUNE = [-18, +14, -8, +20, -15] as const;

function centToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

export function makeGroveAudio(actx: AudioContext): GroveAudio {
  // Master bus: compressor → destination
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  comp.connect(actx.destination);

  // Master gain (very low to be child-safe)
  const masterGain = actx.createGain();
  masterGain.gain.value = 0.28;
  masterGain.connect(comp);

  // Build the 5-voice pelog drone
  const droneGains: GainNode[] = [];

  PELOG_VOICES.forEach((v, i) => {
    const freq = v.base * centToRatio(v.detune);

    // Main oscillator
    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Slight LFO wobble (different per voice)
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.018;
    const lfoGain = actx.createGain();
    lfoGain.gain.value = freq * 0.003;   // tiny pitch wobble
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Overtone for warmth (2nd harmonic at -24dB)
    const osc2 = actx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2 * centToRatio(v.detune * 0.5);
    const g2 = actx.createGain();
    g2.gain.value = 0.25;
    osc2.connect(g2);

    const voiceGain = actx.createGain();
    voiceGain.gain.value = 0;   // start muted; unmuted by setStage

    osc.connect(voiceGain);
    g2.connect(voiceGain);
    voiceGain.connect(masterGain);

    osc.start();
    osc2.start();
    lfo.start();

    droneGains.push(voiceGain);
  });

  let currentStage: 1 | 2 | 3 | 4 = 1;

  function setStage(stage: 1 | 2 | 3 | 4) {
    if (stage === currentStage) return;
    currentStage = stage;
    const activeVoices = STAGE_VOICES[stage];
    const t = actx.currentTime;
    droneGains.forEach((g, i) => {
      // Target volume scales down slightly with higher voice index
      const targetGain = i < activeVoices
        ? (0.10 - i * 0.012)
        : 0;
      g.gain.setTargetAtTime(targetGain, t, 1.5);
    });
  }

  // Initialize stage 1
  setStage(1);

  function playBloom(strength: number) {
    if (actx.state !== "running") return;
    const t = actx.currentTime;
    const noteIdx = Math.floor(Math.random() * BLOOM_HZ.length);
    const baseHz = BLOOM_HZ[noteIdx] * centToRatio(BLOOM_DETUNE[noteIdx]);
    const peakGain = 0.06 + strength * 0.07;

    const bloomGain = actx.createGain();
    bloomGain.gain.setValueAtTime(0.0001, t);
    bloomGain.gain.linearRampToValueAtTime(peakGain, t + 0.04);
    bloomGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    bloomGain.connect(masterGain);

    // Bell body: sine at base freq + slight inharmonic partial
    const bells = [1.0, 2.756, 5.404].map((ratio, i) => {
      const osc = actx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseHz * ratio;
      const g = actx.createGain();
      g.gain.value = i === 0 ? 1 : (i === 1 ? 0.22 : 0.08);
      osc.connect(g);
      g.connect(bloomGain);
      osc.start(t);
      osc.stop(t + 1.5);
      return osc;
    });
    // Suppress lint warning: bloom oscillators are self-managed
    void bells;
  }

  return {
    setStage,
    playBloom,
    suspend: () => { void actx.suspend(); },
    resume:  () => { void actx.resume(); },
    close:   () => { void actx.close(); },
  };
}
