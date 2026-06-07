# Morning digest — last updated 2026-06-07 (UTC), cycle 338 (kids · DEEP)

> Even cycle → **kids**. I built the lab's **first self-organized-criticality** toy. It's the "chain reaction" idea done with real physics: tap a glowing pod, it fills, and at the brim it **bursts** — flinging light to its neighbours, which can burst too. Most taps shimmer. Once in a while, one tap sets off a **whole-screen avalanche** — and that unpredictable cascade *is* the melody. The surprise is the toy.

## ☀️ Open this first
- **[/dream/377-kids-cascade-bloom](https://getresonance.vercel.app/dream/377-kids-cascade-bloom)** — press the big glowing ▶, then **tap anywhere**. Pods fill amber→gold; a full pod bursts and rings a D-Dorian note, sometimes triggering a bloom that sweeps the screen. No reading, no fail, big tap targets — and it **blooms by itself** if a 4-year-old just watches (attract mode after 4s).
  - *Why this one:* it's the **Abelian sandpile** (Bak–Tang–Wiesenfeld 1987) — the canonical model of *self-organized criticality*, where tiny inputs occasionally produce huge cascades on a power law. New technique class for the lab, and it feeds the **legible/instructional** lane you've liked (358, 353): you literally *watch the avalanche propagate*. Raw WebGL2, built from scratch.

## Also explored this fire (2 more — banked in IDEAS §338, both build-clean, both folded into 377's next cycle)
- **378-kids-quake-meadow** — the same idea as a **three.js 3-D meadow that bulges and quakes** (Olami–Feder–Christensen earthquake model — the *truest* descendant of the research paper). The most beautiful one; lost only because edge-taps can miss on the tilted terrain (breaks the 4yo "every tap responds" rule).
- **379-kids-domino-forest** — glowing stalks you grow until they **topple like dominoes** across a twilight forest, the cascade panning left→right in stereo. The most physically-intuitive; same tap-target caveat.

## How this was made (the studio choreography)
- **DEEP fan-out:** one ambitious concept (SOC cascades as a kids instrument), **three different avalanche models** (sandpile / earthquake / dominoes), each built by a parallel maker. I read the actual code, ran a 3-up diagnostic build, picked the winner on the **kids reliability bar** (flat grid = every tap lands), fixed a lint error + a hallucinated paper-author, then ran the authoritative winner-only build (**exit 0**). One commit.
- Research → build: the dive (*Echoes of the Land*, arXiv:2507.14947) → port SOC to a kids toy → ship. (RESEARCH §338.)

## Open questions for you
- **Deepen 377 or leave it?** I have a clean path to fold the losers' best bits in: an alternate **3-D terrain mode** (from 378), a **ground-thump + aftershock phrasing** so a big bloom sounds like a phrase not a wash (378), and **stereo pan** so a cascade audibly travels (379). Want that, or move on?
- **Next adult (odd) cycle:** the jury keeps asking me to actually *deepen* a thread instead of opening new ones — I'll ship **Mirror-Canon cycle-2** unless you'd rather I advance the Accompanist (375) or Tonnetz (359). Pick one.

## Caveats
- `377` is **build-verified, not browser-verified** (no GPU/audio here). The avalanche pacing (`TOPPLES_PER_FRAME=12`) and the R32F flash-texture path are reasoned, not measured on a real tablet — likely small tunes. Clean fast-forward sync this fire, no force-push, scope clean (only `377` + docs).
