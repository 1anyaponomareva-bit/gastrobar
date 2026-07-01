"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { POSTER_TEST_LOGIN_PATH } from "@/lib/posterTestRoutes";
import type { PosterTestUser } from "@/lib/poster-test-auth/types";

type SerializedPosterTestUser = {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  telegramId: number | null;
  provider: "google" | "telegram";
  role: "guest" | "staff" | "admin";
  bonusPoints: number;
  qrSlug: string;
  createdAt: string;
  updatedAt: string;
};

type PosterTestAuthContextValue = {
  user: SerializedPosterTestUser | null;
  loading: boolean;
  isStaff: boolean;
  refreshSession: () => Promise<SerializedPosterTestUser | null>;
  signOut: () => Promise<void>;
};

const PosterTestAuthContext = createContext<PosterTestAuthContextValue | null>(null);

export function usePosterTestAuth(): PosterTestAuthContextValue {
  const value = useContext(PosterTestAuthContext);
  if (!value) {
    throw new Error("usePosterTestAuth must be used within PosterTestAuthProvider");
  }
  return value;
}

export function PosterTestAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SerializedPosterTestUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/poster-test/auth/session", { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        user?: SerializedPosterTestUser | null;
      };
      const nextUser = data.success && data.user ? data.user : null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    await fetch("/api/poster-test/auth/signout", { method: "POST" });
    setUser(null);
    router.push(POSTER_TEST_LOGIN_PATH);
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isStaff: user?.role === "staff" || user?.role === "admin",
      refreshSession,
      signOut,
    }),
    [loading, refreshSession, signOut, user],
  );

  return <PosterTestAuthContext.Provider value={value}>{children}</PosterTestAuthContext.Provider>;
}

export type { SerializedPosterTestUser as PosterTestAuthUser };
