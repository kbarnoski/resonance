# Morning digest — last updated 2026-06-24 ~06:25 UTC (cycle 534, kids · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`897-kids-balance-band`** ⚖️🎵 (cycle 534, kids · WIDE, 1 of 3 shipped) — **a musical seesaw where a wrong note has weight.** Tap to hang singing creatures on a balance beam. A "spicy" creature (tritone / minor-2nd) is literally *heavier and grumpier* — the beam **tips over and STAYS tipped**, the chord buzzes sour, and **nothing fixes it for you.** The child earns the calm by hanging a friendly creature on the high side: the beam glides level and the sour voice blooms into a warm chord. *Why open it:* it's the **third** piece (after `868-monster-keys`, `849-star-bowl`) where a 4-year-old's wrong note *persists and matters* — the jury asked us to break the "no-wrong-notes" template "for good," and this makes dissonance a thing you can literally *feel tip a seesaw*. Touch-only, Canvas2D, runs on any phone.
  - **First-ever lab technique:** a 2D rigid-lever torque sim (mass × leverage → beam angle) wired straight to a consonance engine. And it's the **2nd straight cycle** to land the in-README dated-research citation (the floor rule that was 0-for-15) — anchored on developmental work showing 4–6 yos are *still learning* the consonant/dissonant category, so teaching it by consequence (not by hiding it) is the point.

## Also explored this cycle (banked, not shipped — see IDEAS §534)
- **`898-kids-echo-keeper`** ⭐ — *sing a stuck echo free.* A clash you sing into the cave gets STUCK looping in a tangled **SVG** knot until you sing the note that resolves it. Owns the lab's scarcest output lane (SVG). **Resurrect-first** for the next kids cycle.
- **`899-kids-candle-choir`** — *a clash blows out a candle.* It stays dark and silent (a real hole in the chord) until you relight it by tapping a candle a consonant interval away. WebGPU flames, Canvas2D fallback.

## In progress / partial
- Nothing blocked. The `888-living-reverie` long-form thread (cycle 1 of N) is paused on purpose — it needs a real new *capability* next, not a renderer swap (the trap the jury flagged on the `847/872` thread).

## Open questions for Karel
- We've now broken the no-wrong-notes kids template three times (`868`/`849`/`897`). Is the lesson landing — should kids pieces keep making dissonance a *consequence the child resolves*, or have we made the point and you want the calm/consonant register back for a bit?
- The audio-only lane (`894-room-raga`) and the SVG lane (`898`) keep getting benched for "can't glance them on a silent phone." Want me to just **ship one** next cycle anyway?

## Caveat
- Built + **compile/lint/type-clean**; NOT browser/ear-verified (no audio in the container). The seesaw *feel* and whether a 4-yo reads "tipping = sour, balanced = sweet" are unverified — the auto-demo guarantees it at least moves + sounds on load. Static-gen still blocked by the standing container fd limit (infra, not code); Vercel deploys normally.
