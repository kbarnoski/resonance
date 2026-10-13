# Shader recast — 2026-10-13

Loop-wide recast for diversity, from Karel's notes of 2026-10-12/13 (magma / parsec "a lot", "i cant stand dharma in resonance", seraph ALWAYS in First Light + every Surrounded by Light, "no ember 3d plane moving shader in bath", zenith/seraph "dope", "never mind seeing cosmos and infinite space", Grasshopper's moving plane "on repeat"). Built on main f731e4a1.
Laws: `src/lib/journeys/shader-balance.ts` · generator: `scripts/rebalance-shader-casts.mjs` · guard: `src/lib/journeys/shader-balance.test.ts`.

Counts are **loop journeys a shader appears in** (kiosk setlist, 100 journeys; mastered Snowflake / Realized / Ghost takes count but never change). Amber = SHADER_HUES gold + ember, plus parsec (its GLSL reads violet; on screen it is "that amber 3d moving plane").

## Headline

| | before | after |
|---|---|---|
| amber share of cast appearances (non-mastered) | 37.3 % (433/1161) | 24.9 % (290/1163) |
| most-used shader | ember ×16 | binary-stars ×15 |
| journeys whose cast changed | — | 69 (34 featured/album, 35 Expansion) |
| slot substitutions | — | 160 |
| dharma in | 12: Surrounded By Light, Rise, Message, Interplay, The Knife (Jam), Bells 1, No question 7, Tranquility 36, Cabin Soul 6, Tranquility 34, Rise 1, Northern Plane 3 | 0:  |

| shader | before | after |
|---|---|---|
| dharma | 12 | 0 |
| magma | 14 | 5 |
| parsec | 15 | 5 |
| ember | 16 | 5 |
| zenith | 14 | 15 |
| seraph | 15 | 11 |
| aureole | 15 | 10 |

## Per-shader journey counts — top 20

| # | before | n | after | n |
|---|---|---|---|---|
| 1 | ember (ember) | 16 | binary-stars (blue) | 15 |
| 2 | nadir (violet) | 16 | cascade-veil (blue) | 15 |
| 3 | pendulum-dust (blue) | 16 | cirrus (blue) | 15 |
| 4 | aureole (gold) | 15 | dark-tide (blue) | 15 |
| 5 | chinook (gold) | 15 | diatom (blue) | 15 |
| 6 | furnace (ember) | 15 | drift (blue) | 15 |
| 7 | parsec (violet) | 15 | dusk (prismatic) | 15 |
| 8 | pelagic (blue) | 15 | firefly-field (blue) | 15 |
| 9 | r-embers (ember) | 15 | flagella (blue) | 15 |
| 10 | seraph (gold) | 15 | fracture-light (blue) | 15 |
| 11 | volcanic (ember) | 15 | kepler (prismatic) | 15 |
| 12 | cirrus (blue) | 14 | lightyear (violet) | 15 |
| 13 | covenant (gold) | 14 | meteor-rain (blue) | 15 |
| 14 | dark-tide (blue) | 14 | murmuration (blue) | 15 |
| 15 | drift (blue) | 14 | nadir (violet) | 15 |
| 16 | firefly-field (blue) | 14 | orbit-weaver (blue) | 15 |
| 17 | jubilee (gold) | 14 | pelagic (blue) | 15 |
| 18 | kairos (gold) | 14 | pendulum-dust (blue) | 15 |
| 19 | kelp (green) | 14 | photon (prismatic) | 15 |
| 20 | lectio (gold) | 14 | protostar (prismatic) | 15 |

## First Light

- before: threshold: merkaba · expansion: vestige, seraph, r-embers · transcendence: r-droplets, rose-window · illumination: covenant, plankton, r3-waveveil, zenith · return: ribbon-of-light · integration: will-o-wisp
- after: threshold: merkaba · expansion: vestige, seraph, aureole · transcendence: r-droplets, rose-window · illumination: covenant, plankton, r3-waveveil, zenith · return: ribbon-of-light · integration: will-o-wisp

## Bath (no ember, no parsec)

