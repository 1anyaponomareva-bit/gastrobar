import type { Card, GameTable, PlayerType, Rank, Suit, TablePair } from "./types";
import {
  canBeat,
  createDeck36,
  findFirstAttackerIndex,
  rankValue,
  shuffle,
  sortHand,
  SUITS,
} from "./cards";

export { canBeat, rankValue, sortHand, SUITS };

function tableId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `durak-${Date.now()}`;
}

export function createInitialPlayersMvp(names?: { human: string; bot: string }): GameTable["players"] {
  const humanName = names?.human && names.human.length > 0 ? names.human : "Вы";
  const botName = names?.bot && names.bot.length > 0 ? names.bot : "Бот";
  return [
    {
      id: "human",
      name: humanName,
      type: "human",
      hand: [],
      seatIndex: 0,
    },
    {
      id: "bot",
      name: botName,
      type: "bot",
      hand: [],
      seatIndex: 1,
    },
  ];
}

/** Следующий защитник по кругу от атакующего (масштабируется на 3–5 игроков). */
export function nextDefenderIndex(attackerIndex: number, playerCount: number): number {
  return (attackerIndex + 1) % playerCount;
}

/** Индексы всех подкидывающих по часовой стрелке от текущего атакующего, без защитника. */
export function attackingSeatOrder(table: GameTable): number[] {
  const n = table.players.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (table.attackerIndex + i) % n;
    if (j !== table.defenderIndex) out.push(j);
  }
  return out;
}

export function drawCardsFromDeck(table: GameTable, firstIndex: number): GameTable {
  const players = table.players.map((p) => ({ ...p, hand: [...p.hand] }));
  const deck = [...table.deck];
  if (deck.length === 0) {
    return {
      ...table,
      players: players.map((p) => ({ ...p, hand: sortHand(p.hand) })),
      trumpCard: null,
    };
  }

  const n = players.length;
  let guard = 0;
  let changed = true;
  while (changed && deck.length > 0 && guard < 200) {
    guard += 1;
    changed = false;
    for (let k = 0; k < n; k++) {
      const i = (firstIndex + k) % n;
      if (players[i].hand.length < 6 && deck.length > 0) {
        players[i].hand.push(deck.shift()!);
        changed = true;
      }
    }
  }

  const trumpCard = deck.length > 0 ? deck[deck.length - 1]! : null;

  return {
    ...table,
    players: players.map((p) => ({ ...p, hand: sortHand(p.hand) })),
    deck,
    trumpCard,
  };
}

function checkGameEnd(t: GameTable): GameTable {
  if (t.state === "finished") return t;
  if (t.tablePairs.length > 0) return t;

  const noCards = t.players.filter((p) => p.hand.length === 0);
  if (t.deck.length === 0 && noCards.length >= 1) {
    const winner = noCards[0]!;
    const loser = t.players.find((p) => p.hand.length > 0) ?? null;
    return {
      ...t,
      state: "finished",
      phase: "game_over",
      winnerId: winner.id,
      loserId: loser?.id ?? null,
      message: null,
    };
  }
  return t;
}

export function newGame(names?: { human: string; bot: string }): GameTable {
  const deckShuffled = shuffle(createDeck36());
  const players = createInitialPlayersMvp(names);

  const deck = [...deckShuffled];
  for (let round = 0; round < 6; round++) {
    for (let p = 0; p < players.length; p++) {
      const c = deck.shift();
      if (c) players[p]!.hand.push(c);
    }
  }

  const trumpCard = deck.length > 0 ? deck[deck.length - 1]! : null;
  const trumpSuit: Suit = trumpCard?.suit ?? "spades";

  for (const pl of players) {
    pl.hand = sortHand(pl.hand);
  }

  const attackerIndex = findFirstAttackerIndex(players, trumpSuit);
  const defenderIndex = nextDefenderIndex(attackerIndex, players.length);

  let table: GameTable = {
    id: tableId(),
    mode: "podkidnoy",
    players,
    deck,
    trumpCard,
    trumpSuit,
    tablePairs: [],
    discardPile: [],
    attackerIndex,
    defenderIndex,
    state: "playing",
    phase: "attack_initial",
    winnerId: null,
    loserId: null,
    roundDefenderInitialHand: 0,
    message: null,
  };
  table = checkGameEnd(table);
  return table;
}

