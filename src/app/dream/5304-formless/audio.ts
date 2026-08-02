/**
 * Formless — generative just-intoned drone that sonifies the segregated →
 * globally-integrated brain shift seen in the formless jhānas.
 *
 * At absorption a≈0 the four voices are detuned and stereo-spread (segregated
 * partials); as a→1 the detune eases to zero and the pans collapse to centre so
 * they fuse into one integrated tone. A soft bell rings on each morph crossing.
 */

const ROOT = 61.735; // B1
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2]; // just intonation over the root
const MASTER_CAP = 0.18;

export interface AudioEngine {
  start: () => void;
  update: (a: number, breath: number) => void;
  bell: (ratio: number) => void;
  stop: () => void;
  dispose: () => void;
}

function makeImpulse(
  ctx: AudioContext,
  seconds: number,
  rand: () => number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.4);
      data[i] = (rand() * 2 - 1) * decay;
    }
  }
  return buf;
}

export function createAudioEngine(
  ctx: AudioContext,
  rand: () => number,
): AudioEngine {
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 320;
  lowpass.Q.value = 0.5;

  const dry = ctx.createGain();
  dry.gain.value = 0.65;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 4.5, rand);

  lowpass.connect(dry).connect(limiter);
  lowpass.connect(reverb).connect(wet).connect(limiter);
  limiter.connect(master).connect(ctx.destination);

  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  bus.connect(lowpass);

  const oscs: OscillatorNode[] = [];
  const panners: StereoPannerNode[] = [];
  const panBase: number[] = [];
  const detuneSign: number[] = [];
  for (let i = 0; i < RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT * RATIOS[i];

    const g = ctx.createGain();
    g.gain.value = 0.16;

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;

    osc.connect(g).connect(pan).connect(bus);
    osc.start();

    oscs.push(osc);
    panners.push(pan);
    panBase.push(i % 2 === 0 ? 0.85 : -0.85);
    detuneSign.push(i % 2 === 0 ? 1 : -1);
  }

  let stopped = false;
  const liveBells = new Set<OscillatorNode>();

  return {
    start() {
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(MASTER_CAP, now + 3.0);
    },
    update(a: number, breath: number) {
      if (stopped) return;
      const now = ctx.currentTime;
      const seg = 1 - a; // segregation amount
      for (let i = 0; i < oscs.length; i++) {
        // detune → 0 as absorption rises (partials fuse)
        const cents = detuneSign[i] * (16 + i * 4) * seg;
        oscs[i].detune.setTargetAtTime(cents, now, 0.4);
        // pans collapse to centre as absorption rises
        panners[i].pan.setTargetAtTime(panBase[i] * seg, now, 0.5);
      }
      // filter opens as the space brightens (absorption + breath)
      const cutoff = 320 + a * 3400 + breath * 1800;
      lowpass.frequency.setTargetAtTime(Math.min(6000, cutoff), now, 0.3);
    },
    bell(ratio: number) {
      if (stopped) return;
      const now = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT * ratio * 4;
      o.connect(g).connect(reverb);
      o.connect(g).connect(dry);
      o.start(now);
      o.stop(now + 2.7);
      liveBells.add(o);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
        liveBells.delete(o);
      };
    },
    stop() {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.5);
    },
    dispose() {
      stopped = true;
      try {
        for (const o of oscs) o.stop();
        for (const o of liveBells) o.stop();
      } catch {
        // already stopped
      }
    },
  };
}

export { RATIOS };
