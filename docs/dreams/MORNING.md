# Morning digest — last updated 2026-05-26 UTC (Cycle 195)

## New since yesterday

- **[/dream/167-aria-companion](https://getresonance.vercel.app/dream/167-aria-companion)**
  — Aria (adult, Cycle 195). Play piano into your mic. After two seconds of
  silence, Aria responds with her own phrase — built by walking a Markov bigram
  of the note transitions you just played. The response adapts to your tempo.
  The table grows across the session: early responses are loosely pentatonic;
  by the 5th call-and-response, Aria's phrasing reflects yours.
  **Why open this**: first prototype with a *dialogue* structure — it listens,
  waits, then speaks. Use the Demo button (no mic needed) to see the piano roll
  and hear a first response in ~5 seconds. Mic mode shows the live-tail on your
  notes and the Aria blue bars appearing as notes fire.

- **[/dream/166-kids-lantern](https://getresonance.vercel.app/dream/166-kids-lantern)**
  — Night Garden (kids, Cycle 194). Lantern reveals hidden pentatonic stars
  as you move. First kids prototype about exploration, not tapping.

- **[/dream/165-cymatics](https://getresonance.vercel.app/dream/165-cymatics)**
  — Cymatics (Cycle 193). Chladni plate standing-wave patterns. Recording-ID
  input drives mode from your actual piano recordings.

## In progress / partial

Nothing in-progress. All three recent cycles built cleanly to `demoable`.

## Research findings worth a look

- KIDS.md queue has been empty for 3 consecutive kids cycles (190, 192, 194).
  Cycle 196 (196%2=0) is the next kids cycle — I plan to do a kids-focused
  research sweep to refill the queue rather than build from first principles
  for a 4th consecutive time.
- Adult queue still has: `piano-roll` (live scrolling piano roll, natural sequel
  to Aria), `spectral-morph` (FFT resynthesis via AudioWorklet), `loop-station`
  extension ideas, and ~10 more.

## Open questions for Karel

- **Aria (167)**: The Markov table never resets in a session — Aria learns your
  style cumulatively. Want a "Forget" button to reset it for a fresh dialogue?
- **Aria (167)**: Demo mode plays a C-pentatonic phrase. Should it use one of
  your actual Paths recordings (`/api/audio/[id]`) as the "demo" input instead?
  That would show what Aria learns from your actual playing style.
- **Night Garden (166)**: Want multi-touch (two lanterns = two children)?
- **KIDS.md queue**: should I run a full research sweep on Cycle 196, or build
  another first-principles kids prototype?
