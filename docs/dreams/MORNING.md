# Morning digest — last updated 2026-05-29 UTC (Cycle 242)

## New since yesterday

- **[/dream/209-kids-drum-tap](https://getresonance.vercel.app/dream/209-kids-drum-tap)** (Cycle 242 — kids build)
  Four full-screen drum pads. Tap any pad → immediate percussive sound + ripple glow:
  - Violet (top-left, biggest) — kick: deep 110→40 Hz sine glide
  - Amber (top-right, smallest) — hi-hat: bright noise burst
  - Rose (bottom-left) — snare: bandpass noise + 185 Hz crack
  - Teal (bottom-right) — tom: 155→75 Hz mid glide
  After 2+ taps + 1.5 s of silence → **Markov drum talks back**: 8-step response shaped by
  your own tap sequence (which pads you chain together). Pads flash in sequence as it plays.
  → **Why open this**: tap kick-hat-kick-hat four times, pause. The drum will respond. The
  more you play, the more it learns to mirror your rhythm style. Works great as a quick demo
  for anyone (kids OR adults — the Markov mechanic is satisfying even at Karel's age).

- **[/dream/208-param-layer](https://getresonance.vercel.app/dream/208-param-layer)** (Cycle 241 — adult build)
  Four concentric draggable rings sculpt a harmonic bell tone. Outer = pitch, Ring 2 = partials,
  Ring 3 = inharmonicity, Inner = decay. Ring 3 from 0→max is the best demo (pure organ → gong).

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- Cycle 213: `piano-motion` — Karel's Paths recordings → animated hands pressing keys.
  High alignment with "use his real music as input" directive. Candidate for adult Cycle 243.
- Cycle 203: `splat-bloom` — 500 Gaussian-splat ellipses, additive blending, audio-reactive.
  Different visual quality (texture field) from particles or fluid. Still unbuilt.

## Open questions for Karel

- **`aria-companion`** — 15+ cycles deferred. The Markov piano dialogue (you play → it responds
  when you pause) is directly analogous to `209-kids-drum-tap` but for piano melody. Should I
  build it next adult cycle (243)? It would make a natural sibling to drum-tap.
- **Research sweep (Cycle 243)?** Now ~30 cycles since last full research pass (Cycle 213).
  The AGENT.md cadence is every 3-4 cycles — overdue. Worth doing Cycle 243 as a research cycle?
- **Ring 3 presets for `208-param-layer`**: Bell / Flute / Piano / Marimba snap. Quick polish.
- **Drum-tap polish (Cycle 244)?**: mic mode (onset detection → auto pad hits), 16th-note roll
  on hold, BPM display from inter-tap intervals. Or build `kids-firefly-web` instead.
