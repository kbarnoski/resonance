# 402 · Kids Steady Walk

**One question:** What if a little creature only walked smoothly when you kept a *steady* beat — clapping or saying "bup bup bup" — and stumbled when your beat got wobbly?

---

## How to Play

1. Tap **Start** and allow microphone access (or tap **Watch it play** to see a demo).
2. Clap your hands, tap a table, or say "bup bup bup" in a steady repeating beat.
3. Watch the creature: the steadier your rhythm, the smoother it walks.
4. Keep your beat steady for 8 steps in a row — the creature does a happy hop and a flower blooms on the path ahead!
5. Let your rhythm get wobbly and the creature lurches and wobbles too.

No reading required. For ages 4 and up.

---

## Technique

### Onset Detection
A `Web Audio AnalyserNode` reads microphone input every animation frame. The **onset detection function** computes **spectral flux**: for each FFT frame, the sum of positive bin-to-bin magnitude increases (half-wave rectified), with high-frequency bins weighted 2× (HFC boost). This detects claps and percussive vocal hits while ignoring steady tones. An adaptive running-mean threshold filters out ambient noise, and a **refractory window of ~120 ms** prevents double-triggering per onset (following tapping-study conventions from Repp 2005).

### IOI Steadiness Estimation
Each detected onset feeds a **ring buffer of the 8 most recent inter-onset intervals (IOIs)**.

- **Tempo** = 60 000 / median(IOIs), in BPM
- **Steadiness** = 1 − clamp(CV, 0, 1), where CV = stddev / mean

A perfectly metronomic beat → CV ≈ 0 → steadiness ≈ 1.0.  
A lurching, uneven beat → high CV → steadiness → 0.

### Creature Gait
Steadiness drives the SVG creature's walk cycle in real time:
- **High steadiness**: smooth alternating leg swing, gentle body bob, calm smile.
- **Low steadiness**: random leg angle offsets, large body wobble, worried expression.
- Each detected onset triggers one footstep and advances the creature along the path.

### Reward Loop
Maintaining steadiness > 0.75 for 8 consecutive steps triggers:
- Creature happy hop (SVG spring animation with sparkle particles).
- A flower blooms ahead on the path (SVG petal-unfurl animation).
- Celebratory slendro chime chord.

### Footstep Tones (Slendro)
Each footstep plays a soft mallet tone from the **slendro** pentatonic scale (Indonesian gamelan tradition). Slendro divides the octave into 5 roughly equal steps (~240 cents each), unlike any Western scale. Frequencies used:

- Low octave: 196, 226, 258, 296, 342 Hz
- High octave: 392, 452, 516, 592, 684 Hz

Steps cycle through these 10 tones in order. All sounds are gentle, child-safe, and run through a dynamics compressor.

---

## Reference

> Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review, 12*(6), 969–992.

This work reviews human entrainment to and maintenance of a self-generated steady beat (sensorimotor synchronization). The ~120 ms refractory window used in onset detection reflects typical inter-tap intervals observed in tapping studies, below which double-detections are physiologically implausible.

---

## Subsystems

| File | Role |
|---|---|
| `onset.ts` | Spectral flux onset detector with adaptive threshold and refractory gate |
| `steadiness.ts` | IOI ring buffer, median tempo, CV-based steadiness score |
| `audio.ts` | Slendro pentatonic footstep synth, hop glide, flower sparkle chord |
| `page.tsx` | SVG creature + path scene, reward logic, demo mode, steadiness meter, design notes panel |

---

## Fallback / Demo Mode

If microphone permission is denied, a **text-rose-300** message appears and a **"Watch it play"** button launches the built-in demo. The demo injects synthetic onsets following a script:

1. Steady ~600 ms IOI (smooth walk, flower reward)
2. Wobbly varying IOIs (stumble, wobble)
3. Re-steadied ~580 ms IOI (smooth again)

This makes the full mechanic legible with no microphone.

---

## Tags

`INPUT=mic onsets (claps/voice)` · `OUTPUT=SVG` · `TECHNIQUE=onset detection + inter-onset-interval (IOI) regularity / tempo & steadiness estimation` · `PALETTE=walking creature on a path, footstep tones in slendro (Indonesian 5-tone, non-Western)`
