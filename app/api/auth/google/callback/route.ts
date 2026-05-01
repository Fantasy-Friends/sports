import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createDraftSession,
  DRAFT_SESSION_COOKIE,
  getEntrantByEmail,
} from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { GOOGLE_OAUTH_STATE_COOKIE } from "../route";

const GOOGLE_PENDING_EMAIL_COOKIE = "google_pending_email";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_denied", url.origin));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_callback", url.origin));
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedNonce = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const [incomingNonce, encodedReturnTo] = stateParam.split(":");
  const returnTo = encodedReturnTo ? decodeURIComponent(encodedReturnTo) : "/";

  if (!storedNonce || storedNonce !== incomingNonce) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_state", url.origin));
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Google token exchange failed:", body);
      return NextResponse.redirect(new URL("/sign-in?error=token_failed", url.origin));
    }

    const tokens = (await tokenRes.json()) as { access_token: string };

    // Get user info from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/sign-in?error=userinfo_failed", url.origin));
    }

    const user = (await userRes.json()) as { email?: string };
    const email = user.email;

    if (!email) {
      return NextResponse.redirect(new URL("/sign-in?error=no_email", url.origin));
    }

    // Look up pool member by email
    const entrant = await getEntrantByEmail(email);

    if (entrant) {
      // Known member — create session and go
      const session = await createDraftSession(entrant.pool_id, entrant.entrant_id);
      const dest = entrant.welcomed_at
        ? returnTo
        : `/link-account?returnTo=${encodeURIComponent(returnTo)}`;

      const response = NextResponse.redirect(new URL(dest, url.origin));
      response.cookies.set(DRAFT_SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(session.expiresAt),
      });
      response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
      return response;
    }

    // First-time login — store email in short-lived cookie and redirect to picker
    const response = NextResponse.redirect(
      new URL(`/link-account?returnTo=${encodeURIComponent(returnTo)}`, url.origin),
    );
    response.cookies.set(GOOGLE_PENDING_EMAIL_COOKIE, email, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15,
    });
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", getErrorMessage(err, "unknown"));
    return NextResponse.redirect(new URL("/sign-in?error=server_error", url.origin));
  }
}
