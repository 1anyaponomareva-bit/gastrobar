/** Названия столов с друзьями: без дефолта «наш стол», уникальность среди уже видимых лобби. */

const DRINK_PIECES = [
  "По пиву",
  "За лагером",
  "На вине",
  "Под сидр",
  "После джина",
  "Ром и лайм",
  "Виски-кола",
  "Мохито",
  "Негрони",
  "Глинтвейн",
  "Барная стойка",
  "У барной",
  "Коктейльный час",
  "Олд фэшн",
  "Просекко",
  "Апероль",
  "Тёмное и дурак",
  "Лёгкое IPA",
  "Крафт за углом",
  "Лавка портера",
  "Светлое местечко",
  "Шот на входе",
  "Люди и пинта",
  "Бокал на двоих",
  "Наливай по честному",
  "Клин табаско",
  "Лимонад с мятой",
  "Сангрия",
  "Холодное пиво",
  "Горячий пунш",
  "Безалкогольно, но весело",
  "С бокалом шардоне",
  "Игристое",
  "Пивной дворик",
  "Три кружки",
  "Второй раунд",
  "Дайте карты",
  "Туз и тоник",
  "Козырь и кола",
  "Битер на столе",
  "Лонг айленд",
  "Калифорния",
  "Белый русский",
  "Эспрессо мартини",
  "Без пафоса, с пивом",
] as const;

const COLLISION_SUFFIX = [
  "ещё кружка",
  "новая партия",
  "другой налив",
  "второй заход",
  "соседний стол",
  "рядом с баром",
  "у окна",
  "в углу",
  "с террасы",
  "после перерыва",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function normTableNameKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU");
}

/** Одна или две случайные «барные» фразы. */
export function randomDrinkTableName(): string {
  const a = pick(DRINK_PIECES);
  const b = pick(DRINK_PIECES);
  if (a === b) return a;
  return `${a} · ${b}`;
}

export function randomDrinkTableNameUnique(takenKeys: Set<string>): string {
  for (let i = 0; i < 96; i++) {
    const n = randomDrinkTableName();
    if (!takenKeys.has(normTableNameKey(n))) return n;
  }
  for (let i = 0; i < 32; i++) {
    const n = `${pick(DRINK_PIECES)} · ${pick(DRINK_PIECES)} #${100 + Math.floor(Math.random() * 900)}`;
    if (!takenKeys.has(normTableNameKey(n))) return n;
  }
  return `Безымянный бар ${Date.now() % 100000}`;
}

/**
 * Сохраняет ввод пользователя, если ключ не занят; иначе — хвост из тематики бара или число.
 */
export function uniqueFriendTableName(preferred: string, takenKeys: Set<string>): string {
  const base = preferred.trim().replace(/\s+/g, " ");
  if (!base) return randomDrinkTableNameUnique(takenKeys);

  if (!takenKeys.has(normTableNameKey(base))) return base;

  for (let i = 0; i < 48; i++) {
    const withSuffix = `${base} · ${pick(COLLISION_SUFFIX)}`;
    if (!takenKeys.has(normTableNameKey(withSuffix))) return withSuffix;
  }

  return `${base} (${1000 + Math.floor(Math.random() * 9000)})`;
}

export function tableNameKeysFromPublicRows(rows: { table_name: string | null }[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    const k = normTableNameKey(r.table_name ?? "");
    if (k) s.add(k);
  }
  return s;
}
