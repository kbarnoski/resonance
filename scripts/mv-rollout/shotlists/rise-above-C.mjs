// Realized (built-in "inferno", KB_REALIZED_REF_2.0) — Journey Archetype
// shot list for the Rise Above loop (2026-10-09).
//
// Karel's Inferno direction (memory/inferno-imagery.md): DESIGNED fire, not
// literal flames — ember constellations, volcanic-glass lattice, fractal fire
// networks, falling ash, moving smoke, fire at cosmic scale; dark and
// menacing hell-fire, never campfire; mixed dark AND pale grounds. Realized
// is the one journey where suns / fiery orbs are allowed. The pale
// white-with-ash look is mid-journey content only (Descent + Embers), never
// the ending. Moves away from the old canyon/chasm stills (the repeated
// vertical crack of light, "cheesey" walls): every frame is a designed form
// floating in open space — no walls, no terrain, no architecture.
//
// Phase bounds/intensities are the scripted take's (Entrance | Descent |
// Furnace | Embers | Ascent | Aftermath). The deep-analysis sections for
// this track are empty, so `music` cites the overview (F# major, maj7/maj9
// colour, the middle turn to B major and home) against the phase seconds.
// Sparse valley = Embers, the hush straight after the Furnace roar.
// Descent holds 36 of 70 slots and cycles its 3 shots ~12× each, so its
// shots differ in subject, scale AND background polarity (dark aerial ember
// constellation / pale ash-white lattice / dark macro smoke).

