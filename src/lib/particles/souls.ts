// ─────────────────────────────────────────────────────────────────────────────
// souls.ts — the particle LANGUAGE: a library of "souls", each a force law in
// the simulation shader (shaders.ts `soulForce`, branch = index) plus staging
// knobs (camera, trail, sprite size, wrap/respawn) and CASTING TRAITS that
// particle-casting.ts scores against a journey's v2 deep analysis.
//
// Every soul obeys the kinetic EQ law — the music moves MOTION and STRUCTURE,
// never luminance (WCAG 2.3.1): bass = mass / surge / lift, mids = flow /
// sway / twist, treble = shimmer / scatter of the finest motes. Colour moves
// by luma-preserving hue/saturation rotation only (engine setHue).
// No ice/frost/crystal (Snowflake-only), no rain, no lightning, nothing
// literal — visionary forms of light.
// ─────────────────────────────────────────────────────────────────────────────

export const SOUL_IDS = [
  "vortex", "smoke", "bloom", "murmuration", "motes",
  "petals", "embers", "duststorm", "pollen", "tendrils",
  "threads", "ribbons", "fireflies", "ink", "branches",
  "geometry", "orbitals", "waves", "cymatics", "nebula",
  "arcs", "kaleido", "helix", "knot", "fountain",
  "harmonics", "lissajous", "rings",
  // v4 geometric family (Karel 2026-10-05: "geometric patterns … incredible
  // variety of shapes") + Ghost's spirit — appended so indices stay stable
  "rose", "spirograph", "superformula", "polyhedron", "mandala", "spirit", "torus",
  // v7 ORGANIC language (Karel 2026-10-06: forms echo the IMAGERY — fire as
  // abstract flames, flowers as evolving floral patterns; organic majority)
  "flame", "wisp", "blossom", "caustic", "petalfall",
  // v8 INTRICATE (Karel 2026-10-06: "intricate patterns … islamic geometric detail")
  "girih", "medallion",
] as const;

export type SoulId = (typeof SOUL_IDS)[number];

/** Three linear-RGB stops: low band → mid band → high band. */
export interface ParticlePalette {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
}

/** Casting traits (0..1) — what music a soul belongs to. */
export interface SoulTraits {
  /** calm 0 … driving 1 */
  energy: number;
  /** fits playful / rhythmic music */
  playful: number;
  /** fits dark / minor / brooding music */
  dark: number;
  /** fits a visual break (particles alone on black) */
  solo: number;
  /** can carry a summit (dense, cosmic) */
  peak: number;
  family: "cosmic" | "organic" | "geometric" | "elemental" | "flow";
}

export interface SoulPreset {
  id: SoulId;
  index: number;
  title: string;
  line: string;
  palette: ParticlePalette;
  /** Trail persistence per 1/60 s frame (0 = none). */
  trail: number;
  /** Camera elevation (radians) and distance. */
  camElev: number;
  camDist: number;
  /** Camera orbit speed (rad/s). */
  camSpin: number;
  /** Overall energy (pre-exposure). */
  intensity: number;
  /** Sprite size multiplier. */
  size: number;
  /** Wrap weights: [x-flow, rising, falling] — particles re-enter off-edge. */
  wrap: [number, number, number];
  /** Age-based respawn: smoke (rising source), ink (drops), fountain (launch),
   *  rise (flame / wisp: climb, then re-enter at the hearth below `riseTop`). */
  respawn: "smoke" | "ink" | "fountain" | "rise" | null;
  /** rise souls: height (world y) where a climber returns to the hearth */
  riseTop?: number;
  /** colour along HEIGHT (low → mid → high palette stops) instead of band */
  heightColor?: boolean;
  /** Density ceiling — volume-filling souls stay sparse so they can never
   *  become a full-frame wash (Karel's wash ban), whatever the conductor asks. */
  maxDensity: number;
  traits: SoulTraits;
}

