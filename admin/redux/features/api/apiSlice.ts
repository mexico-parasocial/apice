import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { userLoggedIn } from "../auth/authSlice";

/**
 * Base API slice.
 *
 * The session is a pair of HttpOnly cookies set by the API (see
 * app/utils/apiFetch.ts for why): every request sends credentials and the
 * `x-auth-mode: cookie` opt-in header, and token rotation happens server-side
 * through Set-Cookie. Nothing token-shaped is ever visible to page scripts.
 */
export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_SERVER_URI,
    credentials: "include",
    prepareHeaders: (headers) => {
      headers.set("x-auth-mode", "cookie");
      return headers;
    },
  }),
  endpoints: (builder) => ({
    loadUser: builder.query({
      query: () => ({ url: "me", method: "GET" }),
      async onQueryStarted(_arg, { queryFulfilled, dispatch }) {
        try {
          const result = await queryFulfilled;
          dispatch(userLoggedIn({ user: result.data.user }));
        } catch {
          // Not signed in: the login screen handles it.
        }
      },
    }),
  }),
});

export const { useLoadUserQuery } = apiSlice;
