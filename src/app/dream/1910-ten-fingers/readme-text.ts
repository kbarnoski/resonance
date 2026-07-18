// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment).

export const README = `Ten Fingers — a phone screen that speaks real functional harmony, and only under your hands.

THE ONE QUESTION
What if a sheet of glass became a chord instrument that spoke REAL tonal harmony — where where-you-press picks a diatonic function and the voices lead smoothly between held chords — and it made no sound at all until real fingers touched it?

THE GRID
A cold, labelled 4×3 matrix of chords. Columns are functions: TONIC · PREDOMINANT · DOMINANT · APPLIED. So a ii–V–I is a single left-to-right gesture, and it resolves like one. The applied column holds secondary dominants (V/V, V/vi, V/IV) that tug you toward a temporary key and then let go.

VOICE-LEADING
Four voices. Press a new cell and each voice snaps to the NEAREST tone of the next chord — common tones are held, motion is minimised. The oscillators literally glide from the old pitches to the new ones (portamento), so a held→new change slides rather than jumps. That glide is the bite.

MODULATION
The two strip cells pivot the whole key: → DOMINANT moves up a fifth; → RELATIVE swaps major↔relative minor. The entire grid re-labels and re-voices in the new key.

TOUCH
Up to ten pointers via Pointer Events. Mouse = one finger; a phone = both hands. No fingers on glass ⇒ total silence, a still grid. There is no autopilot: the piece is dead without a human.

WHY IT LOOKS LIKE THIS
Cold graphite monochrome, near-white ink on charcoal, a single hairline — after Ryoji Ikeda's data.matrix. Rendered as real SVG-DOM (rects, lines, circles animated each frame), not Canvas or WebGL. Touch-as-instrument follows Toshio Iwai's Tenori-on / Electroplankton.

ROUGH EDGES
Voice-leading is greedy per-voice, so it can occasionally double a tone or cross voices instead of finding the globally-optimal move. Equal temperament (the point here is function, not intonation). The delay tail can smear very fast two-handed playing.`;
