"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, GameTable, Rank } from "@/games/durak/types";
import {
  attackInitial,
  attackToss,
  attackerBeat,
  defendPlay,
  defenderTake,
  newGame,
} from "@/games/durak/engine";
import { applyBotMove } from "@/games/durak/bot";
import { canBeat } from "@/games/durak/cards";
import { CARD_BACK_URL } from "@/lib/durak/cardAssets";
import { CardFaceArt } from "@/components/durak/CardFaceArt";
import { cn } from "@/lib/utils";

const HUMAN_ID = "human";
const BOT_ID = "bot";

/** Под фиксированный `Header` (высота 60px + safe-area). */
const HEADER_OFFSET_TOP =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px)))]";

function WinConfetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        x: `${(i * 17) % 100}%`,
        delay: (i % 8) * 0.04,
        dur: 1.8 + (i % 5) * 0.12,
        hue: i % 2 === 0 ? "amber" : "emerald",
        rot: (i % 7) * 45,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className={cn(
            "absolute top-0 block h-2 w-1.5 rounded-[1px] shadow-sm",
            p.hue === "amber" ? "bg-amber-300" : "bg-emerald-400"
          )}
          style={{ left: p.x, rotate: p.rot }}
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: "62vh", opacity: [0, 1, 1, 0], rotate: p.rot + 180 }}
          transition={{ delay: p.delay, duration: p.dur, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

/** Пауза между картами при раздаче (как по кругу: вы → бот × 6). */
const DEAL_STAGGER_SEC = 0.07;
const DEAL_MOVE_SEC = 0.36;
const DEAL_BUFFER_MS = 380;

const CARD_W_CLASS = "w-[3.65rem] sm:w-[4.05rem]";
const CARD_H_CLASS = "h-[5.15rem] sm:h-[5.7rem]";
/** Максимально крупная рука: веер из-под нижнего тулбара (z ниже BottomNav). */
const HAND_CARD_W_CLASS = "w-[6.75rem] sm:w-[7.6rem]";
const HAND_CARD_H_CLASS = "h-[9.35rem] sm:h-[10.45rem]";

function handFanStyle(
  n: number,
  i: number,
  mode: "opponent" | "player"
): React.CSSProperties {
  if (n <= 0) return {};
  const mid = (n - 1) / 2;
  const rel = i - mid;
  const spread = n <= 1 ? 0 : Math.min(50 / (n - 1), 9);
  const rot = rel * spread;
  const tx = rel * (n > 8 ? 16.5 : 20.5);
  const curve = Math.abs(rel) * 3.2;
  const ty = mode === "opponent" ? curve : -curve;
  return {
    left: "50%",
    bottom: 0,
    transform: `translate(calc(-50% + ${tx}px), ${ty}px) rotate(${rot}deg)`,
    transformOrigin: "bottom center",
    /** Крайние карты выше по z — не уходят «под» соседей и не выглядят «белыми». */
    zIndex: 10 + i,
  };
}

/** Рубашка: светлый фон, чёткая обводка, логотип внутри внутренней «поля» карты. */
function BrandedCardBack({
  selected,
  disabled,
  className,
}: {
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full select-none flex-col items-center justify-center overflow-hidden rounded-[10px]",
        "border-2 border-[#5c534c] bg-gradient-to-br from-[#f5f0ea] via-[#e8dfd6] to-[#d4cbc2]",
        "shadow-[0_4px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.85)]",
        selected &&
          "shadow-[0_0_0_3px_rgba(252,211,77,0.95),0_10px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.85)] ring-2 ring-amber-200/90",
        disabled && "opacity-[0.38] saturate-[0.65]",
        className
      )}
    >
      {/* Поле карты: тёмный прямоугольник на всю площадь внутри контура + логотип по центру */}
      <div
        className="absolute inset-[6px] z-[1] flex items-center justify-center overflow-hidden rounded-[7px] border-2 border-[#8b7d6b]/55 bg-[#1a1714] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
      >
        <img
          src={CARD_BACK_URL}
          alt=""
          draggable={false}
          className="h-full w-full object-contain object-center p-[10%]"
        />
      </div>
    </div>
  );
}

