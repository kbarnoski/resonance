# 986 — Empty Words

**What if Resonance could set any text to music _deterministically_ — paste a poem or an email, and a transparent engine composes it, every note carrying the letter / syllable / mark that caused it?**

This prototype is the explainable, deterministic **inverse** of the 2026 neural text→music frontier (Text2midi, MeloTrans, diffusion caption→MIDI — all opaque black boxes). There is no model and no network: it is a pure rule system, fully offline, and the **same text always produces the same piece**. As each note sounds, the engine shows you _why_ — the vowel, stress, capital or punctuation that produced it.

## References / lineage

- **John Cage, _Empty Words_ (1974).** Cage dissolved Thoreau's _Journal_ into a graded series of sound-events — sentences, then phrases, words, syllables, and finally letters and silences — treating language as raw acoustic material. This prototype's default passage is adapted from Thoreau's _Journal_ in homage, and the "letters/syllables/punctuation become sound-events" idea is directly Cagean.
- **Guidonian / solmization text-setting.** The medieval tradition (Guido of Arezzo and after) of mapping syllables to pitches by rule — the ancestor of every deterministic "text → melody" cipher. Here, vowels are the syllable nuclei that select scale degrees.

## How to use

1. The manuscript renders the default passage immediately on load (visual before audio) and drifts gently.
2. Press **▶ Sing the text** (this user gesture unlocks the AudioContext per browser autoplay rules). The melody plays over an always-on harmonic bed; the currently-singing word glows and the page scrolls to keep it in view.
3. Edit or paste your own text in the textarea — a poem, an email, anything. The piece recomposes deterministically.
4. Choose a **mode** (D Dorian default, A Aeolian, C Ionian, F Lydian) and a **tempo**. **■ Stop** halts playback.
5. Watch the **"now singing"** readout — it names the exact cause of each note as it sounds.

## The text → music mapping (the composer)

Implemented as a pure function `compose(text, mode)` in `composer.ts`. No `Math.random()` is in the composition path; the same input yields a byte-identical event list.

### Pitch — vowels select scale degrees of a real diatonic mode

The six vowels (a, e, i, o, u, y) map across the seven scale degrees, ordered by vowel openness to give a singable contour:

| Vowel | Scale degree (1-indexed) | Rationale |
|-------|--------------------------|-----------|
| i | 1 (tonic) | close vowel → resting tone |
| e | 2 | |
| a | 3 (modal colour tone) | open vowel → the mode's character 3rd |
| o | 5 | strong, restful |
| u | 6 | the mode's character note |
| y | 7 (leading tone) | unresolved / tense |

Modes (semitone steps from the tonic):

| Mode | Tonic | Steps |
|------|-------|-------|
| D Dorian (default) | D4 (MIDI 62) | 0 2 3 5 7 9 10 |
| A Aeolian | A3 (MIDI 57) | 0 2 3 5 7 8 10 |
| C Ionian | C4 (MIDI 60) | 0 2 4 5 7 9 11 |
| F Lydian | F4 (MIDI 65) | 0 2 4 6 7 9 11 |

### Rhythm, stress & dynamics

| Input feature | Musical consequence |
|---------------|---------------------|
| Word-initial syllable, long/doubled vowel, or capitalized word | **stressed** → longer duration (1+ beat), lands like a downbeat |
| Other (interior) syllables | **unstressed** → short passing tones (0.5 beat) |
| Long / doubled vowel (e.g. "ee", "oa", word-final vowel) | +0.25 beat sustain |
| Capitalized word | louder (+velocity) |
| ALL-CAPS word (≥2 letters) | **forte** (velocity 0.95) |
| Consonant cluster before a vowel (≥2 consonants) | **staccato** articulation |
| No leading consonant | **legato** |
| Consonant-only syllable (e.g. trailing "ng") | very short, soft percussive tonic tap |

### Punctuation → rhythm & cadence

