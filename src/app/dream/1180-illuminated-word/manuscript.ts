// Cross-modal TEXT -> MUSIC + TYPOGRAPHIC LAYOUT for "Illuminated Word".
//
// One score object drives BOTH the sound (audio.ts) and the page layout
// (page.tsx), so the gilding of each letter is locked in time with the note
// that sings it. Everything here is pure/deterministic — no Web Audio, no DOM.

export interface Glyph {
  i: number; // sequential index (glyphs are in start-time order)
  ch: string;
  kind: "letter" | "space" | "punct" | "newline";
  isVowel: boolean;
  isUpper: boolean;
  freq: number; // Hz for the sung note, 0 when silent (space / most punct)
  start: number; // seconds from playback start
  dur: number; // sustain of the note in seconds
  cadence: boolean; // sentence-ending punctuation -> resolving tonic chord
  // layout (filled in by the layout pass)
  x: number;
  y: number;
  line: number;
  size: number;
  isDropCap: boolean;
}

export interface Score {
  glyphs: Glyph[];
  totalDuration: number;
  viewW: number;
  viewH: number;
  numLines: number;
}

export const DEFAULT_TEXT = "Sing, o vellum, the light of the word.";

// ----- musical model ---------------------------------------------------------

// D Dorian — a calm, chant-like church mode. Every note drawn from it over a
// D drone stays consonant, which is what keeps arbitrary text from sounding
// like random beeps.
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const ROOT_MIDI = 50; // D3
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

