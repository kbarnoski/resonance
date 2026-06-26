// audio.ts — warm additive/FM voicing of the field's emergent chord.
//
// The Kuramoto field reaches consensus and hands us a set of locked clusters,
// each snapped to a just-intonation partial of a slowly drifting root. We voice
// each partial as a soft additive tone (a fundamental sine + a quiet triangle
// fifth-partial for body) with a gentle FM vibrato. As more clusters lock the
// chord fills in; as coupling falls voices fade and the texture thins to a hum.
//
// Master chain (can never get harsh):
//   per-voice gain -> master gain (<=0.26) -> lowpass ~7kHz -> compressor -> out
//
// NOT granular, NOT samples. Pure synthesis.

import { JI_RATIOS } from "./kuramoto";

const MASTER_GAIN = 0.24;
const LOWPASS_HZ = 7000;
const MAX_VOICES = JI_RATIOS.length;

interface Voice {
  // additive: fundamental + a soft upper partial
  osc: OscillatorNode;
  partial: OscillatorNode;
  partialGain: GainNode;
  // FM vibrato
  lfo: OscillatorNode;
  lfoGain: GainNode;
  gain: GainNode; // voice amplitude envelope
  ratioIndex: number; // which JI partial this voice currently sounds
  active: boolean;
}

export class SyncBloomAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private bed: GainNode; // root drone bed
  private bedOsc: OscillatorNode | null = null;
  private bedSub: OscillatorNode | null = null;
  private voices: Voice[] = [];
  private rootHz = 110; // drifts slowly (A2-ish)
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // fade in on start

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = LOWPASS_HZ;
    this.lowpass.Q.value = 0.5;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.bed = this.ctx.createGain();
    this.bed.gain.value = 0;
    this.bed.connect(this.master);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;

    // root drone bed: a soft sine at the root + a quiet sub an octave below
    this.bedOsc = this.ctx.createOscillator();
    this.bedOsc.type = "sine";
    this.bedOsc.frequency.value = this.rootHz;
    this.bedSub = this.ctx.createOscillator();
    this.bedSub.type = "sine";
    this.bedSub.frequency.value = this.rootHz / 2;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;
    this.bedOsc.connect(this.bed);
    this.bedSub.connect(subGain);
    subGain.connect(this.bed);
    this.bedOsc.start();
    this.bedSub.start();

    // build the voice pool (all silent until a cluster locks)
    for (let i = 0; i < MAX_VOICES; i++) {
      this.voices.push(this.buildVoice());
    }

    // fade master + bed up
    this.master.gain.setTargetAtTime(MASTER_GAIN, t, 0.6);
    this.bed.gain.setTargetAtTime(0.12, t, 1.2);
  }

  private buildVoice(): Voice {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const partial = ctx.createOscillator();
    partial.type = "triangle";
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.12; // quiet upper body
    const gain = ctx.createGain();
    gain.gain.value = 0;

    // FM vibrato: slow LFO modulating fundamental frequency a few cents
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4.5 + Math.random() * 1.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2.5; // Hz of deviation
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(partial.frequency);

    osc.connect(gain);
    partial.connect(partialGain);
    partialGain.connect(gain);
    gain.connect(this.master);

    osc.start();
    partial.start();
    lfo.start();

    return {
      osc,
      partial,
      partialGain,
      lfo,
      lfoGain,
      gain,
      ratioIndex: -1,
      active: false,
    };
  }

  // slowly drift the root so the harmony breathes over ~tens of seconds
  setRootDrift(rootHz: number): void {
    this.rootHz = rootHz;
    const t = this.ctx.currentTime;
    this.bedOsc?.frequency.setTargetAtTime(rootHz, t, 0.8);
    this.bedSub?.frequency.setTargetAtTime(rootHz / 2, t, 0.8);
  }

  // The field hands us a chord: a set of {ratioIndex, strength}. We assign each
  // to a voice, glide its pitch to the JI partial, and set its gain from
  // strength * overall order. Voices whose cluster vanished fade out.
  setChord(
    clusters: { ratioIndex: number; strength: number }[],
    order: number, // global order parameter 0..1
  ): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Which ratios are currently locked
    const wanted = new Map<number, number>();
    for (const c of clusters) wanted.set(c.ratioIndex, c.strength);

    // mark all voices for retirement, then claim the ones still wanted
    const claimed = new Set<Voice>();
    // first pass: keep voices already on a wanted ratio
    for (const v of this.voices) {
      if (v.active && wanted.has(v.ratioIndex) && !claimed.has(v)) {
        claimed.add(v);
      }
    }
    // second pass: assign remaining wanted ratios to free voices
    for (const [ratioIndex, strength] of wanted) {
      const already = [...claimed].some((v) => v.ratioIndex === ratioIndex);
      if (already) continue;
      const free = this.voices.find((v) => !claimed.has(v) && !v.active) ??
        this.voices.find((v) => !claimed.has(v));
      if (!free) continue;
      free.ratioIndex = ratioIndex;
      const hz = this.rootHz * JI_RATIOS[ratioIndex] * 2; // up an octave for presence
      free.osc.frequency.setTargetAtTime(hz, t, 0.12);
      free.partial.frequency.setTargetAtTime(hz * 2.0, t, 0.12); // octave partial
      free.active = true;
      claimed.add(free);
      void strength;
    }

    // set gains: claimed voices get strength*order; others fade out
    for (const v of this.voices) {
      if (claimed.has(v) && wanted.has(v.ratioIndex)) {
        const s = wanted.get(v.ratioIndex) ?? 0;
        // soft attack; louder when both the cluster is dense and the field coheres
        const amp = Math.min(0.5, 0.18 + s * 1.6) * (0.35 + 0.65 * order);
        v.gain.gain.setTargetAtTime(amp, t, 0.18);
      } else {
        v.gain.gain.setTargetAtTime(0, t, 0.35);
        if (v.active) v.active = false;
      }
    }
  }

  close(): void {
    const t = this.ctx.currentTime;
    try {
      this.master.gain.setTargetAtTime(0, t, 0.15);
    } catch {
      /* noop */
    }
    const stopAll = () => {
      for (const v of this.voices) {
        try {
          v.osc.stop();
          v.partial.stop();
          v.lfo.stop();
        } catch {
          /* noop */
        }
      }
      try {
        this.bedOsc?.stop();
        this.bedSub?.stop();
      } catch {
        /* noop */
      }
      try {
        void this.ctx.close();
      } catch {
        /* noop */
      }
    };
    // give the fade a moment, then hard-stop
    setTimeout(stopAll, 250);
  }
}