/** Онлайн / N игроков: раздача по кругу 6 карт каждому, затем как в `newGame`. */
export function newGameForPlayers(
  slots: { id: string; name: string; type: PlayerType }[]
): GameTable {
  const n = slots.length;
  if (n < 2) {
    throw new Error("Нужно минимум 2 игрока");
  }
  const deckShuffled = shuffle(createDeck36());
  const players = slots.map((s, seatIndex) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    hand: [] as Card[],
    seatIndex,
  }));

  const deck = [...deckShuffled];
  for (let round = 0; round < 6; round++) {
    for (let p = 0; p < n; p++) {
      const c = deck.shift();
      if (c) players[p]!.hand.push(c);
    }
  }

  const trumpCard = deck.length > 0 ? deck[deck.length - 1]! : null;
  const trumpSuit: Suit = trumpCard?.suit ?? "spades";

  for (const pl of players) {
    pl.hand = sortHand(pl.hand);
  }

  const attackerIndex = findFirstAttackerIndex(players, trumpSuit);
  const defenderIndex = nextDefenderIndex(attackerIndex, players.length);

  let table: GameTable = {
    id: tableId(),
    mode: "podkidnoy",
    players,
    deck,
    trumpCard,
    trumpSuit,
    tablePairs: [],
    discardPile: [],
    attackerIndex,
    defenderIndex,
    state: "playing",
    phase: "attack_initial",
    winnerId: null,
    loserId: null,
    roundDefenderInitialHand: 0,
    message: null,
  };
  table = checkGameEnd(table);
  return table;
}

export function attackInitial(
  table: GameTable,
  attackerId: string,
  cardIds: string[]
): { table: GameTable } | { error: string } {
  if (table.state !== "playing" || table.phase !== "attack_initial") {
    return { error: "Сейчас нельзя атаковать" };
  }
  const attacker = table.players[table.attackerIndex];
  if (attacker.id !== attackerId) {
    return { error: "Не ваш ход (атака)" };
  }
  if (cardIds.length === 0) {
    return { error: "Выберите карты для атаки" };
  }

  const cards = cardIds
    .map((id) => attacker.hand.find((c) => c.id === id))
    .filter((c): c is Card => c != null);
  if (cards.length !== cardIds.length) {
    return { error: "Карты не найдены в руке" };
  }

  const rank = cards[0]!.rank;
  if (!cards.every((c) => c.rank === rank)) {
    return { error: "Все карты атаки должны быть одного достоинства" };
  }

  const defender = table.players[table.defenderIndex]!;
  const roundDefenderInitialHand = defender.hand.length;

  const newPlayers = table.players.map((p, i) => {
    if (i !== table.attackerIndex) return { ...p, hand: [...p.hand] };
    return { ...p, hand: p.hand.filter((c) => !cardIds.includes(c.id)) };
  });

  const tablePairs: TablePair[] = cards.map((c) => ({ attack: c, defense: null }));

  let next: GameTable = {
    ...table,
    players: newPlayers.map((p) => ({ ...p, hand: sortHand(p.hand) })),
    tablePairs,
    roundDefenderInitialHand,
    phase: "defend",
    message: null,
  };
  next = checkGameEnd(next);
  return { table: next };
}

export function defendPlay(
  table: GameTable,
  defenderId: string,
  attackCardId: string,
  defenseCardId: string
): { table: GameTable } | { error: string } {
  if (table.phase !== "defend") {
    return { error: "Сейчас не защита" };
  }
  const defender = table.players[table.defenderIndex];
  if (defender.id !== defenderId) {
    return { error: "Не ваш ход (защита)" };
  }

  const pair = table.tablePairs.find(
    (p) => p.attack.id === attackCardId && p.defense === null
  );
  if (!pair) {
    return { error: "Нет непокрытой атаки с этой картой" };
  }

  const defCard = defender.hand.find((c) => c.id === defenseCardId);
  if (!defCard) {
    return { error: "Карта не в руке" };
  }
  if (!canBeat(pair.attack, defCard, table.trumpSuit)) {
    return { error: "Этой картой нельзя побить" };
  }

  const newPlayers = table.players.map((p, i) => {
    if (i !== table.defenderIndex) return { ...p, hand: [...p.hand] };
    return { ...p, hand: p.hand.filter((c) => c.id !== defenseCardId) };
  });

  const tablePairs = table.tablePairs.map((tp) =>
    tp.attack.id === attackCardId ? { ...tp, defense: defCard } : tp
  );

  let next: GameTable = {
    ...table,
    players: newPlayers.map((p) => ({ ...p, hand: sortHand(p.hand) })),
    tablePairs,
    message: null,
  };

  if (tablePairs.every((tp) => tp.defense !== null)) {
    next.phase = "attack_toss";
  }

  next = checkGameEnd(next);
  return { table: next };
}

/**
 * Защитник отказался отбиваться (для бота — переход к фазе подкидывания атакующим до «Бито»).
 */
export function defenderCannotBeat(
  table: GameTable,
  defenderId: string
): { table: GameTable } | { error: string } {
  if (table.phase !== "defend") {
    return { error: "Сейчас не защита" };
  }
  const defender = table.players[table.defenderIndex];
  if (defender.id !== defenderId) {
    return { error: "Только защитник отказывается от отбоя" };
  }
  if (!table.tablePairs.some((tp) => tp.defense === null)) {
    return { error: "Всё уже отбито" };
  }
  return {
    table: {
      ...table,
      phase: "player_can_throw_more",
      message: null,
    },
  };
}

