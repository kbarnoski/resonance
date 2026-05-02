import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Compass } from "lucide-react";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { getRealm } from "@/lib/journeys/realms";

export const dynamic = "force-dynamic";

interface CustomJourneyRow {
  id: string;
  name: string | null;
  subtitle: string | null;
  description: string | null;
  recording_id: string | null;
  share_token: string | null;
}

export default async function JourneysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/journeys");

  const { data: customRows } = await supabase
    .from("journeys")
    .select("id, name, subtitle, description, recording_id, share_token")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const customJourneys: CustomJourneyRow[] = (customRows ?? []) as CustomJourneyRow[];

  return (
    <div className="px-6 py-8 md:px-12 md:py-12">
      <div className="mb-10">
        <h1
          className="text-2xl md:text-3xl text-white/90 mb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          Journeys
        </h1>
        <p className="text-white/40 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
          Guided audiovisual experiences. Pick one to play.
        </p>
      </div>

      {/* Built-in journeys grid */}
      <section className="mb-12">
        <h2
          className="text-white/30 text-xs uppercase tracking-[0.12em] mb-4"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          Featured
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {JOURNEYS.map((journey) => {
            const realm = getRealm(journey.realmId);
            const accent = realm?.palette.accent ?? "#c4b5fd";
            const glow = realm?.palette.glow ?? accent;
            return (
              <Link
                key={journey.id}
                href={`/play?journey=${journey.id}&from=journeys`}
                prefetch
                className="group relative flex flex-col rounded-xl p-5 transition-all cursor-pointer overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Accent bar — top edge picks up the realm palette */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${accent} 30%, ${glow} 70%, transparent)`,
                    opacity: 0.7,
                  }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <span
                    aria-hidden
                    className="rounded-full"
                    style={{
                      width: "8px",
                      height: "8px",
                      background: accent,
                      boxShadow: `0 0 8px ${glow}66`,
                    }}
                  />
                  <span
                    className="text-white/85 text-base"
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontWeight: 300,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {journey.name}
                  </span>
                </div>
                {journey.subtitle && (
                  <span
                    className="text-white/40 text-xs italic mb-2"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                  >
                    {journey.subtitle}
                  </span>
                )}
                {journey.description && (
                  <p
                    className="text-white/50 text-sm leading-relaxed line-clamp-3"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    {journey.description}
                  </p>
                )}
                {realm && (
                  <span
                    className="text-white/30 text-xs mt-3"
                    style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                  >
                    {realm.name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Custom journeys */}
      {customJourneys.length > 0 && (
        <section>
          <h2
            className="text-white/30 text-xs uppercase tracking-[0.12em] mb-4"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            Yours
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customJourneys.map((j) => (
              <Link
                key={j.id}
                href={`/play?customJourneyId=${j.id}&from=journeys`}
                prefetch
                className="group flex flex-col rounded-xl p-5 transition-all cursor-pointer"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Compass
                    className="h-3.5 w-3.5"
                    style={{ color: "rgba(196, 181, 253, 0.85)" }}
                  />
                  <span
                    className="text-white/85 text-base"
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontWeight: 300,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {j.name ?? "Untitled Journey"}
                  </span>
                </div>
                {j.subtitle && (
                  <span
                    className="text-white/40 text-xs italic mb-2"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                  >
                    {j.subtitle}
                  </span>
                )}
                {j.description && (
                  <p
                    className="text-white/50 text-sm leading-relaxed line-clamp-3"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    {j.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty state for custom journeys, only when there are none */}
      {customJourneys.length === 0 && (
        <p
          className="text-white/30 text-xs mt-2"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          You haven&apos;t made any custom journeys yet — head to{" "}
          <Link href="/create" className="underline decoration-white/20 hover:decoration-white/60">
            Create
          </Link>{" "}
          to design your own.
        </p>
      )}
    </div>
  );
}
