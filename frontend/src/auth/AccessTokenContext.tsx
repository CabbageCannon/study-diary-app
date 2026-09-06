import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import {
  ACCESS_TOKEN_CHANGED_EVENT,
  getAccessToken,
  saveAccessToken as persistAccessToken,
} from "../api/client";

interface AccessTokenContextValue {
  accessToken: string;
  accessTokenVersion: number;
  hasAccessToken: boolean;
  saveAccessToken: (value: string) => void;
  clearAccessToken: () => void;
}

const AccessTokenContext = createContext<AccessTokenContextValue | null>(null);

export function AccessTokenProvider({ children }: PropsWithChildren) {
  const [accessToken, setAccessToken] = useState(getAccessToken);
  const [accessTokenVersion, setAccessTokenVersion] = useState(0);

  useEffect(() => {
    const syncAccessToken = () => {
      setAccessToken(getAccessToken());
      setAccessTokenVersion((version) => version + 1);
    };
    window.addEventListener(ACCESS_TOKEN_CHANGED_EVENT, syncAccessToken);
    return () => window.removeEventListener(ACCESS_TOKEN_CHANGED_EVENT, syncAccessToken);
  }, []);

  const value = useMemo(() => ({
    accessToken,
    accessTokenVersion,
    hasAccessToken: Boolean(accessToken),
    saveAccessToken: persistAccessToken,
    clearAccessToken: () => persistAccessToken(""),
  }), [accessToken, accessTokenVersion]);

  return <AccessTokenContext.Provider value={value}>{children}</AccessTokenContext.Provider>;
}

export function useAccessToken() {
  const value = useContext(AccessTokenContext);
  if (!value) throw new Error("useAccessToken 必须在 AccessTokenProvider 内使用。");
  return value;
}
