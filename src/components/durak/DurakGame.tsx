"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { CARD_BACK_PNG_PATH, CARD_PNG_ASPECT_CLASS } from "@/lib/durak/cardPng";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, GameTable, Player, Rank, Suit } from "@/games/durak/types";
import {
  attackInitial,
  attackToss,
  attackerBeat,
  defendPlay,
  defenderCannotBeat,
  defenderTake,
} from "@/games/durak/engine";
import { applyBotMove } from "@/games/durak/bot";
import {
  getOnlineHumanTimeoutExecutorId,
  getOnlineMandatoryHumanActorId,
  localPlayerMustActOnline,
  tryAutoMove,
} from "@/games/durak/autoMove";
import { canBeat, suitLabel } from "@/games/durak/cards";
import { CARD_BACK_URL } from "@/lib/durak/cardAssets";
import { CardFaceArt } from "@/components/durak/CardFaceArt";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { DurakEntryFlow } from "@/components/durak/DurakEntryFlow";
import { DurakOnlineGame } from "@/components/durak/DurakOnlineGame";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  abandonDurakStoredRoom,
  clearDurakFriendRoomFromStorage,
  clearDurakQuickRoomFromStorage,
  clearDurakTabOnlineResume,
  DURAK_ACTIVE_FRIEND_ROOM_LS_KEY,
  DURAK_ACTIVE_QUICK_ROOM_LS_KEY,
  DURAK_ACTIVE_ROOM_LS_KEY,
  hasDurakTabOnlineResume,
  readDurakFriendRoomFromStorage,
  readDurakLegacyRoomFromStorage,
  readDurakQuickRoomFromStorage,
} from "@/lib/durak/activeRoomStorage";
import {
  CARD_RADIUS_CLASS,
  DURAK_CARD_SURFACE_CLASS,
  DURAK_ATTACK_CARD_CLASS,
  DURAK_CARD_MEDIA_CLASS,
  DURAK_DEFEND_CARD_CLASS,
  GAME_CARD_IS_PLAYABLE_CLASS,
  GAME_CARD_IS_SELECTED_CLASS,
  GAME_CARD_IS_THROWABLE_CLASS,
  GAME_CARD_IS_TARGETABLE_CLASS,
  type DurakCardSurface,
} from "@/lib/durak/cardChrome";
import {
  durakForfeitStaleOpponent,
  durakPlayerPing,
  fetchRoom,
  fetchRoomPlayers,
  isRoomPlayerLikelyGone,
} from "@/lib/durak/online/matchmaking";
import { getRandomLossResultTitle } from "@/lib/durak/lossResultModalTitles";
import { opponentTableFanStyle } from "@/lib/durak/tableSeatLayout";
import {
  buildOpponentTablePlacements,
  getBattleAreaOrbitPx,
  getOpponentSeatAnglesDeg,
} from "@/lib/durak/durakTableLayoutEngine";
import { computeDurakSceneZoneLayout } from "@/lib/durak/durakSceneZones";
import {
  DURAK_DECK_TRUMP_TUCK_UNDER_DECK,
  DURAK_DECK_WRAPPER_CLASS,
  getDurakTableColumnClassNames,
} from "@/lib/durak/durakTableLayout";
import {
  DURAK_SCENE_PLAYER_HAND_FAN_TOTAL_DEG,
  DURAK_SCENE_PLAYER_HAND_SCALE,
  DURAK_SCENE_TABLE_CENTER_Y_VH,
} from "@/lib/durak/durakSceneLayout";

const HUMAN_ID = "human";

/** Если в `game.players` ещё один участник (рассинхрон) — показываем веер рубашек, не пустой стол. */
const DURAK_OPPONENT_PLACEHOLDER_ID = "__durak_opponent_placeholder__";
function durakOpponentPlaceholderPlayer(): Player {
  return {
    id: DURAK_OPPONENT_PLACEHOLDER_ID,
    name: "Соперник",
    type: "remote",
    hand: [],
    seatIndex: 1,
  };
}

const PLAYER_NAME_LS = "player_name";
const ONLINE_TURN_MS = 12_000;
const ONLINE_TURN_WARN_SEC = 3;
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
  /** Победа: соперник не вернулся (сервер `durak_forfeit_stale_opponent`). */
  opponentForfeitWin?: boolean;
};

type DurakGameRootProps = {
  embedded?: DurakGameEmbeddedProps;
  /** Код из ссылки `?stol=` — присоединение к столу с друзьями. */
  friendInviteCodeFromUrl?: string | null;
  /** `?new=1` с хаба игр: не поднимать последнюю комнату из localStorage. */
  skipOnlineResume?: boolean;
};

function TurnDeadlineRing({ progress }: { progress: number }) {
  const warn = progress <= ONLINE_TURN_WARN_SEC / (ONLINE_TURN_MS / 1000);
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="shrink-0" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" className="stroke-white/12" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className={
          warn
            ? "stroke-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.45)]"
            : "stroke-[#f8d66d]"
        }
        style={{
          strokeDasharray: c,
          strokeDashoffset: offset,
          transform: "rotate(-90deg)",
          transformOrigin: "22px 22px",
        }}
      />
    </svg>
  );
}

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
const DEAL_BUFFER_MS = 400;

const SPRING_SOFT = { type: "spring" as const, stiffness: 380, damping: 28, mass: 0.85 };

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
/** Компактные карты: центр стола, колода и рубашки соперника — один размер. */
const CARD_TABLE_COMPACT_W = "w-[3rem] sm:w-[3.85rem]";
/** Рука: крупнее прежнего; зона веера растягивается между статусом и нижним баром. */
const HAND_CARD_W_CLASS = "w-[8.95rem] sm:w-[9.55rem]";
/** Габариты карты = ширина + пропорции PNG 242×340 (без фиксированной высоты — искажений нет). */
const CARD_BOX_CLASS = cn(CARD_W_CLASS, CARD_PNG_ASPECT_CLASS);
const CARD_TABLE_COMPACT_BOX = cn(CARD_TABLE_COMPACT_W, CARD_PNG_ASPECT_CLASS);
const HAND_CARD_BOX = cn(HAND_CARD_W_CLASS, CARD_PNG_ASPECT_CLASS);
/** Не больше 6 карт в ряду — следующие вторым рядом, без вылета за края экрана. */
const HAND_ROW_MAX = 6;
const HAND_ROW_GAP_PX = 56;

/**
 * `true` → в консоль пишутся rect игровой зоны и стола (временная отладка геометрии).
 */
const DURAK_TABLE_LAYOUT_DEBUG = false;

