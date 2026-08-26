# Migration notes — 20260825120000_anon_token_scoped_access.sql

**Status: Phase 1 (additive) only. Nothing is broken, nothing is enforced yet.**
The SECURITY DEFINER functions exist and are callable; the old blanket anon
policies are still in place. The `-- FLIP` section at the bottom of the
migration stays commented until every flow below is migrated.

This doc is the exact code-change inventory for Phase 2, written by the
security fixer (2026-08-25). Files listed here were **deliberately not
edited** — they belong to other owners. Copy-paste-level guidance only.

Supabase RPC call shape (same for server + anon browser clients):

```ts
const { data, error } = await supabase.rpc("get_path_by_token", { p_token: token });
// data is an array for set-returning functions — use data?.[0] where a single row is expected
```

## Anon-flow inventory (verified against code 2026-08-25)

| # | Flow | File | Current anon query | Phase-2 replacement |
|---|------|------|--------------------|---------------------|
| 1 | Path landing metadata | `src/app/path/[token]/page.tsx` (generateMetadata) | `journey_paths.select("name, subtitle, description").eq("share_token", token)` | `rpc("get_path_by_token", { p_token: token })` → `[0]` |
| 2 | Path landing page | `src/app/path/[token]/page.tsx` | `journey_paths.select("*").eq("share_token", token)` | same as #1 (all used columns are returned: `journey_ids`, `culmination_journey_id`, `accent_color`, `glow_color`, `name`, `subtitle`, `description`) |
| 3 | Path member journeys | `src/app/path/[token]/page.tsx` | `journeys.select("id, name, subtitle, description, share_token, theme, recording_id, creator_name, photography_credit").in("id", allIds)` | `rpc("get_path_journeys", { p_token: token })` — superset of columns, already ordered client-side by `journey_ids` |
| 4 | Shared journey metadata | `src/app/(room)/journey/[token]/page.tsx` (generateMetadata) | `journeys.select("name, subtitle, theme").eq("share_token", token)` | `rpc("get_journey_by_token", { p_token: token })` → `[0]` |
| 5 | Shared journey page | `src/app/(room)/journey/[token]/page.tsx` | `journeys.select("*").eq("share_token", token)` | same as #4 (every non-`user_id` column is returned) |
| 6 | Journey's recording meta | `src/app/(room)/journey/[token]/page.tsx` (~line 120) | `recordings.select("artist, duration").eq("id", journeyRow.recording_id)` | `rpc("get_recording_for_journey", { p_journey_token: token })` → `[0]` |
| 7 | Journey's path context | `src/app/(room)/journey/[token]/page.tsx` (~line 191, 205) | `journey_paths.select("name, journey_ids, culmination_journey_id, accent_color, glow_color").eq("share_token", pathToken)` + `journeys.select("id, name, share_token").in("id", allIds)` | `rpc("get_path_by_token", { p_token: pathToken })` + `rpc("get_path_journeys", { p_token: pathToken })` |
| 8 | Room path context | `src/app/(room)/room/page.tsx` (~line 55) | anon `journey_paths.select("*").eq("share_token", params.pathToken)` | `rpc("get_path_by_token", { p_token: params.pathToken })` |
| 9 | Room recording fetch (anon visitor) | `src/app/(room)/room/page.tsx` (~lines 65, 83) | cookie client `recordings.select("id, title, audio_url, artist").eq("id", recordingId)` — works for anon today via the blanket public policy | `rpc("get_released_recording_meta", { p_recording_id: recordingId })` when there is no session (keep the direct table read for signed-in owners) |
| 10 | Online installation featured pool | `src/app/(room)/room/installation/page.tsx` (~lines 103–105, 145–168) | anon `recordings.select("id, title, artist, duration").eq("is_featured", true)` (+ `.or(ilike…)` / `.eq("title", …)` variants) | `rpc("get_featured_recordings")`, then filter/ilike in JS (the pool is ~dozens of rows) |
| 11 | Online installation path sequence | `src/app/(room)/room/installation/page.tsx` (~lines 249–263) | anon `journey_paths.select("journey_ids, culmination_journey_id").eq("share_token", shareToken)` + `journeys.select("*").in("id", orderedIds)` | `rpc("get_path_by_token", …)` + `rpc("get_path_journeys", …)` |
| 12 | Recording share page | `src/app/share/[token]/page.tsx` | `recordings.select("title, description")` / `select("*, analyses(*)")` `.eq("share_token", token)` | `rpc("get_recording_by_share_token", { p_token: token })`; fetch the analysis separately (see analyses follow-up below) |
| 13 | Audio API — shared resolution | `src/app/api/audio/[id]/route.ts` | anon `recordings.select(file_name, …)` with `.or("share_token.not.is.null,is_featured.eq.true")` + journey-shared fallback | **DONE 2026-08-25** — now resolves shared media via the service-role client (same released-set semantics); anon path retained only as fallback when `SUPABASE_SERVICE_ROLE_KEY` is absent. `file_name` never leaves the server. |
| 14 | Analysis API — shared resolution | `src/app/api/recordings/[id]/analysis/route.ts` (~lines 43–76) | anon `recordings.select("id, is_featured")` + `journeys.select("id").eq("recording_id", id).not("share_token","is",null)` + anon `analyses.select("*")` | switch the shared-branch to the service-role client (mirror what /api/audio now does), or `rpc("recording_is_released", { p_recording_id: id })` + service-role analysis read |
| 15 | Dream lab audio | `src/app/dream/_shared/welcomeHome.ts` | no direct table access — everything through `/api/audio/[id]` | **no change needed** (covered by #13). Do not add auth — standing rule. |
| 16 | `/api/featured` | `src/app/api/featured/route.ts` | reads `featured_albums` (different table, not in scope) | no change |
| 17 | Builder/ops scripts | `scripts/build-welcome-home-*.mjs`, `scripts/build-tramokyo-pack.mjs`, `scripts/list-*.mjs`, archive/ | run with `SUPABASE_SERVICE_ROLE_KEY` | no change — service role bypasses RLS |
| 18 | Offline pack (Tramokyo) | `src/lib/offline/pack.ts` + all `isOfflinePack()` branches | local JSON pack, no Supabase | no change |

## Analyses / markers follow-up (out of the three-table scope, flagged)

`analyses_select_public` and the featured-markers policy have the same
enumeration shape (public rows keyed off the parent recording's
featured/shared membership). The anon players on `/journey/[token]` and
`/share/[token]` read them directly today. Leave both policies in place at
flip time; if they are to be closed later, add
`get_analysis_for_released_recording(uuid)` / `get_markers_for_released_recording(uuid)`
functions gated on `recording_is_released()` first. The migration keeps the
`analyses` drop separately commented for exactly this reason.

## Related finding intentionally left to the path-page owner

Audit P1-Security #7: `?view=app` on `/path/[token]` grants the in-app
context to ANY signed-in user, not just the path owner
(`src/app/path/[token]/page.tsx:97`). Fix is one line
(`view === "app" && !!user && user.id === path.user_id` — note the page
would then need `user_id` server-side, which `get_path_by_token`
deliberately does not return; compare against the cookie client's own
`journey_paths` owner-policy read instead). Not changed here — file is
outside this fixer's ownership.

## Flip checklist (Phase 2)

1. Land all code changes above (items 1–12, 14).
2. Deploy; smoke-test **before** flipping:
   - anon `/path/d2c79111528a46cf` renders and plays a track
   - anon `/journey/<welcome-home token>` full playback
   - anon `/installation` builds its journey sequence (online mode)
   - anon `/share/<recording token>` renders
   - a dream proto on real music (e.g. `/dream/700-welcome-home`) streams audio
   - Tramokyo OFFLINE_PACK boot (should be untouched — no Supabase at all)
3. Uncomment the FLIP section in `20260825120000_anon_token_scoped_access.sql`
   (or ship it as a new dated migration — preferred) and apply.
4. Re-run the smoke list, plus: verify `curl` against
   `/rest/v1/journey_paths?select=*` with the anon key now returns `[]`.

## Applying Phase 1

Not applied to prod by the fixer (no linked `supabase/config.toml` in this
checkout; CLI 2.115.0 present but unlinked, so `supabase db lint`/`db push`
were not run). Apply with either:

```sh
npx supabase link --project-ref <ref>   # one-time
npx supabase db push
```

or paste the migration into the Supabase SQL editor. Phase 1 is additive and
safe to apply at any time.
