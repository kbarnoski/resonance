import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PathShareButton } from "./share-button";
import { CulminationCard } from "./culmination-card";
import { Tracklist } from "./tracklist";

export const dynamic = "force-dynamic";

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("journey_paths")
    .select("name, subtitle, description")
    .eq("share_token", token)
    .single();
  if (!data) return { title: "Path not found" };
  return {
    title: `${data.name} — Resonance`,
    description: data.subtitle || data.description || "A shared path of journeys on Resonance",
  };
}

interface JourneyRow {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  share_token: string | null;
  theme: { palette?: { accent?: string; glow?: string } } | null;
  recording_id: string | null;
  creator_name: string | null;
  photography_credit: string | null;
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
  const supabase = createAnonClient();
  const authClient = await createServerClient();

  // Fire auth check + path row fetch in parallel — they're independent and
  // together dominate page latency. Was ~700ms sequential, ~400ms parallel.
  const [userResult, pathResult] = await Promise.all([
    authClient.auth.getUser(),
    supabase.from("journey_paths").select("*").eq("share_token", token).single(),
  ]);
  const user = userResult.data.user;
  const path = pathResult.data;
  const pathErr = pathResult.error;

  // Two distinct contexts for the same route:
  //   • In-app (view=app + signed in): shows back arrow, plays tracks
  //     natively in The Room with full path context.
  //   • Shared landing (everything else — anon visitors, signed-in users
  //     who opened the share link directly from email/DM): no back arrow,
  //     tracks play via the shared /journey/[share] client.
  const isInAppContext = view === "app" && !!user;

  if (pathErr || !path) {
    notFound();
  }

  // Fetch journeys in the order stored in journey_ids + culmination if present
  const allIds = [...(path.journey_ids as string[])];
  if (path.culmination_journey_id) allIds.push(path.culmination_journey_id);
  const { data: unordered } = await supabase
    .from("journeys")
    .select("id, name, subtitle, description, share_token, theme, recording_id, creator_name, photography_credit")
    .in("id", allIds);

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
    <div
      className="min-h-dvh w-full overflow-y-auto"
      style={{ backgroundColor: "#000", color: "#fff" }}
    >
      {/* Top bar — back link only in the in-app context. Shared landings
          (anonymous visitors AND signed-in users opening the share link
          directly) render without it so the page feels like a standalone
          album landing. */}
      <div className="mx-auto max-w-2xl px-6 pt-6 flex items-center justify-between">
        {isInAppContext ? (
          <Link
            href="/play"
            prefetch
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors"
            style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}
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
          <div
            style={{
              fontSize: "0.68rem",
              fontFamily: "var(--font-geist-mono)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              marginBottom: "0.75rem",
            }}
          >
            a path · by {creator}
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 300,
              fontStyle: "italic",
              fontSize: "clamp(2.4rem, 7vw, 4rem)",
              letterSpacing: "0.02em",
              lineHeight: 1.05,
              background: `linear-gradient(180deg, #fff 0%, ${glow} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: `0 0 60px ${accent}30`,
              marginBottom: "1rem",
            }}
          >
            {path.name}
          </h1>
          {path.subtitle && (
            <div
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.85rem",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.04em",
                marginBottom: "1.25rem",
              }}
            >
              {path.subtitle}
            </div>
          )}
          {path.description && (
            <p
              className="mx-auto"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.95rem",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.7,
                maxWidth: "34rem",
              }}
            >
              {path.description}
            </p>
          )}
          <div
            className="mt-5"
            style={{
              fontSize: "0.72rem",
              fontFamily: "var(--font-geist-mono)",
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.05em",
            }}
          >
            Music by {creator}
          </div>
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

        <div
          className="mt-14 text-center"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.68rem",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          built with resonance
        </div>
      </div>
    </div>
  );
}
