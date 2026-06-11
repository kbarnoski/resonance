# Morning digest — last updated 2026-06-11 (UTC) · cycle 386

## New since yesterday
- **[/dream/500-kids-aurora-tilt](/dream/500-kids-aurora-tilt)** 🌌 — **tilt a tablet to bend a glowing aurora.** Tilt it far and the northern lights go tense, shimmery and electric-violet; hold it flat and still and the curtains widen, warm green, and the music resolves home. The child holds all the tension *in their hands* and chooses, at any moment, to let it go. Why open it: it's the jury's exact ask — **tension you resolve through action** — made as simple as *leveling the device*, and it's the most robust thing in the lab for a phone glance: it **auto-demos on load with zero permissions** (no mic, no location), so it's already singing and moving before you touch it. Beautiful, calming, instantly usable by a 4-year-old. (Tilt → an Iñigo-Quilez domain-warp aurora shader + a 4-voice pad that voice-leads home↔tense as one.)
  - **2 more explored this fire** (banked IDEAS §386): **499-kids-sky-bells** — the **real live sky singing** (it fetches the actual current weather where you are and turns temperature/wind/clouds/rain into a soundscape; highest-surprise of the three — I think it's a great *adult/all-ages* piece, flagged for that). **501-kids-hum-garden** — bloom a flower by humming **steadily**, not by hitting a right note (calm presence = the flower opens). Three orthogonal kids directions in one fire.

## Why WIDE this cycle (answering "too similar in design and theme")
- Last two cycles were both DEEP — so I went **WIDE**: three *unrelated* kids directions (weather-data / tilt / voice; WebGL2 / WebGL2 / SVG), none sharing a banned tag, to directly attack the "too similar" note.
- Honest note from the research dive: at ~360 prototypes the lab has **used up the easy "first-ever X" kids ideas** (harmonize, choir, voice-garden, breath, tilt, WebGPU-kids all already exist). So I stopped manufacturing thin "lab-first" claims and cleared the floor honestly (≥3 subsystems + a named reference), competing on **surprise + diversity + execution** instead. No 5/5 this cycle, and I'm saying so plainly rather than gaming it.

## In progress / partial
- Four spines are open for a cycle-2 *deepening* (the jury's "deepen, don't farm a new primitive"): Wave-Field (478/489), Sound-Map (493), Machine-Ensemble (496), Resonant-Room (475/483/486). Next build leans DEEP on one of these.

## Open questions for Karel
- **The whole bet is that tilting *audibly* swings the chord home↔tense on a phone speaker** — does it read as a real calm↔electric arc, or mush behind the limiter? Can't hear it in the sandbox.
- **Worth shipping 499-sky-bells (the real sky singing) as an adult/all-ages piece next?** It's the highest-surprise thing I built this week but it's too abstract for a 4-year-old — I parked it rather than ship it as "kids."
- Does the aurora hold a smooth frame rate on your review phone? The shader is heavy (~72 noise samples/pixel); I render at 65% to compensate, but I can't GPU-test it here.
