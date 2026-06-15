// audio.ts — kid-safe Web Audio engine for "A Whole Day".
// A look-ahead (Chris Wilson) scheduler drives an always-on ambient bed plus
// the planted living things. Everything routes through a kid-safe master chain:
//   masterGain (<=0.55) -> lowpass (<=7500) -> compressor -> destination
//
// No allocation spikes mid-gesture: voices are simple short-lived osc+gain
// graphs created at schedule time but always far ahead of the audio clock, and
// we never create nodes synchronously inside a pointer handler.

export interface KidAudio {
  ctx: AudioContext;
  master: GainNode;
  // Play a single bell/pluck/pad-ish tone at an absolute time.
  tone: (
    when: number,
    freq: number,
    dur: number,
    gain: number,
    timbre: "bell" | "pluck" | "pad" | "breath",
    pan?: number
  ) => void;
  // The slow ambient drone bed; its filter + pitch shift with the day phase.
  setBed: (rootHz: number, brightness: number, level: number) => void;
  resume: () => Promise<void>;
}

/** Build the kid-safe audio graph. Call INSIDE a user gesture for iOS unlock. */
export function makeAudio(): KidAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    // Safari fallback
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // --- kid-safe master chain ---
  const master = ctx.createGain();
  master.gain.value = 0.0; // fade in after start

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000; // <= 7500 cap
  lp.Q.value = 0.0001;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // gentle fade-in of the master so nothing thumps on start
  master.gain.setValueAtTime(0.0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);

  // --- always-on ambient bed (two detuned oscillators + a sub) ---
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.0;
  const bedLp = ctx.createBiquadFilter();
  bedLp.type = "lowpass";
  bedLp.frequency.value = 800;
  bedLp.Q.value = 0.3;
  bedGain.connect(bedLp);
  bedLp.connect(master);

  const oscA = ctx.createOscillator();
  oscA.type = "triangle";
  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  const sub = ctx.createOscillator();
  sub.type = "sine";

  oscA.frequency.value = 110;
  oscB.frequency.value = 110;
  oscB.detune.value = 6;
  sub.frequency.value = 55;

  // slow shimmer LFO on the bed filter for "living" air
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain);
  lfoGain.connect(bedLp.frequency);

  oscA.connect(bedGain);
  oscB.connect(bedGain);
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain);
  subGain.connect(bedGain);

  oscA.start();
  oscB.start();
  sub.start();
  lfo.start();

  const setBed = (rootHz: number, brightness: number, level: number) => {
    const t = ctx.currentTime;
    const g = Math.max(0, Math.min(0.22, level));
    bedGain.gain.setTargetAtTime(g, t, 0.6);
    oscA.frequency.setTargetAtTime(rootHz, t, 1.2);
    oscB.frequency.setTargetAtTime(rootHz, t, 1.2);
    sub.frequency.setTargetAtTime(rootHz / 2, t, 1.2);
    // brightness 0..1 -> bed filter center 400..1700
    const center = 400 + brightness * 1300;
    bedLp.frequency.setTargetAtTime(center, t, 1.5);
  };

  const tone: KidAudio["tone"] = (when, freq, dur, gain, timbre, pan = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));

    let peak = gain;
    let attack = 0.01;
    let release = dur;

    switch (timbre) {
      case "bell": {
        osc.type = "sine";
        attack = 0.005;
        release = dur * 1.6;
        peak = gain * 0.9;
        // a soft second partial for shimmer (octave + a fifth)
        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 3.0;
        const g2 = ctx.createGain();
        g2.gain.value = 0;
        g2.gain.setValueAtTime(0, when);
        g2.gain.linearRampToValueAtTime(peak * 0.18, when + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, when + release * 0.7);
        osc2.connect(g2);
        g2.connect(panner);
        osc2.start(when);
        osc2.stop(when + release + 0.1);
        break;
      }
      case "pluck": {
        osc.type = "triangle";
        attack = 0.004;
        release = dur * 1.1;
        peak = gain;
        break;
      }
      case "breath": {
        osc.type = "sine";
        attack = 0.08;
        release = dur * 1.2;
        peak = gain * 0.8;
        break;
      }
      case "pad":
      default: {
        osc.type = "triangle";
        attack = 0.06;
        release = dur * 1.3;
        peak = gain * 0.7;
      }
    }

    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + release);

    osc.connect(g);
    g.connect(panner);
    panner.connect(master);

    osc.start(when);
    osc.stop(when + release + 0.1);
  };

  const resume = async () => {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  };

  return { ctx, master, tone, setBed, resume };
}
