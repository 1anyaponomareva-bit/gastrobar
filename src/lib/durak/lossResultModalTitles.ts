/** Короткие заголовки модалки поражения — случайный при каждой новой завершённой партии. */

const LOSS_RESULT_TITLE_TEMPLATES = [
  "{name}, следующий раунд твой",
  "{name}, почти забрала",
  "{name}, ещё один заход",
  "{name}, сейчас будет реванш",
  "{name}, это только разогрев",
  "{name}, давай по новой",
  "{name}, не в этот раз",
  "{name}, почти дожала",
  "{name}, игра только началась",
  "{name}, ещё круг — и заберёшь",
  "{name}, на волоске",
  "{name}, видела же как шло",
] as const;

export function getRandomLossResultTitle(name: string): string {
  const safe = name.trim() || "Игрок";
  const tpl =
    LOSS_RESULT_TITLE_TEMPLATES[Math.floor(Math.random() * LOSS_RESULT_TITLE_TEMPLATES.length)]!;
  return tpl.replaceAll("{name}", safe);
}
