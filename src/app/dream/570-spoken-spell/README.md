# Spoken Spell

**The one question this prototype answers:**  
What if you SPEAK and your live words become a self-layering musical incantation? Resonance hears your speech (real, live speech recognition), and each spoken word's phonemes become pitches, its stressed syllable the downbeat, the sentence's punctuation/length the phrasing — so the words accrete into an evolving canon you can literally hear your own sentence inside, growing richer the longer you speak.

---

## How to Use

1. Open in Chrome or Edge (required for Web Speech API live recognition).
2. Click **"Start — speak to it"** — this gesture unlocks the Web Audio context.
3. Speak any words, phrases, sentences. Recognised words appear as large serif glyphs drifting across the SVG river, each glowing at the exact moment its note sounds.
4. After a pause (~1.2s) or sentence punctuation, the phrase freezes as a quiet looping ostinato underneath. Up to 4 loops layer simultaneously; the oldest drops as the 5th arrives.
5. On iOS/Firefox/unsupported browsers, a **typed-text fallback** is offered; the same mapping renders the incantation from keystrokes.
6. An **auto-demo** runs if no input arrives within ~3s — a seeded poem plays through the pipeline word by word so a silent glance always shows and hears the accreting-canon effect. The demo cancels the instant real speech or typing begins, and resumes after ~5s of silence.

---

## Linguistic → Music Mapping (`text-music.ts`)

All mapping is **deterministic**: same words → same music, always.

- **Pitch**: djb2 hash of lowercased letters mod 10 → index into D pentatonic MIDI set  
  `[D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5]` = `[62, 64, 66, 69, 71, 74, 76, 78, 81, 83]`  
  Always consonant; D pentatonic has no semitone collisions.

- **Duration** (in beats at ~100 BPM):
  - Vowel ratio ≥ 0.50 → 1.5 beats (sustained, vowel-rich words like "beautiful", "aura")
  - Vowel ratio ≥ 0.35 → 1.0 beat (standard)
  - Below 0.35 → 0.5 beats (pluck, consonant-heavy like "strength", "rhythms")

- **Accent**: inverse of word length — short emphatic words (≤2 chars: "I", "am") hit hardest (0.85), long words (≥8 chars) softer (0.58). Mirrors how stressed syllables work in English.

- **Timbre**: consonant count > vowel count → `"pluck"` (fast-decay sine + filtered noise burst); otherwise → `"sustain"` (triangle oscillator + ADSR envelope).

- **Rhythm**: Web Audio look-ahead scheduler (50ms interval, 120ms lookahead, `setValueAtTime` / `setTargetAtTime` only). No naive `setTimeout` per note.

---

## Audio Architecture (`audio.ts`)

- **Oscillators**: triangle (sustain voices) and sine (pluck pitched component) + a short filtered-noise burst for pluck transient.
- **ADSR**: attack 60ms, sustain determined by note duration, release via `setTargetAtTime` — no clicks.
- **Signal chain**: oscillator → envelope gain → `masterGain → BiquadFilter (lowpass, 7kHz) → DynamicsCompressor (threshold −10dB, ratio 12:1) → destination`. Loops never clip.
- **Drone pad**: D3 (146.83 Hz) + A3 (220 Hz) sine oscillators fade in over 3.5s. Always on; silence is never dead.
- **Loop voices**: `LoopVoice` objects hold a `ScheduledNote[]` and advance an index each pump cycle. Cap at 4 voices; oldest dropped on overflow. Loop notes play at 28% of live gain → form a quiet choir beneath the live voice.

---

## Accretion Mechanic

Each phrase (bounded by `.!?` punctuation or a ~1.2s pause) is frozen into a `LoopVoice` at the end of the current phrase buffer. This creates a layered canon: minute 2 is denser than second 10. The visual correlate: loop words fade to 55% opacity and get a softer SVG filter; live words burn bright at 88%.

---

## Graceful Degradation

| Situation | Behaviour |
|---|---|
| Chrome/Edge, mic granted | Full live speech recognition |
| Chrome/Edge, mic denied | `text-rose-300` notice + typed fallback + auto-demo |
| Safari / Firefox (no Speech API) | `text-rose-300` notice + typed fallback + auto-demo |
| SSR / Node.js | `getSpeechRecognition()` returns `null`; no error |
| AudioContext blocked | Built inside user-gesture click; no autoplay violation |

---

## Named References

- **Steve Reich — *Different Trains* (1988) and *It's Gonna Rain* (1965)**: Reich derived instrumental melodic lines from the literal pitch contour and rhythm of sampled speech, making language and music inseparable. This prototype does the inverse: maps written/spoken language back into a new pitch sequence using deterministic rules that echo how prosody encodes meaning.

- **Alvin Lucier — *I Am Sitting in a Room* (1969)**: Lucier re-recorded his voice in a room repeatedly until the speech dissolved into pure resonant frequencies of the space — language transformed into architecture by repetition. The accretion mechanic here echoes that gesture: each phrase, repeated as an ostinato loop, gradually loses its linguistic identity and becomes texture.

- **2026 in-browser ASR wave (Hugging Face transformers.js / Whisper / LiteASR / Cohere Transcribe via ONNX/WASM)**: The current prototype depends on `window.SpeechRecognition`, which limits it to Chrome/Edge. The production upgrade path is running Whisper-small or a LiteASR model fully client-side via WASM — no Chrome dependency, offline, cross-browser. As of 2026, Hugging Face `transformers.js` makes this straightforward with ~40MB model downloads cached in IndexedDB.

---

## What's Verified vs Rough/Unverified

**Verified**:
- Text-music mapping is deterministic and always pentatonically consonant
- Audio engine structure (scheduler, ADSR envelopes, compressor chain, drone pad) follows Web Audio best practice
- Speech recognition wiring with continuous/interimResults/lang flags
- Typed fallback path and auto-demo are both wired
- Graceful degradation for no SR support and mic denial
- SVG layout with glow filters and lit/loop visual states

**Rough / Unverified**:
- SVG `transformOrigin` for the lit-word scale pulse may need tweaking on various browsers (SVG `transform` + CSS `transformOrigin` cross-browser behaviour is imperfect)
- The visual lighting sync (matching note `startTime` to the corresponding `DisplayWord` id) is an approximation — the engine's `onNotePlay` callback finds the first unlitt word rather than tracking a per-word id through the scheduling pipeline. In practice this means visual ignition matches the audio rhythm correctly but may light a slightly wrong word if multiple rapid-fire notes are queued. A tighter solution would tag each `ScheduledNote` with the `DisplayWord.id` at enqueue time.
- Auto-demo resume logic uses a simple elapsed-time check and may fire slightly early/late
- Loop voice gain is fixed at 0.28×; no smooth fade-in ramp on new loop arrival
- On mobile (no speech), the typed input UX is functional but not optimised for touch

---

## Vibe

Ritual / incantation / cerebral. The piece rewards slow, deliberate speech — long meditative sentences build richer canons than rapid-fire phrases. Silence after speaking lets the loops breathe. The drone grounds everything.
