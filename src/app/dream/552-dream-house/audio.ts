/**
 * audio.ts — Long-form drone synthesis for Dream House 552
 *
 * Architecture:
 *   Per-voice: [OscillatorNode (sine) + odd partials] → voiceGain → masterGain
 *                                                                         ↓
 *                                                              lowpass (drifting)
 *                                                                         ↓
 *                                                           DynamicsCompressor (~20:1)
 *                                                                         ↓
 *                                                                   destination
 *
 * Voices crossfade with multi-second attack/release via setTargetAtTime.
 * Max simultaneous oscillators capped at MAX_VOICES × PARTIALS_PER_VOICE.
 * Gain per voice scales with voice count to prevent accumulation.
 */

export interface DroneVoice {
  id: string; // `${u},${v}`
  oscs: OscillatorNode[];
  lfo: OscillatorNode;
  lfoGain: GainNode;
  voiceGain: GainNode;
  freq: number;
  targetGain: number;
  alive: boolean;
}

export interface DroneEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  lowpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  voices: Map<string, DroneVoice>;
  /** Add or update a voice. Returns the voice. */
  upsertVoice: (id: string, freq: number, targetGain: number) => void;
  /** Gracefully fade out and remove a voice */
  removeVoice: (id: string) => void;
  /** Remove all voices not in keepIds */
  pruneVoices: (keepIds: Set<string>) => void;
  /** Update all voice gains (for density changes) */
  rescaleGains: (perVoiceGain: number) => void;
  /** Set lowpass cutoff (Hz) with a slow glide */
  setFilterCutoff: (hz: number, timeSec: number) => void;
  /** Ramp master gain to value over seconds */
  setMasterGain: (value: number, timeSec: number) => void;
  close: () => void;
}

// Partials: sine fundamental + 3rd and 5th harmonics (odd only — warm, drone-like)
const PARTIALS = [
  { mult: 1, gain: 0.55 },
  { mult: 3, gain: 0.20 },
  { mult: 5, gain: 0.08 },
];

const ATTACK_TC = 3.0;   // setTargetAtTime time constant for attack (seconds)
const RELEASE_TC = 4.0;  // time constant for release
const LFO_RATE = 0.07;   // Hz — very slow shimmer LFO
const LFO_DEPTH = 1.8;   // Hz depth for detune shimmer
const MAX_VOICES = 8;    // hard cap on simultaneous voices

export function createDroneEngine(): DroneEngine | null {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    // Master gain (fades in on start)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);

    // Drifting lowpass filter
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(1200, ctx.currentTime);
    lowpass.Q.value = 0.8;

    // Brick-wall dynamics compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 3;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // Chain
    masterGain.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(ctx.destination);

    const voices = new Map<string, DroneVoice>();

    function buildVoice(id: string, freq: number, targetGain: number): DroneVoice {
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      voiceGain.connect(masterGain);

      // LFO for shimmer
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = LFO_RATE + Math.random() * 0.04; // slight variation
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = LFO_DEPTH;
      lfo.connect(lfoGain);

      const oscs: OscillatorNode[] = [];
      for (const p of PARTIALS) {
        const partialGain = ctx.createGain();
        partialGain.gain.value = p.gain;

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq * p.mult;
        // Connect LFO detune to fundamental only
        if (p.mult === 1) {
          lfoGain.connect(osc.detune);
        }

        osc.connect(partialGain);
        partialGain.connect(voiceGain);
        osc.start(ctx.currentTime);
        oscs.push(osc);
      }

      lfo.start(ctx.currentTime);

      // Fade in using setTargetAtTime
      voiceGain.gain.setTargetAtTime(targetGain, ctx.currentTime, ATTACK_TC);

      return { id, oscs, lfo, lfoGain, voiceGain, freq, targetGain, alive: true };
    }

    function upsertVoice(id: string, freq: number, targetGain: number): void {
      if (voices.size >= MAX_VOICES && !voices.has(id)) {
        // Evict the oldest voice to make room
        const oldest = voices.keys().next().value;
        if (oldest !== undefined) removeVoice(oldest);
      }

      if (voices.has(id)) {
        // Update frequency if changed
        const v = voices.get(id)!;
        v.targetGain = targetGain;
        if (Math.abs(v.freq - freq) > 0.5) {
          v.freq = freq;
          PARTIALS.forEach((p, i) => {
            v.oscs[i].frequency.setTargetAtTime(freq * p.mult, ctx.currentTime, 1.0);
          });
        }
        v.voiceGain.gain.setTargetAtTime(targetGain, ctx.currentTime, ATTACK_TC);
        return;
      }

      const voice = buildVoice(id, freq, targetGain);
      voices.set(id, voice);
    }

    function removeVoice(id: string): void {
      const v = voices.get(id);
      if (!v) return;
      v.alive = false;
      voices.delete(id);

      const now = ctx.currentTime;
      v.voiceGain.gain.setTargetAtTime(0.0001, now, RELEASE_TC);

      const cleanup = RELEASE_TC * 5 * 1000;
      setTimeout(() => {
        v.oscs.forEach((o) => { try { o.stop(); o.disconnect(); } catch { /* ok */ } });
        try { v.lfo.stop(); v.lfo.disconnect(); } catch { /* ok */ }
        try { v.lfoGain.disconnect(); } catch { /* ok */ }
        try { v.voiceGain.disconnect(); } catch { /* ok */ }
      }, cleanup);
    }

    function pruneVoices(keepIds: Set<string>): void {
      for (const id of Array.from(voices.keys())) {
        if (!keepIds.has(id)) removeVoice(id);
      }
    }

    function rescaleGains(perVoiceGain: number): void {
      for (const v of voices.values()) {
        v.targetGain = perVoiceGain;
        v.voiceGain.gain.setTargetAtTime(perVoiceGain, ctx.currentTime, ATTACK_TC);
      }
    }

    function setFilterCutoff(hz: number, timeSec: number): void {
      const clamped = Math.max(200, Math.min(6000, hz));
      lowpass.frequency.setTargetAtTime(clamped, ctx.currentTime, timeSec / 3);
    }

    function setMasterGain(value: number, timeSec: number): void {
      masterGain.gain.setTargetAtTime(value, ctx.currentTime, timeSec / 3);
    }

    function close(): void {
      pruneVoices(new Set());
      setTimeout(() => { try { ctx.close(); } catch { /* ok */ } }, RELEASE_TC * 5 * 1000);
    }

    return {
      ctx,
      masterGain,
      lowpass,
      compressor,
      voices,
      upsertVoice,
      removeVoice,
      pruneVoices,
      rescaleGains,
      setFilterCutoff,
      setMasterGain,
      close,
    };
  } catch {
    return null;
  }
}
