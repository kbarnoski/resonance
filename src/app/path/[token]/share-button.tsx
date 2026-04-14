"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

export function PathShareButton({ token, pathName }: { token: string; pathName: string }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/path/${token}` : "";

  const handleShare = async () => {
    const text = `${pathName} — a path on Resonance`;
    const navigatorAny = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (navigatorAny?.share) {
      try {
        await navigatorAny.share({ title: pathName, text, url: shareUrl });
        return;
      } catch {
        // User canceled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 text-white/50 hover:text-white/90 transition-colors"
      style={{
        fontSize: "0.72rem",
        fontFamily: "var(--font-geist-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
      title="Copy share link"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "copied" : "share"}
    </button>
  );
}
