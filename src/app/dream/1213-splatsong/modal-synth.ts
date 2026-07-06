// ─────────────────────────────────────────────────────────────────────────────
// modal-synth.ts — physically-modelled modal impact voices via the Web Audio API.
//
// A strike excites a bank of 5–8 parallel exponentially-decaying sinusoids
// (the modal model of a struck rigid body: y(t) = Σ aᵢ·sin(2π fᵢ t)·e^(−t/τᵢ))
// driven by a short filtered-noise "mallet" transient for the attack click.
// Ratios + decays come from the cluster's inferred material; the fundamental
// from its size; amplitude + brightness from strike velocity.
//
// Not a just-intonation drone, not granular, not an FM bell — decaying partials.
// ─────────────────────────────────────────────────────────────────────────────

import { MATERIALS, MaterialId } from "./scene";

interface Voice {
  nodes: AudioNode[]; // everything to disconnect
  gain: GainNode; // voice bus
  bornAt: number;
  endsAt: number;
}

const MAX_VOICES = 10;

export class ModalSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private noiseBuf: AudioBuffer;
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    // brick-wall-ish limiter so a fast flurry can never spike
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // ramped up on start()

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // short white-noise buffer reused for every mallet transient
    const len = Math.floor(ctx.sampleRate * 0.05);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Ramp the master gain up from 0 (gesture-gated in the page). */
  start() {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(0.85, now + 1.2);
  }

  /**
   * Strike a cluster.
   * @param material inferred material id
   * @param fundamental Hz
   * @param velocity 0..1 strike strength
   * @param pan -1..1 stereo placement (from screen x)
   */
  strike(material: MaterialId, fundamental: number, velocity: number, pan: number) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const mat = MATERIALS[material];
    const vel = Math.min(1, Math.max(0.02, velocity));

    this.reap(now);
    if (this.voices.length >= MAX_VOICES) {
      // voice-steal: fade + drop the oldest
      const old = this.voices.shift();
      if (old) this.killVoice(old, now);
    }

    const nodes: AudioNode[] = [];
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    voiceGain.connect(panner);
    panner.connect(this.master);
    nodes.push(voiceGain, panner);

    // ── mallet transient: a short filtered noise burst = the contact click ──
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    // harder strike ⇒ brighter contact
    nf.frequency.value = Math.min(
      8000,
      fundamental * (2 + mat.brightness * 4) * (0.7 + vel * 0.6),
    );
    nf.Q.value = 0.7;
    const ng = ctx.createGain();
    const clickAmt = 0.18 * vel * (0.5 + mat.brightness * 0.7);
    ng.gain.setValueAtTime(clickAmt, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(voiceGain);
    noise.start(now);
    noise.stop(now + 0.06);
    nodes.push(noise, nf, ng);

    // ── modal partials: decaying sines ──
    let maxEnd = now + 0.1;
    const brightness = mat.brightness;
    for (let i = 0; i < mat.ratios.length; i++) {
      const freq = fundamental * mat.ratios[i];
      if (freq > ctx.sampleRate * 0.45) continue; // no aliasing

      // spectral tilt: upper partials louder for bright materials, softer for dull
      const tilt = Math.pow((i + 1) / mat.ratios.length, 1.6 - brightness);
      const upper = 1 - tilt; // 1 for low partials
      const partialAmp =
        (0.9 / (i + 1.2)) * (upper * (1 - brightness) + (1 - upper) * 0.35 + 0.25);

      // velocity brightens: higher partials scale more with strike strength
      const velScale = 0.35 + vel * (0.65 + i * 0.05 * brightness);
      const amp = partialAmp * velScale * 0.5;

      // strike harder ⇒ very slightly shorter (energy dumped faster) but mostly material
      const tau = mat.decays[i] * (0.85 + (1 - vel) * 0.3);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      // impact envelope: near-instant rise (2 ms) then exponential ring-down
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.002 + tau);
      osc.connect(g);
      g.connect(voiceGain);
      const end = now + 0.05 + tau;
      osc.start(now);
      osc.stop(end + 0.02);
      if (end > maxEnd) maxEnd = end;
      nodes.push(osc, g);
    }

    this.voices.push({ nodes, gain: voiceGain, bornAt: now, endsAt: maxEnd });
  }

  private reap(now: number) {
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.endsAt < now) {
        this.disconnectVoice(v);
      } else {
        keep.push(v);
      }
    }
    this.voices = keep;
  }

  private killVoice(v: Voice, now: number) {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    } catch {
      // ignore
    }
    // disconnect shortly after the fade
    window.setTimeout(() => this.disconnectVoice(v), 140);
  }

  private disconnectVoice(v: Voice) {
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    }
    v.nodes = [];
  }

  dispose() {
    const now = this.ctx.currentTime;
    for (const v of this.voices) this.disconnectVoice(v);
    this.voices = [];
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0, now);
    } catch {
      // ignore
    }
    try {
      this.master.disconnect();
      this.limiter.disconnect();
    } catch {
      // ignore
    }
  }
}
