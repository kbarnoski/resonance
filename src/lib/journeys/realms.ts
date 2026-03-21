import type { Realm } from "./types";

export const REALMS: Realm[] = [
  {
    id: "heaven",
    name: "Heaven",
    subtitle: "dissolution into golden light",
    visualVocabulary: {
      environments: [
        "infinite cathedral of light",
        "clouds parting to reveal golden geometry",
        "sunlit marble hall dissolving into warmth",
        "vast amber sky with luminous pillars",
      ],
      entities: [
        "translucent wings folding into light",
        "golden threads weaving through space",
        "halos expanding into sacred rings",
        "light beings dissolving into particles",
      ],
      textures: [
        "molten gold flowing over marble",
        "warm light refracting through crystal",
        "soft focus radiance",
        "divine fog with embedded sparkles",
      ],
      atmospheres: [
        "overwhelming peace",
        "blissful dissolution",
        "warm embrace of infinite light",
        "ecstatic stillness",
      ],
    },
    shaderModes: [
      "astral", "sacred", "ethereal", "aurora", "ascension", "revelation",
      "prismatic", "dissolution", "stardust", "fibonacci", "mandala", "nebula",
      "solstice", "helix", "drift", "expanse",
    ],
    palette: {
      primary: "#1a1408",
      secondary: "#2e2410",
      accent: "#f0c040",
      glow: "#ffd866",
    },
    defaultVoice: "shimmer",
    poetryMood: "transcendent",
    poetryImagery:
      "golden light, cathedral ceilings, dissolving boundaries, warm radiance, infinite peace, ascending warmth, luminous fog",
  },
  {
    id: "hell",
    name: "Hell",
    subtitle: "the last judgement",
    visualVocabulary: {
      environments: [
        "infinite pit descending into churning fire, writhing figures falling through darkness without end",
        "Bosch nightmare landscape stretching to every horizon, broken wheels and burning towers in infinite recession",
        "vast lake of fire under a black sky with no stars, the shore unreachable in every direction",
        "inverted cathedral sinking infinitely downward, each level darker and more terrible than the last",
      ],
      entities: [
        "towering demon silhouettes against infinite fire, horned forms judging from impossible heights",
        "writhing masses of the damned cascading downward forever into the pit",
        "enormous serpentine leviathan coiling through infinite darkness, scales reflecting hellfire",
        "skeletal figures with burning eyes emerging from infinite shadow, pointing downward",
      ],
      textures: [
        "flesh becoming stone becoming fire becoming darkness in infinite cycle",
        "cracked earth revealing infinite depths of molten suffering beneath",
        "smoke and ash rising forever from burning ground that has no end",
        "blood-red light filtering through infinite layers of tortured stone",
      ],
      atmospheres: [
        "absolute dread of infinite descent with no bottom",
        "the weight of eternal judgement pressing from all sides",
        "terror at the scale of suffering stretching beyond comprehension",
        "the overwhelming presence of something ancient and merciless watching",
      ],
    },
    shaderModes: [
      "inferno", "chasm", "crypt", "obsidian", "phantom", "wraith",
      "umbra", "plasma", "torrent", "monolith", "abyss",
      "warp", "fractal", "eclipse", "rapture",
    ],
    palette: {
      primary: "#0a0000",
      secondary: "#1a0505",
      accent: "#c01010",
      glow: "#e03020",
    },
    defaultVoice: "onyx",
    poetryMood: "intense",
    poetryImagery:
      "infinite descent, the last judgement, demonic silhouettes, writhing damned, lake of fire, Bosch nightmare, leviathan in darkness, eternal torment, burning horizon, judgement without mercy",
  },
  {
    id: "garden",
    name: "The Garden",
    subtitle: "where living math breathes",
    visualVocabulary: {
      environments: [
        "bioluminescent jungle at midnight",
        "grove of trees made of light",
        "meadow where flowers are fractals",
        "ancient forest floor with glowing mycelium",
      ],
      entities: [
        "butterflies made of stained glass",
        "vines that grow in fibonacci spirals",
        "mushrooms pulsing with inner light",
        "foxfire creatures weaving through roots",
      ],
      textures: [
        "phosphorescent moss on ancient bark",
        "dew drops containing tiny galaxies",
        "bark patterns becoming sacred geometry",
        "petal surfaces with microscopic universes",
      ],
      atmospheres: [
        "electric fertility",
        "organic intelligence",
        "life growing at visible speed",
        "symbiotic wonder",
      ],
    },
    shaderModes: [
      "mycelium", "sacred", "liquid", "ethereal", "bloom", "spore",
      "chrysalis", "growth", "fibonacci", "dendrite", "membrane", "lichen",
      "moss", "coral", "plankton", "tide",
    ],
    palette: {
      primary: "#081a08",
      secondary: "#0a2e0a",
      accent: "#40e080",
      glow: "#66ffa0",
    },
    defaultVoice: "nova",
    poetryMood: "mystical",
    poetryImagery:
      "bioluminescent jungle, breathing flora, living mathematics, mycelium networks, phosphorescent spores, fractal growth, organic light",
  },
  {
    id: "ocean",
    name: "The Ocean",
    subtitle: "abyssal depth, weightless light",
    visualVocabulary: {
      environments: [
        "abyssal trench lit by bioluminescence",
        "underwater cathedral of coral",
        "kelp forest with shafts of surface light",
        "open water where dark meets light",
      ],
      entities: [
        "jellyfish trailing light filaments",
        "leviathan silhouette in the deep",
        "schools of fish moving as one mind",
        "deep-sea creatures with lantern eyes",
      ],
      textures: [
        "caustic light patterns on sand",
        "bioluminescent currents in dark water",
        "bubble trails catching ambient light",
        "coral surfaces with internal glow",
      ],
      atmospheres: [
        "weightless suspension",
        "pressure and silence",
        "vast unknowable depth",
        "gentle buoyancy",
      ],
    },
    shaderModes: [
      "liquid", "cosmos", "ethereal", "tide", "ocean",
      "whirlpool", "current", "delta", "plankton", "coral", "membrane",
      "drift", "nebula", "abyss", "cascade",
    ],
    palette: {
      primary: "#050a1a",
      secondary: "#0a142e",
      accent: "#3080d0",
      glow: "#50a0f0",
    },
    defaultVoice: "shimmer",
    poetryMood: "flowing",
    poetryImagery:
      "abyssal depths, bioluminescent currents, weightless suspension, underwater light, deep silence, tidal breathing, luminous jellyfish",
  },
  {
    id: "machine",
    name: "The Machine",
    subtitle: "digital synapses firing",
    visualVocabulary: {
      environments: [
        "infinite server room with pulsing lights",
        "circuit board landscape at nano scale",
        "data center cathedral with fiber optic stained glass",
        "neural network visualized as architecture",
      ],
      entities: [
        "data packets flowing as light streams",
        "AI consciousness emerging as geometry",
        "digital ghosts in the machine",
        "code compiling into visual form",
      ],
      textures: [
        "holographic circuit patterns",
        "pixel grids dissolving into meaning",
        "scan lines revealing hidden data",
        "digital rain forming structures",
      ],
      atmospheres: [
        "cold intelligence",
        "electric precision",
        "overwhelming computation",
        "synthetic transcendence",
      ],
    },
    shaderModes: [
      "neon", "tesseract", "warp", "fractal", "lattice", "helix",
      "meridian", "prism", "moire", "spiral", "geodesic", "weave",
      "plasma", "pulsar", "penrose", "torus",
    ],
    palette: {
      primary: "#08081a",
      secondary: "#0a0a2e",
      accent: "#40f0e0",
      glow: "#66fff0",
    },
    defaultVoice: "echo",
    poetryMood: "chaotic",
    poetryImagery:
      "digital synapses, data streams, circuit cathedrals, electric precision, holographic code, silicon dreams, neural pulses",
  },
  {
    id: "cosmos",
    name: "The Cosmos",
    subtitle: "vast silence between stars",
    visualVocabulary: {
      environments: [
        "nebula nursery birthing stars",
        "edge of a supermassive black hole",
        "interstellar void between galaxies",
        "planet surface with alien aurora",
      ],
      entities: [
        "stars being born from gas clouds",
        "comets trailing phosphorescent tails",
        "dark matter rendered visible",
        "gravitational lensing warping light",
      ],
      textures: [
        "cosmic dust in impossible colors",
        "star surface plasma in motion",
        "nebula gas in ultraviolet",
        "asteroid surface with crystal deposits",
      ],
      atmospheres: [
        "incomprehensible scale",
        "cosmic loneliness",
        "stellar birth and death",
        "gravitational awe",
      ],
    },
    shaderModes: [
      "cosmos", "astral", "warp", "nebula", "stardust",
      "supernova", "pulsar", "quasar", "singularity", "corona", "solstice",
      "drift", "expanse", "horizon", "abyss",
    ],
    palette: {
      primary: "#05051a",
      secondary: "#0a0a2e",
      accent: "#6060e0",
      glow: "#8080ff",
    },
    defaultVoice: "fable",
    poetryMood: "dreamy",
    poetryImagery:
      "nebulae forming, star birth, vast silence, gravitational waves, cosmic dust, infinite expansion, interstellar drift",
  },
  {
    id: "temple",
    name: "The Temple",
    subtitle: "sacred geometry in ancient stone",
    visualVocabulary: {
      environments: [
        "ancient stone chamber with golden ratio architecture",
        "temple carved from a single crystal",
        "sacred grove with standing stones aligned to stars",
        "monastery at the edge of the world",
      ],
      entities: [
        "mandalas spinning in three dimensions",
        "sacred geometry unfolding from a point",
        "prayer wheels generating visual harmonics",
        "golden spirals in stone and light",
      ],
      textures: [
        "ancient stone with embedded geometry",
        "incense smoke forming perfect patterns",
        "candlelight on worn marble",
        "moss growing in fibonacci on temple walls",
      ],
      atmospheres: [
        "ancient reverence",
        "mathematical divinity",
        "timeless contemplation",
        "sacred stillness",
      ],
    },
    shaderModes: [
      "sacred", "mandala", "tesseract", "astral", "fibonacci", "oracle",
      "revelation", "prophecy", "glyph", "sigil", "lattice", "helix",
      "prism", "temple", "geodesic", "penrose",
    ],
    palette: {
      primary: "#141008",
      secondary: "#1e1810",
      accent: "#c0a060",
      glow: "#e0c080",
    },
    defaultVoice: "fable",
    poetryMood: "transcendent",
    poetryImagery:
      "sacred geometry, ancient stone, golden ratio, incense spirals, candlelight, monastery silence, mathematical divinity",
  },
  {
    id: "labyrinth",
    name: "The Labyrinth",
    subtitle: "infinite corridors of the mind",
    visualVocabulary: {
      environments: [
        "infinite stone corridors branching in every direction, each passage identical and endless",
        "Piranesi prison of impossible staircases ascending and descending into infinite darkness",
        "Borgesian library of hexagonal rooms repeating without end in every direction",
        "mirrored hallway reflecting itself into infinite regression, the reflections growing darker",
      ],
      entities: [
        "your own silhouette glimpsed at the end of infinite corridors, always turning a corner",
        "threads of light tracing paths through infinite passages, never reaching their destination",
        "doors opening onto doors opening onto doors, each threshold revealing another",
        "shadow of something vast moving through parallel corridors just out of sight",
      ],
      textures: [
        "worn stone floors polished by infinite footsteps that never arrived anywhere",
        "walls covered in fading maps of the labyrinth that are themselves labyrinths",
        "torchlight dying into infinite distance along corridors with no end",
        "dust suspended in still air that has been still for infinite time",
      ],
      atmospheres: [
        "the vertigo of infinite identical choices",
        "profound solitude in a space that goes on forever",
        "the eerie peace of being permanently, beautifully lost",
        "time dissolving in a space where every direction is the same",
      ],
    },
    shaderModes: [
      "temple", "crypt", "lattice", "tesseract", "spiral",
      "moire", "penrose", "meridian", "weave", "portal", "threshold",
      "fog", "monolith", "phantom", "geodesic",
    ],
    palette: {
      primary: "#0a0a08",
      secondary: "#1a1810",
      accent: "#a09070",
      glow: "#c0a880",
    },
    defaultVoice: "alloy",
    poetryMood: "hypnotic",
    poetryImagery:
      "infinite corridors, Borgesian maze, Piranesi staircases, endless passages, mirrored regression, the mind turning inward forever, beautiful lostness",
  },
  {
    id: "mountain",
    name: "The Mountain",
    subtitle: "infinite ascent into thin air",
    visualVocabulary: {
      environments: [
        "infinite ridge ascending into clouds that never clear, the summit always above",
        "vast vertical cliff face stretching infinitely upward, handholds vanishing into mist",
        "mountain range extending to every horizon, peaks behind peaks behind peaks without end",
        "the view from impossible height where the earth curves away infinitely below",
      ],
      entities: [
        "clouds parting to reveal another peak above, always another peak above that",
        "eagles circling at heights that make them invisible, their paths tracing infinite spirals",
        "ancient stone cairns marking a path that climbs forever into thin light",
        "avalanche in slow motion cascading down infinite slopes, snow becoming clouds",
      ],
      textures: [
        "granite face with infinite fractal cracks, each crack containing smaller mountains",
        "ice crystals forming and reforming in wind that has blown forever",
        "thin atmosphere where light bends and the sky darkens toward infinite space",
        "snow covering rock covering snow in infinite geological layers",
      ],
      atmospheres: [
        "the vertigo of infinite height with no summit",
        "thin air that makes thoughts feel infinite and clear",
        "overwhelming solitude above the world, above everything",
        "the sacred exhaustion of climbing toward something unreachable",
      ],
    },
    shaderModes: [
      "astral", "fog", "horizon", "expanse", "drift", "solstice",
      "corona", "aurora", "stardust", "nebula", "oracle", "field",
      "revelation", "threshold", "dissolution", "cosmos",
    ],
    palette: {
      primary: "#080a10",
      secondary: "#101520",
      accent: "#8090b0",
      glow: "#a0b0d0",
    },
    defaultVoice: "fable",
    poetryMood: "transcendent",
    poetryImagery:
      "infinite ascent, unreachable summit, thin air, vast height, peaks beyond peaks, vertigo of altitude, clouds below, sacred exhaustion, the climb without end",
  },
  {
    id: "desert",
    name: "The Desert",
    subtitle: "infinite silence under infinite sky",
    visualVocabulary: {
      environments: [
        "sand dunes extending to every horizon without a single landmark, infinite and identical",
        "salt flat reflecting infinite sky, the horizon dissolved into white light",
        "night desert under infinite stars, the Milky Way a river of light from horizon to horizon",
        "wind-carved rock formations standing alone in infinite empty space",
      ],
      entities: [
        "mirages shimmering at infinite distance, cities and lakes that don't exist",
        "single figure walking toward a horizon that never arrives",
        "sand moving in waves like a slow ocean, reshaping infinity",
        "the shadow of a cloud crossing infinite ground, the only movement in the world",
      ],
      textures: [
        "sand grains at microscopic scale revealing infinite crystalline worlds",
        "cracked earth in patterns that repeat at every scale to infinity",
        "heat shimmer distorting the infinite distance into liquid",
        "starlight on sand making every grain a tiny distant sun",
      ],
      atmospheres: [
        "the absolute silence of infinite empty space",
        "time stopping in heat that has no source and no end",
        "existential vastness where the self becomes a point",
        "the paradox of emptiness that is completely full of light",
      ],
    },
    shaderModes: [
      "horizon", "dusk", "expanse", "umbra", "solstice", "drift",
      "fog", "corona", "dissolution", "stardust", "ember", "flux",
      "abyss", "singularity", "mesa",
    ],
    palette: {
      primary: "#1a1408",
      secondary: "#2e2410",
      accent: "#d0a050",
      glow: "#e0b860",
    },
    defaultVoice: "nova",
    poetryMood: "mystical",
    poetryImagery:
      "infinite dunes, horizon dissolved, existential vastness, mirage shimmer, sand ocean, absolute silence, starlit desert, emptiness as fullness, the walk without arrival",
  },
  {
    id: "archive",
    name: "The Archive",
    subtitle: "infinite library of everything",
    visualVocabulary: {
      environments: [
        "infinite shelves of books stretching upward and outward beyond sight in every direction",
        "Library of Babel: hexagonal rooms connecting infinitely, each containing every possible book",
        "reading room with a single lamp, but the walls of shelves recede into infinite darkness",
        "spiral staircase winding infinitely downward through levels of accumulated knowledge",
      ],
      entities: [
        "pages turning themselves in infinite sequence, each page containing another library",
        "dust motes floating in lamplight, each mote containing infinite text",
        "the ghost of every author standing at infinite distance between the shelves",
        "a book that when opened contains the archive itself, recursing infinitely",
      ],
      textures: [
        "aged paper with text that resolves into smaller text at every magnification",
        "leather spines in warm light, identical and infinite, stretching to vanishing point",
        "ink on vellum where each letter is a window into another written world",
        "wood and brass and glass of infinite reading lamps, each casting its own finite circle",
      ],
      atmospheres: [
        "the hush of infinite knowledge waiting to be read",
        "warm solitude among infinite companions (the books)",
        "the terror and comfort of knowing everything is written somewhere",
        "time measured in pages turned, each page an eternity",
      ],
    },
    shaderModes: [
      "temple", "lattice", "prophecy", "fog", "oracle", "glyph",
      "sacred", "spiral", "moire", "penrose", "sigil", "threshold",
      "revelation", "weave", "meridian", "chronos",
    ],
    palette: {
      primary: "#10100a",
      secondary: "#1e1810",
      accent: "#b09060",
      glow: "#d0a870",
    },
    defaultVoice: "fable",
    poetryMood: "dreamy",
    poetryImagery:
      "infinite library, Library of Babel, endless shelves, knowledge without end, lamplight in darkness, pages turning forever, recursive books, the hush of infinite wisdom",
  },
  {
    id: "storm",
    name: "The Storm",
    subtitle: "infinite electricity in infinite sky",
    visualVocabulary: {
      environments: [
        "infinite thunderhead towering upward beyond sight, the cloud itself a dark continent",
        "lightning illuminating infinite horizons in every direction, each flash revealing more storm",
        "the eye of an infinite hurricane, calm center surrounded by infinite rotating walls of cloud",
        "infinite dark ocean under infinite dark sky, the two infinities meeting at a line of white foam",
      ],
      entities: [
        "lightning branching infinitely downward, each fork splitting into infinite forks",
        "the storm itself as a living intelligence of infinite scale, breathing and turning",
        "rain falling from infinite height, each drop carrying light from impossible distance",
        "wind visible as flowing infinite streams of energy curving around the world",
      ],
      textures: [
        "cloud surface in infinite detail, fractal turbulence at every scale",
        "rain streaks catching lightning flash, infinite parallel lines of silver light",
        "electrical discharge patterns branching like infinite nervous systems",
        "dark water reflecting darker sky, the reflection deeper than the original",
      ],
      atmospheres: [
        "the raw infinite power of electrical discharge across infinite sky",
        "the pressure drop before something enormous and endless arrives",
        "being inside the engine of weather at infinite scale",
        "the sublime terror of infinite natural force",
      ],
    },
    shaderModes: [
      "storm", "plasma", "chasm", "wraith", "torrent", "inferno",
      "flux", "cascade", "current", "whirlpool", "warp",
      "abyss", "eclipse", "delta", "umbra",
    ],
    palette: {
      primary: "#050510",
      secondary: "#0a0a1a",
      accent: "#6070c0",
      glow: "#8090e0",
    },
    defaultVoice: "echo",
    poetryMood: "chaotic",
    poetryImagery:
      "infinite storm, lightning without end, thunderhead continent, dark electricity, infinite rain, the hurricane eye, sublime terror, weather as god, the infinite discharge",
  },
  {
    id: "winter",
    name: "Winter",
    subtitle: "crystalline silence, infinite white",
    visualVocabulary: {
      environments: [
        "frozen landscapes",
        "ice caverns",
        "endless snowfields",
        "aurora borealis over glaciers",
      ],
      entities: [
        "ice crystals forming",
        "snowflakes under microscope",
        "frost patterns on glass",
        "northern lights dancing",
      ],
      textures: [
        "ice with embedded air bubbles",
        "hoarfrost on branches",
        "fresh snow catching starlight",
        "frozen water mid-splash",
      ],
      atmospheres: [
        "deep cold stillness",
        "the silence after snowfall",
        "crystalline clarity",
        "hushed reverence",
      ],
    },
    shaderModes: [
      "snow", "fog", "aurora", "ethereal", "drift", "expanse",
      "dissolution", "prismatic", "solstice", "membrane",
      "threshold", "tide", "stardust", "glacier", "cosmos",
    ],
    palette: {
      primary: "#080a12",
      secondary: "#101520",
      accent: "#90b8e0",
      glow: "#b0d0f0",
    },
    defaultVoice: "shimmer",
    poetryMood: "melancholic",
    poetryImagery:
      "crystalline silence, frozen geometry, endless white, ice cathedral, northern lights, hoarfrost patterns, the stillness of deep winter, starlight on snow",
  },
  {
    id: "spring",
    name: "Spring",
    subtitle: "emergence after the long dark",
    visualVocabulary: {
      environments: [
        "thawing forest floor with first green shoots",
        "cherry blossoms in soft rain",
        "meadow at dawn with morning mist",
        "streams running with snowmelt",
      ],
      entities: [
        "buds unfurling in time-lapse",
        "petals carried on warm wind",
        "insects waking from dormancy",
        "birdsong made visible as color",
      ],
      textures: [
        "wet bark glistening in new sun",
        "dew on spider webs",
        "pollen clouds in slanted light",
        "new leaves translucent with backlight",
      ],
      atmospheres: [
        "tender anticipation",
        "the fragility of new growth",
        "gentle warming",
        "the relief of return",
      ],
    },
    shaderModes: [
      "bloom", "mycelium", "liquid", "growth", "spore", "chrysalis",
      "dendrite", "lichen", "moss", "ethereal", "coral", "tide",
      "membrane", "fibonacci", "plankton", "flux",
    ],
    palette: {
      primary: "#0a1208",
      secondary: "#142010",
      accent: "#80c060",
      glow: "#a0e080",
    },
    defaultVoice: "nova",
    poetryMood: "dreamy",
    poetryImagery:
      "first green shoots, thawing earth, cherry blossom rain, morning mist, tender emergence, snowmelt streams, the fragility of beginning",
  },
  {
    id: "summer",
    name: "Summer",
    subtitle: "heat, light, the long golden hours",
    visualVocabulary: {
      environments: [
        "endless golden field under blazing sun",
        "coast with turquoise water and white sand",
        "thunderstorm building over prairie",
        "night garden alive with fireflies",
      ],
      entities: [
        "heat shimmer distorting the horizon",
        "cicadas vibrating the air itself",
        "wildflowers bending in hot wind",
        "lightning bugs mapping the dark",
      ],
      textures: [
        "sun-bleached wood grain",
        "light through tall grass",
        "water droplets on sun-warmed skin",
        "star trails over warm earth",
      ],
      atmospheres: [
        "languid heat",
        "the fullness of peak daylight",
        "electric evening storms",
        "warm darkness alive with sound",
      ],
    },
    shaderModes: [
      "dusk", "ember", "storm", "prismatic", "solstice", "corona",
      "horizon", "aurora", "bloom", "flux", "cascade", "fog",
      "tide", "supernova", "delta", "current",
    ],
    palette: {
      primary: "#1a1408",
      secondary: "#2e2010",
      accent: "#e0a040",
      glow: "#f0c060",
    },
    defaultVoice: "alloy",
    poetryMood: "flowing",
    poetryImagery:
      "golden hours, heat shimmer, firefly dark, languid warmth, sun-bleached surfaces, prairie lightning, turquoise water, the fullness of long days",
  },
  {
    id: "autumn",
    name: "Autumn",
    subtitle: "the beautiful letting go",
    visualVocabulary: {
      environments: [
        "forest ablaze with turning leaves stretching to every horizon",
        "fog rolling through bare orchards at dawn",
        "harvest moon rising enormous over dark fields",
        "rain on fallen leaves",
      ],
      entities: [
        "leaves falling in spiraling descent",
        "migrating birds in vast formations",
        "last light catching spider silk",
        "mushrooms emerging from decay",
      ],
      textures: [
        "bark of ancient trees",
        "crushed leaves releasing scent",
        "woodsmoke curling through cold air",
        "rain on windowpane",
      ],
      atmospheres: [
        "the ache of impermanence",
        "rich melancholy",
        "grateful release",
        "the beauty of decline",
      ],
    },
    shaderModes: [
      "ember", "fog", "dissolution", "dendrite", "dusk", "drift",
      "moss", "lichen", "membrane", "tide", "flux", "mycelium",
      "spore", "cascade", "stardust", "horizon",
    ],
    palette: {
      primary: "#1a0e08",
      secondary: "#2e1810",
      accent: "#c07030",
      glow: "#e09050",
    },
    defaultVoice: "fable",
    poetryMood: "melancholic",
    poetryImagery:
      "turning leaves, beautiful decay, harvest moon, woodsmoke, grateful release, the ache of impermanence, fog through bare branches, last warm light",
  },
  {
    id: "spirit",
    name: "The Spirit",
    subtitle: "the infinite inner landscape",
    visualVocabulary: {
      environments: [
        "an infinite cathedral made of starlight, where every window opens onto a different galaxy, and the floor is still water reflecting everything",
        "a forest that exists between dimensions — trees made of sacred geometry, roots that are rivers of light, canopy that is the night sky itself",
        "the space between thoughts, where time has never existed, vast and warm and impossibly gentle, every color ever imagined living here simultaneously",
        "a mountain that rises forever, each altitude a different emotion, clouds made of memory, the summit always just above you, always close enough to feel",
      ],
      entities: [
        "a figure made entirely of light, standing at the edge of an infinite ocean, their reflection going deeper than the water",
        "thousands of luminous threads connecting every living thing, visible for one moment, each one vibrating with a different name",
        "a spiral of golden particles ascending through darkness, each particle a prayer someone once whispered and thought no one heard",
        "an ancient tree with roots in the earth and branches in the stars, leaves that are tiny universes, bark inscribed with every language",
      ],
      textures: [
        "light passing through crystal and separating into every feeling that has ever been felt",
        "the surface of still water at the exact moment before a raindrop lands, holding all possibility",
        "smoke from sacred fires dissolving into constellations, each star a different moment of grace",
        "veins of gold running through black stone, the precious hidden inside the dark, always there, always glowing",
      ],
      atmospheres: [
        "the feeling of being held by something too large to name, warm and infinite and unafraid",
        "awe so deep it becomes silence, the kind that exists in the presence of the genuinely sacred",
        "joy and grief existing in the same breath, the bittersweet truth that love is always close to loss",
        "the absolute peace that comes after surrendering everything, when there is nothing left to carry and nothing left to fear",
      ],
    },
    shaderModes: [
      "astral", "sacred", "ethereal", "mandala", "dissolution",
      "aurora", "nebula", "stardust", "mycelium", "fibonacci", "ascension",
      "revelation", "prismatic", "oracle", "prophecy", "eclipse",
    ],
    palette: {
      primary: "#0a0814",
      secondary: "#140e24",
      accent: "#a080d0",
      glow: "#c0a0f0",
    },
    defaultVoice: "ballad",
    poetryMood: "transcendent",
    poetryImagery:
      "infinite cathedrals of starlight, sacred geometry made of prayer, the space between thoughts, rivers of light beneath ancient trees, golden threads connecting all living things, the mountain that rises forever, still water reflecting galaxies, smoke becoming constellations, the warmth of being held by the infinite",
  },
  {
    id: "pain",
    name: "Pain",
    subtitle: "the place beneath all places",
    visualVocabulary: {
      environments: [
        "empty apartment at 4am, one light on, the city gone silent, walls closing in imperceptibly",
        "frozen lake at night under no moon, the ice cracking somewhere far away, absolute solitude stretching to every horizon",
        "hospital corridor that never ends, fluorescent lights flickering, every door locked, footsteps echoing from nowhere",
        "abandoned playground in winter rain, swings moving by themselves, the sound of a child who is no longer there",
      ],
      entities: [
        "a figure sitting alone on a bed in an empty room, head in hands, completely still",
        "shadow of a person standing at a window looking at nothing, the glass fogged from their breathing",
        "hands reaching upward from dark water, fingers splayed, slowly sinking without struggle",
        "a single chair in an enormous empty room, the person who sat there gone forever",
      ],
      textures: [
        "ice forming over a photograph of someone who is gone",
        "tears freezing before they fall in air too cold for grief",
        "rust eating through metal that once held something precious",
        "condensation on a cold window, a finger-drawn word already fading",
      ],
      atmospheres: [
        "the silence after the last person leaves and you know they are not coming back",
        "the weight of grief so heavy breathing takes deliberate effort",
        "cold so deep it has stopped being temperature and become a state of being",
        "loneliness so complete it has replaced the blood in your veins",
      ],
    },
    shaderModes: [
      "phantom", "obsidian", "umbra", "chasm", "crypt",
      "wraith", "monolith", "abyss", "torrent", "dissolution", "plasma",
      "fog", "singularity", "eclipse", "inferno",
    ],
    palette: {
      primary: "#020204",
      secondary: "#0a0810",
      accent: "#4a5070",
      glow: "#2a3050",
    },
    defaultVoice: "onyx",
    poetryMood: "melancholic",
    poetryImagery:
      "empty rooms, frozen tears, 4am silence, hospital corridors, abandoned places, the weight of absence, cold that replaces blood, grief without bottom, loneliness as geography, hands letting go",
  },
];

export function getRealm(id: string): Realm | undefined {
  return REALMS.find((r) => r.id === id);
}
