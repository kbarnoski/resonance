// ─────────────────────────────────────────────────────────────────────────────
// composer.ts — the deterministic text → note-event mapper.
//
// This is the heart of the prototype. It is a PURE function: the same text +
// the same settings always produce an identical event list. There is no
// Math.random() anywhere in this file. Every note carries a `reason` describing
// the letter / syllable / punctuation that caused it, so the engine is
// transparent and readable by a composer.
//
// Lineage (see README): the Guidonian / solmization tradition of mapping text
// to pitch by rule, and John Cage's _Empty Words_ (1974), which dissolved
// Thoreau's Journal into letters, syllables and silences as sound-events.
// ─────────────────────────────────────────────────────────────────────────────

// ── Modes ────────────────────────────────────────────────────────────────────
// Each mode is a set of semitone offsets from the tonic across one octave.
// We use REAL diatonic modes so the melody is always consonant against the bed.
export type ModeName = "dorian" | "aeolian" | "ionian" | "lydian";

export const MODES: Record<ModeName, { label: string; steps: number[]; tonicMidi: number }> = {
  // D Dorian — the tasteful default: minor-ish but with a bright raised 6th.
  dorian: { label: "D Dorian", steps: [0, 2, 3, 5, 7, 9, 10], tonicMidi: 62 },
  // A Aeolian — natural minor, plaintive.
  aeolian: { label: "A Aeolian", steps: [0, 2, 3, 5, 7, 8, 10], tonicMidi: 57 },
  // C Ionian — plain major, hopeful.
  ionian: { label: "C Ionian", steps: [0, 2, 4, 5, 7, 9, 11], tonicMidi: 60 },
  // F Lydian — major with a luminous raised 4th.
  lydian: { label: "F Lydian", steps: [0, 2, 4, 6, 7, 9, 11], tonicMidi: 65 },
};

// ── Vowel → scale degree map ─────────────────────────────────────────────────
// The six vowels (including y) map across the seven scale degrees so the melody
// climbs and falls musically rather than randomly. Ordered roughly by vowel
// "height"/openness to give a singable contour:
//   i (close)  → degree 0  (tonic)
//   e          → degree 1
//   a (open)   → degree 2  (modal 3rd — the colour tone)
//   o          → degree 4  (the 5th — strong, restful)
//   u          → degree 5  (the 6th — the mode's character note)
//   y          → degree 6  (the 7th — leading / unresolved)
const VOWEL_DEGREE: Record<string, number> = {
  i: 0,
  e: 1,
  a: 2,
  o: 4,
  u: 5,
  y: 6,
};

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

// ── Token model ──────────────────────────────────────────────────────────────
export type Token = {
  raw: string; // the original substring
  kind: "word" | "punct" | "newline" | "space";
  // word-only fields:
  syllables?: Syllable[];
  capitalized?: boolean; // first char is uppercase
  allCaps?: boolean; // whole word uppercase (>=2 letters) → forte
};

export type Syllable = {
  text: string; // the syllable substring
  vowel: string | null; // the chosen vowel (lowercased) or null if none
  consonantsBefore: number; // size of the leading consonant cluster
  longVowel: boolean; // doubled vowel or vowel+silent-e heuristic → long
};

// ── Note event ───────────────────────────────────────────────────────────────
export type NoteEvent = {
  // timing (in beats, resolved to seconds by the scheduler)
  startBeat: number;
  durBeat: number;
  // pitch
  midi: number; // 0 = a rest event (no pitch)
  isRest: boolean;
  // expression
  velocity: number; // 0..1
  articulation: "legato" | "normal" | "staccato";
  // provenance — the "why" readout
  tokenIndex: number; // index into the token stream this came from
  degree: number; // scale degree chosen (-1 for rests)
  reason: string; // human-readable cause
  glyph: string; // the letter/syllable shown in the readout & manuscript
};

export type Composition = {
  tokens: Token[];
  events: NoteEvent[];
  totalBeats: number;
  mode: ModeName;
};

