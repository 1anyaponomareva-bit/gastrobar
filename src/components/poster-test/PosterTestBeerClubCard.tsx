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
  return (
    <div
      className="poster-test-beer-club__progress"
      aria-label={`Beer Club: ${progress} из ${totalSlots} кружек`}
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
            title={isRewardSlot ? "7-е пиво — за наш счёт" : filled ? "Выпито" : "Пусто"}
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
            {progress} из {slots} кружек
          </p>
          <PosterTestBeerClubProgress progress={progress} totalSlots={slots} />
        </>
      ) : (
        <p className="poster-test-beer-club__status">
          <span aria-hidden="true">🍺</span> Beer Club: {progress}/{slots}
        </p>
      )}
      <p className="poster-test-beer-club__tagline">Каждое 7-е пиво — за наш счёт</p>
    </div>
  );
}
