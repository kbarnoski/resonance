"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Music, Image as ImageIcon, Upload, ChevronDown, ChevronRight, Sparkles, ArrowLeft } from "lucide-react";
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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getMp4CreationDate } from "@/lib/audio/mp4-creation-date";
import { detectAudioCodec } from "@/lib/audio/detect-codec";
import type { Journey, JourneyPhase } from "@/lib/journeys/types";

interface CreateJourneyFormProps {
  recordingId?: string;
  /** When provided, the form opens in edit mode: skips the describe step,
   *  pre-populates the refine UI with this journey, and saves via PATCH. */
  initialJourney?: (Journey & { id: string });
  /** "create" (default) or "edit". When "edit", initialJourney is required. */
  mode?: "create" | "edit";
  onCreated?: (journey: Journey) => void;
  onUpdated?: (journey: Journey) => void;
  onDeleted?: (id: string) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

type Step = "describe" | "refine";

export function CreateJourneyForm({
  recordingId,
  initialJourney,
  mode = "create",
  onCreated,
  onUpdated,
  onDeleted,
  onCancel,
  cancelLabel = "Cancel",
}: CreateJourneyFormProps) {
  const isEdit = mode === "edit" && !!initialJourney;
  const [step, setStep] = useState<Step>(isEdit ? "refine" : "describe");
  const [journeyName, setJourneyName] = useState(isEdit ? initialJourney!.name : "");
  const [storyText, setStoryText] = useState(isEdit ? (initialJourney!.storyText ?? "") : "");
  const [audioReactive, setAudioReactive] = useState(isEdit ? !!initialJourney!.audioReactive : false);
  // viz-only toggle: false here = pure shaders, no AI imagery generation.
  const [aiEnabled, setAiEnabled] = useState(isEdit ? initialJourney!.aiEnabled !== false : true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [recordings, setRecordings] = useState<{ id: string; title: string }[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(
    isEdit ? (initialJourney!.recordingId ?? null) : (recordingId ?? null)
  );
  const [localImageFiles, setLocalImageFiles] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[] | null>(
    isEdit && initialJourney!.localImageUrls ? initialJourney!.localImageUrls : null
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioArtist, setAudioArtist] = useState("");
  const [audioTitle, setAudioTitle] = useState("");

  // Draft: the journey the user is refining (AI-generated on create, the
  // existing row on edit).
  const [draft, setDraft] = useState<Journey | null>(isEdit ? initialJourney! : null);
  // Resolved recording id from any track upload — captured at generate time
  // and re-used on save so we don't re-upload on refine→save.
  const [resolvedRecordingId, setResolvedRecordingId] = useState<string | null>(null);
  // Which phase cards are expanded in the refine step.
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("recordings")
          .select("id, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (!error && data) {
          setRecordings(data);
        }
      } catch {}
    };
    fetchRecordings();
  }, []);

  useEffect(() => {
    if (!generating) {
      setStatusText("");
      return;
    }
    const messages = [
      "Reading your description...",
      "Imagining the visual world...",
      "Choosing shaders & palette...",
      "Composing phases...",
      "Building the draft...",
      "Almost there...",
    ];
    let i = 0;
    setStatusText(messages[0]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      setStatusText(messages[i]);
    }, 8000);
    return () => clearInterval(interval);
  }, [generating]);

  // Step 1: upload any new track + photos, then call /api/journeys/draft
  // and display the result for refinement. Does NOT persist the journey.
  const handleGenerateDraft = async () => {
    if (!storyText.trim()) return;
    if (audioFile && !audioArtist.trim()) {
      toast.error("Artist name is required for uploaded tracks");
      return;
    }

    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      let effectiveRecordingId: string | null = selectedRecordingId || recordingId || null;
      if (audioFile) {
        setStatusText("Uploading track...");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const fileName = `${user.id}/${Date.now()}-${audioFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(fileName, audioFile, {
            contentType: audioFile.type || "audio/mp4",
            upsert: false,
          });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

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
            audio.src = URL.createObjectURL(audioFile);
          });
        } catch {}

        const trackTitle = audioTitle.trim() || audioFile.name.replace(/\.[^/.]+$/, "");
        const mp4Date = await getMp4CreationDate(audioFile);
        const recordedAt = mp4Date
          ? mp4Date.toISOString()
          : audioFile.lastModified
            ? new Date(audioFile.lastModified).toISOString()
            : null;
        const audioCodec = await detectAudioCodec(audioFile);

        const { data: insertedRow, error: dbError } = await supabase
          .from("recordings")
          .insert({
            user_id: user.id,
            title: trackTitle,
            file_name: fileName,
            audio_url: fileName,
            duration,
            file_size: audioFile.size,
            recorded_at: recordedAt,
            audio_codec: audioCodec,
            artist: audioArtist.trim(),
          })
          .select("id")
          .single();
        if (dbError || !insertedRow) {
          throw new Error(`Couldn't save recording: ${dbError?.message ?? "unknown error"}`);
        }
        effectiveRecordingId = insertedRow.id;
      }
      setResolvedRecordingId(effectiveRecordingId);

      let finalImageUrls: string[] | null = uploadedImageUrls;
      if (localImageFiles.length > 0 && !finalImageUrls) {
        setStatusText(`Uploading ${localImageFiles.length} photo${localImageFiles.length === 1 ? "" : "s"}...`);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const urls: string[] = [];
        for (const file of localImageFiles) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("journey-images")
            .upload(path, file, {
              contentType: file.type || "image/jpeg",
              upsert: false,
            });
          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
          const { data: publicData } = supabase.storage
            .from("journey-images")
            .getPublicUrl(path);
          urls.push(publicData.publicUrl);
        }
        finalImageUrls = urls;
        setUploadedImageUrls(urls);
      }

      setStatusText("Generating draft...");
      const res = await fetch("/api/journeys/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyText: storyText.trim(),
          recordingId: effectiveRecordingId,
        }),
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft");

      setDraft(data.journey as Journey);
      setStep("refine");
      setExpandedPhases(new Set([0]));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  // Step 2: commit the (possibly edited) draft to the DB. Branches on
  // mode — create POSTs to /create, edit PATCHes /[id] with the
  // whitelisted updatable fields.
  const handleSaveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    abortRef.current = new AbortController();
    try {
      const payloadDraft: Journey = {
        ...draft,
        name: journeyName.trim() || draft.name,
      };

      if (isEdit && initialJourney) {
        // Edit path — PATCH the editable subset.
        const res = await fetch(`/api/journeys/${initialJourney.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payloadDraft.name,
            subtitle: payloadDraft.subtitle,
            description: payloadDraft.description,
            phases: payloadDraft.phases,
            realm_id: payloadDraft.realmId,
            theme: payloadDraft.theme ?? null,
            audio_reactive: audioReactive,
            ai_enabled: aiEnabled,
            recording_id: selectedRecordingId,
          }),
          signal: abortRef.current.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update journey");
        toast.success(`Journey "${payloadDraft.name}" updated`);
        const updated: Journey = {
          ...payloadDraft,
          id: initialJourney.id,
          aiEnabled,
          audioReactive,
          recordingId: selectedRecordingId,
          userId: initialJourney.userId,
        };
        onUpdated?.(updated);
        return;
      }

      // Create path.
      const res = await fetch("/api/journeys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: payloadDraft,
          recordingId: resolvedRecordingId,
          storyText: storyText.trim(),
          audioReactive,
          aiEnabled,
          localImageUrls: uploadedImageUrls ?? undefined,
          name: payloadDraft.name,
        }),
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save journey");

      toast.success(`Journey "${data.journey.name}" created`);
      const fullJourney: Journey = {
        ...data.journey,
        id: data.dbRecord.id,
        aiEnabled,
        storyText: storyText.trim(),
        recordingId: resolvedRecordingId,
        userId: data.dbRecord.user_id,
        audioReactive,
        ...(uploadedImageUrls && uploadedImageUrls.length > 0 ? { localImageUrls: uploadedImageUrls } : {}),
      };
      onCreated?.(fullJourney);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setSaving(false);
      abortRef.current = null;
    }
  };

  // Edit-mode delete. Confirmed via the in-app AlertDialog, then DELETE.
  // Caller handles routing away.
  const handleDelete = async () => {
    if (!isEdit || !initialJourney) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/journeys/${initialJourney.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Journey deleted");
      onDeleted?.(initialJourney.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleRegenerate = async () => {
    setDraft(null);
    await handleGenerateDraft();
  };

  const handleCancel = () => {
    if ((generating || saving) && abortRef.current) {
      abortRef.current.abort();
    }
    setGenerating(false);
    setSaving(false);
    onCancel?.();
  };

  const updateDraftField = <K extends keyof Journey>(key: K, value: Journey[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const updatePhaseField = <K extends keyof JourneyPhase>(
    phaseIdx: number,
    key: K,
    value: JourneyPhase[K],
  ) => {
    setDraft((d) => {
      if (!d) return d;
      const phases = [...d.phases];
      phases[phaseIdx] = { ...phases[phaseIdx], [key]: value };
      return { ...d, phases };
    });
  };

  const togglePhase = (idx: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const accent = "#8b5cf6";

  // ─────────── RENDER: REFINE STEP ───────────
  if (step === "refine" && draft) {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setStep("describe")}
          disabled={saving}
          className="flex items-center gap-1.5 text-white/40 hover:text-white/60 mb-4 transition-colors disabled:opacity-50"
          style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to description
        </button>

        <div
          className="mb-5 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{
            fontSize: "0.7rem",
            fontFamily: "var(--font-geist-mono)",
            backgroundColor: `${accent}12`,
            border: `1px solid ${accent}30`,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <Sparkles className="h-3 w-3" style={{ color: accent }} />
          Draft generated. Tune anything below, then save.
        </div>

        {/* Name */}
        <div className="mb-4">
          <label
            className="block text-white/40 mb-1.5"
            style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Name
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => updateDraftField("name", e.target.value)}
            disabled={saving}
            className="w-full rounded-lg px-3 py-2 text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
            style={{
              fontSize: "0.85rem",
              fontFamily: "var(--font-geist-sans)",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        </div>

        {/* Subtitle */}
        <div className="mb-4">
          <label
            className="block text-white/40 mb-1.5"
            style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Subtitle
          </label>
          <input
            type="text"
            value={draft.subtitle}
            onChange={(e) => updateDraftField("subtitle", e.target.value)}
            disabled={saving}
            className="w-full rounded-lg px-3 py-2 text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
            style={{
              fontSize: "0.85rem",
              fontFamily: "var(--font-geist-sans)",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        </div>

        {/* Description */}
        <div className="mb-5">
          <label
            className="block text-white/40 mb-1.5"
            style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Description
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => updateDraftField("description", e.target.value)}
            rows={3}
            disabled={saving}
            className="w-full rounded-lg px-3 py-2 text-white/80 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
            style={{
              fontSize: "0.85rem",
              fontFamily: "var(--font-geist-sans)",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Phases */}
        <div className="mb-5">
          <div
            className="text-white/40 mb-2"
            style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Phases
          </div>
          <div className="space-y-1.5">
            {draft.phases.map((phase, idx) => {
              const isOpen = expandedPhases.has(idx);
              return (
                <div
                  key={phase.id ?? idx}
                  className="rounded-lg"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => togglePhase(idx)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors rounded-lg"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 text-white/40 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-white/40 flex-shrink-0" />
                    )}
                    <span
                      className="text-white/60 flex-shrink-0"
                      style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}
                    >
                      {idx + 1}. {phase.id}
                    </span>
                    <span
                      className="text-white/30 truncate"
                      style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-sans)" }}
                    >
                      · {phase.aiPrompt}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3">
                      <div>
                        <label
                          className="block text-white/40 mb-1"
                          style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
                        >
                          Visual prompt
                        </label>
                        <textarea
                          value={phase.aiPrompt ?? ""}
                          onChange={(e) => updatePhaseField(idx, "aiPrompt", e.target.value)}
                          rows={2}
                          disabled={saving}
                          className="w-full rounded-md px-2.5 py-1.5 text-white/80 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
                          style={{
                            fontSize: "0.8rem",
                            fontFamily: "var(--font-geist-sans)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            lineHeight: 1.5,
                          }}
                        />
                      </div>
                      <div>
                        <label
                          className="block text-white/40 mb-1"
                          style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
                        >
                          Mood
                        </label>
                        <input
                          type="text"
                          value={phase.poetryMood ?? ""}
                          onChange={(e) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            updatePhaseField(idx, "poetryMood", e.target.value as any);
                          }}
                          disabled={saving}
                          className="w-full rounded-md px-2.5 py-1.5 text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
                          style={{
                            fontSize: "0.8rem",
                            fontFamily: "var(--font-geist-sans)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          className="block text-white/40 mb-1"
                          style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
                        >
                          Guidance phrases (one per line)
                        </label>
                        <textarea
                          value={(phase.guidancePhrases ?? []).join("\n")}
                          onChange={(e) =>
                            updatePhaseField(
                              idx,
                              "guidancePhrases",
                              e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                            )
                          }
                          rows={3}
                          disabled={saving}
                          className="w-full rounded-md px-2.5 py-1.5 text-white/80 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
                          style={{
                            fontSize: "0.8rem",
                            fontFamily: "var(--font-geist-sans)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            lineHeight: 1.5,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* AI imagery toggle — turn off for shader/viz-only journeys.
            Saves API spend and keeps the experience purely audio-reactive. */}
        <button
          type="button"
          onClick={() => !saving && setAiEnabled(!aiEnabled)}
          disabled={saving}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-2 transition-colors disabled:opacity-50"
          style={{
            backgroundColor: aiEnabled ? `${accent}18` : "rgba(255,255,255,0.04)",
            border: aiEnabled ? `1px solid ${accent}40` : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: aiEnabled ? accent : "rgba(255,255,255,0.15)" }}
          />
          <div className="flex-1 text-left">
            <div className="text-white/85" style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-sans)" }}>
              {aiEnabled ? "AI imagery on" : "Viz only — no AI imagery"}
            </div>
            <div className="text-white/40" style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)" }}>
              {aiEnabled
                ? "Shaders + AI-generated phase imagery."
                : "Shaders only. No image generation, no API spend."}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white/90 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            fontSize: "0.85rem",
            fontFamily: "var(--font-geist-mono)",
            backgroundColor: saving ? `${accent}15` : `${accent}25`,
            border: `1px solid ${accent}${saving ? "20" : "50"}`,
          }}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isEdit ? (
            "Save Changes"
          ) : (
            "Save Journey"
          )}
        </button>

        {!isEdit && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={saving || generating}
            className="w-full mt-2 px-4 py-2 text-white/40 hover:text-white/60 transition-colors disabled:opacity-40"
            style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
          >
            {generating ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Regenerating...
              </span>
            ) : (
              "Regenerate draft"
            )}
          </button>
        )}

        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={saving || deleting}
                className="w-full mt-2 px-4 py-2 text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40"
                style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
              >
                {deleting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Deleting…
                  </span>
                ) : (
                  "Delete journey"
                )}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{initialJourney!.name}”?</AlertDialogTitle>
                <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={handleCancel}
            className="w-full mt-1 px-4 py-2 text-white/25 hover:text-white/40 transition-colors"
            style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
          >
            {cancelLabel}
          </button>
        )}
      </div>
    );
  }

  // ─────────── RENDER: DESCRIBE STEP ───────────
  return (
    <div className="w-full">
      {/* Journey name */}
      <div className="mb-5">
        <label
          htmlFor="journey-name"
          className="block text-white/40 mb-2"
          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          Name
        </label>
        <input
          id="journey-name"
          type="text"
          name="journeyName"
          autoComplete="off"
          placeholder="Leave blank to auto-generate"
          value={journeyName}
          onChange={(e) => setJourneyName(e.target.value)}
          disabled={generating}
          className="w-full rounded-xl px-4 py-2.5 text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
          style={{
            fontSize: "0.9rem",
            fontFamily: "var(--font-geist-sans)",
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
      </div>

      {/* Describe your journey */}
      <div className="mb-5">
        <label
          htmlFor="journey-story"
          className="block text-white/40 mb-2"
          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          Describe your journey
        </label>
        <textarea
          id="journey-story"
          name="storyText"
          autoComplete="off"
          placeholder="A walk through autumn woods at dusk, leaves turning to gold..."
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          disabled={generating}
          className="w-full rounded-xl px-4 py-3 text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
          style={{
            fontSize: "0.9rem",
            fontFamily: "var(--font-geist-sans)",
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            lineHeight: 1.6,
          }}
        />
        <p className="mt-2 text-white/30" style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}>
          A sentence or two — we&apos;ll draft the phases, palette, and visual prompts for you to tune.
        </p>
      </div>

      {/* Song picker */}
      {recordings.length > 0 && (
        <div className="mb-6">
          <span
            className="block text-white/40 mb-2"
            style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            <Music className="inline h-3 w-3 mr-1 -mt-0.5" />
            Song
          </span>
          <div className="max-h-32 overflow-y-auto scrollbar-thin pr-1 space-y-1">
            <button
              type="button"
              onClick={() => !generating && setSelectedRecordingId(null)}
              disabled={generating}
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
                onClick={() => !generating && setSelectedRecordingId(rec.id)}
                disabled={generating}
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

      {/* Upload a new track */}
      <div className="mb-5">
        <label
          htmlFor="journey-audio-file"
          className="block text-white/40 mb-2"
          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          <Upload className="inline h-3 w-3 mr-1 -mt-0.5" />
          Or upload a new track
        </label>
        <input
          id="journey-audio-file"
          name="journeyAudioFile"
          aria-label="Upload audio track"
          type="file"
          accept="audio/*,.m4a,.mp3,.wav,.flac"
          disabled={generating}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setAudioFile(file);
            if (file) {
              setSelectedRecordingId(null);
              if (!audioTitle) setAudioTitle(file.name.replace(/\.[^/.]+$/, ""));
            }
          }}
          className="w-full text-xs text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white/80 hover:file:bg-white/15 file:cursor-pointer disabled:opacity-50"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        />
        {audioFile && (
          <div className="mt-3 space-y-2">
            <input
              id="journey-audio-title"
              type="text"
              name="audioTitle"
              aria-label="Track title"
              autoComplete="off"
              placeholder="Track title"
              value={audioTitle}
              onChange={(e) => setAudioTitle(e.target.value)}
              disabled={generating}
              className="w-full rounded-lg px-3 py-2 text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
              style={{
                fontSize: "0.8rem",
                fontFamily: "var(--font-geist-sans)",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <input
              id="journey-audio-artist"
              type="text"
              name="audioArtist"
              aria-label="Artist name"
              autoComplete="off"
              placeholder="Artist (required)"
              value={audioArtist}
              onChange={(e) => setAudioArtist(e.target.value)}
              disabled={generating}
              className="w-full rounded-lg px-3 py-2 text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors disabled:opacity-50"
              style={{
                fontSize: "0.8rem",
                fontFamily: "var(--font-geist-sans)",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: `1px solid ${audioArtist.trim() ? "rgba(255,255,255,0.08)" : `${accent}40`}`,
              }}
            />
            <p className="text-white/40" style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}>
              {audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(1)} MB — uploaded with the journey
            </p>
          </div>
        )}
      </div>

      {/* Your own photos */}
      <div className="mb-5">
        <label
          htmlFor="journey-image-files"
          className="block text-white/40 mb-2"
          style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          <ImageIcon className="inline h-3 w-3 mr-1 -mt-0.5" />
          Your own photos (optional)
        </label>
        <input
          id="journey-image-files"
          name="journeyImageFiles"
          aria-label="Upload photos"
          type="file"
          accept="image/*"
          multiple
          disabled={generating}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            setLocalImageFiles(files);
            setUploadedImageUrls(null);
          }}
          className="w-full text-xs text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white/80 hover:file:bg-white/15 file:cursor-pointer disabled:opacity-50"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        />
        {localImageFiles.length > 0 && (
          <p className="mt-2 text-white/40" style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}>
            {localImageFiles.length} photo{localImageFiles.length === 1 ? "" : "s"} selected — playback will cycle these instead of generating AI imagery
          </p>
        )}
      </div>

      {/* Audio reactive toggle */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => !generating && setAudioReactive(!audioReactive)}
          disabled={generating}
          className="flex items-center gap-3 w-full rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
          style={{
            backgroundColor: audioReactive ? `${accent}18` : "rgba(255,255,255,0.04)",
            border: audioReactive ? `1px solid ${accent}40` : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="w-8 h-4 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: audioReactive ? accent : "rgba(255,255,255,0.15)" }}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: audioReactive ? "translateX(16px)" : "translateX(2px)" }}
            />
          </div>
          <div className="text-left">
            <span
              className="block text-white/70"
              style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-sans)" }}
            >
              React to music
            </span>
            <span
              className="block text-white/30"
              style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}
            >
              Shaders respond to audio frequencies
            </span>
          </div>
        </button>
      </div>

      {/* Generate draft button */}
      <button
        type="button"
        onClick={handleGenerateDraft}
        disabled={generating || !storyText.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white/80 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          fontSize: "0.85rem",
          fontFamily: "var(--font-geist-mono)",
          backgroundColor: generating ? `${accent}15` : `${accent}20`,
          border: `1px solid ${accent}${generating ? "20" : "40"}`,
        }}
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{statusText}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate draft
          </>
        )}
      </button>

      {(onCancel || generating) && (
        <button
          type="button"
          onClick={handleCancel}
          className="w-full mt-2 px-4 py-2 text-white/30 hover:text-white/50 transition-colors"
          style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
        >
          {generating ? "Cancel" : cancelLabel}
        </button>
      )}
    </div>
  );
}
