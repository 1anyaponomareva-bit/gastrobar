"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, GameTable, Player, Rank } from "@/games/durak/types";
import {
  attackInitial,
  attackToss,
  attackerBeat,
  defendPlay,
  defenderCannotBeat,
  defenderTake,
} from "@/games/durak/engine";
import { applyBotMove } from "@/games/durak/bot";
import { canBeat } from "@/games/durak/cards";
import { CARD_BACK_URL } from "@/lib/durak/cardAssets";
import { CardFaceArt } from "@/components/durak/CardFaceArt";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { DurakOnlineMatchmaking } from "@/components/durak/DurakOnlineMatchmaking";
import { DurakOnlineGame } from "@/components/durak/DurakOnlineGame";

const HUMAN_ID = "human";

const PLAYER_NAME_LS = "player_name";
/** Имя при нажатии «Пропустить» (сохраняется в localStorage, как обычное имя). */
const GUEST_PLAYER_NAME = "Гость";

function normalizePlayerNameInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return [...t].slice(0, 12).join("");
}

export type DurakGameEmbeddedProps = {
  roomId: string;
  localPlayerId: string;
  playerName: string;
  game: GameTable;
  /** Как setState: функция получает актуальный стол родителя, а не снимок `embedded.game` с прошлого рендера. */
  onGameChange: (update: SetStateAction<GameTable>) => void;
  onLeave: () => void;
};

type DurakGameRootProps = {
  embedded?: DurakGameEmbeddedProps;
};

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

/**
 * Задержка перед ходом бота: не фиксированная, чтобы не было ощущения «машины».
 * ~45% быстрый ответ, ~35% нормальная пауза, ~20% подольше «думает».
 */
function randomBotThinkDelayMs(): number {
  const r = Math.random();
  if (r < 0.2) {
    return Math.round(1700 + Math.random() * 2600);
  }
  if (r < 0.55) {
    return Math.round(580 + Math.random() * 920);
  }
  return Math.round(260 + Math.random() * 540);
}

const CARD_W_CLASS = "w-[3.65rem] sm:w-[4.05rem]";
const CARD_H_CLASS = "h-[5.15rem] sm:h-[5.7rem]";
/** Компактные карты в центре овального стола на узком экране */
const CARD_TABLE_COMPACT_W = "w-[2.85rem] sm:w-[3.65rem]";
const CARD_TABLE_COMPACT_H = "h-[4.05rem] sm:h-[5.15rem]";
/** Рубашки у соперников вокруг стола */
const OPP_HAND_W = "w-[2.25rem] sm:w-[2.55rem]";
const OPP_HAND_H = "h-[3.2rem] sm:h-[3.55rem]";
/** Максимально крупная рука, поднята выше к столу (z ниже BottomNav). */
const HAND_CARD_W_CLASS = "w-[8.15rem] sm:w-[9.15rem]";
const HAND_CARD_H_CLASS = "h-[11.2rem] sm:h-[12.45rem]";

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
  const tx = rel * (n > 8 ? 20.5 : 25.5);
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

/** Соперники по часовой стрелке от «меня» внизу — как рассадка за столом. */
function opponentsClockwiseFromLocal(game: GameTable, localId: string): Player[] {
  const idx = game.players.findIndex((p) => p.id === localId);
  if (idx < 0) return game.players.filter((p) => p.id !== localId);
  const out: Player[] = [];
  for (let k = 1; k < game.players.length; k++) {
    out.push(game.players[(idx + k) % game.players.length]!);
  }
  return out;
}

/**
 * Рассадка вокруг круглого стола (вы внизу за экраном).
 * `fanTowardCenterDeg` — поворот веера рубашек к центру, как в референсе.
 */
