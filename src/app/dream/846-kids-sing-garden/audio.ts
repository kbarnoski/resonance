// Pure Web Audio API helpers for the singing garden.
// No samples, no network, no recording stored. Mic is used ONLY for
// live pitch/RMS analysis and is NEVER wired to output.

// C-major pentatonic frequencies across a few octaves. Octave-collapsing a
// detected pitch onto this set means there is never a "wrong" note.
// C  D  E  G  A  (pentatonic) over C2..C6
export const PENTATONIC: number[] = (() => {
  const semis = [0, 2, 4, 7, 9]; // C D E G A
  const out: number[] = [];
  for (let oct = 2; oct <= 6; oct++) {
    for (const s of semis) {
      // C2 = 65.41 Hz base
      out.push(65.41 * Math.pow(2, oct - 2 + s / 12));
    }
  }
  return out.sort((a, b) => a - b);
})();

// Snap an arbitrary frequency to the nearest pentatonic pitch.
export function snapToPentatonic(freq: number): number {
  let best = PENTATONIC[0];
  let bestD = Infinity;
  for (const p of PENTATONIC) {
    const d = Math.abs(Math.log2(p) - Math.log2(freq));
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// Master output chain (kid-safe). Returns the input node to feed voices into.
export interface MasterChain {
  input: GainNode;
  setMasterGain: (g: number) => void;
}

export function buildMasterChain(actx: AudioContext): MasterChain {
  const master = actx.createGain();
  master.gain.value = 0.28;

  const lowpass = actx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000;

  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(actx.destination);

  return {
    input: master,
    setMasterGain: (g: number) => {
      master.gain.setTargetAtTime(g, actx.currentTime, 0.05);
    },
  };
}

// Always-on soft ambient pad: C2 + G2 drone so it never feels silent.
export function startAmbientPad(actx: AudioContext, dest: AudioNode): () => void {
  const freqs = [65.41, 98.0]; // C2, G2
  const oscs: OscillatorNode[] = [];
  const padGain = actx.createGain();
  padGain.gain.value = 0.0;
  padGain.gain.setTargetAtTime(0.16, actx.currentTime, 1.2);
  padGain.connect(dest);

  for (const f of freqs) {
    const o = actx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    // gentle slow detune wobble via a second osc-shaped LFO
    const lfo = actx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lfoGain = actx.createGain();
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain);
    lfoGain.connect(o.detune);

    const og = actx.createGain();
    og.gain.value = 0.5;
    o.connect(og);
    og.connect(padGain);
    o.start();
    lfo.start();
    oscs.push(o, lfo);
  }

  return () => {
    padGain.gain.setTargetAtTime(0.0, actx.currentTime, 0.3);
    for (const o of oscs) {
      try {
        o.stop(actx.currentTime + 0.6);
      } catch {
        // already stopped
      }
    }
  };
}

// Trigger a soft bell / bloom voice at a given frequency.
// hue feeds nothing here; loudness scales the bloom brightness via gain.
export function playBell(
  actx: AudioContext,
  dest: AudioNode,
  freq: number,
  level: number,
): void {
  const now = actx.currentTime;
  const o = actx.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;

  // gentle second partial for warmth
  const o2 = actx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 2.01;
  const o2g = actx.createGain();
  o2g.gain.value = 0.25;

  const g = actx.createGain();
  const peak = Math.min(0.5, 0.18 + level * 0.5);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

  o.connect(g);
  o2.connect(o2g);
  o2g.connect(g);
  g.connect(dest);

  o.start(now);
  o2.start(now);
  o.stop(now + 2.6);
  o2.stop(now + 2.6);
}

// --- Pitch detection (Chris Wilson autocorrelation / ACF) -----------------

export interface PitchResult {
  freq: number; // -1 if no confident pitch
  rms: number;
}

// Run autocorrelation over a windowed time-domain buffer.
// Returns detected fundamental frequency, or -1 when below noise floor.
export function runAutocorrelation(
  buf: Float32Array,
  sampleRate: number,
): PitchResult {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);

  // Noise floor: reject silence so we never grow noise.
  if (rms < 0.012) return { freq: -1, rms };

  // Trim leading/trailing low-amplitude samples.
  let r1 = 0;
  let r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buf[size - i]) < thres) {
      r2 = size - i;
      break;
    }
  }
  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 64) return { freq: -1, rms };

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += trimmed[i] * trimmed[i + lag];
    }
    c[lag] = sum;
  }

  // Find first dip then the peak after it.
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return { freq: -1, rms };

  // Parabolic interpolation for sub-sample accuracy.
  let T0 = maxpos;
  const x1 = c[maxpos - 1] ?? c[maxpos];
  const x2 = c[maxpos];
  const x3 = c[maxpos + 1] ?? c[maxpos];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  if (freq < 60 || freq > 1200) return { freq: -1, rms };
  return { freq, rms };
}
