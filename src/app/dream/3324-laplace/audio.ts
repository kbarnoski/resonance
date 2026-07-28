// audio.ts — RHYTHM-FIRST generative voice for the Laplace chain.
//
// Each world is a percussive mallet voice STRUCK at every perihelion passage.
// The interlocking of those hits IS the music: a locked 4:2:1 chain fires a clean
// nested polyrhythm (4 : 2 : 1 hits per outer period); mistuned, the hits stumble.
// Under the percussion each world also holds a quiet sustained undertone whose
// pitch is derived CONTINUOUSLY from its orbital frequency (log(period) → pitch),
// never quantized to a comfort scale — the pitch IS the physics.
//
// On ejection a world's undertone bends up, a noise screech rises, and the whole
// voice fades over ~2s; the groove loses that layer.
//
// Master chain adds a light convolver reverb + feedback delay for a warm cosmic
// space. Web Audio API only, no external assets.

export interface AudioEngine {
  resume: () => Promise<void>;
  strike: (index: number, freqHz: number, intensity: number) => void;
  setPad: (index: number, freqHz: number, level: number) => void;
  ejectVoice: (index: number, freqHz: number) => void;
  restoreVoice: (index: number) => void;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

function makeReverbImpulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const ctx = new Ctx();

  // ── master chain ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  // warm reverb
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, 2.6, 2.4);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.32;

  // feedback delay (cosmic space)
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.32;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2200;
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.3;

  // dry bus that everything hits
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(comp);
  comp.connect(master);
  // reverb send
  bus.connect(reverbGain);
  reverbGain.connect(reverb);
  reverb.connect(master);
  // delay send + feedback loop
  bus.connect(delaySend);
  delaySend.connect(delay);
  delay.connect(delayTone);
  delayTone.connect(fb);
  fb.connect(delay);
  delayTone.connect(master);

  master.connect(ctx.destination);

  let muted = false;
  let disposed = false;

  // ── per-world sustained undertone (pad) ─────────────────────────────────────
  interface Pad {
    osc: OscillatorNode;
    sub: OscillatorNode;
    filt: BiquadFilterNode;
    gain: GainNode;
    ejected: boolean;
  }
  const pads: Pad[] = [];
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 220;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 110;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900;
    filt.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(filt);
    sub.connect(filt);
    filt.connect(gain);
    gain.connect(bus);
    osc.start();
    sub.start();
    pads.push({ osc, sub, filt, gain, ejected: false });
  }

  // shared noise buffer for percussion transients + screech
  const noiseBuf = (() => {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  const resume = async () => {
    if (ctx.state === "suspended") await ctx.resume();
    // fade master in
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, now + 0.6);
  };

  // ── percussive strike (mallet) ──────────────────────────────────────────────
  const strike = (index: number, freqHz: number, intensity: number) => {
    if (disposed || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const amp = Math.min(0.9, 0.22 + intensity * 0.6);
    // mallet body: two detuned partials, fast exponential decay
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(amp, now + 0.004);
    const decay = 0.18 + index * 0.14; // outer worlds ring a touch longer
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    g.connect(bus);

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freqHz;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freqHz * 2.01;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.4;
    o1.connect(g);
    o2.connect(o2g);
    o2g.connect(g);
    o1.start(now);
    o2.start(now);
    o1.stop(now + decay + 0.05);
    o2.stop(now + decay + 0.05);

    // attack transient click (bandpassed noise burst)
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = freqHz * 3;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(amp * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    n.start(now);
    n.stop(now + 0.08);
  };

  const setPad = (index: number, freqHz: number, level: number) => {
    const pad = pads[index];
    if (!pad || pad.ejected) return;
    const now = ctx.currentTime;
    pad.osc.frequency.setTargetAtTime(freqHz, now, 0.08);
    pad.sub.frequency.setTargetAtTime(freqHz * 0.5, now, 0.08);
    pad.filt.frequency.setTargetAtTime(700 + freqHz * 1.4, now, 0.1);
    pad.gain.gain.setTargetAtTime(Math.max(0.0001, level), now, 0.12);
  };

  const ejectVoice = (index: number, freqHz: number) => {
    const pad = pads[index];
    if (!pad || pad.ejected) return;
    pad.ejected = true;
    const now = ctx.currentTime;
    // bend the undertone UP over ~1.8s
    pad.osc.frequency.cancelScheduledValues(now);
    pad.osc.frequency.setValueAtTime(freqHz, now);
    pad.osc.frequency.exponentialRampToValueAtTime(freqHz * 6, now + 1.8);
    pad.sub.frequency.setValueAtTime(freqHz * 0.5, now);
    pad.sub.frequency.exponentialRampToValueAtTime(freqHz * 3, now + 1.8);
    pad.filt.frequency.cancelScheduledValues(now);
    pad.filt.frequency.setValueAtTime(pad.filt.frequency.value, now);
    pad.filt.frequency.exponentialRampToValueAtTime(6000, now + 1.4);
    // swell then die
    pad.gain.gain.cancelScheduledValues(now);
    pad.gain.gain.setValueAtTime(Math.max(0.0001, pad.gain.gain.value), now);
    pad.gain.gain.exponentialRampToValueAtTime(0.5, now + 0.4);
    pad.gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

    // noise screech that rises and fades
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.Q.value = 6;
    nf.frequency.setValueAtTime(freqHz * 2, now);
    nf.frequency.exponentialRampToValueAtTime(freqHz * 10, now + 1.8);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.28, now + 0.5);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    n.start(now);
    n.stop(now + 2.2);
  };

  const restoreVoice = (index: number) => {
    const pad = pads[index];
    if (!pad) return;
    pad.ejected = false;
    const now = ctx.currentTime;
    pad.gain.gain.cancelScheduledValues(now);
    pad.osc.frequency.cancelScheduledValues(now);
    pad.sub.frequency.cancelScheduledValues(now);
    pad.filt.frequency.cancelScheduledValues(now);
    pad.gain.gain.setValueAtTime(0.0001, now);
  };

  const setMuted = (m: boolean) => {
    muted = m;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(m ? 0.0001 : 0.9, now + 0.15);
  };

  const dispose = () => {
    disposed = true;
    try {
      pads.forEach((p) => {
        try {
          p.osc.stop();
          p.sub.stop();
        } catch {
          /* already stopped */
        }
      });
    } catch {
      /* ignore */
    }
    ctx.close().catch(() => {
      /* ignore */
    });
  };

  return {
    resume,
    strike,
    setPad,
    ejectVoice,
    restoreVoice,
    setMuted,
    dispose,
  };
}
