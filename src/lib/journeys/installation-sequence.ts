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
 * TRAMOKYO SETLIST — curated order (Karel 2026-08-30). Opens Snowflake →
 * Realized → Ghost, then a fixed one-time randomization of the full
 * catalog mix (Welcome Home album + featured journeys). Tweak freely:
 * reorder/remove lines; anything not listed is appended at the end.
 * FULLY DETERMINISTIC (Karel 2026-09-18): every journey below has an
 * explicit track pairing (path journeys carry exact recording ids;
 * built-ins resolve via PAIRED_TRACKS). There is no fallback pool — an
 * unresolved pairing is skipped and flight-recorded, never substituted.
 */
export const TRAMOKYO_SETLIST: readonly string[] = [
  "first-snow", //  1. Snowflake
  "inferno", //  2. Realized
  "ghost", //  3. Ghost
  "27f52cf0-5fad-420f-8324-8017c414f1f8", //  4. Interplay
  "mycelium-dream", //  5. Mycelium Dream — Folsom St 8 (restored pairing 2026-09-18)
  "the-tempest", //  6. The Tempest — 17th St 63 spectre (restored pairing 2026-09-18; take verified as Karel's)
  "neural-link", //  7. Neural Link — Folsom St 6 (re-paired 2026-09-18; take verified as Karel's)
  "38daff92-ae34-4448-8868-5f1df6029b94", //  8. Rolling
  "cosmic-drift", //  9. Cosmic Drift — 17th St 61 (restored pairing 2026-09-18)
  "the-bloom", // 10. The Bloom — Folsom St 9 (restored pairing 2026-09-18)
  "the-ascent", // 11. The Ascent — Folsom St 5 (restored pairing 2026-09-18)
  "cd517f5a-c4eb-4d50-8a53-044aa668d087", // 12. Stir Crazy
  "abyssal-dive", // 13. Abyssal Dive — 17th St 62 (re-paired 2026-09-18; take verified as Karel's)
  "8997623d-8770-41ce-863d-f359d1a213c4", // 14. Rebound
  "the-ascension", // 15. The Ascension — 17th St 63 (restored pairing 2026-09-18)
  "019e1e1d-c7e2-4609-a9c6-364a2755b115", // 16. Quarantine
  "5a3e5044-9da5-404e-b3d6-c0c4fc757a5b", // 17. Playa
  "b207b557-e984-4a06-ae71-83124bcd80d5", // 18. All Together
  "eb79818b-c7e8-45a7-886c-2a432fe83332", // 19. 2019
  "5a3beb75-4788-4448-a024-4bfae30040c3", // 20. The Knife (Jam)
  "00fcca2b-bc1e-461a-8dcd-3fff74587f3e", // 21. The Knife
  "79e33115-7f1e-44bc-b950-7adf5055dd55", // 22. Welcome Home
  "08f4c26e-4185-440a-a25c-2440e8e7ae47", // 23. Isolation
  "a5b5f0cf-9a6b-451a-8293-3d98f3904342", // 24. Bath
  "b4ea4c60-d158-40ca-8bd5-4d2d57473e4f", // 25. COSMIC HOMECOMING
] as const;

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
  { id: "tramokyo-mix", presenting: "the first set", end: 8 }, //  1-8: Snowflake → Rolling
  { id: "tramokyo-mix-2", presenting: "the second set", end: 17 }, //  9-17: Cosmic Drift → Playa
  {
    id: "tramokyo-mix-3",
    presenting: "the final set",
    end: 25, // 18-25: All Together → COSMIC HOMECOMING
    dedication: {
      eyebrow: "with gratitude to",
      hero: "Johnny and our hosts",
      secondary: "for opening their land to this evening",
    },
  },
] as const;


export const EXPERIENCE_INTRO = {
  eyebrow: "a one-night installation",
  title: "Resonance",
  body:
    "An audiovisual experience with no beginning, no end — and never " +
    "the same. Its inspiration is drawn from nature and the universe.",
  bodySecond:
    "Every journey is generated live and never visually repeats. " +
    "Tonight's program is drawn from Karel's catalog of " +
    "recordings — Welcome Home, Surrounded by Light, March Light, " +
    "Snowflake, and others.",
  why:
    "For the artist, Resonance — like the music itself — is a way to " +
    "stay connected and keep creating, an answer to a world of " +
    "unhealthy distractions.",
  invitation: "Recline. Eyes up.",
  credit: "composed and performed by Karel Barnoski",
  thanks: "with thanks to Johnny and our hosts",
} as const;

export const INSTALLATION_PROGRAMS: InstallationProgramDef[] = [
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
