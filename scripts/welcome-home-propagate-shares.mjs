// Fix-up after build-welcome-home-path.mjs:
// - Give each journey a playback_seed (share endpoint adds this; my builder
//   script skipped it).
// - Give each recording referenced by the journeys a share_token so
//   anonymous viewers can load the audio via RLS.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID, randomInt } from "node:crypto";

const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const output = JSON.parse(readFileSync("scripts/welcome-home-output.json", "utf-8"));

const tokenShort = () => randomUUID().replace(/-/g, "").slice(0, 16);

for (const j of output.journeys) {
  // Backfill playback_seed on the journey if missing
  const seed = String(randomInt(0, 4294967296));
  await supabase.from("journeys").update({ playback_seed: seed }).eq("id", j.journeyId).is("playback_seed", null);

  // Give the recording a share_token if it doesn't have one
  if (j.recordingId) {
    const { data: existing } = await supabase
      .from("recordings")
      .select("share_token")
      .eq("id", j.recordingId)
      .single();
    if (!existing?.share_token) {
      const rt = tokenShort();
      const { error } = await supabase
        .from("recordings")
        .update({ share_token: rt })
        .eq("id", j.recordingId);
      if (error) {
        console.error(`  ✗ ${j.cleanTitle}: ${error.message}`);
      } else {
        console.log(`  ✓ ${j.cleanTitle}: recording share_token ${rt}`);
      }
    } else {
      console.log(`  ○ ${j.cleanTitle}: already had ${existing.share_token}`);
    }
  }
}

console.log("\nDone.");
