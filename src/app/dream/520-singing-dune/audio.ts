/**
 * audio.ts — Booming-dune granular drone engine
 *
 * Real acoustic physics of singing/booming sand dunes:
 *   - A wave-trapped resonance whose fundamental pitch scales with grain shear rate
 *   - Frequency band: ~70–110 Hz (aeolian low-register)
 *   - During an avalanche: f rises, density thickens, grain bursts emerge
 *   - At repose: f sinks, drone attenuates to a whisper
 *
 * Signal chain:
 *   oscillators (just-intonation stack)
 *     → BiquadFilter (lowpass resonant, fc driven by shear)
 *       → GainNode (kinetic energy envelope)
 *         → grain-burst convolver path
 *           → DynamicsCompressor (brick-wall limiter)
 *             → master output
 *
 * Reference: Andreotti, Bonneau, Clément et al. —
 *   "The song of dunes as a wave-trapped acoustic resonance" (PNAS 2008).
 */

export interface DuneAudioState {
  /** 0–1: total kinetic energy normalised. Drives drone density. */
  kineticEnergy: number;
  /** 0–1: mean grain shear rate. Maps to pitch bend ~70–110 Hz. */
  shearRate: number;
  /** 0–1: impulsive avalanche trigger. Emits grain burst. */
  avalanchePulse: number;
}

export interface DuneAudio {
  update(state: DuneAudioState): void;
  dispose(): void;
  ctx: AudioContext;
}

/** Just-intonation ratios above the root (1:1, 5:4, 3:2, 9:5, 2:1) */
const JI_RATIOS = [1, 1.25, 1.5, 1.8, 2];

/** Root frequency when fully settled */
const F_BASE = 72; // Hz
/** Root frequency at peak avalanche */
const F_PEAK = 108; // Hz

export function buildDuneAudio(): DuneAudio {
  const ctx = new AudioContext({ sampleRate: 44100 });

  // ── Master limiter ──────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(ctx.destination);

  // ── Master gain ─────────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.28;
  masterGain.connect(limiter);

  // ── Resonant lowpass (drone colour / shear mapping) ─────────────────────────
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  lp.Q.value = 3.5;
  lp.connect(masterGain);

  // ── Drone oscillator stack (just-intonation) ────────────────────────────────
  const oscGains: GainNode[] = [];
  const oscs: OscillatorNode[] = [];

  JI_RATIOS.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    // Fundamental is sawtooth; harmonics use triangle for warmth
    osc.type = i === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = F_BASE * ratio;

    const g = ctx.createGain();
    // Attenuate upper harmonics (natural 1/n roll-off)
    g.gain.value = 0.0; // starts silent
    osc.connect(g);
    g.connect(lp);

    osc.start();
    oscs.push(osc);
    oscGains.push(g);
  });

  // ── Grain-burst noise path ──────────────────────────────────────────────────
  const burstGain = ctx.createGain();
  burstGain.gain.value = 0;
  burstGain.connect(masterGain);

  const burstFilter = ctx.createBiquadFilter();
  burstFilter.type = "bandpass";
  burstFilter.frequency.value = 180;
  burstFilter.Q.value = 1.2;
  burstFilter.connect(burstGain);

  // White noise buffer (2s)
  const noiseLen = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

  // Looping noise source
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  noise.connect(burstFilter);
  noise.start();

  // ── Sub-bass rumble (always present, very quiet) ────────────────────────────
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = F_BASE * 0.5;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.018;
  sub.connect(subGain);
  subGain.connect(masterGain);
  sub.start();

  // ── State tracking ───────────────────────────────────────────────────────────
  let lastAvalanche = 0;

  function update(state: DuneAudioState): void {
    const now = ctx.currentTime;
    const { kineticEnergy, shearRate, avalanchePulse } = state;

    // Root frequency — bends up during avalanche
    const f0 = F_BASE + (F_PEAK - F_BASE) * shearRate;

    // Update each oscillator frequency + gain
    oscs.forEach((osc, i) => {
      const ratio = JI_RATIOS[i];
      osc.frequency.setTargetAtTime(f0 * ratio, now, 0.12);

      // Harmonic amplitude: 1/ratio * energy * natural envelope
      const amp = (1 / (i + 1)) * kineticEnergy * 0.18;
      oscGains[i].gain.setTargetAtTime(amp, now, 0.08);
    });

    // Resonant filter FC: 120 + shear * 600 → bright during avalanche
    const fc = 120 + shearRate * 700;
    lp.frequency.setTargetAtTime(fc, now, 0.1);
    lp.Q.setTargetAtTime(2.5 + kineticEnergy * 4, now, 0.15);

    // Grain bursts: fire on avalanche pulse (debounced 80ms)
    if (avalanchePulse > 0.15 && now - lastAvalanche > 0.08) {
      lastAvalanche = now;
      const burstAmp = 0.06 + avalanchePulse * 0.12;
      burstGain.gain.cancelScheduledValues(now);
      burstGain.gain.setValueAtTime(0, now);
      burstGain.gain.linearRampToValueAtTime(burstAmp, now + 0.015);
      burstGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + avalanchePulse * 0.2);

      // Shift burst filter to mimic grain collision pitch
      burstFilter.frequency.setTargetAtTime(
        140 + shearRate * 300 + Math.random() * 80,
        now,
        0.02
      );
    }
  }

  function dispose(): void {
    oscs.forEach((o) => o.stop());
    sub.stop();
    noise.stop();
    void ctx.close();
  }

  return { update, dispose, ctx };
}
