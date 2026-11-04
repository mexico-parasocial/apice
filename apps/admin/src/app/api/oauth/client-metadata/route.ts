import { NextRequest, NextResponse } from "next/server";

/**
 * ATProto OAuth client metadata endpoint.
 *
 * The OAuth server (the user's PDS / Bluesky) fetches this file during the
 * authorization flow to learn the app's name, redirect URIs, etc.
 */
// Prerendered-at-build would bake the builder's internal host into the
// client_id; it must reflect the serving origin at request time.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? "";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  // ADMIN_BASE_URL (runtime, not NEXT_PUBLIC-inlined) wins so a container
  // can serve the correct origin regardless of proxy Host headers.
  const baseUrl =
    process.env.ADMIN_BASE_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    `${protocol}://${host}`;
  const clientId = `${baseUrl}/api/oauth/client-metadata`;

  return NextResponse.json({
    client_id: clientId,
    client_name: "Ápice Admin",
    client_uri: baseUrl,
    redirect_uris: [`${baseUrl}/oauth/callback`],
    scope: "atproto transition:generic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  });
}
