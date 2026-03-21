"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Music } from "lucide-react";
import { toast } from "sonner";
import { REALMS } from "@/lib/journeys/realms";
import { createClient } from "@/lib/supabase/client";
import type { Journey } from "@/lib/journeys/types";

interface CreateJourneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId?: string;
  onCreated?: (journey: Journey) => void;
}

export function CreateJourneyDialog({
  open,
  onOpenChange,
  recordingId,
  onCreated,
}: CreateJourneyDialogProps) {
  const [storyText, setStoryText] = useState("");
  const [realmId, setRealmId] = useState("heaven");
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [recordings, setRecordings] = useState<{ id: string; title: string }[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(recordingId ?? null);

  // Fetch recordings when dialog opens
  useEffect(() => {
    if (!open) return;
    const fetchRecordings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title")
          .order("created_at", { ascending: false });
        if (!error && data) {
          setRecordings(data);
        }
      } catch {}
    };
    fetchRecordings();
  }, [open]);

  // Cycle status text while creating
  useEffect(() => {
    if (!creating) {
      setStatusText("");
      return;
    }
    const messages = [
      "Reading your story...",
      "Choosing visual themes...",
      "Composing phases...",
      "Building the journey...",
      "Almost there...",
    ];
    let i = 0;
    setStatusText(messages[0]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      setStatusText(messages[i]);
    }, 8000);
    return () => clearInterval(interval);
  }, [creating]);

  const handleCreate = async () => {
    if (!storyText.trim()) return;

    setCreating(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/journeys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyText: storyText.trim(),
          realmId,
          recordingId: selectedRecordingId || recordingId,
        }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create journey");
      }

      toast.success(`Journey "${data.journey.name}" created`);
      onOpenChange(false);
      setStoryText("");
      const fullJourney: Journey = {
        ...data.journey,
        id: data.dbRecord.id,
        storyText: storyText.trim(),
        recordingId: selectedRecordingId || recordingId || null,
      };
      onCreated?.(fullJourney);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setCreating(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (creating && abortRef.current) {
      abortRef.current.abort();
    }
    setCreating(false);
    onOpenChange(false);
  };

  if (!open) return null;

  const selectedRealm = REALMS.find((r) => r.id === realmId);
  const accent = selectedRealm?.palette.accent ?? "#888";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] transition-opacity duration-300"
        style={{
          backdropFilter: "blur(32px) saturate(1.2)",
          WebkitBackdropFilter: "blur(32px) saturate(1.2)",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
        }}
        onClick={handleCancel}
      />

      {/* Content */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-white/90 text-xl tracking-tight"
                style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 200 }}
              >
                Create a Journey
              </h2>
              <p
                className="text-white/30 mt-1"
                style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
              >
                Describe a story, memory, or intention
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Story input */}
          <div className="mb-5">
            <label
              className="block text-white/40 mb-2"
              style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
            >
              Your story
            </label>
            <textarea
              placeholder="A walk through autumn woods at dusk, leaves turning to gold..."
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              rows={3}
              disabled={creating}
              className="w-full rounded-xl px-4 py-3 text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
              style={{
                fontSize: "0.9rem",
                fontFamily: "var(--font-geist-sans)",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* Realm picker */}
          <div className="mb-6">
            <label
              className="block text-white/40 mb-2"
              style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
            >
              Visual realm
            </label>
            <div
              className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1"
            >
              {REALMS.map((realm) => (
                <button
                  key={realm.id}
                  type="button"
                  onClick={() => !creating && setRealmId(realm.id)}
                  disabled={creating}
                  className={`rounded-lg px-3 py-2 text-left transition-all ${
                    realmId === realm.id
                      ? "text-white/90"
                      : "text-white/40 hover:text-white/60 hover:bg-white/3"
                  }`}
                  style={{
                    backgroundColor: realmId === realm.id
                      ? `${realm.palette.accent}18`
                      : "transparent",
                    border: realmId === realm.id
                      ? `1px solid ${realm.palette.accent}40`
                      : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-geist-sans)",
                      fontWeight: realmId === realm.id ? 400 : 300,
                    }}
                  >
                    {realm.name}
                  </div>
                  <div
                    className="truncate"
                    style={{
                      fontSize: "0.6rem",
                      fontFamily: "var(--font-geist-mono)",
                      color: "rgba(255,255,255,0.25)",
                    }}
                  >
                    {realm.subtitle}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Song picker */}
          {recordings.length > 0 && (
            <div className="mb-6">
              <label
                className="block text-white/40 mb-2"
                style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
              >
                <Music className="inline h-3 w-3 mr-1 -mt-0.5" />
                Song
              </label>
              <div className="max-h-32 overflow-y-auto scrollbar-thin pr-1 space-y-1">
                <button
                  type="button"
                  onClick={() => !creating && setSelectedRecordingId(null)}
                  disabled={creating}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-all ${
                    selectedRecordingId === null ? "text-white/90" : "text-white/40 hover:text-white/60 hover:bg-white/3"
                  }`}
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-geist-sans)",
                    fontWeight: selectedRecordingId === null ? 400 : 300,
                    backgroundColor: selectedRecordingId === null ? `${accent}18` : "transparent",
                    border: selectedRecordingId === null ? `1px solid ${accent}40` : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  None (use any track)
                </button>
                {recordings.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => !creating && setSelectedRecordingId(rec.id)}
                    disabled={creating}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-all truncate ${
                      selectedRecordingId === rec.id ? "text-white/90" : "text-white/40 hover:text-white/60 hover:bg-white/3"
                    }`}
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-geist-sans)",
                      fontWeight: selectedRecordingId === rec.id ? 400 : 300,
                      backgroundColor: selectedRecordingId === rec.id ? `${accent}18` : "transparent",
                      border: selectedRecordingId === rec.id ? `1px solid ${accent}40` : "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {rec.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={creating || !storyText.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white/80 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              fontSize: "0.85rem",
              fontFamily: "var(--font-geist-mono)",
              backgroundColor: creating ? `${accent}15` : `${accent}20`,
              border: `1px solid ${accent}${creating ? "20" : "40"}`,
            }}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{statusText}</span>
              </>
            ) : (
              "Create Journey"
            )}
          </button>

          {creating && (
            <button
              onClick={handleCancel}
              className="w-full mt-2 px-4 py-2 text-white/30 hover:text-white/50 transition-colors"
              style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
