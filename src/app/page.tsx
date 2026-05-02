"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Library, Compass } from "lucide-react";

const PREF_KEY = "resonance-last-experience";

export default function Home() {
  const router = useRouter();
  const [showChooser, setShowChooser] = useState(false);

  useEffect(() => {
    const pref = localStorage.getItem(PREF_KEY);
    if (pref) {
      router.replace("/journeys");
    } else {
      setShowChooser(true);
    }
  }, [router]);

  if (!showChooser) return null;

  function handleChoose(target: "studio" | "journeys") {
    localStorage.setItem(PREF_KEY, "chosen");
    router.push(target === "studio" ? "/library" : "/journeys");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6">
      <div className="mb-12 flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-8 w-8 text-white/80"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21" strokeLinecap="round" />
          <path d="M12 7C14.5 7 16.5 5.5 16.5 3.5" strokeLinecap="round" />
          <path d="M12 12C9 12 6.5 10 6.5 7.5" strokeLinecap="round" />
          <path d="M12 17C15 17 17.5 15 17.5 12.5" strokeLinecap="round" />
        </svg>
        <span
          className="text-xl font-semibold tracking-tight text-white/90"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          Resonance
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <button
          onClick={() => handleChoose("studio")}
          className="group flex w-72 flex-col items-start rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
        >
          <Library className="mb-4 h-5 w-5 text-white/50 transition-colors group-hover:text-white/70" />
          <h2
            className="mb-1.5 text-lg font-medium text-white/90"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            Studio
          </h2>
          <p
            className="text-sm leading-relaxed text-white/40"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            Analyze, study, and understand your music
          </p>
        </button>

        <button
          onClick={() => handleChoose("journeys")}
          className="group flex w-72 flex-col items-start rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
        >
          <Compass className="mb-4 h-5 w-5 text-white/50 transition-colors group-hover:text-white/70" />
          <h2
            className="mb-1.5 text-lg font-medium text-white/90"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            Journeys
          </h2>
          <p
            className="text-sm leading-relaxed text-white/40"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            Guided audiovisual experiences
          </p>
        </button>
      </div>

      <p
        className="mt-16 text-xs text-white/20"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        Resonance — a personal audio workspace
      </p>
    </div>
  );
}
