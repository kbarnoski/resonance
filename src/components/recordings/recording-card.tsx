"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileAudio, Clock, Trash2, Music, Activity } from "lucide-react";
import { toast } from "sonner";

interface RecordingCardProps {
  id: string;
  title: string;
  duration: number | null;
  createdAt: string;
  recordedAt?: string | null;
  fileName: string;
  description?: string | null;
  hasAnalysis?: boolean;
  tags?: { id: string; name: string }[];
  keySignature?: string | null;
  tempo?: number | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecordingCard({
  id,
  title,
  duration,
  createdAt,
  recordedAt,
  fileName,
  description,
  hasAnalysis,
  tags,
  keySignature,
  tempo,
}: RecordingCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();

    const { error: storageError } = await supabase.storage
      .from("recordings")
      .remove([fileName]);

    if (storageError) {
      toast.error(`Failed to delete file: ${storageError.message}`);
      setDeleting(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("recordings")
      .delete()
      .eq("id", id);

    if (dbError) {
      toast.error(`Failed to delete recording: ${dbError.message}`);
      setDeleting(false);
      return;
    }

    toast.success("Recording deleted");
    router.refresh();
  }

  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Link href={`/recording/${id}`} className="block">
      <Card
        className="transition-all duration-200 hover:bg-white/[0.03] cursor-pointer"
      >
        <CardContent className="flex items-center gap-2.5 sm:gap-4 px-3 sm:px-6 py-4">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
            <FileAudio className="h-4 w-4 sm:h-5 sm:w-5 text-white/40" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-light">{title}</p>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{recordedAt ? `Recorded ${formatDate(recordedAt)}` : formatDate(createdAt)}</span>
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(duration)}
                </span>
              )}
              {keySignature && (
                <span className="flex items-center gap-1">
                  <Music className="h-3 w-3" />
                  {keySignature}
                </span>
              )}
              {tempo && (
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {Math.round(tempo)} bpm
                </span>
              )}
            </div>
            {/* Tags */}
            {tags && tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full border border-white/[0.08] px-2 py-0 text-[10px] font-medium text-white/30"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {hasAnalysis && (
            <>
              {/* Full badge — sm+ only */}
              <span className="shrink-0 hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 font-mono text-[0.65rem] text-white/40">
                Analyzed
              </span>
              {/* Dot indicator — mobile only */}
              <span className="shrink-0 sm:hidden h-2 w-2 rounded-full bg-white/20" />
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
      </Link>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete recording?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete &ldquo;{title}&rdquo; and remove its analysis, markers, and chat history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