function CardSprite({
  card,
  faceDown,
  className,
  wrapStyle,
  selected,
  disabled,
  playableHighlight,
  onPress,
  imgClassName,
  size = "table",
}: {
  card?: Card;
  faceDown?: boolean;
  className?: string;
  wrapStyle?: React.CSSProperties;
  selected?: boolean;
  disabled?: boolean;
  /** Подсветка карт, которыми сейчас можно ходить (без затемнения остальных). */
  playableHighlight?: boolean;
  onPress?: () => void;
  imgClassName?: string;
  /** `hand` — чуть крупнее (рука игрока). */
  size?: "table" | "hand";
}) {
  const isBack = faceDown || !card;
  const dimW = size === "hand" ? HAND_CARD_W_CLASS : CARD_W_CLASS;
  const dimH = size === "hand" ? HAND_CARD_H_CLASS : CARD_H_CLASS;

  const wrap = cn(
    "relative shrink-0 overflow-hidden rounded-[10px]",
    !isBack ? "bg-white" : "bg-transparent ring-2 ring-white/75 ring-offset-0 shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
    dimW,
    dimH,
    playableHighlight &&
      !isBack &&
      !selected &&
      "z-[1] ring-[3px] ring-emerald-300/90 shadow-[0_0_18px_rgba(52,211,153,0.5)]",
    selected &&
      !isBack &&
      "drop-shadow-[0_0_14px_rgba(251,191,36,0.55)] shadow-[0_0_0_2px_rgba(251,191,36,0.65)]",
    className
  );

  const inner = isBack ? (
    <BrandedCardBack selected={selected} disabled={disabled} className={imgClassName} />
  ) : (
    <div className="h-full w-full">
      <CardFaceArt card={card} className={cn("h-full w-full", imgClassName)} />
    </div>
  );

  if (onPress) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        style={wrapStyle}
        className={cn(wrap, "border-0 bg-transparent p-0 touch-manipulation")}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onPress();
        }}
        whileTap={disabled ? undefined : { scale: 0.94 }}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.div layout={false} style={wrapStyle} className={wrap}>
      {inner}
    </motion.div>
  );
}

function DeckPile({ count, trumpCard }: { count: number; trumpCard: Card | null }) {
  const stackLayers = count > 0 ? Math.min(8, Math.max(2, Math.ceil(count / 5))) : 0;

  const stackBlock = (
    <>
      {count > 0
        ? Array.from({ length: stackLayers }).map((_, i) => (
            <div
              key={i}
              className="absolute overflow-visible"
              style={{
                right: `${i * 1.15}px`,
                top: `${i}px`,
                zIndex: 30 + i,
              }}
            >
              <CardSprite
                faceDown
                className="shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
              />
            </div>
          ))
        : null}
      {count === 0 && !trumpCard ? (
        <div className="flex h-full w-full items-center justify-center">
          <div
            className={cn(
              "flex items-center justify-center rounded-[10px] border border-dashed border-emerald-700/45 bg-black/30 text-[10px] text-emerald-200/55",
              CARD_W_CLASS,
              CARD_H_CLASS
            )}
          >
            —
          </div>
        </div>
      ) : null}
    </>
  );

  /* Козырь под стопкой (z ниже), без поворота; низ карты выступает вниз из-под колоды */
  if (trumpCard) {
    return (
      <div
        className={cn(
          "relative shrink-0",
          CARD_W_CLASS,
          "min-h-[8.85rem] sm:min-h-[9.65rem]"
        )}
      >
        <div className="absolute bottom-0 left-1/2 z-[1] -translate-x-1/2">
          <CardSprite
            card={trumpCard}
            className="shadow-[0_8px_18px_rgba(0,0,0,0.5)] ring-1 ring-white/50"
          />
        </div>
        <div
          className={cn(
            "absolute left-1/2 top-0 z-[25] -translate-x-1/2",
            CARD_W_CLASS,
            CARD_H_CLASS
          )}
        >
          {stackBlock}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative shrink-0", CARD_W_CLASS, CARD_H_CLASS)}>{stackBlock}</div>
  );
}

function toggleAttackSelection(hand: Card[], selected: string[], id: string): string[] {
  const card = hand.find((c) => c.id === id);
  if (!card) return selected;
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length === 0) return [id];
  const firstRank = hand.find((c) => c.id === selected[0])?.rank;
  if (firstRank === card.rank) return [...selected, id];
  return [id];
}

function toggleTossSelection(
  hand: Card[],
  selected: string[],
  id: string,
  ranksOnTable: Set<Rank>
): string[] {
  const card = hand.find((c) => c.id === id);
  if (!card || !ranksOnTable.has(card.rank)) return selected;
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return [...selected, id];
}

