import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { InstallationClient } from "@/components/audio/installation-client";
import { InstallationLoopClient, type SequenceEntry, type InstallationProgram } from "@/components/audio/installation-loop-client";
import { QUARANTINED_RECORDING_IDS } from "@/components/audio/installation-machine";
import { getJourney, JOURNEYS } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { INSTALLATION_PROGRAMS, TRAMOKYO_MIX_ID } from "@/lib/journeys/installation-sequence";
import type { Track } from "@/lib/audio/audio-store";
import type { Journey } from "@/lib/journeys/types";
import {
  isOfflinePack,
  listRecordings,
  getCueMarkers,
  getPathByShareToken,
  getJourneysByIds,
  getRecording,
} from "@/lib/offline/pack";

// Force dynamic so every request executes server code (and we read
// fresh auth state instead of returning a cached anon-mode page to a
// signed-in user, etc.).
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    journey?: string;
    loop?: string;
    debug?: string;
    once?: string;
    start?: string;
  }>;
}

export default async function InstallationPage({ searchParams }: Props) {
  const { journey, loop, debug, once, start } = await searchParams;
  const isLoop = loop === "1" || loop === "true";
  const isDebug = debug === "1" || debug === "true";
  // ?once=1 → play through the cycle a single time then end on the
  // credits screen instead of looping back to the intro.
  const isPlayOnce = once === "1" || once === "true";
  // ?start=N | ?start=journey-id | ?start=program-id → jump straight
  // to that point in the loop. Resolved against the built programs
  // further down (after they're assembled) — out-of-range values fall
  // back to program 0, journey 0.

  // Auth is OPTIONAL on this page. Authenticated users see the full
  // experience including AI imagery; anonymous visitors see a public
  // demo (shader + audio + journey titles) so they can review the
  // installation without signing up. The fal.ai endpoints are still
  // auth-gated — anon viewers don't trigger AI generation, so we
  // don't burn upstream credits for unauthenticated traffic.
  const offline = isOfflinePack();
  const supabaseAuth = offline ? null : await createClient();
  const authUser = supabaseAuth ? (await supabaseAuth.auth.getUser()).data.user : null;
  // Offline kiosk gets the full (trusted-operator) experience.
  const anonMode = offline ? false : !authUser;

  // ─── Loop mode: curated sequence of all built-in journeys ─────────
  // Sequence draft = every featured (built-in) journey in declaration
  // order. Each journey gets paired with its hardcoded `recordingId`,
  // then a PAIRED_TRACKS title-pattern lookup, then a featured-pool
  // pick, in that order.
  if (isLoop) {
    // Authed users: read with their session (RLS + own tracks).
    // Anon users: read with the anon key (RLS will only return rows
    // explicitly marked is_featured or attached to a shared journey).
    const supabase = offline
      ? null
      : authUser
        ? await createClient()
        : createAnonClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          );

    // Fallback pool. For authed users: their own recordings (featured
    // first). For anon: only is_featured rows from the entire library
    // (RLS gates this; no cross-user data leaks).
    let featuredRecordings: { id: string; title: string; artist: string | null; duration: number | null }[] = [];
    if (offline) {
      type Row = { id: string; title: string; artist: string | null; duration: number | null; is_featured: boolean | null; created_at: string | null };
      const rows = (listRecordings() as unknown as Row[])
        .slice()
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      const featured = rows.filter((r) => r.is_featured);
      const rest = rows.filter((r) => !r.is_featured);
      featuredRecordings = [...featured, ...rest].map(({ id, title, artist, duration }) => ({ id, title, artist, duration }));
    } else if (authUser) {
      const { data: userRecs } = await supabase!
        .from("recordings")
        .select("id, title, artist, duration, is_featured")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (userRecs) {
        type Row = { id: string; title: string; artist: string | null; duration: number | null; is_featured: boolean | null };
        const rows = userRecs as Row[];
        const featured = rows.filter((r) => r.is_featured);
        const rest = rows.filter((r) => !r.is_featured);
        featuredRecordings = [...featured, ...rest].map(({ id, title, artist, duration }) => ({ id, title, artist, duration }));
      }
    } else {
      // Anon kiosk: featured pool via the SECURITY DEFINER function
      // (released-set gated — quarantined uploads excluded at the DB
      // level too). Survives the Phase-2 anon RLS flip.
      const { data: pubRecs } = await supabase!.rpc("get_featured_recordings");
      if (pubRecs) {
        type FeaturedRow = { id: string; title: string; artist: string | null; duration: number | null; created_at: string | null };
        featuredRecordings = (pubRecs as FeaturedRow[])
          .slice()
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          .map(({ id, title, artist, duration }) => ({ id, title, artist, duration }));
      }
    }

    // Resolve PAIRED_TRACKS values → recording rows. Two value formats:
    //   "%pattern%"  — SQL ILIKE pattern; first matching title wins
    //   "=Exact"     — exact title match; avoids collisions like
    //                  "17th St 63" vs "17th St 63 spectre"
    // For authed users we restrict to their own recordings. For anon
    // we restrict to is_featured rows only — no cross-user leak.
    const pairedPatterns = Object.entries(PAIRED_TRACKS);
    const pairedRecordingByJourneyId: Record<string, typeof featuredRecordings[number]> = {};

    const ilikePatterns = pairedPatterns.filter(([, p]) => !p.startsWith("="));
    const exactPatterns = pairedPatterns.filter(([, p]) => p.startsWith("="));

    // Offline: resolve both pattern forms in memory against the pack.
    if (offline) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = listRecordings() as any[];
      for (const [jid, p] of pairedPatterns) {
        if (p.startsWith("=")) {
          const exactTitle = p.slice(1);
          const hit = rows.find((r) => r.title === exactTitle);
          if (hit) pairedRecordingByJourneyId[jid] = { id: hit.id, title: hit.title, artist: hit.artist ?? null, duration: hit.duration ?? null };
        } else {
          const needle = p.replace(/^%|%$/g, "").toLowerCase();
          const hit = rows.find((r) => (r.title ?? "").toLowerCase().includes(needle));
          if (hit) pairedRecordingByJourneyId[jid] = { id: hit.id, title: hit.title, artist: hit.artist ?? null, duration: hit.duration ?? null };
        }
      }
    }

    // Anon: resolve both pattern forms in JS against the featured pool
    // fetched above via get_featured_recordings — the same rows the old
    // is_featured-scoped SQL queries matched (the pool is ~dozens of
    // rows). No direct anon table reads → survives the Phase-2 flip.
    if (!offline && !authUser) {
      for (const [jid, p] of pairedPatterns) {
        if (p.startsWith("=")) {
          const exactTitle = p.slice(1);
          const hit = featuredRecordings.find((r) => r.title === exactTitle);
          if (hit) pairedRecordingByJourneyId[jid] = hit;
        } else {
          const needle = p.replace(/^%|%$/g, "").toLowerCase();
          const hit = featuredRecordings.find((r) => (r.title ?? "").toLowerCase().includes(needle));
          if (hit) pairedRecordingByJourneyId[jid] = hit;
        }
      }
    }

    // ILIKE patterns (authed) — single OR query scoped to the user's
    // own tracks.
    if (!offline && authUser && ilikePatterns.length > 0) {
      const orFilter = ilikePatterns.map(([, p]) => `title.ilike.${p}`).join(",");
      const { data: ilikeRows } = await supabase!
        .from("recordings")
        .select("id, title, artist, duration")
        .eq("user_id", authUser.id)
        .or(orFilter);
      if (ilikeRows) {
        for (const [jid, p] of ilikePatterns) {
          const needle = p.replace(/^%|%$/g, "").toLowerCase();
          const hit = (ilikeRows as typeof featuredRecordings).find((r) =>
            (r.title ?? "").toLowerCase().includes(needle),
          );
          if (hit) pairedRecordingByJourneyId[jid] = hit;
        }
      }
    }

    // Exact matches (authed) — one query each (simple .eq, no
    // OR-encoding issues)
    if (!offline && authUser) {
      for (const [jid, p] of exactPatterns) {
        const exactTitle = p.slice(1);
        const { data: row } = await supabase!
          .from("recordings")
          .select("id, title, artist, duration")
          .eq("user_id", authUser.id)
          .eq("title", exactTitle)
          .maybeSingle();
        if (row) pairedRecordingByJourneyId[jid] = row as typeof featuredRecordings[number];
      }
    }

    const toTrack = (r: { id: string; title: string; artist: string | null; duration: number | null }): Track => ({
      id: r.id,
      title: r.title || "Untitled",
      audioUrl: `/api/audio/${r.id}`,
      duration: r.duration,
      artist: r.artist,
    });

    // ─── Program building ─────────────────────────────────────────
    // Each INSTALLATION_PROGRAMS entry resolves to a SequenceEntry[]:
    //   - journeyIds     → built-in journeys with the recordingId /
    //                      PAIRED_TRACKS / fallback pairing chain
    //   - pathShareToken → a journey_paths row (Welcome Home): its
    //                      journey_ids in order + culmination last,
    //                      each DB journey paired via recording_id
    //                      (culmination falls back to its theme's
    //                      randomTrackPool when unbound).
    const buildBuiltinSequence = (ids: string[]): SequenceEntry[] =>
      ids
        .map((id) => getJourney(id))
        .filter((j): j is Journey => !!j)
        .map((j: Journey) => {
          // Priority 1: explicit recordingId baked into the journey definition.
          if (j.recordingId) {
            const direct = featuredRecordings.find((r) => r.id === j.recordingId);
            if (direct) return { journey: j, track: toTrack(direct) };
          }
          // Priority 2: title-pattern pairing (e.g., "ghost" → KB_GHOST_REF).
          const paired = pairedRecordingByJourneyId[j.id];
          if (paired) return { journey: j, track: toTrack(paired) };
          // Priority 3: leave null; loop client will pick from fallback pool.
          return { journey: j, track: null };
        });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type JourneyRow = Record<string, any>;

    // Same live-merge as /journey/[token]: rows wrapping a built-in use
    // the live definition (design changes propagate), custom rows use
    // the DB snapshot. Row id is kept so offline local-image fallback
    // (keyed by path journey uuid) still resolves.
    const rowToJourney = (row: JourneyRow): Journey => {
      const theme = row.theme as Record<string, unknown> | null;
      const builtinId = theme?.builtinJourneyId as string | undefined;
      const live = builtinId
        ? getJourney(builtinId)
        : JOURNEYS.find((j) => j.name === row.name) ?? null;
      const extras = {
        ...(Array.isArray(row.local_image_urls) && row.local_image_urls.length > 0
          ? { localImageUrls: row.local_image_urls as string[] }
          : {}),
        photographyCredit: (row.photography_credit as string | null) ?? null,
        dedication: (row.dedication as string | null) ?? null,
        creatorName: (row.creator_name as string | null) ?? null,
      };
      if (live) {
        return { ...live, id: row.id as string, ...extras };
      }
      return {
        id: row.id,
        name: row.name,
        subtitle: row.subtitle || "",
        description: row.description || "",
        realmId: row.realm_id,
        phases: row.phases,
        aiEnabled: row.ai_enabled !== false,
        ...(row.theme ? { theme: row.theme } : {}),
        ...extras,
      } as Journey;
    };

    const buildPathSequence = async (shareToken: string): Promise<SequenceEntry[]> => {
      let pRow: JourneyRow | null = null;
      if (offline) {
        pRow = getPathByShareToken(shareToken);
      } else {
        // Token-scoped SECURITY DEFINER reads for the path + its member
        // journeys — used for BOTH auth states: the functions are granted
        // to anon and authenticated, and after the Phase-2 flip a direct
        // read would only work for the path's owner.
        const { data } = await supabase!.rpc("get_path_by_token", { p_token: shareToken });
        pRow = ((data ?? []) as JourneyRow[])[0] ?? null;
      }
      if (!pRow || !Array.isArray(pRow.journey_ids)) return [];
      const orderedIds = [...(pRow.journey_ids as string[])];
      if (pRow.culmination_journey_id) orderedIds.push(pRow.culmination_journey_id as string);

      let rows: JourneyRow[] = [];
      if (offline) {
        rows = getJourneysByIds(orderedIds);
      } else {
        const { data } = await supabase!.rpc("get_path_journeys", { p_token: shareToken });
        rows = (data ?? []) as JourneyRow[];
      }
      const rowById = new Map(rows.map((r) => [r.id as string, r]));

      // Resolve each journey's recording once (culmination random-pool
      // pick included) so the meta lookup + track build agree.
      const recordingIdByJourneyId = new Map<string, string>();
      for (const jid of orderedIds) {
        const row = rowById.get(jid);
        if (!row) continue;
        let rid = (row.recording_id as string | null) ?? null;
        const theme = row.theme as Record<string, unknown> | null;
        const pool = theme?.randomTrackPool;
        if (!rid && theme?.isCulmination && Array.isArray(pool) && pool.length > 0) {
          rid = (pool as string[])[Math.floor(Math.random() * pool.length)];
        }
        if (rid) recordingIdByJourneyId.set(jid, rid);
      }

      // Recording meta (title/artist/duration) for credits + end
      // detection. Missing rows (e.g. anon RLS online) degrade to the
      // journey name + null duration — /api/audio still serves the
      // audio for shared-path journeys.
      const rids = [...new Set(recordingIdByJourneyId.values())];
      const recMetaById = new Map<string, { title: string | null; artist: string | null; duration: number | null }>();
      if (offline) {
        for (const rid of rids) {
          const rec = getRecording(rid);
          if (rec) recMetaById.set(rid, { title: rec.title ?? null, artist: rec.artist ?? null, duration: rec.duration ?? null });
        }
      } else if (authUser && rids.length > 0) {
        const { data: recRows } = await supabase!
          .from("recordings")
          .select("id, title, artist, duration")
          .in("id", rids);
        for (const r of (recRows ?? []) as Array<{ id: string; title: string | null; artist: string | null; duration: number | null }>) {
          recMetaById.set(r.id, { title: r.title, artist: r.artist, duration: r.duration });
        }
      } else if (rids.length > 0) {
        // Anon: released-set-gated meta, one call per recording (the
        // sequence is ~a dozen tracks). Missing rows keep degrading to
        // the journey name + null duration exactly as before.
        const metaResults = await Promise.all(
          rids.map((rid) => supabase!.rpc("get_released_recording_meta", { p_recording_id: rid })),
        );
        for (const res of metaResults) {
          const r = ((res.data ?? []) as Array<{ id: string; title: string | null; artist: string | null; duration: number | null }>)[0];
          if (r) recMetaById.set(r.id, { title: r.title, artist: r.artist, duration: r.duration });
        }
      }

      return orderedIds
        .map((jid) => rowById.get(jid))
        .filter((row): row is JourneyRow => !!row)
        .map((row) => {
          const jid = row.id as string;
          const rid = recordingIdByJourneyId.get(jid) ?? null;
          const meta = rid ? recMetaById.get(rid) : undefined;
          const track: Track | null = rid
            ? {
                id: rid,
                title: meta?.title || (row.name as string) || "Untitled",
                audioUrl: `/api/audio/${rid}`,
                duration: meta?.duration ?? null,
                artist: meta?.artist ?? null,
              }
            : null;
          return { journey: rowToJourney(row), track };
        });
    };

    const programs: InstallationProgram[] = [];
    for (const def of INSTALLATION_PROGRAMS) {
      let seq: SequenceEntry[] = [];
      if (def.journeyIds) {
        seq = buildBuiltinSequence(def.journeyIds);
      } else if (def.pathShareToken) {
        seq = await buildPathSequence(def.pathShareToken);
      }
      // Programs that resolve empty (path missing, RLS-blocked) are
      // dropped rather than rendered as an intro-to-credits flash.
      if (seq.length > 0) {
        programs.push({
          id: def.id,
          presenting: def.presenting,
          description: def.description,
          dedication: def.dedication,
          sequence: seq,
        });
      }
    }

    // ── Tramokyo Mix — the default ambient program (Karel 2026-08-30) ──
    // A shuffle of everything: every album program's sequence plus the
    // paired featured built-ins not already present. Shuffled fresh per
    // server boot; the loop always returns here after an album plays.
    // Albums stay selectable from the phone's Start-from buttons.
    if (programs.length > 0) {
      const seen = new Set(
        programs.flatMap((p) => p.sequence.map((e) => e.journey.id)),
      );
      const extraBuiltinIds = Object.keys(PAIRED_TRACKS).filter(
        (id) => !seen.has(id),
      );
      const pool = [
        ...programs.flatMap((p) => p.sequence),
        ...buildBuiltinSequence(extraBuiltinIds),
      ];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      programs.unshift({
        id: TRAMOKYO_MIX_ID,
        presenting: "an evening of selections",
        description:
          "Pieces from across the catalog — Welcome Home, Snowflake, and " +
          "the featured journeys — in an order of their own.",
        dedication: {
          eyebrow: "with gratitude to",
          hero: "Johnny and our hosts",
          secondary: "for opening their land to this evening",
        },
        sequence: pool,
      });
    }

    // Pre-fetch cue markers for every paired track across all programs.
    // The journey-engine uses these to fire bass_hit events that drive
    // Ghost's bass flash overlay (and any future per-cue effects). Without
    // this, ghost's iconic flashes never trigger in installation mode.
    const trackedRecordingIds = [
      ...new Set(
        programs
          .flatMap((p) => p.sequence)
          .map((s) => s.track?.id)
          .filter((id): id is string => !!id),
      ),
    ];
    const cuesByRecordingId: Record<string, Array<{ time: number; label: string }>> = {};
    if (offline) {
      for (const rid of trackedRecordingIds) {
        const cues = getCueMarkers(rid);
        if (cues.length > 0) cuesByRecordingId[rid] = cues;
      }
    } else if (trackedRecordingIds.length > 0) {
      const { data: markerRows } = await supabase!
        .from("markers")
        .select("recording_id, time, label")
        .in("recording_id", trackedRecordingIds)
        .eq("type", "cue")
        .order("time");
      for (const m of (markerRows ?? []) as Array<{ recording_id: string; time: number; label: string }>) {
        if (!cuesByRecordingId[m.recording_id]) cuesByRecordingId[m.recording_id] = [];
        cuesByRecordingId[m.recording_id].push({ time: m.time, label: m.label });
      }
    }

    // Attach cues to each sequence entry so the loop client can apply
    // them to the journey-engine when each journey starts.
    const programsWithCues: InstallationProgram[] = programs.map((p) => ({
      ...p,
      sequence: p.sequence.map((entry) => ({
        ...entry,
        cues: entry.track ? (cuesByRecordingId[entry.track.id] ?? []) : [],
      })),
    }));

    // Fallback/DJ pool for unpaired journeys. Quarantined 17th St /
    // Folsom St uploads are EXCLUDED (unverified authorship — Karel's
    // decision, 2026-08-25 audit; see QUARANTINED_RECORDING_IDS). The
    // filter sits here, not on featuredRecordings, so curated
    // recordingId / PAIRED_TRACKS pairings above are untouched.
    const fallbackTracks = featuredRecordings
      .filter((r) => !QUARANTINED_RECORDING_IDS.has(r.id))
      .map(toTrack);

    // Resolve ?start now that programs exist. Accepts a program id
    // ("snowflake-ep"), a journey id (builtin like "ghost" or a path
    // journey uuid), or a numeric index into the first program.
    let startProgramIndex = 0;
    let startIndexInProgram = 0;
    if (start && programsWithCues.length > 0) {
      const pIdx = programsWithCues.findIndex((p) => p.id === start);
      if (pIdx >= 0) {
        startProgramIndex = pIdx;
      } else {
        const n = Number(start);
        if (Number.isInteger(n) && n >= 0) {
          if (n < programsWithCues[0].sequence.length) startIndexInProgram = n;
        } else {
          for (let pi = 0; pi < programsWithCues.length; pi++) {
            const ji = programsWithCues[pi].sequence.findIndex((e) => e.journey.id === start);
            if (ji >= 0) {
              startProgramIndex = pi;
              startIndexInProgram = ji;
              break;
            }
          }
        }
      }
    }

    return (
      <div className="h-screen w-screen overflow-hidden bg-void">
        {/* Preload Cormorant Garamond (self-hosted) — used by both the
            cycle intro ("Resonance") and every journey title. Without
            this preload the cycle title initially painted in Georgia
            (system fallback) and re-rendered once the font lazy-loaded,
            producing a visible type-style change as journey 0 started. */}
        <link
          rel="preload"
          href="/fonts/cormorant-garamond-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <InstallationLoopClient
          programs={programsWithCues}
          fallbackTracks={fallbackTracks}
          debug={isDebug}
          anonMode={anonMode}
          playOnce={isPlayOnce}
          startIndex={startIndexInProgram}
          startProgramIndex={startProgramIndex}
        />
      </div>
    );
  }

  // ─── Legacy single-journey kiosk mode (unchanged) ──────────────────
  let tracks: Track[] = [];
  if (offline) {
    // Quarantined uploads excluded here too — this pool feeds the
    // legacy random-track kiosk directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (listRecordings() as any[]).filter(
      (r) => !QUARANTINED_RECORDING_IDS.has(r.id),
    );
    const featured = rows.filter((r) => r.is_featured);
    const pool = featured.length > 0 ? featured : rows;
    tracks = pool.map((r) => ({
      id: r.id,
      title: r.title || "Untitled",
      audioUrl: `/api/audio/${r.id}`,
      duration: r.duration ?? null,
    }));
  } else try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Featured pool via the SECURITY DEFINER function (granted to anon
    // AND authenticated) — the direct is_featured read only worked for
    // anon through the blanket policy that the Phase-2 flip removes.
    const { data: featuredRows } = await supabase.rpc("get_featured_recordings");
    const featured = ((featuredRows ?? []) as Array<{ id: string; title: string; duration: number | null; created_at: string | null }>)
      .slice()
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

    if (featured && featured.length > 0) {
      tracks = featured.map((r) => ({
        id: r.id,
        title: r.title || "Untitled",
        audioUrl: `/api/audio/${r.id}`,
        duration: r.duration,
      }));
    } else if (user) {
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    }
  } catch {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return (
          <div className="h-screen w-screen overflow-hidden bg-void">
            <InstallationClient tracks={[]} journey={journey} />
          </div>
        );
      }
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    } catch {
      // No tracks available
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-void">
      <InstallationClient tracks={tracks} journey={journey} />
    </div>
  );
}
