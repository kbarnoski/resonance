# 1578 — Dream Jump

Each sung phrase teleports you into an entirely new dream-scene, with the browser itself performing the liquid metamorphosis between realities.

## How to use

- Press **Begin** — a just-intonation drone fades in and the piece starts dreaming on its own, auto-teleporting every 5–7 seconds.
- Press **Sing (enable mic)** and hold a loud, sustained phrase (~0.4s) to trigger a teleport; your pitch chooses the next scene's seed and palette, and nudges the drone.
- **Stop** tears everything down (audio context, mic, timers). The footer shows the live morph path: `view-transitions: on` or `fallback`.

## Design notes

The headline technique is the **CSS View Transitions API**. Every teleport swaps the whole DOM scene inside `document.startViewTransition(() => flushSync(...))`; customized `::view-transition-old(root)` / `::view-transition-new(root)` `@keyframes` make the browser crossfade + scale + rotate + clip-path-iris the *entire viewport* on the compositor. This is progressive enhancement: if `document.startViewTransition` is undefined (headless or older browsers), the swap runs directly and a CSS enter-animation covers it — the experience is complete either way.

Each scene is a deterministic, full-viewport hypnagogic "room" built from pure DOM/CSS: angled gradient walls (clip-path trapezoids), a receding floor plane, crossing shafts of light, floating radial orbs, a faceted conic prism, and a faint ruled lattice — deliberately architectural rather than a radial mandala or a tunnel. Everything is seeded by a `mulberry32` PRNG driven off sung pitch, with `performance.now()` for all timing (no nondeterministic randomness, no wall-clock entropy). Audio is a gesture-gated drone/pad of detuned oscillators that re-tunes its root to each scene, plus a filtered-noise whoosh on every jump and a voice-follow oscillator, all through a master gain ≤ 0.16 and a `DynamicsCompressor`. `prefers-reduced-motion` collapses the morph to a slow crossfade and keeps only a gentle (~0.1 Hz) luminance drift; no strobe, all flicker ≤ 3 Hz.

## References

- **CSS View Transitions API** — W3C CSS Working Group; Jake Archibald, "Bringing page transitions to the web."
- **Heinrich Klüver's form constants** — the recurrent geometric percepts of altered states.
- **Hypnagogia** — Andreas Mavromatis, *Hypnagogia: The Unique State of Consciousness Between Wakefulness and Sleep* (1987).
