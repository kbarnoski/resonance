# Morning digest — last updated 2026-09-30T~13:0xZ (cycle 1269)

> **Today the lab finally did inventory instead of manufacturing.** The concept jury has asked for this five verdicts running: *stop minting a sixth beautiful demo and finish the ones you already built.* This cycle shipped **ZERO new prototypes** and instead brought your whole camera backlog to a finished, verifiable state — **9 pieces promoted `wip` → `demoable`** — and fixed real production defects the QA gate found along the way. `18352-fluxweave` (yesterday's harmonize-with-your-hands piece) is still the newest thing to *play*; today is about the backlog behind it.

## New since yesterday
- **9 camera pieces promoted `wip` → `demoable`:** `limn` · `stillpoint` · `cantormap` · `aureole` · `fingerloom` · `formfold` · `breathtide-flow` · `mirrorfold` · `mudra`. Each now has a **labelled autonomous demo** that drives the *same* sound + visuals your hands/body would — so the piece is alive and provably-correct the instant it loads, with no camera. (Your live webcam feel is still the one thing only you can confirm — ~30 sec each, whenever you like. That's now a bonus, not a blocker.)
- **`mudra` got the real fix.** It's the piece you loved (♥), but it had shipped with *no* demo — open it with no camera and it just sat there. Now a labelled demo cycles the whole mudra vocabulary (open → lift → shimmer → quicken → widen → deepen → hold) through the exact gesture→sound chain, so you can see and hear what each sign does before you ever raise a hand. Open `/dream/17536-mudra`.
- **Real defects fixed, not just re-tagged.** The QA gate caught genuine gaps: `limn`, `stillpoint`, `mudra`, `mirrorfold` were all missing the fullscreen info-overlay (`ImmersiveHud`) you asked for — added to all four. `mirrorfold`'s status line was mis-formatted so the catalog couldn't read it — fixed.
- **Sharpened the QA tool.** Two of its checks were firing on *documentation that said "we don't do this"* (a README noting "no font-serif", a comment explaining it doesn't gate hips/ankles). Narrowed them to flag real code, not prose — verified they still catch the real thing.

## In progress / partial
- Nothing is `wip` in the camera backlog anymore — that's the headline. The lab is back to a clean slate for the next build.

## Research findings worth a look
- Confirmatory (this was an inventory cycle, not a research→build one): the browser-MediaPipe creative-coding norm is exactly what the lab standardised — every good hand-tracking demo ships an *idle attractor* that plays before and without any hand, so the piece is legible on load. That's the "labelled demo drive" pattern, and it's what makes a camera piece finishable headless.

## Open questions for Karel
1. **Anything in the promoted 9 feel off when you actually wave at it?** They're all correct headless; the only unknown is live feel. A quick "these track me, these don't" on any of them is gold.
2. **Score-follower — yes or no?** Offered seven times now; the jury says decide it or I should stop asking. Your recording follows *you* as you play/hum (onset/beat → tempo/section). It's phone-testable and self-verifying, but it's **not** camera-tracked, so I won't build it over your standing camera directive without your word.
3. **`origin/main` keeps getting force-updated** (~6 fires now) — your live composition/shader sessions rewriting head, I assume. My sync recovers safely (read-only), but flagging it in case it's unexpected.
