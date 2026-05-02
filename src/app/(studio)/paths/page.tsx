import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Disc3, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

interface PathRow {
  id: string;
  name: string | null;
  subtitle: string | null;
  description: string | null;
  journey_ids: string[] | null;
  share_token: string | null;
  accent_color: string | null;
}

export default async function PathsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/paths");

  const { data: pathRows } = await supabase
    .from("journey_paths")
    .select("id, name, subtitle, description, journey_ids, share_token, accent_color")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const paths: PathRow[] = (pathRows ?? []) as PathRow[];

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1
          className="text-2xl md:text-3xl text-white/90 mb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          Paths
        </h1>
        <p className="text-white/40 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
          Curated sequences of your journeys. Open one to play through, or share via link.
          Featured paths (Welcome Home etc.) and on-the-fly path collections live inside The Room.
        </p>
      </div>

      {paths.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-white/50 mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem" }}>
            You haven&apos;t made any paths yet.
          </p>
          <p className="text-white/30 text-xs mb-6" style={{ fontFamily: "var(--font-geist-mono)" }}>
            Stitch journeys together in The Room to build a path.
          </p>
          <Link
            href="/room"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white transition-colors cursor-pointer"
            style={{
              background: "rgba(139, 92, 246, 0.85)",
              fontSize: "0.82rem",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 0.85)";
            }}
          >
            <Disc3 className="h-4 w-4" />
            Open The Room
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paths.map((path) => (
            <Link
              key={path.id}
              href={path.share_token ? `/path/${path.share_token}?view=app` : "#"}
              className="group flex flex-col rounded-xl p-5 transition-all cursor-pointer"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles
                  className="h-3.5 w-3.5"
                  style={{ color: path.accent_color ?? "#c4b5fd" }}
                />
                <span
                  className="text-white/85 text-base"
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontWeight: 300,
                    letterSpacing: "0.02em",
                  }}
                >
                  {path.name ?? "Untitled Path"}
                </span>
              </div>
              {path.subtitle && (
                <span
                  className="text-white/40 text-xs italic mb-2"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                >
                  {path.subtitle}
                </span>
              )}
              {path.description && (
                <p
                  className="text-white/50 text-sm leading-relaxed mb-3"
                  style={{ fontFamily: "var(--font-geist-sans)" }}
                >
                  {path.description}
                </p>
              )}
              <span
                className="text-white/30 text-xs mt-auto"
                style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em" }}
              >
                {(path.journey_ids ?? []).length} journeys
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
