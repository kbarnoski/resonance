"use client";

import { useDreamVotes } from "./votes-provider";

/** Read-only love indicator. Public visitors do NOT see Karel's
 *  taste — hearts are private to the admin. Component kept as a
 *  no-op so existing render sites don't have to change; if Karel
 *  ever wants to surface his favorites publicly we flip the
 *  isAdmin gate. */
export function VoteIndicator(_: { slug: string }) {
  void _;
  return null;
}

/** Admin-only love toggle. Click the heart to love this prototype;
 *  click again to clear. Hidden for non-admins (the underlying API
 *  is also server-gated). */
export function VoteButtons({
  slug,
  compact = false,
  stopPropagation = false,
}: {
  slug: string;
  compact?: boolean;
  stopPropagation?: boolean;
}) {
  const { votes, isAdmin, setVote } = useDreamVotes();
  if (!isAdmin) return null;

  const loved = (votes[slug] ?? 0) === 1;
  const size = compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm";

  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    void setVote(slug, loved ? 0 : 1);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={loved ? "Remove love" : "Love this"}
      title={loved ? "Remove love" : "Love this"}
      className={`${size} flex items-center justify-center rounded-full border transition-colors ${
        loved
          ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
          : "border-white/10 bg-white/5 text-white/40 hover:border-rose-400/30 hover:text-rose-300"
      }`}
    >
      ♥
    </button>
  );
}
