import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Disc3, Play, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

interface RecordingRow {
  id: string;
  title: string | null;
  artist: string | null;
  duration: number | null;
  created_at: string;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || !isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function VizesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/vizes");

  const { data: recordingRows } = await supabase
    .from("recordings")
    .select("id, title, artist, duration, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const recordings: RecordingRow[] = (recordingRows ?? []) as RecordingRow[];

  return (
    <div className="px-6 py-8 md:px-12 md:py-12">
      <div className="mb-10">
        <h1
          className="text-2xl md:text-3xl text-white/90 mb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          Vizes
        </h1>
        <p className="text-white/40 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
          Pick a track to visualize. Audio-reactive shaders, no narrative — pure listening.
        </p>
      </div>

      {recordings.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-white/50 mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.1rem" }}>
            No tracks yet.
          </p>
          <p className="text-white/30 text-xs mb-6" style={{ fontFamily: "var(--font-geist-mono)" }}>
            Upload music to start visualizing.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: "0.82rem",
            }}
          >
            <Upload className="h-4 w-4" />
            Upload Track
          </Link>
        </div>
      ) : (
        <ul className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          {recordings.map((rec, idx) => (
            <li key={rec.id} className={idx > 0 ? "border-t border-white/[0.05]" : ""}>
              <Link
                href={`/play?recording=${rec.id}&autoplay=1&from=vizes`}
                prefetch
                className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
              >
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Play className="h-3.5 w-3.5 text-white/60 group-hover:text-white/90 transition-colors" fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-white/85 truncate"
                    style={{
                      fontFamily: "var(--font-geist-sans)",
                      fontSize: "0.92rem",
                    }}
                  >
                    {rec.title || "Untitled"}
                  </div>
                  {rec.artist && (
                    <div
                      className="text-white/40 truncate"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        fontSize: "0.78rem",
                      }}
                    >
                      {rec.artist}
                    </div>
                  )}
                </div>
                <span
                  className="text-white/30 flex-shrink-0"
                  style={{
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.72rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtDuration(rec.duration)}
                </span>
                <Disc3 className="h-4 w-4 flex-shrink-0 text-white/20 group-hover:text-white/50 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
