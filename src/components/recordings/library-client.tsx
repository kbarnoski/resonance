"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RecordingCard } from "@/components/recordings/recording-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Library, Search, X } from "lucide-react";

interface Recording {
  id: string;
  title: string;
  duration: number | null;
  createdAt: string;
  recordedAt?: string | null;
  fileName: string;
  description?: string | null;
  hasAnalysis: boolean;
  keySignature?: string | null;
  tempo?: number | null;
  tags: { id: string; name: string }[];
}

interface Tag {
  id: string;
  name: string;
}

interface LibraryClientProps {
  recordings: Recording[];
  allTags: Tag[];
}

export function LibraryClient({ recordings, allTags }: LibraryClientProps) {
  const [search, setSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedTagIds(new Set());
  };

  // Derive which tags are actually used by recordings
  const usedTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rec of recordings) {
      for (const tag of rec.tags) {
        ids.add(tag.id);
      }
    }
    return ids;
  }, [recordings]);

  const visibleTags = useMemo(
    () => allTags.filter((t) => usedTagIds.has(t.id)),
    [allTags, usedTagIds]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return recordings.filter((rec) => {
      // Search filter
      if (q) {
        const matchesTitle = rec.title.toLowerCase().includes(q);
        const matchesDesc = rec.description?.toLowerCase().includes(q) ?? false;
        if (!matchesTitle && !matchesDesc) return false;
      }
      // Tag filter (AND logic: recording must have ALL selected tags)
      if (selectedTagIds.size > 0) {
        const recTagIds = new Set(rec.tags.map((t) => t.id));
        for (const tagId of selectedTagIds) {
          if (!recTagIds.has(tagId)) return false;
        }
      }
      return true;
    });
  }, [recordings, search, selectedTagIds]);

  const hasActiveFilters = search.length > 0 || selectedTagIds.size > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight">Library</h1>
          <p className="text-muted-foreground">
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/upload">
          <Button>Upload</Button>
        </Link>
      </div>

      {/* Search and filters */}
      {recordings.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search recordings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tag filters */}
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => {
                const active = selectedTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-white/15 text-white/90 border-white/20"
                        : "bg-transparent text-white/40 border-white/[0.08] hover:bg-white/[0.05]"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {filtered.length > 0 ? (
        <div className="grid gap-3">
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
            </p>
          )}
          {filtered.map((rec) => (
            <RecordingCard
              key={rec.id}
              id={rec.id}
              title={rec.title}
              duration={rec.duration}
              createdAt={rec.createdAt}
              recordedAt={rec.recordedAt}
              fileName={rec.fileName}
              description={rec.description}
              hasAnalysis={rec.hasAnalysis}
              keySignature={rec.keySignature}
              tempo={rec.tempo}
              tags={rec.tags}
            />
          ))}
        </div>
      ) : recordings.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] py-16">
          <Search className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">No matches</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Try adjusting your search or filters
          </p>
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] py-16">
          <Library className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 text-lg font-medium">No recordings yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload your voice memos to get started
          </p>
          <Link href="/upload">
            <Button>Upload Recordings</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
