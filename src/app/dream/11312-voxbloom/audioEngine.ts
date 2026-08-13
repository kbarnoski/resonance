// ─────────────────────────────────────────────────────────────────────────────
// audioEngine.ts — the sound source behind VOXBLOOM.
//
// One AnalyserNode feeds the visuals. Two things can drive it:
//   • a seeded self-demo (a soft minor-pentatonic arpeggio over a slow pad),
//     started on mount so the sculpture is alive within ~1s with no permission;
//   • the live microphone, swapped in when the visitor taps "Start microphone".
//
// Everything audible is routed through the shared safe master bus. The mic is
// tapped into the analyser ONLY (never back to the speakers) so there is no
// chance of feedback.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// Minor-pentatonic (A minor) across two octaves, in Hz.
const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

export interface AudioEngine {
  analyser: AnalyserNode;
  freqData: Uint8Array;
  /** Fill `freqData` with the current spectrum. */
  sample(): void;
  /** Kick the seeded self-demo (safe to call repeatedly). */
  startDemo(): void;
  /** Silence the self-demo without tearing anything down. */
  stopDemo(): void;
  /** Swap in the live mic. Throws if permission is denied. */
  startMic(): Promise<void>;
  /** Drop the mic and restore the self-demo. */
  stopMic(): void;
  /** Full teardown: stop everything, close the context. */
  dispose(): Promise<void>;
}

export function createAudioEngine(): AudioEngine {
  const ctx = new AudioContext();
  const master: SafeMaster = createSafeMaster(ctx, { gain: 0.5 });

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // The master output is tapped into the analyser so the self-demo is visualised.
  master.input.connect(analyser);

  // ── self-demo state ─────────────────────────────────────────────────────────
  let demoOn = false;
  let padNodes: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  let arpTimer: ReturnType<typeof setInterval> | null = null;
  let arpStep = 0;

  function startDemo() {
    if (demoOn) return;
    demoOn = true;
    void ctx.resume();

    // Slow pad: two detuned triangles through a soft lowpass, breathing gain.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 110;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 110 * 1.005;
    // Breathing LFO on the pad gain.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(gain.gain);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(master.input);
    osc.start();
    osc2.start();
    lfo.start();
    // Stash primary osc + a merged handle for teardown.
    padNodes = { osc, gain, filter };
    // Keep the secondary/LFO alive by parking them on the primary osc.
    (osc as OscillatorNode & { _extra?: OscillatorNode[] })._extra = [osc2, lfo];

    // Arpeggio: pluck a scale note through an AD envelope every ~330ms.
    arpTimer = setInterval(() => {
      const note = SCALE[arpStep % SCALE.length];
      arpStep = (arpStep + 1) % 32;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = note * (arpStep % 8 === 0 ? 2 : 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(master.input);
      o.start(t);
      o.stop(t + 1.0);
    }, 330);
  }

  function stopDemo() {
    if (!demoOn) return;
    demoOn = false;
    if (arpTimer) {
      clearInterval(arpTimer);
      arpTimer = null;
    }
    if (padNodes) {
      try {
        padNodes.osc.stop();
        const extra = (padNodes.osc as OscillatorNode & { _extra?: OscillatorNode[] })._extra;
        extra?.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        });
        padNodes.gain.disconnect();
        padNodes.filter.disconnect();
      } catch {
        /* already stopped */
      }
      padNodes = null;
    }
  }

  // ── microphone ──────────────────────────────────────────────────────────────
  let micStream: MediaStream | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;

  async function startMic() {
    await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    });
    stopDemo();
    micStream = stream;
    micSource = ctx.createMediaStreamSource(stream);
    // Tap the mic into the analyser ONLY — never to the speakers (no feedback).
    micSource.connect(analyser);
  }

  function stopMic() {
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((tr) => tr.stop());
      micStream = null;
    }
  }

  async function dispose() {
    stopDemo();
    stopMic();
    try {
      master.disconnect();
    } catch {
      /* closing */
    }
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
  }

  return {
    analyser,
    freqData,
    sample() {
      analyser.getByteFrequencyData(freqData);
    },
    startDemo,
    stopDemo,
    startMic,
    stopMic,
    dispose,
  };
}
