import axios from "axios";
import { API_URL } from "@/env";

let accessToken: string | null = null;
let refreshToken: string | null = null;

type RotationListener = (tokens: {
  accessToken: string;
  refreshToken: string;
}) => void;
const rotationListeners = new Set<RotationListener>();

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers["access-token"] = accessToken;
  }
  if (refreshToken) {
    config.headers["refresh-token"] = refreshToken;
  }
  return config;
});

// The server rotates tokens when an expired access token is presented with a
// valid refresh token; the fresh pair arrives on response headers.
api.interceptors.response.use((response) => {
  const newAccess = response.headers["x-access-token"];
  const newRefresh = response.headers["x-refresh-token"];
  if (newAccess && newRefresh) {
    accessToken = newAccess;
    refreshToken = newRefresh;
    rotationListeners.forEach((cb) =>
      cb({ accessToken: newAccess, refreshToken: newRefresh })
    );
  }
  return response;
});

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

// A 401 means the session is genuinely dead: the rotation flow above handles
// expiry, so by the time the server answers 401 there is nothing left to
// retry. Without this, every screen independently rendered its own error
// state and the user was stuck "logged in" to a dead session.
api.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401) {
    unauthorizedListeners.forEach((cb) => cb());
  }
  return Promise.reject(error);
});

/** Fired once per 401 response; the AuthProvider uses this to log out. */
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