function opponentSeatOnCircle(
  count: number,
  index: number
): { wrapClass: string; fanTowardCenterDeg: number } {
  const n = Math.min(5, Math.max(1, count));
  const i = Math.min(index, n - 1);
  if (n === 1) {
    return { wrapClass: "left-1/2 top-[4%] z-30 -translate-x-1/2", fanTowardCenterDeg: 0 };
  }
  if (n === 2) {
    return i === 0
      ? { wrapClass: "left-[0%] top-[8%] z-30 sm:left-[1%]", fanTowardCenterDeg: 24 }
      : { wrapClass: "right-[0%] top-[8%] z-30 sm:right-[1%]", fanTowardCenterDeg: -24 };
  }
  if (n === 3) {
    if (i === 0) return { wrapClass: "left-[0%] top-[10%] z-30 sm:left-[0%]", fanTowardCenterDeg: 32 };
    if (i === 1)
      return { wrapClass: "left-1/2 top-[2%] z-30 -translate-x-1/2", fanTowardCenterDeg: 0 };
    return { wrapClass: "right-[0%] top-[10%] z-30 sm:right-[0%]", fanTowardCenterDeg: -32 };
  }
  if (n === 4) {
    const seats: { wrapClass: string; fanTowardCenterDeg: number }[] = [
      { wrapClass: "left-[0%] top-[12%] z-30 sm:left-[2%]", fanTowardCenterDeg: 38 },
      { wrapClass: "left-[18%] top-[4%] z-30", fanTowardCenterDeg: 14 },
      { wrapClass: "right-[18%] top-[4%] z-30", fanTowardCenterDeg: -14 },
      { wrapClass: "right-[0%] top-[12%] z-30 sm:right-[2%]", fanTowardCenterDeg: -38 },
    ];
    return seats[i]!;
  }
  const seats5: { wrapClass: string; fanTowardCenterDeg: number }[] = [
    { wrapClass: "left-[4%] top-[14%] z-30", fanTowardCenterDeg: 42 },
    { wrapClass: "left-[20%] top-[6%] z-30", fanTowardCenterDeg: 18 },
    { wrapClass: "left-1/2 top-[2%] z-30 -translate-x-1/2", fanTowardCenterDeg: 0 },
    { wrapClass: "right-[20%] top-[6%] z-30", fanTowardCenterDeg: -18 },
    { wrapClass: "right-[4%] top-[14%] z-30", fanTowardCenterDeg: -42 },
  ];
  return seats5[i]!;
}

