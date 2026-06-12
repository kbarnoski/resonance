/**
 * audio.ts — Web Audio synthesis for the xenharmonic lattice
 *
 * Each node plays a tone built from:
 *   - Fundamental sine at exact frequency ratio
 *   - 2nd partial at 2× freq (sine, lower gain)
 *   - 3rd partial at 3× freq (sine, even lower gain)
 *
 * This produces a clear, luminous timbre — more than a bare sine,
 * but not so complex it masks the tuning's pure intervals.
 *
 * Master chain: per-note gain → limiter → destination
 */

export interface ActiveNote {
  oscs: OscillatorNode[];
  gainNode: GainNode;
  freq: number;
  id: string; // `${u},${v}`
}

export interface AudioEngine {
  ctx: AudioContext;
  limiter: DynamicsCompressorNode;
  masterGain: GainNode;
  activeNotes: Map<string, ActiveNote>;
  startNote: (id: string, freq: number) => void;
  stopNote: (id: string) => void;
  stopAll: () => void;
  close: () => void;
}

const PARTIALS = [
  { multiplier: 1, gain: 0.6 },
  { multiplier: 2, gain: 0.25 },
  { multiplier: 3, gain: 0.12 },
  { multiplier: 5, gain: 0.05 },
];

const ATTACK = 0.025; // seconds
const RELEASE = 0.35; // seconds
const MAX_GAIN = 0.18; // per note

export function createAudioEngine(): AudioEngine | null {
  try {
    const ctx = new AudioContext();

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 2;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    masterGain.connect(limiter);
    limiter.connect(ctx.destination);

    const activeNotes = new Map<string, ActiveNote>();

    function startNote(id: string, freq: number) {
      if (activeNotes.has(id)) return;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(MAX_GAIN, ctx.currentTime + ATTACK);
      gainNode.connect(masterGain);

      const oscs: OscillatorNode[] = [];
      for (const p of PARTIALS) {
        const partialGain = ctx.createGain();
        partialGain.gain.value = p.gain;

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq * p.multiplier;

        osc.connect(partialGain);
        partialGain.connect(gainNode);
        osc.start(ctx.currentTime);
        oscs.push(osc);
      }

      activeNotes.set(id, { oscs, gainNode, freq, id });
    }

    function stopNote(id: string) {
      const note = activeNotes.get(id);
      if (!note) return;
      activeNotes.delete(id);

      const { gainNode, oscs } = note;
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + RELEASE);

      setTimeout(() => {
        oscs.forEach((o) => {
          try {
            o.stop();
            o.disconnect();
          } catch {
            // already stopped
          }
        });
        try {
          gainNode.disconnect();
        } catch {
          // already disconnected
        }
      }, (RELEASE + 0.1) * 1000);
    }

    function stopAll() {
      const ids = Array.from(activeNotes.keys());
      ids.forEach(stopNote);
    }

    function close() {
      stopAll();
      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // already closed
        }
      }, (RELEASE + 0.2) * 1000);
    }

    return { ctx, limiter, masterGain, activeNotes, startNote, stopNote, stopAll, close };
  } catch {
    return null;
  }
}
