// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — warm, vowel-ish formant voices for 3096-continuator.
//
//   Each voice is a Fant-style source→filter singer:
//     • SOURCE — a glottal-ish PeriodicWave (1/n harmonic falloff) oscillating at
//       the note's f0. A single sustained oscillator per voice whose frequency is
//       GLIDED between notes with setTargetAtTime → continuous portamento, so the
//       partner sounds like it is singing, not beeping.
//     • FILTER — three parallel BiquadFilter band-passes tuned to a vowel's
//       F1/F2/F3, giving a warm "oo/ah"-ish colour.
//     • Per-note amplitude envelope (soft attack, gentle release) re-articulates
//       each note over the continuous pitch line.
//
//   Two timbres: the PARTNER (its own voice) and a slightly brighter HUMAN voice
//   used only to sound the baked demo contour, so the call and the response are
//   audibly two different singers.
// ─────────────────────────────────────────────────────────────────────────────

import type { NoteEvent } from './model';

export type VoiceColor = 'partner' | 'human';

export interface Voice {
  ctx: AudioContext;
  osc: OscillatorNode;
  ampGain: GainNode; // per-note envelope
  out: GainNode; // voice level into master
  formants: BiquadFilterNode[];
  color: VoiceColor;
}

export interface SynthBus {
  ctx: AudioContext;
  master: GainNode;
  partner: Voice;
  human: Voice;
  dispose: () => void;
}

function makeGlottalWave(ctx: AudioContext): PeriodicWave {
  const n = 22;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    imag[k] = (1 / k) * Math.exp(-k / 13);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// vowel formant centres (Hz): partner ≈ warm "oh", human ≈ brighter "ah"
const VOWELS: Record<VoiceColor, [number, number, number]> = {
  partner: [520, 920, 2600],
  human: [700, 1220, 2750],
};

function makeVoice(ctx: AudioContext, master: GainNode, color: VoiceColor): Voice {
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.setPeriodicWave(makeGlottalWave(ctx));
  osc.frequency.setValueAtTime(220, now);

  const ampGain = ctx.createGain();
  ampGain.gain.setValueAtTime(0, now);
  osc.connect(ampGain);

  const sumGain = ctx.createGain();
  sumGain.gain.setValueAtTime(1, now);

  const centres = VOWELS[color];
  const formants: BiquadFilterNode[] = [];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centres[i], now);
    bp.Q.setValueAtTime(i === 0 ? 5 : 7, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(i === 0 ? 0.9 : i === 1 ? 0.6 : 0.35, now);
    ampGain.connect(bp);
    bp.connect(g);
    g.connect(sumGain);
    formants.push(bp);
  }
  // a little direct bleed keeps the fundamental warm
  const bleed = ctx.createGain();
  bleed.gain.setValueAtTime(0.14, now);
  ampGain.connect(bleed);
  bleed.connect(sumGain);

  const out = ctx.createGain();
  out.gain.setValueAtTime(color === 'partner' ? 0.9 : 0.8, now);
  sumGain.connect(out);
  out.connect(master);

  osc.start();

  return { ctx, osc, ampGain, out, formants, color };
}

export function buildSynth(ctx: AudioContext): SynthBus {
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.6, now);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-16, now);
  comp.knee.setValueAtTime(18, now);
  comp.ratio.setValueAtTime(4, now);
  comp.attack.setValueAtTime(0.005, now);
  comp.release.setValueAtTime(0.16, now);

  // gentle shared reverb tail so the two voices sit in one room
  const revSend = ctx.createGain();
  revSend.gain.setValueAtTime(0.18, now);
  const delay = ctx.createDelay(1.5);
  delay.delayTime.setValueAtTime(0.05, now);
  const fb = ctx.createGain();
  fb.gain.setValueAtTime(0.32, now);
  const revLP = ctx.createBiquadFilter();
  revLP.type = 'lowpass';
  revLP.frequency.setValueAtTime(2600, now);

  master.connect(comp);
  master.connect(revSend);
  revSend.connect(delay);
  delay.connect(revLP);
  revLP.connect(fb);
  fb.connect(delay);
  revLP.connect(comp);
  comp.connect(ctx.destination);

  const partner = makeVoice(ctx, master, 'partner');
  const human = makeVoice(ctx, master, 'human');

  const dispose = () => {
    for (const v of [partner, human]) {
      try {
        v.osc.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.out.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      master.disconnect();
      comp.disconnect();
      revSend.disconnect();
      delay.disconnect();
      revLP.disconnect();
      fb.disconnect();
    } catch {
      /* noop */
    }
  };

  return { ctx, master, partner, human, dispose };
}

/**
 * Sing a phrase on one voice starting at AudioContext time `startTime`.
 * Frequencies glide (portamento) between notes; each note gets a soft
 * attack/release envelope. Returns the total phrase duration in seconds.
 */
export function singPhrase(voice: Voice, notes: NoteEvent[], startTime: number): number {
  const { osc, ampGain } = voice;
  let t = startTime;
  const peak = 0.5;

  // start silent, at the first note's pitch (no glide into the first note)
  if (notes.length > 0) {
    osc.frequency.cancelScheduledValues(startTime);
    osc.frequency.setValueAtTime(notes[0].hz, startTime);
    ampGain.gain.cancelScheduledValues(startTime);
    ampGain.gain.setValueAtTime(0, startTime);
  }

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const dur = n.dur;
    // glide to this note's pitch over the first ~35% of the note
    if (i > 0) {
      osc.frequency.setTargetAtTime(n.hz, t, Math.max(0.02, dur * 0.28));
    }
    // per-note amplitude envelope (legato-ish: don't fully close between notes)
    ampGain.gain.setTargetAtTime(peak, t, 0.02);
    ampGain.gain.setTargetAtTime(peak * 0.7, t + dur * 0.4, 0.08);
    const isLast = i === notes.length - 1;
    if (isLast) {
      ampGain.gain.setTargetAtTime(0, t + dur * 0.75, 0.12);
    } else {
      // brief dip to re-articulate the next note without silence
      ampGain.gain.setTargetAtTime(peak * 0.45, t + dur * 0.85, 0.05);
    }
    t += dur;
  }

  return t - startTime;
}

/** Immediately hush a voice (used on stop / teardown mid-phrase). */
export function hush(voice: Voice): void {
  const t = voice.ctx.currentTime;
  voice.ampGain.gain.cancelScheduledValues(t);
  voice.ampGain.gain.setTargetAtTime(0, t, 0.03);
  voice.osc.frequency.cancelScheduledValues(t);
}
