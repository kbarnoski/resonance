import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isOfflinePack, getPathByShareToken, getJourneysByIds } from "@/lib/offline/pack";
import { getPublicPathPayload, type JourneyRow } from "./path-data";
import { PathShareButton } from "./share-button";
import { CulminationCard } from "./culmination-card";
import { Tracklist } from "./tracklist";
import { Eyebrow, DisplayTitle, MonoLabel } from "@/components/ui/typography";

// The route stays dynamic (searchParams + auth cookies for ?view=app),
// but the public payload itself is cached — getPublicPathPayload wraps
// the Supabase fetches in unstable_cache with a 300s revalidate, so
// anonymous share-link traffic doesn't hit the database per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  let data: { name: string; subtitle: string | null; description: string | null } | null;
  if (isOfflinePack()) {
    data = getPathByShareToken(token) as typeof data;
  } else {
    data = (await getPublicPathPayload(token))?.path ?? null;
  }
  if (!data) return { title: "Path not found" };

  const description =
    data.subtitle || data.description || "A shared path of journeys on Resonance";
  return {
    // Root layout template appends "— Resonance"
    title: data.name,
    description,
    openGraph: {
      title: data.name,
      description,
      url: `/path/${token}`,
      siteName: "Resonance",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: data.name,
      description,
    },
  };
}

export default async function SharedPathPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  const offline = isOfflinePack();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let path: any = null;
  let unordered: JourneyRow[] | null = null;
  let isInAppContext: boolean;

  if (offline) {
    // Offline kiosk: the operator is trusted — ?view=app alone grants the
    // in-app context (there is no Supabase session to check).
    path = getPathByShareToken(token);
    isInAppContext = view === "app";
    if (path) {
      const allIds = [...(path.journey_ids as string[])];
      if (path.culmination_journey_id) allIds.push(path.culmination_journey_id);
      unordered = getJourneysByIds(allIds) as unknown as JourneyRow[];
    }
  } else {
    // Public payload (path row + all journeys in one cached unit) — starts
    // immediately so the auth round-trip below overlaps with it.
    const payloadPromise = getPublicPathPayload(token);

    // Only touch auth when the in-app context is actually requested —
    // anonymous share-link visitors skip the Supabase auth round-trip.
    let userId: string | null = null;
    if (view === "app") {
      const authClient = await createServerClient();
      const { data } = await authClient.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const payload = await payloadPromise;
    path = payload?.path ?? null;
    unordered = payload?.journeys ?? null;

    // Two distinct contexts for the same route:
    //   • In-app (view=app + signed in as the path's OWNER): shows back
    //     arrow, plays tracks natively in The Room with full path context.
    //   • Shared landing (everything else — anon visitors, non-owner
    //     signed-in users, links opened directly from email/DM): no back
    //     arrow, tracks play via the shared /journey/[share] client.
    isInAppContext =
      view === "app" && !!userId && !!path && userId === path.user_id;
  }

  if (!path) {
    notFound();
  }

  const journeyMap = new Map<string, JourneyRow>();
  for (const j of (unordered ?? []) as JourneyRow[]) journeyMap.set(j.id, j);
  const journeys = (path.journey_ids as string[])
    .map((id: string) => journeyMap.get(id))
    .filter((j: JourneyRow | undefined): j is JourneyRow => !!j);
  const culmination = path.culmination_journey_id ? journeyMap.get(path.culmination_journey_id) ?? null : null;

  const accent = path.accent_color ?? "#d0a070";
  const glow = path.glow_color ?? "#e0b080";
  const creator = journeys[0]?.creator_name ?? "Karel Barnoski";

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-void text-white">
      {/* Top bar — back link only in the in-app context. Shared landings
          (anonymous visitors AND signed-in users opening the share link
          directly) render without it so the page feels like a standalone
          album landing. */}
      <div className="mx-auto max-w-2xl px-6 pt-6 flex items-center justify-between">
        {isInAppContext ? (
          <Link
            href="/room"
            prefetch
            className="inline-flex min-h-11 items-center gap-1.5 px-3 -mx-3 -my-3 rounded-md font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-faint hover:text-ink transition-colors duration-instant ease-enter outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            ← back
          </Link>
        ) : (
          <div />
        )}
        <PathShareButton token={token} pathName={path.name} />
      </div>

      <div className="mx-auto max-w-2xl px-6 pt-10 pb-24">
        {/* Hero */}
        <div className="mb-12 text-center">
          <Eyebrow className="mb-3 tracking-[0.22em] text-ink-faint">
            a path · by {creator}
          </Eyebrow>
          <DisplayTitle
            className="mb-4"
            style={{
              background: `linear-gradient(180deg, #fff 0%, ${glow} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: `0 0 60px ${accent}30`,
            }}
          >
            {path.name}
          </DisplayTitle>
          {path.subtitle && (
            <MonoLabel className="mb-5 text-[0.85rem] tracking-[0.04em] text-white/55">
              {path.subtitle}
            </MonoLabel>
          )}
          {path.description && (
            <p
              className="mx-auto font-sans text-[0.95rem] leading-[1.7] text-white/70"
              style={{ maxWidth: "34rem" }}
            >
              {path.description}
            </p>
          )}
          <MonoLabel className="mt-5 text-ink-faint">
            Music by {creator}
          </MonoLabel>
        </div>

        {/* Track list — client component preloads audio on hover */}
        <Tracklist
          journeys={journeys.map((j) => ({
            id: j.id,
            name: j.name,
            subtitle: j.subtitle,
            description: j.description,
            share_token: j.share_token,
            recording_id: j.recording_id,
          }))}
          isInAppContext={isInAppContext}
          pathToken={token}
          accent={accent}
          glow={glow}
        />

        {/* Culmination — locked until all journeys in the path are complete */}
        {culmination && (
          <CulminationCard
            journeyIds={path.journey_ids as string[]}
            culmination={{
              name: culmination.name,
              subtitle: culmination.subtitle,
              description: culmination.description,
              share_token: culmination.share_token,
            }}
            pathShareToken={token}
            accent={accent}
            glow={glow}
          />
        )}

        <MonoLabel className="mt-14 text-center text-[0.68rem] tracking-[0.08em] text-ink-faint">
          built with resonance
        </MonoLabel>
      </div>
    </div>
  );
}
