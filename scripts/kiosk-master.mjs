#!/usr/bin/env node
// Mastering-session driver: `node scripts/kiosk-master.mjs snowflake`
// jumps the kiosk to that journey and holds it on repeat; `... off`
// releases the hold. Names resolve against the pack (built-in slugs +
// DB journey names, case-insensitive substring).
import { readFileSync } from "node:fs";
const q = process.argv.slice(2).join(" ").trim().toLowerCase();
if (!q) { console.error("usage: kiosk-master.mjs <journey name | id | off>"); process.exit(1); }
const post = async (command) => {
  const r = await fetch("http://localhost:3000/api/pack/remote", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  console.log(command, "->", r.status);
};
if (q === "off") { await post("master:off"); process.exit(0); }
const BUILTINS = { snowflake: "first-snow", realized: "inferno", ghost: "ghost", summit: "the-ascent", ascension: "the-ascension", bloom: "the-bloom", "cosmic drift": "cosmic-drift", mycelium: "mycelium-dream" };
let jid = BUILTINS[q] ?? null;
if (!jid) {
  const rows = JSON.parse(readFileSync("public/tramokyo-pack/data/journeys.json", "utf8"));
  const hit = rows.find((r) => (r.name ?? "").toLowerCase() === q) ?? rows.find((r) => (r.name ?? "").toLowerCase().includes(q));
  if (hit) jid = hit.id;
}
if (!jid && /^[\w-]{4,}$/.test(q)) jid = q;
if (!jid) { console.error("no journey matches:", q); process.exit(1); }
await post(`master:${jid}`);
