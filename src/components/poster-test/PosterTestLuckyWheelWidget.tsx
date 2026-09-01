"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuckyWheelButton } from "@/components/LuckyWheelButton";
import { PosterTestLuckyWheelPopup } from "@/components/poster-test/PosterTestLuckyWheelPopup";
import { MyBonusesScreen } from "@/components/MyBonusesScreen";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { usePosterTestWheelScope } from "@/components/poster-test/PosterTestWheelScopeContext";
import {
  formatRemainingTime,
  getActiveBonus,
  saveActiveBonus,
  type Bonus,
} from "@/services/bonusService";
import { POSTER_TEST_LOGIN_PATH } from "@/lib/posterTestRoutes";
import { posterTestUserCanSpinWheel } from "@/lib/posterTestWheelScope";

function buildWheelLoginReturnTo(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set("wheel", "1");
  const query = params.toString();
  return query ? `${pathname}?${query}` : `${pathname}?wheel=1`;
}

export function PosterTestLuckyWheelWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = usePosterTestAuth();
  const { scope, canSpinWheel } = usePosterTestWheelScope();

  const [wheelOpen, setWheelOpen] = useState(false);
  const [myBonusesOpen, setMyBonusesOpen] = useState(false);
  const [activeBonus, setActiveBonus] = useState<Bonus | null>(null);
  const [remainingTime, setRemainingTime] = useState("");
  const wheelAutoOpenedRef = useRef(false);

  const activeBonusStorageKey = scope?.activeBonusStorageKey;

  const refreshWheelStatus = useCallback(async () => {
    if (!canSpinWheel) {
      setActiveBonus(null);
      return;
    }
    try {
      const response = await fetch("/api/poster-test/wheel", { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        activeBonus?: Bonus | null;
      };
      if (data.success) {
        const bonus = data.activeBonus ?? null;
        setActiveBonus(bonus);
        if (bonus && activeBonusStorageKey) {
          saveActiveBonus(bonus, activeBonusStorageKey);
        }
      }
    } catch {
      setActiveBonus(getActiveBonus(activeBonusStorageKey));
    }
  }, [activeBonusStorageKey, canSpinWheel]);

  useEffect(() => {
    void refreshWheelStatus();
  }, [refreshWheelStatus, user?.id]);

  useEffect(() => {
    if (!activeBonus) {
      setRemainingTime("");
      return;
    }
    const tick = () => setRemainingTime(formatRemainingTime(activeBonus.expiresAt));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeBonus]);

  useEffect(() => {
    if (loading || wheelAutoOpenedRef.current) return;
    if (!searchParams || searchParams.get("wheel") !== "1") return;
    if (!posterTestUserCanSpinWheel(user)) return;

    wheelAutoOpenedRef.current = true;

    void refreshWheelStatus().then(() => {
      const bonus = getActiveBonus(activeBonusStorageKey);
      if (bonus) setMyBonusesOpen(true);
      else setWheelOpen(true);
    });

    const params = new URLSearchParams(searchParams.toString());
    params.delete("wheel");
    const nextQuery = params.toString();
    const path = pathname ?? "/poster-test";
    router.replace(nextQuery ? `${path}?${nextQuery}` : path);
  }, [
    activeBonusStorageKey,
    loading,
    pathname,
    refreshWheelStatus,
    router,
    searchParams,
    user,
  ]);

  const handleFabClick = () => {
    if (!posterTestUserCanSpinWheel(user)) {
      const path = pathname ?? "/poster-test";
      const returnTo = buildWheelLoginReturnTo(path, searchParams?.toString() ?? "");
      router.push(`${POSTER_TEST_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (activeBonus) {
      setMyBonusesOpen(true);
    } else {
      setWheelOpen(true);
    }
  };

  const handleCloseWheel = () => {
    setWheelOpen(false);
    void refreshWheelStatus();
  };

  const handleCloseMyBonuses = () => {
    setMyBonusesOpen(false);
    void refreshWheelStatus();
  };

  return (
    <>
      <LuckyWheelButton
        hasBonus={!!activeBonus}
        remainingTime={remainingTime}
        onClick={handleFabClick}
      />
      {(wheelOpen || myBonusesOpen) && canSpinWheel ? (
        <AnimatePresence>
          {wheelOpen ? (
            <PosterTestLuckyWheelPopup
              isOpen={wheelOpen}
              onClose={handleCloseWheel}
              activeBonusStorageKey={activeBonusStorageKey}
              onStatusChange={() => void refreshWheelStatus()}
            />
          ) : null}
          {myBonusesOpen ? (
            <MyBonusesScreen
              onClose={handleCloseMyBonuses}
              activeBonusStorageKey={activeBonusStorageKey}
            />
          ) : null}
        </AnimatePresence>
      ) : null}
    </>
  );
}
