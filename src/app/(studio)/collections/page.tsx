import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { CreateCollectionDialog } from "@/components/collections/create-collection-dialog";

export default async function CollectionsPage() {
  const supabase = await createClient();

  const { data: collections } = await supabase
    .from("collections")
    .select("*, collection_recordings(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extralight">Collections</h1>
          <p className="text-muted-foreground">
            Organize recordings into themed collections
          </p>
        </div>
        <CreateCollectionDialog />
      </div>

      {collections && collections.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <Link key={collection.id} href={`/collections/${collection.id}`}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{collection.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {collection.description || "No description"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {collection.collection_recordings?.[0]?.count ?? 0} recordings
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] py-16">
          <FolderOpen className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">No collections yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Create a collection to organize your recordings
          </p>
          <CreateCollectionDialog />
        </div>
      )}
    </div>
  );
}