function handFanStyle(
  n: number,
  i: number,
  mode: "opponent" | "player"
): React.CSSProperties {
  if (n <= 0) return {};
  const mid = (n - 1) / 2;
  const rel = i - mid;
  const spreadCap = mode === "player" ? Math.min(14, DURAK_SCENE_PLAYER_HAND_FAN_TOTAL_DEG / 2) : 9;
  const spread =
    mode === "player"
      ? n <= 1
        ? 0
        : Math.min(DURAK_SCENE_PLAYER_HAND_FAN_TOTAL_DEG / Math.max(n - 1, 1), spreadCap)
      : Math.min(50 / (n - 1), spreadCap);
  const rot = rel * spread;
  const step =
    mode === "player"
      ? n >= 6
        ? 17
        : n >= 4
          ? 24
          : 22
      : n >= 6
        ? 30
        : n >= 4
          ? 27
          : 25;
  const tx = rel * step;
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

/** Все остальные игроки по часовой стрелке от локального (рука внизу). */
function otherPlayersClockwiseFromLocal(game: GameTable, localId: string): Player[] {
  let idx = game.players.findIndex((p) => p.id === localId);
  if (idx < 0) {
    /** Иначе filter даёт всех кроме id — при 2 игроках оба попадали в «соперники», ломая углы. */
    const humanIdx = game.players.findIndex((p) => p.type === "human");
    idx = humanIdx >= 0 ? humanIdx : 0;
  }
  const out: Player[] = [];
  for (let k = 1; k < game.players.length; k++) {
    out.push(game.players[(idx + k) % game.players.length]!);
  }
  return out;
}

/** Если ещё не измерили стол, не даём радиусу стать 0 — иначе все соперники в центре. */

const TABLE_PAIRS_FIRST_ROW_MAX = 4;
/** Вертикальный зазор между рядами пар на столе (второй ряд — снизу). */
const TABLE_PAIRS_ROW_GAP_PX = 56;
/** Сдвиг пар вверх от центра, чтобы нижняя кромка карт не заходила на зону соперников (maxY < centerY − 20). */
const TABLE_PAIRS_SHIFT_UP_PX = 20;

/**
 * Позиции колонок «атака + отбой» на столе: ряд(и) по горизонтали в центре сукна.
 * Больше 4 пар — второй ряд ниже (5-я пара и далее).
 */
function tablePairOrbitOffset(
  index: number,
  total: number,
  orbitRadiusPx: number,
): { x: number; y: number } {
  if (orbitRadiusPx <= 0 || total <= 0) return { x: 0, y: 0 };

  let rowIndex = 0;
  let indexInRow = index;
  let countInRow = total;

  if (total > TABLE_PAIRS_FIRST_ROW_MAX) {
    if (index < TABLE_PAIRS_FIRST_ROW_MAX) {
      rowIndex = 0;
      indexInRow = index;
      countInRow = TABLE_PAIRS_FIRST_ROW_MAX;
    } else {
      rowIndex = 1;
      indexInRow = index - TABLE_PAIRS_FIRST_ROW_MAX;
      countInRow = total - TABLE_PAIRS_FIRST_ROW_MAX;
    }
  }

  const n = Math.max(1, countInRow);
  if (n === 1 && rowIndex === 0 && total === 1) return { x: 0, y: 0 };

  const minGapPx = 52;
  const maxGapPx = 78;
  const maxHalfRowPx = Math.max(orbitRadiusPx * 0.72, (minGapPx * (n - 1)) / 2 + 24);
  const idealGap = n <= 1 ? 0 : (2 * maxHalfRowPx) / (n - 1);
  const gap = n <= 1 ? 0 : Math.max(minGapPx, Math.min(maxGapPx, idealGap));
  const totalWidth = (n - 1) * gap;
  const startX = -totalWidth / 2;
  const x = startX + indexInRow * gap;
  const y =
    (rowIndex === 0 ? -TABLE_PAIRS_ROW_GAP_PX * 0.42 : TABLE_PAIRS_ROW_GAP_PX * 0.58) -
    TABLE_PAIRS_SHIFT_UP_PX;
  return { x, y };
}

/** Рубашка: только PNG + скругление, без подложки/shadow на площади карты (иначе «чернота»). */
function BrandedCardBack({
  disabled,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState(CARD_BACK_PNG_PATH);

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn(
        "durak-card-face-img pointer-events-none block h-full w-full max-h-full max-w-full bg-transparent select-none",
        "object-cover object-center",
        disabled && "opacity-[0.42]",
        className
      )}
      loading="eager"
      decoding="async"
      style={{
        filter: "none",
        mixBlendMode: "normal",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
      }}
      onError={() => setSrc(CARD_BACK_URL)}
    />
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
  surface,
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
  /** `hand` — рука внизу; `tableCompact` — центр стола и рубашки соперников (те же габариты, что колода). */
  size?: "table" | "hand" | "tableCompact";
  /** Рука / стол / колода / козырь / соперник — класс оболочки и ::after в globals.css */
  surface?: DurakCardSurface;
}) {
  const isBack = faceDown || !card;
  const dimBox =
    size === "hand"
      ? HAND_CARD_BOX
      : size === "tableCompact"
        ? CARD_TABLE_COMPACT_BOX
        : CARD_BOX_CLASS;

  const resolvedSurface: DurakCardSurface = surface ?? (size === "hand" ? "hand" : "table");
  const surfaceClass = DURAK_CARD_SURFACE_CLASS[resolvedSurface];
  const isTableSurface = resolvedSurface === "table";

  const wrap = cn(
    surfaceClass,
    "relative shrink-0 bg-transparent",
    dimBox,
    playableHighlight && !isBack && !selected && GAME_CARD_IS_PLAYABLE_CLASS,
    selected && !isBack && GAME_CARD_IS_SELECTED_CLASS,
    className
  );

  const inner = isBack ? (
    <BrandedCardBack disabled={disabled} className={imgClassName} />
  ) : (
    <CardFaceArt
      card={card!}
      compact={size !== "hand"}
      className={cn("h-full min-h-0 w-full min-w-0", imgClassName)}
    />
  );

  const shell = <div className={DURAK_CARD_MEDIA_CLASS}>{inner}</div>;

  if (onPress) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        style={wrapStyle}
        className={cn(wrap, "border-0 p-0 touch-manipulation")}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onPress();
        }}
        whileTap={disabled || isTableSurface ? undefined : { scale: 0.98 }}
      >
        {shell}
      </motion.button>
    );
  }

  return (
    <motion.div
      layout={false}
      style={wrapStyle}
      className={cn(wrap, "m-0 shadow-none ring-0 outline-none")}
    >
      {shell}
    </motion.div>
  );
}