/** Компактный веер рубашек у соперника. */
function opponentTableFanStyle(n: number, i: number): React.CSSProperties {
  if (n <= 0) return {};
  const mid = (n - 1) / 2;
  const rel = i - mid;
  const spread = n <= 1 ? 0 : Math.min(20 / Math.max(1, n - 1), 6);
  const rot = rel * spread;
  const tx = rel * (n > 8 ? 9 : 11);
  const curve = Math.abs(rel) * 1.8;
  return {
    left: "50%",
    bottom: 0,
    transform: `translate(calc(-50% + ${tx}px), ${curve}px) rotate(${rot}deg)`,
    transformOrigin: "bottom center",
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
  /** `hand` — рука внизу; `tableCompact` — центр стола на телефоне; `opponent` — рубашки у соперников. */
  size?: "table" | "hand" | "tableCompact" | "opponent";
}) {
  const isBack = faceDown || !card;
  const dimW =
    size === "hand"
      ? HAND_CARD_W_CLASS
      : size === "tableCompact"
        ? CARD_TABLE_COMPACT_W
        : size === "opponent"
          ? OPP_HAND_W
          : CARD_W_CLASS;
  const dimH =
    size === "hand"
      ? HAND_CARD_H_CLASS
      : size === "tableCompact"
        ? CARD_TABLE_COMPACT_H
        : size === "opponent"
          ? OPP_HAND_H
          : CARD_H_CLASS;

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

function DeckPile({
  count,
  trumpCard,
  compact,
}: {
  count: number;
  trumpCard: Card | null;
  /** Меньшая колода у края овального стола */
  compact?: boolean;
}) {
  const stackLayers = count > 0 ? Math.min(8, Math.max(2, Math.ceil(count / 5))) : 0;
  const cw = compact ? CARD_TABLE_COMPACT_W : CARD_W_CLASS;
  const ch = compact ? CARD_TABLE_COMPACT_H : CARD_H_CLASS;
  const size = compact ? ("tableCompact" as const) : ("table" as const);

  const stackBlock = (
    <>
      {count > 0
        ? Array.from({ length: stackLayers }).map((_, i) => (
            <div
              key={i}
              className="absolute overflow-visible"
              style={{
                right: `${i * (compact ? 0.85 : 1.15)}px`,
                top: `${i * (compact ? 0.85 : 1)}px`,
                zIndex: 30 + i,
              }}
            >
              <CardSprite
                faceDown
                size={size}
                className="shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
              />
            </div>
          ))
        : null}
      {count === 0 && !trumpCard ? (
        <div className="flex h-full w-full items-center justify-center">
          <div
            className={cn(
              "flex items-center justify-center rounded-[10px] border border-dashed border-emerald-700/45 bg-black/30 text-[8px] text-emerald-200/55 sm:text-[10px]",
              cw,
              ch
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
    /* Козырь сильнее выглядывает из-под стопки: стопка чуть выше, козырь ниже + больший min-height */
    const trumpShift = compact ? "translate-y-4 sm:translate-y-5" : "translate-y-5 sm:translate-y-6";
    const stackLift = compact ? "-top-1" : "-top-0.5";
    return (
      <div
        className={cn(
          "relative shrink-0",
          cw,
          compact ? "min-h-[6.75rem] sm:min-h-[9.5rem]" : "min-h-[9.85rem] sm:min-h-[10.75rem]"
        )}
      >
        <div className={cn("absolute bottom-0 left-1/2 z-[1] -translate-x-1/2", trumpShift)}>
          <CardSprite
            card={trumpCard}
            size={size}
            className="shadow-[0_8px_18px_rgba(0,0,0,0.5)] ring-2 ring-amber-200/80"
          />
        </div>
        <div
          className={cn(
            "absolute left-1/2 z-[25] -translate-x-1/2",
            stackLift,
            cw,
            ch
          )}
        >
          {stackBlock}
        </div>
      </div>
    );
  }

  return <div className={cn("relative shrink-0", cw, ch)}>{stackBlock}</div>;
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

function DurakNameGate({
  onSubmit,
  onSkip,
}: {
  onSubmit: (name: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState("");
  const [showError, setShowError] = useState(false);

  const submit = () => {
    const n = normalizePlayerNameInput(value);
    if (!n) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmit(n);
  };

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto",
        HEADER_OFFSET_TOP
      )}
      style={{
        background:
          "radial-gradient(ellipse 85% 70% at 50% 20%, rgba(26, 107, 69, 0.14) 0%, transparent 52%), #14100c",
      }}
    >
      <div className="flex min-h-[min(100%,32rem)] flex-1 flex-col items-center justify-center px-4 py-8 sm:min-h-0 sm:py-10">
        <div
          className={cn(
            "w-full max-w-[min(100%,20rem)] rounded-[1.35rem] border border-white/[0.09] bg-gradient-to-b from-[#1e1814] via-[#17110e] to-[#120e0b]",
            "p-6 shadow-[0_28px_90px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] sm:max-w-sm sm:rounded-3xl sm:p-8",
            "ring-1 ring-black/40"
          )}
        >
          <div className="mb-5 flex flex-col items-center gap-2 text-center sm:mb-6">
            <span
              className="rounded-full border border-[#f8d66d]/35 bg-[#f8d66d]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f8d66d]/95"
              aria-hidden
            >
              Подкидной дурак
            </span>
            <h1 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-white sm:text-2xl">
              Как тебя называть за столом?
            </h1>
            <p className="text-[13px] leading-relaxed text-white/50 sm:text-sm">
              До 12 символов — или зайди как гость и назовись потом в игре.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={value}
              maxLength={12}
              autoComplete="nickname"
              placeholder="Например, Аня"
              onChange={(e) => {
                setValue(e.target.value);
                setShowError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className={cn(
                "w-full rounded-xl border border-white/[0.12] bg-black/35 px-4 py-3.5 text-center text-[15px] text-white placeholder:text-white/30",
                "shadow-inner outline-none transition",
                "focus:border-[#f8d66d]/45 focus:ring-2 focus:ring-[#f8d66d]/20"
              )}
            />
            {showError ? (
              <p className="text-center text-[13px] text-amber-200/90">Введи имя или нажми «Пропустить»</p>
            ) : null}

            <button
              type="button"
              onClick={submit}
              className={cn(
                "w-full rounded-full py-3.5 text-[15px] font-semibold shadow-lg transition",
                "bg-[#f8d66d] text-[#1a1612] hover:brightness-105 active:scale-[0.99]",
                "shadow-[0_8px_28px_rgba(248,214,109,0.28)]"
              )}
            >
              Начать игру
            </button>

            <button
              type="button"
              onClick={onSkip}
              className="w-full rounded-full border border-white/[0.14] bg-white/[0.04] py-3 text-[13px] font-medium text-white/65 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white/90"
            >
              Пропустить — играть как гость
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DurakGame(props: DurakGameRootProps = {}) {
  const router = useRouter();
  const embedded = props.embedded;
  const localPlayerId = embedded?.localPlayerId ?? HUMAN_ID;

  const [nameHydrated, setNameHydrated] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const displayName = embedded?.playerName ?? playerName;
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null);
  const [tableGreeting, setTableGreeting] = useState<string | null>(null);

  const onRoomPlayingStable = useCallback((id: string) => {
    setOnlineRoomId(id);
  }, []);
  const onLeaveOnlineRoomStable = useCallback(() => {
    setOnlineRoomId(null);
  }, []);
  const onMatchmakingCancelStable = useCallback(() => {
    router.push("/");
  }, [router]);
  const renderEmbeddedGame = useCallback(
    (embedded: DurakGameEmbeddedProps) => <DurakGame embedded={embedded} />,
    []
  );

  const game = embedded?.game ?? null;
  const setGame = useCallback(
    (updater: SetStateAction<GameTable | null>) => {
      const e = props.embedded;
      if (!e) return;
      e.onGameChange(updater as SetStateAction<GameTable>);
    },
    [props.embedded]
  );
  const [attackPick, setAttackPick] = useState<string[]>([]);
  const [tossPick, setTossPick] = useState<string[]>([]);
  const [defenseTargetAttackId, setDefenseTargetAttackId] = useState<string | null>(null);
  const [dealing, setDealing] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const skipNameBlurCommitRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYER_NAME_LS);
      setPlayerName(normalizePlayerNameInput(raw ?? ""));
    } finally {
      setNameHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!game?.id) return;
    setDealing(true);
    const ms = Math.ceil(12 * DEAL_STAGGER_SEC * 1000) + DEAL_BUFFER_MS;
    const t = window.setTimeout(() => setDealing(false), ms);
    return () => window.clearTimeout(t);
  }, [game?.id]);

  const selfPlayer = game?.players.find((p) => p.id === localPlayerId);
  const opponents = useMemo(
    () => (game ? opponentsClockwiseFromLocal(game, localPlayerId) : []),
    [game, localPlayerId]
  );
  const humanHand = selfPlayer?.hand ?? [];
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

  /** Онлайн: ходы бота считает только первый живой игрок по кругу — иначе два клиента вызывают applyBotMove и затирают room_state. */
  const onlineBotDriverId = useMemo(() => {
    if (!game) return null;
    const firstLive = game.players.find((p) => p.type !== "bot");
    return firstLive?.id ?? null;
  }, [game]);

  const clearPicks = useCallback(() => {
    setAttackPick([]);
    setTossPick([]);
    setDefenseTargetAttackId(null);
  }, []);

  const restart = useCallback(() => {
    if (props.embedded) {
      props.embedded.onLeave();
    }
  }, [props.embedded]);

  const commitNameEdit = useCallback(() => {
    const n = normalizePlayerNameInput(nameDraft);
    if (!n) {
      setNameEditing(false);
      return;
    }
    try {
      localStorage.setItem(PLAYER_NAME_LS, n);
    } catch {
      /* ignore */
    }
    setPlayerName(n);
    setGame((g) => {
      if (!g) return g;
      return {
        ...g,
        players: g.players.map((p) =>
          p.id === localPlayerId ? { ...p, name: n } : p
        ),
      };
    });
    setNameEditing(false);
  }, [nameDraft]);

  const cancelNameEdit = useCallback(() => {
    skipNameBlurCommitRef.current = true;
    setNameEditing(false);
    window.setTimeout(() => {
      skipNameBlurCommitRef.current = false;
    }, 0);
  }, []);

  const startNameEdit = useCallback(() => {
    const d = selfPlayer?.name ?? playerName;
    setNameDraft(d);
    setNameEditing(true);
  }, [selfPlayer?.name, playerName]);

  useEffect(() => {
    if (!nameEditing) return;
    const el = nameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [nameEditing]);

  const onPlayerNameChosen = useCallback((name: string) => {
    const n = normalizePlayerNameInput(name);
    if (!n) return;
    try {
      localStorage.setItem(PLAYER_NAME_LS, n);
    } catch {
      /* ignore */
    }
    setTableGreeting(`За столом: ${n}`);
    window.setTimeout(() => setTableGreeting(null), 2800);
    setPlayerName(n);
  }, []);

  const onSkipNameAsGuest = useCallback(() => {
    try {
      localStorage.setItem(PLAYER_NAME_LS, GUEST_PLAYER_NAME);
    } catch {
      /* ignore */
    }
    setPlayerName(GUEST_PLAYER_NAME);
  }, []);

  useEffect(() => {
    if (!game || game.state !== "playing" || dealing) return;
    if (game.phase === "player_can_throw_more") return;
    if (
      embedded &&
      onlineBotDriverId != null &&
      localPlayerId !== onlineBotDriverId
    ) {
      return;
    }
    const attacker = game.players[game.attackerIndex];
    const defender = game.players[game.defenderIndex];
    if (!attacker || !defender) return;
    const botActs =
      (game.phase === "attack_initial" && attacker.type === "bot") ||
      (game.phase === "defend" && defender.type === "bot") ||
      (game.phase === "attack_toss" && attacker.type === "bot");
    if (!botActs) return;

    const t = window.setTimeout(() => {
      setGame((g) => {
        if (!g) return g;
        const next = applyBotMove(g);
        return next ?? g;
      });
    }, randomBotThinkDelayMs());
    return () => window.clearTimeout(t);
  }, [game, dealing, embedded, localPlayerId, onlineBotDriverId]);

  const setErr = (msg: string) => setGame((g) => (g ? { ...g, message: msg } : g));

  const onAttackSubmit = () => {
    if (!game) return;
    const r = attackInitial(game, localPlayerId, attackPick);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    setAttackPick([]);
  };

  const selfIsAttacker = game ? game.players[game.attackerIndex]?.id === localPlayerId : false;
  const selfIsDefender = game ? game.players[game.defenderIndex]?.id === localPlayerId : false;

  const uncoveredPairs = game ? game.tablePairs.filter((tp) => tp.defense === null) : [];
  const effectiveDefenseAttackId =
    defenseTargetAttackId ??
    (uncoveredPairs.length === 1 ? uncoveredPairs[0]!.attack.id : null);

  const defendPair =
    game && effectiveDefenseAttackId
      ? game.tablePairs.find((tp) => tp.attack.id === effectiveDefenseAttackId && !tp.defense)
      : undefined;

  const defendPlayableFor = (c: Card): boolean => {
    if (!game || !selfIsDefender || game.phase !== "defend" || game.state !== "playing") return false;
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
    const r = defendPlay(game, localPlayerId, effectiveDefenseAttackId, defenseId);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    setDefenseTargetAttackId(null);
  };

  const onTake = () => {
    if (!game) return;
    /* В защите «Взять» = отказ отбиваться: сначала фаза подкидывания для атакующего, затем «Бито» забирает стол. */
    if (game.phase === "defend") {
      const r = defenderCannotBeat(game, localPlayerId);
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setGame({ ...r.table, message: null });
      clearPicks();
      return;
    }
    const r = defenderTake(game, localPlayerId);
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
      const defPl = game.players[game.defenderIndex];
      if (!defPl) return;
      const r = defenderTake(game, defPl.id);
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setGame({ ...r.table, message: null });
      clearPicks();
      return;
    }
    const r = attackerBeat(game, localPlayerId);
    if ("error" in r) {
      setErr(r.error);
      return;
    }
    setGame({ ...r.table, message: null });
    clearPicks();
  };

  const onTossSubmit = () => {
    if (!game) return;
    const r = attackToss(game, localPlayerId, tossPick);
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
    const selfName = selfPlayer?.name ?? displayName;
    const attackerName = game.players[game.attackerIndex]?.name ?? "Игрок";
    const defenderName = game.players[game.defenderIndex]?.name ?? "Игрок";
    if (dealing) return "Раздача карт…";
    if (game.state === "finished") return "Партия окончена";
    if (game.phase === "attack_initial")
      return selfIsAttacker ? `${selfName}, ваш ход: атака` : `${attackerName} атакует`;
    if (game.phase === "defend")
      return selfIsDefender ? `${selfName}, ваш ход: отбой или «Взять»` : `${defenderName} отбивается`;
    if (game.phase === "attack_toss")
      return selfIsAttacker ? "Подкините или «Бито»" : `${attackerName} подкидывает`;
    if (game.phase === "player_can_throw_more")
      return selfIsAttacker
        ? `${defenderName} не бьётся — подкиньте или «Бито»`
        : `${attackerName} подкидывает…`;
    return "";
  })();

  const selfCanToss =
    !!game &&
    selfIsAttacker &&
    (game.phase === "attack_toss" || game.phase === "player_can_throw_more");

  if (!nameHydrated) {
    return (
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-2 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="text-sm text-white/50">Загрузка…</span>
        </div>
      </div>
    );
  }

  if (!embedded && !playerName) {
    return <DurakNameGate onSubmit={onPlayerNameChosen} onSkip={onSkipNameAsGuest} />;
  }

  if (!embedded) {
    if (!onlineRoomId) {
      return (
        <DurakOnlineMatchmaking
          playerName={playerName}
          onRoomPlaying={onRoomPlayingStable}
          onCancel={onMatchmakingCancelStable}
        />
      );
    }
    return (
      <DurakOnlineGame
        roomId={onlineRoomId}
        playerName={playerName}
        onLeave={onLeaveOnlineRoomStable}
        renderGame={renderEmbeddedGame}
      />
    );
  }

  if (!game) {
    return (
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-2 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="text-sm text-white/50">Раздаём колоду…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-h-0 flex-col bg-[#14100c] text-slate-100",
        /* В /durak стол уже под общим Header + BottomNav — заполняем flex-1, без второго pt и без лишней высоты. */
        embedded
          ? "flex-1 basis-0 min-h-[280px] overflow-x-hidden overflow-y-auto"
          : cn("flex-1 min-h-0 overflow-hidden", HEADER_OFFSET_TOP),
        "pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))]"
      )}
    >
      <div className="shrink-0 space-y-0.5 px-2 pb-0.5 pt-0.5">
        {tableGreeting ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/55 px-2 py-1 text-center text-[11px] font-medium text-emerald-100"
            role="status"
          >
            {tableGreeting}
          </motion.div>
        ) : null}
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-[min(100%,520px)] flex-1 flex-col justify-end items-center px-0.5 pt-0 pb-1">
        <div
          className="relative max-w-full shrink-0 overflow-visible rounded-full"
          style={{
            width: "min(88vw, 24rem, 72vmin)",
            aspectRatio: "1",
          }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-full bg-black/30 shadow-[0_14px_36px_rgba(0,0,0,0.55)]" />

          <div
            className="pointer-events-none absolute inset-[2%] rounded-full border-[2px] border-[#5a9a6a]/90 sm:border-[3px] sm:border-[#6dae7e]"
            style={{
              background:
                "radial-gradient(ellipse 92% 88% at 50% 42%, #2d6b45 0%, #245538 22%, #1a3d28 52%, #0f2418 78%, #081810 100%)",
              boxShadow:
                "inset 0 0 56px rgba(0,0,0,0.42), inset 0 2px 3px rgba(255,255,255,0.14)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-[5%] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 34%, rgba(180,220,160,0.16) 0%, transparent 55%)",
            }}
          />

          {opponents.map((opp, oi) => {
            const bh = opp.hand;
            const seat = opponentSeatOnCircle(opponents.length, oi);
            return (
              <div
                key={opp.id}
                className={cn(
                  "absolute flex max-w-[46%] flex-col items-center gap-1 sm:max-w-[42%]",
                  seat.wrapClass
                )}
              >
                <div className="max-w-full px-0.5 text-center leading-tight">
                  <p className="truncate text-[10px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:text-[11px]">
                    {opp.name}
                  </p>
                  <p className="text-[9px] text-white/55">{bh.length} карт</p>
                </div>
                <div
                  className="relative flex h-[2.85rem] w-[4.75rem] items-end justify-center overflow-visible sm:h-[3.2rem] sm:w-[5.1rem]"
                  style={{
                    transform: `rotate(${seat.fanTowardCenterDeg}deg)`,
                    transformOrigin: "center bottom",
                  }}
                >
                  {bh.map((c, i) => (
                    <div key={c.id} className="absolute" style={opponentTableFanStyle(bh.length, i)}>
                      <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          delay: (2 * i + 1) * DEAL_STAGGER_SEC,
                          duration: DEAL_MOVE_SEC,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <CardSprite faceDown size="opponent" />
                      </motion.div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="absolute inset-[8%] z-10 min-h-0 overflow-visible">
            <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-visible">
              <div className="pointer-events-auto absolute left-[0.5%] top-1/2 z-20 -translate-y-1/2 sm:left-[2%]">
                <DeckPile count={deckCount} trumpCard={trumpShow ?? null} compact />
              </div>
              <div className="mx-auto flex max-h-none min-h-0 w-[min(100%,18rem)] max-w-[78%] flex-wrap content-center items-center justify-center gap-x-1.5 gap-y-2 overflow-visible px-[2%] py-1 sm:w-[min(100%,20rem)] sm:max-w-[75%] sm:gap-x-2 sm:gap-y-2.5 sm:px-[3%]">
              {game.tablePairs.length === 0 ? (
                <span className="text-center text-[10px] text-white/35 sm:text-[11px]">
                  {dealing ? "Карты раздаются…" : "Ждите ход"}
                </span>
              ) : (
                game.tablePairs.map((tp) => {
                  const uncovered = tp.defense === null;
                  const humanMustDefend = selfIsDefender && game.phase === "defend" && uncovered;
                  const attackSelectedForDefense =
                    humanMustDefend && defenseTargetAttackId === tp.attack.id;
                  const highlightUnbeaten =
                    uncovered && (game.phase === "defend" || game.phase === "player_can_throw_more");

                  return (
                    <div key={tp.attack.id} className="relative flex flex-col items-center">
                      <div className="relative h-[4.55rem] w-[3rem] overflow-visible sm:h-[5.65rem] sm:w-[3.95rem]">
                        <motion.div
                          className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2"
                          initial={false}
                          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <CardSprite
                            card={tp.attack}
                            size="tableCompact"
                            selected={!!attackSelectedForDefense}
                            disabled={false}
                            className={
                              highlightUnbeaten
                                ? "ring-[2px] ring-amber-300/90 ring-offset-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)] sm:ring-[3px]"
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
                            className="absolute bottom-0.5 left-1/2 z-20 -translate-x-[42%]"
                            initial={false}
                            animate={{ opacity: 1, y: -10, x: 4, scale: 1, rotate: 2 }}
                            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                          >
                            <CardSprite card={tp.defense} size="tableCompact" />
                          </motion.div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-0 bg-[#0f0c0a]/90 px-1 pt-1 shadow-[0_-6px_20px_rgba(0,0,0,0.25)] backdrop-blur-md sm:px-2">
        <div className="relative z-20 grid w-full min-w-0 grid-cols-2 items-center gap-x-1.5 gap-y-1 px-0.5 sm:gap-x-3">
          <div className="flex min-w-0 justify-center">
            <button
              type="button"
              onClick={restart}
              className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[10px] font-medium text-white/90 shadow-md backdrop-blur-sm hover:bg-white/15 sm:px-3 sm:py-2 sm:text-[11px]"
            >
              Новая игра
            </button>
          </div>
          <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-x-0.5 sm:gap-x-2">
            <span className="min-w-0 shrink" aria-hidden />
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
              {selfIsAttacker && game.phase === "attack_initial" ? (
                <button
                  type="button"
                  onClick={onAttackSubmit}
                  disabled={!attackInitialValid || game.state !== "playing"}
                  className="shrink-0 rounded-full border border-amber-400/55 bg-amber-900/45 px-2 py-1.5 text-[10px] font-medium text-amber-50 shadow-md hover:bg-amber-800/45 disabled:opacity-40 sm:px-3 sm:text-[11px]"
                >
                  Атаковать
                </button>
              ) : null}
              {selfCanToss && tossPick.length > 0 ? (
                <button
                  type="button"
                  onClick={onTossSubmit}
                  disabled={!tossValid || game.state !== "playing"}
                  className="shrink-0 rounded-full border border-amber-400/55 bg-amber-900/45 px-1.5 py-1 text-[9px] font-medium text-amber-50 shadow-sm hover:bg-amber-800/45 disabled:opacity-40 sm:px-2.5 sm:text-[10px]"
                >
                  Подкинуть
                </button>
              ) : null}
              {selfCanToss ? (
                <button
                  type="button"
                  onClick={onBeat}
                  disabled={game.state !== "playing"}
                  className="shrink-0 rounded-full border border-emerald-400/45 bg-emerald-900/50 px-2 py-1.5 text-[10px] font-medium text-emerald-50 shadow-md hover:bg-emerald-800/50 disabled:opacity-40 sm:px-3 sm:text-[11px]"
                >
                  Бито
                </button>
              ) : null}
            </div>
            <div className="flex min-w-0 justify-end">
              {selfIsDefender && game.phase === "defend" ? (
                <button
                  type="button"
                  onClick={onTake}
                  disabled={game.state !== "playing"}
                  className="shrink-0 rounded-full border border-white/25 bg-white/10 px-2 py-1.5 text-[10px] font-medium text-white/90 shadow-md hover:bg-white/15 disabled:opacity-40 sm:px-3 sm:text-[11px]"
                >
                  Взять
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className="relative z-[25] shrink-0 bg-[#0f0c0a]/90 px-1 pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)+5.5rem))] pt-0.5 shadow-[0_-4px_16px_rgba(0,0,0,0.2)] sm:px-2">
        <div className="mb-0 flex items-center justify-between px-1">
          <div className="min-w-0">
            {nameEditing ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameDraft}
                onChange={(e) =>
                  setNameDraft([...e.target.value].slice(0, 12).join(""))
                }
                onBlur={() => {
                  if (skipNameBlurCommitRef.current) return;
                  commitNameEdit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitNameEdit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelNameEdit();
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                className="block w-full max-w-[11rem] rounded-md border border-amber-300/40 bg-black/35 px-2 py-0.5 text-[13px] font-medium text-white outline-none ring-0 placeholder:text-white/35 focus:border-amber-200/70"
                aria-label="Твоё имя"
              />
            ) : (
              <button
                type="button"
                onClick={startNameEdit}
                className="block max-w-full truncate text-left text-[13px] font-medium text-white/90 underline decoration-white/25 decoration-dotted underline-offset-2 transition hover:text-white hover:decoration-white/55"
              >
                {selfPlayer?.name ?? playerName}
              </button>
            )}
            <p className="text-[10px] text-white/45">{humanHand.length} карт</p>
          </div>
        </div>
        {game.message ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 rounded-lg border border-amber-500/35 bg-amber-950/50 px-2 py-1 text-center text-[11px] text-amber-100/95"
            role="status"
          >
            {game.message}
          </motion.div>
        ) : null}
        {phaseLine ? (
          <p className="mt-1.5 line-clamp-3 px-1 text-center text-[10px] font-medium leading-snug text-emerald-100/95 sm:text-[11px]">
            {phaseLine}
          </p>
        ) : null}
        <div className="relative mx-auto mt-1 flex h-[min(30dvh,14.5rem)] max-w-full items-end justify-center overflow-visible sm:mt-1.5 sm:h-[min(32dvh,17.5rem)]">
          {humanHand.map((c, i) => {
            const selAttack =
              game.phase === "attack_initial" && selfIsAttacker && attackPick.includes(c.id);
            const selToss = selfCanToss && tossPick.includes(c.id);

            const attackPlayable =
              selfIsAttacker && game.phase === "attack_initial" && game.state === "playing";

            const tossPlayable = selfCanToss && game.state === "playing" && ranksOnTable.has(c.rank);

            const defendPlayable = defendPlayableFor(c);

            let playable = false;
            if (game.state === "playing" && !dealing) {
              if (selfIsAttacker && game.phase === "attack_initial") playable = attackPlayable;
              else if (selfCanToss) playable = tossPlayable;
              else if (selfIsDefender && game.phase === "defend") playable = defendPlayable;
            }

            const selected = selAttack || selToss;

            const onPress =
              selfIsAttacker && game.phase === "attack_initial"
                ? () => {
                    if (!attackPlayable) return;
                    setAttackPick((p) => toggleAttackSelection(humanHand, p, c.id));
                    setGame((g) => (g ? { ...g, message: null } : g));
                  }
                : selfCanToss
                  ? () => {
                      if (!tossPlayable) return;
                      setTossPick((p) => toggleTossSelection(humanHand, p, c.id, ranksOnTable));
                      setGame((g) => (g ? { ...g, message: null } : g));
                    }
                  : selfIsDefender && game.phase === "defend"
                    ? () => {
                        if (!defendPlayable) return;
                        onDefendCard(c.id);
                      }
                    : undefined;

            const fan = handFanStyle(humanHand.length, i, "player");

            return (
              <div key={c.id} className="absolute" style={fan}>
                <motion.div
                  initial={{ opacity: 0, y: 88, scale: 0.82, rotate: 5 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{
                    delay: 2 * i * DEAL_STAGGER_SEC,
                    duration: DEAL_MOVE_SEC,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <motion.div
                    animate={{ y: selected ? -52 : 0 }}
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
            {game.winnerId === localPlayerId ? <WinConfetti /> : null}
            <motion.div
              id="durak-result-panel"
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-white/20 bg-[#14100c] px-7 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            >
              <p id="durak-result-title" className="text-xl font-bold leading-tight text-white sm:text-2xl">
                {game.winnerId === localPlayerId
                  ? `🔥 ${selfPlayer?.name ?? playerName}, с победой!`
                  : `${selfPlayer?.name ?? playerName}, в пролёте`}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {game.loserId === localPlayerId
                  ? `Дурак — карты остались у тебя. Ничего, бывает — ты молодец, что дошли до конца раздачи.`
                  : game.winnerId === localPlayerId
                    ? `Ты умничка: у соперника ещё карты, у тебя пусто — с победой, так держать!`
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
