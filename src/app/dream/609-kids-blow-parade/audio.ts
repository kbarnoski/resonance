// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — kid-safe silly sound engine for the Blow Parade.
//
// Sounds:
//   • ambient bed        — soft playful burble loop (never silent, not a drone)
//   • squeak (inflate)   — rising stretched-balloon-neck squeak while blowing;
//                          pitch climbs with blow strength
//   • raspberry (release)— whoopee-cushion buzz: detuned saw/square + filtered
//                          noise + flutter LFO, pitch FALLING. Comedic, big,
//                          but SAFE (no hard transient, capped gain, lowpassed).
//
// Master chain (HARD kid-safety rule):
//   masterGain → lowpass(≤8000Hz) → DynamicsCompressor → destination
//
// ALL nodes that persist (master, ambient) are pre-created in build() so the
// first interaction responds in <50ms. One-shots (squeak/raspberry) create
// short-lived oscillators that self-stop.
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioEngine {
  ctx: AudioContext;
  /** The AnalyserNode fed by the mic (null until mic attached). */
  analyser: AnalyserNode | null;
  resume: () => Promise<void>;
  attachMic: (stream: MediaStream) => AnalyserNode;
  /** Start/continue the inflation squeak; strength 0..1 drives pitch. */
  inflate: (strength: number) => void;
  /** Stop the squeak (call when blow ends). */
  stopInflate: () => void;
  /** Fire the raspberry release. size 0..1 = how big the balloon got. */
  raspberry: (size: number) => void;
  /** A soft confirmation pop (used for taps / fresh balloon). */
  pop: () => void;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

const MASTER_CAP = 0.55; // hard ceiling on master gain

export function buildAudioEngine(): AudioEngine {
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext;
  const ctx = new Ctx();

  // ── Kid-safe master chain ────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = MASTER_CAP;

  const safeLowpass = ctx.createBiquadFilter();
  safeLowpass.type = "lowpass";
  safeLowpass.frequency.value = 7500; // ≤8000Hz: no piercing highs
  safeLowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.knee.value = 12;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master.connect(safeLowpass);
  safeLowpass.connect(comp);
  comp.connect(ctx.destination);

  // ── Ambient bed: gentle burbling, playful, looping ───────────────────────
  // Two slow detuned triangles + a wobbling filter = a friendly "boing" soup.
  const ambGain = ctx.createGain();
  ambGain.gain.value = 0.07;
  ambGain.connect(master);

  const ambFilter = ctx.createBiquadFilter();
  ambFilter.type = "bandpass";
  ambFilter.frequency.value = 360;
  ambFilter.Q.value = 1.4;
  ambFilter.connect(ambGain);

  const ambA = ctx.createOscillator();
  ambA.type = "triangle";
  ambA.frequency.value = 150;
  const ambB = ctx.createOscillator();
  ambB.type = "triangle";
  ambB.frequency.value = 152.5; // slight detune → slow beating
  ambA.connect(ambFilter);
  ambB.connect(ambFilter);

  // Wobble the bandpass to make it burble, not drone.
  const ambLfo = ctx.createOscillator();
  ambLfo.type = "sine";
  ambLfo.frequency.value = 0.27;
  const ambLfoGain = ctx.createGain();
  ambLfoGain.gain.value = 180;
  ambLfo.connect(ambLfoGain);
  ambLfoGain.connect(ambFilter.frequency);

  // A second faster wobble on the amp = playful pulsing.
  const ambAmpLfo = ctx.createOscillator();
  ambAmpLfo.type = "sine";
  ambAmpLfo.frequency.value = 1.7;
  const ambAmpLfoGain = ctx.createGain();
  ambAmpLfoGain.gain.value = 0.035;
  ambAmpLfo.connect(ambAmpLfoGain);
  ambAmpLfoGain.connect(ambGain.gain);

  ambA.start();
  ambB.start();
  ambLfo.start();
  ambAmpLfo.start();

  // ── Persistent inflate squeak voice ──────────────────────────────────────
  // Pre-created so the first blow squeaks instantly. Gain idles at 0.
  const sqOsc = ctx.createOscillator();
  sqOsc.type = "sawtooth";
  sqOsc.frequency.value = 320;
  const sqGain = ctx.createGain();
  sqGain.gain.value = 0;
  // A resonant bandpass gives the rubbery "squeeeak" timbre.
  const sqFilter = ctx.createBiquadFilter();
  sqFilter.type = "bandpass";
  sqFilter.frequency.value = 1200;
  sqFilter.Q.value = 6;
  // Tiny vibrato so it feels alive & comic.
  const sqVib = ctx.createOscillator();
  sqVib.type = "sine";
  sqVib.frequency.value = 11;
  const sqVibGain = ctx.createGain();
  sqVibGain.gain.value = 14;
  sqVib.connect(sqVibGain);
  sqVibGain.connect(sqOsc.frequency);

  sqOsc.connect(sqFilter);
  sqFilter.connect(sqGain);
  sqGain.connect(master);
  sqOsc.start();
  sqVib.start();

  // Shared noise buffer for raspberry texture.
  const noiseBuf = makeNoiseBuffer(ctx, 0.6);

  let muted = false;
  let analyser: AnalyserNode | null = null;

  function attachMic(stream: MediaStream): AnalyserNode {
    const src = ctx.createMediaStreamSource(stream);
    const a = ctx.createAnalyser();
    a.fftSize = 1024; // smaller FFT → lower latency, fine for breath
    a.smoothingTimeConstant = 0.25;
    src.connect(a);
    // NOT connected to destination → no feedback.
    analyser = a;
    return a;
  }

  function inflate(strength: number) {
    if (muted) return;
    const now = ctx.currentTime;
    const s = Math.max(0, Math.min(1, strength));
    // Pitch climbs from ~280Hz to ~900Hz as the balloon stretches.
    const f = 280 + s * 620;
    sqOsc.frequency.setTargetAtTime(f, now, 0.03);
    sqFilter.frequency.setTargetAtTime(900 + s * 1600, now, 0.04);
    // Gain follows strength but stays gentle (capped well below master).
    const g = 0.02 + s * 0.1;
    sqGain.gain.setTargetAtTime(g, now, 0.02);
  }

  function stopInflate() {
    const now = ctx.currentTime;
    sqGain.gain.setTargetAtTime(0, now, 0.05);
  }

  function raspberry(size: number) {
    if (muted) return;
    const now = ctx.currentTime;
    const s = Math.max(0, Math.min(1, size));
    const dur = 0.45 + s * 0.45; // bigger balloon → longer raspberry

    // Bus for this one-shot.
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(master);
    // SOFT attack (no scary transient) then comedic decay.
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.22 + s * 0.1, now + 0.04);
    bus.gain.setTargetAtTime(0.0001, now + dur * 0.5, dur * 0.4);

    // Buzzy tone: detuned saw + square through a moving lowpass. Pitch FALLS.
    const startF = 220 + s * 120;
    const endF = 70 + s * 30;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    lp.Q.value = 1;
    lp.connect(bus);

    const oscs: OscillatorNode[] = [];
    (["sawtooth", "square"] as OscillatorType[]).forEach((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(startF * (i === 1 ? 0.5 : 1), now);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, endF * (i === 1 ? 0.5 : 1)),
        now + dur
      );
      osc.detune.value = i === 0 ? -8 : 9;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.6 : 0.4;
      osc.connect(og);
      og.connect(lp);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      oscs.push(osc);
    });

    // Flutter LFO → the signature "pbbbt" buzz. Modulate the lowpass cutoff.
    const flutter = ctx.createOscillator();
    flutter.type = "square";
    // Flutter rate falls with pitch too (slows as it deflates).
    flutter.frequency.setValueAtTime(28 + s * 14, now);
    flutter.frequency.exponentialRampToValueAtTime(12, now + dur);
    const flutterGain = ctx.createGain();
    flutterGain.gain.value = 700;
    flutter.connect(flutterGain);
    flutterGain.connect(lp.frequency);
    flutter.start(now);
    flutter.stop(now + dur + 0.05);

    // A whoosh of filtered noise = air escaping. Kept soft & lowpassed.
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.setValueAtTime(2200, now);
    nf.frequency.exponentialRampToValueAtTime(500, now + dur);
    const ng = ctx.createGain();
    ng.gain.value = 0.18 + s * 0.08;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    noise.start(now);
    noise.stop(now + dur);

    // Cleanup.
    window.setTimeout(() => {
      try {
        bus.disconnect();
        lp.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 0.2) * 1000);
  }

  function pop() {
    if (muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  async function resume() {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  function setMuted(m: boolean) {
    muted = m;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(m ? 0 : MASTER_CAP, now, 0.05);
  }

  function dispose() {
    try {
      ambA.stop();
      ambB.stop();
      ambLfo.stop();
      ambAmpLfo.stop();
      sqOsc.stop();
      sqVib.stop();
    } catch {
      /* already stopped */
    }
    void ctx.close();
  }

  return {
    ctx,
    get analyser() {
      return analyser;
    },
    resume,
    attachMic,
    inflate,
    stopInflate,
    raspberry,
    pop,
    setMuted,
    dispose,
  };
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
