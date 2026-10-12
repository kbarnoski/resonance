# Shader recast — 2026-10-13

Loop-wide recast for diversity, from Karel's 2026-10-12 notes (magma / parsec "a lot", dharma "once in a great while", zenith/seraph "dope", "never mind seeing cosmos and infinite space", Grasshopper's moving plane "on repeat").
Laws: `src/lib/journeys/shader-balance.ts` · generator: `scripts/rebalance-shader-casts.mjs` · guard: `src/lib/journeys/shader-balance.test.ts`.

Counts are **loop journeys a shader appears in** (kiosk setlist, 100 journeys; mastered Snowflake / Realized / Ghost takes count but never change). Amber = SHADER_HUES gold + ember, plus parsec (its GLSL reads violet; on screen it is "that amber 3d moving plane").

## Headline

| | before | after |
|---|---|---|
| amber share of cast appearances (non-mastered) | 37.3 % (433/1161) | 24.9 % (290/1163) |
| most-used shader | ember ×16 | binary-stars ×15 |
| journeys whose cast changed | — | 67 (33 featured/album, 34 Expansion) |
| slot substitutions | — | 159 |
| dharma in | 13: Surrounded By Light, Rise, Message, Interplay, The Knife (Jam), First Light, Bells 1, No question 7, Tranquility 36, Cabin Soul 6, Tranquility 34, Rise 1, Northern Plane 3 | 2: Interplay, Northern Plane 3 |

| shader | before | after |
|---|---|---|
| dharma | 13 | 2 |
| magma | 14 | 5 |
| parsec | 15 | 5 |
| ember | 16 | 5 |
| zenith | 14 | 15 |
| seraph | 14 | 11 |
| aureole | 15 | 10 |

## Per-shader journey counts — top 20

| # | before | n | after | n |
|---|---|---|---|---|
| 1 | ember (ember) | 16 | binary-stars (blue) | 15 |
| 2 | nadir (violet) | 16 | cascade-veil (blue) | 15 |
| 3 | pendulum-dust (blue) | 16 | cirrus (blue) | 15 |
| 4 | aureole (gold) | 15 | dark-tide (blue) | 15 |
| 5 | chinook (gold) | 15 | diatom (blue) | 15 |
| 6 | firefly-field (blue) | 15 | drift (blue) | 15 |
| 7 | furnace (ember) | 15 | firefly-field (blue) | 15 |
| 8 | parsec (violet) | 15 | fracture-light (blue) | 15 |
| 9 | pelagic (blue) | 15 | kepler (prismatic) | 15 |
| 10 | r-embers (ember) | 15 | lightyear (violet) | 15 |
| 11 | volcanic (ember) | 15 | meteor-rain (blue) | 15 |
| 12 | cirrus (blue) | 14 | murmuration (blue) | 15 |
| 13 | covenant (gold) | 14 | nadir (violet) | 15 |
| 14 | dark-tide (blue) | 14 | orbit-weaver (blue) | 15 |
| 15 | drift (blue) | 14 | pelagic (blue) | 15 |
| 16 | jubilee (gold) | 14 | pendulum-dust (blue) | 15 |
| 17 | kairos (gold) | 14 | photon (prismatic) | 15 |
| 18 | kelp (green) | 14 | protostar (prismatic) | 15 |
| 19 | lectio (gold) | 14 | pulsar (prismatic) | 15 |
| 20 | magma (gold) | 14 | r-stardust (blue) | 15 |

## First Light

- before: threshold: merkaba · expansion: vestige, dharma, r-embers · transcendence: r-droplets, rose-window · illumination: covenant, plankton, r3-waveveil, zenith · return: ribbon-of-light · integration: will-o-wisp
- after: threshold: merkaba · expansion: vestige, aureole, obsidian-flow · transcendence: r-droplets, rose-window · illumination: covenant, plankton, r3-waveveil, zenith · return: ribbon-of-light · integration: will-o-wisp

## Grasshopper

- before: threshold: resonant-rings · expansion: maelstrom-dark · transcendence: lectio, seraph · illumination: ember, photon, r-droplets, parsec · return: murmuration, cirrus · integration: plankton, singularity
- after: threshold: resonant-rings · expansion: maelstrom-dark · transcendence: lectio, drift · illumination: torrent, photon, r-droplets, r2-spiralgal, r2-photon, r-smokerings · return: murmuration, cirrus · integration: plankton, singularity

## Why slots changed

- amber share: 101
- loop caps: 44
- make room: aureole in First Light: 2
- Grasshopper: 66 s phase -> 6 voices: 2
- light journey: zenith: 2
- make room: zenith in Afterglow: 2
- make room: seraph in Surrounded By Light: 2
- Karel: aureole in First Light: 1
- Karel: no parsec in Grasshopper: 1
- light journey: seraph: 1
- biofilm is globally blocked: 1

## H lens (real JourneyEngine replay, every changed journey)

