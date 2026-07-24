# Morning digest — last updated 2026-07-24 (cycle 893, DEEP)

## New since yesterday
- **[/dream/2558-khoomei](https://getresonance.vercel.app/dream/2558-khoomei)** — **one sustained note splits into two.** A droning fundamental plus a piercing whistle overtone you sweep up and down the harmonic ladder by hand — Tuvan throat singing (khoomei / sygyt), synthesized by a **real physical vocal tract**: a 1D **Kelly–Lochbaum digital waveguide** (44 tube sections, the model behind *Pink Trombone*) running in an AudioWorklet. Squeeze one movable constriction and its resonance isolates a single harmonic; slide it and the whistle climbs 5f0→6f0→7f0 over the steady drone. **No scale, no safety net** — f0 is continuous and a `detune` control drifts the overtone off-harmonic so it beats and clashes on purpose. Keyboard-first (←/→ sweep the overtone, ↑/↓ the drone, `,`/`.` detune-to-clash). SVG tract cross-section + a live FFT harmonic ladder so you *see* both pitches. *Why open it:* the lab's first synthesized throat — a voice you play by shaping a mouth, not by EQ-ing a buzz.
- **Auto-demo runs muted on load** — the constriction sweeps the ladder off the visual clock, so a still glance already shows the pinched tract + a glowing overtone. Sound starts on first key/click.

## Also explored this cycle (banked — see IDEAS §893)
- ⭐⭐ **2550-mouth** — *your typing grows a mouth*: the SAME physical tract, but each character you type sets a tongue/lip shape so it **speaks your words** as raw speech-like sound; un-quantized keystroke rhythm, an SVG "piano-roll of language." Highest concept; held back because intelligible typed speech is the hardest thing to get right unheard (headless).
- ⭐ **2554-trombone** — *play a throat by hand*: keyboard bends the tract vowel→growl→shriek→whisper with an LF-model glottis. The most playable, least surprising (it's essentially Pink Trombone) — plus a one-line type fix pending.

## Research finding worth a look
- 2026 speech synthesis is swinging back to **physical articulatory models** — arXiv:2606.04943 (June 2026) fits a *differentiable Kelly–Lochbaum waveguide* to real Tuvan biphonic singing. 2558-khoomei is the browser build of exactly that (no ML, plain Web Audio). The lab had vowel *filters* before; this is the first synthesized *tube*.

## Open questions for Karel
- 2558 needs your ear: does the overtone genuinely *split out* as a clean whistle, or read as a bright formant coloring several harmonics? (Headless-unverified — the physics is right; the acoustic quality wants your speakers.)
- I deliberately did NOT build a 3rd AI-musician piece this cycle (the jury asked to extend 2502-duel's negamax) — three of the last five ships were already AI/dissonance, and your "too similar" note is a hard gate. Went for a fresh technique instead. Push back if you'd rather I'd closed the negamax arc.
- Standing asks that need your go-ahead: an **AI-pipeline chain** (music→image→video) needs your FAL_KEY-budget OK; **cross-machine WebRTC** needs a desktop to review. Say the word.
