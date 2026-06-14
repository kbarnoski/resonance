# Morning digest — last updated 2026-06-14 (UTC), cycle 426

## New since yesterday
- **`609-kids-blow-parade`** → https://getresonance.vercel.app/dream/609-kids-blow-parade
  **Blow a raspberry, pop a balloon.** A 4-year-old **blows into the mic** and a parade
  of googly balloon-creatures puffs up bigger and bigger — then when they stop, it rips
  a **whoopee-cushion raspberry** and zooms off tumbling. Loud, silly, giggly.
  *Why open it:* it's the jury's literal ask, kid-safe — a **full WebGPU spectacle**
  (provocation #2 has begged for the renderer revival), driven by **breath** (not a
  fingertip), in the funny register 603 opened last kids cycle. No mic? Hold the 💨
  button or press Space — and it demos itself (a ghost blow) if you just watch.

## How it was made (the studio choreography)
- Kids · **WIDE** fire (the jury verdict was overwhelmingly ban-combos + "build with
  edges" → go wide with fresh tags, not deep). Three orthogonal funny/off-Canvas2D/
  non-fingertip explorers in parallel, I shipped 1:
  - **609 (shipped):** mic-**BLOW** → **WGSL/WebGPU** balloon raspberry parade.
  - **610-kids-stomp-band** (banked, IDEAS §426): shake/stomp → **three.js** cartoon
    junk-pile foley. Lost — three.js is the relocated monoculture, not the spectacle.
  - **611-kids-face-monster** (banked): silly faces → a **WebGL2** googly monster that
    roars/boings/giggles. The most novel idea (first comedic face-puppet) — but the
    MediaPipe-from-CDN load is the riskiest "just works at 06:30" surface, and camera
    was already 3× this window. Worth reviving once the camera tag cools.
- Every standing jury ban dodged: off Canvas2D (WGSL), off touch (breath), off cozy
  (a raspberry is not a warm drone).

## Honest notes
- **Build-verified, not browser-verified** (no mic/GPU/audio in the sandbox). The
  blow-vs-voice gate (it ignores yells, listens for breath via spectral flatness) and
  the raspberry timbre are coded to spec but **heuristically tuned** — a noisy room or
  far mic may need a harder puff. The Canvas2D fallback + ghost-blow auto-demo mean it
  puffs and pops on a silent glance with no hardware.
- Ambition honest **2/5** (#2 five subsystems + #3 named refs: whoopee-cushion foley /
  balloon physics / Toca Boca). **#1 NOT claimed** — `95-kids-breath-bubbles` already
  did blow-via-loudness, so this is a refinement (a blow-vs-voice discriminator), not a
  first; said plainly. The enabling fact: **Safari 26 put WebGPU on the iPad** (Sept
  2025), so a WGSL kids toy is now an iPad-native path, not a desktop flex.

## Open questions for Karel
- **Next (cycle 427, adult):** warmth is the new pentatonic (9 of 15 cozy). Keep
  swinging to edges — ship `589-still-bloom` (off-glass stillness, so 576 isn't an
  embodied-spatial singleton) or `590-star-atlas` (aim the phone at the real sky)?
- **Or deepen the his-piano decomposition spine** (the two 4/5 adults both came from
  that vein): ship `607-piano-prism` (NMF, 6 learned voices) / `608-piano-sieve` (SMS)
  standalone, or fuse them into one disassembly bench? Your call sets the adult arc.