export function defenderTake(table: GameTable, defenderId: string): { table: GameTable } | { error: string } {
  if (
    table.phase !== "defend" &&
    table.phase !== "attack_toss" &&
    table.phase !== "player_can_throw_more"
  ) {
    return { error: "Нельзя взять сейчас" };
  }
  const defender = table.players[table.defenderIndex];
  if (defender.id !== defenderId) {
    return { error: "Только защитник берёт" };
  }

  const taken: Card[] = [];
  for (const tp of table.tablePairs) {
    taken.push(tp.attack);
    if (tp.defense) taken.push(tp.defense);
  }

  const newPlayers = table.players.map((p, i) => {
    if (i !== table.defenderIndex) return { ...p, hand: [...p.hand] };
    return { ...p, hand: sortHand([...p.hand, ...taken]) };
  });

  const n = table.players.length;
  const takerIndex = table.defenderIndex;
  /** После взятия карт следующий атакующий — игрок слева от взявшего (не тот же «первый» атакующий снова на взявшего). */
  const newAttacker = nextDefenderIndex(takerIndex, n);
  const newDefender = nextDefenderIndex(newAttacker, n);

  let next: GameTable = {
    ...table,
    players: newPlayers,
    tablePairs: [],
    attackerIndex: newAttacker,
    defenderIndex: newDefender,
    phase: "attack_initial",
    message: null,
  };

  next = drawCardsFromDeck(next, takerIndex);
  next = checkGameEnd(next);
  return { table: next };
}

export function attackerBeat(table: GameTable, attackerId: string): { table: GameTable } | { error: string } {
  if (table.phase !== "attack_toss") {
    return { error: "«Бито» только после отбоя" };
  }
  const attacker = table.players[table.attackerIndex];
  if (attacker.id !== attackerId) {
    return { error: "Не ваш ход" };
  }
  if (!table.tablePairs.every((tp) => tp.defense !== null)) {
    return { error: "Не всё отбито" };
  }

  const toDiscard: Card[] = [];
  for (const tp of table.tablePairs) {
    toDiscard.push(tp.attack);
    if (tp.defense) toDiscard.push(tp.defense);
  }

  const n = table.players.length;
  const oldAtt = table.attackerIndex;
  const oldDef = table.defenderIndex;
  const newAttacker = oldDef;
  const newDefender = nextDefenderIndex(oldDef, n);

  let next: GameTable = {
    ...table,
    tablePairs: [],
    discardPile: [...table.discardPile, ...toDiscard],
    attackerIndex: newAttacker,
    defenderIndex: newDefender,
    phase: "attack_initial",
    message: null,
  };

  next = drawCardsFromDeck(next, oldAtt);
  next = checkGameEnd(next);
  return { table: next };
}

export function attackToss(
  table: GameTable,
  attackerId: string,
  cardIds: string[]
): { table: GameTable } | { error: string } {
  if (table.phase !== "attack_toss" && table.phase !== "player_can_throw_more") {
    return { error: "Сейчас не фаза подкидывания" };
  }
  const actorIndex = table.players.findIndex((p) => p.id === attackerId);
  if (actorIndex < 0) {
    return { error: "Игрок не найден" };
  }
  if (actorIndex === table.defenderIndex) {
    return { error: "Защитник не подкидывает" };
  }

  const actor = table.players[actorIndex]!;

  const ranksOnTable = new Set<Rank>();
  for (const tp of table.tablePairs) {
    ranksOnTable.add(tp.attack.rank);
    if (tp.defense) ranksOnTable.add(tp.defense.rank);
  }

  const cards = cardIds
    .map((id) => actor.hand.find((c) => c.id === id))
    .filter((c): c is Card => c != null);
  if (cards.length !== cardIds.length) {
    return { error: "Карты не найдены" };
  }
  if (!cards.every((c) => ranksOnTable.has(c.rank))) {
    return { error: "Можно подкидывать только по достоинствам на столе" };
  }

  if (table.tablePairs.length + cards.length > table.roundDefenderInitialHand) {
    return { error: "Превышен лимит карт для подкидывания" };
  }

  const newPlayers = table.players.map((p, i) => {
    if (i !== actorIndex) return { ...p, hand: [...p.hand] };
    return { ...p, hand: p.hand.filter((c) => !cardIds.includes(c.id)) };
  });

  const newPairs: TablePair[] = [
    ...table.tablePairs,
    ...cards.map((c) => ({ attack: c, defense: null as Card | null })),
  ];

  const nextPhase =
    table.phase === "player_can_throw_more" ? "player_can_throw_more" : "defend";

  let next: GameTable = {
    ...table,
    players: newPlayers.map((p) => ({ ...p, hand: sortHand(p.hand) })),
    tablePairs: newPairs,
    phase: nextPhase,
    message: null,
  };
  next = checkGameEnd(next);
  return { table: next };
}