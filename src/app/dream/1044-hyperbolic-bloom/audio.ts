/* ── 1044-hyperbolic-bloom · self-sufficient generative drone ────────────
 *
 *  Default sound is a fully generative drone: a detuned oscillator stack +
 *  sub-bass + a slow opening low-pass that sweeps brighter into the
 *  breakthrough and settles on the return. It needs zero permissions.
 *
 *  An OPTIONAL mic path is analysis-only: the mic feeds an AnalyserNode and
 *  NOTHING else. It is NEVER connected to audioCtx.destination (that would
 *  howl). When present, FFT bands modulate visual uniforms:
 *    bass  → geodesic fall speed
 *    mids  → warp amplitude
 *    highs → iridescence / chroma
 *    loud  → saturation
 *
 *  Master gain ~0.15, click-free fades, a limiter on the intense pole, and a
 *  full teardown. We also self-analyse the drone so visuals react even with
 *  no mic.
 */

export interface DroneAudio {
  /** Per-frame drive from the arc. All roughly 0..1. */
  update(glow: number, sat: number, fall: number, peak: number): void;
  /** FFT-derived bands (from mic if granted, else from the drone itself). */
  levels(): { bass: number; mid: number; high: number; loud: number };
  /** Attach an analysis-only mic stream. Returns true on success. */
  attachMic(stream: MediaStream): boolean;
  /** Smoothly silence + tear down everything. */
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode;
  gain: GainNode;
  baseHz: number;
}

// a low, jewel-bright stack: root, fifth, octave, major-tenth, shimmer
const CHORD_HZ = [49.0, 73.5, 98.0, 123.5, 196.0];

export function makeDroneAudio(
  ac: AudioContext,
  masterTarget = 0.15,
): DroneAudio {
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 5);

  // slow opening low-pass
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220, now);
  filter.Q.value = 3.5;

  const shimmer = ac.createGain();
  shimmer.gain.value = 0.0001;

  // sub-bass oscillator for body
  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 24.5;
  const subGain = ac.createGain();
  subGain.gain.value = 0.0001;
  sub.connect(subGain);

  // analyser hears the drone by default; if a mic is attached it taps that
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.84;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // limiter keeps the intense swell controlled
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.008;
  limiter.release.value = 0.25;

  filter.connect(master);
  shimmer.connect(master);
  subGain.connect(master);
  master.connect(analyser); // default analysis source = the drone
  master.connect(limiter);
  limiter.connect(ac.destination);
  sub.start(now);
  subGain.gain.exponentialRampToValueAtTime(0.18, now + 6);

  const voices: Voice[] = CHORD_HZ.map((hz, i) => {
    const osc = ac.createOscillator();
    const detune = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = i >= 4 ? "triangle" : "sawtooth";
    detune.type = "sine";
    osc.frequency.value = hz;
    detune.frequency.value = hz * 1.004 + 0.05 * (i + 1);
    gain.gain.value = 0.0001;
    osc.connect(gain);
    detune.connect(gain);
    gain.connect(i >= 4 ? shimmer : filter);
    osc.start(now);
    detune.start(now);
    gain.gain.exponentialRampToValueAtTime(i >= 4 ? 0.05 : 0.11, now + 3 + i);
    return { osc, detune, gain, baseHz: hz };
  });

  let stopped = false;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let micStream: MediaStream | null = null;
  let bass = 0;
  let mid = 0;
  let high = 0;
  let loud = 0;

  return {
    attachMic(stream: MediaStream): boolean {
      if (stopped) return false;
      try {
        micStream = stream;
        micSource = ac.createMediaStreamSource(stream);
        // analysis ONLY — re-tap the analyser from the mic, never to destination
        master.disconnect(analyser);
        micSource.connect(analyser);
        return true;
      } catch {
        return false;
      }
    },
    update(glow: number, sat: number, fall: number, peak: number) {
      if (stopped) return;
      const t = ac.currentTime;

      const cutoff = 220 + glow * 3400 + peak * 1500;
      filter.frequency.setTargetAtTime(cutoff, t, 0.5);
      filter.Q.setTargetAtTime(2.5 + peak * 5.0, t, 0.8);
      shimmer.gain.setTargetAtTime(0.03 + sat * 0.14 + peak * 0.1, t, 0.6);

      const drift = 1 + 0.003 * Math.sin(t * (0.05 + 0.06 * fall));
      voices.forEach((v) => {
        v.detune.frequency.setTargetAtTime(v.baseHz * 1.004 * drift, t, 1.2);
      });

      analyser.getByteFrequencyData(freqData);
      const n = freqData.length;
      let bSum = 0;
      let mSum = 0;
      let hSum = 0;
      let allSum = 0;
      const bassEnd = Math.max(1, Math.floor(n * 0.06));
      const midStart = bassEnd;
      const midEnd = Math.floor(n * 0.4);
      const highStart = Math.floor(n * 0.5);
      for (let i = 0; i < n; i++) {
        const val = freqData[i] / 255;
        allSum += val;
        if (i < bassEnd) bSum += val;
        if (i >= midStart && i < midEnd) mSum += val;
        if (i >= highStart) hSum += val;
      }
      bass = bSum / bassEnd;
      mid = mSum / Math.max(1, midEnd - midStart);
      high = hSum / Math.max(1, n - highStart);
      loud = allSum / n;
    },
    levels() {
      return { bass, mid, high, loud };
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
      try {
        sub.stop(t + 1.4);
      } catch {
        /* already stopped */
      }
      window.setTimeout(() => {
        voices.forEach((v) => {
          v.osc.disconnect();
          v.detune.disconnect();
          v.gain.disconnect();
        });
        sub.disconnect();
        subGain.disconnect();
        filter.disconnect();
        shimmer.disconnect();
        analyser.disconnect();
        limiter.disconnect();
        master.disconnect();
        if (micSource) micSource.disconnect();
        if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
      }, 1600);
    },
  };
}
