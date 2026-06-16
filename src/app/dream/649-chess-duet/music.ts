// music.ts — PGN -> counterpoint mapping + a two-voice Web Audio scheduler.
//
// THE MAPPING (musical, not arbitrary beeps):
//   - Two voices: White = warm rounded triangle ("left hand"); Black = a
//     darker FM/reedy voice ("right hand"). They alternate move by move,
//     reading as call-and-response counterpoint.
//   - Pitch: file (a..h) -> scale degree within a mode; rank (1..8) ->
//     octave/register. Everything snapped to the mode -> consonant by
//     default, tension comes from events + register, not random dissonance.
//   - Piece -> articulation: pawn = short, queen = long & rich, knight =
//     grace-note leap, bishop = gliding, rook = firm, king = soft/settled.
//   - Events shape drama: capture = dissonant clash + stronger note;
//     check = held tension pedal tone; castling = settled cadence;
//     checkmate = resolving cadence + held final chord.
//   - Material balance biases harmony brighter/darker across the game.

import { Ply, PieceType, PIECE_VALUE } from "./game";

// Mode: D harmonic-minor flavor (dramatic). Degrees in semitones from root.
// We use a 7-note collection mapped from the 8 files (file h wraps to the
// octave). Root chosen at D for a cinematic minor color.
const ROOT_MIDI = 50; // D3
// Harmonic minor scale degrees (semitone offsets) over an octave.
const SCALE = [0, 2, 3, 5, 7, 8, 11]; // D E F G A Bb C#

// file (0..7) -> scale degree (file h wraps to octave above degree 0)
function fileToSemitone(file: number): number {
  if (file < 7) return SCALE[file];
  return 12; // h -> octave
}

// rank (0..7, rank1..rank8) -> octave offset in semitones.
// Lower ranks = lower register; we span ~2 octaves.
function rankToOctave(rank: number): number {
  // ranks 0..7 -> octave offsets -12, -12, 0, 0, 0, 0, +12, +12 (compressed
  // toward the middle so most of the game sits in a singable register).
  if (rank <= 1) return -12;
  if (rank >= 6) return 12;
  return 0;
}

export interface NoteSpec {
  ply: Ply;
  midiTo: number; // resolved pitch of the destination square
  midiFrom: number; // pitch of source square (for grace-note leap)
  durBeats: number; // length in beats
  color: "w" | "b";
  // drama
  capture: boolean;
  check: boolean;
  castle: boolean;
  mate: boolean;
  grace: boolean; // knight -> grace note
  brightness: number; // -1..+1 material balance at this ply (white-positive)
}

function squareToMidi(file: number, rank: number): number {
  return ROOT_MIDI + fileToSemitone(file) + rankToOctave(rank);
}

const DUR_BY_PIECE: Record<PieceType, number> = {
  P: 0.55, // pawn — short
  N: 0.7, // knight — leap, medium
  B: 0.9, // bishop — gliding
  R: 1.0, // rook — firm
  Q: 1.5, // queen — long, rich
  K: 1.1, // king — settled
};

