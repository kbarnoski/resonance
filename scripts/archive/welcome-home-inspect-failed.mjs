// Quick inspect for the two tracks that keep failing analysis.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";

const { data } = await supabase
  .from("recordings")
  .select("id, title, duration, file_name, file_size, audio_codec, audio_url")
  .eq("user_id", USER_ID)
  .in("title", ["01_Interplay", "06_The Knife (Jam)"]);

console.log(JSON.stringify(data, null, 2));
