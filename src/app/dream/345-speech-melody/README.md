# 345 · Speech Melody — design notes

## The question

> What if you typed a sentence — a line of a poem, a memory — and Resonance
> turned its **speech** into music: each word's vowels become pitches, its
> consonants percussion, the sentence's prosody the phrasing — and you could
> **recognise your own words** in what you hear?

This is the lab's first **natural-language → music** piece. It is deliberately
distinct from `22-code-score` (a note-DSL where you literally write pitch names).
Here you write *language*, and a deterministic grapheme→phoneme-ish mapping
"sings" it. It answers the jury's call to make music **legible**: the visitor
watches their words light up, one at a time, as they sound.

## The speech-melody mapping (`text-music.ts`)

Deterministic — the same text always reproduces the same melody.

1. **Tokenise** the line into words; punctuation drives rests / phrase breaks.
2. **Syllable-ish split.** Walk each word's letters, emitting one unit per
   *vowel cluster*. A hand-written table matches multi-letter vowels first
   (`eigh`, `ough`, `ee`, `ou`, …) then single vowels, greedily absorbing
   adjacent vowel letters into one nucleus. Consonants before a nucleus are its
   *onset*; trailing consonants at word end are the *coda*.
3. **Vowels → pitch.** Each vowel class carries a *height* on a front/high →
   back/low axis (EE/IH high & bright, OO/UH low & dark). Height indexes a
   two-octave **D-Dorian** ladder, so vowel colour becomes pitch height. A small
   downward *position bias* makes later words drift lower — Janáček observed
   spoken phrases tend to fall.
4. **Consonants → percussion.** Onset/coda clusters are classified into voices:
   plosives `p t k` → bright clicks, `b d g` → thuds, sibilants/fricatives
   `s f h sh th ch` → hiss, liquids/nasals `l r m n` → soft rings.
5. **Prosody → phrasing.** Word-initial syllables, capitalised words and the
   opening word are *accented* (louder, brighter, longer); word-final syllables
   are held; commas/full-stops insert rests. The result is a phrase **contour**.

## Audio (`audio.ts`)

A warm voice = **sine + slightly-detuned triangle** through a **lowpass** (cutoff
tracks vowel brightness) with a click-free **ADSR**. Consonants are short
band-/low-passed **noise bursts**. Everything sits over an always-on soft
**drone** (D2 + A2, breathing filter LFO). Shared **feedback delay** +
**procedural-impulse reverb**; master → brick-wall **DynamicsCompressor** →
destination. The `AudioContext` is created **inside the first gesture** (iOS-safe)
and torn down on unmount.

## Visuals (`page.tsx`, raw WebGL2 — GLSL ES 3.00)

A hand-written WebGL2 point-field renders the **pitch-contour ribbon**: ~480
additive glow points whose vertical position is the sampled pitch-height across
the phrase, in a violet→amber palette keyed to brightness. A **playhead**
brightens the contour as it passes. Over the GL canvas, a DOM word layer shows
the typed words large (`text-xl`/`text-2xl`); each word **lights up amber and
lifts** as it sounds, so you recognise it being sung. DPR/resize aware; full
teardown (cancel rAF, delete program/VAO/buffer, close ctx).

## Alive at review

On load it auto-plays a gentle Welcome-Home line through the full pipeline. If
the browser blocks autoplay, a clear **"tap Play to begin"** appears.

## Named references

- **Leoš Janáček** — *nápěvky mluvy* ("speech melodies"): notating the pitch
  contour of overheard speech as the seed of melody.
- **Alvin Lucier** — *I Am Sitting in a Room*: language transformed by an audio
  process until its meaning becomes its music (one of the example lines).
- **Fluxus** text / event scores — the intimate, instructional, do-it-yourself
  spirit of "type a line."
- **Jaap Blonk** — sound poetry: the phoneme as a musical/percussive object.

## Ambition criteria hit

- **INPUT** keyboard text, verifiable on a phone (type at 06:30).
- **OUTPUT** raw WebGL2 GLSL ES 3.00 glowing pitch contour + synced DOM word
  highlight.
- **TECHNIQUE** deterministic grapheme→phoneme-ish speech-melody mapping.
- **VIBE** literary / intimate / Fluxus. Legible readout (mode/key, now
  sounding, progress).

## Unverified surface (honest)

- **Recognisability is the real risk.** Vowel→pitch + consonant→percussion makes
  the *rhythm and contour* of a line legible, but English spelling is not
  phonetic — the letter heuristic mis-syllabifies many words ("the" → one EH
  note, silent-e and digraphs are approximate). Whether a listener *recognises*
  a specific sentence by ear (vs. merely following the highlighted words) is
  unverified and probably partial.
- Syllable counts can be off for irregular words; no lexical stress dictionary,
  so stress is positional/orthographic only.
- Reverb is a single static impulse; delay feedback is fixed — not tuned per
  phrase length, so very long pastes may feel washy.
- Visual playhead is driven by a wall-clock rAF aligned to the audio start time,
  not sample-accurate scheduling; under heavy load the highlight may lead/lag
  the sound slightly.
- Non-Latin / numeric input is stripped to letters; empty or vowel-less lines
  fall back to the welcome line.
