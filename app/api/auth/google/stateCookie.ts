// Shared constant for the Google OAuth state/nonce cookie.
//
// This lives outside route.ts because Next.js App Router route files may only
// export HTTP method handlers (GET, POST, …) and a few reserved config names —
// exporting anything else (like this constant) fails `next build`'s type check.
// Both the initiate (route.ts) and callback (callback/route.ts) handlers import
// it from here.
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
