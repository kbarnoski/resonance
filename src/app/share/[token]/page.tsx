import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Gauge, Clock, Guitar, ArrowRight } from "lucide-react";
import Link from "next/link";

// Use a plain Supabase client with the anon key (no cookies needed for public access)
function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();
  const { data: recording } = await supabase
    .from("recordings")
    .select("title, description")
    .eq("share_token", token)
    .single();

  if (!recording) {
    return { title: "Recording Not Found" };
  }

  return {
    title: recording.title,
    description: recording.description || "Shared recording on Resonance",
  };
}

export default async function SharedRecordingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();

  const { data: recording } = await supabase
    .from("recordings")
    .select("*, analyses(*)")
    .eq("share_token", token)
    .single();

  if (!recording) notFound();

  const analysis =
    recording.analyses && recording.analyses.length > 0
      ? recording.analyses[0]
      : null;

  const audioUrl = `/api/audio/${recording.id}`;

  const uniqueChords = analysis?.chords
    ? [...new Set((analysis.chords as { chord: string }[]).map((c) => c.chord))]
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <header className="mb-12">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
            Shared Recording
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {recording.title}
          </h1>
          {recording.description && (
            <p className="mt-2 text-muted-foreground">
              {recording.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {new Date(recording.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {recording.duration && (
              <span>{formatDuration(recording.duration)}</span>
            )}
          </div>
        </header>

        {/* Audio Player */}
        <section className="mb-12">
          <audio
            controls
            preload="metadata"
            src={audioUrl}
            className="w-full"
            aria-label={`Playback controls for ${recording.title}`}
            style={{ colorScheme: "dark light" }}
          >
            <track kind="captions" />
          </audio>
        </section>

        {/* Analysis Summary */}
        {analysis && analysis.status === "completed" && (
          <section className="space-y-6">
            <div className="border-t pt-8">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                Analysis
              </h2>
            </div>

            {/* Key / Tempo / Time Signature */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Music className="h-4 w-4" />
                    Key
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {analysis.key_signature ?? "Unknown"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Gauge className="h-4 w-4" />
                    Tempo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {analysis.tempo ? `~${analysis.tempo} BPM` : "Unknown"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Time Signature
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {analysis.time_signature ?? "Unknown"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chords */}
            {uniqueChords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Guitar className="h-4 w-4" />
                    Chords
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {uniqueChords.map((chord) => (
                      <Badge key={chord} variant="outline" className="text-sm">
                        {chord}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Summary */}
            {analysis.summary &&
              typeof analysis.summary === "object" &&
              (analysis.summary as { overview?: string }).overview && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">
                      {(analysis.summary as { overview: string }).overview}
                    </p>
                  </CardContent>
                </Card>
              )}
          </section>
        )}

        {/* CTA */}
        <footer className="mt-16 border-t pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Listen on Resonance
            <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
