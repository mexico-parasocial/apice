/**
 * fetch() for the Ápice API from the admin panel.
 *
 * The session lives in HttpOnly cookies the API sets at login, so no page
 * script — including an injected one — can read the tokens. Every API call
 * must therefore send credentials and the `x-auth-mode: cookie` header; the
 * server only honours the cookies when that header is present (it can't be
 * set by a cross-site form, which is what keeps this CSRF-safe).
 *
 * Use it for direct calls; RTK Query does the same in redux/.../apiSlice.ts.
 */
export const AUTH_MODE_HEADERS = { "x-auth-mode": "cookie" } as const;

export function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-auth-mode", "cookie");
  return fetch(input, { ...init, headers, credentials: "include" });
}
