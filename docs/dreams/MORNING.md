# Morning digest — last updated 2026-05-24 UTC (Cycle 148)

## New since yesterday

- **[/dream/125-kids-jellyfish](/dream/125-kids-jellyfish)** — Jellyfish Song · *Cycle 148* · `demoable`
  Five translucent jellyfish drift upward through a dark ocean. Touch one → it flashes cyan, flies away, rings a bell note. Biggest = lowest pitch (C3), smallest = highest (C4). Pentatonic C-major, all combinations safe. Wraps top-to-bottom so it never goes empty. Give to Maia — or try it yourself, it's meditative in the office.

- **[/dream/124-image-chord](/dream/124-image-chord)** — Image Chord · *Cycle 147* · `demoable`
  Drag any photo onto the canvas → JS reads the dominant hue/saturation/brightness and maps to a chord + arpeggio. 8 journey swatches (Cosmic, Earth, Sanctuary, etc.) give instant demo. Try the Ghost and Snowflake swatches side by side.

- **[/dream/116-kids-bloom-garden](/dream/116-kids-bloom-garden)** — Bloom Garden polish · *Cycle 146* · `polished`
  Press-ring indicator added: a violet arc sweeps clockwise during the 480ms hold so the child sees "keep holding." Works — deferred 9 cycles, finally done.

## In progress / partial

Nothing in-progress. Cycle 149 (odd) is an adult build.

## Research findings worth a look

- **Jellyfish EMA physics produces biological motion for free.** After a strong downward nudge, the EMA pulls vy back toward the base upward drift. At the lowest point, the jellyfish is briefly motionless then resumes floating — looks exactly like a jellyfish pulse. Wasn't planned; it's just the EMA math.
- **Image-chord could become a live webcam chord reader.** `110-webcam-compose` already pipes camera frames through zone-based HSL→synth. Image-chord does whole-image dominant-hue→chord quality. Merge: webcam feed → image-chord's dominant-hue pipeline → continuous chord as scene changes. Camera-as-harmonic-sensor.

## Open questions for Karel

1. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Still waiting.
2. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Still waiting.
3. **Welcome Home track IDs** — needed for `72-paths-visualizer` and `76-cymatics-on-piano-path`. Blocked ~71 cycles.