// ── Tokenizer ────────────────────────────────────────────────────────────────
// Splits raw text into words, punctuation, newlines and spaces while preserving
// order so the manuscript can render the original text faithfully.
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Match: newline | run of letters/apostrophes (a word) | whitespace | single punct
  const re = /(\n)|([A-Za-z][A-Za-z']*)|([ \t]+)|([^\sA-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      tokens.push({ raw: m[1], kind: "newline" });
    } else if (m[2]) {
      const word = m[2];
      const lower = word.toLowerCase();
      const letters = word.replace(/[^A-Za-z]/g, "");
      tokens.push({
        raw: word,
        kind: "word",
        syllables: splitSyllables(lower),
        capitalized: /^[A-Z]/.test(word),
        allCaps: letters.length >= 2 && word === word.toUpperCase(),
      });
    } else if (m[3]) {
      tokens.push({ raw: m[3], kind: "space" });
    } else if (m[4]) {
      tokens.push({ raw: m[4], kind: "punct" });
    }
  }
  return tokens;
}

// ── Syllable-ish splitter ────────────────────────────────────────────────────
// A lightweight heuristic: a syllable is a (consonant cluster + vowel cluster).
// Not linguistically perfect, but deterministic and good enough to give each
// vowel nucleus its own note. Returns at least one syllable for any word.
function splitSyllables(word: string): Syllable[] {
  const syllables: Syllable[] = [];
  let i = 0;
  const n = word.length;
  while (i < n) {
    // gather leading consonant cluster
    let cBefore = 0;
    while (i < n && !VOWELS.has(word[i])) {
      cBefore++;
      i++;
    }
    if (i >= n) {
      // trailing consonants with no vowel: attach to previous syllable, or make
      // a vowel-less syllable so the word still produces a (muted) event.
      if (syllables.length > 0) {
        syllables[syllables.length - 1].text += word.slice(i - cBefore);
      } else {
        syllables.push({ text: word, vowel: null, consonantsBefore: cBefore, longVowel: false });
      }
      break;
    }
    // gather vowel cluster
    const vStart = i;
    while (i < n && VOWELS.has(word[i])) i++;
    const vowelCluster = word.slice(vStart, i);
    const chosenVowel = vowelCluster[0]; // nucleus = first vowel
    const longVowel =
      vowelCluster.length >= 2 || // doubled / diphthong → long
      (i >= n && /[aeiou]/.test(chosenVowel)); // word-final vowel tends long
    const start = vStart - cBefore;
    syllables.push({
      text: word.slice(start, i),
      vowel: chosenVowel,
      consonantsBefore: cBefore,
      longVowel,
    });
  }
  return syllables.length ? syllables : [{ text: word, vowel: null, consonantsBefore: 0, longVowel: false }];
}

