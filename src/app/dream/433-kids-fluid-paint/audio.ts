// Audio engine for 433-kids-fluid-paint
// Sustained pad sonification — NOT percussion.
// Mapping: energy/dye coverage → pad volume + brightness
//          dominant color hue → filter cutoff (warmer = brighter)
//          swirl velocity → tremolo rate + depth
// All sound routed through DynamicsCompressor (threshold -8dB, ratio 20:1)
// so it can NEVER blast small ears.

export interface AudioEngine {
  ctx: AudioContext;
  /** Inject energy from a paint event (JS-side accumulator, no GPU readback) */
  injectEnergy: (amount: number) => void;
  /** Set dominant hue 0..360 (called from color-picker choice, not GPU readback) */
  setHue: (hue: number) => void;
  /** Set swirl energy level 0..1 */
  setSwirl: (swirl: number) => void;
  /** Resume after tap-to-start gesture */
  resume: () => Promise<void>;
  destroy: () => void;
}

// Warm major-9 chord (open voicing): C2, G2, E3, B3, D4
// Gives a dreamy, consonant, non-percussive cloud of sound.
const CHORD_HZ = [65.41, 98.0, 164.81, 246.94, 293.66];

export function createAudioEngine(): AudioEngine {
  const ctx = new AudioContext();

  // ── Master chain: compressor → master gain → destination ──────────────────
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 3;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.22;

  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  // ── Filter: warm/cool timbre based on hue ─────────────────────────────────
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.7;
  filter.connect(compressor);

  // ── Tremolo (swirl-driven) ─────────────────────────────────────────────────
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 1.0;
  tremoloGain.connect(filter);

  const tremoloLFO = ctx.createOscillator();
  tremoloLFO.type = 'sine';
  tremoloLFO.frequency.value = 0.5; // Hz, will vary with swirl
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.0; // starts silent
  tremoloLFO.connect(tremoloDepth);
  // LFO modulates gain around 1.0 using a constant + depth
  const tremoloBase = ctx.createGain();
  tremoloBase.gain.value = 0.0; // carrier offset
  // We use a different approach: multiply via gain node math
  // Actually wire: tremoloLFO → tremoloDepthGain → tremoloGain.gain
  // But AudioParam modulation adds to current value, so set gain.value = 1.0
  // and let LFO oscillate ± depth around it:
  tremoloGain.gain.value = 1.0;
  tremoloDepth.connect(tremoloGain.gain);
  tremoloLFO.start();

  // ── Pad oscillators (chord) ────────────────────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0; // driven by energy
  padGain.connect(tremoloGain);

  const oscs: OscillatorNode[] = CHORD_HZ.map((hz, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = hz;
    // Slight detuning for warmth
    osc.detune.value = (i % 3 - 1) * 4;
    const oscGain = ctx.createGain();
    oscGain.gain.value = i === 0 ? 0.35 : 0.18; // bass note louder
    osc.connect(oscGain);
    oscGain.connect(padGain);
    osc.start();
    return osc;
  });

  // ── Ambient noise bed (very quiet, never-silent) ──────────────────────────
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 120;
  noiseFilter.Q.value = 0.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.008; // barely audible ambient bed
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(compressor);
  noiseSource.start();

  // ── State ─────────────────────────────────────────────────────────────────
  let energy = 0.0; // 0..1, decays over time
  let currentHue = 270; // violet default
  let swirlLevel = 0.0;
  let rafId = 0;

  function updateAudio() {
    // Decay energy
    energy *= 0.985;

    // Pad volume tracks energy (0.04 = quiet ambient pad, up to 0.7)
    const targetGain = 0.04 + energy * 0.66;
    padGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.15);

    // Hue → filter cutoff: warm hues (0-60°, 300-360°) → brighter, cool (180-240°) → darker
    // Normalize to 0..1 warmth
    const warmth = 1.0 - Math.abs(((currentHue - 30 + 360) % 360) / 360.0 - 0.5) * 2.0;
    const cutoff = 350 + warmth * 2500 + energy * 800;
    filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.4);

    // Swirl → tremolo
    const tremoloRate = 0.3 + swirlLevel * 4.0;
    const tremoloAmt = swirlLevel * 0.25;
    tremoloLFO.frequency.setTargetAtTime(tremoloRate, ctx.currentTime, 0.2);
    tremoloDepth.gain.setTargetAtTime(tremoloAmt, ctx.currentTime, 0.3);

    // Decay swirl
    swirlLevel *= 0.97;

    rafId = requestAnimationFrame(updateAudio);
  }

  updateAudio();

  function injectEnergy(amount: number) {
    energy = Math.min(1.0, energy + amount);
    swirlLevel = Math.min(1.0, swirlLevel + amount * 0.5);
  }

  function setHue(hue: number) {
    currentHue = hue;
  }

  function setSwirl(swirl: number) {
    swirlLevel = Math.min(1.0, swirlLevel + swirl);
  }

  async function resume() {
    if (ctx.state === 'suspended') await ctx.resume();
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    oscs.forEach(o => { try { o.stop(); } catch { /* ignore */ } });
    try { noiseSource.stop(); } catch { /* ignore */ }
    try { ctx.close(); } catch { /* ignore */ }
  }

  return { ctx, injectEnergy, setHue, setSwirl, resume, destroy };
}
