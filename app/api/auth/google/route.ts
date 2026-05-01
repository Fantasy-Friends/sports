import crypto from "crypto";
import { NextResponse } from "next/server";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing env vars", GOOGLE_CLIENT_ID: !!clientId, GOOGLE_REDIRECT_URI: !!redirectUri },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || "/";

  const stateNonce = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: `${stateNonce}:${encodeURIComponent(returnTo)}`,
    prompt: "select_account",
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, stateNonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
