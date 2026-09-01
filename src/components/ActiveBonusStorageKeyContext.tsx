"use client";

import { createContext, useContext, type ReactNode } from "react";

const ActiveBonusStorageKeyContext = createContext<string | undefined>(undefined);

export function ActiveBonusStorageKeyProvider({
  storageKey,
  children,
}: {
  storageKey?: string;
  children: ReactNode;
}) {
  return (
    <ActiveBonusStorageKeyContext.Provider value={storageKey}>
      {children}
    </ActiveBonusStorageKeyContext.Provider>
  );
}

export function useActiveBonusStorageKey(): string | undefined {
  return useContext(ActiveBonusStorageKeyContext);
}
