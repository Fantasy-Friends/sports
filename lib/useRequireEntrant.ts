"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

type GuardedEntrant = { is_admin: boolean } | null;

/**
 * Redirect client-side to /sign-in when a page's session check finishes and
 * there's no entrant, or to / when an admin-only page is loaded by a
 * non-admin. Call after the page's existing session fetch settles.
 */
export function useRequireEntrant({
  ready,
  entrant,
  requireAdmin = false,
}: {
  ready: boolean;
  entrant: GuardedEntrant;
  requireAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!entrant) {
      router.replace(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
      return;
    }
    if (requireAdmin && !entrant.is_admin) {
      router.replace("/");
    }
  }, [ready, entrant, requireAdmin, router, pathname]);
}
