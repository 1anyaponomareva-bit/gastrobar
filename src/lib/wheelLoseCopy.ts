/**
 * Тексты проигрышных секторов колеса («мимо», «без бонуса»).
 * Случайный выбор без повтора одного и того же варианта подряд (sessionStorage).
 */

export type WheelLoseCopyBundle = {
  title: string;
  subtitle: string;
  /** Мелкая серая строка под жёлтой кнопкой (подсказка с напитком). */
  footer: string;
};

const STORAGE_LAST_MIMO = "gastrobar_wheel_lose_mimo_last_ix";
const STORAGE_LAST_NO_BONUS = "gastrobar_wheel_lose_nobonus_last_ix";

export const loseTexts: readonly WheelLoseCopyBundle[] = [
  {
    title: "В этот раз мимо 😏",
    subtitle: "Но вкус уже есть",
    footer: "Попробуй Виски Сауэр 👀",
  },
  {
    title: "Мимо 😏",
    subtitle: "Но направление верное",
    footer: "Бармен сегодня чаще наливает Sapporo 👀",
  },
  {
    title: "Не выпало 😏",
    subtitle: "Но здесь сложно ошибиться",
    footer: "Попробуй Лонг Айленд 👀",
  },
  {
    title: "Мимо 😏",
    subtitle: "Но вечер только начинается",
    footer: "Бармен сегодня часто делает Б-52 👀",
  },
  {
    title: "В этот раз мимо 😏",
    subtitle: "Но выбор уже хороший",
    footer: "Сейчас часто берут Виски Сауэр 👀",
  },
];

export const noBonusTexts: readonly WheelLoseCopyBundle[] = [
  {
    title: "Без бонуса… но с хорошим вкусом 😉",
    subtitle: "А это здесь важнее",
    footer: "Бармен сегодня чаще наливает Sapporo 👀",
  },
  {
    title: "Сегодня без бонуса 😉",
    subtitle: "Но выбор отличный",
    footer: "Попробуй Виски Сауэр 👀",
  },
  {
    title: "Без бонуса 😉",
    subtitle: "Зато вкус уже есть",
    footer: "Попробуй Лонг Айленд 👀",
  },
  {
    title: "Сегодня так 😉",
    subtitle: "Но всё по делу",
    footer: "Бармен сегодня часто делает Б-52 👀",
  },
  {
    title: "Без бонуса 😉",
    subtitle: "Но здесь сложно ошибиться",
    footer: "Сейчас часто берут Sapporo 👀",
  },
];

function readLastIndex(key: string): number {
  if (typeof window === "undefined") return -1;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw == null) return -1;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

function writeLastIndex(key: string, index: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, String(index));
  } catch {
    /* ignore */
  }
}

function pickNonRepeating(length: number, storageKey: string): number {
  if (length <= 0) return 0;
  if (length === 1) return 0;
  const last = readLastIndex(storageKey);
  let idx = Math.floor(Math.random() * length);
  let guard = 0;
  while (idx === last && guard < 32) {
    idx = Math.floor(Math.random() * length);
    guard += 1;
  }
  writeLastIndex(storageKey, idx);
  return idx;
}

export function pickMimoLoseCopy(): WheelLoseCopyBundle {
  const i = pickNonRepeating(loseTexts.length, STORAGE_LAST_MIMO);
  return loseTexts[i]!;
}

export function pickNoBonusLoseCopy(): WheelLoseCopyBundle {
  const i = pickNonRepeating(noBonusTexts.length, STORAGE_LAST_NO_BONUS);
  return noBonusTexts[i]!;
}
