# 649 · Chess Duet

## The one question
**What if a famous chess game were music — a slow, inevitable TWO-VOICE DUET
where White and Black are two contrapuntal instruments, and you hear the whole
drama of the game (the quiet opening, the rising tension, the sacrifices, the
final mate) as a piece that composes itself move by move?**

This is the lab's first piece that sonifies a *structured real-world game* as
musical counterpoint — not a physical sensor feed, not an FFT of a sound. The
game's structure **is** the score.

## The bundled game
**Anderssen vs Kieseritzky — "The Immortal Game," London 1851.** A casual game
in which Adolf Anderssen (White) sacrifices a bishop, both rooks and the queen,
then mates with three minor pieces. One of the most famous games ever played.

- Bundled as SAN in `game.ts` (`IMMORTAL_GAME_PGN`), parsed by a tiny
  self-contained SAN parser (no npm deps, no network).
- **45 plies** (23 White moves / 22 Black moves), ending **23. Be7#**.
- The escalating-sacrifice → sudden-quiet → inevitable-mate arc is exactly the
  drama we sonify.

## The mapping legend
Two alternating voices read as call-and-response counterpoint:

| Element | Maps to |
| --- | --- |
| **White** | warm rounded triangle + sine sub ("left hand"), upper staff |
| **Black** | darker FM/reedy saw voice ("right hand"), lower staff |
| **File a–h** | scale degree in **D harmonic minor** (dramatic mode) |
| **Rank 1–8** | register / octave |
| **Piece type** | articulation — pawn short, queen long & rich, knight = grace-note leap, bishop gliding, rook firm, king settled |
| **Capture** | dissonant clash (semitone grace that resolves) + a stronger note |
| **Check** | a held low **tension pedal tone** under the voices |
| **Castling** | a settled perfect-fifth cadence |
| **Checkmate** | a resolving (darkly resolving) held minor chord |
| **Material balance** | a running signal biases timbre brighter (White ahead) / darker (Black ahead) so the arc is *felt* |

Tempo is a slow breathing pulse (~2.0 s/move default, adjustable 1.0–3.5 s).
Master chain is ear-safe: `gain (0.42) → DynamicsCompressor → destination`.

## How to read the screen
- **8×8 SVG board** lights the from/to squares of each move with an arrow;
  captures glow red, mate glows indigo.
- **Two-staff SVG score** unfolds left-to-right: White dots on the upper staff,
  Black on the lower, vertical position = pitch. A playhead tracks the current
  ply; capture/check/mate dots are color-coded.
- Current move shown as legible SAN (e.g. `12... Qg6`) plus piece + destination.
- **Auto-starts ~2.5 s after load** (silent visual demo; tap *Play with sound*
  or *Sound on* to hear the duet — audio context is created inside that gesture
  for iOS).

## Ambition tags (honest ~3/5)
1. **First structured-game / counterpoint sonification in the lab.** A genuinely
   new "machine": the input is the *combinatorial structure of a played game*,
   not a physical-data feed (mic/camera/sensor) or an FFT — and it's rendered as
   strict two-voice counterpoint, not ambient texture.
2. **≥3 subsystems:** (a) a from-scratch SAN/PGN parser with board model +
   move-source resolution; (b) a two-voice contrapuntal mapper + Web Audio
   scheduler; (c) an event-driven harmony/drama state (capture clash · check
   pedal · castle cadence · mate chord · running material balance); (d) an SVG
   board + unfolding two-staff score renderer.
3. **The named game:** Anderssen vs Kieseritzky, "The Immortal Game," London
   1851 — actual moves bundled and verified (all 45 plies resolve to the
   historical squares).

## Lineage
Chess-as-music sonification has a long informal history (data-driven game
sonifications, "Chess Symphony"-style experiments, generative move-to-note
mappings). This piece reframes it as **strict two-voice counterpoint over a real
master game**, with game *events* (not just squares) driving the harmony.

## Cycle-2 hook
Fetch a **live lichess game** (or stream a broadcast) and sonify it in real time
— or render a whole tournament as a multi-movement suite, one game per movement.

## Files
- `page.tsx` — UI, scheduler driver, SVG board + score, auto-start, controls.
- `game.ts` — bundled PGN + minimal SAN parser + board model.
- `music.ts` — PGN→counterpoint mapping + two-voice Web Audio engine.
- `score.ts` — pure layout helpers for the two-staff SVG score.
