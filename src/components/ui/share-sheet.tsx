"use client";

import { useCallback, useEffect, useRef } from "react";
import { X, Copy, Mail, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  text?: string;
}

/** Twitter / X icon */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** WhatsApp icon */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Try the native Web Share API. Returns true if it was handled (shared or cancelled).
 * Returns false if native share isn't available.
 */
async function tryNativeShare(url: string, title: string, text?: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    await navigator.share({ title, text: text ?? title, url });
    return true;
  } catch {
    // User cancelled or error — either way, we handled it
    return true;
  }
}

const SHARE_OPTIONS = [
  {
    id: "copy" as const,
    label: "Copy Link",
    Icon: Copy,
  },
  {
    id: "email" as const,
    label: "Email",
    Icon: Mail,
  },
  {
    id: "x" as const,
    label: "X",
    CustomIcon: XIcon,
  },
  {
    id: "whatsapp" as const,
    label: "WhatsApp",
    CustomIcon: WhatsAppIcon,
  },
];

export function ShareSheet({ open, onClose, url, title, text }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const triedNativeRef = useRef(false);

  // When opened, try native share first. If unavailable, show fallback modal.
  useEffect(() => {
    if (!open) {
      setShowFallback(false);
      triedNativeRef.current = false;
      return;
    }
    if (triedNativeRef.current) return;
    triedNativeRef.current = true;
    setCopied(false);

    tryNativeShare(url, title, text).then((handled) => {
      if (handled) {
        onClose();
      } else {
        setShowFallback(true);
      }
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on escape
  useEffect(() => {
    if (!showFallback) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showFallback, onClose]);

  // Reset copied state after 2s
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!showFallback) return null;

  const handleOption = async (id: string) => {
    switch (id) {
      case "copy":
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Link copied");
        break;
      case "email": {
        const subject = encodeURIComponent(title);
        const body = encodeURIComponent(`${text ? text + "\n\n" : ""}${url}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
        break;
      }
      case "x": {
        const tweetText = encodeURIComponent(title);
        const encodedUrl = encodeURIComponent(url);
        window.open(`https://x.com/intent/tweet?text=${tweetText}&url=${encodedUrl}`, "_blank", "noopener");
        break;
      }
      case "whatsapp": {
        const waText = encodeURIComponent(`${title}\n${url}`);
        window.open(`https://wa.me/?text=${waText}`, "_blank", "noopener");
        break;
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70]"
        style={{
          backdropFilter: "blur(12px) saturate(1.1)",
          WebkitBackdropFilter: "blur(12px) saturate(1.1)",
          backgroundColor: "rgba(0, 0, 0, 0.6)",
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm mx-4 mb-4 sm:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-white/80 text-lg"
              style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 300 }}
            >
              Share
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* URL preview */}
          <div
            className="rounded-xl px-4 py-3 mb-4 truncate"
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-geist-mono)",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            {url}
          </div>

          {/* Share options */}
          <div className="grid grid-cols-4 gap-2">
            {SHARE_OPTIONS.map((option) => {
              const isCopied = option.id === "copy" && copied;
              const IconEl = isCopied ? Check : option.Icon;
              const CustomIconEl = option.CustomIcon;

              return (
                <button
                  key={option.id}
                  onClick={() => handleOption(option.id)}
                  className="flex flex-col items-center gap-2 py-3 px-2 rounded-xl text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                  style={{ border: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: isCopied
                        ? "rgba(74, 222, 128, 0.12)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {CustomIconEl ? (
                      <CustomIconEl className="h-[18px] w-[18px]" />
                    ) : IconEl ? (
                      <IconEl
                        className="h-[18px] w-[18px]"
                        style={isCopied ? { color: "rgba(74, 222, 128, 0.8)" } : undefined}
                      />
                    ) : null}
                  </div>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {isCopied ? "Copied" : option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
