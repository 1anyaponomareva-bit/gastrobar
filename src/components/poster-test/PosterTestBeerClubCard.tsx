/** Beer Club UI — progress accrual not implemented yet (design only). */
export const POSTER_TEST_BEER_CLUB_TARGET = 6;
export const POSTER_TEST_BEER_CLUB_PROGRESS = 0;

type PosterTestBeerClubCardProps = {
  variant?: "full" | "inline";
  showTitle?: boolean;
};

export function PosterTestBeerClubProgress({
  progress = POSTER_TEST_BEER_CLUB_PROGRESS,
  totalSlots = POSTER_TEST_BEER_CLUB_TARGET + 1,
}: {
  progress?: number;
  totalSlots?: number;
}) {
  return (
    <div
      className="poster-test-beer-club__progress"
      aria-label={`Beer Club: ${progress} из ${POSTER_TEST_BEER_CLUB_TARGET}`}
    >
      {Array.from({ length: totalSlots }, (_, index) => {
        const filled = index < progress;
        return (
          <span
            key={index}
            className={[
              "poster-test-beer-club__slot",
              filled ? "poster-test-beer-club__slot--filled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {filled ? "🍺" : "⬜"}
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
  const target = POSTER_TEST_BEER_CLUB_TARGET;

  return (
    <div className={`poster-test-beer-club poster-test-beer-club--${variant}`}>
      {showTitle ? (
        <p className="poster-test-beer-club__heading">
          <span aria-hidden="true">🍺</span> Beer Club
        </p>
      ) : null}
      <p className="poster-test-beer-club__status">
        <span aria-hidden="true">🍺</span> Beer Club: {progress}/{target}
      </p>
      {variant === "full" ? (
        <PosterTestBeerClubProgress progress={progress} totalSlots={target + 1} />
      ) : null}
      <p className="poster-test-beer-club__tagline">Каждое 7-е пиво — за наш счёт</p>
    </div>
  );
}
