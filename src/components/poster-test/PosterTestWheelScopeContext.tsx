"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ActiveBonusStorageKeyProvider } from "@/components/ActiveBonusStorageKeyContext";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import {
  getPosterTestWheelScope,
  posterTestUserCanSpinWheel,
  type PosterTestWheelScope,
} from "@/lib/posterTestWheelScope";

type PosterTestWheelScopeContextValue = {
  scope: PosterTestWheelScope | null;
  canSpinWheel: boolean;
};

const PosterTestWheelScopeContext = createContext<PosterTestWheelScopeContextValue>({
  scope: null,
  canSpinWheel: false,
});

export function PosterTestWheelScopeProvider({ children }: { children: ReactNode }) {
  const { user } = usePosterTestAuth();

  const value = useMemo(() => {
    const canSpinWheel = posterTestUserCanSpinWheel(user);
    return {
      canSpinWheel,
      scope: canSpinWheel && user ? getPosterTestWheelScope(user.id) : null,
    };
  }, [user]);

  return (
    <PosterTestWheelScopeContext.Provider value={value}>
      <ActiveBonusStorageKeyProvider storageKey={value.scope?.activeBonusStorageKey}>
        {children}
      </ActiveBonusStorageKeyProvider>
    </PosterTestWheelScopeContext.Provider>
  );
}

export function usePosterTestWheelScope(): PosterTestWheelScopeContextValue {
  return useContext(PosterTestWheelScopeContext);
}
