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

function parseCodeFromRedirect(url: string): string {
  // Manual parsing — Hermes' URL/URLSearchParams support is inconsistent.
  const code = url.match(/[?&]code=([^&#]+)/)?.[1];
  if (!code) {
    throw new Error("No se recibió el código de inicio de sesión");
  }
  return decodeURIComponent(code);
}

/**
 * ATProto OAuth login against the Ápice server.
 *
 * Flow: POST /auth/atproto/start → open authorizeUrl in an auth session →
 * the server completes OAuth and 302s to apice://auth/callback?code=… →
 * POST /auth/atproto/exchange trades that one-time code for a session.
 * Tokens never travel in the deep link (any app can claim the scheme).
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

        const code = parseCodeFromRedirect(result.url);
        const exchangeRes = await axios.post(
          `${serverUri}/api/v1/auth/atproto/exchange`,
          { code }
        );
        const { accessToken, refreshToken, user } = exchangeRes.data ?? {};
        if (!accessToken || !refreshToken) {
          throw new Error("No se recibieron los tokens de sesión");
        }
        return { accessToken, refreshToken, user };
      },
      onSuccess: callbacks?.onSuccess,
      onError: callbacks?.onError,
    });
  }

  return { useAtprotoLogin };
}
