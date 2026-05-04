#!/usr/bin/env node
/**
 * Audit the 5 installation-loop pairings end-to-end.
 *
 * Simulates exactly what the /demo + /installation page does for an
 * unauthenticated visitor:
 *   1. Connects with the anon Supabase key (NOT the service role)
 *   2. Runs the same ILIKE / exact-title queries the page uses
 *   3. Reports which journeys have a paired track + whether the track
 *      is is_featured (required for anon to read it)
 *
 * Run with:
 *   node --env-file=.env.local scripts/audit-installation-pairings.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.\n" +
      "Tip: add `--env-file=.env.local` if you store them there.",
  );
  process.exit(1);
}

// Same anon client the page uses for unauthed visitors.
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mirror INSTALLATION_SEQUENCE from src/lib/journeys/installation-sequence.ts
const SEQUENCE = [
  "the-ascension",
  "inferno",
  "first-snow",
  "abyssal-dive",
  "ghost",
];

// Mirror PAIRED_TRACKS values for those 5
const PAIRED = {
  "the-ascension": "=17th St 63",
  "inferno": "%KB_REALIZED%",
  "first-snow": "%KB_SFLAKE%",
  "abyssal-dive": "%Folsom St 9%",
  "ghost": "%KB_GHOST_REF%",
};

async function resolvePairing(journeyId, pattern) {
  const isExact = pattern.startsWith("=");
  const base = anon
    .from("recordings")
    .select("id, title, artist, duration, is_featured")
    .eq("is_featured", true);

  if (isExact) {
    const { data, error } = await base
      .eq("title", pattern.slice(1))
      .maybeSingle();
    return { journeyId, pattern, hit: data, error };
  } else {
    const { data, error } = await base.ilike("title", pattern);
    if (error) return { journeyId, pattern, hit: null, error };
    return { journeyId, pattern, hit: data?.[0] ?? null, error: null };
  }
}

/** Hit /api/audio/{id} via the running deploy and check the response,
 *  exactly like the browser audio element does. Returns the resolved
 *  signed URL + its codec/aac metadata, or an error. */
async function checkAudioApi(recordingId, baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/audio/${recordingId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, body: await res.text().catch(() => "") };
    }
    const data = await res.json();
    if (!data.url) return { ok: false, status: res.status, body: "no url in response" };
    // HEAD the signed URL to see if storage actually serves it.
    const head = await fetch(data.url, { method: "HEAD" });
    return {
      ok: head.ok,
      status: head.status,
      url: data.url,
      codec: data.codec,
      hasAac: data.hasAac,
      contentType: head.headers.get("content-type"),
      contentLength: head.headers.get("content-length"),
    };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

async function main() {
  console.log("");
  console.log("Installation pairings — anon visitor view");
  console.log("==========================================");
  console.log("");

  const baseUrl = process.env.RESONANCE_URL ?? "https://getresonance.vercel.app";
  console.log(`Audio API base: ${baseUrl}`);
  console.log("");

  const results = [];
  for (const jid of SEQUENCE) {
    const pattern = PAIRED[jid];
    if (!pattern) {
      results.push({ journeyId: jid, pattern: "(none)", hit: null });
      continue;
    }
    const r = await resolvePairing(jid, pattern);
    if (r.hit) {
      r.audio = await checkAudioApi(r.hit.id, baseUrl);
    }
    results.push(r);
  }

  let okCount = 0;
  let missCount = 0;
  let audioFailCount = 0;

  for (const r of results) {
    const status = r.hit
      ? r.audio?.ok ? "OK     " : "AUDIO! "
      : r.error
        ? "ERR    "
        : "MISS   ";
    if (r.hit && r.audio?.ok) okCount++;
    else if (!r.hit) missCount++;
    else audioFailCount++;
    const trackInfo = r.hit
      ? `${r.hit.title} (${r.hit.duration ?? "?"}s, codec=${r.audio?.codec ?? "?"}, aac=${r.audio?.hasAac ?? "?"})`
      : "(no anon-readable match)";
    console.log(`${status} ${r.journeyId.padEnd(18)}  → ${trackInfo}`);
    if (r.audio && !r.audio.ok) {
      console.log(`         audio fail: status=${r.audio.status} ${r.audio.body ?? r.audio.url ?? ""}`);
    }
    if (r.audio?.ok) {
      console.log(`         audio ok: ${r.audio.contentType}, ${r.audio.contentLength} bytes`);
    }
    if (r.error) console.log(`         error: ${r.error.message}`);
  }

  console.log("");
  console.log(`Summary: ${okCount} ok · ${missCount} unresolved · ${audioFailCount} audio fails`);
  console.log("");

  if (missCount > 0) {
    console.log("Unresolved pairings won't play audio for anon visitors.");
    console.log("");
    console.log("To fix: ensure the recording exists in the database with a");
    console.log("title matching the pattern, AND is marked is_featured = true.");
    console.log("");
    console.log("Quick SQL check (run in Supabase SQL editor):");
    console.log("");
    console.log("  select title, is_featured from recordings");
    console.log("  where title ilike any (array[");
    console.log(
      "    '%17th St 63%', '%KB_REALIZED%', '%KB_SFLAKE%',\n" +
      "    '%17th St 62%', '%KB_GHOST_REF%'",
    );
    console.log("  ]);");
    console.log("");
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
