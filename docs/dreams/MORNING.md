# Morning digest — last updated 2026-09-22T13:12Z (cycle 1254)

> **The non-embodied lane keeps deepening — this one is the sky's clock over *you*.** After `tremor` (earthquakes), `strand` (a take remembering itself) and `overhead` (the ISS overhead), I shipped `firmament`: where the **sun and moon sit above your horizon right now** conducts one of your real takes — it sounds like daylight where you are and slowly turns to a night-voice as the sun sets, with a silver moon-line fading in when the moon is up. No camera, no second person; it proves itself before you tap Begin.

> **Heads-up — a fresh jury verdict landed while I was building this** (`docs/dreams/JURY.md`, 2026-09-22): it applauds the non-embodied lane (now four pieces deep) but warns it's "camping one temperature" — quakes, the ISS, now the sky's clock are all *planetary/cosmic*. Its steer for the **next** feed: point it at **something human-scale**, not the sky. `firmament` was already decided + built on yesterday's explicit "resurrect this next" call, so it ships — but I've queued the human pivot for next cycle (see below).

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[17760-firmament](https://getresonance.vercel.app/dream/17760-firmament)** — **the sky's own clock conducts your piano.** Minimal SVG on ink: a graded sky band, an arcing sun disc, a phase-correct silver moon, stars fading in at dusk. Sun altitude crossfades a bright *day-voice* into an octave-down, reverb-wet *night-voice*; a quiet octave-up *moon overlay* fades in only on real nighttime moon-up, scaled by how full the moon actually is. **Why open this:** it's the calmest, most personal of the sky pieces — it's *your* location's day and night — and the default-on "demo day" sweeps a full 24 hours in ~90 seconds, so the whole sunrise→dusk→moonrise morph plays out at a glance on a cold muted phone.

## In progress / partial
- **`17760-firmament` is `demoable`** and self-verifying: the primary layer is pure computed astronomy (correct with geolocation denied and the network blocked), and the demo-day sweep runs on mount before you press Begin — so the sun visibly arcs and the moon rises within a second or two. The only network-dependent bit is the *optional* open-meteo cloud/wind veil, which fails safe to "clear (offline)"; the one thing to confirm from a real tap is whether that live veil resolves from the deployed origin (it's a soft layer either way).
- **Built this via DEEP ×2 — two visual takes on the same idea; the runner-up is banked** (IDEAS §1254): `daybook`, the same sonification on a minimal **Ikeda-style 24-hour day-band timeline** (sun/moon markers marching left→right). I shipped the sky-dome because SVG is the freshest look in the lab and the dome reads more emotionally; `daybook`'s marching-marker legibility and its lovely reference — **John Luther Adams' *The Place Where You Go to Listen*** — are worth folding into the next sky piece.

## Research worth a look
- **The real design question for these sky pieces isn't "what feed?" — it's "how do you map several signals onto one recording without mud?"** The answer (Erie, a declarative sonification grammar, arXiv 2402.00156) is to keep each data signal on its *own* channel. So firmament splits into three independent channels — sun-altitude → timbre, moon-phase → a separate overlay, cloud → a veil — instead of one collapsed knob. That's a cleaner architecture I'll reuse for the next feeds.

## Open questions for you
- **Does `firmament` land — does any of these earn your first tap since `hall`?** Four non-embodied pieces now, votes still flat across the whole 17xxx run. That's the one thing I can't resolve myself: if one lands, the "world as the score" family is confirmed; if they all stay flat, the lane builds well but isn't reaching you, and I need a different kind of provocation.
- **Next feed = human-scale, per today's jury.** Instead of another sky signal I'm queuing something at human range — a transit/arrivals feed, live language/word-usage trends, a city's rhythm, or a two-body "sea + sky" tide piece as the bridge. If you have a feed you'd actually want your piano to sing about, name it and I'll build that instead.
- **Still treating camera-conducting as closed** unless you re-open it — say the word either way.
