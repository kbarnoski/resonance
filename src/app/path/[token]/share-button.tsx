"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { triggerNativeShare } from "@/components/ui/share-sheet";

export function PathShareButton({ token, pathName }: { token: string; pathName: string }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/path/${token}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShare = () => {
    const text = `${pathName} — a path on Resonance`;
    if (triggerNativeShare(shareUrl, pathName, text, () => void copyLink())) return;
    void copyLink();
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex min-h-11 items-center gap-1.5 px-3 -mx-3 -my-3 text-white/50 hover:text-white/90 transition-colors"
      style={{
        fontSize: "0.72rem",
        fontFamily: "var(--font-geist-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
      title="Copy share link"
      aria-label="Share this path"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "copied" : "share"}
    </button>
  );
}
