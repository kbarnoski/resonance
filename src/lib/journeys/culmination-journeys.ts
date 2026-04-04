import type { Journey } from "./types";
import { defaultPhases } from "./journeys";

/**
 * Culmination journeys — special journeys unlocked by completing all
 * journeys in a path. Not included in the JOURNEYS array (invisible
 * in the normal catalog). Same Journey type, same engine.
 */
export const CULMINATION_JOURNEYS: Journey[] = [
  // ─── Path: The Descent and Return ───
  {
    id: "the-wellspring",
    name: "The Wellspring",
    subtitle: "where water rises from the deepest stone",
    description:
      "You descended through fire, depth, living earth, and pain. Now the water rises — not from above, but from beneath everything.",
    realmId: "garden",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Seep",
      expansion: "Spring",
      transcendence: "Upwelling",
      illumination: "Clear Pool",
      return: "Overflow",
      integration: "Source",
    },
    phases: defaultPhases("garden", {
      threshold: {
        aiPrompt:
          "dark stone fissure entering from the lower left with faint luminous water seeping through hairline cracks, bioluminescent turquoise and emerald light bleeding upward through microscopic channels in the rock, dispersed droplet particles trailing into vast black negative space above and right, the water impossibly slow and deliberate, cosmic scale where the fissure could be a canyon or a cell wall, asymmetric composition with visual weight low and left, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something stirs beneath...", "the stone remembers water...", "listen..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt:
          "luminous water architecture rising in fibonacci spirals from deep black void, the liquid impossibly structured — designed columns and arcs of glowing aquamarine and jade, internal light sources within the water casting caustic patterns outward into darkness, dispersed mist particles trailing along the spiral paths, the densest liquid structure anchored in the lower third rising asymmetrically toward the upper left, generous dark negative space on the right, living geometry of water finding its way upward through infinite space, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rising...", "the water knows the way...", "let it carry you..."],
        poetryMood: "flowing",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale upwelling of luminous water and bioluminescent mycelium sweeping across infinite black in a vast ascending arc, deep emerald and electric cyan pulsing through spiraling liquid corridors interwoven with golden root-light filaments, the structure dense and intricate where it crosses the frame dissolving into luminous mist and scattered light-particles at both edges, water bridges and light-threads stretching toward infinite darkness above, dynamic and powerful — water and earth united in ascent, composition fills frame but spiral core sits upper right, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the deep speaks...", "everything rises...", "you are the water..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "vast field of luminous water droplets suspended in deep blue-green void like underwater starlight, thousands of tiny interconnected liquid forms at different depths creating infinite three-dimensional space, the densest cluster anchored along the left edge and lower third with finest particles scattered rightward into open darkness, each droplet catching pale jade and silver light revealing internal prismatic facets, faint veils of warm amber threading between the liquid clusters like dissolved sunlight reaching the deepest pool, asymmetric composition leaving upper right vast and open, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["clarity...", "see through the water...", "this is where it begins..."],
        poetryMood: "dreamy",
      },
      return: {
        aiPrompt:
          "designed water-light lattice arcing from lower left across deep indigo void, prismatic light threading through the liquid architecture — cyan to emerald to gold to warm amber, dispersed mist particles catching warm spectrum as they spiral outward into generous dark negative space above and right, channels of copper and rose light glowing through the water geometry, the form flowing and alive not static, composition weighted to lower half with cosmic darkness opening above, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the water carries you back...", "gentle now...", "you have been to the source..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse luminous water traces and fading liquid geometry drifting across vast dark silence, the last connected forms clustered small in the lower left corner dissolving into scattered droplet-particles trailing diagonally toward infinite upper darkness, faint emerald and gold light in the final water structures, enormous open void everywhere above, the particles carry the wellspring's memory as they scatter upward, asymmetric and quiet — almost nothing against everything, no ground no horizon no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the source is always there...", "carry this water with you..."],
        poetryMood: "flowing",
      },
    }),
  },

  // ─── Path: The Architecture of Knowing ───
  {
    id: "the-silence-between",
    name: "The Silence Between",
    subtitle: "what lives in the space between thoughts",
    description:
      "You walked the maze, wired into the machine, read the infinite archive, and found sacred resonance. Now discover the silence that holds all knowing.",
    realmId: "temple",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Hush",
      expansion: "Interval",
      transcendence: "Void",
      illumination: "Resonance",
      return: "Echo",
      integration: "Stillness",
    },
    phases: defaultPhases("temple", {
      threshold: {
        aiPrompt:
          "single luminous geometric form — a perfect golden octahedron — hovering in vast black void, faint sacred geometry filaments radiating outward from its vertices into infinite darkness, dispersed dust particles catching amber light along the filament paths, the form anchored in the lower right third of the frame with enormous open darkness everywhere else, incense-smoke traces curling upward from the geometry, temple scale where the form could be a molecule or a mountain, asymmetric composition with visual weight low and right, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["be still...", "the silence is already here...", "listen between..."],
        poetryMood: "transcendent",
      },
      expansion: {
        aiPrompt:
          "sacred geometric lattice expanding from a central octahedral seed across deep charcoal-black void, golden and amber light threading through voronoi-patterned corridors of translucent stone-like structure, dispersed incense-particles trailing along the geometric growth paths, the lattice dense in the lower left third thinning into scattered golden nodes and open darkness toward upper right, layered translucency creating genuine depth, warm candlelight glow at the densest intersections fading to cool silver at the outermost branches, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the space opens...", "between each thought...", "architecture of quiet..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale sacred geometry — vast interlocking platonic solids and golden-ratio spirals sweeping across infinite black, deep amber and electric gold pulsing through the translucent geometric corridors, warm white light erupting at the brightest intersections, the structure dense and intricate where it crosses the frame dissolving into scattered golden particles and open void at both edges, geometric bridges stretching toward infinite darkness above, the mathematics of silence made visible at galactic scale, composition fills frame but core sits upper left with streamers reaching across, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is the space...", "between all things...", "the silence holds everything..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "PURE WHITE BACKGROUND — intricate golden sacred geometry and connected translucent stone-forms arranged along the left edge and lower third of immense white void, the structures impossibly detailed with internal golden-ratio architecture, dispersed amber particles trailing rightward into open pale space, warm shadows on the geometric surfaces, infinite quality to the vast emptiness above, the design clusters asymmetrically leaving upper right open and boundless, quiet power in the contrast of intricate geometry against infinite white light, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the knowing is quiet...", "no words needed...", "this is understanding..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt:
          "designed sacred geometry arcing from lower left across deep indigo void, prismatic light threading through the golden structures — amber to rose to soft violet, dispersed particles catching warm spectrum spiraling outward into generous dark negative space above and right, the geometric forms thinning gracefully as they extend, composition weighted to lower half with cosmic darkness opening above, the architecture returning to simplicity, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the silence follows you...", "carry it gently...", "you understand now..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse golden geometric traces and fading sacred forms drifting across vast dark silence, the last connected structures clustered small in the lower left corner dissolving into scattered amber particles trailing diagonally toward infinite upper darkness, faint gold light at the final intersection points, enormous open cosmos everywhere above, the particles carry the geometry's memory as they scatter, asymmetric and quiet — almost nothing against everything, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the silence is yours now...", "carry this knowing..."],
        poetryMood: "flowing",
      },
    }),
  },

  // ─── Path: The Vast and the Still ───
  {
    id: "the-vanishing-point",
    name: "The Vanishing Point",
    subtitle: "where distance becomes infinite stillness",
    description:
      "You crossed the desert, climbed the mountain, drifted through cosmic silence. Now reach the vanishing point — where scale dissolves into peace.",
    realmId: "cosmos",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Horizon",
      expansion: "Recession",
      transcendence: "Infinity",
      illumination: "Convergence",
      return: "Approach",
      integration: "Point",
    },
    phases: defaultPhases("cosmos", {
      threshold: {
        aiPrompt:
          "single luminous point of pale blue-white light suspended in vast black cosmic void, faint concentric rings of stardust radiating outward from the point into infinite darkness, dispersed stellar particles trailing along the ring paths, the light-point anchored in the center-right of the frame with enormous open darkness everywhere else, the point impossibly distant yet impossibly sharp, cosmic scale beyond comprehension, asymmetric composition with visual weight center-right, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look further...", "the distance is a gift...", "stillness begins here..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt:
          "converging lines of stellar dust and nebular light sweeping from every edge of the frame toward a vanishing point in the upper right, each line a different cosmic color — deep blue, violet, silver, pale gold, the lines are made of dispersed star-particles in flowing arcs not straight paths, the densest material near the edges thinning toward the convergence point which glows with concentrated light, vast dark voids between the sweeping lines creating depth and scale, composition creates a sense of infinite recession, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything converges...", "the vast becomes the still...", "follow the lines..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale convergence — vast nebular formations and stellar rivers all flowing toward a single blinding point of white-blue light in the upper third of infinite black void, deep indigo and electric violet and warm gold flowing through spiraling matter-streams, the point of convergence erupting with concentrated radiance, the structure dense and dynamic where the streams cross but dissolving into scattered light-particles at the edges, the entire cosmos drawn into one impossible stillness, composition fills frame with the convergence point off-center upper right, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything arrives here...", "the point holds all distance...", "be still..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "vast field of ultra-fine stellar particles suspended in deep blue-black cosmic void, a million tiny points of light at different depths creating infinite three-dimensional space, the densest cluster forming a soft luminous cloud anchored along the left edge with the finest particles scattered rightward into open cosmic darkness, each particle a different subtle color — silver, pale blue, faint gold, creating a pointillist cosmos, faint gossamer threads of nebular light connecting distant clusters, asymmetric composition leaving upper right vast and open, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["clarity at the edge of distance...", "see how far you've come...", "the stillness sees you..."],
        poetryMood: "dreamy",
      },
      return: {
        aiPrompt:
          "designed stellar-dust architecture arcing from lower left across deep cosmic black, prismatic light threading through the nebular forms — indigo to violet to warm rose to pale gold, dispersed star-particles catching warm spectrum as they drift outward into generous dark negative space above and right, the vanishing point now a soft distant glow rather than a blinding convergence, composition weighted to lower half with infinite cosmos opening above, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the distance remains...", "carry this stillness...", "you are changed by vastness..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse scattered stellar particles and fading nebular traces drifting across vast dark cosmic silence, the last luminous forms clustered small in the lower left corner dissolving into scattered light-points trailing diagonally toward infinite upper darkness, a single pale point of light where the vanishing point was — now just a memory of convergence, enormous open cosmos everywhere above, asymmetric and quiet — almost nothing against everything, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the point is always there...", "infinite stillness..."],
        poetryMood: "flowing",
      },
    }),
  },

  // ─── Path: The Wheel of the Year ───
  {
    id: "the-return",
    name: "The Return",
    subtitle: "the wheel turns and you are here again",
    description:
      "You bloomed, burned, harvested, and froze. Now the wheel completes — not ending, but arriving where you began, changed by the turning.",
    realmId: "spring",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Memory",
      expansion: "Turning",
      transcendence: "All Seasons",
      illumination: "Recognition",
      return: "Homecoming",
      integration: "Seed",
    },
    phases: defaultPhases("spring", {
      threshold: {
        aiPrompt:
          "frozen seed pod entering from the lower right with the first hairline crack of green light breaking through dark ice, bioluminescent emerald thread visible through the fracture, dispersed ice-crystal particles trailing into vast black negative space above and left, the pod impossibly detailed with frost patterns dissolving where warmth begins, cosmic scale where the seed could be a planet cracking open, asymmetric composition with visual weight low and right, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you have been here before...", "the seed remembers...", "feel the turning..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt:
          "spiraling organic architecture of intertwined growth and decay sweeping from lower left to upper right across deep black void — green shoots and golden autumn leaves and ice crystals and summer flowers all woven into one impossible fibonacci spiral, each season's color distinct yet connected through luminous filaments, dispersed pollen and snow particles trailing along the spiral paths, the densest material in the lower third opening into scattered elements and dark space above, all four seasons visible simultaneously in one living structure, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the wheel turns...", "every season is here...", "you contain all of it..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale wheel of seasons sweeping across infinite black — vast spiraling structure where spring green becomes summer gold becomes autumn crimson becomes winter silver in continuous flowing transformation, electric light pulsing through the seasonal transitions, ice-to-blossom-to-fruit-to-frost in impossible simultaneous beauty, the wheel dense and intricate at center but dissolving into scattered seasonal particles at the edges, composition fills frame with the wheel center off-center upper left, dynamic and powerful — the cycle itself as cosmic phenomenon, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the wheel holds everything...", "you are the turning...", "every ending is a beginning..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "PURE WHITE BACKGROUND — intricate organic forms where all four seasons exist simultaneously in designed botanical architecture along the left edge and lower third of immense white void, spring buds next to autumn leaves next to ice crystals next to summer blooms connected through golden fibonacci filaments, real three-dimensional depth with translucent layering, dispersed particles of pollen and snow trailing rightward into open white space, quiet power in seasonal detail against infinite white, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you see the whole...", "recognition...", "this is where you began..."],
        poetryMood: "dreamy",
      },
      return: {
        aiPrompt:
          "designed seasonal lattice arcing from lower left across deep indigo void, prismatic light threading through — spring green to summer amber to autumn crimson to winter silver, dispersed particles catching seasonal spectrum as they spiral outward into generous dark negative space above and right, the structure simplifying as it extends — fewer elements, warmer light, composition weighted to lower half with cosmic darkness opening above, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the turning slows...", "you are home...", "the wheel rests..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse seasonal traces — a few last particles of green and gold and silver drifting across vast dark silence, the last connected forms clustered small in the lower left corner dissolving into scattered light-points, a single warm seed-glow at the center of the final structure, enormous open darkness everywhere above, the particles carry the wheel's memory as they scatter, a promise of return in the smallest light, asymmetric and quiet, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the seed holds everything...", "until the wheel turns again..."],
        poetryMood: "flowing",
      },
    }),
  },

  // ─── Path: Light Above, Storm Below ───
  {
    id: "the-radiance",
    name: "The Radiance",
    subtitle: "what remains when storm and light are one",
    description:
      "You endured the tempest, dissolved into nothing, and ascended into golden light. Now discover the radiance that was always there — where storm and light are the same force.",
    realmId: "heaven",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Ember",
      expansion: "Ignition",
      transcendence: "Radiance",
      illumination: "Pure Light",
      return: "Afterglow",
      integration: "Warmth",
    },
    phases: defaultPhases("heaven", {
      threshold: {
        aiPrompt:
          "single luminous ember-form hovering in vast black cosmic void, warm gold and deep amber light pulsing within a designed geometric shell that is half storm-cloud turbulence and half sacred golden architecture, faint lightning-threads and golden filaments radiating outward into infinite darkness, dispersed warm particles trailing from the form, anchored in the lower right third with enormous open darkness everywhere else, the ember is both destructive and divine, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the spark remembers the storm...", "light and lightning were always one...", "breathe..."],
        poetryMood: "transcendent",
      },
      expansion: {
        aiPrompt:
          "radiant architecture sweeping from lower left to upper right — impossible structures made of interwoven golden light and electric storm-energy, fibonacci spirals of warm luminance shot through with violet lightning filaments, the dual nature visible in every element — storm turbulence and divine geometry unified, dispersed particles of gold and electric blue trailing along the paths, densest in the lower third opening into generous dark negative space above and right, cosmic scale where the structure could be a thunderhead made of sacred geometry, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm was always light...", "rising...", "there is no difference..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale radiance — vast formation where golden divine light and electric storm-energy are completely unified sweeping across infinite black, deep violet and electric gold pulsing through spiraling corridors of light-storm, blinding white erupting at the peak nodes, the structure impossibly detailed and powerful where it fills the frame but dissolving into scattered particles of unified gold-and-lightning at both edges, god rays and electric discharges indistinguishable from each other, composition fills frame with radiant core upper left, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is the radiance...", "there is no above or below...", "you are the light..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "vast field of unified light-particles suspended in deep warm void — each particle both golden warmth and electric charge simultaneously, thousands at different depths creating infinite three-dimensional radiant space, the densest cluster anchored along the left edge with the finest particles scattered rightward into open darkness, each particle casting both warm amber glow and faint violet corona, the space between particles alive with residual energy, asymmetric composition leaving upper right vast and open, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["pure...", "the radiance needs nothing...", "this was always here..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt:
          "designed radiant lattice arcing from lower left across deep warm indigo, prismatic light threading through — gold to amber to rose to soft violet, the storm energy now gentle warmth, dispersed particles catching golden spectrum as they drift outward into generous dark space above and right, the structures thinning gracefully, warm afterglow replacing blinding radiance, composition weighted to lower half with cosmos opening above, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the radiance softens...", "carry this warmth...", "you are changed..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse warm light traces and fading radiant geometry drifting across vast dark silence, the last unified forms clustered small in the lower left corner dissolving into scattered golden particles trailing diagonally toward infinite upper darkness, a single warm point of light where storm and divinity still meet, enormous open cosmos everywhere above, the particles carry the radiance as memory, asymmetric and quiet — almost nothing against everything, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the radiance is yours...", "carry it always..."],
        poetryMood: "flowing",
      },
    }),
  },

  // ─── Grand Culmination ───
  {
    id: "the-spirit",
    name: "The Spirit",
    subtitle: "the infinite inner landscape",
    description:
      "Every path has led to this. The descent, the knowing, the vastness, the seasons, the radiance — all were preparation for the journey inward, to the spirit that held them all.",
    realmId: "spirit",
    aiEnabled: true,
    phaseLabels: {
      threshold: "Gathering",
      expansion: "Remembering",
      transcendence: "Union",
      illumination: "The Infinite",
      return: "Grace",
      integration: "Home",
    },
    phases: defaultPhases("spirit", {
      threshold: {
        aiPrompt:
          "five faint luminous threads — crimson, amber, blue-silver, green-gold, warm gold — converging from every edge of infinite black void toward a single point in the lower right third, each thread carrying the ghost of its path's journey — fire-particles on the red thread, sacred-geometry on the amber, stellar-dust on the blue, seasonal-particles on the green, storm-light on the gold, the convergence point not yet reached, vast open darkness everywhere, cosmic scale, asymmetric composition, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything you have been...", "every path arrives...", "gather yourself..."],
        poetryMood: "transcendent",
      },
      expansion: {
        aiPrompt:
          "luminous architecture born from five unified threads expanding in spiraling fibonacci growth from the lower left across deep black void — the structure contains echoes of every realm: water-light and sacred-geometry and stellar-dust and organic-growth and storm-radiance woven into one impossible design, deep violet and warm gold and emerald and crimson and silver all present but harmonized, dispersed multi-colored particles trailing along the spiral paths, densest in the lower third opening into cosmic darkness above, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you remember everything...", "the paths merge...", "you are all of them..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt:
          "cosmic-scale spiral of unified spirit-light sweeping across infinite black — every color and form from every path woven into one vast ascending structure, the spiral contains water and geometry and stars and seasons and radiance all dissolved into pure luminous presence, deep violet and electric gold at the brightest nodes, the structure impossibly detailed at center dissolving into scattered multi-spectrum particles at the edges, bridges of pure light stretching into infinite darkness above, the inner landscape made visible at the scale of galaxies, composition fills frame with spiral core upper right, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is who you are...", "the infinite inner landscape...", "you are home..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt:
          "PURE WHITE BACKGROUND — intricate unified spirit-forms where every path's essence exists simultaneously in designed architecture along the left edge and lower third of immense white void, water and geometry and stellar dust and organic growth and radiant light woven into three-dimensional translucent structures with real depth and shadow, dispersed multi-spectrum particles trailing rightward into open white space, each element carrying the memory of its origin journey, quiet and powerful against infinite white, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the infinite is gentle...", "you contain everything...", "peace..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt:
          "designed spirit-lattice arcing from lower left across deep warm indigo void, prismatic light threading through the unified forms — every color of every path present but gentle now, dispersed particles of every kind — water drops and sacred-dust and star-particles and pollen and warm light — drifting outward into generous dark space above and right, the structure simplifying into its purest form, composition weighted to lower half with cosmos opening above, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["grace...", "you carry everything...", "the spirit is quiet now..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt:
          "sparse traces of every path's light — crimson and amber and blue and green and gold — drifting as scattered particles across vast dark silence, the last connected forms clustered small in the lower left corner, five faint threads still visible in the final structure, a single warm multi-spectral glow at the center, enormous open cosmos everywhere above, the particles carry every journey's memory as they scatter into peace, asymmetric and quiet — almost nothing against everything, the spirit resting, no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are home...", "the spirit rests..."],
        poetryMood: "transcendent",
        voice: "ballad",
      },
    }),
  },
];

/** Look up a culmination journey by ID */
export function getCulminationJourney(id: string): Journey | undefined {
  return CULMINATION_JOURNEYS.find((j) => j.id === id);
}
