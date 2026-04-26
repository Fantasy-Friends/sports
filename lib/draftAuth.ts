import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const DRAFT_SESSION_COOKIE = "draft_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type EntrantIdentity = {
  entrant_id: string;
  pool_id: string;
  entrant_name: string;
  entrant_slug: string;
  draft_position: number | null;
  is_admin: boolean;
  auto_draft_enabled: boolean | null;
  welcomed_at: string | null;
};

type SessionRow = {
  session_id: string;
  pool_id: string;
  entrant_id: string;
  expires_at: string;
};

type EntrantRow = EntrantIdentity;

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function generateAccessCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

async function loadEntrantById(entrantId: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_entrants")
    .select(
      "entrant_id, pool_id, entrant_name, entrant_slug, draft_position, is_admin, auto_draft_enabled, welcomed_at",
    )
    .eq("entrant_id", entrantId)
    .maybeSingle<EntrantRow>();

  if (error) throw new Error(error.message);
  return data;
}

export async function createDraftSession(poolId: string, entrantId: string) {
  const token = generateOpaqueToken();
  const sessionTokenHash = hashSecret(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from("draft_sessions").insert({
    pool_id: poolId,
    entrant_id: entrantId,
    session_token_hash: sessionTokenHash,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);

  return {
    token,
    expiresAt,
  };
}

export async function deleteDraftSession(token: string) {
  const sessionTokenHash = hashSecret(token);
  await supabaseAdmin
    .from("draft_sessions")
    .delete()
    .eq("session_token_hash", sessionTokenHash);
}

export async function getAuthenticatedEntrant(poolId?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(DRAFT_SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionTokenHash = hashSecret(token);

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("draft_sessions")
    .select("session_id, pool_id, entrant_id, expires_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle<SessionRow>();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const expiresAt = new Date(session.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await supabaseAdmin.from("draft_sessions").delete().eq("session_id", session.session_id);
    return null;
  }

  if (poolId && session.pool_id !== poolId) {
    return null;
  }

  const entrant = await loadEntrantById(session.entrant_id);
  if (!entrant) {
    // Entrant was deleted out from under this session (admin removed the row,
    // pool was reseeded, etc.). Clean up the session so the cookie stops
    // pointing at nothing and the user gets a normal signed-out experience.
    await supabaseAdmin
      .from("draft_sessions")
      .delete()
      .eq("session_id", session.session_id);
    return null;
  }

  await supabaseAdmin
    .from("draft_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", session.session_id);

  return {
    sessionId: session.session_id,
    entrant,
  };
}

export async function getEntrantBySlug(poolId: string, entrantSlug: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_entrants")
    .select(
      "entrant_id, pool_id, entrant_name, entrant_slug, draft_position, is_admin, auto_draft_enabled, welcomed_at, access_code_hash",
    )
    .eq("pool_id", poolId)
    .eq("entrant_slug", entrantSlug)
    .maybeSingle<EntrantRow & { access_code_hash: string }>();

  if (error) throw new Error(error.message);
  return data;
}
