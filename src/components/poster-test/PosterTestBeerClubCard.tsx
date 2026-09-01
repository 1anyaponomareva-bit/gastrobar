"use client";

import { useTranslation } from "@/lib/useTranslation";

/** Beer Club UI — progress accrual not implemented yet (design only). */
export const POSTER_TEST_BEER_CLUB_SLOTS = 7;
export const POSTER_TEST_BEER_CLUB_PROGRESS = 0;

type PosterTestBeerClubCardProps = {
  variant?: "full" | "inline";
  showTitle?: boolean;
};

export function PosterTestBeerClubProgress({
  progress = POSTER_TEST_BEER_CLUB_PROGRESS,
  totalSlots = POSTER_TEST_BEER_CLUB_SLOTS,
}: {
  progress?: number;
  totalSlots?: number;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="poster-test-beer-club__progress"
      aria-label={t("poster_test_beer_club_aria")
        .replace("{progress}", String(progress))
        .replace("{slots}", String(totalSlots))}
    >
      {Array.from({ length: totalSlots }, (_, index) => {
        const filled = index < progress;
        const isRewardSlot = index === totalSlots - 1;
        return (
          <span
            key={index}
            className={[
              "poster-test-beer-club__slot",
              filled ? "poster-test-beer-club__slot--filled" : "poster-test-beer-club__slot--empty",
              isRewardSlot ? "poster-test-beer-club__slot--reward" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
            title={
              isRewardSlot
                ? t("poster_test_beer_club_slot_reward")
                : filled
                  ? t("poster_test_beer_club_slot_filled")
                  : t("poster_test_beer_club_slot_empty")
            }
          >
            {filled ? "🍺" : "🍻"}
          </span>
        );
      })}
    </div>
  );
}

export function PosterTestBeerClubCard({
  variant = "full",
  showTitle = true,
}: PosterTestBeerClubCardProps) {
  const { t } = useTranslation();
  const progress = POSTER_TEST_BEER_CLUB_PROGRESS;
  const slots = POSTER_TEST_BEER_CLUB_SLOTS;

  return (
    <div className={`poster-test-beer-club poster-test-beer-club--${variant}`}>
      {showTitle ? (
        <p className="poster-test-beer-club__heading">
          <span aria-hidden="true">🍺</span> Beer Club
        </p>
      ) : null}
      {variant === "full" ? (
        <>
          <p className="poster-test-beer-club__status">
            {t("poster_test_beer_club_progress")
              .replace("{progress}", String(progress))
              .replace("{slots}", String(slots))}
          </p>
          <PosterTestBeerClubProgress progress={progress} totalSlots={slots} />
        </>
      ) : (
        <p className="poster-test-beer-club__status">
          <span aria-hidden="true">🍺</span>{" "}
          {t("poster_test_beer_club_progress_short")
            .replace("{progress}", String(progress))
            .replace("{slots}", String(slots))}
        </p>
      )}
      <p className="poster-test-beer-club__tagline">{t("poster_test_beer_club_tagline")}</p>
    </div>
  );
}
