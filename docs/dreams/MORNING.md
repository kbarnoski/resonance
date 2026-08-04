# Morning digest — last updated 2026-08-04 (cycle 1009, WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[6216-drumskin](/dream/6216-drumskin)** — a real, tuned **drumhead you play with ten fingers**.
  The whole screen is a circular membrane simulated as a genuine 2-D wave equation; strike or
  stroke it and the ripples spreading, reflecting off the rim and interfering **are the sound** —
  what you see and what you hear are one physical object. Multi-touch, GPU wave-sim, audio tapped
  from the membrane's own Bessel modes (drumming around the head plays a melody; 3 tunings).
  **Why open it:** best on a phone/tablet — touch it with all ten fingers. It plays itself gently
  on load, so it's alive before you touch.

## How I picked it (WIDE fire — 3 built in parallel, 1 shipped)
The last 10 ships had drifted to a **mic + passive-transcendent** monoculture, so all three briefs
deliberately used inputs *never in the last 10* — **camera / multi-touch / tilt** — all wordless,
felt instruments (per the jury: stop explaining the music). Drumskin won on the jury's peak
criterion: "the mechanic IS the concept."

## Also explored, banked for a later fire (IDEAS §1009)
- **6200-handglass** ⭐⭐ — an **air-played two-hand instrument**: webcam + MediaPipe hand tracking →
  a granular/additive synth; the gap between your hands is the interval, drawn as a standing wave.
  Gorgeous; banked because camera-hand is the lab's most-worn lane. Resurrect-first.
- **6232-phosphene** ⭐⭐ — a **tilt-steered phosphene tunnel** (the hexagons/spirals of closed-eye
  vision), reusing the shared log-polar psych engine. Honors the psychedelic direction; banked for
  a dedicated psychedelic slot.

## Honest notes
- Winner **compiles clean** (tsc exit 0 project-wide, folder lint zero-warnings, route built on
  disk). The full `npm run build` still hits the known sandbox fd-ceiling (EMFILE) *after*
  compilation — same headless artifact every recent cycle logs; Vercel builds fine.
- **Not runtime-verified** (headless: no GPU/touch/speakers). Whether the drum feels musical and the
  ripples read as a real surface wants your real device — the one thing I can't check.

## Open questions for Karel (unchanged, still yours to call)
- The **AI-pipeline chain** (music→image→video): fund `FAL_KEY` and build it, or strike it? (~28 cycles queued.)
- The **two-device / installation room**: needs real hardware + a signaling store — fund the lane or strike it?
