# Morning digest — last updated 2026-06-11 (UTC) · cycle 394

## ▶ Open this first
**[/dream/524-kids-hand-firebird](https://getresonance.vercel.app/dream/524-kids-hand-firebird)** — **Hand Firebird** 🔥🕊 (kids 4+)
Hold up your hand to the camera and it becomes a **glowing firebird of light** — about 2000 GPU particles gather around your fingers. **Open your hand and it blooms wide and sings; close it and it gathers into a quiet ember.** Raise your hand for a higher note. It's pure cause-and-effect a 4-year-old finds in one second — a creature that's *theirs*, with agency and delight.

This is the lab's **first MediaPipe Hands** (real 21-point hand-tracking in the browser — we'd used body *Pose* once at 493, but never the hands model), driving a **raw WebGL2** particle creature. I picked the firebird over its two siblings because it's the **biggest swing** (a real GPU particle being, not a flat drawing), it extends your **loved particle pieces** (130 / 236 / 262 ❤️), and WebGL2 was the *scarcest* renderer in the recent window — so it diversifies instead of repeating.
*(A scripted virtual hand makes it bloom and sing on load before you grant the camera, and a Canvas2D glow fallback covers phones with no WebGL2 — so even a hands-free glance shows a singing creature. iPads have WebGL2, so the full firebird should run there.)*

## Why this swung joyful (a diversity call worth seeing)
The last two **kids** cycles (513 shadow-still, 518 living-ember) were both *hushed, contemplative single-presences that never resolve* — and across the whole lab that "one lonely presence, never resolves" vibe just hit **4× in the last 10** (520/518/514/513). Beautiful, but a third in a row would be the exact monoculture the jury keeps warning about. So this kids cycle deliberately went the **opposite temperature**: loud, joyful, embodied, immediate — a creature you bring to life with your fingers. A 4-year-old wants agency, not a meditation.

## 2 more explored this fire (banked — see IDEAS §394)
Same "your hand becomes a singing creature" concept, three renderers:
- **523-kids-hand-puppet** (Canvas2D) — your hand is a warm **shadow-puppet dog**; thumb = jaw, open mouth = sings. The **most legibly-a-creature for a literal 4yo** ("it's a puppy!") and the most robust on any device. Lost only because Canvas2D was already over-used this window.
- **525-kids-hand-choir** (SVG) — each **fingertip is its own tiny singer**; spread your fingers into a 5-part chord, close them into a unison hug. The cleverest idea (open-chord ↔ unison is a real harmony lesson in the hand). Lost on renderer-diversity + a minor 60fps perf flag.

## Honest caveats
- Build-verified (compiles clean, 6.09 kB static), **not browser-verified.** The MediaPipe-Hands + WebGL2 pipeline has **never run on a real device** — first-run model-load / WebGL2 quirks are possible (the Canvas2D fallback + on-load virtual-hand demo fully cover that). The openness heuristic is tuned for an adult hand; a small child's hand may need a threshold tweak.
- **#5 not claimed** again — this week's cs.SD is all server-side ML, nothing client-portable (a stable, repeated read). The freshness here is "MediaPipe Hands is now genuinely browser-ready," not a bound <14-day paper.

## Open question for you
For **524's** cycle-2, what's most interesting: (a) **two-hand mode** — two firebirds duetting, one per child; (b) **pinch gestures** as a distinct "spark/pluck" verb on top of open/close; or (c) push the particle count to 10k+ via GPU transform-feedback for a denser, more painterly creature? And separately — was swinging the kids lane back to *joyful/embodied* the right call after two contemplative ones, or do you want more of the quiet 513/518 register?
