"use client";

import { motion } from "framer-motion";
import { Bell } from "lucide-react";

export function CallWaiterButton() {
  const handleClick = () => {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {});
    }
    // В реальном приложении здесь запрос к API / вызвать официанта
    alert("Официант вызван. Ожидайте, пожалуйста.");
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4 }}
      onClick={handleClick}
      className="fixed bottom-20 left-4 right-4 z-30 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl bg-[var(--theme-accent)] py-4 font-semibold text-black shadow-lg transition active:scale-[0.98]"
      style={{
        marginBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      <Bell className="h-5 w-5" />
      Вызвать официанта
    </motion.button>
  );
}
