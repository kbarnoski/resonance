// audio.ts — additive modal synth for the room instrument (Web Audio API only).
//
// The current mode and its two nearest neighbours (by frequency) sound
// together as a soft sine chord — the room's low-end signature. Because every
// modal frequency is derived live from Lx,Ly,Lz, dragging a dimension slider
// glides the oscillators: you HEAR the room retune. A DynamicsCompressor acts
// as a gentle limiter and master gain stays modest (<= 0.16).

const MASTER_GAIN = 0.14;
const VOICE_COUNT = 3;
const MIN_HZ = 28;
const MAX_HZ = 1200;

function clampHz(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return MIN_HZ;
  return Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export interface RoomAudio {
  ctx: AudioContext;
  /** Retune to a chord; freqs[0] is the landed mode. `bloom` re-pings the env. */
  setChord: (freqs: number[], bloom: boolean) => void;
  close: () => Promise<void>;
}

export function makeRoomAudio(): RoomAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // per-voice weights: fundamental loudest, neighbours softer
  const weights = [1.0, 0.5, 0.34];
  const voices: Voice[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = MIN_HZ * (i + 1);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    voices.push({ osc, gain });
  }

  const setChord = (freqs: number[], bloom: boolean) => {
    const now = ctx.currentTime;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const v = voices[i];
      const hz = clampHz(freqs[i] ?? freqs[0] ?? MIN_HZ);
      // glide the pitch -> audible retune when dimensions change
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(
        Math.max(MIN_HZ, v.osc.frequency.value),
        now,
      );
      v.osc.frequency.exponentialRampToValueAtTime(hz, now + 0.14);

      const target = MASTER_GAIN > 0 ? weights[i] : 0;
      v.gain.gain.cancelScheduledValues(now);
      if (bloom) {
        // soft pluck: quick swell, gentle settle to a sustained hum
        const cur = Math.max(0.0001, v.gain.gain.value);
        v.gain.gain.setValueAtTime(cur, now);
        v.gain.gain.linearRampToValueAtTime(target, now + 0.05);
        v.gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, target * 0.62),
          now + 0.9,
        );
      } else {
        v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
        v.gain.gain.linearRampToValueAtTime(target * 0.62, now + 0.12);
      }
    }
  };

  const close = async () => {
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.05);
        v.osc.stop(now + 0.3);
      } catch {
        // already stopped
      }
    }
    try {
      await ctx.close();
    } catch {
      // ignore
    }
  };

  return { ctx, setChord, close };
}
