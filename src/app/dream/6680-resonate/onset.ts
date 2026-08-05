// onset.ts — microphone capture + transient (knock) detection.
//
// We tap the mic through an AnalyserNode and, each frame, compute short-term
// energy plus spectral flux (rise in the frequency spectrum). A knock is a
// sudden broadband jump, so we fire when the fast energy envelope leaps above a
// slow-follow baseline AND flux spikes, gated by a refractory window so one
// physical tap makes exactly one strike. The returned velocity (0..1) drives the
// strike's excitation energy.

export type MicRig = {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  destroy: () => void;
};

export async function openMic(ctx: AudioContext): Promise<MicRig> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.0;
  source.connect(analyser); // analyser is a sink; not routed to destination.

  const destroy = () => {
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    for (const t of stream.getTracks()) t.stop();
  };

  return { stream, source, analyser, destroy };
}

export type OnsetDetector = {
  poll: (nowMs: number) => number | null; // returns velocity 0..1 on a knock
  level: () => number; // current input level 0..1 (for the meter)
};

export function makeOnsetDetector(analyser: AnalyserNode): OnsetDetector {
  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const prevFreq = new Float32Array(analyser.frequencyBinCount);

  let fast = 0; // fast energy envelope
  let slow = 0.0004; // slow baseline (noise floor)
  let lastOnset = -1e9;
  let curLevel = 0;

  const REFRACTORY = 85; // ms — one strike per physical tap
  const RISE = 2.4; // fast/slow ratio to trigger
  const FLOOR = 0.0016; // ignore ambient hiss

  return {
    poll(nowMs: number): number | null {
      analyser.getFloatTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
      const rms = Math.sqrt(sum / time.length);
      curLevel = Math.min(1, rms * 6);

      // spectral flux: positive spectral change since last frame.
      analyser.getFloatFrequencyData(freq);
      let flux = 0;
      for (let i = 0; i < freq.length; i++) {
        const a = Math.max(-140, freq[i]) + 140;
        const b = Math.max(-140, prevFreq[i]) + 140;
        const d = a - b;
        if (d > 0) flux += d;
        prevFreq[i] = freq[i];
      }
      flux /= freq.length;

      // envelopes
      fast = Math.max(rms, fast * 0.6);
      slow = slow * 0.995 + rms * 0.005;

      const ratio = fast / (slow + 1e-6);
      const canFire = nowMs - lastOnset > REFRACTORY;

      if (canFire && rms > FLOOR && ratio > RISE && flux > 1.2) {
        lastOnset = nowMs;
        // velocity from how far above baseline the transient is.
        const v = Math.min(1, Math.max(0.12, (ratio - RISE) * 0.14 + rms * 4));
        fast = rms; // reset so the tail doesn't re-trigger
        return v;
      }
      return null;
    },
    level() {
      return curLevel;
    },
  };
}
