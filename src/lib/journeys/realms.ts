import type { Realm } from "./types";

export const REALMS: Realm[] = [
  {
    id: "heaven",
    name: "Heaven",
    subtitle: "dissolution into golden light",
    visualVocabulary: {
      environments: [
        "crystalline cavern with veins of gold light running through raw mineral walls",
        "cosmic particle field where stardust collects on floating stone surfaces",
        "vast space between dimensions where organic coral structures grow from nothing",
        "ancient marble architecture dissolving into pure luminous particles at its edges",
      ],
      entities: [
        "millions of luminous particles streaming between crystalline nodes",
        "metallic sculptural forms with organic growth erupting from their seams",
        "prismatic glass shards suspended in zero gravity refracting warm spectrum light",
        "seed-like structures trailing bioluminescent filaments into dark space",
      ],
      textures: [
        "polished obsidian reflecting nebula light with embedded crystal deposits",
        "organic membrane surfaces stretched between mineral formations translucent with inner glow",
        "weathered stone carved by cosmic wind with gold dust in every crevice",
        "frozen liquid metal surfaces with prismatic rainbow caustics playing across them",
      ],
      atmospheres: [
        "the collision of cosmic scale and intimate material detail",
        "grounded weight dissolving into weightless particle fields",
        "dimensional layers where micro textures exist inside macro cosmic forms",
        "sacred stillness where stone becomes light becomes particle becomes void",
      ],
    },
    shaderModes: [
      "astral", "revelation", "mandorla", "seraph", "halo",
      "nebula",
      "helix", "drift", "expanse",
      "kenosis", "agape",
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
        "thermal pressure architecture — heat itself rendered as visible geometric compression zones in charcoal void",
        "combustion chemistry at cosmic scale — molecular breakdown visualized as luminous orange lattice dissolving",
        "volcanic glass surfaces shattering into obsidian fragments with molten light at every fracture seam",
        "charcoal and ash particulate field at impossible density — each grain a tiny ember with designed internal structure",
      ],
      entities: [
        "obsidian crystal formations with internal magma-light geometry visible through translucent volcanic glass",
        "smoke architecture frozen in time — turbulent billows revealed as designed fibonacci spiral chambers",
        "charred metal scaffolding with residual heat-glow in geometric patterns along structural stress lines",
        "combustion front rendered as a membrane surface — one side molten gold the other side charcoal black",
      ],
      textures: [
        "cracked obsidian surfaces revealing layers of cooled magma with embedded crystalline mineral deposits",
        "heat-distortion geometry rendered as visible warping of space itself near combustion surfaces",
        "charcoal surfaces with microscopic wood-grain architecture visible at cosmic magnification",
        "volcanic glass with prismatic refraction from internal stress fractures — deep red amber and violet",
      ],
      atmospheres: [
        "absolute thermal pressure expressed as visible luminous compression against dark void",
        "the weight of combustion rendered as architectural force — heat as structure not destruction",
        "the moment between solid and liquid — material at its transformation threshold",
        "ancient energy stored in material releasing slowly as designed geometric light patterns",
      ],
    },
    shaderModes: [
      "inferno",
      "umbra", "plasma",
      "rapture",
      "crucible",
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
      "infinite descent, volcanic glass, ember spirals, smoke architecture, heat distortion, obsidian fracture, charcoal void, molten pressure, ash falling through darkness, fire at cosmic scale",
  },
  {
    id: "garden",
    name: "The Garden",
    subtitle: "where living math breathes",
    visualVocabulary: {
      environments: [
        "vast neural lattice rendered in bioluminescent filaments against cosmic void",
        "capillary network at impossible scale where each vessel carries prismatic light",
        "fibonacci branching architecture made of glass and organic membrane in zero gravity",
        "cosmic web of dark matter visualized as interconnected phosphorescent threads",
      ],
      entities: [
        "crystalline seed-pods suspended in void trailing luminous particle filaments",
        "fractal branching forms half-mineral half-organic glowing at every junction node",
        "translucent membrane structures stretched between geometric scaffold catching spectral light",
        "spiral growth patterns in metallic material erupting from cosmic-scale organic lattice",
      ],
      textures: [
        "glass-like organic surfaces with internal capillary networks glowing warm at the seams",
        "mineral deposits forming along biological growth lines in fibonacci precision",
        "translucent layered membranes with prismatic interference patterns shifting with depth",
        "polished obsidian-like bark with veins of bioluminescent gold running through fractal channels",
      ],
      atmospheres: [
        "the intelligence of connection made visible as architecture",
        "organic networks at cosmic scale where biology becomes geometry",
        "dimensional layering where cellular detail exists inside galactic structure",
        "the quiet power of growth expressed as abstract luminous engineering",
      ],
    },
    shaderModes: [
      "mycelium", "symbiosis", "liquid", "kelp", "bloom", "spore",
      "chrysalis", "lichen",
      "coral", "plankton", "tide",
      "whorl", "meristem",
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
        "radiolarian glass-skeleton lattice floating at cosmic scale in blue-black void",
        "thermal vent mineral architecture with geometric chimneys crusted in crystalline deposits",
        "caustic light geometry refracting through pressure-dense invisible medium",
        "abyssal pressure gradient visualized as layered translucent compression zones",
      ],
      entities: [
        "siphonophore colonial chains rendered as architectural filament networks trailing bioluminescence",
        "ctenophore comb-plate structures diffracting prismatic light through geometric ciliary rows",
        "diatom silica chambers at impossible scale — hexagonal precision with internal luminous geometry",
        "mineral formations growing along hydrothermal gradients with veins of cyan and amber light",
      ],
      textures: [
        "volcanic glass surfaces with embedded bioluminescent bacterial colonies in fractal patterns",
        "pressure-formed crystal lattice with caustic light playing across geometric facets",
        "translucent organic membrane stretched over mineral scaffold catching deep spectral light",
        "silica skeleton surfaces with impossible geometric precision and internal prismatic refraction",
      ],
      atmospheres: [
        "the weight of depth expressed as luminous compression geometry",
        "abyssal silence where pressure becomes visible architecture",
        "dimensional scale shift — microscopic marine geometry rendered at cosmic enormity",
        "the collision of mineral permanence and organic translucency in weightless void",
      ],
    },
    shaderModes: [
      "liquid", "drift", "tide", "ocean",
      "whirlpool", "plankton", "coral",
      "drift", "nebula", "cascade", "ripple",
      "pelagic", "laminar",
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
        "circuit trace pathways at cosmic scale rendered in copper and neon against void",
        "crystalline logic-gate architecture with light propagating through geometric decision trees",
        "electromagnetic field lines made visible as luminous tension geometry in dark space",
        "silicon crystal lattice at atomic scale where electron clouds glow like nebulae",
      ],
      entities: [
        "recursive geometric structures folding inward — each layer containing a smaller version of the whole",
        "copper and glass filament networks carrying pulses of cyan and amber light between nodes",
        "holographic interference patterns condensing into solid geometric forms at intersection points",
        "fractal antenna structures capturing invisible energy and rendering it as prismatic light",
      ],
      textures: [
        "etched silicon wafer surfaces with microscopic circuit patterns at cosmic magnification",
        "electromagnetic flux visualized as iridescent standing waves on metallic surfaces",
        "glass fiber cross-sections revealing internal light channels in geometric array",
        "copper trace surfaces oxidized to prismatic patina with embedded crystal memory structures",
      ],
      atmospheres: [
        "precision so extreme it becomes sublime — geometry as emotion",
        "the invisible made architectural — fields forces waves rendered as structure",
        "cold crystalline logic generating unexpected warmth at its brightest nodes",
        "dimensional compression where atomic scale and cosmic scale occupy the same frame",
      ],
    },
    shaderModes: [
      "neon", "geodesic", "moire", "helix",
      "prism", "moire", "spiral", "geodesic", "weave",
      "plasma", "pulsar",
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
        "nebula gas rendered with embedded crystalline mineral structures at every scale",
        "gravitational lens distortion zone where space itself becomes a visible material",
        "cosmic filament — the dark matter web connecting galaxy clusters made luminous",
        "stellar nursery where gas particles condense onto impossible geometric scaffolding",
      ],
      entities: [
        "dark matter architecture — invisible structure made visible as ghostly geometric lattice",
        "gravitational wave fronts rendered as rippling translucent membrane surfaces in void",
        "interstellar dust grains at macro scale revealing crystalline internal structure and spectral refraction",
        "magnetic field lines condensed into luminous sculptural filament bridges between distant points",
      ],
      textures: [
        "nebula gas with mineral-grain particulate texture visible at cosmic magnification",
        "spacetime curvature rendered as polished obsidian surface warping reflected starlight",
        "plasma surfaces with impossible liquid-metal sheen and internal magnetic geometry",
        "cosmic ice — frozen gases forming crystalline lattice with embedded prismatic light",
      ],
      atmospheres: [
        "scale so vast that emptiness itself has visible texture and luminous grain",
        "the silence between stars made tangible — void as material with subtle structure",
        "cosmic forces rendered as sensory experience — gravity as warmth pressure as light",
        "dimensional depth where looking deeper always reveals another layer of structure",
      ],
    },
    shaderModes: [
      "astral", "nebula",
      "supernova", "pulsar", "quasar", "singularity",
      "drift", "expanse",
      "cassegrain", "waveform",
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
        "golden ratio proportions manifested as floating stone and crystal architecture in void",
        "mandala geometry unfolding in three dimensions — each layer a different material (stone glass metal)",
        "ancient carved surfaces at cosmic scale with mathematical precision in the erosion patterns",
        "sacred proportional space where geometric relationships between forms create visible harmonic tension",
      ],
      entities: [
        "stone fragments suspended in geometric array with gold-leafed edges catching spectral light",
        "crystalline forms grown along golden-spiral paths — half mineral half light half mathematics",
        "incense smoke frozen in time revealing perfect fibonacci geometry in its spiral structure",
        "worn marble surfaces floating apart to reveal luminous geometric cores within",
      ],
      textures: [
        "ancient stone surfaces with microscopic sacred geometry visible at magnification — carved by mathematics not tools",
        "patinated bronze and oxidized copper surfaces with embedded crystal veins in golden-ratio spacing",
        "translucent alabaster membranes stretched between geometric stone forms glowing with internal warmth",
        "layered mineral cross-sections revealing geological time as visible geometric strata of color",
      ],
      atmospheres: [
        "mathematics made sensory �� proportion as warmth symmetry as peace ratio as beauty",
        "ancient weight combined with geometric weightlessness — stone that floats",
        "the reverence that emerges when material and mathematics become indistinguishable",
        "dimensional collapse where the carved surface and the infinite void share the same geometry",
      ],
    },
    shaderModes: [
      "mandorla", "geodesic", "astral", "halo",
      "revelation", "sigil", "helix",
      "prism", "geodesic",
      "numinous", "covenant",
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
        "recursive geometric architecture folding inward — each layer containing miniature versions of the whole structure",
        "moire interference patterns at cosmic scale where overlapping lattices create emergent ghost-geometry",
        "infinite regression rendered as nested translucent shells each containing a smaller lit interior",
        "branching decision-tree architecture where each fork splits into geometric channels of different material",
      ],
      entities: [
        "Penrose tiling structures extending into three dimensions with impossible interlocking geometry",
        "light threads tracing through transparent maze-like crystal channels — visible paths through invisible structure",
        "nested geometric shells of different materials (stone glass metal) each one smaller and more luminous",
        "moire shadow patterns cast by overlapping geometric screens creating emergent forms that shift with perspective",
      ],
      textures: [
        "worn stone surfaces with microscopic labyrinthine erosion patterns — mazes within mazes at every scale",
        "translucent layered glass walls where the path through is visible but the geometry is impossible",
        "mirror surfaces that reflect not the scene but a different geometric arrangement of the same elements",
        "patinated bronze surfaces with recursive engraved patterns that repeat at every magnification",
      ],
      atmospheres: [
        "the vertigo of recursive depth — looking inward reveals another looking-inward",
        "beautiful confusion where geometry that should be comprehensible resists understanding",
        "the eerie peace of infinite identical structure — repetition as meditation",
        "dimensional paradox where inside and outside are the same space at different scales",
      ],
    },
    shaderModes: [
      "moire", "spiral",
      "moire", "weave", "portal", "threshold",
      "fog", "geodesic",
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
        "geological strata exposed at cosmic cross-section — layered mineral deposits in ascending color bands",
        "granite crystal structure at atomic magnification revealing geometric lattice with embedded luminous inclusions",
        "atmospheric pressure gradient made visible as translucent compression layers thinning toward dark space above",
        "vertical mineral surfaces with ice crystal formations growing along geometric fracture lines",
      ],
      entities: [
        "stone fragments suspended in ascending trajectory — each one a different mineral with unique crystalline interior",
        "ice crystal architecture growing in designed fibonacci patterns with prismatic refraction along every edge",
        "atmospheric particles thinning visibly with altitude — dense luminous grain below fading to sparse points above",
        "geological time compressed into visible layers — each stratum a different material and color at ascending scale",
      ],
      textures: [
        "granite surfaces with fractal crack patterns revealing veins of quartz and gold at every magnification",
        "ice forming on mineral surfaces — the crystalline boundary layer where frozen water meets stone geometry",
        "atmospheric haze rendered as visible translucent particulate with warm light scattering through each grain",
        "layered sedimentary cross-sections with mineral deposits creating abstract color bands from warm to cool ascending",
      ],
      atmospheres: [
        "vertical force expressed as visible ascending pressure — weight below lightness above",
        "the thinning of everything with altitude — material density light color all rarefying toward void",
        "geological permanence meeting atmospheric impermanence at the boundary of stone and sky",
        "sacred exhaustion rendered as the transition from dense warm material to sparse cool particle field",
      ],
    },
    shaderModes: [
      "astral", "fog", "expanse", "drift",
      "nebula", "halo",
      "revelation", "threshold",
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
        "sand grain crystal structure at cosmic magnification — each grain a faceted mineral world",
        "heat-shimmer distortion geometry rendering empty space itself as visible warping luminous medium",
        "salt crystal lattice forming designed geometric surfaces across infinite dark flat void",
        "erosion architecture — wind-carved mineral forms with impossible internal voronoi chamber structure",
      ],
      entities: [
        "mirage geometry — light bending through thermal gradients creating ghostly luminous architectural forms",
        "sand particles in designed dispersal patterns — each grain catching starlight as a tiny prismatic sphere",
        "wind-polished stone surfaces suspended in void with geometric erosion revealing crystalline interior",
        "thermal convection currents made visible as ascending luminous particle streams from dark warm surfaces",
      ],
      textures: [
        "cracked-earth geometry at cosmic scale — each fracture line revealing a different mineral stratum below",
        "salt crystal surfaces with microscopic cubic lattice structure catching prismatic light at every facet",
        "sand-polished stone with visible geological time in layered patina from warm gold to cool blue",
        "heat-distortion rendered as translucent membrane warping across dark surfaces with embedded light grain",
      ],
      atmospheres: [
        "absolute emptiness that has texture — the visible grain of silence and space",
        "heat as architectural force — thermal energy rendering void itself as luminous structure",
        "existential vastness where scale itself dissolves — grain and galaxy become interchangeable",
        "the paradox of emptiness as fullness — negative space so vast it becomes the subject",
      ],
    },
    shaderModes: [
      "dusk", "expanse", "umbra", "drift",
      "fog", "ember", "flux",
      "singularity", "mesa",
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
        "recursive information architecture — nested geometric chambers each containing compressed versions of the whole",
        "knowledge rendered as visible luminous lattice with warm amber nodes at every intersection point",
        "layered vellum-like translucent surfaces stacked infinitely with text-like geometric patterns on each layer",
        "brass and glass optical instruments at cosmic scale — lenses focusing light into geometric knowledge-forms",
      ],
      entities: [
        "ink-like particles flowing in designed rivulet patterns across translucent surfaces creating emergent geometry",
        "crystalline data structures — information as visible mineral growth with faceted luminous architecture",
        "warm amber lamplight volumes rendered as geometric solid-light forms in infinite dark space",
        "dust particles at cosmic magnification revealing each one as a faceted crystal containing miniature structure",
      ],
      textures: [
        "aged paper surfaces at macro scale revealing fiber geometry and ink-absorption patterns as abstract landscape",
        "leather and vellum patina with microscopic text-like erosion patterns creating emergent sacred geometry",
        "brass surfaces with verdigris oxidation creating layered color from warm gold to cool blue-green",
        "glass lens surfaces with internal refraction geometry creating concentric rainbow-ring interference patterns",
      ],
      atmospheres: [
        "accumulated knowledge as tangible warm pressure — the weight of information rendered as luminous density",
        "the hush of infinite stored meaning expressed as visible amber stillness between structures",
        "recursive depth where examining any detail reveals another layer of organized complexity",
        "warm solitude within infinite organized structure — alone but held by architecture of meaning",
      ],
    },
    shaderModes: [
      "fog", "threshold",
      "mandorla", "spiral", "moire", "sigil", "halo",
      "revelation", "weave", "chronos",
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
        "electrical discharge architecture — lightning frozen in time revealing designed fractal branching geometry",
        "turbulence fluid dynamics at cosmic scale — convection cell geometry with luminous edges and dark interiors",
        "electromagnetic field visualization — charged particle streams forming geometric tension surfaces in void",
        "pressure differential rendered as visible gradient — dense luminous compression meeting dark rarefied expansion",
      ],
      entities: [
        "Lichtenberg figures at cosmic scale — electrical scarring patterns branching in designed fibonacci geometry",
        "plasma filament architecture condensing from diffuse charge into structured luminous channels",
        "vortex geometry — spiral fluid structures with internal layered translucency from dark core to bright edge",
        "charged particle cascades rendered as luminous waterfall-like sheets with internal geometric interference",
      ],
      textures: [
        "electrical discharge surface scarring on glass — branching fractal patterns with prismatic refraction at edges",
        "turbulent fluid surfaces frozen mid-motion revealing geometric internal structure in the curl",
        "charged metal surfaces with visible electromagnetic field lines as luminous filament hair standing on end",
        "rain-streak geometry — parallel luminous lines in designed spacing with prismatic refraction at each drop",
      ],
      atmospheres: [
        "raw electromagnetic force rendered as visible architectural tension between charged surfaces",
        "pressure differential as sensory experience — the dense charged moment before discharge",
        "the sublime power of invisible forces made visible as luminous geometric structure",
        "turbulent chaos revealing designed order at every scale — fractals in the fury",
      ],
    },
    shaderModes: [
      "plasma", "inferno",
      "flux", "cascade", "whirlpool",
      "umbra",
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
        "connected frost constellation radiating across cosmic-scale dark void",
        "fractal powder formations on brilliant white with blue-grey shadow edges",
        "infinite lattice of ice and particle against deep indigo and purple",
        "dark geometric structures emerging from vast pale open field",
      ],
      entities: [
        "interconnected ice paths with powder dispersed along the geometric channels",
        "fractal snow structures expanding outward in fibonacci and voronoi patterns",
        "continuous flowing lattice with blue and violet light at the nodes",
        "fine granular white particle texture like sand scattered in geometric designs",
      ],
      textures: [
        "dispersed powder particles in flowing arcs connecting geometric forms",
        "translucent layered ice structures with dynamic internal light",
        "white on white fractal detail defined by subtle shadow and blue edge",
        "prismatic color threading through frozen lattice — blue to violet to gold",
      ],
      atmospheres: [
        "cosmic scale where frost could be star clusters or nebulae",
        "the infinite depth of connected frozen geometry",
        "dynamic and powerful yet mathematically precise",
        "crystalline expansion expressed through ice and particle",
      ],
    },
    shaderModes: [
      "snow", "fog", "rime", "drift", "expanse",
      "threshold", "tide", "glacier",
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
      "connected frost constellations radiating into cosmic depth, dispersed powder in fractal geometry, white sand patterns on dark void and pale infinite fields, the frozen cosmos breathing between structure and particle",
  },
  {
    id: "spring",
    name: "Spring",
    subtitle: "emergence after the long dark",
    visualVocabulary: {
      environments: [
        "cellular division rendered at cosmic scale — new structures budding from translucent membranes in void",
        "thaw-line geometry where crystalline ice dissolves into luminous liquid and vapor simultaneously",
        "emergence architecture — geometric forms pushing through dark surfaces into warm light above",
        "capillary network awakening — dormant glass channels filling with green-gold bioluminescent fluid",
      ],
      entities: [
        "translucent membrane pods splitting open to release clouds of luminous particles into dark space",
        "spiral unfurling forms — half botanical half mineral — with prismatic light along the growth edges",
        "crystalline ice structures transforming into organic glass as warmth passes through them",
        "pollen-like particle clouds at cosmic scale with each grain a tiny prismatic sphere",
      ],
      textures: [
        "ice becoming water becoming vapor — all three states visible simultaneously on one surface",
        "translucent organic membrane with internal vascular networks carrying warm gold light",
        "surface tension geometry — liquid surfaces held in impossible shapes by molecular force",
        "new growth surfaces with iridescent sheen where cellular structure creates structural color",
      ],
      atmospheres: [
        "the fragile tension of emergence — pressure from within pushing against outer shell",
        "dormancy breaking — invisible energy becoming visible as warmth color and particle",
        "dimensional threshold where frozen and flowing coexist in the same frame",
        "tender force — the gentleness of growth that is also unstoppable power",
      ],
    },
    shaderModes: [
      "bloom", "mycelium", "liquid", "spore", "chrysalis",
      "lichen", "coral", "tide",
      "plankton", "flux",
      "stamen",
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
        "thermal convection architecture — heat currents made visible as golden luminous geometry in void",
        "electromagnetic storm structure at cosmic scale with internal lightning geometry branching in fibonacci",
        "solar plasma surface rendered as molten golden-metal ocean with impossible wave geometry",
        "bioluminescent particle field at cosmic density — millions of warm light points in dark warm space",
      ],
      entities: [
        "heat-shimmer distortion geometry — space itself bending into visible golden wave structures",
        "electrical discharge architecture branching in designed fractal patterns through warm dark void",
        "solar flare material erupting in sculptural arcs with internal magnetic geometry visible",
        "thermal gradient membranes — translucent surfaces where warm gold transitions to cool blue",
      ],
      textures: [
        "sun-bleached surfaces with microscopic crystalline salt and mineral deposits catching prismatic light",
        "molten gold surfaces with convection cell geometry visible as voronoi patterns",
        "thermal-cracked surfaces revealing veins of amber light in geometric fracture patterns",
        "charged particle trails in warm atmosphere rendered as luminous golden filament traces",
      ],
      atmospheres: [
        "saturated warmth so intense it becomes visible as golden luminous pressure",
        "the fullness of peak energy — every particle vibrating at maximum amplitude",
        "electric tension before discharge — the charged stillness that precedes the storm",
        "warm darkness alive with energy — invisible heat rendered as subtle luminous grain",
      ],
    },
    shaderModes: [
      "dusk", "ember",
      "ember", "bloom", "flux", "cascade", "fog",
      "tide", "supernova",
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
        "decomposition architecture — organic structures elegantly disassembling into constituent particles",
        "amber and copper mineral surfaces with designed fracture patterns where things are coming apart",
        "dissolution gradient — solid crystalline forms transitioning to scattered particles across the frame",
        "fog rendered as visible layered translucent membranes with warm amber light between the layers",
      ],
      entities: [
        "spiral descent patterns — fragments of designed structures falling in fibonacci trajectories",
        "translucent membrane forms releasing trapped particles as they thin and dissolve",
        "oxidized metal sculptures with patina in spectrum from copper to verdigris to black",
        "ember-like particles in designed dispersal arcs — each one a tiny warm light point fading",
      ],
      textures: [
        "oxidation patterns on copper and bronze surfaces creating iridescent structural color",
        "organic material cross-sections showing layered cellular architecture in amber and gold tones",
        "smoke rendered as translucent geometric volumes with warm light trapped inside",
        "surface erosion revealing hidden crystalline structure beneath — beauty in decay",
      ],
      atmospheres: [
        "the elegance of letting go — structures releasing their components with grace",
        "rich melancholy expressed as warm color fading to cool at the particle edges",
        "grateful dissolution — the beauty of designed things returning to raw material",
        "the threshold between form and formlessness — things almost gone but still beautiful",
      ],
    },
    shaderModes: [
      "ember", "fog", "dusk", "drift",
      "lichen", "tide", "flux", "mycelium",
      "spore", "cascade",
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
        "dimensional intersection where multiple material planes overlap — stone glass light water visible simultaneously",
        "sacred proportional space where golden-ratio geometry generates visible harmonic resonance as warm light",
        "the space between scales — macro and micro existing simultaneously with no clear boundary between them",
        "luminous void with embedded subtle structure — not empty but containing the ghost geometry of everything possible",
      ],
      entities: [
        "luminous connecting threads between suspended crystalline forms — each thread a different spectral color",
        "ascending spiral of golden particles where each particle contains miniature structure visible at magnification",
        "translucent nested shells of different material (stone glass organic light) each containing the others",
        "still water surface rendered as a dimensional membrane — reflection contains different geometry than the source",
      ],
      textures: [
        "crystal cross-section revealing internal rainbow refraction separating light into spectral feeling-colors",
        "still water surface at molecular magnification — surface tension geometry holding all possibility in its meniscus",
        "veins of gold in black obsidian — the precious embedded in the dark revealed at every new fracture",
        "sacred smoke frozen in time revealing fibonacci geometry in every curl and designed fractal in every wisp",
      ],
      atmospheres: [
        "the feeling of dimensional overlap — multiple material realities coexisting in warmth and light",
        "awe rendered as visible luminous pressure — the weight of sacred presence as gentle radiant force",
        "bittersweet simultaneity — warm gold and cool blue existing in the same particle at the same moment",
        "the peace of complete emptiness that is also complete fullness — void and structure as one",
      ],
    },
    shaderModes: [
      "astral", "mandorla", "seraph",
      "nebula", "mycelium",
      "revelation", "halo",
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
        "void with such absolute darkness it has visible texture — the grain of absence at cosmic scale",
        "compression geometry — space itself contracting into denser darker smaller volumes of luminous pressure",
        "frost forming along geometric stress lines on dark glass surfaces — cold as visible crystalline force",
        "abandoned material fragments suspended in void — broken glass stone metal with no context no source",
      ],
      entities: [
        "fracture geometry propagating through dark material — stress lines branching in slow designed patterns",
        "ice crystal formations growing over warm surfaces — the cold slowly consuming residual warmth",
        "oxidation spreading across metal in time-lapse — rust as designed geometric erosion consuming structure",
        "single warm light point in vast dark void — the last ember surrounded by infinite cold geometry",
      ],
      textures: [
        "frost crystal surfaces forming over glass with designed geometric patterns — cold made architectural",
        "corroded metal surfaces where rust has created layered color from warm gold through deep red to black",
        "dark glass surfaces with condensation droplets each one containing a distorted reflection of void",
        "material under stress — visible micro-fractures propagating through crystalline structure before breaking",
      ],
      atmospheres: [
        "absence as tangible material — the visible weight and grain of emptiness pressing in",
        "cold so deep it crystallizes the void itself into visible geometric frost-structure",
        "compression — the felt experience of space contracting and darkening and becoming denser",
        "the threshold before breaking — material at maximum stress still holding but visibly failing",
      ],
    },
    shaderModes: [
      "umbra",
      "plasma",
      "fog", "singularity", "inferno",
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
