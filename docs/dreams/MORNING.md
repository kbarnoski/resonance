# Morning digest — last updated 2026-06-24 ~04:30 UTC (cycle 533, adult · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`896-tonnetz-loom`** 🎵🪡 (cycle 533, adult · WIDE, 1 of 3 shipped) — **walk the geometry of harmony.** The Tonnetz (Euler's triangular pitch lattice) as crisp glowing **SVG**: tap a triangle to hear its triad in **just intonation**; the **P / L / R** neo-Riemannian buttons glide exactly one voice at a time, so you *hear and see* smooth voice-leading as the highlight hops the lattice. Your path weaves a ribbon you can **export as `.svg`**. A drift auto-walk means it's already sounding + moving when you open it — no input needed. *Why open it:* harmony rendered as a navigable space — a genuinely new "huh, we can do that?" Touch-only, works offline.
  - This is the build that finally lands the **dated-research-citation in the README** (criterion #5, which the jury said was 0-for-15): it's anchored on a **June-2026** arXiv Tonnetz paper found in this cycle's research dive.
  - Deliberately **non-GPU / SVG** — the directest answer to the jury's #1 ask ("WebGL2 is the new monoculture, go non-WebGL2 for a week").

## In progress / partial
- Nothing blocked. The `888-living-reverie` long-form thread (cycle 1 of N) is paused on purpose — its banked twins are renderer-swaps, and I don't want to fall into the "deepen = re-render" trap the jury flagged. It needs a real new *capability* next, in a dedicated DEEP cycle.

## Also explored this cycle (banked, not shipped — see IDEAS §533)
- **`894-room-raga`** ⭐ — *the room tunes the instrument.* Mic listens to your space's ambient pitch and grows a just-intonation drone up from it; long-form, evolving. Owns the lab's single thinnest lane (audio-only, 0×). **Resurrect-first** for an audio-only cycle. (Banked only because an audio-led piece is hard to read on a silent morning phone glance.)
- **`895-recurrence-room`** — *see the shape of a song.* A self-similarity matrix of your Welcome Home piano; off-diagonal stripes = the repeats; click a cell to A/B-loop two similar moments. Banked lower — it overlaps the existing `777-song-architecture`.

## Open questions for Karel
- The audio-only lane (`894`) keeps getting built and benched for "can't glance it on a silent phone." Want me to just **ship one audio-only piece** next cycle anyway (you'd play it with sound), or keep prioritizing glanceable visuals?
- Criterion #5 (dated research citation in the README) is finally hit this cycle. Worth keeping as a floor rule, or retire it now that the chain is habit?

## Caveat
- Built + **compile/lint/type-clean**; not browser/ear-verified (no audio in the container). The JI triad timbre and P/L/R glide *feel* are unverified — the auto-walk guarantees it at least sounds + moves on load. Static-gen still blocked by the standing container fd limit (infra, not code); Vercel deploys normally.
