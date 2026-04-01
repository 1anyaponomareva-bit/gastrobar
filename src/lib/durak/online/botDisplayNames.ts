/** Имена «как у живого игрока» для заполнения места ботом (и в БД, и на клиенте). */
export const ONLINE_BOT_DISPLAY_NAMES = [
  "Алексей",
  "Марина",
  "Дмитрий",
  "Ольга",
  "Иван",
  "Елена",
  "Сергей",
  "Анна",
  "Павел",
  "Катя",
  "Миша",
  "Саша",
  "Никита",
  "Даша",
] as const;

/** Стабильное имя по строке (комната + id бота), чтобы не мигало между рендерами. */
export function stableBotDisplayName(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % ONLINE_BOT_DISPLAY_NAMES.length;
  return ONLINE_BOT_DISPLAY_NAMES[idx]!;
}
