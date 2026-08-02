/* ── 5272-rebus · generative predictive-coding audio ─────────────────────
 *
 *  Real Web Audio synthesis (no samples, no keyboard instrument). A four-
 *  voice drone bank + two shimmer-bell voices — six voices total — through a
 *  single DynamicsCompressor limiter to the destination.
 *
 *  The drone tracks the field's coherence, i.e. the bloom (1−g):
 *    · SOBER  — thin, quiet, detuned and slightly dissonant, jittering with
 *               the incoming sensory energy. The prediction has not taken over.
 *    · BLOOM  — the four voices glide onto a just-intoned chord (1 : 5/4 :
 *               3/2 : 2), thicken, and a low-pass filter opens for brightness;
 *               shimmer bells ring on strong emergent visual features.
 *
 *  Everything is smoothed with setTargetAtTime so nothing clicks. Frequencies
 *  are set from the render loop each frame. Master gain ramps in/out; teardown
 *  is complete.
 */

// Just-intonation targets the chord glides toward at full bloom.
const JUST = [1, 5 / 4, 3 / 2, 2];
// Slightly detuned, mildly dissonant ratios the drone sits on when sober.
const SOBER_RATIOS = [1, 1.32, 1.51, 1.98];
const BASE_HZ = 110; // A2

interface Drone {
  osc: OscillatorNode;
  gain: GainNode;
}

interface Bell {
  osc: OscillatorNode;
  gain: GainNode;
  busy: number; // performance.now() ms until which this voice is ringing
}

export interface RebusAudio {
  update: (
    bloom: number,
    coherence: number,
    activity: number,
    bell: number,
    voiceEnergy: number,
    nowMs: number,
  ) => void;
  stop: () => void;
}

export function makeRebusAudio(ac: AudioContext, level: number): RebusAudio {
  const now = ac.currentTime;

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;
  limiter.connect(ac.destination);

  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(limiter);

  // Brightness filter — closed and dull when sober, opens as it blooms.
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  filter.Q.value = 0.6;
  filter.connect(master);

  const drones: Drone[] = [];
  for (let i = 0; i < 4; i++) {
    const osc = ac.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = BASE_HZ * SOBER_RATIOS[i];
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(filter);
    osc.start(now);
    drones.push({ osc, gain });
  }

  const bells: Bell[] = [];
  for (let i = 0; i < 2; i++) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = BASE_HZ * 4;
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master); // bells bypass the low-pass so they always shimmer
    osc.start(now);
    bells.push({ osc, gain, busy: 0 });
  }

  // Fade the whole rig in.
  master.gain.setTargetAtTime(level, now, 1.2);

  let stopped = false;

  function update(
    bloom: number,
    coherence: number,
    activity: number,
    bell: number,
    voiceEnergy: number,
    nowMs: number,
  ): void {
    if (stopped) return;
    const t = ac.currentTime;

    // Drone frequencies glide from the dissonant sober set to just intonation.
    for (let i = 0; i < drones.length; i++) {
      const ratio = SOBER_RATIOS[i] + (JUST[i] - SOBER_RATIOS[i]) * bloom;
      // A little sensory-driven jitter, strongest when sober (unresolved).
      const jitter = (voiceEnergy - 0.5) * 0.9 * (1 - bloom);
      const hz = BASE_HZ * ratio + jitter;
      drones[i].osc.frequency.setTargetAtTime(hz, t, 0.08);
      // Upper voices swell in as the chord consolidates; sober stays thin.
      const voiceLevel =
        (i === 0 ? 0.5 : 0.14 + 0.26 * bloom) * (0.55 + 0.45 * coherence);
      drones[i].gain.gain.setTargetAtTime(voiceLevel, t, 0.15);
    }

    // Filter opens toward the peak → brightness tracks the hallucination.
    const cutoff = 420 + bloom * 2600 + activity * 900;
    filter.frequency.setTargetAtTime(cutoff, t, 0.2);

    // Shimmer bell on a strong emergent feature — grab a free voice.
    if (bell > 0.35) {
      const b = bells.find((v) => v.busy < nowMs);
      if (b) {
        // Ring a high just-toned partial; pan of feature → pitch choice.
        const partial = 4 * (bell > 0.7 ? 1.5 : 1) * (bell > 0.55 ? 1.25 : 1);
        b.osc.frequency.setTargetAtTime(BASE_HZ * partial, t, 0.01);
        const peak = 0.05 + bell * 0.14;
        b.gain.gain.cancelScheduledValues(t);
        b.gain.gain.setValueAtTime(b.gain.gain.value, t);
        b.gain.gain.linearRampToValueAtTime(peak, t + 0.02);
        b.gain.gain.setTargetAtTime(0.0001, t + 0.03, 0.5);
        b.busy = nowMs + 1400;
      }
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0, t, 0.4);
    const stopAt = t + 1.4;
    for (const d of drones) {
      try {
        d.osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    for (const b of bells) {
      try {
        b.osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
  }

  return { update, stop };
}
