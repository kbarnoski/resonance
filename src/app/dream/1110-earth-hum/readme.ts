// readme.ts — the design-notes prose shown IN-PAGE via the "Design notes"
// toggle (React state, not a route). Kept in sync with README.md by hand.

export const README = `Earth Hum

What if you could tune into the planet's own electromagnetic heartbeat — hear
Earth hum, live?

The Schumann Resonance is REAL: an extremely-low-frequency electromagnetic
standing wave in the cavity between Earth's surface and the ionosphere, excited
by roughly 44 lightning strikes every second worldwide. Its harmonics SR1–SR5
sit at about 7.83, 14.3, 20.8, 27.3 and 33.8 Hz — below or at the very edge of
human hearing. So we make it audible without faking it:

  • A PITCHED DRONE BED — the five true harmonics transposed UP four octaves
    (×16) into a warm register (~125, 229, 333, 437, 541 Hz). Each is a soft
    sine/triangle voice with a faintly detuned partner so it beats and shimmers;
    amplitudes taper SR1 > SR2 > … > SR5.
  • The TRUE sub-frequencies kept as FELT elements — a 7.83 Hz amplitude tremolo
    breathing across the whole bed (the cavity's real fundamental as a pulse),
    plus a gentle gated 7.83 Hz sub-oscillator you feel more than hear.
  • Everything through a limiter (DynamicsCompressor) → speakers. It starts only
    on your gesture (browser autoplay policy) and is never silent after Start.

LIVE DATA — the point of the piece
The cavity's real strength is shaped by the ionosphere, which geomagnetic storms
disturb. So the piece tunes itself to REAL space weather from NOAA SWPC's public,
no-key feeds, fetched in your browser and refreshed every ~60 s:
  • Planetary K index (0–9 geomagnetic activity)
  • Solar-wind plasma (bulk speed & density)
A badge reads "● LIVE" when the geomagnetic reading is real, "● simulated" when
we fall back. If any fetch fails or times out (~4 s) or there's no network, the
piece drops to a deterministic model (a slow Kp walk 1↔6, plausible wind
350–600 km/s) — never blank, never silent.

DATA → SOUND / VISUAL
  • Higher Kp (a geomagnetic storm) → the cavity "storms": more amplitude
    flutter and beating, a brighter filter, a deeper felt heartbeat, a warmer /
    redder glow, and more frequent lightning flickers around the globe.
  • Solar-wind speed → subtle pitch-drift / shimmer rate and ring drift.
  • Each drone voice's amplitude drives the brightness of its SR ring in the
    glowing harmonic ladder around the planet.

VISUAL
Earth's night side as a world LIT FROM WITHIN — a warm amber/gold sphere inside a
deep indigo→amber sky, wrapped in an additive ionospheric shell that breathes.
The 7.83 Hz heartbeat drives the breath but is eased to a calm ~0.15 Hz swell so
it reads as breathing, not a strobe. Five soft glowing rings are the harmonic
ladder SR1–SR5. Deliberately warm and NON-black.

HONEST FRAMING
7.83 Hz is the real Schumann fundamental — a genuine geophysical cavity
frequency. This piece makes NO brainwave-entrainment or health claims. The calm,
oceanic, meditative feeling is what the PIECE creates, not a medical effect.

SAFETY
Lightning flickers are gentle, brief warm glows around the globe — never
full-screen flashes, mean brightness roughly constant. prefers-reduced-motion
damps both the flicker and the breath.

NAMED REFERENCES
  • Winfried Otto Schumann (1952) — predicted the resonance.
  • The ELF Earth–ionosphere cavity physics — the mechanism itself.
  • Frank White, "The Overview Effect" (1987) — the ego-dissolving awe of seeing
    Earth whole from space.
  • Oceanic boundlessness (Frontiers, 2025; existential neuroscience) — the
    meditative pole this piece leans into.

TAGS
state: overview-effect / oceanic planetary boundlessness · pole: cosmic-ambient
(warm) · INPUT: live external data (NOAA space weather) + autonomous fallback ·
OUTPUT: three.js warm globe · TECHNIQUE: real-data sonification +
physically-accurate Schumann-cavity harmonic synthesis · PALETTE: warm amber/gold
ionosphere.

NEXT-CYCLE DEEPENING
Fetch a live global-lightning / WWLLN-style stroke feed and fire each drone-voice
excitation and lightning flicker on REAL strikes, so the cavity is rung by the
actual storms exciting it right now — turning the drone from a steady bed into a
living, stroke-by-stroke resonance.`;
