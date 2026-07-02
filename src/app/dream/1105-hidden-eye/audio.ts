// ─────────────────────────────────────────────────────────────────────────────
// 1105-hidden-eye · audio.ts
//
// The hidden surface's statistics drive a soft just-intonation drone. We roll
// our own oscillator bed (rather than the shared droneBank) because this piece
// needs to RETUNE the chord as the form-state morphs — a moving target the
// shared bank does not expose. Everything routes through a lowpass whose cutoff
// tracks the surface's relief, then a DynamicsCompressor limiter to the output.
//
//   relief      → filter brightness (more relief ⇒ brighter)
//   form state  → a new just chord, glided to over ~1.6 s
//   form lock   → a soft FM bell "pop" when a new form settles in
//
// Audio always sounds once started, regardless of whether the viewer can fuse.
// ─────────────────────────────────────────────────────────────────────────────

// Four gentle just-intonation chords over a slowly shifting root.
const ROOTS = [55.0, 61.87, 55.0, 73.33]; // A1 · ~B1 · A1 · D2
const CHORDS: number[][] = [
  [1, 6 / 5, 3 / 2, 2, 12 / 5], // soft minor
  [1, 5 / 4, 3 / 2, 2, 5 / 2], // open major
  [1, 9 / 8, 4 / 3, 5 / 3, 2], // suspended pentatonic
  [1, 6 / 5, 3 / 2, 9 / 5, 2], // minor seventh
];

export interface HiddenAudio {
  /** Per-frame drive. relief & meanDepth are ~0..1. */
  update(relief: number, meanDepth: number): void;
  /** Retune the chord bed to a new form state (0..3). */
  setForm(form: number): void;
  /** Fire a soft bell when a form locks in. */
  chime(): void;
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
}

export function makeHiddenAudio(ac: AudioContext, masterTarget = 0.18): HiddenAudio {
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 3);

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.006;
  limiter.release.value = 0.25;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(360, now);
  filter.Q.value = 0.9;

  filter.connect(master);
  master.connect(limiter);
  limiter.connect(ac.destination);

  const ratios = CHORDS[0];
  let root = ROOTS[0];
  const voices: Voice[] = ratios.map((ratio, i) => {
    const osc = ac.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(root * ratio, now);
    osc.detune.value = (i % 2 === 0 ? -4 : 4);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((0.5 / ratio) * 0.42 + 0.02, now + 2 + i * 0.4);
    osc.connect(gain);
    gain.connect(filter);
    osc.start(now);
    return { osc, gain, ratio };
  });

  let stopped = false;

  return {
    update(relief: number, meanDepth: number) {
      if (stopped) return;
      const t = ac.currentTime;
      const cutoff = 360 + relief * 4200 + meanDepth * 900;
      filter.frequency.setTargetAtTime(cutoff, t, 0.4);
      filter.Q.setTargetAtTime(0.9 + relief * 3.5, t, 0.6);
    },
    setForm(form: number) {
      if (stopped) return;
      const t = ac.currentTime;
      const chord = CHORDS[((form % 4) + 4) % 4];
      root = ROOTS[((form % 4) + 4) % 4];
      voices.forEach((v, i) => {
        v.ratio = chord[i];
        v.osc.frequency.setTargetAtTime(root * chord[i], t, 1.6);
      });
    },
    chime() {
      if (stopped) return;
      const t = ac.currentTime;
      // simple 2-op FM bell
      const carrier = ac.createOscillator();
      const mod = ac.createOscillator();
      const modGain = ac.createGain();
      const env = ac.createGain();
      const carHz = root * 4;
      carrier.type = "sine";
      mod.type = "sine";
      carrier.frequency.value = carHz;
      mod.frequency.value = carHz * 1.41;
      modGain.gain.value = carHz * 1.6;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(env);
      env.connect(filter);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + 1.9);
      mod.stop(t + 1.9);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      voices.forEach((v) => {
        try {
          v.osc.stop(t + 1.2);
        } catch {
          /* already stopped */
        }
      });
      window.setTimeout(() => {
        voices.forEach((v) => {
          v.osc.disconnect();
          v.gain.disconnect();
        });
        filter.disconnect();
        master.disconnect();
        limiter.disconnect();
      }, 1400);
    },
  };
}