- before: threshold: ribbon-of-light, binary-stars · expansion: rose-window, fracture-light · transcendence: aureole, r2-spiralgal · illumination: pollen · return: r-mercury, r3-sleepingbloom, r3-fernunfurl · integration: meteor-rain, ember
- after: threshold: ribbon-of-light, binary-stars · expansion: rose-window, fracture-light · transcendence: aureole, r2-spiralgal · illumination: pollen · return: r-mercury, r3-sleepingbloom, r3-fernunfurl · integration: meteor-rain, will-o-wisp
- The engine also refuses journey-banned shaders at pick time (`isShaderAllowed` → `isShaderBannedFor`), so the finale-forced switch (`forceShaderSwitch`, which logged "ember (finale-forced)" at p0.887) can no longer land on ember in Bath.

## Seraph pins (First Light + every Surrounded by Light)

- First Light: seraph + aureole in expansion
- Surrounded By Light: seraph in expansion
- Surrounded By Light: seraph in expansion
- Surrounded by Light 6: seraph in integration
- Surrounded by Light 19 (parked, pack only): ensured by the apply step
- Surrounded by Light 3 (parked, pack only): ensured by the apply step

## Expansion lead swaps

- Northern Plane 3: dharma → r-smokerings (EXPANSION_LEADS updated)

## Grasshopper

- before: threshold: resonant-rings · expansion: maelstrom-dark · transcendence: lectio, seraph · illumination: ember, photon, r-droplets, parsec · return: murmuration, cirrus · integration: plankton, singularity
- after: threshold: resonant-rings · expansion: maelstrom-dark · transcendence: lectio, r2-spiralgal · illumination: torrent, photon, r-droplets, r2-photon, r-smokerings, r3-monsoonveil · return: murmuration, cirrus · integration: plankton, singularity

## Why slots changed

- amber share: 100
- loop caps: 42
- make room: seraph in Surrounded By Light: 3
- Karel: seraph pinned in Surrounded By Light: 2
- Grasshopper: 66 s phase -> 6 voices: 2
- make room: zenith in Afterglow: 2
- dharma is banned everywhere — new lead: 1
- Karel: aureole pinned in First Light: 1
- make room: aureole in First Light: 1
- Karel: seraph pinned in Surrounded by Light 6: 1
- make room: seraph in Surrounded by Light 6: 1
- Karel: no parsec in Grasshopper: 1
- Karel: no ember in Bath: 1
- light journey: zenith: 1
- biofilm is globally blocked: 1

## H lens (real JourneyEngine replay, every changed journey)

69 journeys replayed before/after · regressions: none.
Amber screen-time (sum of per-shader on-screen share) across changed journeys: 50.0 → 34.6.
- The First: before [H4 0.29] → after [H4 0.29]
- The First (Expanded): before [H4 0.29] → after [H4 0.29]
- Spectre: before [H2 r2-portalrim 0.42, H4 0.42] → after [H2 r2-portalrim 0.42, H4 0.42]
- The Knife: before [H2 r3-lightningveil 0.42, H4 0.42] → after [H2 r3-lightningveil 0.42, H4 0.42]
- All Together: before [H4 0.28] → after [H4 0.28]
- Lantern: before [H4 0.25] → after [H4 0.25]
- Open Jam: before [H4 0.26] → after [H4 0.26]
- Calling: before [H4 0.34] → after [H4 0.34]
- Cabin Soul 5: before [H4 0.31] → after [H4 0.31]
- Torraine 7: before [H4 0.26] → after [H4 0.26]
- Night Wind 5: before [H4 0.29] → after [H4 0.29]
- Cabin Soul 8: before [H4 0.25] → after [H4 0.25]
- Chenin 5: before [H1 9, H4 0.30] → after [H1 9, H4 0.30]
- Torraine 5: before [H4 0.26] → after [H4 0.26]

## Notes

