"use client";

import { X } from "lucide-react";
import type { Journey } from "@/lib/journeys/types";
import { CreateJourneyForm } from "./create-journey-form";

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
  if (!open) return null;

  const handleClose = () => onOpenChange(false);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] transition-opacity duration-300"
        style={{
          backdropFilter: "blur(32px) saturate(1.2)",
          WebkitBackdropFilter: "blur(32px) saturate(1.2)",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
        }}
        onClick={handleClose}
      />

      {/* Content — scrollable column so Create button is always reachable */}
      <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-8 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg my-auto"
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
              onClick={handleClose}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <CreateJourneyForm
            recordingId={recordingId}
            onCreated={(journey) => {
              onOpenChange(false);
              onCreated?.(journey);
            }}
            onCancel={handleClose}
          />
        </div>
      </div>
    </>
  );
}
