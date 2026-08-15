# Morning digest — last updated 2026-08-15T03:05Z (cycle 1138, DEEP)

## New since yesterday
- **[13216-resonantrooms](https://getresonance.vercel.app/dream/13216-resonantrooms)** — **eight of your songs as eight rooms in one building; every room IS one song and wears its title.** Per your call: only the two verified albums — the top row walks Welcome Home's opening (Interplay, Bath, Welcome Home) into Isolation; the bottom row holds the full Snowflake EP (Ghost, Realized, Snowflake) and closes at All Together. Each room LOOPS its one real recording through a reverb cast to fit the song — Isolation in a 1.0s close bedroom, Snowflake in a glass conservatory, All Together in a 5.2s stone hall. (History: Sketches removed — Joseph's; then a Joseph drone surfaced in a "Folsom St" upload, so 17th St + Folsom St are quarantined as unverified until you sign off per track — that also fixed the "Unreachable audio: 17th St II" you saw: rooms now loop their decoded buffer instead of re-fetching every song end, with a 5s retry backoff if a load ever fails.) Walk the listener by dragging (or WASD); stand in a **doorway** and you hear BOTH rooms at once, equal-power-crossfaded by how far across the threshold you stand, each still wearing its own reverb. **Why open this (headphones!):** it's the cleanest use of your *actual catalog* in cycles — no synth, your real piano — and it's the spatial/installation direction the concept jury explicitly asked for. On a muted phone a seeded auto-tour already glides room→doorway→room so the plan is alive on the first frame. Refs: Janet Cardiff's *Forty Part Motet*, Alvin Lucier's *I Am Sitting in a Room*.

## Explored this fire (DEEP — 2 more built, banked, not shipped)
- **atlas** — your catalog laid out as a *map by musical key* (circle of fifths); drag-pan the map and the nearest pieces play, panned in space, key-related pieces joined by ridge lines. The only one reading your real harmony. IDEAS §1138, **resurrect-first** (needs a real-device check that enough tracks have key analysis).
- **listeningroom** — the simplest, cleanest version: a gallery floor-plan you soundwalk, nearest ~3 plinths HRTF-panned. IDEAS §1138.
- All three raced ONE concept — *your whole catalog as a walkable, head-panned SPACE* — via three spatial approaches (rooms / map / gallery).

## Research finding worth a look
- Head-tracked **binaural sound-field navigation** (the listener moving/turning through a field of sources) is a live 2026 arXiv frontier, and the browser `PannerNode` HRTF + a moving `AudioListener` is the shipping way to do it. That's the engine under all three explorers. RESEARCH §1138.

## Open questions for Karel
- **Sound-on / real-device review is now the biggest lever** — resonantrooms genuinely needs headphones to judge whether the eight song-rooms read as distinct spaces and the doorway bleed lands. Same standing ask: preparedchance (MIDI keyboard), spectralhold (mic), dreammedley (5-min arc).
- **AI-pipeline chain (music → image → video)** is still the loudest 0× lane — needs a `FAL_KEY` budget + guarded route + your go-ahead. Build or strike?
