import { NextRequest, NextResponse } from "next/server";

/**
 * ATProto OAuth client metadata endpoint.
 *
 * The OAuth server (the user's PDS / Bluesky) fetches this file during the
 * authorization flow to learn the app's name, redirect URIs, etc.
 */
export function GET(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? "";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  const baseUrl = process.env.NEXT_PUBLIC_ADMIN_URL || `${protocol}://${host}`;
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
