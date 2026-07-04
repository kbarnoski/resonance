/*
 * Superfluid audio engine (Web Audio API, no libraries).
 *
 *  - A low, evolving DRONE bed: detuned oscillators through a lowpass with a
 *    slow gain LFO, plus a quiet filtered-noise "shimmer".
 *  - A reconnection BURST per event: a fast-decay bell whose brightness/pitch
 *    tracks the reconnection energy. The envelope encodes the 2025 asymmetry —
 *    near-instant attack, a snappier/brighter decay than the approach — the
 *    "cardiac ripple" of strands separating faster than they meet.
 *  - A voice pool caps simultaneous bursts; a master compressor limits peaks.
 */

export interface AudioEngine {
  resume: () => Promise<void>;
  reconnection: (energy: number) => void;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

// A pentatonic-ish set of pitches for reconnection bells (Hz) — musical, spacious.
const BELL_SCALE = [220, 261.63, 329.63, 392, 493.88, 587.33, 659.25, 783.99];

export function createAudio(): AudioEngine {
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();

  // ── master chain ──────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);

  // ── drone bed ─────────────────────────────────────────────────────────
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.16;
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 340;
  bedFilter.Q.value = 0.7;
  bedFilter.connect(bedGain).connect(master);

  const droneFreqs = [55, 82.4, 110]; // A1, ~E2, A2
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < droneFreqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = i === 2 ? "triangle" : "sine";
    o.frequency.value = droneFreqs[i];
    o.detune.value = (i - 1) * 6; // gentle detune for beating
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.6 : 0.32;
    o.connect(g).connect(bedFilter);
    o.start();
    oscs.push(o);
  }

  // slow gain LFO so the bed breathes (kept ≤ ~0.1 Hz, no strobe)
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.06;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.06;
  lfo.connect(lfoDepth).connect(bedGain.gain);
  lfo.start();

  // filtered-noise shimmer (very quiet, panned slowly)
  const noiseLen = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 2200;
  noiseFilter.Q.value = 3;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.012;
  const shimmerPan = ctx.createStereoPanner();
  const panLfo = ctx.createOscillator();
  panLfo.frequency.value = 0.05;
  const panDepth = ctx.createGain();
  panDepth.gain.value = 0.8;
  panLfo.connect(panDepth).connect(shimmerPan.pan);
  panLfo.start();
  noise.connect(noiseFilter).connect(noiseGain).connect(shimmerPan).connect(master);
  noise.start();

  // ── reconnection burst voice pool ─────────────────────────────────────
  const MAX_VOICES = 6;
  let live = 0;
  let lastTrig = 0;

  function reconnection(energy: number): void {
    const now = ctx.currentTime;
    if (live >= MAX_VOICES) return;
    if (now - lastTrig < 0.012) return; // debounce a burst cluster
    lastTrig = now;
    live++;

    const e = Math.max(0, Math.min(1, energy));
    // pitch climbs with energy; pick a scale degree
    const deg = Math.min(BELL_SCALE.length - 1, Math.floor(e * (BELL_SCALE.length - 1)));
    const freq = BELL_SCALE[deg] * (1 + (Math.random() - 0.5) * 0.01);

    const voice = ctx.createGain();
    voice.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * (2 + e * 2); // brighter with energy
    bp.Q.value = 6;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.4;
    voice.connect(bp).connect(pan).connect(master);

    // bell partials: a fast-decay sine cluster
    const partials = [1, 2.01, 2.76];
    const oscsV: OscillatorNode[] = [];
    for (let k = 0; k < partials.length; k++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * partials[k];
      const pg = ctx.createGain();
      pg.gain.value = k === 0 ? 1 : 0.4 / (k + 1);
      o.connect(pg).connect(voice);
      o.start(now);
      oscsV.push(o);
    }

    // Envelope with the reconnection ASYMMETRY:
    //  - near-instant attack (strands meet)
    //  - a snappier, brighter release (they recoil faster than they approached)
    const peak = 0.16 + e * 0.22;
    const attack = 0.004;
    const decay = 0.28 + (1 - e) * 0.25; // higher energy ⇒ shorter, snappier tail
    voice.gain.cancelScheduledValues(now);
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(peak, now + attack);
    voice.gain.exponentialRampToValueAtTime(0.0008, now + attack + decay);
    // brightness sweeps down as it decays — the "ripple" settling
    bp.frequency.setValueAtTime(freq * (2 + e * 2), now);
    bp.frequency.exponentialRampToValueAtTime(freq * 0.9, now + attack + decay);

    const stop = now + attack + decay + 0.05;
    for (const o of oscsV) o.stop(stop);
    oscsV[0].onended = () => {
      live = Math.max(0, live - 1);
      voice.disconnect();
      bp.disconnect();
      pan.disconnect();
    };
  }

  let disposed = false;
  let muted = false;

  async function resume(): Promise<void> {
    if (ctx.state === "suspended") await ctx.resume();
    // fade the bed in
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.9, now + 1.6);
  }

  function setMuted(m: boolean): void {
    muted = m;
    if (disposed) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(m ? 0 : 0.9, now + 0.4);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    try {
      for (const o of oscs) o.stop();
      lfo.stop();
      panLfo.stop();
      noise.stop();
    } catch {
      // already stopped
    }
    ctx.close().catch(() => {});
  }

  return { resume, reconnection, setMuted, dispose };
}
