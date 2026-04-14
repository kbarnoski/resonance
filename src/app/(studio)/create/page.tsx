"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateJourneyForm } from "@/components/journeys/create-journey-form";

function CreateJourneyPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const recordingId = params.get("recordingId") ?? undefined;

  return (
    <div className="mx-auto w-full max-w-xl pb-16">
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
        style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <h1
        className="text-white/90 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 200 }}
      >
        Create a Journey
      </h1>
      <p
        className="text-white/30 mt-1 mb-8"
        style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
      >
        Describe a story, memory, or intention
      </p>

      <CreateJourneyForm
        recordingId={recordingId}
        onCreated={() => {
          router.push("/room");
        }}
        onCancel={() => router.back()}
        cancelLabel="Back"
      />
    </div>
  );
}

export default function CreateJourneyPage() {
  return (
    <Suspense fallback={null}>
      <CreateJourneyPageInner />
    </Suspense>
  );
}
