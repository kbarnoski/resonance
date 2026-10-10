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
 * TRAMOKYO SET LISTS (Karel 2026-10-08: "This way I can play different set
 * lists as needed"). Each list is a chain of SETS; each set is its own loop
 * program, so the Resonance statement card plays at every set boundary. A
 * list's sets play in order and the last wraps to its first — a list loops
 * itself until another is chosen (phone remote "Start from", or the kiosk
 * URL's ?start=<set id>). Sets are EXPLICIT id lists: reordering or editing
 * one can never shift another's boundaries.
 *
 * FULLY DETERMINISTIC: every journey has an explicit track pairing (path
 * journeys carry exact recording ids; built-ins resolve via PAIRED_TRACKS).
 * There is no fallback pool — an unresolved pairing is skipped and
 * flight-recorded, never substituted.
 */
/** The Snowflake EP, in EP order. */
const SNOWFLAKE_EP = [
  "first-snow", //  1. Snowflake — Snowflake · 2:58
  "inferno", //  2. Realized — Realized · 4:02
  "ghost", //  3. Ghost — Ghost · 3:39
] as const;
/** Vigil — Karel's Oct 4 2026 studio session (evening prayer → lantern-light
 *  → storm → testimony → a call → daybreak). */
const VIGIL = [
  "01c987f6-17de-469b-b155-000922b479a1", //  1. Vespers 3
  "4413b320-e6b5-471e-9163-10d1c496a67d", //  2. Vespers 2
  "910e6b62-abb8-40d1-bd31-ccdf6038f122", //  3. Lantern
  "bd748991-a67b-41dc-af94-ac3f612a27c4", //  4. Open Jam
  "dc8d9705-785a-485e-b91f-a12c85bf7b92", //  5. Testimony 3
  "d92c2d3a-4283-4300-abc3-d71ed7c6848d", //  6. Calling
  "87e106f9-4d74-4886-b944-fd625a827b02", //  7. First Light
] as const;
/** The March Light album, in album order. */
const MARCH_LIGHT = [
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
/** The Surrounded by Light album, in album order. */
const SURROUNDED_BY_LIGHT = [
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
] as const;
/** The Welcome Home album, in album order. */
const WELCOME_HOME = [
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
] as const;
/** The Expansion — all 49 as ONE set (Karel 2026-10-09). Sequenced from the
 *  analysis (pulse clarity, steadiness, arousal/valence, density): five
 *  waves from open and airy to the fullest sound and back down, with the
 *  versions of each piece spread as far apart as the arc allows
 *  ("separate versions of the same track … but dont forget the factor of
 *  intensity"). Tranquility ≥3 apart, Night Wind ≥8, other families ≥14;
 *  and (the casts were solved for the old order, and stay untouched)
 *  neighbours never share a shader. */
const EXPANSION = [
  // wave 1 — open, airy
  "0b4eb01a-9ac7-4a04-8877-05f905b14f8b", //  1. Tranquility 8 · 3:39
  "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80", //  3. Night Wind 2 · 3:29
  "a96b4696-c02b-4004-a1a5-a0b1eee09308", //  4. Loire 2 · 1:43
  "05664df7-d355-40b7-85d2-e2badf26123a", //  5. Torraine 6 · 3:09
  "4922ecbd-d1ab-4eec-a13d-735dcdc655da", //  6. Tranquility 21 · 3:39
  "ecf0d90f-7e1b-4ecb-a654-ecea936caca8", //  7. Bells 1 · 3:12
  "86b64938-26ea-40b9-9ea1-461323a049d5", //  8. Chenin 3 · 3:09
  "6499ac06-2cb1-4970-b75f-1258587c84d8", //  9. The Other Side 10 · 2:04
  "68b4289e-2247-41d6-8b9d-064345da9769", // 10. Tranquility 17 · 3:29
  // wave 2 — first grooves
  "19acdb4c-5a52-4532-99bd-a59652c7ff8e", // 11. No question 7 · 2:39
  "13e71555-03d6-4b27-ad32-2c6834559c24", // 12. Northern Plane 5 · 2:34
  "8f3e82e2-0a30-499f-ba74-5158208a07a0", // 13. Never Forget 4 · 3:28
  "4dac5718-517d-4183-ad27-e1a6c583e305", // 14. Tranquility 30 · 3:29
  "6ff51cde-f4ca-4285-8707-0f77eaf9394c", // 15. Amboise 1 · 3:12
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // 17. Surrounded by Light 6 · 2:54
  "666436a4-eabf-4b0a-b6bc-665520daa687", // 18. Tranquility 3 · 3:24
  "87009cf3-8c07-48eb-88d8-e7acb6a14e41", // 19. Night Wind 4 · 3:29
  "4ef43223-42cf-4ce8-9088-7578569f7de6", // 20. Sancerre Cry 4 · 3:59
  // wave 3 — deepening
  "9d0ad58d-e490-4cc3-b24d-7c97d1fa3c0d", // 21. Torraine 7 · 3:51
  "4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1", // 22. Tranquility 36 · 3:24
  "aeb508d6-6447-4fb5-8468-636924520f82", // 23. Yellow Bird 6 · 2:12
  "99b7ad2c-a212-440e-85fa-0c670c1e4296", // 24. Redwoods Sway 2 · 2:18
  "7b39db5e-68fa-4915-8ff1-83078c18edac", // 25. Tranquility 33 · 3:25
  "112c3e16-3c98-43ca-902e-a9c2b510ee3d", // 26. Cabin Soul 6 · 2:34
  "954a7000-91ba-42eb-b5a7-a8d5bc21c8c2", // 27. Night Wind 5 · 3:29
  "81683231-3b3c-4542-8696-13dfcf56469a", // 28. Loire 5A · 3:42
  "71b71375-8d7f-4e84-86c8-76d9e85a6eb0", // 29. Tranquility 34 · 3:39
  "1f5e3884-5317-4146-ba18-4742eaf74ce9", // 30. Chemiluminescence · 2:36
  // wave 4 — the fullest sound
  "79cad85a-13fa-4db9-b4cd-a507b62a6084", // 32. Nothing 30 · 3:24
  "1f83e254-a0c8-45ec-974f-8b363038a98d", // 33. Rise 1 · 2:34
  "6ee9f014-8203-437c-b05c-9d8bd0de9d3e", // 34. Chenin 5 · 3:12
  "9662fec9-04fa-4202-9859-8f01cd287aad", // 35. Tranquility 38 · 3:39
  "e4658610-336d-452f-a4f8-7b652b339db6", // 36. Night Wind 11 · 3:23
  "c7a0c1c2-c5d2-487b-8c54-73b134e6f09a", // 37. Horses 1 · 3:59
  "6407bf5c-7862-49e8-883d-59754c4caf18", // 38. No question 8 · 2:54
  "aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6", // 39. Velvet Tears 1 · 3:59
  "2ff26268-997a-438f-8dac-d280d50da3a1", // 40. Tranquility 11 · 2:51
  // wave 5 — landing
  "e9beec7a-6aa4-41bb-83f0-c827603ed51d", // 41. Northern Plane 3 · 2:52
  "24101852-61ee-4ac9-8fd7-da2ae19ab0a3", // 42. The Other Side 9 · 3:19
  "3f42929f-8b8e-4206-a3c8-057bf479d4e7", // 43. Torraine 5 · 3:54
  "e181df12-049b-4199-8a1b-4bc1c3edd8e7", // 44. Tranquility 35 · 3:49
  "85124aed-c3b4-42e2-870a-b14bc5425b72", // 45. Night Wind 9 · 3:29
  "3814f116-5c54-499c-9d9b-355201700fdc", // 46. Rattler 2 · 3:54
  "4d17da19-6834-4005-a944-34c27a88a320", // 47. Amboise 2 · 3:21
  "8ca69280-944c-4ccb-9f7f-692f3f7f7a6f", // 48. Singular 4 · 1:46
  "6cb979ce-3b76-4851-a0ba-3f100fddfcb3", // 49. Yellow Bird 3 · 2:26
] as const;
/** The featured journeys (verified session-take pairings). */
const FEATURED = [
  "the-ascent", //  4. The Summit — Folsom St 5 · 3:22 (swapped with Ascension, Karel 2026-09-19)
  "the-ascension", //  5. The Ascension — 17th St 63 · 3:20 (swapped with Mycelium, Karel 2026-09-19)
  "the-bloom", //  6. The Bloom — Folsom St 9 · 3:35
  "cosmic-drift", //  7. Cosmic Drift — 17th St 61 · 4:42
  "mycelium-dream", //  8. Mycelium Dream — Folsom St 8 · 6:25
] as const;

export interface TramokyoSetDef {
  /** Program id — also the remote's / ?start= handle. */
  id: string;
  presenting: string;
  journeyIds: readonly string[];
  /** Only a list's final set carries one — the others exhale to black and
   *  the next set's statement card is the punctuation. */
  dedication?: ProgramDedication;
  /** Every piece is borrowed from a later set that keeps it too (Rise
   *  Above); TRAMOKYO_SETLIST lists each journey at its home position. */
  borrows?: true;
  /** Played only when chosen from the phone; when it ends the loop returns to
   *  the list's first set (Karel 2026-10-09: "ra is going to end up the loop we
   *  use that is self running and the other lists ill only play if i choose to
   *  from my phone"). */
  onDemand?: true;
}

export interface TramokyoSetListDef {
  id: string;
  name: string;
  sets: readonly TramokyoSetDef[];
}

const GRATITUDE: ProgramDedication = {
      eyebrow: "with gratitude to",
      hero: "Johnny and our hosts",
      secondary: "for opening their land to this evening",
    };

/** Rise Above (Karel 2026-10-09, v3) — the opening set: Snowflake and Ghost,
 *  then Karel's album picks (The First (Expanded), Bath, Testimony 3, Yellow
 *  Bird, Welcome Home, Afterglow, Surrounded By Light, First Light) woven
 *  with Expansion grooves chosen from the analysis, one dark peak (Horses 1),
 *  landing on Night Wind 9. BORROWED, not moved: every later set keeps its
 *  pieces in entirety ("all sets after Rise Above should keep their songs"). */
// One version of a track per set (Karel 2026-10-09: "we cant have two versions of the same track in ra") —
// except Night Wind: he wants Night Wind 2 early and Night Wind 4 late, far apart. 11 and 9 play in the Expansion.
const RISE_ABOVE = [
  "first-snow", //  1. Snowflake
  "ghost", //  2. Ghost
  "87e106f9-4d74-4886-b944-fd625a827b02", //  3. First Light — I. his piano
  "dc8d9705-785a-485e-b91f-a12c85bf7b92", //  4. Testimony 3
  "fdc6470e-5c7e-43b4-968c-3e907f1fa88f", //  5. Grasshopper
  "c80a89bc-2c88-4bde-bec8-4be6916acb62", //  6. Yellow Bird
  "f0362f24-75f1-4717-8487-cc9cf12c7bcc", //  7. The First (Expanded)
  "a5b5f0cf-9a6b-451a-8293-3d98f3904342", //  8. Bath
  "6ff51cde-f4ca-4285-8707-0f77eaf9394c", //  9. Amboise 1 — II. weaving in the chill — classical bridge
  "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80", // 10. Night Wind 2
  "68b4289e-2247-41d6-8b9d-064345da9769", // 11. Tranquility 17
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // 12. Surrounded by Light 6
  "13e71555-03d6-4b27-ad32-2c6834559c24", // 13. Northern Plane 5
  "a96b4696-c02b-4004-a1a5-a0b1eee09308", // 14. Loire 2
  "86b64938-26ea-40b9-9ea1-461323a049d5", // 15. Chenin 3 — III. the build
  "ecf0d90f-7e1b-4ecb-a654-ecea936caca8", // 16. Bells 1 — dark trip-hop groove
  "4ef43223-42cf-4ce8-9088-7578569f7de6", // 17. Sancerre Cry 4 — beat, attitude, groove
  "c7a0c1c2-c5d2-487b-8c54-73b134e6f09a", // 18. Horses 1
  "6499ac06-2cb1-4970-b75f-1258587c84d8", // 19. The Other Side 10 — epic, monster sound
  "6ee9f014-8203-437c-b05c-9d8bd0de9d3e", // 20. Chenin 5 — THE PEAK — the screeching, intense one
  "19acdb4c-5a52-4532-99bd-a59652c7ff8e", // 21. No question 7 — IV. building up soulfully, after the peak
  "7b39db5e-68fa-4915-8ff1-83078c18edac", // 22. Tranquility 33 — part of the post-Chenin soulful build (Karel 2026-10-09)
  "87009cf3-8c07-48eb-88d8-e7acb6a14e41", // 23. Night Wind 4
  "0b4eb01a-9ac7-4a04-8877-05f905b14f8b", // 24. Tranquility 8 — uplifting, big voices: the soulful build crests here
  "8f3e82e2-0a30-499f-ba74-5158208a07a0", // 25. Never Forget 4 — deep, painful
  "99b7ad2c-a212-440e-85fa-0c670c1e4296", // 26. Redwoods Sway 2 — V. the feel-good finale
  "4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1", // 27. Tranquility 36
  "79e33115-7f1e-44bc-b950-7adf5055dd55", // 28. Welcome Home
  "fb56b19e-ee23-43c6-ad41-5714e7969aad", // 29. Afterglow
  "inferno", // 30. Realized
  "aeb508d6-6447-4fb5-8468-636924520f82", // 31. Yellow Bird 6 — the last track
] as const;

/** Main loop (Karel 2026-10-09): Rise Above → March Light → Surrounded by
 *  Light → Welcome Home → Vigil → the Snowflake EP → the Expansion → the
 *  featured journeys, then wraps to Rise Above. The Kinetic Lab is no longer
 *  a set — kinetic is the system on every journey but Snowflake and Ghost. */
export const TRAMOKYO_MAIN: TramokyoSetListDef = {
  id: "main",
  name: "Main loop",
  sets: [
    { id: "tramokyo-mix", presenting: "Rise Above", journeyIds: RISE_ABOVE, borrows: true },
    { id: "tramokyo-mix-4", presenting: "March Light", journeyIds: MARCH_LIGHT, onDemand: true },
    { id: "tramokyo-mix-3", presenting: "Surrounded by Light", journeyIds: SURROUNDED_BY_LIGHT, onDemand: true },
    { id: "tramokyo-mix-2", presenting: "Welcome Home", journeyIds: WELCOME_HOME, onDemand: true },
    { id: "tramokyo-mix-vigil", presenting: "Vigil", journeyIds: VIGIL, onDemand: true },
    { id: "tramokyo-mix-ep", presenting: "the Snowflake EP", journeyIds: SNOWFLAKE_EP, onDemand: true },
    { id: "tramokyo-mix-exp", presenting: "Expansion", journeyIds: EXPANSION, onDemand: true },
    { id: "tramokyo-mix-1b", presenting: "the featured journeys", journeyIds: FEATURED, dedication: GRATITUDE, onDemand: true },
  ],
};

/** Every selectable list; the FIRST is the default the kiosk opens on. */
export const TRAMOKYO_SETLISTS: readonly TramokyoSetListDef[] = [TRAMOKYO_MAIN];

/** The main loop flattened — every journey in the show once, at its home
 *  set's position (borrowing sets skipped). */
export const TRAMOKYO_SETLIST: readonly string[] = TRAMOKYO_MAIN.sets.filter((s) => !s.borrows).flatMap((s) => s.journeyIds);

/** Rise Above — exported for its own hand-off guard. */
export const TRAMOKYO_RISE_ABOVE: readonly string[] = RISE_ABOVE;

/** The parking lot (Karel 2026-10-09): takes pulled out of the loop to revisit later. Not in the
 *  main loop; playable from the remote's Parking Lot program. */
export const PARKING_LOT: readonly string[] = [
  "06b07942-bf94-4513-8e71-ef00508ced3e", // Surrounded by Light 3 — from the Expansion (2026-10-09)
  "21448504-ec00-48c3-8b0a-c92da2cf216a", // Surrounded by Light 19 — from the Expansion (2026-10-09)
  "d8705068-f8a9-4dd7-95a5-c6f1160fed22", // Roll Away 8 — from the Expansion and Rise Above (2026-10-09)
];

/**
 * Journeys explicitly EXCLUDED from the Tramokyo show (Karel
 * 2026-09-18). The setlist builder appends any built-but-unlisted
 * journey to the final set as a safety net — these ids are exempt from
 * that net, so leaving them off the list actually leaves them out.
 * They remain playable via their album programs / the phone remote.
 */
export const TRAMOKYO_EXCLUDED_JOURNEYS: ReadonlySet<string> = new Set([
  ...PARKING_LOT, // parked takes leave the loop (remote: Parking Lot program)
  "b4ea4c60-d158-40ca-8bd5-4d2d57473e4f", // COSMIC HOMECOMING — cut from the mix (still closes the Welcome Home album program)
  "the-tempest", // PULLED 2026-09-19 (Karel) — its paired take (17th St 63 spectre) is truncated in storage to 1:12; out of the show until re-uploaded/re-paired
  "neural-link", // PULLED 2026-09-19 (Karel) — out of the show for now
  // The former Kinetic Lab set (Karel 2026-10-09: "i dont want a kinetic
  // loop anymore") — still playable from the remote's Kinetic Lab program.
  "9f7d1b51-aeac-4dfc-a39f-b00101a403f9", // Chemiluminescence 1
  "061528d4-e9a3-49c3-ad3c-f23cf9cf2251", // Rolling 2
  "84a82478-f0f2-4c49-b800-b4fe722f1df5", // Stand 10
  "3ee9acf2-c89d-42b2-b9a3-d5fce97da2ac", // Cabin Soul 8
  "b5247327-b1fd-45ce-a249-0a58a8a3c57e", // Cabin Soul 5
  "abyssal-dive", // PULLED 2026-09-19 — its "17th St 62" upload is a byte-level DUPLICATE of 17th St 63 (envelope correlation 1.000), so it played the same audio as The Ascension; benched until Karel re-uploads the true take 62
]);

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
    id: "vigil",
    presenting: "Vigil",
    description:
      "Seven solo piano pieces recorded in the studio on October 4, 2026 — " +
      "a night watch kept from evening prayer, through lantern-light and " +
      "storm, to first light. Recline.",
    pathShareToken: "c62f3672cfc54d5d",
  },
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
      "Forty-six new pieces, each its own world, where the light listens — " +
      "bass, mids and highs each move a layer while the imagery travels. " +
      "Recline.",
    // The Expansion DB path, picked + ordered by the loop's own list (the path still holds parked takes).
    pathShareToken: "3422c91db7ee4769",
    journeyIds: [...EXPANSION],
  },
  {
    id: "parking-lot",
    presenting: "the Parking Lot",
    description: "Takes pulled out of the loop, kept to revisit. Recline.",
    pathShareToken: "3422c91db7ee4769", // parked takes are Expansion journeys
    journeyIds: [...PARKING_LOT],
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
