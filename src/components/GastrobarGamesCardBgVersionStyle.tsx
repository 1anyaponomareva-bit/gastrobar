import { getCurrentAppVersion } from "@/lib/appVersion";

/** Суточный `?v=` для фонов `/games` (в `globals.css` не задаём url — только здесь). */
export function GastrobarGamesCardBgVersionStyle() {
  const v = getCurrentAppVersion();
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.games-pick-card--durak .games-pick-card__bg{background-image:url("/durak.png?v=${v}");}
.games-pick-card--battleship .games-pick-card__bg{background-image:url("/morskboi.png?v=${v}");}`,
      }}
    />
  );
}
