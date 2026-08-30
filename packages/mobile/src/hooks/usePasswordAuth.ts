import { useMutation } from "@tanstack/react-query";
import { AxiosInstance } from "axios";

export interface PasswordAuthDeps {
  axios: AxiosInstance;
  serverUri: string;
}

export interface PasswordLoginInput {
  email: string;
  password: string;
}

export interface PasswordLoginResponse {
  success: boolean;
  user: any;
  accessToken: string;
  refreshToken?: string | null;
}

/**
 * Email + password sign-in against the server's own `/login` endpoint.
 *
 * This is the account path that does not depend on any external identity
 * service — unlike iM8 (which needs the identity manager running) or Bluesky
 * OAuth (which needs a real Bluesky account). Video playback still requires a
 * linked Bluesky DID on the account; see getLessonPlayback.
 */
export function makePasswordAuthHooks(deps: PasswordAuthDeps) {
  const { axios, serverUri } = deps;

  function usePasswordLogin(options?: {
    onSuccess?: (data: PasswordLoginResponse) => void;
    onError?: (error: unknown) => void;
  }) {
    return useMutation<PasswordLoginResponse, unknown, PasswordLoginInput>({
      mutationFn: async ({ email, password }) => {
        const res = await axios.post(`${serverUri}/api/v1/login`, {
          email: email.trim(),
          password,
        });
        return res.data as PasswordLoginResponse;
      },
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    });
  }

  return { usePasswordLogin };
}
