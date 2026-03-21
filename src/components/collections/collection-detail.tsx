"use client";

import { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { GripVertical, FileAudio, Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Recording {
  id: string;
  title: string;
  duration: number | null;
  created_at: string;
  position: number;
}

interface AvailableRecording {
  id: string;
  title: string;
  duration: number | null;
  created_at: string;
}

function SortableRecording({
  recording,
  onRemove,
}: {
  recording: Recording;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: recording.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardContent className="flex items-center gap-3 py-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Link
            href={`/recording/${recording.id}`}
            className="flex flex-1 items-center gap-3 min-w-0"
          >
            <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-light text-sm">{recording.title}</span>
            {recording.duration && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Clock className="h-3 w-3" />
                {Math.floor(recording.duration / 60)}:{Math.floor(recording.duration % 60).toString().padStart(2, "0")}
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(recording.id)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function CollectionDetail({
  collectionId,
  initialName,
  initialDescription,
  initialRecordings,
  availableRecordings: initialAvailable = [],
}: {
  collectionId: string;
  initialName: string;
  initialDescription: string;
  initialRecordings: Recording[];
  availableRecordings?: AvailableRecording[];
}) {
  const [recordings, setRecordings] = useState(initialRecordings);
  const [available, setAvailable] = useState(initialAvailable);
  const [showPicker, setShowPicker] = useState(false);
  const [name, setName] = useState(initialName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  async function saveName() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === name) {
      setEditName(name);
      setIsEditingName(false);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("collections")
      .update({ name: trimmed })
      .eq("id", collectionId);
    if (error) {
      toast.error("Failed to rename collection");
      setEditName(name);
    } else {
      setName(trimmed);
      toast.success("Collection renamed");
    }
    setIsEditingName(false);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = recordings.findIndex((r) => r.id === active.id);
    const newIndex = recordings.findIndex((r) => r.id === over.id);

    const newOrder = arrayMove(recordings, oldIndex, newIndex);
    setRecordings(newOrder);

    const supabase = createClient();
    for (let i = 0; i < newOrder.length; i++) {
      await supabase
        .from("collection_recordings")
        .update({ position: i })
        .eq("collection_id", collectionId)
        .eq("recording_id", newOrder[i].id);
    }
  }

  async function addRecording(rec: AvailableRecording) {
    const supabase = createClient();
    const position = recordings.length;

    const { error } = await supabase.from("collection_recordings").insert({
      collection_id: collectionId,
      recording_id: rec.id,
      position,
    });

    if (error) {
      toast.error("Failed to add recording");
      return;
    }

    setRecordings((prev) => [
      ...prev,
      { ...rec, position },
    ]);
    setAvailable((prev) => prev.filter((r) => r.id !== rec.id));
    toast.success(`Added "${rec.title}"`);
  }

  async function removeRecording(recordingId: string) {
    const supabase = createClient();

    const { error } = await supabase
      .from("collection_recordings")
      .delete()
      .eq("collection_id", collectionId)
      .eq("recording_id", recordingId);

    if (error) {
      toast.error("Failed to remove recording");
      return;
    }

    const removed = recordings.find((r) => r.id === recordingId);
    setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    if (removed) {
      setAvailable((prev) => [
        ...prev,
        { id: removed.id, title: removed.title, duration: removed.duration, created_at: removed.created_at },
      ]);
    }
    toast.success("Recording removed from collection");
  }

  return (
    <div className="space-y-4">
      <div>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              ref={nameInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setEditName(name);
                  setIsEditingName(false);
                }
              }}
              onBlur={saveName}
              className="text-2xl font-extralight h-auto py-1 px-2"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setEditName(name);
              setIsEditingName(true);
            }}
            className="group flex items-center gap-2 text-left"
          >
            <h1 className="text-2xl font-extralight">{name}</h1>
            <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        {initialDescription && (
          <p className="text-muted-foreground mt-1">{initialDescription}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPicker(!showPicker)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Recording
        </Button>
      </div>

      {showPicker && (
        <Card>
          <CardContent className="py-3">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                All recordings are already in this collection.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {available.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => addRecording(rec)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{rec.title}</span>
                    <Plus className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {recordings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.08] py-12 text-center">
          <p className="text-muted-foreground">
            No recordings in this collection yet. Click &ldquo;Add Recording&rdquo; above.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={recordings.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {recordings.map((rec) => (
                <SortableRecording
                  key={rec.id}
                  recording={rec}
                  onRemove={removeRecording}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
