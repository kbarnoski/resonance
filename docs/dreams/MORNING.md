# Morning digest — last updated 2026-06-23 (cycle 529, adult · WIDE)

> **Your jury's #5 (0-for-15!):** *"Criterion #5 [cite a dated RESEARCH finding in the prototype's own README] is never hit — fix it or retire it. A floor rule that's never hit isn't a floor; it's decoration."* This adult build is the fix: its README cites a **Jan-2026 arXiv paper**, the chain landed. (#1: raw WebGL2 is now banned a week — today's three explorers were SVG / Canvas2D / audio-only, all 0–2× scarce.) See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/883-tension-string](/dream/883-tension-string)** — **Tension String.** A string you can *dig into*: pluck it **softly** and it's a gentle harp; pluck it **HARD** and the pitch **bends sharp**, the overtones bloom **inharmonic**, then it glides back into tune. **Why open it:** every other plucked string in the lab holds a constant pitch no matter how hard you hit it — this is the first one where **dynamics change the pitch and timbre**, like a real instrument. It's a hand-written nonlinear Karplus-Strong (the delay loop shortens as its own energy rises → sharper pitch; a tanh saturation blooms the partials), grounded in **arXiv 2601.10453 (Jan 2026)** and cited in its README. **For your 06:30 glance:** tap **Play** and a ghost hand plucks alternating **soft / HARD** within ~2s — you hear the bend hands-free, on any speaker, zero hardware. Play it yourself with the on-screen soft·HARD buttons, the `a s d f g h` keys (hold longer = harder), or a MIDI keyboard (velocity = force). A live **pluck-strength bar** shows the dynamic that drove the bend.

## How this cycle was run
- **ADULT night, WIDE mode** — 3 orthogonal explorers, all **non-WebGL2** (your jury #1 ban), spread across **SVG / Canvas2D / audio-only**; curated 1.
- **Research→build chain (your #5, finally landed in a README):** the lab's strings are all *linear* (constant pitch); the dive found the *nonlinear* string (tension-modulation) in a **Jan-2026** paper → ported it to a Web-Audio worklet. RESEARCH §529.
- **Diversity:** banned raw-WebGL2 (jury #1, the new 6-of-15 wall) + three.js (4× threshold) + a 3rd back-to-back data-sonification → picked Canvas2D (scarce/re-legitimized) + thin MIDI input + a lab-first nonlinear-string technique.

## Banked explorers (see IDEAS §529) — both built complete + clean
- `882-vector-score` ⭐ — an autonomous, long-form **SVG** score that *composes and draws itself* over 5+ min (Markov memory + circle-of-fifths walk; Export-SVG), à la Xenakis's UPIC. De-selected on diversity (883 lands #5), not quality — near-shippable; resurrect on a calm autonomous night.
- `884-voice-orbit` — eyes-closed, **audio-only**: hum and your voice orbits your head as a binaural choir (HRTF; Oliveros *Deep Listening*). De-selected because the spatial effect **needs headphones** — it can't show its thesis on a phone speaker at 06:30. Resurrect in a headphone context.

## Open questions for Karel
- **Honesty:** `883` is compile/type/lint-clean but the container has no audio, so it's **not ear-verified** — worth a listen on real speakers to confirm the soft-vs-HARD pitch-bend reads as unmistakable (it should glide ~6 semitones sharp on a full pluck, ~0.5 on a soft one).
- Your jury's **#2** (the 847/872 feedback-Lorenz thread needs a real *capability* in cycle 4 — record/export the drone, or a second system that *listens* — or formally close it) is still open. It's an adult ask; want me to take it next adult night (531), or close the thread?
- The nonlinear-string worklet is a reusable primitive. Want a long-form piece where the strings **detune and retune themselves** over minutes, or a bowed/struck variant?
