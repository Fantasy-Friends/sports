"use client";

import { useCallback, useEffect, useState } from "react";

// A personal, per-pool draft queue of golfer names. Stored in localStorage —
// it's a private planning tool, not shared state — keyed by pool so each
// tournament has its own queue.
export function useDraftQueue(poolId: string) {
  const storageKey = `draft-queue:${poolId}`;
  const [queue, setQueue] = useState<string[]>([]);

  // Load on pool change.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setQueue(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
    } catch {
      setQueue([]);
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setQueue(next);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
    },
    [storageKey],
  );

  const add = useCallback((golfer: string) => {
    setQueue((cur) => {
      if (cur.includes(golfer)) return cur;
      const next = [...cur, golfer];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  const remove = useCallback((golfer: string) => {
    setQueue((cur) => {
      const next = cur.filter((g) => g !== golfer);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  const toggle = useCallback((golfer: string) => {
    setQueue((cur) => {
      const next = cur.includes(golfer) ? cur.filter((g) => g !== golfer) : [...cur, golfer];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  // Move item from index `from` to index `to` (queue reorder).
  const move = useCallback((from: number, to: number) => {
    setQueue((cur) => {
      if (from === to || from < 0 || from >= cur.length || to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  // Drop golfers no longer in the pool of `keep` names (e.g. already drafted).
  const prune = useCallback((keep: Set<string>) => {
    setQueue((cur) => {
      const next = cur.filter((g) => keep.has(g));
      if (next.length === cur.length) return cur;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return { queue, setQueue: persist, add, remove, toggle, move, prune };
}
