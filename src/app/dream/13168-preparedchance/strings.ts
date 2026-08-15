// ─────────────────────────────────────────────────────────────────────────────
// strings.ts — a Karplus-Strong plucked-waveguide voice with per-key
// "preparations", after John Cage's *Sonatas and Interludes* (1946-48), where
// bolts, screws, and strips of felt wedged between the strings turn each pitch
// into its own small percussion instrument.
//
// Each pluck renders a short AudioBuffer with the KS feedback-delay algorithm,
// its parameters bent by the preparation preset:
//   felt      — heavy damping, dark: a muted thud (felt between strings)
//   bolt      — a rattling nonlinearity: the buzz of a screw against the string
//   harmonic  — a node-excited, long, glassy ring (a fingertip harmonic)
//   detune    — two strings a few cents apart, slowly beating (a chorusing pair)
//
// Buffers are cached per (midi, prep) so a live player triggers with no cost
// after the first strike. The noise excitation is seeded (mulberry32) so builds
// are reproducible — never Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./chance";

export type Preparation = "felt" | "bolt" | "harmonic" | "detune";

interface PrepParams {
  /** Feedback damping per sample, ~0.95..0.999. Higher = longer ring. */
  damping: number;
  /** Averaging-filter brightness, 0..1. Lower = brighter (less low-passing). */
  brightness: number;
  /** Rattle amount for the bolt buzz, 0 = none. */
  buzz: number;
  /** Detune of the second string in cents (detune preset only). */
  detuneCents: number;
  /** Node fraction to excite for the harmonic preset (0 = full noise burst). */
  node: number;
  /** Seconds of tail to render. */
  decay: number;
}

const PREP: Record<Preparation, PrepParams> = {
  felt: { damping: 0.965, brightness: 0.85, buzz: 0, detuneCents: 0, node: 0, decay: 0.9 },
  bolt: { damping: 0.99, brightness: 0.45, buzz: 0.35, detuneCents: 0, node: 0, decay: 1.4 },
  harmonic: { damping: 0.997, brightness: 0.55, buzz: 0, detuneCents: 0, node: 0.5, decay: 2.4 },
  detune: { damping: 0.992, brightness: 0.6, buzz: 0, detuneCents: 11, node: 0, decay: 1.8 },
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Run one Karplus-Strong delay line into `out`, mixing additively.
function runLine(
  out: Float32Array,
  freq: number,
  sampleRate: number,
  p: PrepParams,
  rng: () => number,
  gain: number,
): void {
  const n = Math.max(2, Math.round(sampleRate / freq));
  const line = new Float32Array(n);

  // Excitation. A harmonic preset excites near a node so odd partials survive;
  // everything else gets a full noise burst.
  for (let i = 0; i < n; i++) {
    let v = rng() * 2 - 1;
    if (p.node > 0) {
      // Emphasise the 2nd partial: an antisymmetric burst rings an octave up.
      v *= Math.sin((2 * Math.PI * i) / n) >= 0 ? 1 : -1;
    }
    line[i] = v;
  }

  let idx = 0;
  const total = out.length;
  for (let s = 0; s < total; s++) {
    const cur = line[idx];
    out[s] += cur * gain;

    const nextIdx = (idx + 1) % n;
    // Brightness-weighted one-pole averaging low-pass in the feedback loop.
    let avg = p.brightness * (cur + line[nextIdx]) * 0.5 + (1 - p.brightness) * cur;
    avg *= p.damping;

    // Bolt buzz: an amplitude-dependent rattle — the screw chattering.
    if (p.buzz > 0) {
      const rattle = (rng() * 2 - 1) * Math.min(1, Math.abs(cur) * 4);
      avg = Math.tanh(avg * 1.6) * 0.62 + rattle * p.buzz * 0.5;
    }

    line[idx] = avg;
    idx = nextIdx;
  }
}

function renderPluck(
  ctx: BaseAudioContext,
  midi: number,
  prep: Preparation,
): AudioBuffer {
  const p = PREP[prep];
  const sr = ctx.sampleRate;
  const freq = midiToFreq(midi);
  const total = Math.floor(sr * p.decay);
  const buf = ctx.createBuffer(1, total, sr);
  const out = buf.getChannelData(0);

  // Seed the excitation from the pitch so the cache is stable + reproducible.
  const rng = mulberry32((midi * 2654435761) >>> 0);
  runLine(out, freq, sr, p, rng, 1);

  if (p.detuneCents > 0) {
    const ratio = Math.pow(2, p.detuneCents / 1200);
    const rng2 = mulberry32(((midi + 1) * 40503) >>> 0);
    runLine(out, freq * ratio, sr, p, rng2, 0.8);
  }

  // Normalise + soft fade-out to kill any tail click.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 0 ? 0.9 / peak : 1;
  const fade = Math.min(total, Math.floor(sr * 0.03));
  for (let i = 0; i < total; i++) {
    let g = norm;
    if (i > total - fade) g *= (total - i) / fade;
    out[i] *= g;
  }
  return buf;
}

/** A polyphonic bank of prepared-string voices routed to one destination node. */
export class PreparedStrings {
  private cache = new Map<string, AudioBuffer>();
  private live = new Set<AudioBufferSourceNode>();

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
  ) {}

  private bufferFor(midi: number, prep: Preparation): AudioBuffer {
    const key = `${midi}:${prep}`;
    let buf = this.cache.get(key);
    if (!buf) {
      buf = renderPluck(this.ctx, midi, prep);
      this.cache.set(key, buf);
    }
    return buf;
  }

  /** Strike a prepared string. `velocity` 0..1. */
  pluck(midi: number, prep: Preparation, velocity: number): void {
    const buf = this.bufferFor(midi, prep);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1, Math.max(0, velocity)) * 0.7;
    src.connect(g);
    g.connect(this.dest);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* context closing */
      }
      this.live.delete(src);
    };
    this.live.add(src);
    src.start();
  }

  dispose(): void {
    for (const src of this.live) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.live.clear();
    this.cache.clear();
  }
}
