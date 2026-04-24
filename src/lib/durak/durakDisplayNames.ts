import {
  DURAK_I18N_BOT,
  DURAK_I18N_GUEST,
  DURAK_I18N_OPP,
  DURAK_I18N_YOU,
} from "@/games/durak/names";

const LEGACY_YOU = "Вы";
const LEGACY_BOT = "Бот";
const LEGACY_OPP = "Соперник";
const LEGACY_GUEST = "Гость";

/** Подписи «Вы / Бот / соперник / гость» и плейсхолдер игрока для строк UI. */
export function formatDurakEntityName(
  name: string | null | undefined,
  t: (key: string) => string
): string {
  const n = name?.trim() ?? "";
  if (!n) return t("d_player");
  if (n === DURAK_I18N_YOU || n === LEGACY_YOU) return t("durak_label_you");
  if (n === DURAK_I18N_BOT || n === LEGACY_BOT) return t("durak_label_bot");
  if (n === DURAK_I18N_OPP || n === LEGACY_OPP) return t("durak_label_opponent");
  if (n === DURAK_I18N_GUEST || n === LEGACY_GUEST) return t("durak_label_guest");
  return n;
}
