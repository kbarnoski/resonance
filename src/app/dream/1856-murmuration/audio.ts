// Generative audio — the flock IS the music.
//
// Each spatial cluster drives one voice/section:
//   cluster centroid height -> register/pitch (quantised to a pentatonic scale
//                              so it is always consonant)
//   cluster tightness        -> filter cutoff / timbre
//   cluster x                -> stereo pan
//   TOTAL motion energy      -> tempo/density of note events (the headline
//                              mapping: still body = sparse & slow, big gesture
//                              = dense, faster, louder swells).
// Everything runs through a DynamicsCompressor into a master gain <= 0.18 with a
// ~1s fade-in. Notes use gentle attack/release — no harsh clicks.

import type { ClusterStat } from "./flock";

// A minor pentatonic (A C D E G) across several octaves, low -> high.
const SCALE = buildScale();

function buildScale(): number[] {
  const semis = [0, 3, 5, 7, 10]; // pentatonic degrees from A
  const freqs: number[] = [];
  for (let oct = -2; oct <= 2; oct++) {
    for (const s of semis) {
      // A3 = 220 Hz as the anchor.
      freqs.push(220 * Math.pow(2, oct + s / 12));
    }
  }
  freqs.sort((a, b) => a - b);
  return freqs;
}

interface Voice {
  pan: StereoPannerNode;
  filter: BiquadFilterNode;
  nextNoteTime: number;
}

type CtxCtor = typeof AudioContext;

export class MurmurAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private stats: ClusterStat[] = [];
  private energy = 0;
  private startedAt: number;
  private disposed = false;

  constructor(clusterCount: number) {
    const Ctor: CtxCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: CtxCtor }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    const now = ctx.currentTime;
    this.startedAt = now;
    // Fade in over ~1s (exponential toward the 0.18 ceiling).
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.16, now + 1.0);

    for (let c = 0; c < clusterCount; c++) {
      const pan = ctx.createStereoPanner();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.7;
      filter.connect(pan);
      pan.connect(this.comp);
      this.voices.push({ pan, filter, nextNoteTime: now + 0.1 * c });

      // A very soft sustained pad per cluster so it is never fully silent.
      const drone = ctx.createOscillator();
      drone.type = "sine";
      drone.frequency.value = SCALE[8 + c * 3] * 0.5;
      const dg = ctx.createGain();
      dg.gain.value = 0.012;
      drone.connect(dg);
      dg.connect(filter);
      drone.start();
    }
  }

  suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  resume(): Promise<void> {
    if (this.ctx.state === "suspended") return this.ctx.resume();
    return Promise.resolve();
  }

  /** Push the latest flock state; sets the per-voice targets. */
  update(stats: ClusterStat[], energy: number): void {
    this.stats = stats;
    // Smooth the energy so tempo changes glide rather than jump.
    this.energy += (energy - this.energy) * 0.08;

    for (let c = 0; c < this.voices.length; c++) {
      const v = this.voices[c];
      const st = stats[c];
      if (!st) continue;
      // Tightness -> brightness. A coherent cluster opens the filter.
      const cutoff = 500 + st.tightness * 3200 + this.energy * 1500;
      v.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.15);
      // Cluster x -> stereo pan (-1..1).
      v.pan.pan.setTargetAtTime(st.meanX * 2 - 1, this.ctx.currentTime, 0.2);
    }
  }

  /** Schedule-ahead: call every animation frame. Triggers due note events. */
  schedule(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const lookahead = 0.12;

    // Energy -> inter-onset interval. Still body ~0.9s; big gesture ~0.12s.
    const interval = 0.9 - this.energy * 0.78;
    const noteGain = 0.05 + this.energy * 0.13;

    for (let c = 0; c < this.voices.length; c++) {
      const v = this.voices[c];
      const st = this.stats[c];
      let guard = 0;
      while (v.nextNoteTime < now + lookahead && guard < 4) {
        this.trigger(v, st, v.nextNoteTime, noteGain);
        // Slight per-cluster phase offset keeps the sections from lock-stepping.
        v.nextNoteTime += interval * (0.85 + 0.3 * ((c + 1) / this.voices.length));
        guard++;
      }
      if (v.nextNoteTime < now) v.nextNoteTime = now + interval;
    }
  }

  private trigger(
    v: Voice,
    st: ClusterStat | undefined,
    when: number,
    gain: number,
  ): void {
    if (!st || st.weight < 0.02) return;
    const ctx = this.ctx;

    // Centroid height -> pitch. Top of frame (meanY -> 0) = high register.
    const t = 1 - st.meanY;
    let idx = Math.round(t * (SCALE.length - 1));
    if (idx < 0) idx = 0;
    if (idx >= SCALE.length) idx = SCALE.length - 1;
    const freq = SCALE[idx];

    const osc = ctx.createOscillator();
    osc.type = st.tightness > 0.6 ? "triangle" : "sine";
    osc.frequency.value = freq;

    const env = ctx.createGain();
    const g = gain * (0.5 + st.weight);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), when + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.55);

    osc.connect(env);
    env.connect(v.filter);
    osc.start(when);
    osc.stop(when + 0.6);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.1);
    } catch {
      // ignore
    }
    // Close shortly after the fade so tails do not click.
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    }, 300);
  }
}