| Mark | Consequence |
|------|-------------|
| `,` `;` `:` | short rest / breath (0.5 beat) |
| `.` `…` | **cadence** — a sustained note resolving to the **tonic**, then a phrase rest |
| `!` `?` | **leap** up to the raised 7th in the upper octave — heightened tension |
| newline | breath + gentle **register shift** (alternates octave) for the next phrase |
| quotes, dashes, parens | silent, but kept in the manuscript |

### Harmonic bed (always on)

A root + fifth sine drone an octave below the singing register, plus a soft triangle pad on the modal 3rd, with a slow (0.08 Hz) tremolo. It keeps every sung note consonant. Built in the chosen mode and rebuilt when the mode changes.

## Subsystems integrated (ambition gate — 4 distinct)

1. **Tokenizer / parser** (`composer.ts`): words, punctuation, whitespace, newlines, plus a deterministic syllable splitter and stress heuristic.
2. **Deterministic composer** (`composer.ts`): the pure `text → NoteEvent[]` mapper, each event carrying its provenance `reason`.
3. **Web Audio scheduler** (`audio-engine.ts`): ~25 ms look-ahead scheduling (A Tale of Two Clocks pattern), per-note synthesis with articulation envelopes, and the harmonic bed. Fires the provenance callback in sync for the readout.
4. **WebGL2 manuscript renderer** (`manuscript-gl.ts`): raw GLSL ES 3.00 (no three.js). Letters are drawn into an offscreen 2D atlas (real letterforms), uploaded as a texture, and composited with a procedural charcoal-parchment background, paper grain, ruled staff lines, and an animated amber glow around the singing token. A **Canvas2D fallback** (`manuscript-2d.ts`) renders the same look when WebGL2 is unavailable.

## Files

- `page.tsx` — the Client Component: UI, render loop, audio gesture-gating, scroll-to-token, live "why" readout, mode/tempo controls, graceful degradation and teardown.
- `composer.ts` — tokenizer + deterministic composer + mode tables (the pure core).
- `audio-engine.ts` — Web Audio look-ahead scheduler, voice synth, harmonic bed.
- `manuscript-gl.ts` — WebGL2 / GLSL ES 3.00 manuscript renderer.
- `manuscript-2d.ts` — Canvas2D fallback renderer.
- `default-text.ts` — the pre-filled Thoreau passage.

## Graceful degradation & teardown

- **No WebGL2** → automatically uses the Canvas2D renderer. If neither is available, a `text-rose-300` notice shows and audio still works.
- **AudioContext failure** → a visible `text-rose-300` error; the manuscript keeps animating.
- **Autoplay safety** → before any user gesture the manuscript animates and a clear call-to-action is shown; audio only starts after pressing the button.
- **Unmount** → `cancelAnimationFrame`, `removeEventListener`, GL context disposed (`WEBGL_lose_context`), and the AudioContext closed.

## Known limitations

- The syllable splitter is a vowel-nucleus heuristic, not a linguistic syllabifier; words like "uninterrupted" split reasonably but not perfectly. Stress is a positional/orthographic heuristic, not a pronunciation dictionary.
- Only ASCII letters select pitches; accented or non-Latin letters are rendered in the manuscript but are treated as non-vowel (so e.g. "café" sets on the "a" only). This is deliberate to keep the cipher simple and inspectable.
- Very long inputs scroll but aren't paginated; the atlas is one tall texture (capped by the browser's max texture size — multi-thousand-word inputs may exceed it).
- The melody is intentionally diatonic and gentle (it can never clash with the bed); it's a faithful, legible setting rather than an expressive arrangement.

## Verification note (honest)

- `npx tsc --noEmit` — no errors from this folder.
- `npx next lint --dir src/app/dream/986-empty-words` — clean (no warnings or errors).
- The pure composer was dry-run in Node (esbuild-bundled) on the default passage and edge inputs — empty string, all-punctuation, a 400-word paragraph, and a unicode/accented string. It never threw, always produced ≥1 pitched note, and was confirmed **deterministic** (two runs of the same input gave byte-identical event lists) across all four modes.
- Not verified in a live browser within this environment: the actual WebGL2 paint, audio output, and the Canvas2D fallback path were validated by code review and type-checking only, not by visual/audible runtime inspection.
