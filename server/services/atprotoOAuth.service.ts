import {
  NodeOAuthClient,
  requestLocalLock,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { buildAtprotoLoopbackClientMetadata } from "@atproto/oauth-types";
import type { OAuthClientMetadataInput } from "@atproto/oauth-client";
import { redis } from "../utils/redis";

/**
 * Server-side ATProto OAuth client.
 *
 * One Bluesky consent screen gives Ápice both:
 *   - verified learner identity (DID/handle), and
 *   - repo-write permission used to publish app.civic.progress credentials
 *     into the learner's own PDS.
 *
 * Two client configurations:
 *   - production: discoverable client whose metadata is served publicly at
 *     GET /api/v1/auth/atproto/client-metadata.json (required by the spec).
 *   - development: loopback client (http://localhost client_id) so the iOS
 *     simulator can complete the flow without a public URL.
 */

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

const sessionKey = (did: string) => `atpo:sess:${did}`;
const stateKey = (state: string) => `atpo:state:${state}`;

function apiPublicUrl(): string {
  // Public base URL of THIS server, no trailing slash, e.g.
  // https://api.apice.example.com
  const url = process.env.API_PUBLIC_URL || "http://127.0.0.1:8000";
  return url.replace(/\/$/, "");
}

export function isLoopbackMode(): boolean {
  return (
    process.env.ATPROTO_OAUTH_LOOPBACK === "true" ||
    apiPublicUrl().startsWith("http://localhost") ||
    apiPublicUrl().startsWith("http://127.0.0.1")
  );
}

export function getCallbackUrl(): string {
  return `${apiPublicUrl()}/api/v1/auth/atproto/callback`;
}

/**
 * The metadata for the production discoverable client. This exact object is
 * served publicly at the client-metadata endpoint — it must match what the
 * OAuth client was constructed with.
 */
export function getClientMetadata(): OAuthClientMetadataInput {
  const base = apiPublicUrl();
  return {
    client_id: `${base}/api/v1/auth/atproto/client-metadata.json`,
    client_name: "Ápice",
    client_uri: base,
    redirect_uris: [getCallbackUrl()],
    scope: "atproto transition:generic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  } as OAuthClientMetadataInput;
}

const stateStore = {
  get: async (key: string) => {
    const raw = await redis.get(stateKey(key));
    return raw ? (JSON.parse(raw) as NodeSavedState) : undefined;
  },
  set: async (key: string, value: NodeSavedState) => {
    await redis.set(stateKey(key), JSON.stringify(value), "EX", STATE_TTL_SECONDS);
  },
  del: async (key: string) => {
    await redis.del(stateKey(key));
  },
};

const sessionStore = {
  get: async (key: string) => {
    const raw = await redis.get(sessionKey(key));
    return raw ? (JSON.parse(raw) as NodeSavedSession) : undefined;
  },
  set: async (key: string, value: NodeSavedSession) => {
    await redis.set(
      sessionKey(key),
      JSON.stringify(value),
      "EX",
      SESSION_TTL_SECONDS
    );
  },
  del: async (key: string) => {
    await redis.del(sessionKey(key));
  },
};

let client: NodeOAuthClient | null = null;

export function getOAuthClient(): NodeOAuthClient {
  if (client) return client;

  client = new NodeOAuthClient({
    clientMetadata: isLoopbackMode()
      ? buildAtprotoLoopbackClientMetadata({
          scope: "atproto transition:generic",
          redirect_uris: [getCallbackUrl()],
        })
      : getClientMetadata(),
    stateStore,
    sessionStore,
    // Serializes concurrent token refreshes for the same DID in this process,
    // preventing credential revocation when several writes happen at once.
    requestLock: requestLocalLock,
  });

  return client;
}

export interface OAuthStateData {
  platform: "mobile" | "web";
}

/** Starts the authorization flow; returns the URL to send the user to. */
export async function startAuthorization(
  handle: string,
  state: OAuthStateData
): Promise<URL> {
  return getOAuthClient().authorize(handle, {
    state: JSON.stringify(state),
  });
}

/** Completes the flow from the callback query params. */
export async function completeAuthorization(params: URLSearchParams) {
  const { session, state } = await getOAuthClient().callback(params);
  const stateData: OAuthStateData = state
    ? JSON.parse(state)
    : { platform: "web" };
  return { session, stateData };
}

/** True if we hold an OAuth session (with repo write) for this DID. */
export async function hasStoredSession(did: string): Promise<boolean> {
  return (await redis.get(sessionKey(did))) !== null;
}

/** Restores the OAuth session for a DID (auto-refreshes if needed). */
export async function restoreSession(did: string) {
  return getOAuthClient().restore(did);
}

/** Deletes the stored session for a DID (e.g. on disconnect). */
export async function deleteSession(did: string) {
  await redis.del(sessionKey(did));
}
