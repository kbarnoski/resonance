"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type VoteMap = Record<string, number>;

interface VotesCtx {
  votes: VoteMap;
  isAdmin: boolean;
  loading: boolean;
  /** Set vote in { -1, 0, 1 }. Optimistic; reverts on server error. */
  setVote: (slug: string, vote: number) => Promise<void>;
}

const Ctx = createContext<VotesCtx | null>(null);

/** Wraps the dream-lab routes so every card/nav can share one fetch of
 *  votes + admin status. Hydrates client-side after mount; the rest of
 *  the page (server-rendered) renders immediately without waiting. */
export function DreamVotesProvider({ children }: { children: ReactNode }) {
  const [votes, setVotes] = useState<VoteMap>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, me] = await Promise.all([
          fetch("/api/dream/votes")
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})),
          fetch("/api/dream/me")
            .then((r) => (r.ok ? r.json() : { isAdmin: false }))
            .catch(() => ({ isAdmin: false })),
        ]);
        if (cancelled) return;
        setVotes(v);
        setIsAdmin(!!me.isAdmin);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setVote = useCallback(
    async (slug: string, vote: number) => {
      const prev = votes[slug] ?? 0;
      // Optimistic update
      setVotes((v) => ({ ...v, [slug]: vote }));
      try {
        const res = await fetch("/api/dream/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, vote }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Revert
        setVotes((v) => ({ ...v, [slug]: prev }));
        console.error("[dream/vote] failed", err);
      }
    },
    [votes]
  );

  return (
    <Ctx.Provider value={{ votes, isAdmin, loading, setVote }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDreamVotes(): VotesCtx {
  const c = useContext(Ctx);
  if (!c) {
    // Safe fallback if used outside the provider (shouldn't happen, but
    // we don't want a render crash if the layout changes).
    return {
      votes: {},
      isAdmin: false,
      loading: false,
      setVote: async () => {},
    };
  }
  return c;
}
