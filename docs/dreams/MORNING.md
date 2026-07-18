# Morning digest — last updated 2026-07-18 (cycle 816, WIDE)

**Open this first:** https://getresonance.vercel.app/dream/1928-choralis — press **Start singing** and **hum or sing one steady line**. The machine writes the other three voices under you in real time. (No mic / on the go? Hit **Play a demo** — it sings Ode to Joy through the same engine.)

## New since yesterday
- **`/dream/1928-choralis`** — **sing one bare line, hear a full four-part chorale grow under your voice.** Your voice becomes the *soprano*; a real **SATB voice-leading engine** writes alto/tenor/bass beneath it — picking a functional chord that contains your note, then leading the voices smoothly (leading tones rise, sevenths fall, no parallel fifths), cadencing and even modulating. Rendered as a gold-leaf-on-vellum **breathing score**. **Why open this:** it's the most *Resonance* idea in a while — your own musicianship in, a chorale out — and it's a real four-part harmony **search**, emphatically not a pentatonic pad. Sing a ii–V–I and hear it resolve like one.
- This was a **WIDE** cycle. The finer story: the last ~5 nights already fixed the jury's three grooves (no pentatonic, no violet, needs-a-human) — but they'd *all* become **pointer-on-glass instruments**, a new sameness no audit was catching. So tonight forced three *different* human inputs. **2 more explored** (IDEAS §816): ⭐⭐ **two-hands** (conduct a **V7♭9→I cadence in the air between your two hands**, webcam) + ⭐ **cadence-press** (**type a sentence** and its punctuation becomes the cadences — Constructivist red-ink type).

## Research finding worth a look
- **"AI Harmonizer" (NIME 2025 / arXiv:2506.18143)** — a bare sung melody → autonomous four-part harmony; the human gives one line, the machine gives the counterpoint. That's exactly tonight's build (yours does it rule-based, no ML, no network). (RESEARCH.md §816.)

## Honest caveats
- Headless container = **no mic / GPU / display / speakers**, so I type-checked and compiled but couldn't sing into it or hear it. Open questions your ears will settle: does the YIN pitch-tracker follow a *real* voice at usable latency, and do the three machine voices *sound* like a chorale vs. a slightly muddy pad (they're an additive pad, not a formant vowel synth)?

## Open questions for Karel
- **The pointer-instrument groove** was invisible to every audit I run until I looked one notch finer tonight — the lab keeps solving the *last* sameness and quietly forming the next. Worth me widening the input axis deliberately for a few cycles (voice / camera / MIDI / keyboard), the way I widened the harmony axis last week?
- **`two-hands` (webcam MediaPipe) lost only on a headless-demo risk** — I can't confirm the hand-tracking model loads from its CDN in the Vercel env, so a phone reviewer might see only the fallback. If you're up for a camera piece, I'll verify/bundle the model and ship it next.
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still 0× — the one genuinely-absent frontier — gated only on your go-ahead for a small paid per-prototype budget (rule #6). One yes unblocks it.
