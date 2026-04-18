"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Upload, X, FileAudio, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getMp4CreationDate } from "@/lib/audio/mp4-creation-date";
import { detectAudioCodec } from "@/lib/audio/detect-codec";

interface UploadingFile {
  file: File;
  description: string;
  artist: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const audioFiles = Array.from(newFiles).filter((f) =>
      f.type.startsWith("audio/") || f.name.endsWith(".m4a") || f.name.endsWith(".mp3") || f.name.endsWith(".wav")
    );
    if (audioFiles.length === 0) {
      toast.error("Please select audio files (M4A, MP3, WAV)");
      return;
    }
    setFiles((prev) => {
      const remaining = 100 - prev.length;
      if (remaining <= 0) {
        toast.error("Maximum 100 files per batch");
        return prev;
      }
      const toAdd = audioFiles.slice(0, remaining);
      if (toAdd.length < audioFiles.length) {
        toast.warning(`Added ${toAdd.length} of ${audioFiles.length} files (100 file limit)`);
      }
      return [
        ...prev,
        ...toAdd.map((file) => ({ file, description: "", artist: "", progress: 0, status: "pending" as const })),
      ];
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadAll() {
    const missingArtist = files.some((f) => f.status !== "done" && !f.artist.trim());
    if (missingArtist) {
      toast.error("Artist name is required for all recordings");
      return;
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) {
      toast.error(authError?.message ?? "Not logged in. Please sign in first.");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "done") continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading", progress: 10 } : f))
      );

      const file = files[i].file;
      const fileName = `${user.id}/${Date.now()}-${file.name}`;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, progress: 30 } : f))
      );

      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(fileName, file, {
          contentType: file.type || "audio/mp4",
          upsert: false,
        });

      if (uploadError) {
        const msg = uploadError.message.includes("maximum allowed size")
          ? `File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Increase the limit in Supabase Dashboard → Storage → Settings.`
          : `Storage: ${uploadError.message}`;
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: msg } : f
          )
        );
        failCount++;
        continue;
      }

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, progress: 70 } : f))
      );

      // Detect duration via HTML Audio element (lightweight, no full decode)
      let duration: number | null = null;
      try {
        duration = await new Promise<number | null>((resolve) => {
          const audio = new Audio();
          audio.preload = "metadata";
          audio.onloadedmetadata = () => {
            resolve(isFinite(audio.duration) ? audio.duration : null);
            URL.revokeObjectURL(audio.src);
          };
          audio.onerror = () => {
            resolve(null);
            URL.revokeObjectURL(audio.src);
          };
          audio.src = URL.createObjectURL(file);
        });
      } catch {
        // Duration detection failed, continue without it
      }

      const title = file.name.replace(/\.[^/.]+$/, "");

      // Try to read the actual creation date from MP4/M4A metadata
      const mp4Date = await getMp4CreationDate(file);
      const recordedAt = mp4Date
        ? mp4Date.toISOString()
        : file.lastModified
          ? new Date(file.lastModified).toISOString()
          : null;

      // Detect audio codec from file container
      const audioCodec = await detectAudioCodec(file);

      const { error: dbError } = await supabase.from("recordings").insert({
        user_id: user.id,
        title,
        file_name: fileName,
        audio_url: fileName, // stored path, we'll proxy via /api/audio/[id]
        duration,
        file_size: file.size,
        recorded_at: recordedAt,
        description: files[i].description || null,
        audio_codec: audioCodec,
        artist: files[i].artist.trim(),
      }).select("id").single();

      if (dbError) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: `Database: ${dbError.message} (code: ${dbError.code})` } : f
          )
        );
        failCount++;
        continue;
      }

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "done", progress: 100 } : f))
      );
      successCount++;
    }

    if (successCount > 0 && failCount === 0) {
      toast.success("Upload complete!");
      setTimeout(() => router.push("/library"), 1000);
    } else if (successCount > 0) {
      toast.warning(`${successCount} uploaded, ${failCount} failed`);
      setTimeout(() => router.push("/library"), 1500);
    } else {
      toast.error("Upload failed");
    }
  }

  const pendingCount = files.filter((f) => f.status !== "done").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extralight tracking-tight">Upload Recordings</h1>
        <p className="text-muted-foreground">
          Drag and drop your voice memos or click to browse
        </p>
      </div>

      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragging ? "border-white/30 bg-white/[0.03]" : "border-white/10"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="mb-2 text-lg font-light">Drop audio files here</p>
          <p className="mb-4 text-sm text-muted-foreground">
            M4A, MP3, WAV &middot; Up to 100 files &middot; 60 min max
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <Button variant="outline" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            Browse Files
          </Button>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-light">{files.length} file(s) selected</h2>
            <Button onClick={uploadAll} disabled={pendingCount === 0}>
              Upload {pendingCount > 0 ? `(${pendingCount})` : ""}
            </Button>
          </div>

          {files.map((f, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 py-3">
                <FileAudio className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{f.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  {f.status !== "done" && (
                    <>
                      <Input
                        name="artist"
                        autoComplete="off"
                        placeholder="Artist name (required)"
                        value={f.artist}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFiles((prev) =>
                            prev.map((file, idx) =>
                              idx === i ? { ...file, artist: value } : file
                            )
                          );
                        }}
                        className="mt-1 h-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                        required
                      />
                      <Input
                        name="description"
                        autoComplete="off"
                        placeholder="Add a description (optional)"
                        value={f.description}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFiles((prev) =>
                            prev.map((file, idx) =>
                              idx === i ? { ...file, description: value } : file
                            )
                          );
                        }}
                        className="mt-1 h-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </>
                  )}
                  {f.status === "uploading" && (
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                  {f.status === "error" && (
                    <p className="text-xs text-destructive">{f.error}</p>
                  )}
                </div>
                {f.status === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(i)}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
