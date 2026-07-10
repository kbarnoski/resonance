// audio.ts — the voice of the swarm.
//
// The swarm is not audio-reactive; it SINGS ITSELF. Every frame the simulation
// measures its own orbital geometry and hands us, per attractor, three numbers:
//   density  — how many motes are streaming through its periapsis shell
//   speed    — the mean speed (0..1) of those motes
//   grains   — how many motes crossed *into* the shell this frame
//
// Each attractor holds one sustained ADDITIVE voice: a fundamental sine plus a
// quiet octave and twelfth. Density swells its amplitude (the tone blooms as
// motes pile through periapsis); mean speed opens a gentle low-pass and adds a
// whisper of detune. Periapsis crossings fire soft enveloped sine GRAINS at the
// pitch — so the rhythm is emergent, set by the orbital periods themselves, not
// by any scheduler. A slow, boundless cosmic drone that plays the sky.

export interface VoiceTelemetry {
  id: number;
  freq: number;
  density: number;
  meanSpeed: number; // 0..1
  grains: number;
  pan: number; // -1..1, from the attractor's screen-x
}

interface Voice {
  fund: OscillatorNode;
  oct: OscillatorNode;
  twelfth: OscillatorNode;
  mix: GainNode; // sums the partials
  swell: GainNode; // density-driven amplitude
  filt: BiquadFilterNode; // speed-driven brightness
  pan: StereoPannerNode;
  freq: number;
}

export interface AudioEngine {
  resume: () => Promise<void>;
  render: (voices: VoiceTelemetry[]) => void;
  setMuted: (m: boolean) => void;
  stop: () => void;
  dispose: () => void;
}

const DENSITY_FULL = 320; // motes-in-shell that count as a "full" swell
const MAX_GRAINS_PER_FRAME = 3; // cap so a rush of crossings can't machine-gun

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const ctx = new Ctx();

  // master chain: soft compressor (glue + safety) → master gain (ramped from 0)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 28;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.3;

  const master = ctx.createGain();
  master.gain.value = 0;
  comp.connect(master);
  master.connect(ctx.destination);

  // a shared bus for the transient grains (kept a touch quieter than the drone)
  const grainBus = ctx.createGain();
  grainBus.gain.value = 0.9;
  grainBus.connect(comp);

  let muted = false;
  let alive = true;
  const voices = new Map<number, Voice>();

  const makeVoice = (freq: number): Voice => {
    const now = ctx.currentTime;
    const mix = ctx.createGain();
    mix.gain.value = 1;

    const mkPartial = (mult: number, level: number, detune: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(mix);
      o.start(now);
      return o;
    };
    const fund = mkPartial(1, 1.0, 0);
    const oct = mkPartial(2, 0.32, 0);
    const twelfth = mkPartial(3, 0.14, 0);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = freq * 3;
    filt.Q.value = 0.7;

    const swell = ctx.createGain();
    swell.gain.value = 0.0001;

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;

    mix.connect(filt);
    filt.connect(swell);
    swell.connect(pan);
    pan.connect(comp);

    return { fund, oct, twelfth, mix, swell, filt, pan, freq };
  };

  const dropVoice = (v: Voice, immediate = false) => {
    const now = ctx.currentTime;
    v.swell.gain.cancelScheduledValues(now);
    v.swell.gain.setValueAtTime(Math.max(0.0001, v.swell.gain.value), now);
    v.swell.gain.exponentialRampToValueAtTime(0.0001, now + (immediate ? 0.05 : 0.4));
    const t = now + (immediate ? 0.08 : 0.5);
    for (const o of [v.fund, v.oct, v.twelfth]) {
      try {
        o.stop(t);
      } catch {
        // already stopped
      }
    }
    setTimeout(
      () => {
        try {
          v.pan.disconnect();
          v.filt.disconnect();
          v.swell.disconnect();
          v.mix.disconnect();
        } catch {
          // already gone
        }
      },
      immediate ? 120 : 600
    );
  };

  const grain = (freq: number, gain: number, pan: number) => {
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    // grains ride an octave up — a shimmer above the drone
    o.frequency.value = freq * 2;
    const g = ctx.createGain();
    const dur = 0.18 + Math.random() * 0.22;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g);
    g.connect(p);
    p.connect(grainBus);
    o.start(now);
    o.stop(now + dur + 0.05);
    setTimeout(
      () => {
        try {
          p.disconnect();
        } catch {
          // gone
        }
      },
      (dur + 0.2) * 1000
    );
  };

  const resume = async () => {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.85, now + 1.0);
  };

  const render = (tele: VoiceTelemetry[]) => {
    if (!alive) return;
    const now = ctx.currentTime;

    // reconcile: create voices for new attractors, retune reused ids
    const seen = new Set<number>();
    for (const t of tele) {
      seen.add(t.id);
      let v = voices.get(t.id);
      if (!v) {
        v = makeVoice(t.freq);
        voices.set(t.id, v);
      } else if (Math.abs(v.freq - t.freq) > 0.01) {
        v.freq = t.freq;
        v.fund.frequency.linearRampToValueAtTime(t.freq, now + 0.12);
        v.oct.frequency.linearRampToValueAtTime(t.freq * 2, now + 0.12);
        v.twelfth.frequency.linearRampToValueAtTime(t.freq * 3, now + 0.12);
      }

      const d = Math.min(1, t.density / DENSITY_FULL);
      // amplitude blooms with density; a small floor keeps the sky humming
      const targetGain = 0.02 + d * 0.5;
      v.swell.gain.setTargetAtTime(targetGain, now, 0.12);

      // mean speed opens the filter and adds a hair of detune shimmer
      const cutoff = t.freq * (2.2 + t.meanSpeed * 5.5);
      v.filt.frequency.setTargetAtTime(cutoff, now, 0.15);
      const det = t.meanSpeed * 7;
      v.oct.detune.setTargetAtTime(det, now, 0.2);
      v.twelfth.detune.setTargetAtTime(-det, now, 0.2);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, t.pan)), now, 0.2);

      // periapsis passes → grains (capped, level tapered by how crowded the shell is)
      const nGrains = Math.min(MAX_GRAINS_PER_FRAME, t.grains);
      for (let i = 0; i < nGrains; i++) {
        const lvl = 0.05 + Math.random() * 0.05;
        grain(t.freq, lvl * (0.6 + 0.4 * (1 - d)), t.pan);
      }
    }

    // fade out voices whose attractor was removed
    for (const [id, v] of voices) {
      if (!seen.has(id)) {
        dropVoice(v);
        voices.delete(id);
      }
    }
  };

  const setMuted = (m: boolean) => {
    muted = m;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(m ? 0 : 0.85, now + 0.15);
  };

  // instant, graceful halt: ramp the bus to 0 in ~60ms
  const stop = () => {
    alive = false;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.06);
    for (const v of voices.values()) dropVoice(v, true);
    voices.clear();
  };

  const dispose = () => {
    alive = false;
    for (const v of voices.values()) {
      for (const o of [v.fund, v.oct, v.twelfth]) {
        try {
          o.stop();
        } catch {
          // already stopped
        }
      }
    }
    voices.clear();
    ctx.close().catch(() => {});
  };

  return { resume, render, setMuted, stop, dispose };
}