export function DurakGame() {
  const [game, setGame] = useState<GameTable | null>(null);
  const [attackPick, setAttackPick] = useState<string[]>([]);
  const [tossPick, setTossPick] = useState<string[]>([]);
  const [defenseTargetAttackId, setDefenseTargetAttackId] = useState<string | null>(null);
  const [dealing, setDealing] = useState(false);

  useEffect(() => {
    setGame(newGame());
  }, []);

  useEffect(() => {
    if (!game?.id) return;
    setDealing(true);
    const ms = Math.ceil(12 * DEAL_STAGGER_SEC * 1000) + DEAL_BUFFER_MS;
    const t = window.setTimeout(() => setDealing(false), ms);
    return () => window.clearTimeout(t);
  }, [game?.id]);

  const human = game?.players.find((p) => p.type === "human");
  const bot = game?.players.find((p) => p.type === "bot");
  const humanHand = human?.hand ?? [];
  const deckCount = game?.deck.length ?? 0;
  const trumpShow = game?.trumpCard;

  const ranksOnTable = useMemo(() => {
    const s = new Set<Rank>();
    if (!game) return s;
    for (const tp of game.tablePairs) {
      s.add(tp.attack.rank);
      if (tp.defense) s.add(tp.defense.rank);
    }
    return s;
  }, [game]);

  const clearPicks = useCallback(() => {
    setAttackPick([]);
    setTossPick([]);
    setDefenseTargetAttackId(null);
  }, []);

  const restart = useCallback(() => {
    setGame(newGame());
    clearPicks();
  }, [clearPicks]);

  useEffect(() => {
    if (!game || game.state !== "playing" || dealing) return;
    if (game.phase === "player_can_throw_more") return;
    const botActs =
      (game.phase === "attack_initial" && game.players[game.attackerIndex]!.type === "bot") ||
      (game.phase === "defend" && game.players[game.defenderIndex]!.type === "bot") ||
      (game.phase === "attack_toss" && game.players[game.attackerIndex]!.type === "bot");
    if (!botActs) return;

    const t = window.setTimeout(() => {
      setGame((g) => {
        if (!g) return g;
        const next = applyBotMove(g);
        return next ?? g;
      });
    }, 420);
    return () => window.clearTimeout(t);
  }, [game, dealing]);

  const setErr = (msg: string) => setGame((g) => (g ? { ...g, message: msg } : g));

  const onAttackSubmit = () => {
    if (!game) return;
    const r = attackInitial(game, HUMAN_ID, attackPick);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    setAttackPick([]);
  };

  const humanIsAttacker = game ? game.players[game.attackerIndex]?.id === HUMAN_ID : false;
  const humanIsDefender = game ? game.players[game.defenderIndex]?.id === HUMAN_ID : false;

  const uncoveredPairs = game ? game.tablePairs.filter((tp) => tp.defense === null) : [];
  const effectiveDefenseAttackId =
    defenseTargetAttackId ??
    (uncoveredPairs.length === 1 ? uncoveredPairs[0]!.attack.id : null);

  const defendPair =
    game && effectiveDefenseAttackId
      ? game.tablePairs.find((tp) => tp.attack.id === effectiveDefenseAttackId && !tp.defense)
      : undefined;

  const defendPlayableFor = (c: Card): boolean => {
    if (!game || !humanIsDefender || game.phase !== "defend" || game.state !== "playing") return false;
    if (!defendPair) return false;
    return canBeat(defendPair.attack, c, game.trumpSuit);
  };

  const onDefendCard = (defenseId: string) => {
    if (!game) return;
    if (!effectiveDefenseAttackId) {
      setErr(
        uncoveredPairs.length > 1
          ? "Сначала нажмите на атаку на столе"
          : "Сейчас нечем отбиваться"
      );
      return;
    }
    const r = defendPlay(game, HUMAN_ID, effectiveDefenseAttackId, defenseId);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    setDefenseTargetAttackId(null);
  };

  const onTake = () => {
    if (!game) return;
    const r = defenderTake(game, HUMAN_ID);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    clearPicks();
  };

  const onBeat = () => {
    if (!game) return;
    if (game.phase === "player_can_throw_more") {
      const r = defenderTake(game, BOT_ID);
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setGame({ ...r.table, message: null });
      clearPicks();
      return;
    }
    const r = attackerBeat(game, HUMAN_ID);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    clearPicks();
  };

  const onTossSubmit = () => {
    if (!game) return;
    const r = attackToss(game, HUMAN_ID, tossPick);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    setTossPick([]);
  };

  const attackInitialValid =
    attackPick.length > 0 &&
    (() => {
      const cards = attackPick
        .map((id) => humanHand.find((c) => c.id === id))
        .filter((c): c is Card => c != null);
      const r0 = cards[0]?.rank;
      return r0 != null && cards.every((c) => c.rank === r0);
    })();

  const tossValid =
    !!game &&
    tossPick.length > 0 &&
    tossPick.every((id) => {
      const c = humanHand.find((x) => x.id === id);
      return c != null && ranksOnTable.has(c.rank);
    }) &&
    game.tablePairs.length + tossPick.length <= game.roundDefenderInitialHand;

  const phaseLine = (() => {
    if (!game) return "";
    if (dealing) return "Раздача карт…";
    if (game.state === "finished") return "Партия окончена";
    if (game.phase === "attack_initial")
      return humanIsAttacker ? "Ваш ход: атака" : "Противник атакует";
    if (game.phase === "defend")
      return humanIsDefender ? "Ваш ход: отбой или «Взять»" : "Противник отбивается";
    if (game.phase === "attack_toss")
      return humanIsAttacker ? "Подкините или «Бито»" : "Противник подкидывает";
    if (game.phase === "player_can_throw_more")
      return humanIsAttacker
        ? "Противник не бьётся — подкиньте или «Бито»"
        : "Ожидание подкидывания…";
    return "";
  })();

  const humanCanToss =
    !!game &&
    humanIsAttacker &&
    (game.phase === "attack_toss" || game.phase === "player_can_throw_more");

  if (!game) {
    return (
      <div
        className={`mx-auto flex max-h-[100dvh] min-h-0 max-w-lg flex-col overflow-x-hidden bg-[#14100c] px-2 pb-[max(5rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="text-sm text-white/50">Раздаём колоду…</span>
        </div>
      </div>
    );
  }

  const bh = bot?.hand ?? [];

  return (
    <div
      className={`mx-auto flex max-h-[100dvh] min-h-0 max-w-lg flex-col overflow-x-hidden bg-[#14100c] pb-[max(5rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
    >
      {game.message ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-2 rounded-xl border border-amber-500/35 bg-amber-950/50 px-3 py-2 text-center text-sm text-amber-100/95"
          role="status"
        >
          {game.message}
        </motion.div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1.5 [-webkit-overflow-scrolling:touch]">
        {/* Противник */}
        <section className="relative z-10 shrink-0 px-0 pt-0">
          <div className="flex items-end justify-between gap-2 px-1">
            <div>
              <p className="text-[13px] font-medium text-white/90">{bot?.name ?? "Бот"}</p>
              <p className="text-[10px] text-white/45">{bh.length} карт</p>
            </div>
          </div>
          <div className="relative mx-auto mt-2 flex h-[5.25rem] max-w-full items-end justify-center overflow-visible sm:mt-2.5 sm:h-[5.5rem]">
            {bh.map((c, i) => (
              <div key={c.id} className="absolute" style={handFanStyle(bh.length, i, "opponent")}>
                <motion.div
                  initial={{ opacity: 0, y: -52, scale: 0.82, rotate: -6 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{
                    delay: (2 * i + 1) * DEAL_STAGGER_SEC,
                    duration: DEAL_MOVE_SEC,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <CardSprite faceDown />
                </motion.div>
              </div>
            ))}
          </div>
        </section>

        {/* Сукно + колода + центр */}
        <div className="relative z-0 my-1 min-h-[min(44dvh,188px)] max-h-[46dvh] shrink-0 flex-1 rounded-[1.35rem] border-[6px] border-[#3d2814] bg-[#2a1a0e] shadow-[inset_0_2px_16px_rgba(0,0,0,0.45),0_12px_28px_rgba(0,0,0,0.45)] sm:min-h-[min(42dvh,200px)] sm:max-h-[44dvh] sm:rounded-[1.5rem] sm:border-[8px]">
          <div
            className="absolute inset-1.5 rounded-[1rem] sm:inset-2 sm:rounded-[1.15rem]"
            style={{
              background:
                "radial-gradient(ellipse 120% 90% at 50% 45%, #1a6b45 0%, #135a38 42%, #0d4028 100%)",
              boxShadow: "inset 0 0 80px rgba(0,0,0,0.35)",
            }}
          />

          <div className="relative z-[1] h-full min-h-0">
            <div className="pointer-events-none absolute right-2.5 top-2.5 z-[40] sm:right-3 sm:top-3">
              <DeckPile count={deckCount} trumpCard={trumpShow ?? null} />
            </div>

            <div className="absolute inset-2.5 z-10 flex min-h-0 flex-col overflow-hidden sm:inset-3">
              <p className="pointer-events-none shrink-0 py-1.5 text-center text-[10px] font-medium leading-snug text-emerald-100/75 sm:py-2 sm:text-[11px]">
                {phaseLine}
              </p>
              <div className="relative z-[15] flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-x-2.5 gap-y-3 px-1 pb-2 pt-2 sm:gap-x-3 sm:px-2 sm:pt-2.5">
                {game.tablePairs.length === 0 ? (
                  <span className="text-sm text-emerald-200/35">
                    {dealing ? "Карты раздаются…" : "Ждите ход"}
                  </span>
                ) : (
                  game.tablePairs.map((tp) => {
                    const uncovered = tp.defense === null;
                    const humanMustDefend = humanIsDefender && game.phase === "defend" && uncovered;
                    const attackSelectedForDefense =
                      humanMustDefend && defenseTargetAttackId === tp.attack.id;
                    const highlightUnbeaten =
                      uncovered && (game.phase === "defend" || game.phase === "player_can_throw_more");

                    return (
                      <div key={tp.attack.id} className="relative flex flex-col items-center gap-0.5">
                        <div className="relative h-[5.4rem] w-[3.65rem] sm:h-[5.7rem] sm:w-[4rem]">
                          <motion.div
                            className="absolute bottom-0 left-1/2 -translate-x-1/2"
                            initial={{ opacity: 0, y: 56, scale: 0.86, rotate: -2.5 }}
                            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <CardSprite
                              card={tp.attack}
                              selected={!!attackSelectedForDefense}
                              disabled={false}
                              className={
                                highlightUnbeaten
                                  ? "ring-[3px] ring-amber-300/85 ring-offset-0 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                                  : undefined
                              }
                              onPress={
                                humanMustDefend
                                  ? () => {
                                      setDefenseTargetAttackId((prev) =>
                                        prev === tp.attack.id ? null : tp.attack.id
                                      );
                                      setGame((g) => (g ? { ...g, message: null } : g));
                                    }
                                  : undefined
                              }
                            />
                          </motion.div>

                          {tp.defense ? (
                            <motion.div
                              className="absolute bottom-1 left-1/2 z-20 -translate-x-[42%]"
                              initial={{ opacity: 0, y: -48, x: 8, scale: 0.88, rotate: -4 }}
                              animate={{ opacity: 1, y: -12, x: 5, scale: 1, rotate: 2 }}
                              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                            >
                              <CardSprite card={tp.defense} />
                            </motion.div>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "text-[8px] font-semibold uppercase tracking-wide sm:text-[9px]",
                            tp.defense ? "text-emerald-200/55" : "text-amber-200/80"
                          )}
                        >
                          {tp.defense ? "Отбито" : "Атака"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-20 mt-0.5 flex shrink-0 flex-wrap items-center justify-center gap-1.5 px-0.5 py-1">
          <button
            type="button"
            onClick={restart}
            className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 shadow-md backdrop-blur-sm hover:bg-white/15 sm:px-4 sm:text-sm"
          >
            Новая игра
          </button>
          {humanIsDefender && (game.phase === "defend" || game.phase === "attack_toss") ? (
            <button
              type="button"
              onClick={onTake}
              disabled={game.state !== "playing"}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 shadow-md hover:bg-white/15 disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              Взять
            </button>
          ) : null}
          {humanCanToss ? (
            <button
              type="button"
              onClick={onBeat}
              disabled={game.state !== "playing"}
              className="rounded-full border border-emerald-400/45 bg-emerald-900/50 px-3 py-2 text-xs font-medium text-emerald-50 shadow-md hover:bg-emerald-800/50 disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              Бито
            </button>
          ) : null}
          {humanIsAttacker && game.phase === "attack_initial" ? (
            <button
              type="button"
              onClick={onAttackSubmit}
              disabled={!attackInitialValid || game.state !== "playing"}
              className="rounded-full border border-amber-400/55 bg-amber-900/45 px-3 py-2 text-xs font-medium text-amber-50 shadow-md hover:bg-amber-800/45 disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              Атаковать
            </button>
          ) : null}
          {humanCanToss && tossPick.length > 0 ? (
            <button
              type="button"
              onClick={onTossSubmit}
              disabled={!tossValid || game.state !== "playing"}
              className="rounded-full border border-amber-400/55 bg-amber-900/45 px-3 py-1.5 text-[11px] font-medium text-amber-50 shadow-sm hover:bg-amber-800/45 disabled:opacity-40 sm:px-4 sm:py-2 sm:text-xs"
            >
              Подкинуть
            </button>
          ) : null}
        </div>
      </div>

      {/* Вне overflow-y-auto: иначе веер обрезается (видна была только «верхушка» карт). */}
      <section className="relative z-[25] -mb-[5.25rem] shrink-0 px-1.5 pb-0 pt-0 sm:-mb-[6.75rem]">
        <div className="mb-0 flex items-center justify-between px-1">
          <div>
            <p className="text-[13px] font-medium text-white/90">{human?.name ?? "Вы"}</p>
            <p className="text-[10px] text-white/45">{humanHand.length} карт</p>
          </div>
        </div>
        <div className="relative mx-auto mt-3 flex h-[13.5rem] max-w-full items-end justify-center overflow-visible sm:mt-4 sm:h-[16rem]">
          {humanHand.map((c, i) => {
            const selAttack =
              game.phase === "attack_initial" && humanIsAttacker && attackPick.includes(c.id);
            const selToss = humanCanToss && tossPick.includes(c.id);

            const attackPlayable =
              humanIsAttacker && game.phase === "attack_initial" && game.state === "playing";

            const tossPlayable = humanCanToss && game.state === "playing" && ranksOnTable.has(c.rank);

            const defendPlayable = defendPlayableFor(c);

            let playable = false;
            if (game.state === "playing" && !dealing) {
              if (humanIsAttacker && game.phase === "attack_initial") playable = attackPlayable;
              else if (humanCanToss) playable = tossPlayable;
              else if (humanIsDefender && game.phase === "defend") playable = defendPlayable;
            }

            const selected = selAttack || selToss;

            const onPress =
              humanIsAttacker && game.phase === "attack_initial"
                ? () => {
                    if (!attackPlayable) return;
                    setAttackPick((p) => toggleAttackSelection(humanHand, p, c.id));
                    setGame((g) => (g ? { ...g, message: null } : g));
                  }
                : humanCanToss
                  ? () => {
                      if (!tossPlayable) return;
                      setTossPick((p) => toggleTossSelection(humanHand, p, c.id, ranksOnTable));
                      setGame((g) => (g ? { ...g, message: null } : g));
                    }
                  : humanIsDefender && game.phase === "defend"
                    ? () => {
                        if (!defendPlayable) return;
                        onDefendCard(c.id);
                      }
                    : undefined;

            const fan = handFanStyle(humanHand.length, i, "player");

            return (
              <div key={c.id} className="absolute" style={fan}>
                <motion.div
                  initial={{ opacity: 0, y: 72, scale: 0.82, rotate: 5 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{
                    delay: 2 * i * DEAL_STAGGER_SEC,
                    duration: DEAL_MOVE_SEC,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <motion.div
                    animate={{ y: selected ? -40 : 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 26 }}
                  >
                    <CardSprite
                      card={c}
                      size="hand"
                      selected={selected}
                      disabled={false}
                      playableHighlight={
                        game.state === "playing" &&
                        !dealing &&
                        playable &&
                        (game.phase === "defend" ||
                          game.phase === "attack_initial" ||
                          game.phase === "attack_toss" ||
                          game.phase === "player_can_throw_more")
                      }
                      onPress={onPress}
                    />
                  </motion.div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {game.state === "finished" ? (
          <motion.div
            key="durak-win-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="durak-result-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {game.winnerId === HUMAN_ID ? <WinConfetti /> : null}
            <motion.div
              id="durak-result-panel"
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-white/20 bg-[#14100c] px-7 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            >
              <p id="durak-result-title" className="text-xl font-bold leading-tight text-white sm:text-2xl">
                {game.winnerId === HUMAN_ID ? "🔥 Вы выиграли" : "Вы в пролёте"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {game.loserId === HUMAN_ID
                  ? "Дурак — вы остались с картами."
                  : game.winnerId === HUMAN_ID
                    ? "Противник остался с картами."
                    : ""}
              </p>
              <button
                type="button"
                onClick={restart}
                className="mt-7 rounded-full bg-white px-8 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-emerald-50"
              >
                Сыграть ещё
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