- **Per-shader cap.** The brief asked for ≈5 journeys per shader. The loop holds 97 cast journeys × ~12 shaders (1163 appearances) over a 93-shader vetted pool — an average of 12.5 journeys per shader, so a uniform cap of 5 would need a ~2.5× larger vetted pool (new shaders must go through the GPU vetting rig, scripts/vet-shaders.mjs). What ships: magma / parsec / ember capped at 5, dharma at 0 (globally blocked), every other shader at 15 (was up to 16), and the amber share under 25 % — which needs the cool shaders to carry ~15 each (62 cool shaders × 14 < the ~870 cool appearances a 25 % amber share requires).
- **Engine borrowing.** `journey-engine.ts` kinBorrow (unseen kindred shaders once a roster is spent) drew uniformly from every vetted shader in the roster's hue families — with 23 gold + 8 ember shaders in the pool it pulled amber whenever a roster held one amber member. It now never borrows dharma / magma / parsec / ember and takes cool kin first unless the roster itself is mostly amber. Scripted (mastered) takes are exempt, so Snowflake / Ghost / Realized play exactly as mastered.
- **Future casts.** `scripts/mv-rollout/cast-shaders.mjs`, `cast-owned-featured.mjs` and `recast-featured.mjs` read the same laws (caps, journey bans, amber penalty / cosmic lean); re-run this rebalancer after any recast.
- **Runtime path.** Featured / album casts ship in the bundle (`journey-casts.generated.ts`) — a deploy is enough. Expansion casts are read from the Tramokyo pack (`data/journeys.json` phases[].shaderModes) and the DB rows, so they need `node scripts/apply-shader-recast-2026-10-13.mjs --pack` on the kiosk Mac (and `--db` with `.env.local` for the web). `shader-balance.test.ts` fails on a pack that has not been applied.

## Changed journeys