// ── The composer ─────────────────────────────────────────────────────────────
// Walks the token stream and emits timed note events deterministically.
export function compose(text: string, modeName: ModeName): Composition {
  const tokens = tokenize(text);
  const mode = MODES[modeName];
  const events: NoteEvent[] = [];

  let beat = 0; // running cursor in beats
  let octave = 0; // register shift in octaves, nudged by newlines
  // Stress alternation within a word: first syllable is the strong beat.

  const degreeToMidi = (degree: number, oct: number): number => {
    // wrap degree into [0,7) and carry octaves
    let d = degree;
    let o = oct;
    while (d < 0) {
      d += 7;
      o -= 1;
    }
    while (d >= 7) {
      d -= 7;
      o += 1;
    }
    return mode.tonicMidi + mode.steps[d] + 12 * o;
  };

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];

    if (tok.kind === "space") continue;

    if (tok.kind === "newline") {
      // New line = a breath then a gentle register lift for the next phrase.
      events.push({
        startBeat: beat,
        durBeat: 0.5,
        midi: 0,
        isRest: true,
        velocity: 0,
        articulation: "normal",
        tokenIndex: ti,
        degree: -1,
        reason: "newline → phrase break (breath)",
        glyph: "¶",
      });
      beat += 0.5;
      octave = octave === 0 ? 1 : 0; // alternate register between lines
      continue;
    }

    if (tok.kind === "punct") {
      const ch = tok.raw;
      if (ch === "," || ch === ";" || ch === ":") {
        events.push(rest(beat, 0.5, ti, `"${ch}" → short breath`, ch));
        beat += 0.5;
      } else if (ch === "." || ch === "…") {
        // Cadence: resolve toward the tonic, then a fuller rest.
        events.push({
          startBeat: beat,
          durBeat: 1,
          midi: degreeToMidi(0, octave),
          isRest: false,
          velocity: 0.5,
          articulation: "legato",
          tokenIndex: ti,
          degree: 0,
          reason: `"${ch}" → cadence, resolve to tonic`,
          glyph: ch,
        });
        beat += 1;
        events.push(rest(beat, 0.5, ti, `"${ch}" → phrase rest`, ch));
        beat += 0.5;
      } else if (ch === "!" || ch === "?") {
        // Tension: leap up to the 7th (raised tension), longer.
        events.push({
          startBeat: beat,
          durBeat: 1,
          midi: degreeToMidi(6, octave + 1),
          isRest: false,
          velocity: 0.85,
          articulation: "normal",
          tokenIndex: ti,
          degree: 6,
          reason: `"${ch}" → leap up, raised tension`,
          glyph: ch,
        });
        beat += 1;
      }
      // other punctuation (quotes, dashes, parens) is silent but kept in tokens
      continue;
    }

    // ── word ──────────────────────────────────────────────────────────────
    const syls = tok.syllables ?? [];
    const clusterArticulation = (cBefore: number): NoteEvent["articulation"] =>
      cBefore >= 2 ? "staccato" : cBefore === 0 ? "legato" : "normal";

    for (let si = 0; si < syls.length; si++) {
      const syl = syls[si];
      const isWordInitial = si === 0;
      const vowel = syl.vowel;

      if (!vowel || !(vowel in VOWEL_DEGREE)) {
        // consonant-only syllable: a very short, soft percussive passing tone on
        // the tonic so the rhythm still articulates the consonants.
        const dur = 0.25;
        events.push({
          startBeat: beat,
          durBeat: dur,
          midi: degreeToMidi(0, octave),
          isRest: false,
          velocity: 0.3,
          articulation: "staccato",
          tokenIndex: ti,
          degree: 0,
          reason: `"${syl.text}" → consonant cluster (percussive)`,
          glyph: syl.text,
        });
        beat += dur;
        continue;
      }

      const degree = VOWEL_DEGREE[vowel];

      // Stress heuristic → duration & whether it lands on a downbeat.
      //   word-initial OR long vowel OR capitalized word → stressed (long)
      const stressed = isWordInitial || syl.longVowel || (tok.capitalized && isWordInitial);
      let dur = stressed ? 1 : 0.5;
      if (syl.longVowel) dur += 0.25; // long vowels sustain a touch more

      // Dynamics: capitalization → louder; ALL CAPS → forte.
      let velocity = 0.55;
      if (stressed) velocity += 0.12;
      if (tok.capitalized) velocity += 0.1;
      if (tok.allCaps) velocity = 0.95;
      velocity = Math.min(1, velocity);

      events.push({
        startBeat: beat,
        durBeat: dur,
        midi: degreeToMidi(degree, octave),
        isRest: false,
        velocity,
        articulation: clusterArticulation(syl.consonantsBefore),
        tokenIndex: ti,
        degree,
        reason:
          `"${vowel}" → degree ${degree + 1}` +
          (stressed ? ", stressed (long)" : ", unstressed (passing)") +
          (tok.allCaps ? ", ALL CAPS (forte)" : tok.capitalized ? ", capital (louder)" : ""),
        glyph: syl.text,
      });
      beat += dur;
    }
  }

  // Ensure there is always at least a little music so the page "sings" even on
  // edge inputs (empty string, all punctuation that produced only rests).
  const hasPitch = events.some((e) => !e.isRest);
  if (!hasPitch) {
    events.push({
      startBeat: beat,
      durBeat: 1,
      midi: MODES[modeName].tonicMidi,
      isRest: false,
      velocity: 0.5,
      articulation: "legato",
      tokenIndex: -1,
      degree: 0,
      reason: "no pitched text → a single tonic drone",
      glyph: "·",
    });
    beat += 1;
  }

  return { tokens, events, totalBeats: Math.max(beat, 1), mode: modeName };
}

function rest(startBeat: number, durBeat: number, tokenIndex: number, reason: string, glyph: string): NoteEvent {
  return {
    startBeat,
    durBeat,
    midi: 0,
    isRest: true,
    velocity: 0,
    articulation: "normal",
    tokenIndex,
    degree: -1,
    reason,
    glyph,
  };
}

// Convert a midi note number to a frequency in Hz (A4 = 440, midi 69).
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