function DeckPile({
  count,
  trumpCard,
  trumpSuit,
  compact,
  /** Козырь под колодой: стопка перекрывает верхнюю треть карты козыря (режим 3 игроков). */
  trumpTuckUnderDeck,
}: {
  count: number;
  trumpCard: Card | null;
  /** Нижняя карта колоды снята в `engine.drawCards` при пустой колоде — масть козыря остаётся здесь для UI. */
  trumpSuit: Suit;
  /** Меньшая колода у края овального стола */
  compact?: boolean;
  trumpTuckUnderDeck?: boolean;
}) {
  const stackLayers = count > 0 ? Math.min(8, Math.max(2, Math.ceil(count / 5))) : 0;
  const deckBox = compact ? CARD_TABLE_COMPACT_BOX : CARD_BOX_CLASS;
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
        <div className="flex h-full min-h-[3.25rem] w-full items-center justify-center sm:min-h-[3.5rem]">
          <div
            className={cn(
              "flex items-center justify-center border border-dashed border-emerald-700/45 bg-black/30 text-[8px] text-emerald-200/55 sm:text-[10px]",
              CARD_RADIUS_CLASS,
              deckBox
            )}
          >
            —
          </div>
        </div>
      ) : null}
    </>
  );

  const trumpVisual =
    trumpCard != null ? (
      <CardSprite
        card={trumpCard}
        size={size}
        surface="trump"
        className="shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
      />
    ) : (
      <div
        title="Козырь (колода разобрана)"
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden",
          CARD_RADIUS_CLASS,
          deckBox,
          "bg-gradient-to-b from-white via-white to-neutral-100 shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
        )}
      >
        <span
          className={cn(
            "select-none text-[2.05rem] leading-none sm:text-[2.4rem]",
            trumpSuit === "hearts" || trumpSuit === "diamonds" ? "text-red-600" : "text-neutral-900"
          )}
          aria-hidden
        >
          {suitLabel(trumpSuit)}
        </span>
        <span className="sr-only">Козырь: {trumpSuit}</span>
      </div>
    );

  /* Колода сверху, козырь снизу в потоке — без перекрытия, иначе козырь часто не виден под стопкой */
  const stackWrap =
    count > 0 ? (
      <div
        className={cn(
          "relative mx-auto shrink-0",
          deckBox,
          compact ? "min-h-[4.35rem] sm:min-h-[4.85rem]" : "min-h-[5.5rem] sm:min-h-[6rem]"
        )}
      >
        {stackBlock}
      </div>
    ) : count === 0 && !trumpCard ? (
      <div className={cn("relative mx-auto shrink-0", deckBox)}>{stackBlock}</div>
    ) : null;

  if (trumpCard != null || count > 0) {
    const tuck = Boolean(compact && trumpTuckUnderDeck && (count > 0 || trumpCard != null));
    return (
      <div
        className={cn(
          "deck-area flex shrink-0 flex-col items-center overflow-visible",
          tuck ? "gap-0" : "gap-2",
          compact ? "min-h-0 w-full" : "min-h-0",
        )}
      >
        <div className={cn("relative shrink-0", tuck && "z-30")}>{stackWrap}</div>
        <div
          className={cn(
            "trump-area shrink-0 overflow-visible",
            tuck &&
              "relative z-[6] -mt-[calc(3rem*340/242/3)] sm:-mt-[calc(3.85rem*340/242/3)]",
          )}
        >
          {trumpVisual}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "trump-area flex shrink-0 flex-col items-center overflow-visible",
        deckBox,
        compact ? "min-h-[6.75rem] sm:min-h-[9.5rem]" : "min-h-[9.85rem] sm:min-h-[10.75rem]"
      )}
    >
      {trumpVisual}
    </div>
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
      className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto"
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
  const friendInviteCodeFromUrl = props.friendInviteCodeFromUrl ?? null;
  const skipOnlineResume = props.skipOnlineResume === true;
  const localPlayerId = embedded?.localPlayerId ?? HUMAN_ID;

  const [nameHydrated, setNameHydrated] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const displayName = embedded?.playerName ?? playerName;
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null);
  const [activeOnlineKind, setActiveOnlineKind] = useState<"quick" | "friend" | null>(null);
  const [tableGreeting, setTableGreeting] = useState<string | null>(null);

  const onOnlineGameStartedStable = useCallback((id: string, kind: "quick" | "friend") => {
    setActiveOnlineKind(kind);
    setOnlineRoomId(id);
  }, []);
  const onLeaveOnlineRoomStable = useCallback(() => {
    abandonDurakStoredRoom();
    setOnlineRoomId(null);
    setActiveOnlineKind(null);
  }, []);
  const onMatchmakingCancelStable = useCallback(() => {
    router.push("/");
  }, [router]);
  const renderEmbeddedGame = useCallback(
    (embedded: DurakGameEmbeddedProps) => <DurakGame embedded={embedded} />,
    []
  );

  const game = embedded?.game ?? null;
  /** Без ref каждый новый объект `embedded` от родителя пересоздавал callback и сбрасывал таймер автохода. */
  const embeddedOnGameChangeRef = useRef<DurakGameEmbeddedProps["onGameChange"] | null>(null);
  embeddedOnGameChangeRef.current = embedded?.onGameChange ?? null;
  const setGame = useCallback((updater: SetStateAction<GameTable | null>) => {
    const fn = embeddedOnGameChangeRef.current;
    if (!fn) return;
    fn(updater as SetStateAction<GameTable>);
  }, []);
  const [attackPick, setAttackPick] = useState<string[]>([]);
  const [tossPick, setTossPick] = useState<string[]>([]);
  const [defenseTargetAttackId, setDefenseTargetAttackId] = useState<string | null>(null);
  const [dealing, setDealing] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [turnProgress, setTurnProgress] = useState(1);
  const [autoMoveBanner, setAutoMoveBanner] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const skipNameBlurCommitRef = useRef(false);
  const tableRoundRef = useRef<HTMLDivElement>(null);
  const durakSceneRef = useRef<HTMLDivElement>(null);
  const boardPlayAreaRef = useRef<HTMLDivElement>(null);
  /** Размеры игровой колонки — единая система координат для стола, соперников и зоны игрока. */
  const [sceneRect, setSceneRect] = useState({ w: 400, h: 640 });
  const [lossResultTitle, setLossResultTitle] = useState("");
  const lossResultTitleGameIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = durakSceneRef.current;
    if (!el) return;
    const upd = () =>
      setSceneRect({
        w: Math.max(280, el.clientWidth),
        h: Math.max(240, el.clientHeight),
      });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [game?.id]);

  useLayoutEffect(() => {
    if (!DURAK_TABLE_LAYOUT_DEBUG) return;
    const tableEl = tableRoundRef.current;
    const boardEl = boardPlayAreaRef.current;
    if (!tableEl || !boardEl) return;
    const tableR = tableEl.getBoundingClientRect();
    const boardR = boardEl.getBoundingClientRect();
    const pairCount = game?.tablePairs.length ?? 0;
    console.log("[durak-table-layout]", {
      boardTargetRect: boardR,
      tableRoundRect: tableR,
      animationTargetCenter: {
        x: boardR.left + boardR.width / 2,
        y: boardR.top + boardR.height / 2,
      },
      orbitPxEff: computeDurakSceneZoneLayout(
        Math.max(280, durakSceneRef.current?.clientWidth ?? tableEl.clientWidth),
        Math.max(240, durakSceneRef.current?.clientHeight ?? tableEl.clientHeight),
      ).orbitPxEff,
      pairCount,
      note: "Карты боя позиционируются от центра boardPlayArea; рука — отдельный слой ниже (z-8).",
    });
  }, [game?.tablePairs.length, game?.id, sceneRect.w, sceneRect.h]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYER_NAME_LS);
      setPlayerName(normalizePlayerNameInput(raw ?? ""));
    } finally {
      setNameHydrated(true);
    }
  }, []);

  /**
   * `?new=1` и сброс стола — до useEffect rejoin: читаем window.location, иначе гонка с useSearchParams.
   */
  useLayoutEffect(() => {
    if (embedded) return;
    let skip =
      skipOnlineResume ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("new") === "1");
    if (!skip) return;
    abandonDurakStoredRoom();
    setOnlineRoomId(null);
    setActiveOnlineKind(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("new") === "1") {
        u.searchParams.delete("new");
        const q = u.searchParams.toString();
        window.history.replaceState(null, "", `${u.pathname}${q ? `?${q}` : ""}${u.hash}`);
      }
    } catch {
      /* ignore */
    }
  }, [embedded, skipOnlineResume]);

  useEffect(() => {
    if (embedded || !nameHydrated || !playerName || onlineRoomId) return;
    if (skipOnlineResume) return;
    let cancelled = false;
    let friendRid = readDurakFriendRoomFromStorage();
    let quickRid = readDurakQuickRoomFromStorage();
    void (async () => {
      const client = createSupabaseBrowserClient();
      if (!client || cancelled) return;
      try {
        if (!friendRid && !quickRid) {
          const leg = readDurakLegacyRoomFromStorage();
          if (!leg) return;
          const probe = await fetchRoom(client, leg);
          if (cancelled) return;
          if (!probe) {
            abandonDurakStoredRoom();
            return;
          }
          if (probe.matchmaking_pool === false) friendRid = leg;
          else quickRid = leg;
        }
        if (!friendRid && !quickRid) return;

        const pid = getOrCreateDurakPlayerId();

        const attempt = async (kind: "quick" | "friend", rid: string): Promise<boolean> => {
          const room = await fetchRoom(client, rid);
          if (cancelled) return false;
          if (!room) {
            if (kind === "friend") clearDurakFriendRoomFromStorage();
            else {
              clearDurakQuickRoomFromStorage();
              clearDurakTabOnlineResume();
            }
            return false;
          }
          if (room.status === "finished") {
            if (kind === "friend") clearDurakFriendRoomFromStorage();
            else {
              clearDurakQuickRoomFromStorage();
              clearDurakTabOnlineResume();
            }
            return false;
          }
          const players = await fetchRoomPlayers(client, rid);
          if (cancelled) return false;
          if (!players.some((p) => p.player_id === pid)) {
            if (kind === "friend") clearDurakFriendRoomFromStorage();
            else {
              clearDurakQuickRoomFromStorage();
              clearDurakTabOnlineResume();
            }
            return false;
          }
          /* Быстрая игра в playing: только если эта вкладка уже была в матче (F5). Иначе — новая вкладка / старый LS. */
          if (kind === "quick" && room.status === "playing" && room.matchmaking_pool !== false) {
            if (!hasDurakTabOnlineResume()) {
              clearDurakQuickRoomFromStorage();
              clearDurakTabOnlineResume();
              return false;
            }
            const humans = players.filter((p) => !p.is_bot).length;
            if (humans < 2) {
              if (hasDurakTabOnlineResume()) {
                try {
                  const { data: rs } = await client
                    .from("room_state")
                    .select("state")
                    .eq("room_id", rid)
                    .maybeSingle();
                  const plist = (rs?.state as { game?: { players?: { type?: string }[] } } | undefined)?.game
                    ?.players;
                  const humanCount = Array.isArray(plist) ? plist.filter((p) => p?.type !== "bot").length : 0;
                  if (humanCount >= 2) {
                    try {
                      await durakPlayerPing(client, rid, pid);
                      await durakForfeitStaleOpponent(client, rid, pid);
                    } catch {
                      /* ignore */
                    }
                  }
                } catch {
                  /* ignore */
                }
              }
              clearDurakQuickRoomFromStorage();
              clearDurakTabOnlineResume();
              return false;
            }
            const others = players.filter((p) => !p.is_bot && p.player_id !== pid);
            if (others.length > 0) {
              const now = Date.now();
              const allOthersStale = others.every((r) => isRoomPlayerLikelyGone(r, now));
              if (allOthersStale) {
                try {
                  await durakPlayerPing(client, rid, pid);
                  await durakForfeitStaleOpponent(client, rid, pid);
                } catch {
                  /* ignore */
                }
                clearDurakQuickRoomFromStorage();
                clearDurakTabOnlineResume();
                return false;
              }
            }
          }
          setActiveOnlineKind(kind);
          setOnlineRoomId(rid);
          return true;
        };

        if (friendRid) {
          if (await attempt("friend", friendRid)) return;
        }
        if (quickRid && !cancelled) {
          await attempt("quick", quickRid);
        }
      } catch {
        /* сеть / миграции */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, nameHydrated, playerName, onlineRoomId, skipOnlineResume]);

  useEffect(() => {
    if (embedded || !onlineRoomId || !activeOnlineKind) return;
    try {
      if (activeOnlineKind === "quick") {
        localStorage.setItem(DURAK_ACTIVE_QUICK_ROOM_LS_KEY, onlineRoomId);
        localStorage.removeItem(DURAK_ACTIVE_FRIEND_ROOM_LS_KEY);
        localStorage.removeItem(DURAK_ACTIVE_ROOM_LS_KEY);
      } else {
        localStorage.setItem(DURAK_ACTIVE_FRIEND_ROOM_LS_KEY, onlineRoomId);
        localStorage.removeItem(DURAK_ACTIVE_QUICK_ROOM_LS_KEY);
        localStorage.removeItem(DURAK_ACTIVE_ROOM_LS_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [embedded, onlineRoomId, activeOnlineKind]);

  /** Онлайн: без анимации раздачи — иначе при смене/починке `game.id` в JSON карты на ~1 с уходят в opacity 0. Офлайн: раздача при новой колоде. */
  useEffect(() => {
    if (!game?.id) return;
    if (embedded) {
      setDealing(false);
      return;
    }
    setDealing(true);
    const ms = Math.ceil(12 * DEAL_STAGGER_SEC * 1000) + DEAL_BUFFER_MS;
    const t = window.setTimeout(() => setDealing(false), ms);
    return () => window.clearTimeout(t);
  }, [game?.id, embedded]);

  const selfPlayer = game?.players.find((p) => p.id === localPlayerId);
  const wonByForfeit =
    !!game &&
    game.state === "finished" &&
    Boolean(props.embedded?.opponentForfeitWin) &&
    game.winnerId === localPlayerId;

  useLayoutEffect(() => {
    if (!game) return;
    if (game.state !== "finished") {
      lossResultTitleGameIdRef.current = null;
      return;
    }
    if (wonByForfeit || game.loserId !== localPlayerId) return;
    if (lossResultTitleGameIdRef.current === game.id) return;
    lossResultTitleGameIdRef.current = game.id;
    const name = (selfPlayer?.name ?? displayName).trim() || "Игрок";
    setLossResultTitle(getRandomLossResultTitle(name));
  }, [game, game?.state, game?.id, game?.loserId, localPlayerId, wonByForfeit, selfPlayer?.name, displayName]);

  const otherPlayers = useMemo(
    () => (game ? otherPlayersClockwiseFromLocal(game, localPlayerId) : []),
    [game, localPlayerId]
  );

  /** Слоты для рендера веера сверху: реальные соперники или одна заглушка при `players.length === 1`. */
  const opponentsForTable = useMemo((): Player[] => {
    if (!game) return [];
    if (otherPlayers.length > 0) return otherPlayers;
    if (game.players.length === 1) return [durakOpponentPlaceholderPlayer()];
    return [];
  }, [game, otherPlayers]);

  const totalPlayersForSeatLayout = useMemo(() => {
    if (!game) return 0;
    return Math.max(game.players.length, opponentsForTable.length + 1);
  }, [game, opponentsForTable.length]);

  const opponentSeatAnglesDeg = useMemo(
    () =>
      getOpponentSeatAnglesDeg(
        opponentsForTable.length,
        totalPlayersForSeatLayout > 0 ? totalPlayersForSeatLayout : undefined,
      ),
    [opponentsForTable.length, totalPlayersForSeatLayout],
  );
  const humanHand = selfPlayer?.hand ?? [];
  const humanHandRows = useMemo(() => {
    const rows: Card[][] = [];
    for (let i = 0; i < humanHand.length; i += HAND_ROW_MAX) {
      rows.push(humanHand.slice(i, i + HAND_ROW_MAX));
    }
    return rows;
  }, [humanHand]);
  const layout = useMemo(
    () => computeDurakSceneZoneLayout(sceneRect.w, sceneRect.h),
    [sceneRect.w, sceneRect.h],
  );
  const orbitPxEff = layout.orbitPxEff;
  const tableRadiusPx = layout.tableRadiusPx;
  const opponentTablePlacements = useMemo(() => {
    if (!game) return [];
    return buildOpponentTablePlacements({
      opponents: opponentsForTable,
      totalPlayers: totalPlayersForSeatLayout,
      orbitPxEff,
    });
  }, [game, opponentsForTable, orbitPxEff, totalPlayersForSeatLayout]);
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
    const tossPhases =
      game.phase === "attack_toss" || game.phase === "player_can_throw_more";
    const botActs =
      (game.phase === "attack_initial" && attacker.type === "bot") ||
      (game.phase === "defend" && defender.type === "bot") ||
      (tossPhases &&
        game.players.some((p, i) => p.type === "bot" && i !== game.defenderIndex));
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

  const onlineTurnKey = useMemo(() => {
    if (!embedded || !game || game.state !== "playing") return "";
    const actor = getOnlineMandatoryHumanActorId(game);
    return [
      actor ?? "none",
      game.phase,
      game.attackerIndex,
      game.defenderIndex,
      game.tablePairs.length,
      ...game.tablePairs.map((p) => `${p.attack.id}:${p.defense?.id ?? "-"}`),
    ].join("|");
  }, [embedded, game]);

  useEffect(() => {
    if (!embedded || !game || game.state !== "playing" || dealing) {
      setTurnProgress(1);
      return;
    }
    const actorId = getOnlineMandatoryHumanActorId(game);
    if (!actorId) {
      setTurnProgress(1);
      return;
    }
    const turnDeadline = Date.now() + ONLINE_TURN_MS;
    const timeoutExecutorId = getOnlineHumanTimeoutExecutorId(game, actorId);
    const isTimeoutExecutor =
      timeoutExecutorId != null && localPlayerId === timeoutExecutorId;
    console.info("[durak online turn] timer start", {
      currentTurnPlayerId: actorId,
      localPlayerId,
      turnDeadline,
      secondsLeft: Math.ceil(ONLINE_TURN_MS / 1000),
      timerStarted: true,
      timeoutExecutorId,
      isTimeoutExecutor,
    });
    const tick = () => {
      const left = Math.max(0, turnDeadline - Date.now());
      setTurnProgress(left / ONLINE_TURN_MS);
      return left;
    };
    tick();
    let lastLoggedSec = 999;
    const id = window.setInterval(() => {
      const left = tick();
      const sec = Math.ceil(left / 1000);
      if (sec !== lastLoggedSec && sec <= 3 && sec >= 0) {
        lastLoggedSec = sec;
        console.info("[durak online turn] tick", {
          currentTurnPlayerId: actorId,
          localPlayerId,
          turnDeadline,
          secondsLeft: sec,
          isTimeoutExecutor,
        });
      }
      if (left <= 0) {
        window.clearInterval(id);
        if (!isTimeoutExecutor) {
          console.info("[durak online turn] timeout (non-executor, skip auto-move)", {
            currentTurnPlayerId: actorId,
            localPlayerId,
            timeoutExecutorId,
          });
          setTurnProgress(1);
          return;
        }
        setGame((prev) => {
          if (!prev || prev.state !== "playing") {
            console.info("[durak online turn] autoMoveResult: skip_state (not playing)");
            return prev;
          }
          const actor = getOnlineMandatoryHumanActorId(prev);
          console.info("[durak online turn] timeout apply", {
            currentTurnPlayerId: actor,
            localPlayerId,
            turnDeadline,
            autoMoveTriggered: true,
            expectedActor: actorId,
          });
          if (!actor) {
            console.info("[durak online turn] autoMoveResult: noop (no actor)");
            return prev;
          }
          const next = tryAutoMove(prev, actor);
          if (!next) {
            console.info("[durak online turn] autoMoveResult: noop (tryAutoMove)");
            return prev;
          }
          console.info("[durak online turn] autoMoveResult: ok (persist via onGameChange)", {
            phase: next.phase,
            attackerIndex: next.attackerIndex,
            defenderIndex: next.defenderIndex,
            tablePairs: next.tablePairs.length,
          });
          const banner =
            actor === localPlayerId
              ? "Ход выполнен автоматически"
              : "Соперник не сходил — ход по таймеру";
          queueMicrotask(() => {
            setAutoMoveBanner(banner);
            window.setTimeout(() => setAutoMoveBanner(null), 2200);
          });
          return { ...next, message: null };
        });
        setTurnProgress(1);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [embedded?.roomId, onlineTurnKey, dealing, localPlayerId]);

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
    if (game.phase === "attack_toss") {
      if (selfIsDefender)
        return "Соперник решает — подкинет ещё карты или нажмёт «Бито». Ожидайте.";
      return selfIsAttacker
        ? "Ваш ход — подкините по достоинствам на столе или нажмите «Бито»"
        : `Ваш ход — можете подкинуть по столу или дождаться «Бито»`;
    }
    if (game.phase === "player_can_throw_more") {
      if (selfIsDefender)
        return "Вы не отбиваетесь — ждите: соперник подкинет карты или нажмёт «Бито».";
      return selfIsAttacker
        ? "Ваш ход — соперник не бьётся: подкините ещё или нажмите «Бито»"
        : `Ваш ход — подкините по столу (пока не «Бито») или подождите`;
    }
    return "";
  })();

  /** Подкидывать могут все, кроме защитника (3+ игроков). */
  const selfCanTossCards =
    !!game &&
    !selfIsDefender &&
    (game.phase === "attack_toss" || game.phase === "player_can_throw_more");

  /** «Бито» после полного отбоя — только ведущий атакующий; иначе завершение подкидывания — любой не-защитник. */
  const selfShowBitoForToss =
    !!game &&
    ((game.phase === "attack_toss" && selfIsAttacker) ||
      (game.phase === "player_can_throw_more" && !selfIsDefender));

  /** Явный акцент в строке состояния: сторона атаки должна действовать (подкинуть / бито). */
  const statusStripHighlightAttackerTurn =
    !!game &&
    !dealing &&
    game.state === "playing" &&
    selfCanTossCards &&
    (game.phase === "attack_toss" || game.phase === "player_can_throw_more");

  const microFlavour = useMemo(() => {
    if (!game || dealing || game.state !== "playing") return null;
    let pool: string[] | null = null;
    if (game.phase === "attack_initial" && selfIsAttacker) {
      pool = ["Сукно ждёт твоего первого хода.", "Задай темп партии — без спешки."];
    } else if (game.phase === "defend" && selfIsDefender) {
      pool = ["Отбейся аккуратно или заберёшь стол — твой выбор.", "Козырь и старшинство — твои друзья."];
    } else if (game.phase === "player_can_throw_more" && selfIsAttacker) {
      pool = [
        "Соперник ждёт: ты можешь ещё подкинуть по рангам на сукне или снять стол кнопкой «Бито».",
        "Игра не стоит — это твой ход после «Взять» у защитника.",
      ];
    } else if (game.phase === "attack_toss" && selfIsAttacker) {
      pool = [
        "Отбой принят — реши, докинуть карты или завершить раунд «Бито».",
        "Пока не нажали «Бито», можно подкидывать только по тем же достоинствам, что на столе.",
      ];
    } else if (
      (game.phase === "attack_toss" || game.phase === "player_can_throw_more") &&
      selfCanTossCards &&
      !selfIsAttacker
    ) {
      pool = [
        "Тоже можешь подкинуть по столу — или жми «Бито», если ты ведущий после отбоя.",
        "Подкинуть можно только по достоинствам, которые уже лежат на сукне.",
      ];
    } else if (
      (game.phase === "attack_toss" || game.phase === "player_can_throw_more") &&
      selfIsDefender
    ) {
      pool = [
        "Сейчас ход у атакующих: тебе нужно только дождаться подкидывания или «Бито».",
        "Ничего нажимать не нужно — соперник либо докинет карты, либо закроет стол.",
      ];
    } else if (game.phase === "attack_initial" && !selfIsAttacker) {
      pool = ["Пока соперник думает — можно выдохнуть.", "Смотри на стол — скоро твой ход."];
    }
    if (!pool?.length) return null;
    const i = (game.id.length + game.phase.length + game.tablePairs.length) % pool.length;
    return pool[i] ?? null;
  }, [game, dealing, selfIsAttacker, selfIsDefender, selfCanTossCards]);

  if (!nameHydrated) {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-2 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          overflowX: "hidden",
          backgroundColor: "#14100c",
          color: "#e2e8f0",
        }}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="text-sm text-white/50" style={{ color: "rgba(248,250,252,0.55)", fontSize: 14 }}>
            Загрузка…
          </span>
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
        <DurakEntryFlow
          displayName={displayName}
          inviteCodeFromUrl={friendInviteCodeFromUrl}
          onOnlineGameStarted={onOnlineGameStartedStable}
          onBackToMenu={onMatchmakingCancelStable}
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
        className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-2 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          backgroundColor: "#14100c",
          color: "#e2e8f0",
        }}
      >
        <div className="flex flex-1 items-center justify-center py-20">
          <span className="text-sm text-white/50" style={{ color: "rgba(248,250,252,0.55)", fontSize: 14 }}>
            Раздаём колоду…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-[#14100c] text-slate-100",
        /* В /durak стол уже под общим Header + BottomNav — заполняем flex-1, без второго pt и без лишней высоты. */
        embedded
          ? "flex-1 basis-0 min-h-0 overflow-x-hidden overflow-y-hidden pb-0"
          : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
        /* Снизу: для офлайна — общий отступ; для встроенного онлайн нижний зазор только у секции руки (иначе двойной pb). */
        !embedded &&
          "pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+5.85rem))]"
      )}
    >
      <div
        ref={durakSceneRef}
        className={cn(
          getDurakTableColumnClassNames(),
          "relative isolate flex-1 min-h-0 w-full overflow-hidden",
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 bg-[#14100c]" aria-hidden />
        {tableGreeting ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-[max(0.35rem,env(safe-area-inset-top,0px))] z-50 max-w-[min(100%,520px)] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/55 px-2 py-1 text-center text-[11px] font-medium text-emerald-100"
            role="status"
          >
            {tableGreeting}
          </motion.div>
        ) : null}
        {autoMoveBanner ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-[max(2.25rem,env(safe-area-inset-top,0px))] z-50 max-w-[min(100%,520px)] -translate-x-1/2 rounded-lg border border-amber-400/35 bg-amber-950/50 px-2 py-1 text-center text-[11px] font-medium text-amber-100"
            role="status"
          >
            {autoMoveBanner}
          </motion.div>
        ) : null}

        <div
          ref={tableRoundRef}
          data-durak-table-center-y={`${DURAK_SCENE_TABLE_CENTER_Y_VH}%`}
          data-durak-scene-w={Math.round(sceneRect.w)}
          data-durak-scene-h={Math.round(sceneRect.h)}
          data-durak-players={game.players.length}
          data-durak-opponents-render={opponentsForTable.length}
          data-durak-seat-angles={opponentSeatAnglesDeg.join(",")}
          className="absolute left-1/2 z-[22] isolate overflow-visible rounded-full -translate-x-1/2"
          style={{
            top: layout.tableTop,
            width: layout.tableWidthPx,
            height: layout.tableWidthPx,
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-[1] rounded-full bg-black/30 shadow-[0_14px_36px_rgba(0,0,0,0.55)]" />

          <div
            className="pointer-events-none absolute inset-[2%] z-[1] rounded-full border-[2px] border-[#5a9a6a]/90 sm:border-[3px] sm:border-[#6dae7e]"
            style={{
              background:
                "radial-gradient(ellipse 92% 88% at 50% 42%, #2d6b45 0%, #245538 22%, #1a3d28 52%, #0f2418 78%, #081810 100%)",
              boxShadow:
                "inset 0 0 56px rgba(0,0,0,0.42), inset 0 2px 3px rgba(255,255,255,0.14)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-[5%] z-[1] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 34%, rgba(180,220,160,0.16) 0%, transparent 55%)",
            }}
          />

          {/* Тиснение на сукне — крупнее, низкий контраст */}
          <div
            className="pointer-events-none absolute inset-[7%] z-[1] flex items-center justify-center rounded-full"
            aria-hidden
          >
            <span
              className="select-none text-center font-semibold uppercase tracking-[0.32em] leading-none"
              style={{
                fontSize: "clamp(0.95rem, 4.5vmin, 1.35rem)",
                color: "rgba(5, 28, 18, 0.1)",
                textShadow:
                  "0 1px 0 rgba(255,255,255,0.07), 0 -1px 1px rgba(0,0,0,0.14)",
                filter: "blur(0.55px)",
                opacity: 0.88,
              }}
            >
              GASTROBAR
            </span>
          </div>

          <div
            ref={boardPlayAreaRef}
            className="table-area pointer-events-none absolute inset-0 z-[20] min-h-0 overflow-visible"
          >
            <div className="pointer-events-none relative z-0 h-full min-h-0 w-full overflow-visible">
              <div className={DURAK_DECK_WRAPPER_CLASS}>
                <DeckPile
                  count={deckCount}
                  trumpCard={trumpShow ?? null}
                  trumpSuit={game.trumpSuit}
                  compact
                  trumpTuckUnderDeck={DURAK_DECK_TRUMP_TUCK_UNDER_DECK}
                />
              </div>
              {game.tablePairs.length === 0 && dealing ? (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-[20] -translate-x-1/2 -translate-y-1/2 px-2">
                  <span className="block text-center text-[10px] text-white/35 sm:text-[11px]">
                    Карты раздаются…
                  </span>
                </div>
              ) : null}
              {game.tablePairs.length > 0 ? (
                game.tablePairs.map((tp, i) => {
                  const { x, y } = tablePairOrbitOffset(
                    i,
                    game.tablePairs.length,
                    getBattleAreaOrbitPx(orbitPxEff),
                  );
                  const uncovered = tp.defense === null;
                  const humanMustDefend = selfIsDefender && game.phase === "defend" && uncovered;
                  const attackSelectedForDefense =
                    humanMustDefend && defenseTargetAttackId === tp.attack.id;
                  const highlightUnbeaten =
                    uncovered && (game.phase === "defend" || game.phase === "player_can_throw_more");
                  const tableTargetable = Boolean(highlightUnbeaten && game.phase === "defend");
                  const tableThrowable = Boolean(
                    highlightUnbeaten &&
                      (game.phase === "attack_toss" || game.phase === "player_can_throw_more"),
                  );
                  const stackZ = 20 + i;

                  return (
                    <div
                      key={tp.attack.id}
                      className="pointer-events-auto absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                        zIndex: stackZ,
                      }}
                    >
                      {/* Габариты задаёт CardSprite (aspect-ratio колоды), без фиксированного «пухлого» блока. */}
                      <div className="relative flex min-h-0 items-end justify-center overflow-visible">
                        <div className="absolute bottom-0 left-1/2 z-[20] -translate-x-1/2">
                          <CardSprite
                            card={tp.attack}
                            size="tableCompact"
                            surface="table"
                            selected={!!attackSelectedForDefense}
                            disabled={false}
                            className={cn(
                              DURAK_ATTACK_CARD_CLASS,
                              tableTargetable && GAME_CARD_IS_TARGETABLE_CLASS,
                              tableThrowable && GAME_CARD_IS_THROWABLE_CLASS,
                            )}
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
                        </div>

                        {tp.defense ? (
                          <div
                            key={`def-wrap-${tp.defense.id}`}
                            className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2"
                          >
                            {/*
                              Чуть левее и ниже центра атаки: заметнее перекрывает, угол нижней карты с достоинством читаем.
                            */}
                            <motion.div
                              key={`def-${tp.defense.id}`}
                              className="origin-bottom"
                              initial={{ opacity: 0, x: 4, y: 4 }}
                              animate={{ opacity: 1, x: 10, y: 9 }}
                              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                            >
                              <CardSprite
                                card={tp.defense}
                                size="tableCompact"
                                surface="table"
                                className={DURAK_DEFEND_CARD_CLASS}
                              />
                            </motion.div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : null}
            </div>
          </div>

        </div>

        <div className="pointer-events-none absolute inset-0 z-[32] overflow-visible">
          {opponentTablePlacements.map((pl) => (
            <div
              key={`fan-${pl.oppId}`}
              className="pointer-events-none absolute z-[32]"
              style={{
                left: `calc(50% + ${pl.fanAx}px)`,
                top: layout.centerY + pl.fanAy,
                transform: `translate(-50%, -50%) rotate(${pl.fanRot}deg) scale(${pl.mults.scale})`,
                transformOrigin: "center center",
              }}
            >
              <div
                className="relative flex max-w-full items-end justify-center overflow-visible"
                style={{
                  height: `min(${pl.mults.handHeightRem}rem, 28vw)`,
                  width: `min(${pl.mults.handWidthRem}rem, 30vw)`,
                  maxWidth: "min(6.25rem, 30vw)",
                  transformOrigin: "center bottom",
                }}
              >
                {(pl.bh.length > 0 ? pl.bh : [null]).map((c, i) => (
                  <div
                    key={c?.id ?? `opponent-hand-placeholder-${pl.oppId}`}
                    className="absolute"
                    style={opponentTableFanStyle(
                      Math.max(1, pl.bh.length),
                      i,
                      pl.mults,
                      1,
                      {
                        compact: true,
                        durakOpponent: true,
                      },
                    )}
                  >
                    <motion.div
                      className="[transform:translateZ(0)]"
                      initial={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                      transition={{ duration: 0 }}
                    >
                      <CardSprite faceDown size="tableCompact" surface="opponent" />
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {opponentTablePlacements.map((pl) => (
            <div
              key={`lbl-${pl.oppId}`}
              className="pointer-events-none absolute z-[32] max-w-[min(9.5rem,24vw)] text-center"
              style={{
                left: `calc(50% + ${pl.lx}px)`,
                top: layout.centerY + pl.ly,
                transform: "translate(-50%, -50%)",
              }}
            >
              <p className="truncate text-[12px] font-medium leading-tight text-white/90 sm:text-[13px]">
                {pl.oppName?.trim() || "Соперник"}
              </p>
              <p className="text-[10px] leading-tight text-white/45">{pl.bh.length} карт</p>
            </div>
          ))}
        </div>

      <div
        className="pointer-events-none absolute inset-x-0 z-[40] mx-auto flex max-w-[min(100%,580px)] flex-col px-1 sm:px-2"
        style={{
          top: layout.playerZoneTopY,
          bottom: layout.tabBarReservePx,
          minHeight: 0,
        }}
      >
        <div className="pointer-events-auto relative z-[40] shrink-0 pt-0.5">
        <div className="relative z-[40] grid w-full min-w-0 grid-cols-2 items-center gap-x-1.5 gap-y-1 px-0.5 sm:gap-x-3">
          <div className="flex min-w-0 justify-center">
            <button
              type="button"
              onClick={restart}
              className="shrink-0 rounded-full border border-white/[0.14] bg-white/[0.06] px-2 py-1.5 text-[10px] font-medium text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-sm transition hover:border-amber-300/25 hover:bg-white/[0.1] sm:px-3 sm:py-2 sm:text-[11px]"
            >
              {embedded ? "Стол" : "Меню"}
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
                  className="shrink-0 rounded-full border border-[#f8d66d]/40 bg-gradient-to-b from-amber-500/25 to-amber-900/35 px-2 py-1.5 text-[10px] font-semibold text-amber-50 shadow-[0_6px_20px_rgba(248,214,109,0.18)] hover:brightness-110 disabled:opacity-40 sm:px-3 sm:text-[11px]"
                >
                  Атаковать
                </button>
              ) : null}
              {selfCanTossCards && tossPick.length > 0 ? (
                <button
                  type="button"
                  onClick={onTossSubmit}
                  disabled={!tossValid || game.state !== "playing"}
                  className="shrink-0 rounded-full border border-[#f8d66d]/35 bg-amber-900/40 px-1.5 py-1 text-[9px] font-semibold text-amber-50 shadow-sm hover:bg-amber-800/45 disabled:opacity-40 sm:px-2.5 sm:text-[10px]"
                >
                  Подкинуть
                </button>
              ) : null}
              {selfShowBitoForToss ? (
                <button
                  type="button"
                  onClick={onBeat}
                  disabled={game.state !== "playing"}
                  className="shrink-0 rounded-full border border-emerald-400/50 bg-gradient-to-b from-emerald-600/35 to-emerald-900/45 px-2 py-1.5 text-[10px] font-semibold text-emerald-50 shadow-[0_6px_20px_rgba(16,185,129,0.15)] hover:brightness-110 disabled:opacity-40 sm:px-3 sm:text-[11px]"
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

        {phaseLine ? (
        <div
          className="z-[40] mt-1 flex w-full flex-col items-center gap-1 px-2"
          role="status"
        >
          <div className="pointer-events-auto flex w-full min-w-0 max-w-[min(100%,520px)] items-center justify-center gap-2 sm:gap-3">
            {embedded &&
            game.state === "playing" &&
            !dealing &&
            getOnlineMandatoryHumanActorId(game) != null ? (
              <TurnDeadlineRing progress={turnProgress} />
            ) : null}
            <motion.p
              key={phaseLine}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={cn(
                "line-clamp-4 min-w-0 flex-1 rounded-full px-4 py-2 text-center text-[10px] font-medium leading-snug shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-sm sm:py-2 sm:text-[11px]",
                statusStripHighlightAttackerTurn
                  ? "border border-[#f8d66d]/55 bg-gradient-to-b from-[#f8d66d]/22 via-amber-950/25 to-[#1a1410] font-semibold text-[#fff8e8] shadow-[0_0_28px_rgba(248,214,109,0.18)]"
                  : "border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] text-emerald-50/95",
              )}
            >
              {phaseLine}
            </motion.p>
          </div>
          {microFlavour ? (
            <p className="max-w-[20rem] text-center text-[9px] font-normal italic leading-snug text-white/38 sm:text-[10px]">
              {microFlavour}
            </p>
          ) : null}
        </div>
        ) : null}

        <div
          className="pointer-events-auto z-[40] shrink-0 px-1 pt-1 sm:px-2"
          style={{ paddingLeft: layout.deckNameClearanceLeftPx }}
        >
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
        </div>
        {game.message ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-0.5 shrink-0 rounded-lg border border-amber-500/35 bg-amber-950/50 px-2 py-1 text-center text-[11px] text-amber-100/95"
            role="status"
          >
            {game.message}
          </motion.div>
        ) : null}
        <div
          className={cn(
            "player-hand pointer-events-auto relative z-[35] mx-auto mt-2 flex w-full min-h-0 flex-1 flex-col justify-end overflow-visible pb-1 pt-1 sm:mt-2",
            humanHandRows.length > 1
              ? "min-h-[12rem] sm:min-h-[14rem]"
              : "min-h-[9.5rem] sm:min-h-[10.5rem]"
          )}
          style={{
            transform: `scale(${DURAK_SCENE_PLAYER_HAND_SCALE})`,
            transformOrigin: "bottom center",
          }}
        >
          {humanHandRows.map((row, rowIdx) => (
            <div
              key={row[0]?.id ?? `hand-row-${rowIdx}`}
              className={cn(
                "pointer-events-none absolute inset-x-0 flex justify-center overflow-visible",
                humanHandRows.length > 1
                  ? undefined
                  : "bottom-0 h-[min(13.5rem,52vw)] sm:h-[min(14rem,48vw)]"
              )}
              style={
                humanHandRows.length > 1
                  ? {
                      bottom: (humanHandRows.length - 1 - rowIdx) * HAND_ROW_GAP_PX,
                      height: "min(12.5rem, 50vw)",
                      zIndex: 10 + rowIdx,
                    }
                  : undefined
              }
            >
              <div className="pointer-events-auto relative h-full w-full max-w-[100vw] overflow-visible">
                {row.map((c, i) => {
                  const selAttack =
                    game.phase === "attack_initial" && selfIsAttacker && attackPick.includes(c.id);
                  const selToss = selfCanTossCards && tossPick.includes(c.id);

                  const attackPlayable =
                    selfIsAttacker && game.phase === "attack_initial" && game.state === "playing";

                  const tossPlayable =
                    selfCanTossCards && game.state === "playing" && ranksOnTable.has(c.rank);

                  const defendPlayable = defendPlayableFor(c);

                  let playable = false;
                  if (game.state === "playing" && !dealing) {
                    if (selfIsAttacker && game.phase === "attack_initial") playable = attackPlayable;
                    else if (selfCanTossCards) playable = tossPlayable;
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
                      : selfCanTossCards
                        ? () => {
                            if (!tossPlayable) return;
                            setTossPick((p) =>
                              toggleTossSelection(humanHand, p, c.id, ranksOnTable)
                            );
                            setGame((g) => (g ? { ...g, message: null } : g));
                          }
                        : selfIsDefender && game.phase === "defend"
                          ? () => {
                              if (!defendPlayable) return;
                              onDefendCard(c.id);
                            }
                          : undefined;

                  const fan = handFanStyle(row.length, i, "player");

                  const cardInner = (
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
                  );

                  return (
                    <div key={c.id} className="absolute" style={fan}>
                      {dealing ? (
                        <motion.div
                          initial={{ opacity: 0, y: 48, scale: 0.92, rotate: -2 }}
                          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                          transition={{
                            ...SPRING_SOFT,
                            delay: rowIdx * 0.06 + i * DEAL_STAGGER_SEC,
                          }}
                        >
                          {cardInner}
                        </motion.div>
                      ) : (
                        <div
                          className="will-change-transform"
                          style={
                            selected
                              ? { transform: "translateY(-3.25rem)" }
                              : undefined
                          }
                        >
                          {cardInner}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

      <AnimatePresence>
        {game.state === "finished" ? (
          <motion.div
            key="durak-win-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="durak-result-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          >
            {game.winnerId === localPlayerId ? <WinConfetti /> : null}
            <motion.div
              id="durak-result-panel"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-[1.35rem] border border-[#f8d66d]/25 bg-gradient-to-b from-[#1c1612] via-[#14100c] to-[#0c0a08] px-8 py-9 text-center shadow-[0_28px_90px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <div
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#f8d66d]/45 to-transparent"
                aria-hidden
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f8d66d]/80">
                {game.winnerId === localPlayerId
                  ? wonByForfeit
                    ? "Техническая победа"
                    : "Партия за тобой"
                  : "ПАРТИЯ СЫГРАНА"}
              </p>
              <p
                id="durak-result-title"
                className="mt-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-[1.65rem]"
              >
                {wonByForfeit
                  ? "Соперник вышел из игры — ты победил! 🥇"
                  : game.winnerId === localPlayerId
                    ? `${selfPlayer?.name ?? playerName}, блеск!`
                    : lossResultTitle ||
                      `${(selfPlayer?.name ?? playerName).trim() || "Игрок"}, следующий раунд твой`}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/55">
                {wonByForfeit
                  ? "Соперник не выходил на связь больше отведённого времени — стол закрыт."
                  : game.loserId === localPlayerId
                    ? "Почти дожала. Соберись и заходи на новый раунд."
                    : game.winnerId === localPlayerId
                      ? "Ты первой сбросила все карты — давай ещё одну партию."
                      : ""}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={restart}
                  className="w-full rounded-full bg-[#f8d66d] px-6 py-3.5 text-sm font-semibold text-[#1a1612] shadow-[0_10px_36px_rgba(248,214,109,0.25)] transition hover:brightness-105 sm:w-auto sm:min-w-[10.5rem]"
                >
                  {game.loserId === localPlayerId
                    ? "Новая партия"
                    : embedded
                      ? "Новая партия"
                      : "Реванш"}
                </button>
                {!embedded ? (
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="w-full rounded-full border border-white/18 bg-white/[0.05] px-6 py-3.5 text-sm font-medium text-white/85 transition hover:border-white/28 hover:bg-white/[0.08] sm:w-auto"
                  >
                    На главную
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
