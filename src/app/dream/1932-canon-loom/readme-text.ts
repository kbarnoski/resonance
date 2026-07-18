// Plain-text design notes surfaced in the in-app "Design notes" modal.
// Kept in sync with README.md (which carries the fuller self-assessment).

export const README = `Canon Loom — the notes you play are never spent. They are woven into a roll that scrolls back past the read-head forever, so your earlier self keeps playing beneath your present one.

THE ONE QUESTION
What if the notes you play never disappear — what if Resonance wove your performance into a living loom that plays your own past back as counterpoint?

THE ROLL / THE WEAVE
The surface is a Nancarrow punched-roll seen as a loom. Time is the warp: it runs left–right and scrolls continuously past a fixed gold read-head (the "now"). Pitch is the weft: high notes sit high, low notes low. Every note you strike is knotted into the cloth at the exact phase of the loop where you played it — a durable indigo thread. Play the same place twice and the thread is over-dyed: it thickens and darkens. Nothing is erased by time; the roll simply loops.

THE CANON
The roll is cyclic. A thread you wove ninety seconds ago is still there, and every time it scrolls back under the read-head it sounds again — a canon of one voice chasing itself, Bach on a Jacquard card. As the weave grows denser the counterpoint thickens under your hands. This is the compositional-MEMORY thesis: your earlier gestures are structural and consequential, not a momentary reactive mapping.

INPUT
A MIDI keyboard if one is present (Web MIDI), otherwise your computer keys. White keys a s d f g h j k l ; ' climb a two-octave C-major scale; w e t y u o p are the accidentals. The active input is shown at the bottom.

THE GHOST WEAVER
If no one plays for six seconds, a seeded, fully deterministic ghost weaves a short canon subject into the roll so the piece demonstrates itself — no MIDI, no gesture required for the visuals. The instant a real key or MIDI note arrives, the ghost yields and the cloth is yours; its threads stay woven in as your accompaniment.

AGENCY
Loop length (4 / 8 / 16 beats) re-scales the whole weave around you. "Clear the loom" cuts every thread and lets the ghost re-seed.

NAMED REFERENCES
Conlon Nancarrow's Studies for Player Piano — performance punched permanently into a roll. The Jacquard loom — a punch-card weave, the ancestor of stored programs. Bach's canons — a voice chasing itself.

SOUND
Pure Web Audio: a warm plucked/struck voice (fast attack, gentle decay, a filter that closes as it rings) so overlapping canon voices stay legible. Master gain stays low and is fully torn down on exit.

DETERMINISM
No wall-clock, no Math.random anywhere in the audio/visual logic. The ghost phrase is a fixed table; the only randomness is a seeded generator that stipples the linen texture once.`;
