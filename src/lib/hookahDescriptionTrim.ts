/**
 * Текст карточки кальяна обрезается в UI (~3 строки). Добавляем только целые
 * предложения (и при необходимости целые части до « — »), без оборванной фразы с …
 */

const DEFAULT_MAX_CHARS = 132;

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Целые предложения по . ! ? … (без разрыва на «т. п.» и т. п.) */
function splitSentences(text: string): string[] {
  const t = normalizeSpaces(text);
  if (!t) return [];
  return t
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Части до/после длинного тире — часто два законченных смысла в одном «предложении» */
function splitDashClauses(text: string): string[] {
  const t = normalizeSpaces(text);
  return t
    .split(/\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Под узкий экран (~3 строки): только целые предложения; если второе не влезает — не показываем.
 * Одно длинное предложение: пробуем целиком первый смысловой блок до « — »; иначе whole first sentence
 * (без line-clamp — текст может перенестись на строку больше, но без обрыва «на полуслове»).
 */
export function hookahDescriptionForCard(
  description: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  const raw = normalizeSpaces(description);
  if (!raw) return "";

  let acc = "";
  for (const sent of splitSentences(raw)) {
    const next = acc ? `${acc} ${sent}` : sent;
    if (next.length <= maxChars) acc = next;
    else break;
  }
  if (acc) return acc;

  const firstSentence = splitSentences(raw)[0] ?? raw;
  acc = "";
  for (const part of splitDashClauses(firstSentence)) {
    const next = acc ? `${acc} — ${part}` : part;
    if (next.length <= maxChars) acc = next;
    else break;
  }
  if (acc) return acc;

  const dashParts = splitDashClauses(firstSentence);
  if (dashParts.length > 0) return dashParts[0]!;
  return firstSentence;
}