type C3 = [number, number, number];
const pal = (low: C3, mid: C3, high: C3): ParticlePalette => ({ low, mid, high });
const S = (
  id: SoulId,
  title: string,
  line: string,
  palette: ParticlePalette,
  stage: { trail: number; elev: number; dist: number; spin?: number; intensity?: number; size?: number; wrap?: C3; respawn?: SoulPreset["respawn"]; maxD?: number; riseTop?: number; heightColor?: boolean },
  traits: SoulTraits,
): SoulPreset => ({
  id,
  index: SOUL_IDS.indexOf(id),
  title,
  line,
  palette,
  trail: stage.trail,
  camElev: stage.elev,
  camDist: stage.dist,
  camSpin: stage.spin ?? 0.02,
  intensity: stage.intensity ?? 1,
  size: stage.size ?? 1,
  wrap: stage.wrap ?? [0, 0, 0],
  respawn: stage.respawn ?? null,
  maxDensity: stage.maxD ?? 1,
  riseTop: stage.riseTop,
  heightColor: stage.heightColor,
  traits,
});

const AMBER = pal([1.0, 0.55, 0.22], [0.75, 0.42, 1.0], [0.45, 0.78, 1.0]);

export const SOULS: readonly SoulPreset[] = [
  S("vortex", "Vortex", "a galaxy that breathes with the bass", AMBER,
    { trail: 0.5, elev: 0.95, dist: 5.0, spin: 0.035 },
    { energy: 0.6, playful: 0.2, dark: 0.4, solo: 0.3, peak: 1.0, family: "cosmic" }),
  S("smoke", "Smoke of Light", "a curl-noise current, slow as breath", pal([0.35, 0.3, 1.0], [0.25, 0.85, 0.85], [0.95, 0.9, 1.0]),
    { trail: 0.72, elev: 0.12, dist: 5.2, intensity: 0.75, respawn: "smoke", maxD: 0.6 },
    { energy: 0.35, playful: 0.1, dark: 0.6, solo: 0.6, peak: 0.4, family: "flow" }),
  S("bloom", "Fibonacci Bloom", "golden-angle florets that open on swells", pal([1.0, 0.32, 0.45], [1.0, 0.72, 0.3], [1.0, 0.95, 0.75]),
    { trail: 0.55, elev: 1.2, dist: 3.9, spin: 0.025, intensity: 0.95 },
    { energy: 0.4, playful: 0.3, dark: 0.1, solo: 0.5, peak: 0.7, family: "organic" }),
  S("murmuration", "Murmuration", "a flock of light folding through the dark", pal([0.3, 0.5, 1.0], [0.6, 0.55, 1.0], [0.85, 1.0, 0.95]),
    { trail: 0.65, elev: 0.25, dist: 4.6, spin: 0.015, intensity: 0.95 },
    { energy: 0.7, playful: 0.6, dark: 0.4, solo: 0.4, peak: 0.6, family: "organic" }),
  S("motes", "Lantern Motes", "seed-lantern embers rising through the dark", pal([1.0, 0.5, 0.18], [1.0, 0.7, 0.35], [1.0, 0.85, 0.6]),
    { trail: 0.6, elev: 0.06, dist: 4.6, spin: 0.012, wrap: [0, 1, 0], maxD: 0.06, intensity: 2.2 },
    { energy: 0.2, playful: 0.2, dark: 0.3, solo: 0.9, peak: 0.1, family: "elemental" }),
  S("petals", "Petals of Light", "luminous petals tumbling, lifted by the bass", pal([1.0, 0.45, 0.6], [1.0, 0.7, 0.75], [1.0, 0.92, 0.85]),
    { trail: 0.45, elev: 0.15, dist: 4.6, size: 1.7, wrap: [0, 0, 1], maxD: 0.08, intensity: 1.6 },
    { energy: 0.3, playful: 0.5, dark: 0.1, solo: 0.8, peak: 0.2, family: "organic" }),
  S("embers", "Embers", "sparks spiralling upward on a turbulent breath", pal([1.0, 0.3, 0.08], [1.0, 0.55, 0.15], [1.0, 0.85, 0.5]),
    { trail: 0.72, elev: 0.1, dist: 4.4, wrap: [0, 1, 0], maxD: 0.25 },
    { energy: 0.75, playful: 0.4, dark: 0.6, solo: 0.6, peak: 0.6, family: "elemental" }),
  S("duststorm", "Dust Storm", "a river of dust streaming sideways, gusting with the mids", pal([0.9, 0.6, 0.35], [0.85, 0.5, 0.6], [1.0, 0.85, 0.7]),
    { trail: 0.75, elev: 0.08, dist: 4.6, intensity: 0.85, wrap: [1, 0, 0], maxD: 0.2 },
    { energy: 0.85, playful: 0.5, dark: 0.5, solo: 0.3, peak: 0.7, family: "elemental" }),
  S("pollen", "Pollen Drift", "a hush of fine motes hanging in a slow sunbeam", pal([1.0, 0.85, 0.5], [0.9, 0.95, 0.7], [1.0, 1.0, 0.9]),
    { trail: 0.4, elev: 0.2, dist: 4.4, intensity: 1.8, size: 0.9, maxD: 0.12 },
    { energy: 0.1, playful: 0.1, dark: 0.0, solo: 1.0, peak: 0.0, family: "elemental" }),
  S("tendrils", "Tendrils", "luminous growth reaching upward, swaying with the melody", pal([0.3, 0.9, 0.6], [0.5, 0.7, 1.0], [0.95, 1.0, 0.8]),
    { trail: 0.55, elev: 0.15, dist: 4.8 },
    { energy: 0.45, playful: 0.3, dark: 0.5, solo: 0.6, peak: 0.5, family: "organic" }),
  S("threads", "Threads", "strings of light that vibrate in the piano's own modes", pal([0.9, 0.5, 0.3], [0.7, 0.6, 1.0], [0.8, 0.95, 1.0]),
    { trail: 0.35, elev: 0.0, dist: 4.4, spin: 0.0, size: 0.8 },
    { energy: 0.5, playful: 0.7, dark: 0.3, solo: 0.9, peak: 0.4, family: "geometric" }),
  S("ribbons", "Ribbons", "three twisting bands of light looping through space", pal([0.95, 0.4, 0.7], [0.5, 0.5, 1.0], [0.6, 1.0, 0.95]),
    { trail: 0.6, elev: 0.4, dist: 4.6 },
    { energy: 0.6, playful: 0.6, dark: 0.3, solo: 0.6, peak: 0.6, family: "flow" }),
  S("fireflies", "Fireflies", "slow wanderers that dart when the treble sparkles", pal([0.8, 1.0, 0.4], [1.0, 0.85, 0.4], [0.9, 1.0, 0.8]),
    { trail: 0.5, elev: 0.1, dist: 4.4, size: 1.8, maxD: 0.03, intensity: 1.5 },
    { energy: 0.3, playful: 0.8, dark: 0.3, solo: 0.9, peak: 0.1, family: "organic" }),
  S("ink", "Ink in Water", "clouds of light blooming from drops and unfurling", pal([0.25, 0.35, 1.0], [0.7, 0.3, 0.9], [0.95, 0.75, 1.0]),
    { trail: 0.78, elev: 0.15, dist: 4.4, intensity: 0.8, respawn: "ink", maxD: 0.5 },
    { energy: 0.35, playful: 0.2, dark: 0.8, solo: 0.7, peak: 0.4, family: "flow" }),
  S("branches", "Branching", "a fractal tree of light that breathes its angles", pal([1.0, 0.6, 0.3], [0.6, 0.9, 0.5], [1.0, 0.95, 0.8]),
    { trail: 0.45, elev: 0.1, dist: 5.0, spin: 0.03 },
    { energy: 0.35, playful: 0.2, dark: 0.3, solo: 0.6, peak: 0.6, family: "organic" }),
  S("geometry", "Sacred Geometry", "nested wireframes of light turning on their own bands", pal([1.0, 0.75, 0.35], [0.6, 0.5, 1.0], [0.85, 0.95, 1.0]),
    { trail: 0.5, elev: 0.35, dist: 5.2, size: 0.8 },
    { energy: 0.55, playful: 0.3, dark: 0.5, solo: 0.5, peak: 0.8, family: "geometric" }),
  S("orbitals", "Orbitals", "dozens of tilted rings, each orbit its own register", pal([1.0, 0.5, 0.3], [0.5, 0.6, 1.0], [0.9, 0.9, 1.0]),
    { trail: 0.6, elev: 0.5, dist: 5.2 },
    { energy: 0.6, playful: 0.4, dark: 0.4, solo: 0.5, peak: 0.9, family: "cosmic" }),
  S("waves", "Waves of Light", "a field of motes rolling like a sea of sound", pal([0.2, 0.4, 1.0], [0.3, 0.8, 0.9], [0.85, 1.0, 1.0]),
    { trail: 0.4, elev: 0.45, dist: 4.8, spin: 0.012 },
    { energy: 0.5, playful: 0.3, dark: 0.5, solo: 0.6, peak: 0.6, family: "flow" }),
  S("cymatics", "Cymatics", "sand of light finding the nodal lines of a resonating plate", pal([1.0, 0.8, 0.5], [0.8, 0.6, 1.0], [1.0, 1.0, 0.95]),
    { trail: 0.3, elev: 1.25, dist: 4.0, spin: 0.01, size: 0.9 },
    { energy: 0.5, playful: 0.6, dark: 0.3, solo: 0.9, peak: 0.5, family: "geometric" }),
  S("nebula", "Breathing Nebula", "a soft cloud that inhales on the bass", pal([0.6, 0.25, 0.9], [0.95, 0.4, 0.6], [0.6, 0.85, 1.0]),
    { trail: 0.7, elev: 0.3, dist: 5.0, intensity: 0.8, maxD: 0.6 },
    { energy: 0.25, playful: 0.1, dark: 0.7, solo: 0.7, peak: 0.7, family: "cosmic" }),
  S("arcs", "Arcs", "smooth bridges of light arching between poles", pal([0.5, 0.6, 1.0], [0.9, 0.6, 1.0], [1.0, 0.95, 1.0]),
    { trail: 0.5, elev: 0.25, dist: 5.0 },
    { energy: 0.55, playful: 0.4, dark: 0.5, solo: 0.6, peak: 0.6, family: "geometric" }),
  S("kaleido", "Kaleidoscope", "mirrored flow folded into eight sectors", pal([1.0, 0.4, 0.6], [0.5, 0.6, 1.0], [1.0, 0.9, 0.6]),
    { trail: 0.45, elev: 1.35, dist: 4.4, spin: 0.0 },
    { energy: 0.6, playful: 0.7, dark: 0.3, solo: 0.6, peak: 0.7, family: "geometric" }),
  S("helix", "Triple Spiral", "three strands twisting round a breathing column", pal([0.4, 0.9, 1.0], [0.7, 0.5, 1.0], [1.0, 0.9, 0.95]),
    { trail: 0.5, elev: 0.2, dist: 4.8, spin: 0.0 },
    { energy: 0.5, playful: 0.4, dark: 0.4, solo: 0.6, peak: 0.5, family: "geometric" }),
  S("knot", "Torus Knot", "a single thread of light tied into a turning knot", pal([1.0, 0.45, 0.25], [0.95, 0.4, 0.75], [0.6, 0.8, 1.0]),
    { trail: 0.55, elev: 0.5, dist: 4.6 },
    { energy: 0.5, playful: 0.4, dark: 0.5, solo: 0.7, peak: 0.6, family: "geometric" }),
  S("fountain", "Fountain", "light thrown upward that falls in slow arcs", pal([1.0, 0.7, 0.35], [0.6, 0.8, 1.0], [1.0, 1.0, 0.9]),
    { trail: 0.55, elev: 0.15, dist: 4.8, wrap: [0, 0, 1], respawn: "fountain", maxD: 0.45 },
    { energy: 0.7, playful: 0.8, dark: 0.2, solo: 0.5, peak: 0.6, family: "elemental" }),
  S("harmonics", "Harmonic Sphere", "a sphere that ripples in spherical harmonics, one band per order", pal([0.95, 0.5, 0.3], [0.5, 0.55, 1.0], [0.9, 1.0, 1.0]),
    { trail: 0.45, elev: 0.35, dist: 4.4 },
    { energy: 0.5, playful: 0.5, dark: 0.4, solo: 0.7, peak: 0.8, family: "cosmic" }),
  S("lissajous", "Lissajous", "a figure traced by the music's own intervals", pal([1.0, 0.6, 0.4], [0.7, 0.55, 1.0], [0.85, 1.0, 1.0]),
    { trail: 0.6, elev: 0.3, dist: 4.4, size: 0.9 },
    { energy: 0.45, playful: 0.6, dark: 0.3, solo: 0.8, peak: 0.5, family: "geometric" }),
  S("rings", "Resonant Rings", "concentric rings breathing outward on the bass", pal([1.0, 0.6, 0.35], [0.7, 0.55, 1.0], [0.85, 0.95, 1.0]),
    { trail: 0.45, elev: 0.3, dist: 4.4 },
    { energy: 0.45, playful: 0.4, dark: 0.4, solo: 0.8, peak: 0.7, family: "geometric" }),
  S("rose", "Rose Curves", "nested rhodonea petals turning against each other", pal([1.0, 0.5, 0.55], [0.7, 0.55, 1.0], [1.0, 0.92, 0.85]),
    { trail: 0.5, elev: 1.1, dist: 4.2, spin: 0.0, size: 0.85 },
    { energy: 0.4, playful: 0.5, dark: 0.2, solo: 0.8, peak: 0.6, family: "geometric" }),
  S("spirograph", "Spirograph", "a hypotrochoid drawn by the music's own gears", pal([1.0, 0.65, 0.35], [0.55, 0.6, 1.0], [0.95, 1.0, 1.0]),
    { trail: 0.55, elev: 1.0, dist: 4.4, spin: 0.0, size: 0.85 },
    { energy: 0.5, playful: 0.7, dark: 0.3, solo: 0.8, peak: 0.6, family: "geometric" }),
  S("superformula", "Superformula", "a shell of light whose symmetry the harmony rewrites", pal([0.9, 0.45, 0.8], [0.45, 0.7, 1.0], [1.0, 0.95, 0.8]),
    { trail: 0.45, elev: 0.4, dist: 4.4, size: 0.85 },
    { energy: 0.5, playful: 0.4, dark: 0.5, solo: 0.6, peak: 0.9, family: "geometric" }),
  S("polyhedron", "Platonic Light", "edges of a turning platonic solid, its star nested inside", pal([1.0, 0.7, 0.4], [0.6, 0.5, 1.0], [0.9, 0.97, 1.0]),
    { trail: 0.5, elev: 0.35, dist: 5.0, size: 0.8 },
    { energy: 0.55, playful: 0.3, dark: 0.5, solo: 0.6, peak: 0.85, family: "geometric" }),
  S("mandala", "Mandala", "rings of n-fold petals, each ring its own register", pal([1.0, 0.55, 0.35], [0.85, 0.45, 0.9], [1.0, 0.95, 0.8]),
    { trail: 0.45, elev: 1.3, dist: 4.2, spin: 0.0, size: 0.85 },
    { energy: 0.45, playful: 0.5, dark: 0.3, solo: 0.8, peak: 0.8, family: "geometric" }),
  S("spirit", "Spirit", "a veiled presence of light drifting through, trailing wisps", pal([0.75, 0.8, 1.0], [1.0, 0.75, 0.85], [1.0, 1.0, 1.0]),
    { trail: 0.8, elev: 0.05, dist: 5.2, spin: 0.0, intensity: 0.7, size: 0.85, maxD: 0.55 },
    { energy: 0.3, playful: 0.1, dark: 0.6, solo: 0.9, peak: 0.4, family: "flow" }),
  S("torus", "Torus Lattice", "a woven torus of light rolling through itself", pal([0.45, 0.75, 1.0], [0.9, 0.5, 0.85], [1.0, 0.95, 0.85]),
    { trail: 0.5, elev: 0.45, dist: 4.8, size: 0.85 },
    { energy: 0.55, playful: 0.4, dark: 0.4, solo: 0.6, peak: 0.8, family: "geometric" }),
  S("flame", "Flame", "tongues of light rising from a hearth, flickering, gusting on the bass", pal([0.25, 0.4, 1.0], [1.0, 0.85, 0.45], [1.0, 0.35, 0.08]),
    { trail: 0.6, elev: 0.08, dist: 4.4, spin: 0.0, intensity: 1.1, respawn: "rise", riseTop: 1.0, heightColor: true, maxD: 0.7 },
    { energy: 0.7, playful: 0.4, dark: 0.5, solo: 0.8, peak: 0.8, family: "elemental" }),
  S("wisp", "Wisps", "slow curls of light rising and unravelling like incense", pal([0.5, 0.45, 0.9], [0.85, 0.7, 1.0], [1.0, 0.95, 1.0]),
    { trail: 0.75, elev: 0.1, dist: 4.6, spin: 0.0, intensity: 0.85, respawn: "rise", riseTop: 1.35, maxD: 0.55 },
    { energy: 0.3, playful: 0.2, dark: 0.5, solo: 0.8, peak: 0.4, family: "flow" }),
  S("blossom", "Blossom", "layered petals of light unfurling and closing, each layer turning its own way", pal([1.0, 0.45, 0.6], [1.0, 0.75, 0.55], [1.0, 0.95, 0.85]),
    { trail: 0.45, elev: 1.0, dist: 4.2, spin: 0.0, size: 0.85 },
    { energy: 0.4, playful: 0.4, dark: 0.2, solo: 0.8, peak: 0.8, family: "organic" }),
  S("caustic", "Water Light", "a pool of light shimmering like caustics on a sunlit floor", pal([0.2, 0.5, 1.0], [0.35, 0.85, 0.95], [0.9, 1.0, 1.0]),
    { trail: 0.5, elev: 1.25, dist: 4.4, spin: 0.0, size: 0.85 },
    { energy: 0.35, playful: 0.3, dark: 0.4, solo: 0.7, peak: 0.5, family: "flow" }),
  S("petalfall", "Petal Fall", "petals of light spiralling down through a column, fluttering", pal([1.0, 0.5, 0.65], [1.0, 0.75, 0.8], [1.0, 0.95, 0.9]),
    { trail: 0.5, elev: 0.15, dist: 4.6, spin: 0.0, size: 1.8, respawn: "rise", riseTop: -1.15, maxD: 0.1, intensity: 1.6 },
    { energy: 0.3, playful: 0.5, dark: 0.2, solo: 0.8, peak: 0.4, family: "organic" }),
  S("girih", "Girih Lattice", "a tiled field of star rosettes and interlacing strapwork, cells counter-turning", pal([1.0, 0.75, 0.4], [0.55, 0.75, 1.0], [0.95, 0.95, 1.0]),
    { trail: 0.4, elev: 1.3, dist: 4.2, spin: 0.0, size: 0.75 },
    { energy: 0.5, playful: 0.4, dark: 0.4, solo: 0.8, peak: 0.9, family: "geometric" }),
  S("medallion", "Medallion", "an Islamic rosette — nested star rings turning against each other, petal arcs between", pal([1.0, 0.7, 0.35], [0.6, 0.6, 1.0], [1.0, 0.95, 0.9]),
    { trail: 0.4, elev: 1.3, dist: 4.0, spin: 0.0, size: 0.75 },
    { energy: 0.5, playful: 0.4, dark: 0.4, solo: 0.9, peak: 0.95, family: "geometric" }),
];

