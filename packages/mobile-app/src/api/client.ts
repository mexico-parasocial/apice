import axios, { type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "@/env";

let accessToken: string | null = null;
let refreshToken: string | null = null;

type RotationListener = (tokens: {
  accessToken: string;
  refreshToken: string;
}) => void;
const rotationListeners = new Set<RotationListener>();

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

// ---------------------------------------------------------------------------
// Token refresh, single-flight
//
// The server refreshes implicitly: a request that presents an expired access
// token plus a whitelisted refresh token is let through, the presented refresh
// token is revoked, and a fresh pair comes back on x-access-token /
// x-refresh-token. So when several requests go out on the same expired pair,
// the first to reach the server rotates it and the others are refused with a
// 401, because their refresh token was revoked a moment ago. Taken at face
// value that 401 logs the user out of a perfectly healthy session.
//
// Two guards, both keyed on which refresh token each request carried:
//  1. Once the access token is known to be expired, only one request goes out
//     on that pair; the rest wait for it to land and then go out on whatever
//     it brought back.
//  2. A 401 is not believed while another request on the same pair is still
//     in flight (it may be the one rotating it), and a 401 for a pair that has
//     since been superseded is retried once on the current pair. This covers
//     what (1) can't see: a device clock that disagrees with the server's, or
//     a request that left just before expiry and arrived just after.
// Retrying is safe because the server only answers 401 from the auth checks,
// before any handler has run.
// ---------------------------------------------------------------------------

/** Upper bound on waiting for a sibling, so a hung request can't stall the app. */
const MAX_ROTATION_WAIT_MS = 15_000;

interface InFlight {
  refreshToken: string | null;
  settled: Promise<void>;
  settle: () => void;
}

type TrackedConfig = InternalAxiosRequestConfig & {
  _apiceInFlight?: InFlight;
  _apiceRetried?: boolean;
};

const inFlight = new Set<InFlight>();

function track(config: TrackedConfig) {
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => (settle = resolve));
  const entry: InFlight = { refreshToken, settled, settle };
  inFlight.add(entry);
  config._apiceInFlight = entry;
}

function untrack(config: TrackedConfig | undefined) {
  const entry = config?._apiceInFlight;
  if (entry && inFlight.delete(entry)) entry.settle();
}

/** Requests still in flight that presented `token`, other than `self`. */
function inFlightWith(token: string | null, self?: InFlight) {
  const out: Promise<void>[] = [];
  inFlight.forEach((entry) => {
    if (entry !== self && entry.refreshToken === token) out.push(entry.settled);
  });
  return out;
}

function waitFor(pending: Promise<void>[], ms: number) {
  if (pending.length === 0 || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    Promise.all(pending).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Mirrors the server's check (exp <= now). Unknown → not expired. */
function isExpired(token: string): boolean {
  try {
    if (typeof atob !== "function") return false;
    const part = token.split(".")[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const { exp } = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof exp === "number" && exp <= Date.now() / 1000;
  } catch {
    return false;
  }
}

function absorbRotatedTokens(headers: unknown) {
  const h = headers as Record<string, unknown> | undefined;
  const newAccess = h?.["x-access-token"];
  const newRefresh = h?.["x-refresh-token"];
  if (typeof newAccess !== "string" || typeof newRefresh !== "string") return;
  if (!newAccess || !newRefresh) return;
  accessToken = newAccess;
  refreshToken = newRefresh;
  rotationListeners.forEach((cb) =>
    cb({ accessToken: newAccess, refreshToken: newRefresh })
  );
}

api.interceptors.request.use(async (config: TrackedConfig) => {
  // Guard 1: hold this request while another one rotates the expired pair.
  // One wait, not a loop: if the pair didn't rotate (the request in flight
  // hit a public route, or this device's clock runs ahead of the server's),
  // go anyway and let guard 2 sort it out, rather than serialising every
  // request behind the previous one.
  if (accessToken && refreshToken && isExpired(accessToken)) {
    const rotating = inFlightWith(refreshToken);
    // Only await when there is something to wait for: even an already
    // resolved await yields, and a burst of requests would all slip past
    // this check before any of them got tracked.
    if (rotating.length > 0) await waitFor(rotating, MAX_ROTATION_WAIT_MS);
  }

  // No await between here and track(): a request that starts right after
  // this one must see it as in flight.
  if (accessToken) config.headers.set("access-token", accessToken);
  else config.headers.delete("access-token");
  if (refreshToken) config.headers.set("refresh-token", refreshToken);
  else config.headers.delete("refresh-token");
  track(config);
  return config;
});

api.interceptors.response.use(
  (response) => {
    absorbRotatedTokens(response.headers);
    untrack(response.config);
    return response;
  },
  async (error) => {
    const config = error?.config as TrackedConfig | undefined;
    // A request can rotate the pair in the auth middleware and still fail
    // further down (404, 500…); the new pair is on those responses too.
    absorbRotatedTokens(error?.response?.headers);
    const self = config?._apiceInFlight;
    untrack(config);

    if (error?.response?.status !== 401) return Promise.reject(error);

    // Guard 2: let siblings on the same pair land first, then decide.
    if (config && self && !config._apiceRetried) {
      await waitFor(inFlightWith(self.refreshToken, self), MAX_ROTATION_WAIT_MS);
      if (refreshToken && refreshToken !== self.refreshToken) {
        config._apiceRetried = true;
        return api.request(config);
      }
    }

    // The server rejected the current pair: the session is genuinely dead.
    // Without this, every screen rendered its own error state and the user
    // was stuck "logged in" to a dead session.
    unauthorizedListeners.forEach((cb) => cb());
    return Promise.reject(error);
  }
);

/** Fired when the server rejects the current session; the AuthProvider logs out. */
export function onUnauthorized(cb: UnauthorizedListener) {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

export function setTokens(tokens: {
  accessToken: string | null;
  refreshToken: string | null;
}) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function onTokensRotated(cb: RotationListener) {
  rotationListeners.add(cb);
  return () => {
    rotationListeners.delete(cb);
  };
}
