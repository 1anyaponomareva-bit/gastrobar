const LOSS_COUNT = 12;

export function getRandomLossResultTitle(
  nameForLine: string,
  t: (key: string) => string
): string {
  const i = Math.floor(Math.random() * LOSS_COUNT);
  return t(`durak_loss_${i}`).replaceAll("{name}", nameForLine);
}
