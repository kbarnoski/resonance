**For**: kids (4+)

# Two Suns

## The one question
**What if a 4-year-old could play with TWO musical worlds at the same time — hear two different keys ringing AT ONCE — and feel the bittersweet, beautiful tension of the place where they overlap?**

Two glowing suns float in a dusk sky. Each sun is humming its own little song in its own key, *at the same time*. The child's whole job is to slide them around with their fingers — and discover the strange, sweet shimmer that appears when the two worlds touch.

## How to play (no words needed)
- Tap anywhere once to wake the suns up. (Browsers need one tap before sound can start.)
- One sun is **warm and gold**. The other is **cool and violet**. Each one sings on its own.
- **Drag a sun** with your finger. Slide it left and you hear it move to your left ear; slide it right and it moves to your right.
- **Drag the two suns apart** and you hear two clear, separate songs — one in each ear.
- **Push the two suns together** and their light blooms into a soft glowing halo while both songs ring thickly through each other — a beautiful, slightly aching cloud of sound that can't quite make up its mind.
- Two hands work at once: a grown-up and a child can each hold a sun. Pull them apart, push them together, find the spot you like, and leave them there.
- Let go and walk away — the suns drift slowly on their own, so the sky is always alive.

There is **no wrong move and nothing to win.** Wherever you leave the suns is exactly right.

## What's actually going on (for the grown-ups)
This is a toy about **polytonality / bitonality** — two tonal centers sounding *simultaneously* with no plan to merge.

- **Sun A** sings a slow arpeggio in **C major** (warm, gold, low-leaning).
- **Sun B** sings a slow arpeggio in **A major** (cool, violet, brighter).

### Named reference
The lineage here is **Igor Stravinsky's *Petrushka* chord** — C major and F♯ major superimposed, two keys a tritone apart grinding against each other — and **Darius Milhaud's bitonal études** (e.g. *Saudades do Brasil*, *Études*), which lay two distant keys over one another as a deliberate, playable color rather than a mistake to be corrected.

### The key pairing we chose, and why
We use **C major + A major** (centers a major third apart) instead of the Petrushka tritone (C + F♯).

- The Petrushka pairing is *thrilling* but spiky — two truly distant worlds. Wonderful for a concert hall; a bit much for a sleeping-toddler bar.
- C + A is **gentler but still genuinely ambiguous**: the two keys share an **E** (it lives in both), which keeps the blend from ever sounding "wrong," while the **C natural rubbing against A major's C♯** keeps it from ever fully settling into one home key. So the overlap is sweet *and* unresolved — bittersweet, not broken.
- That shared-pitch-with-a-rub quality is exactly the dwellable middle the brief asks for: a child can park the suns half-overlapped and sit inside the ambiguity for as long as they like.

### Why polytonality is a different tension than the lab's usual pieces
Most of the lab's instruments are built to **resolve on purpose** — tension builds, then a satisfying landing arrives (a cadence, a downbeat, a chord that "answers"). Polytonality offers a different feeling entirely: **there is no landing, because two homes are true at once.** The tension doesn't resolve — you *live in it* and shape it by hand. The eclipse isn't a climax that releases; it's a place you visit and leave whenever you want. That's the gift here for a 4-year-old: the unresolvable middle is the toy, not a problem to solve.

## Under the hood
- **Sound:** Web Audio API. Two independent voices (sine + quiet triangle octave, long soft attack — no transients, no high ringing), each panned by its sun's horizontal screen position (`StereoPannerNode`) and routed through a gentle low-pass + soft limiter so two worlds together never spike. As the suns approach, each voice's arpeggio gets *denser* (notes closer in time), thickening the bitonal cluster. It never auto-resolves — it rests wherever it's left.
- **Visuals:** raw **WebGL2** full-screen fragment shader (no three.js). Two radial light fields, one tinted per world, blended additively over a dusk sky, with a soft white-gold corona bloom where they overlap and a faint shimmer ring at the seam. An audio-energy uniform pulses the glow with the music. Falls back to Canvas2D radial gradients (with a visible notice) if WebGL2 is unavailable.

## Tags
- input = touch (multi)
- output = WebGL2-shader
- technique = polytonality / bitonality
- vibe = bittersweet-cosmic
