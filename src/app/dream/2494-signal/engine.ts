// ────────────────────────────────────────────────────────────────────────────
// Signal (2494) — audio engine.
//
// One sustained voice per ACTIVE Deep Space Network link. The visitor does not
// play it; the solar system does. Voices fade in as links go active and release
// as they drop, so the chord breathes when the network reconfigures.
//
// Mapping (see model.ts for the numbers):
//   band          → register (L low … Ka high), snapped to one warm scale
//   down vs up    → timbre (down = pure breathing pad from deep space,
//                            up  = brighter Earth-sourced tone)
//   dataRate      → tremolo / shimmer rate
//   lightSeconds  → reverb + long-echo depth  (Voyager arrives drenched)
//   station       → stereo pan (Goldstone / Madrid / Canberra spread)
// ────────────────────────────────────────────────────────────────────────────

import {
  DsnSignal,
  MAX_VOICES,
  echoTime,
  shimmerRate,
  signalFrequency,
  signalPriority,
  signalStrength,
  spaceDepth,
  stationPan,
} from "./model";

interface Voice {
  sig: DsnSignal;
  osc: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  vca: GainNode; // envelope
  trem: GainNode; // tremolo depth
  lfo: OscillatorNode;
  lfoGain: GainNode;
  panner: StereoPannerNode;
  dry: GainNode;
  wet: GainNode; // send to reverb
  echo: GainNode; // send to long delay
  released: boolean;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export class SignalEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: ConvolverNode;
  private reverbReturn: GainNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delayReturn: GainNode;
  private voices = new Map<string, Voice>();
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3.5;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // Long, lush reverb for "distance".
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeImpulse(this.ctx, 6.5, 3.2);
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.9;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    // Feedback delay — the "arriving from impossibly far" echo tail.
    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.5;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.5;
    this.delayReturn = this.ctx.createGain();
    this.delayReturn.gain.value = 0.55;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.reverb); // echoes also blur into the reverb
    this.delay.connect(this.delayReturn);
    this.delayReturn.connect(this.master);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.8, t + 2.5);
  }

  get audioContext() {
    return this.ctx;
  }

  private makeVoice(sig: DsnSignal): Voice {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = signalFrequency(sig);
    const isDown = sig.direction === "down";

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    // Downlink: pure/breathing (sine + faint detuned triangle).
    // Uplink: brighter Earth tone (triangle + saw, filtered).
    osc.type = isDown ? "sine" : "triangle";
    osc2.type = isDown ? "triangle" : "sawtooth";
    osc.frequency.value = freq;
    osc2.frequency.value = freq;
    osc2.detune.value = isDown ? 5 : 9;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // Brightness leans on data rate: fast links let more harmonics through.
    const bright = Math.min(1, Math.log10(Math.max(1, sig.dataRate)) / 7);
    filter.frequency.value = isDown
      ? 700 + bright * 3200
      : 1400 + bright * 5000;
    filter.Q.value = 0.7;

    // Tremolo (shimmer) — depth deeper for fast data.
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = shimmerRate(sig.dataRate);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = isDown ? 0.18 : 0.3;
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);

    const vca = ctx.createGain();
    vca.gain.value = 0.0001;

    const panner = ctx.createStereoPanner();
    panner.pan.value = stationPan(sig.stationCode);

    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const echo = ctx.createGain();
    const depth = spaceDepth(sig.lightSeconds);
    const level = 0.14 + signalStrength(sig) * 0.16;
    dry.gain.value = level * (1 - depth * 0.5);
    wet.gain.value = level * depth * 1.3;
    echo.gain.value = level * depth * depth * 1.1;

    // Graph: osc(s) → filter → trem → vca → panner → {dry,wet,echo}
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(trem);
    trem.connect(vca);
    vca.connect(panner);
    panner.connect(dry);
    panner.connect(wet);
    panner.connect(echo);
    dry.connect(this.master);
    wet.connect(this.reverb);
    echo.connect(this.delay);

    osc.start(now);
    osc2.start(now);
    lfo.start(now);

    // Fade in.
    vca.gain.setValueAtTime(0.0001, now);
    vca.gain.exponentialRampToValueAtTime(1, now + 2.2);

    return {
      sig,
      osc,
      osc2,
      filter,
      vca,
      trem,
      lfo,
      lfoGain,
      panner,
      dry,
      wet,
      echo,
      released: false,
    };
  }

  private releaseVoice(v: Voice) {
    if (v.released) return;
    v.released = true;
    const now = this.ctx.currentTime;
    v.vca.gain.cancelScheduledValues(now);
    v.vca.gain.setValueAtTime(Math.max(0.0001, v.vca.gain.value), now);
    v.vca.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
    const stopAt = now + 4.0;
    try {
      v.osc.stop(stopAt);
      v.osc2.stop(stopAt);
      v.lfo.stop(stopAt);
    } catch {
      /* already stopped */
    }
    setTimeout(() => {
      try {
        v.osc.disconnect();
        v.osc2.disconnect();
        v.lfo.disconnect();
        v.filter.disconnect();
        v.trem.disconnect();
        v.vca.disconnect();
        v.panner.disconnect();
        v.dry.disconnect();
        v.wet.disconnect();
        v.echo.disconnect();
      } catch {
        /* noop */
      }
    }, 4200);
  }

  /** Reconcile the live voices to the current set of active signals. */
  update(signals: DsnSignal[]) {
    if (!this.started) return;

    // Cap polyphony to the strongest links.
    const kept = [...signals]
      .sort((a, b) => signalPriority(b) - signalPriority(a))
      .slice(0, MAX_VOICES);
    const keptIds = new Set(kept.map((s) => s.id));

    // Release voices whose link dropped.
    for (const [id, v] of this.voices) {
      if (!keptIds.has(id) && !v.released) {
        this.releaseVoice(v);
        this.voices.delete(id);
      }
    }

    // Add new voices, retune longer-echo params on continuing ones.
    for (const sig of kept) {
      const existing = this.voices.get(sig.id);
      if (!existing) {
        this.voices.set(sig.id, this.makeVoice(sig));
      }
    }

    // Set the shared delay time to the deepest currently-active craft so the
    // whole texture leans toward the farthest voice's arrival.
    const maxLight = kept.reduce((m, s) => Math.max(m, s.lightSeconds), 0);
    const t = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(echoTime(maxLight), t, 0.6);
  }

  setMasterGain(v: number) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v, t, 0.2);
  }

  stop() {
    for (const [, v] of this.voices) this.releaseVoice(v);
    this.voices.clear();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.4);
    setTimeout(() => {
      this.ctx.close().catch(() => {});
    }, 800);
  }
}
