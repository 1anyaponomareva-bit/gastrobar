/**
 * Модель «игрового стола» под будущее расширение 2–5 игроков и онлайн.
 * Сейчас MVP: 2 места, human vs bot.
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export type PlayerType = "human" | "bot" | "remote";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

/** Пара атака / отбой на столе. */
export interface TablePair {
  attack: Card;
  /** null — ещё не отбита */
  defense: Card | null;
}

export type GameTableState = "waiting" | "playing" | "finished";

/** Фазы партии (узкая машина состояний). */
export type GamePhase =
  | "attack_initial" // атакующий выкладывает первую атаку (одна или несколько карт одного ранга)
  | "defend" // защитник отбивается по каждой непокрытой атаке
  | "attack_toss" // подкидной: атакующий подкидывает по рангам на столе или жмёт «Бито»
  /** Защитник не смог отбиться; атакующий подкидывает по тем же правилам, затем «Бито» — забирает защитник. */
  | "player_can_throw_more"
  | "drawing" // добор (внутренний шаг)
  | "game_over";

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  hand: Card[];
  /** Место за столом 0..n-1 — по кругу относительно UI */
  seatIndex: number;
}

export type DurakMode = "podkidnoy";

export interface GameTable {
  id: string;
  mode: DurakMode;
  players: Player[];
  /** Колода: индекс 0 — верх (берём shift), последняя карта — козырь до исчерпания */
  deck: Card[];
  /** Открытый козырь (последняя в колоде до раздачи добора); может уйти в руку в конце */
  trumpCard: Card | null;
  trumpSuit: Suit;
  tablePairs: TablePair[];
  discardPile: Card[];
  /** Индексы в players[] — для 3–5 игроков: защитник = следующий по кругу от атакующего */
  attackerIndex: number;
  defenderIndex: number;
  state: GameTableState;
  phase: GamePhase;
  winnerId: string | null;
  loserId: string | null;
  /** Сколько карт было у защитника в начале текущего раунда (лимит подкидывания) */
  roundDefenderInitialHand: number;
  /** Сообщение для UI (ошибка хода и т.д.) */
  message: string | null;
}
