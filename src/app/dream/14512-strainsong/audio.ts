// audio.ts — the strain field IS the mixing engine.
//
// Every sound is one of Karel's 16 real recordings (Welcome Home + Snowflake),
// loaded progressively. The membrane's 16 regions map 1:1 onto the 16 tracks:
// each region's signed strain drives its recording's gain and lowpass cutoff.
// High tension (uphill, stretched) → brighter and louder; compression
// (downhill, bunched) → darker and near-silent. No oscillators, no synthesis —
// the whole mix is a spatial readout of the physics.

import {
  loadRealTrackBuffer,
  REAL_TRACKS,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { REGION_COUNT } from "./physics";

interface Voice {
  gain: GainNode;
  filter: BiquadFilterNode;
  source: AudioBufferSourceNode | null;
  title: string;
  loaded: boolean;
  // smoothed strain readout for the UI
  strain: number;
}

export interface EnergyBands {
  overall: number; // 0..1
  bass: number; // 0..1
  treble: number; // 0..1
}

export class StrainAudio {
  readonly ctx: AudioContext;
  private safe: SafeMaster;
  private voices: Voice[] = [];
  private freq: Uint8Array;
  loadedCount = 0;
  readonly total = Math.min(REGION_COUNT, REAL_TRACKS.length);

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.safe = createSafeMaster(this.ctx, { gain: 0.8 });
    this.freq = new Uint8Array(this.safe.analyser.frequencyBinCount);

    // Pre-build a voice chain per region so strain can drive it the instant
    // its buffer arrives: source → gain → lowpass → safeMaster.
    for (let i = 0; i < this.total; i++) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      filter.connect(gain);
      gain.connect(this.safe.input);
      this.voices.push({
        gain,
        filter,
        source: null,
        title: REAL_TRACKS[i].title,
        loaded: false,
        strain: 0,
      });
    }
  }

  get suspended() {
    return this.ctx.state === "suspended";
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Progressively fetch + start each region's recording (looped, quiet). */
  loadAll(onProgress?: (loaded: number, total: number) => void) {
    for (let i = 0; i < this.total; i++) {
      const id = REAL_TRACKS[i].id;
      loadRealTrackBuffer(this.ctx, id)
        .then(({ buffer, title }) => {
          const v = this.voices[i];
          if (!v || v.source) return;
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          // stagger starts so the 16 loops don't phase-lock into a wall
          src.connect(v.filter);
          const when = this.ctx.currentTime + 0.05 + (i % 8) * 0.12;
          const offset = (i * 3.1) % Math.max(1, buffer.duration - 1);
          try {
            src.start(when, offset);
          } catch {
            src.start();
          }
          v.source = src;
          v.title = title;
          v.loaded = true;
          this.loadedCount++;
          onProgress?.(this.loadedCount, this.total);
        })
        .catch(() => {
          onProgress?.(this.loadedCount, this.total);
        });
    }
  }

  /**
   * Feed the 16 region strains through the mixer. `scale` normalizes the strain
   * range (1 / running peak) so the field is always expressive. Tension lifts
   * gain + cutoff; compression pulls both toward silence and darkness.
   */
  applyStrains(regionStrain: Float32Array, scale: number) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.total; i++) {
      const v = this.voices[i];
      if (!v.loaded) continue;
      const s = regionStrain[i] * scale; // roughly -1..1
      v.strain = s;
      // gain: near-silent at rest/compression, swelling with tension
      const g = Math.max(0, 0.04 + s * 0.5);
      v.gain.gain.setTargetAtTime(Math.min(0.7, g), t, 0.12);
      // lowpass cutoff: dark under compression, bright under tension
      const cut = 320 * Math.pow(2, (s + 0.6) * 3.2); // ~200 Hz .. ~6 kHz
      v.filter.frequency.setTargetAtTime(
        Math.min(7000, Math.max(180, cut)),
        t,
        0.15,
      );
    }
  }

  /** Live analyser bands for autonomous perturbation + visual pulse. */
  sampleEnergy(): EnergyBands {
    this.safe.analyser.getByteFrequencyData(this.freq as Uint8Array<ArrayBuffer>);
    const n = this.freq.length;
    const bassEnd = Math.floor(n * 0.12);
    const trebStart = Math.floor(n * 0.55);
    let bass = 0;
    let treble = 0;
    let all = 0;
    for (let i = 0; i < n; i++) {
      const v = this.freq[i] / 255;
      all += v;
      if (i < bassEnd) bass += v;
      if (i >= trebStart) treble += v;
    }
    return {
      overall: all / n,
      bass: bass / Math.max(1, bassEnd),
      treble: treble / Math.max(1, n - trebStart),
    };
  }

  /** Snapshot of each region's smoothed strain + title for the UI. */
  readout(): { title: string; strain: number; loaded: boolean }[] {
    return this.voices.map((v) => ({
      title: v.title,
      strain: v.strain,
      loaded: v.loaded,
    }));
  }

  dispose() {
    for (const v of this.voices) {
      try {
        v.source?.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.source?.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* closing */
      }
    }
    this.voices = [];
    this.safe.disconnect();
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}
