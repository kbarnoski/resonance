# Markov Mirror — design notes

**Route**: `/dream/778-markov-mirror`
**Status**: demoable
**Zero deps · Zero API · Web Audio API + SVG**

---

## The idea

*What if a small keyboard could learn YOUR melodic style as you play, then improvise forever in it — and you could watch the model itself, glowing, reshape as you teach it?*

You play. The system watches your note transitions and builds a directed weighted graph — a Markov chain — of your personal melodic tendencies. Then you release it to improvise forever in your style. The graph is not a decoration: it IS the model, rendered live. Nodes light up as notes are struck. Edges thicken as transitions become habitual. During improvisation, you watch the melody walk its own web in real time.

---

## How to use

1. **Teach** (default mode): tap piano keys or press `a s d f g h j k l` to play C D E F G A B C D. Play freely — the transition graph will grow beneath your fingers.
2. **Improvise** (press Space or click "Improvise"): the system takes over, walking the Markov chain forever in the style of your transitions. A soft bass root sounds every 4 steps. Watch the current node and active edge glow.
3. **Forget**: clears the learned model and returns to Teach mode.
4. **Mix freely**: switch back to Teach at any time to add more data; Improvise resumes from the updated model.

**Phrase resets**: if you pause for more than ~900ms, the "previous note" context resets — so distinct melodic phrases are treated as independent rather than chained together.

---

## The Markov chain model

The system maintains a **variable-order Markov chain** with two orders:

- **Order-1**: counts of all note pairs `(A → B)`. Encodes "after A, I play B 3 times and C 1 time."
- **Order-2**: counts of all note triples `(A, B → C)`. Encodes richer context about where a melody came from.

During improvisation, at each step:
1. Try order-2 evidence first: given the last two notes, is there strong data about what comes next? If yes, sample from those weighted counts.
2. Fall back to order-1 if order-2 is empty for this context.
3. Fall back to a random known note if neither has data.

**Weighted sampling**: the system doesn't pick the most likely next note — it samples proportionally to counts, so common transitions are more probable but rare transitions still happen. This preserves the stochastic character of improvisation rather than locking into the "greedy" path.

---

## Audio design

The piano voice uses a **triangle + sine** oscillator pair routed through:
- `triangle` oscillator (70%): warm, bell-like fundamental with natural odd harmonics
- `sine` oscillator (30%): adds fundamental reinforcement and sub-warmth for bass notes
- ADSR envelope: 12ms attack → decay to 55% sustain → release at 70% into note duration
- **Algorithmic reverb bus**: multi-tap delay (35ms) with low-pass filtered feedback (0.38) at 3kHz, mixed at 22%. Avoids the complexity of convolution IR while still creating spatial depth.
- **Master chain**: gain (≤0.28) → 6.8kHz lowpass BiquadFilter → DynamicsCompressor → destination

Every note is a short-lived voice node graph — no pooling needed for this use pattern; the Web Audio API garbage-collects stopped nodes.

---

## Visual design

The graph is rendered in **SVG** (no canvas, no WebGL):

- **Nodes**: SCALE_NOTES arranged on a ring. Size increases once a node has data. Color shifts from dim (unplayed) → violet (has data) → bright violet (active).
- **Edges**: curved quadratic Bézier paths with SVG `marker` arrowheads. Thickness and opacity scale with the transition count. Most-used transitions (>60% of the max count) render in **emerald-400** to call out the learned favorites.
- **Active state**: the currently struck node receives a radial glow halo (Gaussian blur filter). The currently traversed edge turns violet-400 and glows (filter: feGaussianBlur blur + merge with source).
- **Layout**: the ring layout puts all notes at equal radial distance, making the directed-graph structure visible rather than hidden in a force layout. You can trace every loop and branch with your eye.

**Palette**: violet/emerald on deep blue-black (`#07091a`). Violet for structure, emerald for the well-worn paths, white for text hierarchy.

---

## Named references

**David Cope — *Experiments in Musical Intelligence* (EMI / "Emmy")**: Cope's system learned compositional style from a corpus of works and recombined segments in the same style. The Markov Mirror is a radically simpler version of this idea — instead of full-score analysis, it captures only the melodic transition statistics of one improviser in real time and plays them back immediately. Emmy operated on a corpus; the Mirror operates on a session.

**Hiller & Isaacson — *Illiac Suite* (1957)**: The first computer-generated composition, using Markov chains to generate pitches that obeyed classical voice-leading rules (via rejection sampling). The Illiac Suite proved that statistical models of musical grammar could produce coherent musical output — over 60 years before "generative AI" was a phrase.

**"A Design Space for Live Music Agents"** (arXiv 2602.05064, Feb 2026): This paper maps the design space for interactive music systems that learn and respond in real time. The Markov Mirror is a minimal instance of that space: single-instrument, session-scoped, immediate feedback loop, model explicitly visible. The paper notes that making the model visible to the performer is an underexplored axis — this prototype treats that as the primary design goal.

---

## Technical notes

- **iOS-safe audio**: `AudioContext` is created inside `initAudio()`, which is called from the first user gesture (button click or key press). The context is resumed if suspended.
- **Full teardown on unmount**: `useEffect` cleanup closes the AudioContext, cancels improvise timeouts, and disconnects the reverb nodes.
- **No canvas / no WebGL**: the graph is entirely SVG DOM. ResizeObserver drives the viewBox update when the container resizes.
- **ESLint/TypeScript**: all hook dependencies are explicit. Helper functions avoid `use*` naming. No `any` types except where the Web Audio API requires it.

---

## Self-assessment

**What works well**: the teach-then-improvise interaction loop is genuinely interesting — playing a few phrases and watching the improviser immediately reflect your habits is satisfying. The graph visualization is clear: edges thicken correctly as transitions accumulate, and the active glow during improvisation makes the Markov walk visible in a legible way.

**What's risky / unverified**:
- The reverb bus is algorithmic (delay + LP filter feedback) rather than true convolution reverb. It creates depth without harshness, but it's less lush than a real IR reverb.
- The note timing during improvisation uses `setTimeout` (not `AudioContext.currentTime` scheduling). This is "close enough" for demo purposes but can drift under CPU load — a production version would pre-schedule notes using `ctx.currentTime`.
- TypeScript strict mode and ESLint compliance were applied carefully but cannot be confirmed without a live `next build` run.
- The order-2 Markov data builds slowly — you need at least 3–4 notes in a phrase before order-2 has any evidence. The system gracefully falls back to order-1 until then.
