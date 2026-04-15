// One-shot: rewrite each Welcome Home journey description so it
// describes the visual/emotional experience only. Strip out any
// reference to the track name, the album, or musical details
// (key, tempo, chord, BPM, mood label) — viewers are already inside
// the album and already see the track name above the description.

import { createClient } from "@supabase/supabase-js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const anthropic = createAnthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });
const model = anthropic("claude-sonnet-4-5-20250929");

const output = JSON.parse(readFileSync("scripts/welcome-home-output.json", "utf-8"));

const schema = z.object({
  description: z.string().min(40).max(320),
});

async function rewriteOne(journeyId, cleanTitle) {
  // Pull the existing story + phases to give Claude something to work from.
  const { data: row } = await supabase
    .from("journeys")
    .select("name, subtitle, description, story_text, phases, theme")
    .eq("id", journeyId)
    .single();
  if (!row) throw new Error(`Journey ${journeyId} not found`);

  const phaseHints = (row.phases ?? [])
    .slice(0, 3)
    .map((p) => p.aiPrompt?.slice(0, 120))
    .filter(Boolean)
    .join(" · ");
  const themeMood = row.theme?.poetryMood ?? "flowing";
  const subtitle = row.subtitle ?? "";

  const { object } = await generateObject({
    model,
    schema,
    mode: "tool",
    maxTokens: 500,
    prompt: `Rewrite the description for a musical journey.

Original title: "${cleanTitle}"
Original subtitle: "${subtitle}"
Existing long-form story (for your context only, don't paraphrase): ${row.story_text?.slice(0, 500) ?? ""}
Visual phase hints: ${phaseHints}
Mood: ${themeMood}

RULES — ABSOLUTE:
— Write 2 to 3 sentences, 40 to 220 characters total.
— DO NOT mention the track title "${cleanTitle}".
— DO NOT mention the album or the word "album" or "Welcome Home" (unless the track IS literally called "Welcome Home", in which case avoid self-referential language anyway).
— DO NOT mention musical details: no key, no BPM, no tempo, no chord names, no time signature, no mood-word labels like "melancholic" or "dreamy".
— DO NOT use the phrase "a journey" or "this journey" or "journey through" — the listener already knows it's a journey.
— Describe the VISUAL and EMOTIONAL experience — what they will see, feel, and move through. Make it evocative, image-first, cinematic.
— Voice: like a poetic listening note on an album liner. Unhurried, specific, sensory.

Return ONLY the new description text.`,
    temperature: 0.75,
  });

  const newDesc = object.description.trim();
  const { error } = await supabase.from("journeys").update({ description: newDesc }).eq("id", journeyId);
  if (error) throw new Error(error.message);
  console.log(`✓ ${cleanTitle}`);
  console.log(`  ${newDesc}\n`);
}

async function main() {
  for (const j of output.journeys) {
    try {
      await rewriteOne(j.journeyId, j.cleanTitle);
    } catch (err) {
      console.error(`✗ ${j.cleanTitle}: ${err.message}`);
    }
  }

  // Also rewrite the culmination — fetch its id from the path.
  const { data: pathRow } = await supabase
    .from("journey_paths")
    .select("culmination_journey_id, name")
    .eq("id", output.pathId)
    .single();
  if (pathRow?.culmination_journey_id) {
    try {
      await rewriteOne(pathRow.culmination_journey_id, "Culmination");
    } catch (err) {
      console.error(`✗ Culmination: ${err.message}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
