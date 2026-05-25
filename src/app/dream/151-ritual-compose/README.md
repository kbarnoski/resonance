# 151-ritual-compose — Oracle

**Route**: `/dream/151-ritual-compose`  
**Status**: demoable  
**Built**: Cycle 179 (2026-05-25)

## What it is

A ritual music generator. The visitor casts three coins six times — the I Ching's traditional consultation method — building a hexagram one line at a time. The hexagram (1 of 64) becomes the musical intent for a Lyria 3 Pro generation: 30 seconds of ambient journey music whose emotional character is drawn directly from the hexagram's meaning.

## Why this matters

149 prototypes in the sandbox respond to input in real time (tap → sound, play → visualize). This is the first where the visitor performs a *ceremony* before music appears. The six-toss sequence creates intention and attention — a pause before the sound. The I Ching's 64-hexagram vocabulary maps onto music surprisingly well: hexagram 29 (K'an, The Abysmal) → deep water resonance, underground echoes; hexagram 58 (Tui, The Joyous) → bright arpeggios, pure delight; hexagram 52 (Ken, Keeping Still) → sustained single drone, mountain silence.

## How it works

**Coin toss** → `Math.random() < 0.5` for each of 3 coins. Heads majority (≥ 2 heads) = yang (solid line). Tails majority = yin (broken line). Six tosses = 6 lines = 1 hexagram.

**Trigram decode** → lines 1–3 form the lower trigram, lines 4–6 the upper. Bit encoding: `bit0 = bottom_of_trigram, bit1 = middle, bit2 = top`. An 8×8 King Wen lookup table maps [lower_bits][upper_bits] → hexagram number 1–64.

**Lyria prompt** → Each hexagram has a hand-authored music prompt (e.g., "open major harmony, warm and bright, peaceful, 60 BPM, rising phrases" for #11 T'ai — Peace). Sent to `fal-ai/lyria3/pro` (~$0.08/generation). Response plays through the 6-band bloom radial visualizer.

## Technical

- Zero npm deps beyond what's already installed
- All 64 hexagram name/interpretation/prompt pairs: ~6KB static data
- API route: `151-ritual-compose/api/route.ts` — uses `guard(req)` (origin + rate-limit + quota)
- Bloom visualizer: direct copy of `129-lyria3-journey` bloom (same BAND_COLORS, same radial gradient technique)
- FAL_KEY required (already in Vercel env). Budget: ~$0.08/generation

## Design notes

The coin flip animation uses CSS opacity + scale transitions with per-coin delay (0, 60, 120ms) to make the three coins land visually out of sync — mimicking the physical scatter of tossed coins. The hexagram display builds bottom-to-top as tosses are cast (line 1 first = visual bottom = appears first). Upper and lower trigrams are visually separated by a gap, matching the traditional hexagram glyph.

The "Re-cast" button is always available once a hexagram is shown — visitors may find they want to approach the oracle again. The re-cast resets both the audio buffer and the visual display.

## Polish ideas

- Add a gentle sound (bell or gong) on each coin toss
- Show the changing line if one exists (6 or 9 from the toss count)
- Let the user see how many heads/tails fell on each toss
- Animate lines appearing one by one with a brief delay (currently instant after toss)
- "Share your hexagram" — copy link with hexagram number pre-loaded
