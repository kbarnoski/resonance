// Web Audio engine for "Illuminated Word".
//
// Consumes the Score built in manuscript.ts and voices it: vowels become warm
// sustained choir tones, consonants become short plucked articulations, sentence
// endings resolve onto a tonic chord, and a soft drone underpins the whole page
// like the pedal note of a hymn. Master chain ends in a limiter -> conservative
// master gain. Stop() tears everything down.

import type { Glyph, Score } from "./manuscript";

export interface Engine {
  ctx: AudioContext;
  startTime: number; // ctx time at which glyph t=0 sounds
  stop: () => void;
}

const MASTER_LEVEL = 0.2;
const MAX_VOICES = 12; // polyphony cap -> voice stealing beyond this

type AudioCtor = typeof AudioContext;

export function isAudioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);
}

function makeReverbImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export function startEngine(score: Score): Engine | null {
  if (!isAudioSupported()) return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  void ctx.resume();

  // ----- master chain: [voices] -> limiter -> master -> destination ----------
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.25);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-8, ctx.currentTime);
  limiter.knee.setValueAtTime(6, ctx.currentTime);
  limiter.ratio.setValueAtTime(12, ctx.currentTime);
  limiter.attack.setValueAtTime(0.003, ctx.currentTime);
  limiter.release.setValueAtTime(0.25, ctx.currentTime);
  limiter.connect(master);
  master.connect(ctx.destination);

  // reverb send (church-like tail)
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, 2.6, 2.4);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.9;
  reverb.connect(reverbGain);
  reverbGain.connect(limiter);

  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(limiter);

  const startTime = ctx.currentTime + 0.18;

  // ----- soft drone (tonic + fifth), swells in and out ----------------------
  const droneNodes: AudioNode[] = [];
  const droneOsc: OscillatorNode[] = [];
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.0001, startTime);
  droneGain.gain.setTargetAtTime(0.05, startTime, 1.2);
  droneGain.gain.setTargetAtTime(0.0001, startTime + score.totalDuration - 1.6, 0.7);
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 700;
  droneGain.connect(droneFilter);
  droneFilter.connect(dry);
  droneFilter.connect(reverb);
  [73.42 /* D2 */, 110.0 /* A2 */].forEach((f, k) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = k === 0 ? -3 : 3;
    o.connect(droneGain);
    o.start(startTime);
    o.stop(startTime + score.totalDuration + 0.2);
    droneOsc.push(o);
  });
  droneNodes.push(droneGain, droneFilter);

  // ----- voice scheduling with simple voice-stealing ------------------------
  const allOsc: OscillatorNode[] = [...droneOsc];
  const allNodes: AudioNode[] = [...droneNodes];
  const live: { end: number; release: (t: number) => void }[] = [];

  const notes = score.glyphs.filter((g) => g.freq > 0);
  for (const g of notes) {
    const at = startTime + g.start;

    // prune finished, then steal the oldest-ending voice if we are over budget
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].end <= at) live.splice(i, 1);
    }
    if (live.length >= MAX_VOICES) {
      let oldest = 0;
      for (let i = 1; i < live.length; i++) {
        if (live[i].end < live[oldest].end) oldest = i;
      }
      live[oldest].release(at);
      live.splice(oldest, 1);
    }

    const v = g.isVowel || g.cadence ? voiceVowel(g, at) : voiceConsonant(g, at);
    live.push(v);
  }

  function voiceVowel(g: Glyph, at: number) {
    const dur = g.cadence ? 1.4 : g.dur;
    const level = g.cadence ? 0.18 : 0.13;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(g.freq * 2.2, at);
    filter.frequency.setTargetAtTime(g.freq * 4.5, at, 0.15);
    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.setTargetAtTime(level, at, 0.09); // soft, choir-like attack
    const end = at + dur + 0.5;
    gain.gain.setTargetAtTime(0.0001, at + dur, 0.28);

    gain.connect(filter);
    filter.connect(dry);
    filter.connect(reverb);

    const detunes = [-5, 0, 6];
    const oscs = detunes.map((d, k) => {
      const o = ctx.createOscillator();
      o.type = k === 1 ? "triangle" : "sawtooth";
      o.frequency.setValueAtTime(g.freq, at);
      o.detune.value = d;
      o.connect(gain);
      o.start(at);
      o.stop(end + 0.1);
      allOsc.push(o);
      return o;
    });
    // gentle sub for body
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(g.freq / 2, at);
    sub.connect(gain);
    sub.start(at);
    sub.stop(end + 0.1);
    allOsc.push(sub);

    allNodes.push(gain, filter);
    return {
      end,
      release: (t: number) => {
        try {
          gain.gain.cancelScheduledValues(t);
          gain.gain.setTargetAtTime(0.0001, t, 0.06);
          oscs.forEach((o) => o.stop(t + 0.2));
          sub.stop(t + 0.2);
        } catch {
          /* already stopped */
        }
      },
    };
  }

  function voiceConsonant(g: Glyph, at: number) {
    const dur = Math.max(0.16, g.dur);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(g.freq * 1.6, at);
    filter.Q.value = 1.4;

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.006); // struck attack
    gain.gain.setTargetAtTime(0.0001, at + 0.01, dur * 0.5);
    const end = at + dur + 0.2;

    gain.connect(filter);
    filter.connect(dry);
    filter.connect(reverb);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(g.freq, at);
    o.connect(gain);
    o.start(at);
    o.stop(end);
    allOsc.push(o);

    // short noise transient for the "consonant" edge
    const noiseLen = Math.floor(ctx.sampleRate * 0.03);
    const nbuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
    const noise = ctx.createBufferSource();
    noise.buffer = nbuf;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.05;
    noise.connect(nGain);
    nGain.connect(filter);
    noise.start(at);
    noise.stop(at + 0.05);
    allNodes.push(gain, filter, nGain);

    return {
      end,
      release: (t: number) => {
        try {
          gain.gain.cancelScheduledValues(t);
          gain.gain.setTargetAtTime(0.0001, t, 0.03);
          o.stop(t + 0.1);
        } catch {
          /* already stopped */
        }
      },
    };
  }

  let torn = false;
  function stop() {
    if (torn) return;
    torn = true;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.05);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      allOsc.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      allNodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      });
      try {
        limiter.disconnect();
        master.disconnect();
        reverb.disconnect();
        reverbGain.disconnect();
        dry.disconnect();
      } catch {
        /* ignore */
      }
      if (ctx.state !== "closed") void ctx.close();
    }, 160);
  }

  return { ctx, startTime, stop };
}
