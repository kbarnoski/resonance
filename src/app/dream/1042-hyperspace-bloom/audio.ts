/* ── 1042-hyperspace-bloom · intense-but-controlled breakthrough drone ────
 *
 *  Pure Web Audio. A detuned oscillator stack + slow resonant filter sweep +
 *  high shimmer, riding the same ~75s journey envelope as the visuals: it
 *  rises into the "breakthrough" (brighter, more saturated, faster) then
 *  settles. An AnalyserNode FFTs our OWN output and exposes three bands:
 *    bass   → global rotation speed / flow
 *    highs  → fine detail / saturation
 *    loud   → neon emissive gain (mirrors the neural-gain finding)
 *
 *  Master chain ends in a compressor/limiter so the swell never clips or
 *  gets harsh. Teardown is complete.
 */

export interface BloomAudio {
  /** Drive per-frame from the timeline. `glow`,`sat`,`speed` 0..1-ish. */
  update(glow: number, sat: number, speed: number, peak: number): void;
  /** Latest FFT-derived levels, each ~0..1. */
  levels(): { bass: number; high: number; loud: number };
  /** Smoothly silence + tear down. */
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode;
  gain: GainNode;
  baseHz: number;
}

// a low, slightly wide just-ish chord: root, fifth, octave, tenth, shimmer
const CHORD_HZ = [55.0, 82.5, 110.0, 138.6, 220.0];

export function makeBloomAudio(ac: AudioContext, masterTarget = 0.16): BloomAudio {
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 5);

  // resonant filter that sweeps open toward the breakthrough
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(300, now);
  filter.Q.value = 4.5; // resonant edge for the "rising" feel

  // shimmer bus (the high voice gets extra air)
  const shimmer = ac.createGain();
  shimmer.gain.value = 0.0001;

  // analyser taps the master pre-limiter so it hears the real mix
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // limiter / compressor — keeps the intense pole controlled
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.008;
  limiter.release.value = 0.25;

  filter.connect(master);
  shimmer.connect(master);
  master.connect(analyser);
  master.connect(limiter);
  limiter.connect(ac.destination);

  const voices: Voice[] = CHORD_HZ.map((hz, i) => {
    const osc = ac.createOscillator();
    const detune = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = i >= 4 ? "triangle" : "sawtooth";
    detune.type = "sine";
    osc.frequency.value = hz;
    detune.frequency.value = hz * 1.004 + 0.06 * (i + 1); // slow beating
    gain.gain.value = 0.0001;
    osc.connect(gain);
    detune.connect(gain);
    // shimmer voice goes through its own bus for extra brightness control
    gain.connect(i >= 4 ? shimmer : filter);
    osc.start(now);
    detune.start(now);
    gain.gain.exponentialRampToValueAtTime(
      i >= 4 ? 0.05 : 0.12,
      now + 3 + i * 1.1,
    );
    return { osc, detune, gain, baseHz: hz };
  });

  let stopped = false;
  let bass = 0;
  let high = 0;
  let loud = 0;

  return {
    update(glow: number, sat: number, speed: number, peak: number) {
      if (stopped) return;
      const t = ac.currentTime;

      // filter sweeps open with the journey; resonance climbs at the peak
      const cutoff = 300 + glow * 3200 + peak * 1400;
      filter.frequency.setTargetAtTime(cutoff, t, 0.5);
      filter.Q.setTargetAtTime(3.0 + peak * 5.0, t, 0.8);

      // shimmer rises with saturation/highs
      shimmer.gain.setTargetAtTime(0.04 + sat * 0.14 + peak * 0.1, t, 0.6);

      // slow pitch wobble for hyperdimensional shimmer; faster near peak
      const drift = 1 + 0.003 * Math.sin(t * (0.05 + 0.06 * speed));
      voices.forEach((v) => {
        v.detune.frequency.setTargetAtTime(v.baseHz * 1.004 * drift, t, 1.2);
      });

      // ── FFT self-analysis → expose three bands ──
      analyser.getByteFrequencyData(freqData);
      const n = freqData.length;
      let bSum = 0;
      let hSum = 0;
      let allSum = 0;
      const bassEnd = Math.max(1, Math.floor(n * 0.06));
      const highStart = Math.floor(n * 0.45);
      for (let i = 0; i < n; i++) {
        const val = freqData[i] / 255;
        allSum += val;
        if (i < bassEnd) bSum += val;
        if (i >= highStart) hSum += val;
      }
      bass = bSum / bassEnd;
      high = hSum / Math.max(1, n - highStart);
      loud = allSum / n;
    },
    levels() {
      return { bass, high, loud };
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      voices.forEach((v) => {
        try {
          v.osc.stop(t + 1.4);
          v.detune.stop(t + 1.4);
        } catch {
          /* already stopped */
        }
      });
      window.setTimeout(() => {
        voices.forEach((v) => {
          v.osc.disconnect();
          v.detune.disconnect();
          v.gain.disconnect();
        });
        filter.disconnect();
        shimmer.disconnect();
        analyser.disconnect();
        limiter.disconnect();
        master.disconnect();
      }, 1600);
    },
  };
}
