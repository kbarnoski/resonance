// One independent voice per loop layer → a phasing round/canon.
//
// Each layer maps its replaying path to a sustained voice: centroid-Y →
// pitch quantized to a warm pentatonic scale, energy → amplitude. Layers run
// on their own loop clocks, so N loops = an N-voice drifting round. LIVE-you
// is the brightest top voice. All voices share a synthesized-impulse reverb
// and pass a soft compressor for headroom. Web Audio oscillators only.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic degrees (semitones)

/** Scale index (pentatonic degrees across octaves) → frequency, base A3. */
function scaleFreq(index: number): number {
  const len = PENTA.length;
  const octave = Math.floor(index / len);
  const deg = ((index % len) + len) % len;
  const semis = PENTA[deg] + 12 * octave;
  return 220 * Math.pow(2, semis / 12);
}

/** Screen-Y (down = +1) → scale index; higher on screen = higher pitch. */
function yToIndex(cy: number, span: number, offset: number): number {
  const up = -cy; // up positive
  return Math.round(((up + 1) / 2) * span) + offset;
}

function makeImpulse(
  ctx: AudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  live: boolean;
}

export class LooperAudio {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly conv: ConvolverNode;
  private readonly voices = new Map<number, Voice>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setTargetAtTime(0.85, now, 0.8);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.7;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    this.conv = ctx.createConvolver();
    this.conv.buffer = makeImpulse(ctx, 2.8, 2.6);

    this.dry.connect(this.master);
    this.wet.connect(this.conv);
    this.conv.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  ensure(id: number, live: boolean, pan: number): void {
    if (this.voices.has(id)) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = live ? "triangle" : "sine";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = live ? 2800 : 1500;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(p);
    p.connect(this.dry);
    p.connect(this.wet);
    osc.start();

    this.voices.set(id, { osc, filter, gain, pan: p, live });
  }

  update(id: number, cy: number, energy: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    const idx = v.live ? yToIndex(cy, 6, 8) : yToIndex(cy, 8, 0);
    const freq = scaleFreq(idx);
    const now = this.ctx.currentTime;
    v.osc.frequency.setTargetAtTime(freq, now, 0.09);
    const cap = v.live ? 0.15 : 0.1;
    const target = cap * Math.min(1, 0.22 + energy * 1.5);
    v.gain.gain.setTargetAtTime(target, now, 0.12);
  }

  remove(id: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0.0001, now, 0.12);
    v.osc.stop(now + 0.5);
    v.osc.onended = () => {
      v.osc.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
      v.pan.disconnect();
    };
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    this.voices.forEach((v) => {
      try {
        v.osc.stop(now);
      } catch {
        // already stopped
      }
      v.osc.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
      v.pan.disconnect();
    });
    this.voices.clear();
    this.dry.disconnect();
    this.wet.disconnect();
    this.conv.disconnect();
    this.master.disconnect();
    this.comp.disconnect();
  }
}