// Build the full note list with a running material-balance signal.
export function buildScore(plies: Ply[]): NoteSpec[] {
  let whiteMaterial = 0;
  let blackMaterial = 0;

  return plies.map((ply) => {
    // A capture removes the captured piece; we approximate captured value
    // by the destination occupant's typical value. Since we don't track the
    // full board occupancy here, we approximate by giving the *capturing*
    // side a small material credit. (Good enough for a felt arc.)
    if (ply.capture) {
      // crude: captures by white help white, etc. Weighted by piece.
      const v = PIECE_VALUE[ply.piece] >= 5 ? 2 : 1;
      if (ply.color === "w") whiteMaterial += v;
      else blackMaterial += v;
    }
    const balance = Math.max(-1, Math.min(1, (whiteMaterial - blackMaterial) / 8));

    return {
      ply,
      midiTo: squareToMidi(ply.toFile, ply.toRank),
      midiFrom: squareToMidi(ply.fromFile, ply.fromRank),
      durBeats: DUR_BY_PIECE[ply.piece],
      color: ply.color,
      capture: ply.capture,
      check: ply.check,
      castle: ply.castle !== null,
      mate: ply.mate,
      grace: ply.piece === "N",
      brightness: balance,
    };
  });
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Audio engine — persistent master chain, per-note voice synthesis.
// ---------------------------------------------------------------------------

export interface ChessAudio {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  pedal: { osc: OscillatorNode; gain: GainNode } | null;
  playNote(note: NoteSpec, when: number, tempoBeatSec: number): void;
  setPedal(freq: number | null, when: number): void;
  dispose(): void;
}

export function createAudio(): ChessAudio {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.42; // capped, ear-safe

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.18;

  master.connect(comp);
  comp.connect(ctx.destination);

  // A simple reverb-ish space via a feedback delay (no impulse needed).
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.21;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  let pedal: { osc: OscillatorNode; gain: GainNode } | null = null;

  function makeVoice(note: NoteSpec, when: number, dur: number) {
    const freq = midiToFreq(note.midiTo);
    const out = ctx.createGain();
    out.connect(master);
    out.connect(delay);

    // Brightness bias: white-ahead -> a touch brighter; black-ahead -> darker.
    const bright = note.brightness;

    if (note.color === "w") {
      // White — warm rounded triangle + a soft sine sub.
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.setValueAtTime(freq, when);
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.setValueAtTime(freq / 2, when);
      const sub = ctx.createGain();
      sub.gain.value = 0.3;
      // gentle lowpass for warmth; opens a bit when white is ahead.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1400 + bright * 900 + 600, when);
      o1.connect(lp);
      o2.connect(sub);
      sub.connect(lp);
      lp.connect(out);

      // knight grace-note leap: start at source pitch, slide to dest.
      if (note.grace) {
        const gf = midiToFreq(note.midiFrom);
        o1.frequency.setValueAtTime(gf, when);
        o1.frequency.exponentialRampToValueAtTime(freq, when + 0.09);
      }
      o1.start(when);
      o2.start(when);
      o1.stop(when + dur + 0.1);
      o2.stop(when + dur + 0.1);
    } else {
      // Black — darker FM/reedy voice (carrier modulated by a ratio osc).
      const carrier = ctx.createOscillator();
      carrier.type = "sawtooth";
      carrier.frequency.setValueAtTime(freq, when);
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(freq * 2.01, when);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(freq * (0.6 + Math.max(0, -bright) * 0.5), when);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1100 - Math.max(0, bright) * 300, when);
      lp.Q.value = 4;
      carrier.connect(lp);
      lp.connect(out);

      if (note.grace) {
        const gf = midiToFreq(note.midiFrom);
        carrier.frequency.setValueAtTime(gf, when);
        carrier.frequency.exponentialRampToValueAtTime(freq, when + 0.09);
      }
      carrier.start(when);
      mod.start(when);
      carrier.stop(when + dur + 0.1);
      mod.stop(when + dur + 0.1);
    }

    // Amplitude envelope. Captures hit harder; mate sustains.
    const peak = note.capture ? 0.9 : note.mate ? 0.85 : 0.6;
    const attack = note.color === "w" ? 0.018 : 0.01;
    out.gain.setValueAtTime(0.0001, when);

    // Capture = brief silence then a stronger note (we shift the attack a
    // hair later and pre-pad with a short gap handled by the scheduler).
    out.gain.exponentialRampToValueAtTime(peak, when + attack);
    const releaseStart = when + dur * 0.55;
    out.gain.setValueAtTime(peak, releaseStart);
    out.gain.exponentialRampToValueAtTime(0.0008, when + dur + (note.mate ? 1.6 : 0.25));

    // Capture clash: add a quick dissonant grace a semitone away that
    // resolves — the "clash" you hear on a capture.
    if (note.capture) {
      const clash = ctx.createOscillator();
      clash.type = "square";
      clash.frequency.setValueAtTime(midiToFreq(note.midiTo + 1), when);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, when);
      cg.gain.exponentialRampToValueAtTime(0.18, when + 0.008);
      cg.gain.exponentialRampToValueAtTime(0.0006, when + 0.12);
      const cl = ctx.createBiquadFilter();
      cl.type = "lowpass";
      cl.frequency.value = 2200;
      clash.connect(cl);
      cl.connect(cg);
      cg.connect(master);
      clash.start(when);
      clash.stop(when + 0.16);
    }

    // Castling settled cadence: add a soft perfect-fifth below.
    if (note.castle) {
      const fifth = ctx.createOscillator();
      fifth.type = "sine";
      fifth.frequency.setValueAtTime(midiToFreq(note.midiTo - 7), when);
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.0001, when);
      fg.gain.exponentialRampToValueAtTime(0.22, when + 0.05);
      fg.gain.exponentialRampToValueAtTime(0.0006, when + dur + 0.4);
      fifth.connect(fg);
      fg.connect(master);
      fifth.start(when);
      fifth.stop(when + dur + 0.5);
    }

    // Checkmate: a resolving (darkly resolving) chord — root + minor third
    // + fifth held under the final note.
    if (note.mate) {
      const chordMidis = [ROOT_MIDI - 12, ROOT_MIDI - 9, ROOT_MIDI - 5];
      for (const cm of chordMidis) {
        const co = ctx.createOscillator();
        co.type = "triangle";
        co.frequency.setValueAtTime(midiToFreq(cm), when + 0.1);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, when + 0.1);
        cg.gain.exponentialRampToValueAtTime(0.16, when + 0.5);
        cg.gain.setValueAtTime(0.16, when + 2.5);
        cg.gain.exponentialRampToValueAtTime(0.0006, when + 4.5);
        co.connect(cg);
        cg.connect(master);
        cg.connect(delay);
        co.start(when + 0.1);
        co.stop(when + 4.7);
      }
    }
  }

  function setPedal(freq: number | null, when: number) {
    if (freq === null) {
      if (pedal) {
        pedal.gain.gain.cancelScheduledValues(when);
        pedal.gain.gain.setTargetAtTime(0.0001, when, 0.3);
        const old = pedal;
        setTimeout(() => {
          try {
            old.osc.stop();
          } catch {
            /* already stopped */
          }
        }, 1200);
        pedal = null;
      }
      return;
    }
    if (!pedal) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(master);
      osc.start(when);
      pedal = { osc, gain };
    }
    pedal.osc.frequency.setValueAtTime(freq, when);
    pedal.gain.gain.setTargetAtTime(0.12, when, 0.2);
  }

  return {
    ctx,
    master,
    comp,
    pedal,
    playNote(note, when, tempoBeatSec) {
      const dur = note.durBeats * tempoBeatSec;
      makeVoice(note, when, dur);
    },
    setPedal,
    dispose() {
      try {
        if (pedal) pedal.osc.stop();
      } catch {
        /* ignore */
      }
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
      if (ctx.state !== "closed") void ctx.close();
    },
  };
}

// Helper to expose the pedal frequency for a check (a low tension tone
// derived from the checking side's destination square).
export function checkPedalFreq(note: NoteSpec): number {
  return midiToFreq(ROOT_MIDI - 12 + (note.color === "w" ? 0 : 1));
}

export { midiToFreq, ROOT_MIDI };
