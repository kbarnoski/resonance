# Morning digest — last updated 2026-05-27 UTC (Cycle 210)

## New since yesterday

- **[/dream/179-kids-voice-monster](https://getresonance.vercel.app/dream/179-kids-voice-monster)** — Voice Monster 🎤 (kids, Cycle 210)
  Hum or sing into the mic — a glowing blob-monster grows with your amplitude and colour-shifts
  with your pitch (low=violet, mid=teal, high=rose). Feed it for 30 seconds and it bounces, then
  **sings back a melody** drawn from the distinct pitches it captured (up to 8 notes, 0.56s each).
  After 5 seconds of silence the eyes drift in a Lissajous wander as if searching for sound.
  Tap the monster for a surprised harmonic-arpeggio boop + eye-wobble.
  **Why open it**: tap "Try demo (no mic)" — the LFO-fed demo fills the hunger bar over 30s and
  shows the full sing-back cycle. Then try it with your mic: hum a few notes, let it fill, and
  hear which pitches it "remembered." The character narrative makes kids feel like they're feeding,
  not performing — removes the self-consciousness of singing at a machine.

- **[/dream/178-splat-bloom](https://getresonance.vercel.app/dream/178-splat-bloom)** — Splat Bloom (adult, Cycle 209)
  500 Gaussian-distributed ellipses with additive compositing — the dense centre blooms to near-white.
  Bass/treble/centroid/onset all mapped. Still fresh; worth a look with live mic.

- **[/dream/177-kids-lego-sequencer](https://getresonance.vercel.app/dream/177-kids-lego-sequencer)** — Lego Beats 🧱 (kids, Cycle 208)
  First 2D pitch×time grid in the kids zone. Pre-seeded melody, BPM controls, drag to draw. Ages 3+.

## In progress / partial

- Nothing in-progress. Next queued:
  - **Cycle 211 (adult)** → adult research sweep (last adult research was Cycle 177, now 34 cycles
    ago — substantially overdue). Or build: `cellular` (Conway automaton composer), `gesture-music`
    (webcam hands → synth, needs Karel OK on ~8MB CDN dep), or `score-structure` (real-time
    improvisation architecture from Karel's piano recordings).
  - **Cycle 212 (kids)** → `kids-texture-drum` — five material zones (wood/metal/water/earth/glass)
    each with distinct synthesized timbre. First kids prototype about timbre, not pitch.

## Research findings worth a look

- **Neural reward in kids' improvisation** (PMC11986006, Scientific Reports Apr 2025): fMRI shows
  reward circuits (amygdala, caudate, nucleus accumbens) activate MORE during free improvisation than
  memorized tasks. This is why voice-monster uses a feeding narrative — it reframes "I'm singing"
  as "I'm helping," reducing the performance self-consciousness that suppresses free vocal exploration.
- **BrickMusicTable** (arxiv 2411.13224, Nov 2024): validated with 150+ kids aged 3–13. Inspires
  ongoing kids grid sequencer work.

## Open questions for Karel

- **`kids-voice-monster` 30s threshold**: feels right for sustained engagement, but on iPad with an
  enthusiastic 3yo who hums continuously it fills quickly. Demo takes exactly 30s. If you want a
  shorter cycle for very young kids (more frequent sing-back reward), 20s is the natural alternative.
- **Cycle 211 direction**: adult research sweep (overdue — 34 cycles since last adult research) vs.
  building one of the queued adult prototypes. I'll default to a research sweep unless you specify.
- **`gesture-music`**: needs Karel OK on loading ~8MB MediaPipe WASM from jsDelivr CDN. Worth it?
  Webcam hands → pitch/reverb/percussion, very different from all 179 existing prototypes.
