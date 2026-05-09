#!/usr/bin/env node
/**
 * Build the "Snowflake" EP path inside Resonance.
 *
 * Mirrors the Welcome Home path concept — a curated ordered set of
 * journeys with one shareable URL. Snowflake EP contains:
 *   1. Snowflake (TK5_MOOG)
 *   2. Realized  (formerly named Inferno in the DB)
 *   3. Ghost
 *
 * Steps:
 *   1. Resolve the canonical journey row for each (by recording_id)
 *   2. Rename the Inferno DB row to "Realized"
 *   3. Insert a journey_paths row with a fresh share_token
 *   4. Print the resulting share URL
 *
 * Idempotent: if a path with name "Snowflake" exists for Karel,
 * UPDATE its journey_ids + share_token timestamp instead of inserting
 * a duplicate.
 *
 * Usage:
 *   node --env-file=.env.local scripts/build-snowflake-path.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const KAREL_USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SNOWFLAKE_RECORDING_ID = "734a09ce-84df-4f1f-93c1-11b08d303681"; // KB_SFLAKE_TK5_MOOG_REF_2.0
const REALIZED_RECORDING_ID = "6f58d401-1cd0-479e-a252-5d34dc636e3d"; // KB_REALIZED_REF_2.0 (was paired w/ "Inferno" journey)
const GHOST_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";    // KB_GHOST_REF_2.0
const PATH_NAME = "Snowflake";
const PATH_SUBTITLE = "an EP";
const PATH_DESCRIPTION =
  "Three improvised piano compositions captured in a single studio session, tracing an arc from stillness, through fire, into light. AI-generated visuals improvise alongside, never the same twice.";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function pickJourney(recordingId, expectedName) {
  // Most recent journey row for this recording, owned by Karel.
  const { data, error } = await supabase
    .from("journeys")
    .select("id, name, created_at")
    .eq("user_id", KAREL_USER_ID)
    .eq("recording_id", recordingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No journey row for recording ${recordingId} (${expectedName})`);
  return data;
}

async function main() {
  console.log("Resolving journey rows…");
  const snowflake = await pickJourney(SNOWFLAKE_RECORDING_ID, "Snowflake");
  const inferno   = await pickJourney(REALIZED_RECORDING_ID,  "Realized");
  const ghost     = await pickJourney(GHOST_RECORDING_ID,     "Ghost");
  console.log(`  Snowflake: ${snowflake.id}  (${snowflake.name})`);
  console.log(`  Realized:  ${inferno.id}  (${inferno.name})`);
  console.log(`  Ghost:     ${ghost.id}  (${ghost.name})`);

  // Rename the Inferno DB row to Realized so it matches the
  // installation code change (journeys.ts line ~704).
  if (inferno.name !== "Realized") {
    console.log(`Renaming "${inferno.name}" → "Realized" on row ${inferno.id}…`);
    const { error } = await supabase
      .from("journeys")
      .update({ name: "Realized" })
      .eq("id", inferno.id);
    if (error) throw error;
  } else {
    console.log("  Realized already named correctly — skip rename.");
  }

  // Check for existing Snowflake path
  const { data: existing } = await supabase
    .from("journey_paths")
    .select("id, share_token, journey_ids")
    .eq("user_id", KAREL_USER_ID)
    .eq("name", PATH_NAME)
    .maybeSingle();

  const journeyIds = [snowflake.id, inferno.id, ghost.id];

  if (existing) {
    console.log(`Existing Snowflake path found (${existing.id}) — updating journey_ids only…`);
    const { error } = await supabase
      .from("journey_paths")
      .update({
        journey_ids: journeyIds,
        subtitle: PATH_SUBTITLE,
        description: PATH_DESCRIPTION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    console.log(`Done. Share URL: /path/${existing.share_token}`);
    return;
  }

  // Generate a fresh 32-char hex share token (matches WH path length).
  const shareToken = randomBytes(16).toString("hex");

  console.log("Inserting new Snowflake path row…");
  const { data: created, error } = await supabase
    .from("journey_paths")
    .insert({
      user_id: KAREL_USER_ID,
      name: PATH_NAME,
      subtitle: PATH_SUBTITLE,
      description: PATH_DESCRIPTION,
      journey_ids: journeyIds,
      share_token: shareToken,
      accent_color: "#a8d8ea", // soft snowflake-blue
      glow_color: "#e0e7ff",
    })
    .select("id, share_token")
    .single();

  if (error) throw error;
  console.log(`\nCreated path id=${created.id}`);
  console.log(`Share token: ${created.share_token}`);
  console.log(`Share URL:   /path/${created.share_token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
