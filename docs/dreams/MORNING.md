# Morning digest — last updated 2026-06-06 (UTC), cycle 329 (adult · WIDE)

## ☀️ Open this first
- **[/dream/353-collapse-score](https://getresonance.vercel.app/dream/353-collapse-score)** — **music that composes itself in front of you, by Wave Function Collapse** (the lab's first WFC piece). An 8×16 grid of notes starts blurry and undecided; the solver picks the most-constrained cell, snaps it to a note, and the harmonic rules **ripple outward** to its neighbours — and you *watch it happen* while a playhead sounds each note as it's written. Auto-plays on load, full payoff in ~10 seconds, never the same twice ("New Seed" / deterministic "Replay").
  - *Why this one:* it's the most direct answer to your **"make the music legible, not another glowing cloud"** note — composition as a *visible logical process*. You can watch a cell decide and understand why its neighbours light up. No mic, no his-recording, no nebula. A grep-verified lab-first technique (Gumin's WFC, 2016).

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **351-erosion** — a tape that physically *wears out*, more ruined every morning, until it's gone (Basinski's *Disintegration Loops*). Build-clean, lab-first, pure DOM/CSS. *See the open question — it keeps almost-winning.*
- **352-breath-tide** — a near-screenless drone you play with your **breath**, that hears you breathing and gently guides you toward the 0.1 Hz "resonance breathing" calm. The ready answer to your **"build a second non-screen piece"** note — queued to ship next adult cycle.

## How this was made (the studio choreography)
- **WIDE fan-out** (alternating off last fire's DEEP): three *unrelated* adult directions built by **three parallel builders**, shipped the strongest, banked the other two. One commit.
- Grep killed three weaker ideas before briefing — MIDI, Tonnetz, Reich-phasing are all **already in the lab** — keeping the slate genuinely fresh. All three used DOM/CSS or audio-only, **cooling** the over-used SVG (4×) / WebGL (3×) renderers.

## Open question for you
- **351-erosion is now triple-banked and ready, but keeps losing curation** for one structural reason: its whole hook (more ruined *each morning*) is **invisible on a first open** — you'd see a pristine tape today, and the magic only appears if you come back tomorrow. That's a real handicap in a lab judged fresh each cycle. Want me to **(a)** just ship it next adult cycle unconditionally (the morning-vs-decay tension *is* the point), **(b)** reframe it to open already-half-eroded with a "rewind to new" control, or **(c)** leave it banked? It's a genuinely good piece stuck in a blind spot — your call unblocks it.
- (Carried) **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word and I build it.

## Caveats
- `353` is **build-verified, not browser-verified** — audio tuning, iOS AudioContext unlock, and whether the WFC output sounds *purposeful* over a long listen are unconfirmed without a real device.
- **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware — worth a pass before the next big WebGPU build.
