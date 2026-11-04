import { useMutation } from "@tanstack/react-query";
import axios, { AxiosInstance } from "axios";

export interface IM8AuthDeps {
  axios: AxiosInstance;
  serverUri: string;
}

export interface IM8StartInput {
  identifier: string;
}

export interface IM8StartResponse {
  success: boolean;
  state: string;
  sessionId: string;
  oauthUrl: string | null;
  localOnly: boolean;
  callbackUrl: string;
  expiresIn: number;
}

export interface IM8CompleteInput {
  state: string;
  callbackUrl?: string;
  apiceAccessToken?: string;
}

export interface IM8Session {
  accessToken: string;
  sessionId: string;
  did: string;
  handle: string;
}

export interface IM8CompleteResponse {
  success: boolean;
  user: any;
  accessToken: string;
  refreshToken: string;
  iM8Session: IM8Session;
}

export function makeIM8AuthHooks(deps: IM8AuthDeps) {
  const { axios, serverUri } = deps;

  function useStartIM8Login() {
    return useMutation<IM8StartResponse, unknown, IM8StartInput>({
      mutationFn: async ({ identifier }: IM8StartInput) => {
        const res = await axios.post(`${serverUri}/api/v1/auth/iM8/start`, {
          identifier,
        });
        return res.data as IM8StartResponse;
      },
    });
  }

  function useCompleteIM8Login() {
    return useMutation<IM8CompleteResponse, unknown, IM8CompleteInput>({
      mutationFn: async ({
        state,
        callbackUrl,
        apiceAccessToken,
      }: IM8CompleteInput) => {
        const res = await axios.post(`${serverUri}/api/v1/auth/iM8/complete`, {
          state,
          callbackUrl,
          apiceAccessToken,
        });
        return res.data as IM8CompleteResponse;
      },
    });
  }

  /**
   * Higher-level hook that combines start + complete.
   *
   * For real Bluesky OAuth flows it returns the `oauthUrl` and the caller is
   * responsible for opening the browser and calling `completeIM8Login` with the
   * callback URL. For local-only dev sessions it completes automatically.
   */
  function useIM8Login(options?: {
    onSuccess?: (data: IM8CompleteResponse) => void;
    onError?: (error: unknown) => void;
  }) {
    const start = useStartIM8Login();
    const complete = useCompleteIM8Login();

    async function login(identifier: string, linkingToken?: string) {
      const startRes = await start.mutateAsync({ identifier });

      if (startRes.localOnly) {
        const completeRes = await complete.mutateAsync({
          state: startRes.state,
          apiceAccessToken: linkingToken,
        });
        options?.onSuccess?.(completeRes);
        return { completed: true, data: completeRes, oauthUrl: null as string | null };
      }

      return {
        completed: false,
        data: startRes,
        oauthUrl: startRes.oauthUrl,
        complete: (callbackUrl: string) =>
          complete.mutateAsync({
            state: startRes.state,
            callbackUrl,
            apiceAccessToken: linkingToken,
          }),
      };
    }

    return {
      login,
      start,
      complete,
      isPending: start.isPending || complete.isPending,
      error: start.error || complete.error,
    };
  }

  return { useStartIM8Login, useCompleteIM8Login, useIM8Login };
}
