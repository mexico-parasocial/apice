# Ápice admin

Next.js panel for instructors and staff: course authoring (with Streamplace
video upload and ATProto publishing), quizzes, INE review, users, analytics,
and the public site's FAQ/categories/banner.

```bash
pnpm dev:admin        # from the repo root → http://localhost:3000
```

Set `NEXT_PUBLIC_SERVER_URI` (e.g. `http://localhost:8000/api/v1`) in
`apps/admin/.env` — see `.env.example`. `NEXT_PUBLIC_*` values are inlined at
build time, so the Docker image takes them as build args.

## Layout

| Path | What goes there |
|---|---|
| `src/app/` | Routes only: pages, layouts, the OAuth client-metadata route |
| `src/features/<area>/` | Screens for one area plus its RTK Query slice (`courses`, `cms`, `users`, `ine`, `orders`, `analytics`, `auth`, `notifications`, `dashboard`) |
| `src/components/` | Shared UI (Heading, Loader, theme, ratings, player) |
| `src/lib/` | Non-React helpers: `apiFetch`, Streamplace upload/OAuth, ATProto publishing |
| `src/store/` | Redux store and the base API slice |

`@/…` imports resolve to `src/`.

## Sessions

The API sets the session as HttpOnly cookies; page scripts never see a token.
Every API request must send credentials and the `x-auth-mode: cookie` header
— RTK Query does this in `src/store/apiSlice.ts`, direct calls go through
`src/lib/apiFetch.ts`. Admin and API must be on the same site
(`admin.example.com` + `api.example.com`).
