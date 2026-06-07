// Audio engine for the Cascade Bloom.
//
// - Bell/mallet voice per topple: row → D-Dorian pitch (D3..A4), sine + 2nd
//   partial, exponential decay, lowpass softening. Never harsh.
// - Sustained D-Dorian drone pad (2–3 detuned oscillators, breathing lowpass).
// - All voices → DynamicsCompressor limiter; simultaneous voice cap (~8).
//
// D-Dorian scale: D E F G A B C (no sharps, no flats, no C major pentatonic).

const D_DORIAN_MIDI: number[] = [
  // D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4
  50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69,
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const SCALE_FREQS = D_DORIAN_MIDI.map(midiToFreq);

export type AudioEngine = {
  ctx: AudioContext;
  // Play a bell note for a topple at grid row `row` (0=top) in a GRID_H grid.
  // pan: stereo [-1,1] from grid x, vel: [0,1] humanization.
  playBurst: (row: number, gridH: number, pan: number, vel: number) => void;
  resume: () => void;
};

export function makeAudioEngine(ctx: AudioContext): AudioEngine {
  // ── Limiter / master ────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(limiter);

  // ── Drone pad ───────────────────────────────────────────────────────────────
  // 3 detuned oscillators on D Dorian root + fifth + octave (D2, A2, D3)
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padGain.connect(master);

  const padLPF = ctx.createBiquadFilter();
  padLPF.type = "lowpass";
  padLPF.frequency.value = 600;
  padLPF.Q.value = 0.5;
  padLPF.connect(padGain);

  // "Breathing" LFO on the filter cutoff
  const breathLFO = ctx.createOscillator();
  breathLFO.type = "sine";
  breathLFO.frequency.value = 0.12;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 150;
  breathLFO.connect(breathGain).connect(padLPF.frequency);
  breathLFO.start();

  // Drone oscillators
  const droneMidis = [38, 45, 50]; // D2, A2, D3
  droneMidis.forEach((midi, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);

    const detuneAmt = [0, 2.5, -1.8][idx];
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = [0.07, 0.11, 0.09][idx];
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = detuneAmt + 1.5;
    lfo.connect(lfoGain).connect(osc.detune);
    lfo.start();

    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.5 : 0.3;
    osc.connect(g).connect(padLPF);
    osc.start();
  });

  // Fade pad in slowly
  padGain.gain.setTargetAtTime(0.055, ctx.currentTime, 3.0);

  // ── Voice pool: cap simultaneous voices ─────────────────────────────────────
  // We track active voices so we can release old ones when over the cap.
  const MAX_VOICES = 8;
  // Simple ring-buffer of gain nodes so we can silence the oldest
  const voiceGains: GainNode[] = [];

  function trimVoices(): void {
    if (voiceGains.length > MAX_VOICES) {
      const excess = voiceGains.splice(0, voiceGains.length - MAX_VOICES);
      for (const g of excess) {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      }
    }
  }

  // ── Bell / mallet voice ─────────────────────────────────────────────────────
  // Sine fundamental + quieter second partial (sine * 2.76 freq) + quick decay.
  // Lowpass to keep it warm, not piercing.
  function playBurst(
    row: number,
    gridH: number,
    pan: number,
    vel: number
  ): void {
    if (ctx.state === "suspended") void ctx.resume();

    // Map row (0=top = highest note) → scale index
    const t = row / Math.max(1, gridH - 1); // 0=top, 1=bottom
    const noteIdx = Math.round((1 - t) * (SCALE_FREQS.length - 1));
    const freq = SCALE_FREQS[Math.max(0, Math.min(SCALE_FREQS.length - 1, noteIdx))];

    const now = ctx.currentTime;
    const decayTime = 0.8 + Math.random() * 0.3; // gentle variation
    const velAmp = 0.15 + 0.35 * Math.max(0, Math.min(1, vel));

    // Per-voice gain → panner → master
    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(velAmp, now);
    vGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 2200;
    lpf.Q.value = 0.5;

    vGain.connect(lpf).connect(panner).connect(master);

    // Fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;
    const g1 = ctx.createGain();
    g1.gain.value = 0.7;
    osc1.connect(g1).connect(vGain);

    // 2nd partial (~2.76× — bell-like, slightly inharmonic)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.76;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    // second partial decays faster
    g2.gain.setValueAtTime(0.22, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + decayTime * 0.45);
    osc2.connect(g2).connect(vGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + decayTime + 0.05);
    osc2.stop(now + decayTime + 0.05);

    voiceGains.push(vGain);
    trimVoices();
  }

  function resume(): void {
    if (ctx.state === "suspended") void ctx.resume();
  }

  return { ctx, playBurst, resume };
}