/**
 * The GATHERING language (Karel 2026-10-05, v3: "i like when they gather and
 * move and make evolving geometric shape overlays you can see … i dont like
 * when you fill the screen out of nowhere with them all moving quickly").
 * Only these compact, legible forms are cast in journeys; the volume-filling
 * souls (embers, dust storm, fountain, fireflies, petals, pollen, smoke,
 * ink, nebula, motes, waves, murmuration, tendrils) remain in the lab only.
 */
export const SHAPE_SOULS: readonly SoulId[] = [
  // v9 balance (Karel 2026-10-06): 3-D organic forms lead, intricate 2-D accents.
  // Mirrors ORGANIC_SOULS (particle-motifs.ts).
  "ribbons", "murmuration", "vortex", "tendrils", "wisp",
  "girih", "medallion", "mandala", "kaleido", "blossom", "caustic",
];

export function soulById(id: SoulId): SoulPreset {
  const s = SOULS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown soul ${id}`);
  return s;
}

export function lerpPalette(a: ParticlePalette, b: ParticlePalette, t: number): ParticlePalette {
  const l = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return { low: l(a.low, b.low), mid: l(a.mid, b.mid), high: l(a.high, b.high) };
}

/** Square texture side for a requested particle count (clamped 64..1024). */
export function texSideFor(count: number): number {
  const side = Math.round(Math.sqrt(Math.max(1, count)));
  return Math.max(64, Math.min(1024, side));
}

/**
 * Luminance governor (WCAG 2.3.1 guard). Given the measured mean displayed
 * luminance and the current exposure, return the next exposure: pulled down
 * when the frame exceeds `cap`, relaxed back toward `base` otherwise, never
 * changing by more than `maxStep` (fraction) per update — so global
 * brightness can only ever drift, never flash.
 */
export function governExposure(
  exposure: number,
  meanLum: number,
  opts: { cap?: number; base?: number; maxStep?: number; min?: number } = {},
): number {
  const cap = opts.cap ?? 0.13;
  const base = opts.base ?? 1;
  const maxStep = opts.maxStep ?? 0.02;
  const min = opts.min ?? 0.15;
  let want = base;
  if (meanLum > cap && meanLum > 1e-6) want = Math.min(base, exposure * (cap / meanLum));
  const ratio = Math.max(1 - maxStep, Math.min(1 + maxStep, want / Math.max(exposure, 1e-6)));
  return Math.max(min, Math.min(base, exposure * ratio));
}

// ── image dissolve ↔ reform timeline ─────────────────────────────────────────
/** Total length of one dissolve (s). */
export const DISSOLVE_SEC = 10.5;
/** When the field snaps onto the outgoing still (after the world fades). */
export const DISSOLVE_SNAP_SEC = 1.6;

export interface DissolveEnvelope {
  /** world element visibility 0..1 */
  worldFade: number;
  /** image presence 0..1 (particles wear the stills) */
  imgShow: number;
  /** spring toward the image plane 0..1 (0 = released to swirl) */
  imgForm: number;
  /** outgoing → incoming still colours */
  colorMix: number;
}

const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The dissolve, t seconds after a still change (null = idle):
 *  0.0–0.6  world element fades out (no particle ever pops)
 *  0.6      snap onto the image plane — invisible (imgShow still 0)
 *  0.6–2.0  the outgoing still materialises AS particles
 *  2.3–5.0  it breaks: released into a music-driven swirl, colours turning
 *           toward the incoming still (2.8–5.5)
 *  5.0–7.5  reform: the swirl reassembles into the incoming still
 *  8.3–10.0 the particle still dissolves into the real one beneath
 *  9.0–10.5 the world element returns
 * Every ramp is a smoothstep — nothing in this sequence is abrupt.
 */
export function dissolveEnvelope(t: number | null): DissolveEnvelope {
  if (t === null || t < 0 || t >= DISSOLVE_SEC) return { worldFade: 1, imgShow: 0, imgForm: 0, colorMix: 0 };
  // the world form FADES (1.5 s — a 0.6 s fade read as a drop-out, Karel
  // 2026-10-06) before the invisible snap onto the image plane
  const worldFade = 1 - ss(0, 1.5, t) + ss(9.0, DISSOLVE_SEC, t);
  const imgShow = ss(DISSOLVE_SNAP_SEC, 3.0, t) * (1 - ss(8.3, 10.0, t));
  const imgForm = t < 5.6 ? ss(0.1, DISSOLVE_SNAP_SEC, t) * (1 - ss(3.2, 5.6, t)) : ss(5.6, 7.8, t) * (1 - ss(9.6, DISSOLVE_SEC, t));
  const colorMix = ss(3.4, 6.0, t);
  return { worldFade: Math.min(1, worldFade), imgShow, imgForm, colorMix };
}
