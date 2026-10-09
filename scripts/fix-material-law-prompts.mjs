#!/usr/bin/env node
/**
 * fix-material-law-prompts.mjs — targeted shot-text surgery for the
 * 2026-09-27 material-law regeneration (docs/journey-material-audit-*.json).
 *
 * Unlike the rewrite-*-visuals-v3 scripts (whole-world rewrites), this
 * applies SURGICAL string transforms to existing aiPrompt/aiPromptSequence
 * entries — fixing the specific language that summons law violations
 * while preserving each journey's authored world. Per journey:
 *   - regex/string replacements (e.g. "WHITE BACKGROUND" → warm emberlit
 *     haze: pale voids materialize as SNOW on dark journeys; "Silhouette"
 *     is a banned summoning word per docs/journey-archetype.md law 0)
 *   - appends the law-0 TAIL where missing.
 *
 * Run:  node --env-file=.env.local scripts/fix-material-law-prompts.mjs [--dry-run]
 * Then: node --env-file=.env.local scripts/build-tramokyo-pack.mjs --skip-audio --skip-images
 *       (MANDATORY — the stills harvester reads prompts from the pack
 *       snapshot data/journeys.json, not live Supabase.)
 */
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const TAIL = ", completely uninhabited, no text no signatures no watermarks no letters no writing";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Per-journey transform tables: [pattern (string|RegExp), replacement] */
const SURGERY = {
  // Realized — fire world whose expansion/illumination phases were
  // art-directed on WHITE/PALE BACKGROUND negative space; FLUX renders
  // pale infinities as snowfields on a fire journey (audit: snow in
  // slots 7-21 + 45-54 region, 3 of 6 hero clips).
  "f23b613b-7bc5-4ada-8e92-1d4ee79d30a9": [
    [/Silhouette (framing|composition):/g, "Dark-lattice $1:"],
    ["WHITE BACKGROUND — ", "WARM ASH-LIGHT FIELD, deep amber cast — "],
    ["PALE BACKGROUND — ", "PALE EMBERLIT HAZE, warm amber cast — "],
    ["against pale infinity", "against warm amber haze"],
    ["against brilliant white", "against warm ember glow"],
    ["boundless cool white", "boundless warm bone-amber haze"],
    ["cool shadows", "umber shadows"],
    ["ash-white field", "warm ash-amber field"],
    ["open white expanse", "open amber-hazed expanse"],
    ["stark against soft white", "stark against soft parchment amber"],
    ["against pale ground", "against ember-warmed ash ground"],
    ["into pale infinity", "into warm amber haze"],
    ["pale space surrounding", "amber-hazed space surrounding"],
    ["toward open space", "toward open smoke-warm space"],
  ],

  // Message — the communication concept was written in literal text
  // metaphors (word/letter/sentence/cursive/script) and FLUX obliged:
  // an entire row of glowing cursive pseudo-words ("wale mosta") shipped.
  // The concept survives as WORDLESS signal vocabulary.
  "dd2ed3c9-67e9-4450-a9ca-c1426087fa9a": [
    ["like a spoken word made visible", "like a heartbeat made visible"],
    ["the alphabet's smallest letter", "the signal's smallest spark"],
    ["writing itself across the water", "unspooling across the water"],
    ["the first sentence sent", "the first signal sent"],
    ["interference lace", "interference patterns"],
    ["writes brilliant fractal script across the sky", "branches in brilliant fractal veins across the sky"],
    ["each wake a sentence in emerald cursive winding toward the others", "each wake an emerald current winding toward the others"],
    ["agreement written in water", "agreement flowing in water"],
    ["the wakes' cursive lifting off the water as faint emerald script hanging in the night air, the lagoon's words rising to be read", "the wakes' glow lifting off the water as faint emerald ribbons hanging in the night air, the lagoon's signals rising into the dark"],
    ["the word outliving the voice", "the signal outliving the voice"],
    ["keeping the language alive", "keeping the signal alive"],
  ],

  // Held — one literal "frost" summoned frost-crystal macros.
  "549719aa-4a15-4981-8a9a-34ee66fca156": [
    ["frost at the cave mouth's rim melting into beads", "dew at the cave mouth's rim gathering into beads"],
  ],

  // Lace family — "lace" renders as white doily/snowflake forms.
  "8997623d-8770-41ce-863d-f359d1a213c4": [
    [/\blacework\b/g, "gold filigree"],
    [/\blace\b/g, "filigree"],
  ],
  "a5b5f0cf-9a6b-451a-8293-3d98f3904342": [
    [/\blacework\b/g, "gold filigree"],
    [/\blace\b/g, "filigree"],
  ],
  "5a3e5044-9da5-404e-b3d6-c0c4fc757a5b": [
    [/\blacework\b/g, "gold filigree"],
    [/\blace\b/g, "filigree"],
    // Round-2 (verify pass): the spirit-hint column rendered a literal
    // walking person in 7 of 10 pillar stills; the sparse violet night
    // sky grew moons; "alphabet" is text-risk.
    ["half-gathers into a tall almost-presence, translucent and featureless, walking nowhere, unraveling back into wind",
     "turning slowly in place, translucent and featureless, its crown dissolving into drifting motes, unraveling back into wind"],
    ["beneath a sky veiled in thin high dust glowing faint violet",
     "beneath a sky filled edge to edge with thin high dust glowing faint violet and dense sheets of dim stars"],
    ["the desert dreaming in its own alphabet", "the desert dreaming in its own patterns"],
  ],
};

const applyOne = (text, rules) => {
  let out = text;
  for (const [pat, rep] of rules) out = out.replaceAll(pat, rep);
  if (!out.includes("completely uninhabited")) out += TAIL;
  return out;
};

let touched = 0;
for (const [jid, rules] of Object.entries(SURGERY)) {
  const { data, error } = await supabase.from("journeys").select("name,phases").eq("id", jid).single();
  if (error) { console.error(jid, error.message); process.exit(1); }
  let changed = 0;
  const phases = data.phases.map((p) => {
    const next = { ...p };
    if (typeof p.aiPrompt === "string") {
      next.aiPrompt = applyOne(p.aiPrompt, rules);
      if (next.aiPrompt !== p.aiPrompt) changed++;
    }
    if (Array.isArray(p.aiPromptSequence)) {
      next.aiPromptSequence = p.aiPromptSequence.map((s) => applyOne(s, rules));
      next.aiPromptSequence.forEach((s, i) => { if (s !== p.aiPromptSequence[i]) changed++; });
    }
    return next;
  });
  console.log(`${data.name} (${jid.slice(0, 8)}): ${changed} prompt strings changed`);
  if (DRY) {
    for (const p of phases) (p.aiPromptSequence ?? []).forEach((s, i) => console.log(`  ${p.id}#${i}: ${s.slice(0, 120)}`));
    continue;
  }
  if (changed > 0) {
    const { error: upErr } = await supabase.from("journeys").update({ phases }).eq("id", jid);
    if (upErr) { console.error(jid, upErr.message); process.exit(1); }
    touched++;
  }
}
console.log(DRY ? "(dry run — nothing written)" : `updated ${touched} journeys — now refresh the pack snapshot (build-tramokyo-pack --skip-audio --skip-images)`);
