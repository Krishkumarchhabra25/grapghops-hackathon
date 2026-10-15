import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, ApiError } from '../lib/api';

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type Workspace = {
  id: string;
  name: string;
};

type AuthState = {
  user: User | null;
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const USER_NAME_KEY = 'graphops-user-name';

function persistName(name: string | undefined) {
  try {
    if (name) localStorage.setItem(USER_NAME_KEY, name);
  } catch { /* ignore */ }
}

function clearPersisted() {
  try {
    localStorage.removeItem(USER_NAME_KEY);
  } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, restore the session from the HTTP-only cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.me();
        if (!cancelled) {
          setUser(res.user);
          setWorkspace(res.workspace);
          persistName(res.user?.name);
        }
      } catch (e) {
        // Not logged in — that's fine.
        if (!cancelled && !(e instanceof ApiError && e.status === 401)) {
          // eslint-disable-next-line no-console
          console.warn('session restore failed', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await authApi.login(email, password);
      setUser(res.user);
      setWorkspace(res.workspace);
      persistName(res.user?.name);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Login failed';
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setWorkspace(null);
      clearPersisted();
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, workspace, loading, error, login, logout }),
    [user, workspace, loading, error, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}