import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onTokensRotated, onUnauthorized, setTokens } from "@/api/client";

interface AuthContextValue {
  token: string | null;
  user: any | null;
  isLoading: boolean;
  login: (
    accessToken: string,
    refreshToken: string | null,
    user: any
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "apice_access_token";
const REFRESH_KEY = "apice_refresh_token";
const USER_KEY = "apice_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.multiGet([TOKEN_KEY, REFRESH_KEY, USER_KEY]).then(
      ([tokenEntry, refreshEntry, userEntry]) => {
        const storedToken = tokenEntry[1];
        const storedRefresh = refreshEntry[1];
        const storedUser = userEntry[1] ? JSON.parse(userEntry[1]) : null;
        if (storedToken) {
          setTokens({ accessToken: storedToken, refreshToken: storedRefresh });
          setToken(storedToken);
          setUser(storedUser);
        }
        setIsLoading(false);
      }
    );

    // Persist rotated tokens so the session survives app restarts.
    const unsubscribe = onTokensRotated(({ accessToken, refreshToken }) => {
      setToken(accessToken);
      AsyncStorage.multiSet([
        [TOKEN_KEY, accessToken],
        [REFRESH_KEY, refreshToken],
      ]);
    });

    // A 401 means the server rejected the session outright (rotation already
    // covers expiry) — drop the dead credentials instead of leaving the user
    // "logged in" to failing requests.
    const unsubscribeUnauthorized = onUnauthorized(() => {
      setTokens({ accessToken: null, refreshToken: null });
      setToken(null);
      setUser(null);
      AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
    });

    return () => {
      unsubscribe();
      unsubscribeUnauthorized();
    };
  }, []);

  const login = async (
    accessToken: string,
    refreshToken: string | null,
    newUser: any
  ) => {
    setTokens({ accessToken, refreshToken });
    setToken(accessToken);
    setUser(newUser);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, accessToken],
      [USER_KEY, JSON.stringify(newUser)],
      ...(refreshToken ? [[REFRESH_KEY, refreshToken]] : []),
    ] as [string, string][]);
  };

  const logout = async () => {
    setTokens({ accessToken: null, refreshToken: null });
    setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
