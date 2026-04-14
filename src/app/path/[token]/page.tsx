import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();

  const { data: path, error: pathErr } = await supabase
    .from("journey_paths")
    .select("*")
    .eq("share_token", token)
    .single();

  if (pathErr || !path) {
    notFound();
  }

  // Fetch journeys in the order stored in journey_ids
  const { data: unordered } = await supabase
    .from("journeys")
    .select("id, name, subtitle, description, share_token, theme, recording_id, creator_name, photography_credit")
    .in("id", path.journey_ids as string[]);

  const journeyMap = new Map<string, JourneyRow>();
  for (const j of (unordered ?? []) as JourneyRow[]) journeyMap.set(j.id, j);
  const journeys = (path.journey_ids as string[])
    .map((id: string) => journeyMap.get(id))
    .filter((j: JourneyRow | undefined): j is JourneyRow => !!j);

  const accent = path.accent_color ?? "#d0a070";
  const glow = path.glow_color ?? "#e0b080";
  const creator = journeys[0]?.creator_name ?? "Karel Barnoski";

  return (
    <div
      className="min-h-dvh w-full overflow-y-auto"
      style={{ backgroundColor: "#000", color: "#fff" }}
    >
      <div className="mx-auto max-w-2xl px-6 pt-16 pb-24 sm:pt-24">
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
        </div>

        {/* Track list */}
        <div className="space-y-2">
          {journeys.map((j, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            const href = j.share_token ? `/journey/${j.share_token}` : "#";
            return (
              <Link
                key={j.id}
                href={href}
                className="group block rounded-xl px-5 py-4 transition-all hover:bg-white/[0.04]"
                style={{
                  border: "1px solid rgba(255,255,255,0.07)",
                  backgroundColor: "rgba(255,255,255,0.015)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 pt-0.5"
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.7rem",
                      letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.35)",
                      minWidth: "1.75rem",
                    }}
                  >
                    {num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="transition-colors group-hover:text-white"
                      style={{
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        fontStyle: "italic",
                        fontSize: "1.35rem",
                        color: "rgba(255,255,255,0.9)",
                        lineHeight: 1.3,
                      }}
                    >
                      {j.name}
                    </div>
                    {j.subtitle && (
                      <div
                        className="mt-0.5"
                        style={{
                          fontFamily: "var(--font-geist-mono)",
                          fontSize: "0.7rem",
                          color: "rgba(255,255,255,0.4)",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {j.subtitle}
                      </div>
                    )}
                    {j.description && (
                      <p
                        className="mt-2"
                        style={{
                          fontFamily: "var(--font-geist-sans)",
                          fontSize: "0.8rem",
                          color: "rgba(255,255,255,0.55)",
                          lineHeight: 1.55,
                        }}
                      >
                        {j.description}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex-shrink-0 self-center transition-opacity opacity-40 group-hover:opacity-100"
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: accent,
                    }}
                  >
                    Play →
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

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
