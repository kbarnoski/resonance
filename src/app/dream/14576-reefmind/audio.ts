// audio.ts — the mix engine. 16 species, one per REAL track. Every audible thing
// is Karel's real piano looping; the reaction-diffusion field only sets each
// species' gain / brightness / pan. ZERO oscillators, ZERO synthesis.
//
// Signal per species:  BufferSource(loop) → Gain → BiquadFilter(lowpass) →
//                      StereoPanner → safe.input   (→ speakers, tamed)

import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import type { SpeciesSummary } from "./field";

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Species {
  id: string;
  title: string;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  source: AudioBufferSourceNode | null;
  ready: boolean;
  /** Smoothed bloom for the on-screen legend. */
  level: number;
}

export class MixEngine {
  private ctx: AudioContext;
  private safe: SafeMaster;
  private species: Species[] = [];
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.safe = createSafeMaster(ctx, { gain: 0.8 });

    for (const t of REAL_TRACKS) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.7;
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;

      gain.connect(filter);
      filter.connect(panner);
      panner.connect(this.safe.input);

      this.species.push({
        id: t.id,
        title: t.title,
        gain,
        filter,
        panner,
        source: null,
        ready: false,
        level: 0,
      });
    }
  }

  get analyser(): AnalyserNode {
    return this.safe.analyser;
  }

  get titles(): string[] {
    return this.species.map((s) => s.title);
  }

  get levels(): number[] {
    return this.species.map((s) => s.level);
  }

  get loadedCount(): number {
    return this.species.reduce((n, s) => n + (s.ready ? 1 : 0), 0);
  }

  /** Lazily fetch + decode all 16 tracks; start each loop as it arrives.
   *  Decodes the first few in order, the rest in the background. */
  async load(): Promise<void> {
    const startOne = async (i: number) => {
      if (this.disposed) return;
      try {
        const buf = await loadRealTrackBuffer(this.ctx, this.species[i].id);
        if (this.disposed) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf.buffer;
        src.loop = true;
        src.connect(this.species[i].gain);
        // Stagger loop phase so 16 copies of the same catalog never lock in sync.
        src.start(this.ctx.currentTime, (i * 3.7) % Math.max(1, buf.buffer.duration));
        this.species[i].source = src;
        this.species[i].ready = true;
      } catch {
        /* leave this species silent; the field simply never voices it */
      }
    };

    const first = Math.min(4, this.species.length);
    for (let i = 0; i < first; i++) await startOne(i);
    // Remaining decode in parallel in the background.
    void Promise.all(
      Array.from({ length: this.species.length - first }, (_, j) => startOne(first + j)),
    );
  }

  /** Field → mix. Each species surges where its zone blooms, thins where the
   *  chemistry dissolves; the bloom's horizontal centroid sets the pan. */
  update(summaries: SpeciesSummary[]): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.species.length; i++) {
      const s = this.species[i];
      const sum = summaries[i];
      if (!sum) continue;
      const bloom = smoothstep(0.05, 0.24, sum.bloom); // 0..1 coherence
      s.level = bloom;
      const g = s.ready ? 0.06 + bloom * 0.7 : 0.0001;
      const cutoff = 380 + bloom * bloom * 6200; // dark when dissolving, bright when blooming
      const pan = Math.max(-1, Math.min(1, sum.pan));
      s.gain.gain.setTargetAtTime(g, now, 0.35);
      s.filter.frequency.setTargetAtTime(cutoff, now, 0.4);
      s.panner.pan.setTargetAtTime(pan, now, 0.5);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.species) {
      try {
        s.source?.stop();
      } catch {
        /* not started */
      }
      try {
        s.source?.disconnect();
        s.gain.disconnect();
        s.filter.disconnect();
        s.panner.disconnect();
      } catch {
        /* already torn down */
      }
    }
    this.safe.disconnect();
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}
