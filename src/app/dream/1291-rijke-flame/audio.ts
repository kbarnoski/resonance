// 1291-rijke-flame — audio.ts (OUTPUT ONLY, no mic, pure client synthesis)
//
// Synthesises the tube singing as a resonant open–open standing wave:
//   • a fundamental + a small stack of harmonics (2f, 3f, 4f) whose relative
//     levels shift with drive — breathy/soft at onset, brighter & pure at full
//     song. The 2nd harmonic swells independently when the second mode is driven
//     (the octave pocket), rewarding exploration.
//   • a band of filtered noise tuned to the fundamental = the pipe's breath /
//     turbulent onset. Loud while the tone is climbing, fades as it purifies.
//   • a soft sub an octave down + a low ember rumble so the drone has a floor.
//
//   voices + breath + sub → body lowpass (opens with drive) → limiter → master.
//   The render loop pushes setState() every frame; everything is smoothed with
//   setTargetAtTime so there's no zipper noise. Full teardown on stop().

const MASTER_PEAK = 0.3;

export interface RijkeState {
  freq: number;
  a1: number; // fundamental amplitude 0..1
  a2: number; // second-mode / octave amplitude 0..1
  breath: number; // breath-noise amount 0..1
  drive: number; // overall loudness 0..1
}

export interface AudioEngine {
  setState(s: RijkeState): void;
  stop(): void;
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 1.4);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(8, now);
  limiter.ratio.setValueAtTime(14, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.2, now);
  limiter.connect(master);

  // Pipe "body": a lowpass that opens as the tube drives harder → dull breath
  // at onset, bright ringing pipe at full song.
  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.setValueAtTime(500, now);
  body.Q.setValueAtTime(0.6, now);
  body.connect(limiter);

  // Gentle chorus vibrato shared across the harmonics — a real pipe never sits
  // perfectly still.
  const vib = ctx.createOscillator();
  vib.type = "sine";
  vib.frequency.setValueAtTime(4.6, now);
  const vibGain = ctx.createGain();
  vibGain.gain.setValueAtTime(3.5, now); // cents
  vib.connect(vibGain);
  vib.start();

  // Harmonic stack. gains are driven from setState each frame.
  const partials = [1, 2, 3, 4];
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < partials.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : i === 1 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(98 * partials[i], now);
    vibGain.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    osc.connect(g);
    g.connect(body);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  // Soft sub an octave below the fundamental for weight.
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(49, now);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, now);
  sub.connect(subGain);
  subGain.connect(body);
  sub.start();

  // Breath: broadband noise → bandpass tuned to the fundamental.
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx);
  noise.loop = true;
  const breathBp = ctx.createBiquadFilter();
  breathBp.type = "bandpass";
  breathBp.frequency.setValueAtTime(98, now);
  breathBp.Q.setValueAtTime(3.5, now);
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.0001, now);
  noise.connect(breathBp);
  breathBp.connect(breathGain);
  breathGain.connect(limiter);
  noise.start();

  // Low ember rumble bed — always faintly present, warms toward full drive.
  const ember = ctx.createBufferSource();
  ember.buffer = makeNoiseBuffer(ctx);
  ember.loop = true;
  const emberLp = ctx.createBiquadFilter();
  emberLp.type = "lowpass";
  emberLp.frequency.setValueAtTime(90, now);
  const emberGain = ctx.createGain();
  emberGain.gain.setValueAtTime(0.012, now);
  ember.connect(emberLp);
  emberLp.connect(emberGain);
  emberGain.connect(limiter);
  ember.start();

  let stopped = false;
  const S = 0.05; // smoothing time constant

  return {
    setState(s: RijkeState) {
      if (stopped) return;
      const t = ctx.currentTime;
      const f = Math.max(40, s.freq);
      const a1 = Math.max(0, Math.min(1, s.a1));
      const a2 = Math.max(0, Math.min(1, s.a2));
      const drive = Math.max(0, Math.min(1, s.drive));
      const breath = Math.max(0, Math.min(1, s.breath));

      // Harmonic frequencies track the fundamental.
      for (let i = 0; i < oscs.length; i++) {
        oscs[i].frequency.setTargetAtTime(f * partials[i], t, S);
      }
      sub.frequency.setTargetAtTime(f * 0.5, t, S);
      breathBp.frequency.setTargetAtTime(f, t, S);

      // Harmonic levels: fundamental from a1; 2f from octave-mode a2 plus a
      // little a1; upper harmonics grow with drive so it brightens as it sings.
      gains[0].gain.setTargetAtTime(0.0001 + 0.42 * a1, t, S);
      gains[1].gain.setTargetAtTime(0.0001 + 0.55 * a2 + 0.18 * a1 * drive, t, S);
      gains[2].gain.setTargetAtTime(0.0001 + 0.1 * a1 * drive + 0.06 * a2, t, S);
      gains[3].gain.setTargetAtTime(0.0001 + 0.05 * a1 * drive + 0.12 * a2 * drive, t, S);
      subGain.gain.setTargetAtTime(0.0001 + 0.14 * a1, t, S);

      // Breath noise: loud at onset, quiet when pure/loud.
      breathGain.gain.setTargetAtTime(0.0001 + 0.09 * breath, t, S);
      // Ember warms slightly with drive.
      emberGain.gain.setTargetAtTime(0.012 + 0.03 * drive, t, S);

      // Body filter opens with drive.
      body.frequency.setTargetAtTime(500 + drive * 3600, t, 0.12);
      body.Q.setTargetAtTime(0.6 + drive * 2.2, t, 0.15);
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      } catch {
        /* ctx already closing */
      }
      const killAt = t + 0.6;
      for (const o of oscs) {
        try {
          o.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      try {
        sub.stop(killAt);
        vib.stop(killAt);
        noise.stop(killAt);
        ember.stop(killAt);
      } catch {
        /* already stopped */
      }
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 700);
    },
  };
}
