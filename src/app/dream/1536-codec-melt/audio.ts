// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the synth voice + master chain for 1536-codec-melt.
//
// Each played key = one detuned saw/tri voice through a lowpass with a short ADSR;
// a continuous just-intonation drone bed sits underneath (shared droneBank). The
// whole thing lands on a single master GainNode (≤0.2) → DynamicsCompressor →
// destination, so no stack of voices can clip. Polyphony is capped and the oldest
// voice is stolen. All gain moves are ramped — no clicks.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

export interface MeltAudio {
  /** Trigger a voice. `intensity` (0..1) opens the filter and lengthens release. */
  playNote(freq: number, intensity: number): void;
  /** Swell the drone bed with the current melt/activity level (0..1). */
  setDrive(drive: number): void;
  /** Ramp everything down and release oscillators. */
  stop(): void;
}

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  bornAt: number;
}

const MAX_VOICES = 14;

export function makeMeltAudio(ctx: AudioContext, masterLevel = 0.18): MeltAudio {
  const level = Math.min(0.2, Math.max(0, masterLevel));

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(level, ctx.currentTime + 1.1);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-18, ctx.currentTime);
  comp.knee.setValueAtTime(22, ctx.currentTime);
  comp.ratio.setValueAtTime(6, ctx.currentTime);
  comp.attack.setValueAtTime(0.003, ctx.currentTime);
  comp.release.setValueAtTime(0.25, ctx.currentTime);

  master.connect(comp);
  comp.connect(ctx.destination);

  // Drone bed → master (droneBank connects its .output to the destination we pass).
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    ratios: [1, 3 / 2, 2, 5 / 2],
    peakGain: 0.13,
  });

  const voices: Voice[] = [];

  function releaseVoice(v: Voice, when: number, tail: number) {
    try {
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), when);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, when + tail);
      v.osc1.stop(when + tail + 0.02);
      v.osc2.stop(when + tail + 0.02);
    } catch {
      /* already stopped / context closing */
    }
  }

  function playNote(freq: number, intensity: number) {
    const t = ctx.currentTime;
    const amp = Math.min(1, Math.max(0, intensity));

    // Steal the oldest voice if we're at the polyphony cap.
    if (voices.length >= MAX_VOICES) {
      const old = voices.shift();
      if (old) releaseVoice(old, t, 0.08);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(9000, 500 + freq + amp * 3200), t);
    filter.Q.setValueAtTime(2 + amp * 5, t);

    const gain = ctx.createGain();
    const peak = 0.05 + amp * 0.07;
    const attack = 0.008;
    const decay = 0.12;
    const sustain = peak * 0.55;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, sustain), t + attack + decay);
    // Auto-release so held/idle notes decay like the visual melt "heals".
    const rel = 0.6 + amp * 1.1;
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay + rel);

    const detune = 6 + amp * 12;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(freq, t);
    osc1.detune.setValueAtTime(-detune, t);
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq, t);
    osc2.detune.setValueAtTime(detune, t);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc1.start(t);
    osc2.start(t);
    const stopAt = t + attack + decay + rel + 0.05;
    osc1.stop(stopAt);
    osc2.stop(stopAt);

    const v: Voice = { osc1, osc2, gain, filter, bornAt: t };
    voices.push(v);
    // Reap after it has finished so the array doesn't grow unbounded.
    osc1.onended = () => {
      const i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
      try {
        gain.disconnect();
        filter.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  function setDrive(drive: number) {
    drone.setDrive(Math.min(1, Math.max(0, drive)));
  }

  function stop() {
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    } catch {
      /* noop */
    }
    drone.stop();
    for (const v of voices) releaseVoice(v, t, 0.3);
    voices.length = 0;
    // Disconnect chrome after the fade so we don't cut the ramp.
    window.setTimeout(() => {
      try {
        master.disconnect();
        comp.disconnect();
      } catch {
        /* noop */
      }
    }, 500);
  }

  return { playNote, setDrive, stop };
}
