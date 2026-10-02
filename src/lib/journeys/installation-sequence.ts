/**
 * Installation-mode loop programs.
 *
 * The kiosk attract loop runs a series of PROGRAMS back to back, each
 * with the same theatrical format: intro screen ("Resonance presenting
 * …" + description) → journeys → ending dedication screen. After the
 * last program's dedication, the loop wraps to the first program.
 *
 * Program order (2026-08-24, per Karel): Welcome Home first, then the
 * Snowflake EP. More programs may be added later.
 *
 * Journeys resolve two ways:
 *   - `journeyIds`      — built-in journeys from journeys.ts
 *   - `pathShareToken`  — a journey_paths row (journey_ids in order,
 *                         then culmination last). Works online via
 *                         Supabase and offline via the Tramokyo pack.
 */

export interface ProgramDedication {
  /** Mono uppercase eyebrow, e.g. "In honor of". */
  eyebrow: string;
  /** Large italic line, e.g. "my father". */
  hero: string;
  /** Optional second mono eyebrow, e.g. "Special thanks to my life partner". */
  secondaryEyebrow?: string;
  /** Optional second italic line, e.g. "Evelina". */
  secondary?: string;
}

export interface InstallationProgramDef {
  id: string;
  /** Italic line under the Resonance mark: "presenting {presenting}". */
  presenting: string;
  /** Intro description paragraph. */
  description: string;
  journeyIds?: string[];
  pathShareToken?: string;
  /** Optional — the non-final Tramokyo sets end on a short black breath
   *  instead of a dedication card. */
  dedication?: ProgramDedication;
}

/**
 * Tramokyo cold open — experience-level opening credits shown once per
 * full cycle before the first program's intro. Copy drawn from Karel's
 * artist statement in docs/installation-brief.md. One-off for the
 * installation; nothing outside the kiosk renders this.
 */
/** Program id of the shuffled default mix (built in the installation
 *  page, not from INSTALLATION_PROGRAMS defs). */
export const TRAMOKYO_MIX_ID = "tramokyo-mix";

/**
 * TRAMOKYO SETLIST — curated order (Karel 2026-09-18): the Snowflake EP
 * in EP order, then ALL the featured journeys, then the Welcome Home
 * album in ALBUM order, closing on Cosmic Homecoming. Tweak freely:
 * reorder/remove lines; anything not listed is appended at the end.
 * FULLY DETERMINISTIC: every journey below has an explicit track
 * pairing (path journeys carry exact recording ids; built-ins resolve
 * via PAIRED_TRACKS). There is no fallback pool — an unresolved pairing
 * is skipped and flight-recorded, never substituted.
 */
/** First journey of each SET in the setlist — transport set-jumps
 *  (laptop arrows / phone remote) land on these (Karel 2026-09-29). */
export const TRAMOKYO_SET_STARTS: readonly string[] = [
  "first-snow", // Snowflake EP
  "9f7d1b51-aeac-4dfc-a39f-b00101a403f9", // the Kinetic Lab (2026-09-30 — was missing: set-jumps skipped the Lab entirely)
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // Expansion
  "06b07942-bf94-4513-8e71-ef00508ced3e", // Expansion II (Surrounded by Light 3)
  "24101852-61ee-4ac9-8fd7-da2ae19ab0a3", // Expansion III (The Other Side 9)
  "1f5e3884-5317-4146-ba18-4742eaf74ce9", // Expansion IV (Chemiluminescence)
  "81683231-3b3c-4542-8696-13dfcf56469a", // Expansion V (Loire 5A)
  "the-ascent", // Featured journeys
  "27f52cf0-5fad-420f-8324-8017c414f1f8", // Welcome Home
  "b583c8d2-b3c3-4df8-9c51-9b035be2d3e1", // Surrounded by Light
  "5a07f0af-654f-4dab-b42c-aef83983b33f", // March Light
];

