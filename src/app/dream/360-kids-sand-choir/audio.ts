// Audio engine for the Sand Choir.
// - D-Dorian "harp strings" plucked by settling grains (Karplus-Strong).
// - Always-on soft ambient D + A pad so it is never silent.
// - Everything routes through a brick-wall DynamicsCompressor limiter (safe for kids).
//
// Reference: Karplus & Strong, "Digital Synthesis of Plucked-String and Drum
// Timbres" (Computer Music Journal, 1983).

// D-Dorian, low -> high: D E F G A B C (D3 .. C4 region).
// D Dorian = white-key scale starting on D, no sharps/flats.
export const STRING_MIDI = [50, 52, 53, 55, 57, 59, 60]; // D3 E3 F3 G3 A3 B3 C4
export const STRING_COUNT = STRING_MIDI.length;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const STRING_FREQ = STRING_MIDI.map(midiToFreq);

export type AudioEngine = {
  ctx: AudioContext;
  // pluck string `i` (0=low) at stereo pan `pan` in [-1,1], gentle `vel` in [0,1]
  pluck: (i: number, pan: number, vel: number) => void;
  resume: () => void;
};

// Pre-render a Karplus-Strong pluck into an AudioBuffer (one per string).
function makePluckBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = Math.max(1.2, 2.6 - freq / 400);
  const bufLen = Math.round(sr * dur);
  const ringLen = Math.max(4, Math.round(sr / freq));
  const ring = new Float32Array(ringLen);
  // Slightly low-passed noise burst as the excitation (softer than white noise).
  let prev = 0;
  for (let i = 0; i < ringLen; i++) {
    const n = Math.random() * 2 - 1;
    prev = 0.6 * prev + 0.4 * n;
    ring[i] = prev * 0.8;
  }
  const data = new Float32Array(bufLen);
  // Karplus-Strong: averaging low-pass in the feedback loop + slow decay.
  const decay = 0.997;
  for (let i = 0; i < bufLen; i++) {
    const ri = i % ringLen;
    data[i] = ring[ri];
    ring[ri] = decay * 0.5 * (ring[ri] + ring[(i + 1) % ringLen]);
  }
  // Gentle fade-out tail so nothing clicks.
  const fade = Math.min(bufLen, Math.round(sr * 0.05));
  for (let i = 0; i < fade; i++) {
    data[bufLen - 1 - i] *= i / fade;
  }
  const buf = ctx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

export function makeAudioEngine(ctx: AudioContext): AudioEngine {
  // Final limiter — brick wall so it can never get loud / harsh.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.9;

  master.connect(limiter).connect(ctx.destination);

  // Pre-render plucks.
  const buffers = STRING_FREQ.map((f) => makePluckBuffer(ctx, f));

  // ---- Ambient pad: soft D + A drone (sub + octave), gently shimmering. ----
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padGain.connect(master);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 700;
  padFilter.Q.value = 0.3;
  padFilter.connect(padGain);

  const padNotes = [38, 45, 50, 57]; // D2 A2 D3 A3
  padNotes.forEach((midi, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.5 : 0.28;
    // slow detune drift via a sine LFO -> gives a living pad
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + idx * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1.5 + idx; // cents of drift
    lfo.connect(lfoGain).connect(osc.detune);
    osc.connect(g).connect(padFilter);
    osc.start();
    lfo.start();
  });
  // Fade pad in.
  padGain.gain.setTargetAtTime(0.06, ctx.currentTime, 2.0);

  function pluck(i: number, pan: number, vel: number): void {
    const idx = Math.max(0, Math.min(STRING_COUNT - 1, i));
    const src = ctx.createBufferSource();
    src.buffer = buffers[idx];

    const g = ctx.createGain();
    // gentle velocity, lower strings a touch quieter so highs sparkle
    const base = 0.22 + idx * 0.012;
    g.gain.value = base * (0.4 + 0.6 * Math.max(0, Math.min(1, vel)));

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    src.connect(g).connect(panner).connect(master);
    src.start();
  }

  function resume(): void {
    if (ctx.state === "suspended") void ctx.resume();
  }

  return { ctx, pluck, resume };
}
