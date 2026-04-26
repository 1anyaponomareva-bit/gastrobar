import type { WheelSegmentId } from "@/lib/wheel";

/**
 * Краткое название сектора (как на диске / в заголовке «не удалось сохранить»).
 * Согласовано с `bonus_title_wheel_*` и `wheel_sector_*` в i18n.
 */
export function wheelSegmentWinTitleT(
  t: (k: string) => string,
  segmentId: WheelSegmentId | undefined
): string {
  if (!segmentId) return t("wheel_generic_win");
  switch (segmentId) {
    case "disc5_bar":
      return t("bonus_title_wheel_d5_bar");
    case "disc50_1":
      return t("bonus_title_wheel_d50_1");
    case "disc50_2":
      return t("bonus_title_wheel_d50_2");
    case "beer":
      return t("bonus_title_wheel_beer");
    case "tincture":
      return t("bonus_title_wheel_tincture");
    case "snack":
      return t("bonus_title_wheel_snack");
    case "mimo":
      return t("wheel_sector_mimo");
    case "no_bonus":
      return t("wheel_sector_no_bonus");
    default:
      return t("wheel_generic_win");
  }
}
