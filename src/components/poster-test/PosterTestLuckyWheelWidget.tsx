"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuckyWheelButton } from "@/components/LuckyWheelButton";
import { LuckyWheelPopup } from "@/components/LuckyWheelPopup";
import { MyBonusesScreen } from "@/components/MyBonusesScreen";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { usePosterTestWheelScope } from "@/components/poster-test/PosterTestWheelScopeContext";
import { getActiveBonus, formatRemainingTime } from "@/services/bonusService";
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
  const [activeBonus, setActiveBonus] = useState<ReturnType<typeof getActiveBonus>>(null);
  const [remainingTime, setRemainingTime] = useState("");
  const wheelAutoOpenedRef = useRef(false);

  const activeBonusStorageKey = scope?.activeBonusStorageKey;

  useEffect(() => {
    if (!canSpinWheel) {
      setActiveBonus(null);
      return;
    }
    setActiveBonus(getActiveBonus(activeBonusStorageKey));
  }, [activeBonusStorageKey, canSpinWheel, user?.id]);

  useEffect(() => {
    if (!activeBonus) {
      setRemainingTime("");
      return;
    }
    const tick = () => {
      const bonus = getActiveBonus(activeBonusStorageKey);
      if (bonus) setRemainingTime(formatRemainingTime(bonus.expiresAt));
      else setRemainingTime("");
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeBonus?.id, activeBonusStorageKey]);

  useEffect(() => {
    if (loading || wheelAutoOpenedRef.current) return;
    if (!searchParams || searchParams.get("wheel") !== "1") return;
    if (!posterTestUserCanSpinWheel(user)) return;

    wheelAutoOpenedRef.current = true;

    if (getActiveBonus(activeBonusStorageKey)) {
      setMyBonusesOpen(true);
    } else {
      setWheelOpen(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("wheel");
    const nextQuery = params.toString();
    const path = pathname ?? "/poster-test";
    router.replace(nextQuery ? `${path}?${nextQuery}` : path);
  }, [
    activeBonusStorageKey,
    loading,
    pathname,
    router,
    searchParams,
    user,
  ]);

  const handleFabClick = () => {
    if (!posterTestUserCanSpinWheel(user)) {
      const path = pathname ?? "/poster-test";
      const returnTo = buildWheelLoginReturnTo(path, searchParams?.toString() ?? "");
      router.push(
        `${POSTER_TEST_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    const bonus = getActiveBonus(activeBonusStorageKey);
    if (bonus) {
      setMyBonusesOpen(true);
    } else {
      setWheelOpen(true);
    }
  };

  const handleCloseWheel = () => {
    setWheelOpen(false);
    setActiveBonus(getActiveBonus(activeBonusStorageKey));
  };

  const handleCloseMyBonuses = () => {
    setMyBonusesOpen(false);
    setActiveBonus(getActiveBonus(activeBonusStorageKey));
  };

  const wheelProps = useMemo(
    () =>
      scope
        ? {
            wheelStorageKeys: scope.wheelStorageKeys,
            activeBonusStorageKey: scope.activeBonusStorageKey,
          }
        : {},
    [scope],
  );

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
            <LuckyWheelPopup
              isOpen={wheelOpen}
              onClose={handleCloseWheel}
              {...wheelProps}
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
