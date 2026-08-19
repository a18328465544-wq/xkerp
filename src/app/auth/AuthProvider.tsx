import {useQuery, useQueryClient} from "@tanstack/react-query";
import {createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode} from "react";
import {LogIn, ShieldAlert} from "lucide-react";
import {authApi, type AuthSession} from "@/src/services/api/endpoints/auth";
import {ApiError, getAccessToken} from "@/src/services/api/client";
import {queryKeys} from "@/src/services/api/query-keys";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpLoadingState, ErpPageError} from "@/src/components/common";

type AuthContextValue = {
  session: AuthSession | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  error: Error | null;
  login: (username: string, password: string) => Promise<AuthSession>;
  logout: () => void;
  refresh: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: async ({signal}) => {
      const session = await authApi.session(signal);
      if (session.initialState) queryClient.setQueryData(queryKeys.state.initial(), session.initialState);
      return session;
    },
    select: ({initialState: _initialState, ...session}) => session,
    enabled: Boolean(token),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onExpired = () => {
      authApi.logout();
      setToken(null);
      queryClient.removeQueries({queryKey: queryKeys.auth.session()});
    };
    window.addEventListener("gpu-erp:auth-expired", onExpired);
    return () => window.removeEventListener("gpu-erp:auth-expired", onExpired);
  }, [queryClient]);

  useEffect(() => {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.isUnauthorized) {
      authApi.logout();
      setToken(null);
    }
  }, [sessionQuery.error]);

  const value = useMemo<AuthContextValue>(() => ({
    session: sessionQuery.data || null,
    status: !token
      ? "unauthenticated"
      : sessionQuery.isPending
        ? "loading"
        : sessionQuery.error
          ? "error"
          : "authenticated",
    error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
    async login(username, password) {
      const session = await authApi.login(username, password);
      if (session.initialState) queryClient.setQueryData(queryKeys.state.initial(), session.initialState);
      const {initialState: _initialState, ...sessionForContext} = session;
      queryClient.setQueryData(queryKeys.auth.session(), sessionForContext);
      setToken(getAccessToken());
      return sessionForContext;
    },
    logout() {
      authApi.logout();
      setToken(null);
      queryClient.clear();
    },
    refresh() {
      return queryClient.invalidateQueries({queryKey: queryKeys.auth.session()});
    },
  }), [queryClient, sessionQuery.data, sessionQuery.error, sessionQuery.isPending, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}

export function AuthBoundary({children}: {children: ReactNode}) {
  const {status, error, session, login} = useAuth();
  if (status === "loading") {
    return <div className="mx-auto max-w-xl py-16"><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的菜单和数据权限。" /></div>;
  }
  if (status === "error") {
    return <div className="mx-auto max-w-xl py-16"><ErpPageError title="登录状态读取失败" description={error?.message || "无法读取当前账号，请重试或重新登录。"} onRetry={() => window.location.reload()} /></div>;
  }
  if (!session) return <LoginView onLogin={login} />;
  return <>{children}</>;
}

function LoginView({onLogin}: {onLogin: (username: string, password: string) => Promise<AuthSession>}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await onLogin(username.trim(), password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败，请检查账号和密码。");
    } finally {
      setPending(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-[var(--erp-color-canvas)] p-4">
    <Card className="w-full max-w-md">
      <CardContent className="space-y-6 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><LogIn className="h-5 w-5" /></span>
          <div><h1 className="text-xl font-bold text-[var(--erp-color-text)]">GPU ERP</h1><p className="mt-1 text-sm text-[var(--erp-color-text-secondary)]">登录后进入经营工作台</p></div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">账号<Input className="mt-2" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label className="block text-sm font-semibold">密码<Input className="mt-2" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          {message && <p role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>}
          <Button className="w-full" type="submit" variant="primary" disabled={pending}>{pending ? "登录中…" : "登录并继续"}</Button>
        </form>
      </CardContent>
    </Card>
  </main>;
}