67 journeys replayed before/after · regressions: none.
Amber screen-time (sum of per-shader on-screen share) across changed journeys: 51.3 → 34.0.
- The First: before [H4 0.25] → after [H4 0.25]
- The First (Expanded): before [H4 0.29] → after [H4 0.29]
- Spectre: before [H2 r2-portalrim 0.42, H4 0.42] → after [H2 r2-portalrim 0.42, H4 0.42]
- The Knife: before [H2 r3-lightningveil 0.42, H4 0.42] → after [H2 r3-lightningveil 0.42, H4 0.42]
- All Together: before [H4 0.28] → after [H4 0.28]
- Lantern: before [H4 0.25] → after [H4 0.25]
- Calling: before [H4 0.34] → after [H4 0.34]
- Cabin Soul 5: before [H4 0.31] → after [H4 0.31]
- Torraine 7: before [H4 0.26] → after [H4 0.26]
- Night Wind 5: before [H4 0.29] → after [H4 0.29]
- Cabin Soul 8: before [H4 0.25] → after [H4 0.25]
- Chenin 5: before [H1 9, H4 0.30] → after [H1 9, H4 0.30]
- Torraine 5: before [H4 0.26] → after [H4 0.26]

## Notes

- **Per-shader cap.** The brief asked for ≈5 journeys per shader. The loop holds 97 cast journeys × ~12 shaders (1163 appearances) over a 94-shader vetted pool — an average of 12.4 journeys per shader, so a uniform cap of 5 would need a ~2.5× larger vetted pool (new shaders must go through the GPU vetting rig, scripts/vet-shaders.mjs). What ships: the named over-seen shaders capped at 5 (dharma 2), every other shader at 15 (was up to 16), and the amber share under 25 % — which needs the cool shaders to carry ~15 each (62 cool shaders × 14 < the ~870 cool appearances a 25 % amber share requires).
- **Engine borrowing.** `journey-engine.ts` kinBorrow (unseen kindred shaders once a roster is spent) drew uniformly from every vetted shader in the roster's hue families — with 23 gold + 8 ember shaders in the pool it pulled amber whenever a roster held one amber member. It now never borrows dharma / magma / parsec / ember and takes cool kin first unless the roster itself is mostly amber. Scripted (mastered) takes are exempt, so Snowflake / Ghost / Realized play exactly as mastered.
- **Future casts.** `scripts/mv-rollout/cast-shaders.mjs`, `cast-owned-featured.mjs` and `recast-featured.mjs` read the same laws (caps, journey bans, amber penalty / cosmic lean); re-run this rebalancer after any recast.
- **Runtime path.** Featured / album casts ship in the bundle (`journey-casts.generated.ts`) — a deploy is enough. Expansion casts are read from the Tramokyo pack (`data/journeys.json` phases[].shaderModes) and the DB rows, so they need `node scripts/apply-shader-recast-2026-10-13.mjs --pack` on the kiosk Mac (and `--db` with `.env.local` for the web). `shader-balance.test.ts` fails on a pack that has not been applied.

## Changed journeys