// tempo / articulation (seconds)
const STEP_LETTER = 0.24; // time advance per letter
const STEP_SPACE = 0.16; // a small breath
const STEP_SOFT_PUNCT = 0.34; // comma / colon / dash -> short rest
const STEP_CADENCE = 0.85; // period / ! / ? -> full cadential rest
const STEP_NEWLINE = 0.34;
const DUR_VOWEL = 0.62; // legato, rings over the following letters
const DUR_CONSONANT = 0.18; // short, plucked
const TAIL = 2.4; // reverb tail after the final glyph

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function scaleIndexToMidi(idx: number): number {
  const clamped = clamp(idx, 0, 20);
  const oct = Math.floor(clamped / 7);
  const deg = clamped % 7;
  return ROOT_MIDI + DORIAN[deg] + 12 * oct;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const SENTENCE_END = new Set([".", "!", "?"]);
const SOFT_PUNCT = new Set([",", ";", ":", "—", "-"]);

// ----- score construction ----------------------------------------------------

export function buildScore(rawText: string): Score {
  const text = (rawText || DEFAULT_TEXT).replace(/\r\n/g, "\n").slice(0, 220);

  // Pass 1: for each letter, work out its position inside the current phrase
  // (a phrase = run of letters up to the next . ! ?). This lets each phrase
  // trace a gentle harmonic arc: tension rising toward the middle, resolving
  // at the cadence.
  const phraseLen: number[] = new Array(text.length).fill(1);
  const phraseIdx: number[] = new Array(text.length).fill(0);
  {
    let bucket: number[] = [];
    const flush = () => {
      const len = bucket.length;
      bucket.forEach((charI, k) => {
        phraseLen[charI] = len;
        phraseIdx[charI] = k;
      });
      bucket = [];
    };
    for (let c = 0; c < text.length; c++) {
      const ch = text[c];
      if (/[a-z]/i.test(ch)) bucket.push(c);
      else if (SENTENCE_END.has(ch)) flush();
    }
    flush();
  }

  // Pass 2: build glyphs with timing + pitch.
  const glyphs: Glyph[] = [];
  let t = 0;
  let seq = 0;
  let sawFirstLetter = false;

  for (let c = 0; c < text.length; c++) {
    const ch = text[c];
    const lower = ch.toLowerCase();

    if (ch === "\n") {
      glyphs.push(mkGlyph(seq++, ch, "newline", false, false, 0, t, 0, false));
      t += STEP_NEWLINE;
      continue;
    }
    if (ch === " " || ch === "\t") {
      glyphs.push(mkGlyph(seq++, " ", "space", false, false, 0, t, 0, false));
      t += STEP_SPACE;
      continue;
    }
    if (/[a-z]/.test(lower)) {
      const li = lower.charCodeAt(0) - 97;
      const isVowel = VOWELS.has(lower);
      const isUpper = ch !== lower;
      const degree = li % 7;
      const octaveStep = Math.floor((li % 14) / 7); // 0 or 1
      const len = phraseLen[c] > 1 ? phraseLen[c] : 2;
      const p = phraseIdx[c] / (len - 1); // 0..1 across the phrase
      const arc = Math.round(Math.sin(Math.PI * p) * 2); // 0 -> +2 -> 0
      const cap = isUpper ? 7 : 0; // capitals lift an octave (new phrase feel)
      const midi = scaleIndexToMidi(degree + 7 * octaveStep + arc + cap);
      const dur = isVowel ? DUR_VOWEL : DUR_CONSONANT;
      const g = mkGlyph(seq++, ch, "letter", isVowel, isUpper, midiToFreq(midi), t, dur, false);
      if (!sawFirstLetter) {
        g.isDropCap = true;
        sawFirstLetter = true;
      }
      glyphs.push(g);
      t += STEP_LETTER;
      continue;
    }

    // punctuation
    const cadence = SENTENCE_END.has(ch);
    const soft = SOFT_PUNCT.has(ch);
    const freq = cadence ? midiToFreq(ROOT_MIDI + 12) : 0; // resolving tonic
    const g = mkGlyph(seq++, ch, "punct", false, false, freq, t, cadence ? 1.4 : 0, cadence);
    glyphs.push(g);
    t += cadence ? STEP_CADENCE : soft ? STEP_SOFT_PUNCT : STEP_SOFT_PUNCT;
  }

  const layout = layoutGlyphs(glyphs);
  const totalDuration = t + TAIL;
  return {
    glyphs,
    totalDuration,
    viewW: layout.viewW,
    viewH: layout.viewH,
    numLines: layout.numLines,
  };
}

function mkGlyph(
  i: number,
  ch: string,
  kind: Glyph["kind"],
  isVowel: boolean,
  isUpper: boolean,
  freq: number,
  start: number,
  dur: number,
  cadence: boolean,
): Glyph {
  return {
    i,
    ch,
    kind,
    isVowel,
    isUpper,
    freq,
    start,
    dur,
    cadence,
    x: 0,
    y: 0,
    line: 0,
    size: 0,
    isDropCap: false,
  };
}

// ----- typographic layout ----------------------------------------------------

const VIEW_W = 720;
const MARGIN_X = 52;
const TOP = 74;
const FONT = 27;
const DROP = 104;
const LINE_H = 46;
const ADV_LETTER = FONT * 0.58;
const ADV_SPACE = FONT * 0.42;
const ADV_PUNCT = FONT * 0.42;
const DROP_W = 92; // width the drop-cap block reserves on the first two lines

function advanceOf(g: Glyph): number {
  if (g.kind === "space") return ADV_SPACE;
  if (g.kind === "punct") return ADV_PUNCT;
  return ADV_LETTER;
}

function indentForLine(line: number): number {
  return line < 2 ? MARGIN_X + DROP_W + 14 : MARGIN_X;
}

function layoutGlyphs(glyphs: Glyph[]): {
  viewW: number;
  viewH: number;
  numLines: number;
} {
  const rightEdge = VIEW_W - MARGIN_X;
  const baseline0 = TOP + FONT;
  let line = 0;
  let x = indentForLine(0);
  let maxLine = 0;

  for (let j = 0; j < glyphs.length; j++) {
    const g = glyphs[j];

    if (g.isDropCap) {
      g.size = DROP;
      g.x = MARGIN_X;
      g.y = TOP + DROP * 0.78;
      g.line = 0;
      continue;
    }

    g.size = FONT;

    if (g.kind === "newline") {
      line++;
      x = indentForLine(line);
      g.line = line;
      g.x = x;
      g.y = baseline0 + line * LINE_H;
      continue;
    }

    if (g.kind === "space") {
      g.line = line;
      g.x = x;
      g.y = baseline0 + line * LINE_H;
      if (x > indentForLine(line)) x += advanceOf(g);
      continue;
    }

    // letter or punctuation. If this begins a word, look ahead and wrap the
    // whole word if it would overrun the right edge.
    const prev = glyphs[j - 1];
    const atWordStart =
      !prev || prev.kind === "space" || prev.kind === "newline" || prev.isDropCap;
    if (atWordStart) {
      let wordW = 0;
      for (let k = j; k < glyphs.length; k++) {
        const gk = glyphs[k];
        if (gk.kind === "space" || gk.kind === "newline") break;
        wordW += advanceOf(gk);
      }
      if (x + wordW > rightEdge && x > indentForLine(line)) {
        line++;
        x = indentForLine(line);
      }
    }

    g.line = line;
    g.x = x;
    g.y = baseline0 + line * LINE_H;
    x += advanceOf(g);
    if (line > maxLine) maxLine = line;
  }

  const numLines = maxLine + 1;
  const textBottom = baseline0 + maxLine * LINE_H + 40;
  const dropBottom = TOP + DROP + 40;
  const viewH = Math.max(textBottom, dropBottom, 300);
  return { viewW: VIEW_W, viewH, numLines };
}
