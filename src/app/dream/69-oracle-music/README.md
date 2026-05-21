# 69-oracle-music — Oracle Music

**Status**: demoable

The I Ching answers in sound. Cast three coins six times — their sum on each
throw produces a line (6, 7, 8, or 9); six lines form one of 64 hexagrams.
Each hexagram maps to a set of musical parameters synthesized in real time
via Web Audio.

## How to use

Click **Cast the Coins**. Watch three coins tumble and settle for each of the
six lines, building the hexagram from the bottom up. When the sixth line
falls, the hexagram's name and a one-line oracle commentary appear. Music
begins automatically, shaped by the hexagram's traditional qualities.

Click **Cast again** at any time to draw a new hexagram.

## Hexagram → music mapping

Each hexagram carries traditional associations (element, season, archetypal
quality) that translate into musical parameters:

- **BPM** — tempo, from 35 (Keeping Still / Receptive) to 140 (The Arousing)
- **Scale** — major (creative/joyful), minor (danger/dark), pentatonic
  (still/natural), chromatic (abysmal/conflict)
- **Register** — bass C2 (earth, deep) to bright C5 (heaven, expansive)
- **Density** — 1 voice (solitary) to 5 voices (abundant)
- **Filter** — low cutoff (dark, dull) to high (bright, open)

Extremes: Hexagram 1 (The Creative) plays pentatonic major arpeggios at
80 BPM through a wide-open filter at C5 — pure force. Hexagram 2 (The
Receptive) plays a single sustained pentatonic tone at 35 BPM through a
400 Hz filter at C2 — stillness.

## Moving lines

When a coin sum is 6 (all yin, moving) or 9 (all yang, moving), that line
glows amber. Moving lines indicate the hexagram is in transition — traditionally
they transform into their opposite, generating a second hexagram. That layer
is not yet implemented; the glow is the signal.

## Technical notes

- Pure Web Audio API (OscillatorNode + BiquadFilterNode + GainNode)
- Triangle-wave oscillators with exponential ADSR envelopes
- Coins simulated as Math.random() < 0.5, yielding the traditional
  distribution: yin(2)+yin(2)+yin(2)=6, ..., yang(3)+yang(3)+yang(3)=9
- King Wen hexagram sequence encoded as an 8×8 trigram lookup table;
  lower/upper trigrams derived from the 6-bit binary of the cast lines

## Polish ideas

- **Second hexagram from moving lines**: when any line is moving (6 or 9),
  compute the resulting hexagram (all moving lines flip) and cross-fade the
  music toward its parameters over ~30 seconds.
- **Ambient drone layer**: a long-sustained root note beneath the chord rhythm,
  tied to the hexagram's register and scale quality.
- **Commentary depth**: longer traditional commentary (Wilhelm translation)
  expandable behind a "Read more" toggle.
- **Hexagram history**: a small row of the last 4 cast hexagrams with their
  numbers, so a session of casting accumulates into a visible oracle record.
