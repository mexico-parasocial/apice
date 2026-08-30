import { useMutation } from "@tanstack/react-query";
import { AxiosInstance } from "axios";

export interface AtprotoAuthDeps {
  axios: AxiosInstance;
  serverUri: string;
  /**
   * Opens an in-app browser auth session (inject
   * `WebBrowser.openAuthSessionAsync` from expo-web-browser).
   */
  openAuthSession: (
    url: string,
    redirectUrl: string
  ) => Promise<{ type: string; url?: string }>;
}

export interface AtprotoLoginResult {
  accessToken: string;
  refreshToken: string;
  user: any;
}

export const ATPROTO_DEEPLINK = "apice://auth/callback";

function parseTokensFromRedirect(url: string): {
  accessToken: string;
  refreshToken: string;
} {
  // Manual parsing — Hermes' URL/URLSearchParams support is inconsistent.
  const accessToken = url.match(/[?&]accessToken=([^&]+)/)?.[1];
  const refreshToken = url.match(/[?&]refreshToken=([^&]+)/)?.[1];
  if (!accessToken || !refreshToken) {
    throw new Error("No se recibieron los tokens de sesión");
  }
  return {
    accessToken: decodeURIComponent(accessToken),
    refreshToken: decodeURIComponent(refreshToken),
  };
}

/**
 * ATProto OAuth login against the Ápice server.
 *
 * Flow: POST /auth/atproto/start → open authorizeUrl in an auth session →
 * the server completes OAuth and 302s to apice://auth/callback with tokens →
 * fetch /me and return everything the auth store needs.
 */
export function makeAtprotoAuthHooks(deps: AtprotoAuthDeps) {
  const { axios, serverUri, openAuthSession } = deps;

  function useAtprotoLogin(callbacks?: {
    onSuccess?: (data: AtprotoLoginResult) => void;
    onError?: (error: unknown) => void;
  }) {
    return useMutation<AtprotoLoginResult, unknown, string>({
      mutationFn: async (handle: string) => {
        const startRes = await axios.post(
          `${serverUri}/api/v1/auth/atproto/start`,
          { handle: handle.replace(/^@/, ""), platform: "mobile" }
        );
        const authorizeUrl = startRes.data?.authorizeUrl;
        if (!authorizeUrl) {
          throw new Error("El servidor no devolvió una URL de autorización");
        }

        const result = await openAuthSession(authorizeUrl, ATPROTO_DEEPLINK);
        if (result.type !== "success" || !result.url) {
          throw new Error("Inicio de sesión cancelado");
        }

        const { accessToken, refreshToken } = parseTokensFromRedirect(
          result.url
        );

        const meRes = await axios.get(`${serverUri}/api/v1/me`, {
          headers: { "access-token": accessToken },
        });

        return { accessToken, refreshToken, user: meRes.data?.user };
      },
      onSuccess: callbacks?.onSuccess,
      onError: callbacks?.onError,
    });
  }

  return { useAtprotoLogin };
}