export const SET = { key: "rise-above-C", presenting: "Rise Above" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "inferno",
    name: "Realized",
    world: "F# major, improvisatory and harmonically lush (maj7, maj9, add9), turning to B major in the middle before coming home — alone in the burning: a single cracked shard of volcanic glass wakes in the dark, the fire unfolds as designed structure (ember constellations, an obsidian lattice on pale ash-white, curling smoke), peaks as a black sun of fractal fire, falls to a hush of breathing coals and falling ash, rises in cooling prismatic sparks, and ends with the shard resting small and cooled in the dark",
    phases: [
      P("threshold", 0, 0.05, 0.9, "threshold", "0:00-0:12 Entrance — the F# major figure sounds out of silence (darkness cracks open)", [
        S("sparse", "DARK BACKGROUND — a single small shard of black volcanic glass floating alone in the lower right of immense blackness, one hairline seam of deep orange heat glowing inside it, its obsidian edges catching a faint rim of light, a few ash motes hanging weightless beside it, nearly the entire frame empty"),
        S("micro", "extreme macro — the hairline seam inside the volcanic glass shard at closest range, white-hot light breathing through the fracture from deep within, its razor edge dusted with fine grey ash, heat shimmer rising off it in slow ripples, black glass mirroring the glow, the camera pushing in toward the light"),
        S("cosmic", "cosmic — pulling back as the first sparks escape the shard and scatter upward across infinite black, the glowing fragment now a tiny ember among drifting motes of orange light, ash particles trailing into vast empty darkness above and left"),
      ]),
      P("expansion", 0.05, 0.55, 1, "expansion", "0:12-2:13 Descent — the long improvisatory build, lush maj7/maj9 colour thickening (pressure, isolation)", [
        S("aerial", "from high above, looking straight down at an immense ember network spread across black far below, fractal fire threads branching between white-hot nodes like a dying star's skeleton, the network clustered in the lower right, the camera descending toward it through drifting ash"),
        S("abstract", "PURE WHITE BACKGROUND — abstract — a designed lattice of black volcanic glass sweeping diagonally from the upper left across a brilliant pale ash-white ground, obsidian planes holding deep orange fire inside them, white-hot edges, scattered dark ash particles drifting down into vast open white space below"),
        S("micro", "extreme macro — one curl of black smoke at closest range, lit from beneath by hidden orange fire, its folds turning slowly like heavy velvet, embers glinting inside the curl, the smoke unfurling upward out of the lower left into empty darkness"),
      ]),
      P("transcendence", 0.55, 0.67, 1.25, "transcendence", "2:13-2:42 Furnace — the turn to B major at full voice, the densest and loudest passage (the climax: something breaks)", [
        S("cosmic", "cosmic — a black sun of fire burning in the upper right of infinite darkness, its corona a fractal crown of white-hot streamers and deep crimson flares lashing outward, ash and sparks wheeling around it like a galaxy, the camera plunging toward it"),
        S("abstract", "abstract — a vast fractal fire network sweeping in a descending spiral arc across black, white-hot nodes pulsing at every intersection, amber light coursing through interlinked ember threads, the spiral core low in the left third, burning streamers dissolving into ash trails and open dark"),
        S("micro", "extreme macro — a single droplet of molten fire falling through black at closest range in the upper left third, its skin crawling with white-hot light and dark cooling crust, sparks shearing off its trailing edge in a curving wake, heat shimmer bending the darkness around it, menacing and alive"),
      ]),
      P("illumination", 0.67, 0.73, 1, "integration", "2:42-2:57 Embers — the hush after the roar, the harmony thinning to held colour (the sparse valley)", [
        S("sparse", "DARK BACKGROUND — a single small coal glowing deep orange in the lower left of vast black silence, its light swelling and dimming like slow breath, one thin ribbon of grey smoke rising from it and dissolving into the dark, nearly the entire frame empty"),
        S("aerial", "PURE WHITE BACKGROUND — looking straight down into a boundless ash-white haze, fine dark ash particles falling slowly through the pale light toward the camera, two or three still carrying a faint orange core, immense open white space, weightless and still"),
        S("micro", "extreme macro — the skin of one coal at closest range, gold light breathing slowly through a lace of white ash, the pulse slow as sleep, tiny sparks lifting off its cracks and drifting into the dark, the glow gathered to the right edge of the frame"),
      ], { sparse: true }),
      P("return", 0.73, 0.879, 0.9, "return", "2:57-3:33 Ascent — the music turns back toward F# major, the line lifting (air returns)", [
        S("abstract", "abstract — a connected ember lattice arcing up from the lower left across deep charcoal darkness, prismatic heat threading through it from orange to amber to rose to cool silver, ash particles drifting upward into open space above, the camera rising through"),
        S("intimate", "close — a single rising spark cooling from gold to silver as it climbs through the dark in the right third of the frame, a faint curving trail of light behind it, fine ash motes turning slowly around it, cool grey-blue air opening above, everything beyond soft and empty"),
        S("cosmic", "cosmic — a dim eclipsed sun of copper and rose hanging in the upper left of deep charcoal space, its fire banked to a thin glowing rim, streams of cooling sparks and ash rising past it into infinite darkness, the menace gone out of the fire, the camera drifting upward beside them"),
      ]),
      P("integration", 0.879, 1, 0.75, "integration", "3:33-4:02 Aftermath — home in F# major, the last open voicings ringing out (silence, then air)", [
        S("cosmic", "cosmic — sparse ash particles and fading ember traces drifting across vast cool grey-black silence, the last connected fire forms clustered small in the lower left, dissolving into scattered sparks that trail diagonally toward infinite upper darkness, the particles carrying the fire's memory as they cool, almost nothing against everything"),
        S("micro", "extreme macro — one flake of charcoal ash drifting at closest range in the lower right, its lace edge still holding the faintest orange core, the last living coal of the whole descent, a few cinder motes suspended weightless beside it in cool grey dark"),
        S("sparse", "DARK BACKGROUND — a single small shard of black volcanic glass resting in the lower right of vast cool darkness, its hairline seam cooled to a faint silver-rose glow, one ash mote settling beside it, nearly the entire frame empty, the bookend of the first light"),
      ]),
    ],
    morphs: [
      "the camera falls past the scattering sparks and descends from high above toward an immense ember constellation spread across the dark",
      "the camera dives into the curling smoke until it parts on a black sun of fire burning in infinite darkness",
      "the falling droplet of molten fire cools to a coal and the camera settles on a single small coal glowing alone in black silence",
      "the camera lifts off the coal's sparks and rises through a connected ember lattice turning from orange to silver",
      "the cooling sun dims and the camera drifts out into grey-black silence where the last ash and ember traces scatter",
    ],
  },
];