- The First (featured/album): expansion magma→threshold, transcendence magma→threshold, illumination magma→threshold, return magma→threshold
- The First (Expanded) (featured/album): illumination molten-vein→drift
- Dad's Song II (featured/album): return seraph→pulsar, return ember→kepler, illumination volcanic→photon, return maelstrom-dark→fracture-light, transcendence lectio→supernova
- Spectre (featured/album): return zenith→protostar
- Surrounded By Light (featured/album): expansion dharma→seraph
- Mexican Boy (featured/album): expansion magma→drift, expansion event-horizon→dark-tide, expansion flame→ripple
- Afterglow (featured/album): return drift→zenith
- Grasshopper (featured/album): transcendence seraph→r2-spiralgal, illumination parsec→r2-photon, illumination +→r-smokerings, illumination +→r3-monsoonveil, illumination ember→torrent
- Love Again (featured/album): transcendence zenith→supernova, transcendence rapture→astral
- Rise (featured/album): illumination dharma→kepler, illumination magma→resonant-rings, expansion aureole→orbit-weaver, integration chinook→mandorla, threshold flame→r2-thermal
- Openings (featured/album): illumination shadow-fire→meteor-rain, expansion yantra→r2-photon
- Surrounded By Light (featured/album): expansion parsec→seraph
- Drift (featured/album): transcendence seraph→pulsar
- Self (featured/album): transcendence iron-forge→ribbon-of-light
- Message (featured/album): integration dharma→r2-portalrim, transcendence kairos→threshold, illumination jubilee→stigmata
- Grace (featured/album): expansion volcanic→torrent, transcendence molten-vein→r3-fernunfurl
- Held (featured/album): transcendence kenosis→dusk
- Interplay (featured/album): transcendence dharma→pulsar, expansion r2-pixie→r-stardust, illumination kairos→cascade-veil, threshold seraph→typhoon
- Bath (featured/album): integration ember→will-o-wisp
- Welcome Home (featured/album): transcendence hubble→flagella
- The Knife (featured/album): threshold r3-heartwarmth→resonant-rings, expansion r-embers→diatom, expansion shadow-fire→ocean
- 2019 (featured/album): integration parsec→jubilee
- The Knife (Jam) (featured/album): threshold dharma→cirrus
- Rebound (featured/album): integration r3-heartwarmth→symbiosis
- Rolling (featured/album): threshold ember→r2-spore
- All Together (featured/album): integration nadir→orbit-weaver
- Vespers 2 (featured/album): transcendence magma→zenith, return parsec→rose-window, return r3-heartwarmth→r3-plasmastorm
- Lantern (featured/album): return ember→r-stardust
- Open Jam (featured/album): return kenosis→binary-stars
- Testimony 3 (featured/album): illumination pendulum-dust→cascade-veil
- Calling (featured/album): return aureole→dusk
- First Light (featured/album): expansion r-embers→aureole
- Chemiluminescence 1 (Expansion): threshold biofilm→meteor-rain
- Night Wind 2 (Expansion): return magma→pulsar, expansion chinook→kepler, threshold r-embers→mandorla, integration yantra→rose-window, threshold hubble→r3-lightningveil, expansion kenosis→plankton, transcendence pollen→monsoon, illumination r-blackhole→dusk
- Loire 2 (Expansion): integration aureole→chrysalis
- Tranquility 21 (Expansion): expansion magma→binary-stars, expansion ember→r2-spiralgal
- Bells 1 (Expansion): illumination dharma→pulsar, integration molten-vein→murmuration
- Chenin 3 (Expansion): illumination hubble→r2-thermal
- Tranquility 17 (Expansion): transcendence ember→protostar, illumination furnace→photon, expansion r3-fairyglow→kepler, illumination event-horizon→mandorla, expansion vestige→supernova, integration volcanic→obsidian-flow, expansion iron-forge→mycelium
- No question 7 (Expansion): expansion dharma→binary-stars, transcendence magma→meteor-rain
- Cabin Soul 5 (Expansion): threshold ember→fracture-light, return volcanic→flagella
- Never Forget 4 (Expansion): expansion aureole→protostar, integration covenant→threshold, illumination chinook→r2-spiralgal, transcendence lectio→lightyear, illumination satori→dusk, expansion vestige→mycelium
- Tranquility 30 (Expansion): threshold ember→supernova, illumination furnace→will-o-wisp, illumination iron-forge→rose-window, transcendence r3-fairyglow→mandorla, illumination kairos→plankton, integration r-embers→r3-lightningveil
- Amboise 1 (Expansion): expansion seraph→pulsar, expansion magma→binary-stars
- Surrounded by Light 6 (Expansion): integration r-mercury→seraph
- Night Wind 4 (Expansion): integration ember→protostar, transcendence jubilee→threshold, illumination furnace→obsidian-flow, transcendence pollen→stigmata, illumination shadow-fire→r2-thermal
- Torraine 7 (Expansion): expansion aureole→pulsar, expansion chinook→supernova, expansion molten-vein→lightyear, expansion flame→fracture-light, illumination merkaba→mycelium, integration rapture→firefly-field, expansion r-blackhole→r3-sleepingbloom, threshold r2-pixie→monsoon
- Tranquility 36 (Expansion): expansion dharma→kepler, illumination magma→r2-portalrim
- Stand 10 (Expansion): integration parsec→ribbon-of-light
- Yellow Bird 6 (Expansion): return r3-heartwarmth→binary-stars, illumination maelstrom-dark→threshold
- Redwoods Sway 2 (Expansion): expansion covenant→supernova, transcendence vestige→r3-sleepingbloom
- Cabin Soul 6 (Expansion): transcendence dharma→protostar, expansion seraph→r2-portalrim, threshold r2-pixie→r-mercury, return yantra→diatom
- Night Wind 5 (Expansion): integration parsec→lightyear, return satori→ocean, expansion pollen→r3-monsoonveil
- Cabin Soul 8 (Expansion): illumination furnace→meteor-rain
- Tranquility 34 (Expansion): expansion dharma→kepler
- Chemiluminescence (Expansion): transcendence lectio→supernova, expansion volcanic→r2-thermal, return r-blackhole→stigmata, illumination merkaba→mandorla, expansion event-horizon→r3-lightningveil
- Nothing 30 (Expansion): expansion parsec→photon
- Rise 1 (Expansion): return dharma→fracture-light, expansion rapture→monsoon
- Chenin 5 (Expansion): integration ember→kepler, illumination furnace→mycelium
- Horses 1 (Expansion): return parsec→starfield
- No question 8 (Expansion): return maelstrom-dark→obsidian-flow, illumination jubilee→threshold
- Northern Plane 3 (Expansion): transcendence dharma→r-smokerings, threshold r3-fairyglow→dark-nebula
- Torraine 5 (Expansion): expansion kairos→pulsar, illumination covenant→supernova, expansion r-embers→will-o-wisp, expansion lectio→threshold, threshold merkaba→mandorla
- Tranquility 35 (Expansion): expansion jubilee→zenith, threshold seraph→singularity, integration aureole→r3-waveveil, return yantra→r3-lightningveil
- Rattler 2 (Expansion): expansion r3-fairyglow→r2-portalrim
- Amboise 2 (Expansion): expansion chinook→r-smokerings
- Singular 4 (Expansion): return parsec→rose-window
- The Bloom (featured/album): return jubilee→r3-fernunfurl
- Cosmic Drift (featured/album): expansion parsec→plankton
