// audio.ts — the sound of the blooming ink garden.
//
// The GPU reaction-diffusion field is the instrument; this module is its
// voice. It builds:
//   • a kids-safe master chain: gain ≤0.26 → lowpass 6500Hz → compressor → out
//   • an always-on warm chord bed (a real I–vi–IV–V progression, not bare
//     pentatonic) whose gain/voicing swells with total ink coverage
//   • a gentle ambient pad under everything so it is never silent
//   • soft sine-bell "marimba" notes triggered by new spots forming
//
// Audio updates are driven from a ~10Hz readback loop in the page, fully
// decoupled from the 60fps GPU simulation.

import {
  BELL_SCALE_MIDI,
  CHORD_HOLD_SEC,
  CHORD_PROGRESSION,
  activityToCutoff,
  centroidToPan,
  coverageToBedGain,
  coverageToVoiceCount,
  midiToHz,
  type BellTrigger,
} from "./sim";

interface BedVoice {
  osc: OscillatorNode;
  sub: OscillatorNode; // detuned partner for warmth
  gain: GainNode;
}

export interface InkAudio {
  /** Touch feedback: a soft instant pluck so every tap sounds within ~50ms. */
  touchBlip(pan: number): void;
  /** Drive the slowly-evolving harmony from a field summary (call ~10Hz). */
  updateFromField(
    coverage: number,
    activity: number,
    centroidX: number,
    nowSec: number,
  ): void;
  /** Fire soft bell notes for new spots (call ~10Hz with picked triggers). */
  ringBells(triggers: BellTrigger[]): void;
  dispose(): void;
  readonly ctx: AudioContext;
}

const MAX_BED_VOICES = 4;

export function makeInkAudio(): InkAudio {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  // ── kids-safe master chain ──────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.26;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6500;
  tone.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 8;
  comp.ratio.value = 20;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;

  master.connect(tone);
  tone.connect(comp);
  comp.connect(ctx.destination);

  // ── moving filter on the bed (brightens as the pattern spreads) ─────────
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 800;
  bedFilter.Q.value = 0.6;
  const bedBus = ctx.createGain();
  bedBus.gain.value = 1;
  // the field's centroid pans the chord bed gently across the stereo field
  const bedPan = ctx.createStereoPanner();
  bedPan.pan.value = 0;
  bedBus.connect(bedFilter);
  bedFilter.connect(bedPan);
  bedPan.connect(master);

  // ── always-on ambient pad (very soft, slow) ─────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  padGain.connect(master);
  const padOscs: OscillatorNode[] = [];
  [55, 82.5, 110].forEach((hz, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    o.detune.value = i * 4 - 4;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.7 : 0.4;
    o.connect(g);
    g.connect(padGain);
    o.start();
    padOscs.push(o);
  });

  // ── warm chord bed voices (sine pairs, slow attack) ─────────────────────
  const bedVoices: BedVoice[] = [];
  for (let i = 0; i < MAX_BED_VOICES; i++) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = "triangle";
    sub.type = "sine";
    sub.detune.value = -6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(bedBus);
    osc.start();
    sub.start();
    bedVoices.push({ osc, sub, gain });
  }

  let chordIndex = -1;

  function setChord(index: number, voiceCount: number, perVoiceGain: number) {
    const chord = CHORD_PROGRESSION[index % CHORD_PROGRESSION.length];
    const now = ctx.currentTime;
    bedVoices.forEach((v, i) => {
      if (i < voiceCount && i < chord.length) {
        const hz = midiToHz(chord[i]);
        v.osc.frequency.setTargetAtTime(hz, now, 0.4);
        v.sub.frequency.setTargetAtTime(hz, now, 0.4);
        v.gain.gain.setTargetAtTime(perVoiceGain, now, 1.2);
      } else {
        v.gain.gain.setTargetAtTime(0, now, 1.2);
      }
    });
  }

  // ── bells: soft sine + light overtone, fast-ish attack, long soft tail ──
  function ringOne(midi: number, pan: number, velocity: number) {
    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    const peak = 0.08 * velocity;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02); // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4); // long bell tail
    const hz = midiToHz(midi);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = hz;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz * 2.0; // gentle octave shimmer
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(panner);
    panner.connect(master);
    o1.start(now);
    o2.start(now);
    o1.stop(now + 2.6);
    o2.stop(now + 2.6);
    const cleanup = () => {
      o1.disconnect();
      o2.disconnect();
      g.disconnect();
      g2.disconnect();
      panner.disconnect();
    };
    o1.onended = cleanup;
  }

  let lastTouch = 0;

  return {
    ctx,
    touchBlip(pan: number) {
      const now = ctx.currentTime;
      if (now - lastTouch < 0.04) return; // rate-limit dense drags
      lastTouch = now;
      // soft, instant blip in the scale so every touch is heard immediately
      const midi = BELL_SCALE_MIDI[2 + Math.floor(Math.random() * 4)];
      ringOne(midi, pan, 0.5);
    },
    updateFromField(coverage, activity, centroidX, nowSec) {
      const idx = Math.floor(nowSec / CHORD_HOLD_SEC) % CHORD_PROGRESSION.length;
      const voiceCount = coverageToVoiceCount(coverage, MAX_BED_VOICES);
      const bed = coverageToBedGain(coverage);
      const perVoice = (bed * 0.5) / Math.max(1, voiceCount);
      if (idx !== chordIndex) {
        chordIndex = idx;
        setChord(idx, voiceCount, perVoice);
      } else {
        // keep gains/voicing tracking coverage within the held chord
        const now = ctx.currentTime;
        const chord = CHORD_PROGRESSION[idx];
        bedVoices.forEach((v, i) => {
          const target = i < voiceCount && i < chord.length ? perVoice : 0;
          v.gain.gain.setTargetAtTime(target, now, 1.0);
        });
      }
      // spread rate → bed brightness
      bedFilter.frequency.setTargetAtTime(
        activityToCutoff(activity),
        ctx.currentTime,
        0.5,
      );
      // centroid of the living ink gently pans the harmony (soft, ±0.5)
      bedPan.pan.setTargetAtTime(
        centroidToPan(centroidX) * 0.5,
        ctx.currentTime,
        0.6,
      );
    },
    ringBells(triggers: BellTrigger[]) {
      // t.pan is already in -1..1 from the region index
      triggers.forEach((t) => ringOne(t.midi, t.pan, t.velocity));
    },
    dispose() {
      try {
        padOscs.forEach((o) => o.stop());
        bedVoices.forEach((v) => {
          v.osc.stop();
          v.sub.stop();
        });
      } catch {
        /* already stopped */
      }
      padOscs.forEach((o) => o.disconnect());
      bedVoices.forEach((v) => {
        v.osc.disconnect();
        v.sub.disconnect();
        v.gain.disconnect();
      });
      if (ctx.state !== "closed") void ctx.close();
    },
  };
}
