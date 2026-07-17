// audio.ts — Web Audio sequencer voiced by the pendulum's motion.
//
// The tip crossing a vertical pitch-band gridline fires a note. A pentatonic
// scale keeps chaotic timing musical; short marimba-ish plucks keep dense
// crossings from turning to mush. Master chain: per-voice gain -> reverb send
// + dry -> compressor -> clamped master gain (<= 0.3).

// Major pentatonic degrees (semitones) spanning ~two octaves.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export const BAND_COUNT = SCALE.length;
const ROOT_HZ = 196.0; // G3 — warm, not boomy

export interface NoteParams {
  band: number; // scale-degree index (which gridline was crossed)
  gain: number; // 0..1, from angular velocity
  pan: number; // -1..1, from second bob x
  bright: number; // 0..1, from second bob height -> timbre
}

export interface AudioEngine {
  note(p: NoteParams): void;
  activeVoices(): number;
  dispose(): void;
}

/** Build a short exponential-decay noise impulse for a gentle plate reverb. */
function buildImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

export function createAudio(): AudioEngine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // Master: soft compressor then a clamped master gain.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.28; // hard clamp <= 0.3
  comp.connect(master).connect(ctx.destination);

  // Reverb send.
  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(ctx, 1.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  convolver.connect(wet).connect(comp);

  // Short delay for air.
  const delay = ctx.createDelay(0.6);
  delay.delayTime.value = 0.24;
  const fb = ctx.createGain();
  fb.gain.value = 0.24;
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.14;
  delay.connect(fb).connect(delay);
  delay.connect(comp);
  delaySend.connect(delay);

  let voices = 0;
  let lastNoteAt = 0;
  const MIN_GAP = 0.045; // rate-limit; ignore denser crossings
  const MAX_VOICES = 10;

  function note(p: NoteParams): void {
    const now = ctx.currentTime;
    if (now - lastNoteAt < MIN_GAP) return;
    if (voices >= MAX_VOICES) return;
    lastNoteAt = now;

    const deg = SCALE[Math.max(0, Math.min(BAND_COUNT - 1, p.band))];
    const freq = ROOT_HZ * Math.pow(2, deg / 12);

    // Fundamental (triangle) + a quiet sine partial an octave up for the
    // brighter marimba attack. bright controls the partial's level.
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2;

    const pGain = ctx.createGain();
    pGain.gain.value = 0.12 + 0.35 * p.bright;

    const vca = ctx.createGain();
    const peak = 0.16 + 0.5 * Math.max(0, Math.min(1, p.gain));
    const decay = 0.28 + 0.22 * (1 - p.bright);
    vca.gain.setValueAtTime(0.0001, now);
    vca.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    vca.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, p.pan));

    osc.connect(vca);
    partial.connect(pGain).connect(vca);
    vca.connect(panner);
    panner.connect(comp); // dry
    panner.connect(wet.gain.value > 0 ? convolver : comp);
    panner.connect(delaySend);

    voices++;
    osc.start(now);
    partial.start(now);
    const stop = now + decay + 0.05;
    osc.stop(stop);
    partial.stop(stop);
    osc.onended = () => {
      voices--;
      osc.disconnect();
      partial.disconnect();
      pGain.disconnect();
      vca.disconnect();
      panner.disconnect();
    };
  }

  function activeVoices(): number {
    return voices;
  }

  function dispose(): void {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      void ctx.close();
    }, 120);
  }

  return { note, activeVoices, dispose };
}
