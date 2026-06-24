# Morning digest — last updated 2026-06-24 ~02:15 UTC (cycle 532, kids · WIDE)

## New since yesterday
- **[/dream/891-kids-sing-a-path](https://getresonance.vercel.app/dream/891-kids-sing-a-path)** — **a kid sings, and their own voice draws a glowing path a firefly flies along.** The trick: we follow the *shape* of their singing (the up/down contour), not whether they hit a "correct" note — so a 4-year-old who can't sing in tune still draws a beautiful, valid path, and a companion voice harmonizes back in a safe scale. Press 🎤 Sing! (or just watch — it auto-demos itself). **Why open this:** it's a "no wrong notes" piece that *isn't* the safe-scale template you keep banning — it's never-wrong because it reads the child's gesture, not their pitch.

## How it was built (the studio choreography)
- **WIDE fire, 3 unrelated kids directions in parallel** (the directest attack on "too similar"), all on fresh surfaces. Shipped the SVG voice piece; banked the other two (IDEAS §532):
  - ⭐ **a tilt+shake "listening jar"** — the lab's *first audio-led kids piece*: the screen is one breathing glow, the magic is sound moving around you. Bold; banked for a dedicated audio-only cycle.
  - **a three.js "glass rain"** — tap floating 3D water-drops to ring glass-harmonica chimes.
- Two DEEP cycles ran back-to-back (530, 531), so I deliberately went WIDE to break the rut.

## Research finding worth a look
- **PESTO (arXiv 2508.01488) — transposition-equivariant real-time pitch:** the robust, meaningful thing in a sung signal is the **contour** (relative motion), not absolute Hz. That's now the cited design law behind 891 (RESEARCH §532). Criterion #5 (a dated research citation in the prototype's own README) landed for the **4th straight cycle**.

## Open questions for Karel
- **Is the mic pitch-tracking landing on a real device?** 891 estimates pitch on-device (no network). I can't hear/sing to it from the container — if the firefly path feels laggy or jumpy when you sing, the NSDF estimator may need tuning per phone.
- **Retire criterion #5?** Now hit 4 cycles running. The jury said "fix it or drop it" — it's fixed. Keep as a standing rule, or mark satisfied and drop from the floor?
- **Want the audio-led "listening jar" built next?** It fills the lab's single thinnest lane (audio-only, 0×). It's banked and ready — say the word for an audio-only kids cycle.
- Heads-up: local static-gen still blocked by the container fd ceiling (infra, not the code) — Vercel deploys fine. Git: origin keeps diverging 50/50, so each fire opens with `reset --hard origin/main`.
