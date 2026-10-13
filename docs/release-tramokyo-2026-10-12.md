# Tramokyo release — 2026-10-13

The stable show build before the particle-system upgrade. Validated by a full
catalogue tour on the kiosk (pass 7) — every journey played end to end, every
frame checked: 97 / 104 clean; the 7 flags were faint (root-caused and fixed:
the contrast-veil step, Realized's crawl) or a lone 67 ms gap (Surrounded by
Light 19), confirmed by the replay pass. If the upgrade ever goes wrong: `scripts/kiosk-rollback.sh`
puts the kiosk back on exactly this release (tag `tramokyo-release-2026-10-13`).
The show pack (media) for this release is mirrored to Google Drive
(`My Drive/Resonance Backup`, `scripts/backup-to-drive.sh`).

## What's in it (since the pass-6 baseline)

### Ghost — the premiere journey
- The opening: after the emblem, Snowflake's soft wandering wisp (murmuration),
  in Ghost's own white / lavender / blush (the tunnel stills had turned it green),
  at a natural pace (it ran at the engine's slowest).
- No ribbons in Ghost, anywhere.
- The screen never lightens in the opening (the misty-hall still is graded deep).
- The blossom hands to the final wings without the back-and-forth (the motes
  hover where they are and the wings gather from there).
- No stall on the final wings (a shader change at 95 % used to cost 51-53 ms).
- No fade-out-and-right-back of the particle field (any journey).
- The whole journey moves at a calm 0.65 after the opening (it dragged at the
  0.38 floor under the falling-lights shader).
- The angel emblem is sampled in a worker, never on the title card (a 16 ms
  stall as Ghost's title came in).

### Particles (every journey, Snowflake + Ghost included)
- Spatial pairing: image forms gather from where each mote already is — no
  more contract-and-expand.
- Recycled motes fade in by age, wherever the camera is (no pop-in at the top).
- Diversity: neighbouring journeys never reuse a form (98 % → 2 % in the loop
  replay); no form above ~5 % of screen time.
- Four new forms: aurora, strange attractor, starburst, smoke rings.
- The light journeys (First Light, Surrounded by Light, Afterglow) wear a sun
  theme — radiant forms, psychedelic rainbow.
- +20 % response to the music (shaders on every journey but Snowflake + Ghost;
  particles everywhere).
- Fireflies: a soft rounded cloud, each firefly on its own beat.
- Rising-from-the-bottom forms (fountain, motes, embers, smoke) are one family,
  capped at ~10 % (Karel: "you really love using that kind of fountain").
- Field mode (a few large copies of a form at different depths) +25 %.
- Spatial pairing's softness drift slowed (no crawl on Realized's fire motif).
- The contrast veil under the field fades out fully before it is hidden (a
  faint one-frame brightening at every particle fade-out — pass 7's faint steps).

### Shaders
- Brighter shaders ease in over up to 7 s (Snowflake's swell no longer jumps).
- Journeys with small rosters borrow kindred unseen shaders instead of looping;
  phase-owned casts pace their shaders across the phase (Grasshopper).
- Silk Threads 40 % brighter.
- Response ladder, every journey: solo piano at the base → far out ×1.1 →
  ambient ×1.2 → groove ×1.35 → big and intense ×1.6 (Karel: "the solo piano
  ones get the base setting … such that the intense stuff is highly reactive").

### Imagery
- The kiosk never generates imagery live; a missing pack list is refetched
  (Snowflake after First Light had fallen back to live AI with a stuck image).
- Literal stills out (Karel, Chenin 3: "keep it abstract"): Chenin 3 −11,
  Chenin 5 −6, Loire 2 −3, Sancerre Cry 4 −2.
- Surrounded by Light's emblem: a halo of light around a radiant core.
- Karel's literal-stills review (vision audit of 3,451 stills, his picks on
  the review page): 224 literal stills out of the pack (objects, books,
  fruit, leaves, figures). Backup: ~/Documents/Resonance/local-images.backup-2026-10-13-literal-review.json.

### Titles
- Horizon Split journey titles (Inter Tight + Bodoni Moda italic), handoffs
  measured clean on the kiosk.

### Kiosk robustness
- Audio plays through "playback" buffering — no crackle under CPU load.
- Phone remote: ⚑ Mark glitch logs the journey + exact second.
- One-command rollback: `scripts/kiosk-rollback.sh`.

### Rise Above
- Chemiluminescence beside Cosmic Drift, Rise 1 right after Amboise 1,
  Tranquility 38 the only Tranquility.
- Pinned takes: Calling, Night Wind 2, No question 7.
- Parked: Tranquility 3 (Expansion).

## Added on the night of the release (Karel at the kiosk, 2026-10-12/13)

### Kiosk
- **Live imagery valve, closed.** The kiosk never asks for a live image: the
  client valve (`src/lib/journeys/live-imagery-valve.ts`, closed by the kiosk
  build) and the server half (`/api/ai-image/*` answer 503 on the kiosk).
- A pack list that arrives late always reaches the image layer (Snowflake froze
  after First Light).
- Deploys never boot out a healthy server; the build pins its commit.

### Shaders — the recast
- Amber 37 → 25 %, magma / parsec / ember 5 journeys each, leaning cosmic.
- **Dharma banned everywhere.** **Seraph always** in First Light and every
  Surrounded by Light. Bath: no ember or parsec (finale-forced included).
- Ghost: the falling lights out of the opening; the triangles (yantra) at 65 %.
- The First (Expanded): mycelium in place of the diagonal light sweep.
- Snowflake: the coloured lines (r2-photon) on before the last morph, to the end.
- Response ladder, steeper: solo piano ×1.3 → far out ×1.5 → ambient ×1.7 →
  groove ×2 → big ×2.5 (shaders and particles; Snowflake + Ghost unchanged).

### Particles
- Ghost: the opening stays a small wisp until the tunnel; no angel at the
  tunnel entrance; recycled motes arrive one by one (no bunch at the top).
- One big change at a time (no form change near a shader switch or a morph).
- Starburst breathes instead of lunging; the next journey's emblem is decoded
  before the switch; crescent-like motifs out.

### Takes pinned
- Snowflake (its still sequence), First Light, The First (Expanded).

### Imagery
- Realized: its white-ground ash and lava stills gathered into one ~37 s section.
- First Light: the simple sun emblem at start and end.
- Morphs that began on removed literal stills pulled (Lantern ×2, Surrounded By Light t0).

### Rise Above
Ghost → Snowflake → First Light → Yellow Bird → The First (Expanded) →
Grasshopper → Afterglow → Mycelium Dream → Bath → The Summit → Testimony 3 →
Amboise 1 → Chemiluminescence → Rise 1 … (Cosmic Drift out; Tranquility 3 parked).

## Fallback tags (newest first)
- `tramokyo-release-2026-10-13` — this release
- `tramokyo-pairing-step1` — particle step 1 only
- `tramokyo-baseline-pass6` — the pass-6 baseline
