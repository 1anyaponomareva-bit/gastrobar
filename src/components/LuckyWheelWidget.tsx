"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { LuckyWheelButton } from "@/components/LuckyWheelButton";
import { LuckyWheelPopup } from "@/components/LuckyWheelPopup";
import { MyBonusesScreen } from "@/components/MyBonusesScreen";
import { getActiveBonus, formatRemainingTime } from "@/services/bonusService";

export function LuckyWheelWidget() {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [myBonusesOpen, setMyBonusesOpen] = useState(false);
  const [activeBonus, setActiveBonus] = useState<ReturnType<typeof getActiveBonus>>(null);
  const [remainingTime, setRemainingTime] = useState("");

  useEffect(() => {
    setActiveBonus(getActiveBonus());
  }, []);

  useEffect(() => {
    if (!activeBonus) {
      setRemainingTime("");
      return;
    }
    const tick = () => {
      const b = getActiveBonus();
      if (b) setRemainingTime(formatRemainingTime(b.expiresAt));
      else setRemainingTime("");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeBonus?.id]);

  const handleFabClick = () => {
    if (activeBonus) {
      setMyBonusesOpen(true);
    } else {
      setWheelOpen(true);
    }
  };

  const handleCloseWheel = () => {
    setWheelOpen(false);
    setActiveBonus(getActiveBonus());
  };

  const handleCloseMyBonuses = () => {
    setMyBonusesOpen(false);
    setActiveBonus(getActiveBonus());
  };

  return (
    <>
      <LuckyWheelButton
        hasBonus={!!activeBonus}
        remainingTime={remainingTime}
        onClick={handleFabClick}
      />
      <AnimatePresence>
        {wheelOpen && (
          <LuckyWheelPopup isOpen={wheelOpen} onClose={handleCloseWheel} />
        )}
        {myBonusesOpen && (
          <MyBonusesScreen onClose={handleCloseMyBonuses} />
        )}
      </AnimatePresence>
    </>
  );
}
