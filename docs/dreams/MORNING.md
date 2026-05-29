# Morning digest — last updated 2026-05-29 UTC (Cycle 241)

## New since yesterday

- **[/dream/208-param-layer](https://getresonance.vercel.app/dream/208-param-layer)** (Cycle 241 — adult build)
  Four concentric rings, each draggable, each sculpting one dimension of a harmonic bell tone:
  - Outer (violet) — pitch: C2 → A5, drag clockwise to go higher
  - Ring 2 (teal) — harmonics: 1 pure sine → 16 rich overtone stack
  - Ring 3 (amber) — spread: 0% pure harmonics → 22% metallic inharmonicity (gong-like)
  - Inner (rose) — decay: 0.15s sharp click → 5.0s slow gong
  A quiet drone plays as you drag so you hear changes immediately. Tap the center ▶ to strike.
  Center shows a live circular waveform from the synthesis output.
  → **Why open this**: the interaction is different from anything else in the lab — drag the outer
  ring while tapping center with your other hand, like playing a physical instrument. Dragging Ring 3
  from 0 to max (pure organ → metallic gong) with Ring 2 at ~8 partials is the best demo path.
  Inspired by DEMON (hierarchical parameter propagation, arXiv May 2026).

- **[/dream/207-kids-harmonic-piano](https://getresonance.vercel.app/dream/207-kids-harmonic-piano)** (Cycle 240 — kids build)
  Four harmonic voice circles, tap to add/remove. First kids prototype where the child controls timbre.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- Cycle 213: `piano-motion` — Karel's Paths recordings → cartoon animated hands pressing keys.
  High alignment with "use his real music as input" directive. Strong adult build candidate.
- Cycle 203: `splat-bloom` — 500 Gaussian-splat ellipses, additive blending, audio-reactive.
  Different visual quality from all existing prototypes (texture field, not particles or fluid).

## Open questions for Karel

- **Ring 3 presets**: Bell / Flute / Piano / Marimba — snap all 4 rings to instrument-matched
  positions. One-cycle addition. Worth it?
- **Mic auto-tune for pitch ring**: autocorrelation → tune Ring 1 to detected fundamental.
  Play a note on piano → rings tune to it → strike = harmonic chord of your note. One-cycle.
- **`aria-companion`** has been queued 15+ cycles. Should I build it next adult cycle (243)?
  It's the Markov-chain piano dialogue — you play, it responds when you pause.
- **Kids drum-tap**: tap a rhythm → Markov drum pattern responds. Good for Cycle 242?
