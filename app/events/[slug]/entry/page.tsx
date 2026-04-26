import { notFound, redirect } from "next/navigation";
import BracketNbaForm from "@/components/events/BracketNbaForm";
import DerbySalaryCapForm from "@/components/events/DerbySalaryCapForm";
import { supabaseAdmin } from "@/lib/supabase";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import type { NbaBracketPayload } from "@/lib/events/bracketNba";
import type { DerbyEntryPayload } from "@/lib/events/horseDraft";

export const revalidate = 0;

type Props = {
  params: Promise<{ slug: string }>;
};

type BracketConfig = {
  east?: Array<{ seed: number; team: string }>;
  west?: Array<{ seed: number; team: string }>;
};

function isLocked(status: string, lockAt: string | null): boolean {
  if (status !== "open-entry" && status !== "scheduled") return true;
  if (!lockAt) return false;
  return new Date(lockAt).getTime() <= Date.now();
}

export default async function EventEntryPage({ params }: Props) {
  const { slug } = await params;
  const seasonId = await getCurrentSeasonId();
  if (!seasonId) notFound();
  const event = await getEventBySlug(slug, seasonId);
  if (!event) notFound();

  const session = await getAuthenticatedEntrant();
  if (!session) redirect(`/sign-in?returnTo=/events/${slug}/entry`);

  // Fetch my existing entry (canonical entrant_id is resolved server-side in the POST handler,
  // so here we look up by person_key for display).
  const { data: membership } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, draft_entrants!inner(person_key)")
    .eq("season_id", seasonId);

  type MembershipRow = {
    entrant_id: string;
    draft_entrants: { person_key: string | null } | { person_key: string | null }[] | null;
  };

  const { data: myEntrant } = await supabaseAdmin
    .from("draft_entrants")
    .select("person_key")
    .eq("entrant_id", session.entrant.entrant_id)
    .maybeSingle<{ person_key: string | null }>();

  let canonicalId = session.entrant.entrant_id;
  if (myEntrant?.person_key) {
    for (const row of (membership ?? []) as MembershipRow[]) {
      const related = Array.isArray(row.draft_entrants) ? row.draft_entrants[0] : row.draft_entrants;
      if (related?.person_key === myEntrant.person_key) {
        canonicalId = row.entrant_id;
        break;
      }
    }
  }

  const { data: existing } = await supabaseAdmin
    .from("event_entries")
    .select("payload, submitted_at")
    .eq("event_id", event.event_id)
    .eq("entrant_id", canonicalId)
    .maybeSingle<{ payload: unknown; submitted_at: string | null }>();

  const locked = isLocked(event.status, event.lock_at);

  const renderNbaBracket = event.event_type === "bracket-nba";
  const renderDerby = event.event_type === "horse-draft";
  const config = (event.config ?? {}) as BracketConfig;

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Entry</div>
        <h1 className="text-2xl font-semibold text-info">{event.name}</h1>
        {event.lock_at ? (
          <p className="text-xs text-muted">
            Entries lock {new Date(event.lock_at).toLocaleString()}
          </p>
        ) : null}
      </div>

      {renderNbaBracket ? (
        <BracketNbaForm
          slug={event.slug}
          config={{
            east: config.east ?? [],
            west: config.west ?? [],
          }}
          existing={(existing?.payload as NbaBracketPayload | undefined) ?? null}
          locked={locked}
        />
      ) : renderDerby ? (
        <DerbySalaryCapForm
          slug={event.slug}
          existing={(existing?.payload as DerbyEntryPayload | undefined) ?? null}
          locked={locked}
        />
      ) : (
        <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-6 text-sm text-muted">
          Entry UI for <code>{event.event_type}</code> not yet implemented.
        </div>
      )}
    </main>
  );
}