export const TRAMOKYO_SETLIST: readonly string[] = [
  // ── The Snowflake EP, in order ──
  "first-snow", //  1. Snowflake — Snowflake · 2:58
  "inferno", //  2. Realized — Realized · 4:02
  "ghost", //  3. Ghost — Ghost · 3:39
  // ── The Kinetic Lab (moved 2026-09-30: "their own set right after the snowflake set") — band-split reactive shaders ──
  "9f7d1b51-aeac-4dfc-a39f-b00101a403f9", //  1. Chemiluminescence 1 (kinetic, whisper imagery)
  "061528d4-e9a3-49c3-ad3c-f23cf9cf2251", //  2. Rolling 2 (kinetic + epic imaging)
  "84a82478-f0f2-4c49-b800-b4fe722f1df5", //  3. Stand 10 (meditative + kinetic)
  "3ee9acf2-c89d-42b2-b9a3-d5fce97da2ac", //  4. Cabin Soul 8 (med + kin, lyrics)
  "b5247327-b1fd-45ce-a249-0a58a8a3c57e", //  5. Cabin Soul 5 (med + kin, lyrics)
  // ── The Expansion set, in set order (added 2026-09-29, Karel:
  //    "show after Ghost for now and before the following set") ──
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", //  1. Surrounded by Light 6 · 2:55
  "79cad85a-13fa-4db9-b4cd-a507b62a6084", //  2. Nothing 30 · 3:25
  "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80", //  3. Night Wind 2 · 3:30
  "6499ac06-2cb1-4970-b75f-1258587c84d8", //  4. The Other Side 10 · 2:05
  "13e71555-03d6-4b27-ad32-2c6834559c24", //  5. Northern Plane 5 · 2:34
  "6407bf5c-7862-49e8-883d-59754c4caf18", //  6. No question 8 · 2:55
  // ── Expansion set 2 (Karel 2026-10-01: "cue up the entire folder") —
  //    43 more takes, all KINETIC WITH IMAGING, five ~30-min sets.
  //    Expansion I continues straight on from set 1's six. ──
  "a96b4696-c02b-4004-a1a5-a0b1eee09308", //  7. Loire 2 · 1:43 (lead cascade-veil)
  "6ee9f014-8203-437c-b05c-9d8bd0de9d3e", //  8. Chenin 5 · 3:12 (lead pollen)
  "666436a4-eabf-4b0a-b6bc-665520daa687", //  9. Tranquility 3 · 3:25 (lead pendulum-dust)
  "ecf0d90f-7e1b-4ecb-a654-ecea936caca8", // 10. Bells 1 · 3:13 (lead rose-window)
  "1f83e254-a0c8-45ec-974f-8b363038a98d", // 11. Rise 1 · 2:35 (lead ember-drift)
  // ── Expansion II ──
  "06b07942-bf94-4513-8e71-ef00508ced3e", // 12. Surrounded by Light 3 · 3:23 (lead orbit-weaver)
  "6ff51cde-f4ca-4285-8707-0f77eaf9394c", // 13. Amboise 1 · 3:13 (lead r2-spiralgal)
  "85124aed-c3b4-42e2-870a-b14bc5425b72", // 14. Night Wind 9 · 3:30 (lead murmuration)
  "0b4eb01a-9ac7-4a04-8877-05f905b14f8b", // 15. Tranquility 8 · 3:40 (lead pendulum-dust)
  "8f3e82e2-0a30-499f-ba74-5158208a07a0", // 16. Never Forget 4 · 3:28 (lead r3-dreamtendrils)
  "3f42929f-8b8e-4206-a3c8-057bf479d4e7", // 17. Torraine 5 · 3:55 (lead constellation)
  "4dac5718-517d-4183-ad27-e1a6c583e305", // 18. Tranquility 30 · 3:30 (lead pendulum-dust)
  "6cb979ce-3b76-4851-a0ba-3f100fddfcb3", // 19. Yellow Bird 3 · 2:26 (lead r2-curlswarm)
  "d8705068-f8a9-4dd7-95a5-c6f1160fed22", // 20. Roll Away 8 · 1:39 (lead will-o-wisp)
  "8ca69280-944c-4ccb-9f7f-692f3f7f7a6f", // 21. Singular 4 · 1:47 (lead r3-magneticwisps)
  // ── Expansion III ──
  "24101852-61ee-4ac9-8fd7-da2ae19ab0a3", // 22. The Other Side 9 · 3:20 (lead binary-stars)
  "86b64938-26ea-40b9-9ea1-461323a049d5", // 23. Chenin 3 · 3:10 (lead pollen)
  "2ff26268-997a-438f-8dac-d280d50da3a1", // 24. Tranquility 11 · 2:52 (lead pendulum-dust)
  "954a7000-91ba-42eb-b5a7-a8d5bc21c8c2", // 25. Night Wind 5 · 3:30 (lead murmuration)
  "112c3e16-3c98-43ca-902e-a9c2b510ee3d", // 26. Cabin Soul 6 · 2:34 (lead starfield)
  "05664df7-d355-40b7-85d2-e2badf26123a", // 27. Torraine 6 · 3:09 (lead constellation)
  "68b4289e-2247-41d6-8b9d-064345da9769", // 28. Tranquility 17 · 3:30 (lead pendulum-dust)
  "99b7ad2c-a212-440e-85fa-0c670c1e4296", // 29. Redwoods Sway 2 · 2:19 (lead firefly-field)
  "c7a0c1c2-c5d2-487b-8c54-73b134e6f09a", // 30. Horses 1 · 3:59 (lead meteor-rain)
  "e9beec7a-6aa4-41bb-83f0-c827603ed51d", // 31. Northern Plane 3 · 2:53 (lead r-stardust)
  // ── Expansion IV ──
  "1f5e3884-5317-4146-ba18-4742eaf74ce9", // 32. Chemiluminescence · 2:37 (lead r3-fairyglow)
  "7b39db5e-68fa-4915-8ff1-83078c18edac", // 33. Tranquility 33 · 3:26 (lead pendulum-dust)
  "4d17da19-6834-4005-a944-34c27a88a320", // 34. Amboise 2 · 3:21 (lead r2-spiralgal)
  "e4658610-336d-452f-a4f8-7b652b339db6", // 35. Night Wind 11 · 3:24 (lead murmuration)
  "aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6", // 36. Velvet Tears 1 · 3:60 (lead r-droplets)
  "71b71375-8d7f-4e84-86c8-76d9e85a6eb0", // 37. Tranquility 34 · 3:40 (lead pendulum-dust)
  "aeb508d6-6447-4fb5-8468-636924520f82", // 38. Yellow Bird 6 · 2:13 (lead r2-curlswarm)
  "3814f116-5c54-499c-9d9b-355201700fdc", // 39. Rattler 2 · 3:55 (lead r-embers)
  "4922ecbd-d1ab-4eec-a13d-735dcdc655da", // 40. Tranquility 21 · 3:40 (lead pendulum-dust)
  // ── Expansion V ──
  "81683231-3b3c-4542-8696-13dfcf56469a", // 41. Loire 5A · 3:42 (lead cascade-veil)
  "87009cf3-8c07-48eb-88d8-e7acb6a14e41", // 42. Night Wind 4 · 3:30 (lead murmuration)
  "e181df12-049b-4199-8a1b-4bc1c3edd8e7", // 43. Tranquility 35 · 3:50 (lead pendulum-dust)
  "19acdb4c-5a52-4532-99bd-a59652c7ff8e", // 44. No question 7 · 2:40 (lead ribbon-of-light)
  "4ef43223-42cf-4ce8-9088-7578569f7de6", // 45. Sancerre Cry 4 · 3:60 (lead fracture-light)
  "4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1", // 46. Tranquility 36 · 3:25 (lead pendulum-dust)
  "9d0ad58d-e490-4cc3-b24d-7c97d1fa3c0d", // 47. Torraine 7 · 3:52 (lead constellation)
  "21448504-ec00-48c3-8b0a-c92da2cf216a", // 48. Surrounded by Light 19 · 3:19 (lead orbit-weaver)
  "9662fec9-04fa-4202-9859-8f01cd287aad", // 49. Tranquility 38 · 3:40 (lead pendulum-dust)
  // ── The featured journeys (verified session-take pairings) ──
  "the-ascent", //  4. The Summit — Folsom St 5 · 3:22 (swapped with Ascension, Karel 2026-09-19)
  "the-ascension", //  5. The Ascension — 17th St 63 · 3:20 (swapped with Mycelium, Karel 2026-09-19)
  "the-bloom", //  6. The Bloom — Folsom St 9 · 3:35
  "cosmic-drift", //  7. Cosmic Drift — 17th St 61 · 4:42
  "mycelium-dream", //  8. Mycelium Dream — Folsom St 8 · 6:25
  // ── The Welcome Home album, in album order ──
  "27f52cf0-5fad-420f-8324-8017c414f1f8", // 12. Interplay · 2:38
  "a5b5f0cf-9a6b-451a-8293-3d98f3904342", // 13. Bath · 2:29
  "79e33115-7f1e-44bc-b950-7adf5055dd55", // 14. Welcome Home · 4:53
  "00fcca2b-bc1e-461a-8dcd-3fff74587f3e", // 15. The Knife · 2:26
  "eb79818b-c7e8-45a7-886c-2a432fe83332", // 16. 2019 · 3:41
  "5a3beb75-4788-4448-a024-4bfae30040c3", // 17. The Knife (Jam) · 7:15
  "5a3e5044-9da5-404e-b3d6-c0c4fc757a5b", // 18. Playa · 2:47
  "08f4c26e-4185-440a-a25c-2440e8e7ae47", // 19. Isolation · 3:21
  "8997623d-8770-41ce-863d-f359d1a213c4", // 20. Rebound · 2:52
  "cd517f5a-c4eb-4d50-8a53-044aa668d087", // 21. Stir Crazy · 2:46
  "38daff92-ae34-4448-8868-5f1df6029b94", // 22. Rolling · 4:35
  "019e1e1d-c7e2-4609-a9c6-364a2755b115", // 23. Quarantine · 2:56
  "b207b557-e984-4a06-ae71-83124bcd80d5", // 21. All Together · 3:39
  // ── The Surrounded by Light album, in album order (added 2026-09-19) ──
  "b583c8d2-b3c3-4df8-9c51-9b035be2d3e1", // 1. Rise
  "db22c975-8f03-487b-ae44-437f7f153ac1", // 2. Surrender
  "f24cc5d9-66cd-4fae-a03a-14dda1698566", // 3. Openings
  "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3", // 4. Surrounded By Light
  "8b163c8b-cda5-4d7d-995b-41dd68fdd059", // 5. Drift
  "89ff944d-f242-4f77-9b95-7cb1d3dc0af6", // 6. Self
  "dd2ed3c9-67e9-4450-a9ca-c1426087fa9a", // 7. Message
  "4ca8d765-71a2-401a-85eb-eb02c2780bc3", // 8. Grace
  "01a395f7-04d6-4ff9-aecf-f8dacdcae0b1", // 9. Complete
  "549719aa-4a15-4981-8a9a-34ee66fca156", // 10. Held
  "a5de2004-f606-4277-a4cb-032c35e56c43", // 11. Sway
  "c110af67-40be-4a06-9878-eeec2a22bb3d", // 12. Mystic
  // ── The March Light album, in album order (added 2026-09-21) ──
  "5a07f0af-654f-4dab-b42c-aef83983b33f", // 1. The First
  "f0362f24-75f1-4717-8487-cc9cf12c7bcc", // 2. The First (Expanded)
  "9d901645-b8dd-4a62-b3e2-2613ccd64335", // 3. Dad's Song II
  "c80a89bc-2c88-4bde-bec8-4be6916acb62", // 4. Yellow Bird
  "800ed3f9-08d4-4b73-8a32-86ed8370e752", // 5. Spectre
  "f7b01537-af1b-4ade-b788-f21c6565b057", // 6. Surrounded By Light
  "a985d483-a948-4e3b-bad3-841a68f9992f", // 7. Mexican Boy
  "fb56b19e-ee23-43c6-ad41-5714e7969aad", // 8. Afterglow
  "fdc6470e-5c7e-43b4-968c-3e907f1fa88f", // 9. Grasshopper
  "46216435-4340-4ad4-9033-101e66fb29e7", // 10. Love Again
] as const;

