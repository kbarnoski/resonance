export const README = `PHYSARUM REEF

What if a piece of music grew a living slime-mold vein-network — the sound
feeding an organism that builds itself into breathing organic filigree?

Drop a track (or open the mic) and a colony of ~18,000 agents listens. Each
one senses a chemical trail ahead of it, turns toward the strongest scent,
steps forward, and lays down more trail. Every frame the whole field is blurred
a little and faded a little. From those two rules — deposit and decay — the
colony condenses itself into veins, then reorganises those veins into finer
filigree. This is Physarum polycephalum, the acellular slime mold that solves
mazes and re-grows the Tokyo rail map. Nobody draws the veins; the veins are
what a crowd of blind agents agree on.

THE MODEL
· A trail field: a 512×512 scalar grid (Float32Array).
· Agents: {x, y, heading}. Sense three points — ahead, ahead-left,
  ahead-right — at a sensor distance and ±sensor angle; turn toward the
  strongest; move one step; deposit a fixed amount.
· Each frame the field is diffused (3×3 mean) and decayed (×~0.9–0.97).
  That diffuse-and-decay is the whole secret of vein formation.

HOW THE MUSIC FEEDS IT
· Loudness  → deposit strength + step speed (louder = faster, brighter growth)
· Brightness (spectral centroid) → sensor angle (bright = wider, more branching)
· Bass (low-band energy) → trail persistence (bass = denser, longer-lived veins)
· Onsets (spectral flux) → a burst of fresh agents at seeded spawn nodes —
  the music literally feeds new growth into the reef.

So different music grows a visibly different organism. Nothing here plays
itself: the colony only grows when it is fed real sound. While muted, a seeded
deterministic demo envelope stands in for the music so the reef is already
alive and breathing.

PALETTE
Coral and amber veins on a near-black reef floor, with a cool teal glow riding
the active growth fronts — a living reef, not a star-void.

REFERENCES
· Jeff Jones (2010), "Characteristics of pathfinding in a simulated transport
  network" — the agent model used here.
· Sage Jenson (mxsage), physarum works — the aesthetic lineage.
· Implements the agent-based-morphogenesis frontier
  (Neural Particle Automata, arXiv:2601.16096, Jan 2026).

HONEST LIMITS
CPU + Canvas2D, single trail channel, toroidal (edge-wrapped) field. A WebGL2
multi-channel version would carry far more agents and colour the veins by
sensed direction. The onset detector is a simple adaptive spectral-flux gate,
not a trained beat tracker, so very dense mixes can under- or over-trigger the
growth bursts.`;
