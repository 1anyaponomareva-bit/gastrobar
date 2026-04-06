/**
 * Единый layout стола дурака: сиденья, колода, safe-area.
 * Число игроков задаёт только параметры (углы из `getOpponentSeatAnglesDeg`), без отдельных «режимов».
 */

import { cn } from "@/lib/utils";

import { getOpponentSeatAnglesDeg } from "./durakTableLayoutEngine";

/** Колода: слева по центру по вертикали, одинаково для 2–6 игроков. */
export const DURAK_DECK_WRAPPER_CLASS =
  "pointer-events-auto absolute z-[8] overflow-visible left-[0.5%] top-1/2 -translate-y-1/2 sm:left-[2%]";

/** Козырь под колодой — единое правило для всех столов. */
export const DURAK_DECK_TRUMP_TUCK_UNDER_DECK = true;

/**
 * Обёртка колонки со столом: safe-area сверху + отступ от «шапки» контента.
 * `embedded` — только встроенный онлайн-вид (не число игроков).
 */
export function getDurakTableColumnClassNames(opts: {
  embedded: boolean;
  hasOpponents: boolean;
}): string {
  return cn(
    "relative z-30 mx-auto flex w-full max-w-[min(100%,580px)] shrink-0 flex-col items-center px-0.5 pb-1 pt-1 sm:pt-2",
    opts.embedded && opts.hasOpponents && "pt-2 sm:pt-3",
    opts.hasOpponents
      ? [
          /* Запас под status bar / notch + воздух до фикс. шапки сайта (~60px) внутри скролла */
          "pt-[max(0.85rem,calc(env(safe-area-inset-top,0px)+0.75rem))] sm:pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.9rem))]",
          "mt-[min(2.85rem,8vmin)] sm:mt-[min(3.1rem,8.5vmin)]",
        ]
      : "mt-[min(1.25rem,3.5vmin)]",
  );
}

export type DurakPlayerLayoutRole = "local" | "opponent";

/**
 * Угол сиденья на «сукне»: локальный всегда внизу (90°), соперники — по верхней дуге
 * согласно `getOpponentSeatAnglesDeg`.
 *
 * `playerIndex`: 0 = локальный игрок, 1…N−1 — по часовой от локального.
 */
export function getPlayerLayout(
  totalPlayers: number,
  playerIndex: number,
): {
  role: DurakPlayerLayoutRole;
  seatAngleDeg: number;
  opponentIndex: number | null;
} {
  if (totalPlayers < 2 || playerIndex === 0) {
    return { role: "local", seatAngleDeg: 90, opponentIndex: null };
  }
  const oppAngles = getOpponentSeatAnglesDeg(totalPlayers - 1, totalPlayers);
  const oi = playerIndex - 1;
  return {
    role: "opponent",
    seatAngleDeg: oppAngles[oi] ?? 90,
    opponentIndex: oi,
  };
}