/**
 * Journeys explicitly EXCLUDED from the Tramokyo show (Karel
 * 2026-09-18). The setlist builder appends any built-but-unlisted
 * journey to the final set as a safety net — these ids are exempt from
 * that net, so leaving them off the list actually leaves them out.
 * They remain playable via their album programs / the phone remote.
 */
export const TRAMOKYO_EXCLUDED_JOURNEYS: ReadonlySet<string> = new Set([
  "b4ea4c60-d158-40ca-8bd5-4d2d57473e4f", // COSMIC HOMECOMING — cut from the mix (still closes the Welcome Home album program)
  "the-tempest", // PULLED 2026-09-19 (Karel) — its paired take (17th St 63 spectre) is truncated in storage to 1:12; out of the show until re-uploaded/re-paired
  "neural-link", // PULLED 2026-09-19 (Karel) — out of the show for now
  "abyssal-dive", // PULLED 2026-09-19 — its "17th St 62" upload is a byte-level DUPLICATE of 17th St 63 (envelope correlation 1.000), so it played the same audio as The Ascension; benched until Karel re-uploads the true take 62
]);

/**
 * The setlist split into three SETS (Karel 2026-09-18: "a set list that
 * repeats forever with that title screen roughly every 30 minutes").
 * Each set is its own loop program, so the Resonance statement card
 * (the cold open) plays at every set boundary; the loop chains
 * Set I → II → III → back to I, forever. Music per set: ~33 / ~32 /
 * ~33 minutes (paired-track durations), ≈35 with transitions.
 *
 * `end` is an exclusive index into TRAMOKYO_SETLIST. Only the final set
 * carries the dedication — Sets I and II exhale to black for ~5s and
 * the next set's statement card is the punctuation.
 */
