import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isDraftWindowOpen } from "@/lib/draftOrder";

type DraftStateRow = {
  draft_open: boolean | null;
};

export async function getDraftOpenState(poolId: string) {
  const { data, error } = await supabaseAdmin
    .from("tournament_meta")
    .select("draft_open")
    .eq("pool_id", poolId)
    .order("tournament_slug", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = ((data ?? []) as DraftStateRow[])[0];
  return (row?.draft_open ?? false) && isDraftWindowOpen();
}