- The First (featured/album): expansion magma→threshold, transcendence magma→threshold, illumination magma→threshold, return magma→threshold
- The First (Expanded) (featured/album): illumination molten-vein→drift
- Dad's Song II (featured/album): return seraph→kepler, return ember→supernova, illumination volcanic→photon, return maelstrom-dark→fracture-light, transcendence lectio→plankton
- Spectre (featured/album): return zenith→pulsar
- Surrounded By Light (featured/album): return aureole→seraph, expansion dharma→aureole
- Mexican Boy (featured/album): expansion magma→r3-monsoonveil, expansion event-horizon→dark-tide, expansion flame→ripple
- Afterglow (featured/album): return drift→zenith
- Grasshopper (featured/album): illumination parsec→r2-spiralgal, illumination +→r2-photon, illumination +→r-smokerings, transcendence seraph→drift, illumination ember→torrent
- Love Again (featured/album): transcendence zenith→supernova, transcendence rapture→astral
- Rise (featured/album): illumination dharma→pulsar, illumination magma→kepler, expansion kairos→resonant-rings, integration chinook→mandorla, expansion aureole→threshold
- Openings (featured/album): illumination shadow-fire→orbit-weaver, expansion yantra→r2-photon
- Surrounded By Light (featured/album): expansion parsec→meteor-rain
- Drift (featured/album): illumination kenosis→r3-sleepingbloom
- Self (featured/album): threshold chinook→dark-nebula, transcendence iron-forge→r2-curlswarm
- Message (featured/album): integration dharma→pulsar, illumination aureole→threshold, illumination jubilee→ribbon-of-light
- Grace (featured/album): expansion r-embers→r2-portalrim, transcendence molten-vein→torrent, expansion volcanic→r3-fernunfurl
- Held (featured/album): expansion rapture→zenith
- Interplay (featured/album): illumination event-horizon→murmuration, expansion r2-pixie→cascade-veil, illumination kairos→ocean, transcendence satori→r3-monsoonveil
- Bath (featured/album): transcendence aureole→r-stardust, integration ember→resonant-rings
- Welcome Home (featured/album): transcendence hubble→typhoon
- The Knife (featured/album): threshold r3-heartwarmth→diatom, expansion shadow-fire→tide
- 2019 (featured/album): integration parsec→jubilee
- The Knife (Jam) (featured/album): threshold dharma→cirrus
- Rebound (featured/album): integration r3-heartwarmth→symbiosis
- Rolling (featured/album): threshold ember→r2-spore
- All Together (featured/album): integration nadir→orbit-weaver
- Vespers 2 (featured/album): transcendence magma→rose-window, return parsec→will-o-wisp, return r3-heartwarmth→r3-plasmastorm
- Lantern (featured/album): return ember→binary-stars
- Testimony 3 (featured/album): illumination pendulum-dust→cascade-veil
- Calling (featured/album): return aureole→dusk
- First Light (featured/album): expansion dharma→aureole, expansion r-embers→obsidian-flow
- Chemiluminescence 1 (Expansion): threshold biofilm→fracture-light
- Night Wind 2 (Expansion): return magma→pulsar, threshold r-embers→kepler, expansion chinook→mandorla, threshold hubble→rose-window, expansion kenosis→plankton, threshold merkaba→r-smokerings, transcendence pollen→dusk, illumination r-blackhole→monsoon
- Tranquility 21 (Expansion): expansion magma→binary-stars, expansion ember→r2-spiralgal
- Bells 1 (Expansion): illumination dharma→protostar, integration molten-vein→meteor-rain
- Chenin 3 (Expansion): illumination hubble→r3-lightningveil
- Tranquility 17 (Expansion): transcendence ember→pulsar, illumination furnace→photon, expansion r3-fairyglow→kepler, integration volcanic→obsidian-flow, expansion vestige→supernova, illumination event-horizon→r2-thermal
- No question 7 (Expansion): expansion dharma→binary-stars, transcendence magma→fracture-light
- Cabin Soul 5 (Expansion): threshold ember→meteor-rain
- Never Forget 4 (Expansion): expansion aureole→protostar, integration covenant→threshold, illumination chinook→lightyear, threshold flame→rose-window, illumination satori→dusk, transcendence lectio→mycelium
- Tranquility 30 (Expansion): threshold ember→supernova, illumination furnace→will-o-wisp, illumination iron-forge→binary-stars, transcendence r3-fairyglow→mandorla, illumination kairos→plankton
- Amboise 1 (Expansion): expansion magma→pulsar
- Surrounded by Light 6 (Expansion): integration r-mercury→zenith
- Night Wind 4 (Expansion): integration ember→kepler, transcendence jubilee→threshold, illumination furnace→fracture-light, illumination iron-forge→obsidian-flow, transcendence pollen→r-smokerings, illumination shadow-fire→r3-lightningveil
- Torraine 7 (Expansion): expansion chinook→pulsar, expansion molten-vein→supernova, transcendence yantra→lightyear, expansion aureole→stigmata, illumination merkaba→mycelium, integration rapture→r2-thermal, expansion r-blackhole→r3-sleepingbloom, expansion flame→typhoon
- Tranquility 36 (Expansion): expansion dharma→r2-portalrim, illumination magma→protostar
- Stand 10 (Expansion): integration parsec→ribbon-of-light
- Yellow Bird 6 (Expansion): return r3-heartwarmth→binary-stars, illumination maelstrom-dark→monsoon
- Redwoods Sway 2 (Expansion): expansion covenant→will-o-wisp, transcendence vestige→supernova
- Cabin Soul 6 (Expansion): transcendence dharma→kepler, expansion seraph→r2-portalrim, threshold r2-pixie→r-mercury, return yantra→diatom
- Night Wind 5 (Expansion): integration parsec→lightyear, return satori→chrysalis
- Cabin Soul 8 (Expansion): illumination furnace→meteor-rain
- Tranquility 34 (Expansion): expansion dharma→protostar
- Chemiluminescence (Expansion): transcendence lectio→supernova, integration r-embers→mandorla, return r-blackhole→r2-thermal, expansion volcanic→mycelium, illumination merkaba→stigmata
- Nothing 30 (Expansion): expansion parsec→photon
- Rise 1 (Expansion): return dharma→kepler, illumination yantra→dark-nebula
- Chenin 5 (Expansion): integration ember→protostar, illumination furnace→monsoon
- Horses 1 (Expansion): return parsec→starfield
- No question 8 (Expansion): return maelstrom-dark→obsidian-flow, illumination jubilee→mandorla
- Northern Plane 3 (Expansion): threshold r3-fairyglow→supernova, return volcanic→r3-lightningveil
- Torraine 5 (Expansion): expansion kairos→pulsar, illumination covenant→singularity, expansion lectio→threshold, expansion r-embers→mandorla, transcendence r2-pixie→dark-nebula
- Tranquility 35 (Expansion): expansion jubilee→r2-spiralgal, transcendence pollen→r-stardust, transcendence kenosis→r3-waveveil, threshold seraph→r3-monsoonveil
- Rattler 2 (Expansion): expansion vestige→r2-portalrim, expansion r3-fairyglow→r-smokerings
- Amboise 2 (Expansion): illumination covenant→threshold
- Singular 4 (Expansion): return parsec→rose-window
- The Bloom (featured/album): return jubilee→r3-fernunfurl
- Cosmic Drift (featured/album): expansion parsec→plankton