export interface TramokyoSetDef {
  id: string;
  presenting: string;
  end: number;
  dedication?: ProgramDedication;
}

export const TRAMOKYO_SETS: readonly TramokyoSetDef[] = [
  // TWO SETS (Karel 2026-09-19): Set 1 = the Snowflake EP + all the
  // featured journeys (Snowflake → Abyssal Dive, ~35 min of music);
  // Set 2 = the Welcome Home album in album order (~46 min). More sets
  // may be added later. Title card plays at each set boundary; the
  // dedication closes the final set.
  { id: "tramokyo-mix", presenting: "the Snowflake EP", end: 3 }, //  1-3: the Snowflake EP
  { id: "tramokyo-mix-kin", presenting: "the Kinetic Lab", end: 8 }, // 4-8: the Kinetic Lab (right after the EP, Karel 2026-09-30)
  { id: "tramokyo-mix-exp", presenting: "Expansion", end: 19 }, // 9-19: Expansion I — set 1's six + Loire 2 → Rise 1 (~31 min)
  { id: "tramokyo-mix-exp2", presenting: "Expansion II", end: 29 }, // 20-29: Surrounded by Light 3 → Singular 4 (~31 min)
  { id: "tramokyo-mix-exp3", presenting: "Expansion III", end: 39 }, // 30-39: The Other Side 9 → Northern Plane 3 (~31 min)
  { id: "tramokyo-mix-exp4", presenting: "Expansion IV", end: 48 }, // 40-48: Chemiluminescence → Tranquility 21 (~30 min)
  { id: "tramokyo-mix-exp5", presenting: "Expansion V", end: 57 }, // 49-57: Loire 5A → Tranquility 38 (~32 min)
  { id: "tramokyo-mix-1b", presenting: "the featured journeys", end: 62 }, // 58-62: The Summit → Mycelium Dream
  { id: "tramokyo-mix-2", presenting: "Welcome Home", end: 75 }, // 63-75: Interplay → All Together
  { id: "tramokyo-mix-3", presenting: "Surrounded by Light", end: 87 }, // 76-87: Rise → Mystic (~35 min)
  {
    id: "tramokyo-mix-4",
    presenting: "March Light",
    end: 97, // 88-97: The First → Love Again (~32 min; +6 Expansion 2026-09-29; +5 Kinetic Lab 2026-09-30; +43 Expansion set 2 2026-10-01)
    dedication: {
      eyebrow: "with gratitude to",
      hero: "Johnny and our hosts",
      secondary: "for opening their land to this evening",
    },
  },
] as const;


