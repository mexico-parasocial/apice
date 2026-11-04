"use client";

import { BrowserOAuthClient } from "@atproto/oauth-client-browser";

let clientPromise: Promise<BrowserOAuthClient> | null = null;

export async function getStreamplaceOAuthClient(): Promise<BrowserOAuthClient> {
  if (typeof window === "undefined") {
    throw new Error("Streamplace OAuth client is only available in the browser");
  }

  if (!clientPromise) {
    const baseUrl = window.location.origin;
    const clientId = `${baseUrl}/api/oauth/client-metadata`;
    clientPromise = BrowserOAuthClient.load({ clientId });
  }

  return clientPromise;
}

export async function initStreamplaceSession() {
  const client = await getStreamplaceOAuthClient();
  return client.init();
}

export async function signInWithBluesky(handleOrDid: string) {
  const client = await getStreamplaceOAuthClient();
  return client.signIn(handleOrDid);
}
