"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Flag, Plus, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
  type: "note" | "cue";
}

interface MarkersPanelProps {
  recordingId: string;
  currentTime: number;
  duration?: number;
  onSeek: (time: number) => void;
  onMarkersChange?: (markers: Marker[]) => void;
  embedded?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MarkersPanel({
  recordingId,
  currentTime,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  duration,
  onSeek,
  onMarkersChange,
  embedded,
}: MarkersPanelProps) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const updateParent = useCallback(
    (updated: Marker[]) => {
      setMarkers(updated);
      onMarkersChange?.(updated);
    },
    [onMarkersChange]
  );

  useEffect(() => {
    async function loadMarkers() {
      const supabase = createClient();
      const { data } = await supabase
        .from("markers")
        .select("id, time, label, color, type")
        .eq("recording_id", recordingId)
        .order("time");
      if (data) {
        updateParent(data.map((m: Record<string, unknown>) => ({ ...m, type: m.type ?? "note" })) as Marker[]);
      }
    }
    loadMarkers();
  }, [recordingId, updateParent]);

  const [addingType, setAddingType] = useState<"note" | "cue">("note");

  async function addMarker() {
    const label = newLabel.trim();
    if (!label) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("markers")
      .insert({
        recording_id: recordingId,
        user_id: user.id,
        time: currentTime,
        label,
        color: addingType === "cue" ? "#f59e0b" : "#primary",
        type: addingType,
      })
      .select("id, time, label, color, type")
      .single();

    if (error) {
      toast.error("Failed to add marker");
      return;
    }

    const markerData = { ...data, type: data.type ?? "note" } as Marker;
    const updated = [...markers, markerData].sort((a, b) => a.time - b.time);
    updateParent(updated);
    setNewLabel("");
    setIsAdding(false);
    setAddingType("note");
    toast.success(addingType === "cue" ? "Cue marker added" : "Marker added");
  }

  async function deleteMarker(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("markers")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete marker");
      return;
    }

    const updated = markers.filter((m) => m.id !== id);
    updateParent(updated);
  }

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Flag className="h-4 w-4" />
        Markers ({markers.length})
      </div>
      {!isAdding && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAddingType("note"); setIsAdding(true); }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add at {formatTime(currentTime)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAddingType("cue"); setIsAdding(true); }}
            className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
          >
            <Zap className="mr-1 h-3.5 w-3.5" />
            Add Cue
          </Button>
        </div>
      )}
    </div>
  );

  const body = (
    <div className="space-y-2">
      {isAdding && (
        <div className="flex items-center gap-2 rounded-lg border p-2">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {formatTime(currentTime)}
          </span>
          {addingType === "cue" && <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={addingType === "cue" ? "Cue label (e.g. bass hit)..." : "Note for this moment..."}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") addMarker();
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewLabel("");
                setAddingType("note");
              }
            }}
          />
          <Button size="sm" onClick={addMarker} disabled={!newLabel.trim()}>
            Add
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setIsAdding(false);
              setNewLabel("");
              setAddingType("note");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {markers.length === 0 && !isAdding ? (
        <p className="text-sm text-muted-foreground text-center py-3">
          No markers yet. Pause at a moment and click &ldquo;Add&rdquo; to leave a note.
        </p>
      ) : (
        <div className="space-y-1">
          {markers.map((marker) => (
            <div
              key={marker.id}
              role="button"
              tabIndex={0}
              onClick={() => onSeek(marker.time)}
              onKeyDown={(e) => { if (e.key === "Enter") onSeek(marker.time); }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left group cursor-pointer"
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0 w-10">
                {formatTime(marker.time)}
              </span>
              {marker.type === "cue" ? (
                <Zap className="h-3 w-3 shrink-0 text-amber-500" />
              ) : (
                <Flag className="h-3 w-3 shrink-0 text-primary" />
              )}
              <span className="flex-1 truncate">{marker.label}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMarker(marker.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        {header}
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Flag className="h-4 w-4" />
            Markers ({markers.length})
          </CardTitle>
          {!isAdding && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddingType("note"); setIsAdding(true); }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add at {formatTime(currentTime)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddingType("cue"); setIsAdding(true); }}
                className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
              >
                <Zap className="mr-1 h-3.5 w-3.5" />
                Add Cue
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