export const EXPERIENCE_INTRO = {
  // Karel 2026-09-29: "much too long. Just have it be Resonance with
  // the logo. dont have my name on it for tramokyo. just have it say
  // thank you to the hosts and organizers."
  title: "Resonance",
  about: "a contemplative listening room — music conducting worlds of light and imagery",
  thanks: "with gratitude to the organizers and hosts of Tramokyo",
} as const;

export const INSTALLATION_PROGRAMS: InstallationProgramDef[] = [
  {
    id: "kinetic-lab",
    presenting: "the Kinetic Lab",
    description:
      "Experiments where the shaders listen — bass, mids and highs each " +
      "driving a layer of light. Meditative and kinetic, together.",
    pathShareToken: "adce2b2d52114bbc",
  },
  {
    id: "expansion",
    presenting: "the Expansion set",
    description:
      "Forty-nine new pieces, each its own world, where the light listens — " +
      "bass, mids and highs each move a layer while the imagery travels. " +
      "Recline.",
    pathShareToken: "3422c91db7ee4769",
  },
  {
    id: "march-light",
    presenting: "the March Light album",
    description:
      "Ten pieces of March Light — from The First\u0027s thaw to Love " +
      "Again\u0027s bloom in the burned forest. Recline.",
    pathShareToken: "f97032da08df46f5",
  },
  {
    id: "surrounded-by-light",
    presenting: "the Surrounded by Light album",
    description:
      "Twelve pieces released on the artist's birthday — March 2, 2023. " +
      "An arc of luminous states, from Rise to Mystic: light being born " +
      "out of darkness. Recline.",
    pathShareToken: "a2401f8a54d54236",
    dedication: {
      eyebrow: "Released on the artist's birthday",
      hero: "March 2, 2023",
      secondary: "light, born out of darkness",
    },
  },
  {
    id: "welcome-home",
    presenting: "the Welcome Home album",
    // INTERIM copy — Karel is sending a fuller Welcome Home write-up;
    // swap this paragraph when it lands.
    description:
      "An album of original piano pieces, composed and recorded at " +
      "home during lockdown. A journey for every track. Recline.",
    pathShareToken: "d2c79111528a46cf",
    dedication: {
      eyebrow: "Dedicated to",
      hero: "all of the people lost in the pandemic",
      secondary: "and all of the people left behind who loved them",
    },
  },
  {
    id: "snowflake-ep",
    presenting: "the Snowflake EP",
    description:
      "Snowflake, Realized, Ghost — three original improvised piano " +
      "recordings, tracing an arc from stillness, through fire, into " +
      "light. AI-generated visuals improvise alongside the music, " +
      "never the same twice. Recline.",
    // Tightened from the original five-journey cycle (2026-05-08) per
    // Karel — Ascension and Abyssal Dive removed for a sharper reviewer
    // experience on /demo.
    journeyIds: ["first-snow", "inferno", "ghost"],
    dedication: {
      eyebrow: "In honor of",
      hero: "my father",
      secondaryEyebrow: "Special thanks to my life partner",
      secondary: "Evelina",
    },
  },
];
