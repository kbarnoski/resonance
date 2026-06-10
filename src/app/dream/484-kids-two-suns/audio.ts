/**
 * audio.ts — Web Audio engine for "Two Suns" (484-kids-two-suns)
 *
 * POLYTONALITY toy. Two suns, two tonal worlds sounding AT ONCE:
 *
 *   Sun A — WARM world: C major     (C  E  G  C)  rooted on C3 / C4
 *   Sun B — COOL world: A major     (A  C# E  A)  rooted on A3 / A4
 *
 * C major + A major superimposed sit a major-third apart. They share NO
 * common triad but DO share pitches at the seams (E lives in both; C natural
 * vs C# rub against each other) — a gentle, kid-safe bitonal shimmer rather
 * than the harsher tritone clash of the Petrushka chord (C + F#). The shared
 * E keeps it from ever sounding "wrong"; the C / C# friction keeps it from
 * ever fully resolving. There is no correct answer — the ambiguity is the toy.
 *
 * Each sun continuously plays a slow soft arpeggio in its own key (sine +
 * triangle, long gentle attack — no harsh transients, no high ringing).
 * Each voice is panned by its sun's horizontal screen position and its gain
 * rises as the two suns approach (the overlap is the subject).
 */

export interface AudioEngine {
  /** Update a sun voice. pan in [-1,1], present in [0,1], blend in [0,1]. */
  setSun: (which: 0 | 1, pan: number, present: number, blend: number) => void;
  /** Most-recent audio energy [0,1], read by the renderer for visual pulse. */
  energy: () => number;
  teardown: () => void;
}

const C3 = 130.81;
const A3 = 220.0;

// Arpeggio voicings (ascending) for each world, in Hz.
// Sun A — C major: C3 E3 G3 C4 E4  (warm, low-leaning)
const WORLD_A = [C3, C3 * 1.25, C3 * 1.5, C3 * 2, C3 * 2.5];
// Sun B — A major: A3 C#4 E4 A4 C#5 (cool, brighter)
const WORLD_B = [A3, A3 * 1.25, A3 * 1.5, A3 * 2, A3 * 2.5];

export function bootAudio(): AudioEngine {
  const actx = new AudioContext();
  if (actx.state === "suspended") void actx.resume();
  return createAudioEngine(actx);
}

function createAudioEngine(actx: AudioContext): AudioEngine {
  // ── Master chain (soft limiter so two worlds together never spike) ─────────
  const master = actx.createGain();
  master.gain.value = 0.55;

  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.02;
  limiter.release.value = 0.25;

  // Gentle low-pass to keep everything soft and round (no high ringing).
  const warmth = actx.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = 2400;
  warmth.Q.value = 0.4;

  master.connect(warmth);
  warmth.connect(limiter);
  limiter.connect(actx.destination);

  // Energy analyser drives the visual pulse.
  const analyser = actx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.85;
  warmth.connect(analyser);
  const energyBuf = new Uint8Array(analyser.frequencyBinCount);

  // ── One sun voice ──────────────────────────────────────────────────────────
  // A voice owns: a stereo panner, a presence gain, and an arpeggiator that
  // keeps scheduling soft notes from its world. We schedule one note at a time
  // with a long overlapping envelope so it reads as a continuous pad-arpeggio.
  interface Voice {
    panner: StereoPannerNode;
    gain: GainNode;
    notes: number[];
    step: number;
    nextTime: number;
    present: number; // 0..1 how present this sun is (drives gain)
    blend: number; // 0..1 how overlapped the two suns are (drives density)
  }

  function makeVoice(notes: number[]): Voice {
    const panner = actx.createStereoPanner();
    const gain = actx.createGain();
    gain.gain.value = 0.0;
    gain.connect(panner);
    panner.connect(master);
    return {
      panner,
      gain,
      notes,
      step: 0,
      nextTime: actx.currentTime + 0.1,
      present: 0.6,
      blend: 0,
    };
  }

  const voices: Voice[] = [makeVoice(WORLD_A), makeVoice(WORLD_B)];

  // Play one soft note: sine fundamental + quiet triangle octave, long bell-pad
  // envelope. No transient — attack is slow so a sleeping toddler stays asleep.
  function playNote(v: Voice, freq: number, when: number, dur: number) {
    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const shimmer = actx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = freq * 2;

    const shimGain = actx.createGain();
    shimGain.gain.value = 0.18;
    shimmer.connect(shimGain);

    const env = actx.createGain();
    // Peak gain scales with how "present" the sun is.
    const peak = 0.16 * (0.35 + 0.65 * v.present);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + dur * 0.4); // slow attack
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(env);
    shimGain.connect(env);
    env.connect(v.gain);

    osc.start(when);
    shimmer.start(when);
    osc.stop(when + dur + 0.05);
    shimmer.stop(when + dur + 0.05);
  }

  // ── Scheduler ──────────────────────────────────────────────────────────────
  // Look ahead a little and queue notes. As blend (overlap) rises, the arpeggio
  // gets denser (shorter interval) so the two keys ring together more thickly —
  // the genuinely ambiguous bitonal cluster at the eclipse.
  let raf = 0;
  function tick() {
    const now = actx.currentTime;
    for (const v of voices) {
      // Smoothly follow target gain from presence.
      const target = 0.85 * (0.25 + 0.75 * v.present);
      v.gain.gain.setTargetAtTime(target, now, 0.15);

      // Note interval shrinks with blend: 1.6s apart → 0.55s when eclipsed.
      const interval = 1.6 - v.blend * 1.05;
      const dur = interval * 2.4; // long overlap → continuous pad
      while (v.nextTime < now + 0.6) {
        const freq = v.notes[v.step % v.notes.length];
        playNote(v, freq, v.nextTime, dur);
        v.step++;
        v.nextTime += interval;
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function setSun(which: 0 | 1, pan: number, present: number, blend: number) {
    const v = voices[which];
    v.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), actx.currentTime, 0.1);
    v.present = Math.max(0, Math.min(1, present));
    v.blend = Math.max(0, Math.min(1, blend));
  }

  function energy(): number {
    analyser.getByteFrequencyData(energyBuf);
    let sum = 0;
    // Focus on low-mid bins where the pads live.
    const n = Math.min(40, energyBuf.length);
    for (let i = 0; i < n; i++) sum += energyBuf[i];
    return sum / (n * 255);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    try {
      master.disconnect();
    } catch {
      /* noop */
    }
    void actx.close();
  }

  return { setSun, energy, teardown } satisfies AudioEngine;
}
