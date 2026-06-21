/** Хосты, где корень `/` открывает экран выбора «Еда / Бар» (QR на столах). */
const DEFAULT_MENU_CHOOSER_HOSTS = ["menu.gastrotruck.org"];

function parseHosts(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function getMenuChooserHosts(): string[] {
  const fromEnv = parseHosts(process.env.MENU_CHOOSER_HOSTS);
  if (fromEnv.length > 0) return fromEnv;
  return DEFAULT_MENU_CHOOSER_HOSTS;
}

export function isMenuChooserHost(host: string): boolean {
  const normalized = host.split(":")[0]?.toLowerCase() ?? "";
  return getMenuChooserHosts().includes(normalized);
}

export const MENU_CHOOSER_PATH = "/start";
