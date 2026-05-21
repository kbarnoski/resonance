"use client";

import { useDreamVotes } from "./votes-provider";

/** Read-only heart/downvote indicator. Renders for everyone. Shows a
 *  filled red heart if Karel loved this prototype, a faded thumbs-down
 *  if downvoted, nothing if unvoted. Public visitors can see Karel's
 *  taste signal without being able to change it. */
export function VoteIndicator({ slug }: { slug: string }) {
  const { votes } = useDreamVotes();
  const v = votes[slug] ?? 0;
  if (v === 1) {
    return (
      <span title="Karel loved this" className="text-rose-400/95 text-sm">
        ♥
      </span>
    );
  }
  if (v === -1) {
    return (
      <span title="Karel downvoted this" className="text-white/30 text-sm">
        ▾
      </span>
    );
  }
  return null;
}

/** Admin-only vote controls. Heart + downvote buttons; click cycles
 *  the vote off if you click the same one again. Hidden for
 *  non-admins (the underlying API is also server-gated). */
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

  const v = votes[slug] ?? 0;
  const size = compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm";

  const onClick = (target: number, e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    void setVote(slug, v === target ? 0 : target);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => onClick(1, e)}
        aria-label={v === 1 ? "Remove favorite" : "Mark as favorite"}
        title={v === 1 ? "Remove favorite" : "Mark as favorite"}
        className={`${size} flex items-center justify-center rounded-full border transition-colors ${
          v === 1
            ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
            : "border-white/10 bg-white/5 text-white/40 hover:border-rose-400/30 hover:text-rose-300"
        }`}
      >
        ♥
      </button>
      <button
        type="button"
        onClick={(e) => onClick(-1, e)}
        aria-label={v === -1 ? "Remove downvote" : "Downvote"}
        title={v === -1 ? "Remove downvote" : "Downvote"}
        className={`${size} flex items-center justify-center rounded-full border transition-colors ${
          v === -1
            ? "border-white/30 bg-white/10 text-white/70"
            : "border-white/10 bg-white/5 text-white/40 hover:border-white/30 hover:text-white/70"
        }`}
      >
        ▾
      </button>
    </span>
  );
}
