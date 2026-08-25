import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Disc3, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isOfflinePack, listPaths } from "@/lib/offline/pack";

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
  let paths: PathRow[];
  if (isOfflinePack()) {
    paths = listPaths() as PathRow[];
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?redirectTo=/paths");

    const { data: pathRows } = await supabase
      .from("journey_paths")
      .select("id, name, subtitle, description, journey_ids, share_token, accent_color")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    paths = (pathRows ?? []) as PathRow[];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extralight">Paths</h1>
        <p className="text-muted-foreground">
          Curated sequences of your journeys. Open one to play through, or share via link.
        </p>
      </div>

      {paths.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] py-16">
          <Sparkles className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">No paths yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Stitch journeys together in The Room to build a path
          </p>
          <Button asChild>
            <Link href="/room">
              <Disc3 className="h-4 w-4" />
              Open The Room
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <Link
              key={path.id}
              href={path.share_token ? `/path/${path.share_token}?view=app` : "#"}
            >
              <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Sparkles
                      className="h-4 w-4 shrink-0"
                      style={{ color: path.accent_color ?? "#c4b5fd" }}
                    />
                    {path.name ?? "Untitled Path"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {path.subtitle || path.description || "No description"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {(path.journey_ids ?? []).length} journeys
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
