# 231 — Mood XY

**Route**: `/dream/231-mood-xy`  
**Cycle**: 265 (adult build)  
**Status**: demoable  

## What is this?

An emotion-coordinate synthesizer based on the **Russell circumplex model** (1980): music researchers consistently find that emotional responses to music cluster on a 2D plane with two independent axes — *valence* (negative ↔ positive) and *arousal* (calm ↔ excited).

Drag the white dot anywhere on the canvas. The music changes to match your emotional position.

## Controls

- **Drag anywhere** on the canvas to move the dot
- The dot can be moved before clicking Start (dot position is live from first paint)
- No mic, no camera, no permissions

## Synthesis mapping

| Parameter | Controlled by | Range |
|-----------|--------------|-------|
| BPM | Arousal (Y axis) | 40 → 140 |
| Voice count | Arousal | 1 → 6 |
| Attack time | Arousal inverse | 0.82s pad → 0.02s staccato |
| Note duration | Valence inverse | 3.0s → 0.4s |
| Chord quality | Valence | dim → minor → major |
| Filter cutoff | Valence | 200 → 4200 Hz |
| Oscillator type | Arousal | sine → triangle |
| Arpeggio stagger | Arousal > 0.5 | 0 → 45ms between voices |

## Four quadrant aesthetics

| Quadrant | Sound |
|---------|-------|
| excited · happy | Bright major arpeggios, 6 voices, 45ms stagger, 120+ BPM, high filter |
| excited · sad | Dark diminished runs, 4–6 voices, 100+ BPM, muffled filter |
| calm · happy | Sustained major pads, 2–3 voices, slow attack, 50–70 BPM |
| calm · sad | Sparse diminished chords, 1 voice, 3s sustain, 40–50 BPM |

Background color shifts bilinearly between deep amber (excited·happy), deep purple (excited·sad), deep teal (calm·happy), and deep navy (calm·sad).

## What makes this different

**Emotion as composition input, not output.** Every prior Resonance prototype takes audio as input and visualizes or transforms it. This one inverts the direction: you express an emotional intent on the XY plane and the synthesizer realizes it in sound.

The continuous parameter mapping means there are no discrete "modes" — sliding from calm·sad toward excited·happy is a smooth musical journey across hundreds of possible intermediate timbres.

## Research basis

- **AffectMachine-Pop** (arxiv 2506.08200, Jun 2026) — arousal×valence real-time music generation. Validates the two-axis model for interactive synthesis.
- **Russell circumplex model** (1980) — standard framework in music emotion research, confirmed across cultures and genres.
- Relationship to `225-aria-companion`: aria-companion does turn-taking dialogue; mood-xy does continuous emotional navigation.

## Polish ideas

- Add convolver reverb (wet/dry mix fades with arousal: 0.4 wet when calm, 0.1 wet when excited)
- Chord root changes slowly as dot moves (currently always C root — could add key modulation)
- Mic mode: replace the dot with a voice feature vector (spectral centroid → valence, tempo → arousal) — the synthesizer responds to the emotional content of what you're playing
- Multiple dots for layered independent voices
