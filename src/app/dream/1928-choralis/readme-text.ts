export const README = `CHORALIS — sing one line, hear four parts

THE ONE QUESTION
What if you sang a bare melody into Resonance and, in real time, it built a
full four-part chorale UNDER your voice — with real functional voice-leading,
not a safe pentatonic pad?

HOW IT WORKS
You sing or hum a single line into the mic. Three stages run live:

1. PITCH — a YIN detector (implemented here from the raw time-domain buffer:
   cumulative-mean-normalized difference + absolute threshold + parabolic
   interpolation) tracks your fundamental frequency.

2. SNAP — your pitch is quantized to the nearest scale degree of the current
   key. That snapped note becomes the SOPRANO.

3. HARMONIZE — when a new stable note lands, a rule-based SATB engine picks a
   FUNCTIONAL chord that contains your note (I, ii, IV, V, vi, V7, viio, and
   secondary dominants V/V), weighted by classic root-motion and cadence
   preference. Then it voice-leads alto, tenor and bass underneath by an
   exhaustive small search that minimizes total motion while penalizing
   parallel 5ths/8ves, spacing and overlap faults, incomplete chords, and
   unresolved leading-tones / chordal 7ths. Every 8 chords the phrase leans to
   the dominant and cadences home; with "let the key wander" on, strong
   authentic cadences occasionally modulate to a neighboring key.

This is deliberately NOT a no-wrong-notes pentatonic wash. It is functional
tonal harmony with tendency-tone resolution, so it can sound like a hymn.

THE SCORE
The four voices are drawn as an animated SVG "breathing score": four horizontal
ribbons (S / A / T / B) scrolling right-to-left, each note a gold blob whose lane
brightens as that voice sounds. Gold-leaf on deep vellum — an illuminated
manuscript, not a spectrum analyzer.

NO MIC?
If the microphone is denied or unavailable, a built-in sung phrase drives the
same detector-and-harmonizer pipeline so you still see and hear all four parts
working. It is clearly labeled as the fallback.

REFERENCE
Implements the "bare vocal melody -> coherent multi-part harmony" idea of
"AI Harmonizer: Expanding Vocal Expression with a Generative Neurosymbolic Music
AI System" (NIME 2025, arXiv:2506.18143) — but with a small symbolic rule set
instead of a learned model. No ML, no network calls.`;
