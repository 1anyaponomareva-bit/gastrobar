"use client";

import { motion } from "framer-motion";
import { useFavorites } from "@/components/FavoritesProvider";
import type { MenuItem } from "@/data/menu";
import { strengthDisplayLabel } from "@/data/menu";
import { BONUS_VALIDITY_LABEL } from "@/lib/bonusCopy";

function formatVnd(price: string): string {
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

const HeartIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" stroke="none">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );

export function MenuListItem({
  item,
  index: _index,
  bonusProductId,
  highlightProductId,
  onClick,
}: {
  item: MenuItem;
  index: number;
  bonusProductId?: string | null;
  highlightProductId?: string | null;
  onClick: () => void;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(item.id);
  const priceFormatted = formatVnd(item.price);
  const isBonusItem = bonusProductId != null && bonusProductId === item.id;
  const isHighlighted = highlightProductId != null && highlightProductId === item.id;
  const listImage = item.imageList ?? item.image;
  const strengthLbl = strengthDisplayLabel(item);
  const isTincture = item.barSubcategory === "tincture";
  /** В списке настоек — квадрат 1:1 (обрезка 9:16), ~3 карточки по высоте экрана */
  const tinctureCardMaxH = "min(172px, calc((100dvh - 200px) / 3))";

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      data-product-id={item.id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative flex w-full cursor-pointer items-stretch overflow-hidden rounded-2xl bg-[#030303] transition-opacity active:opacity-95 ${isTincture ? "min-h-[96px]" : "min-h-[120px]"} ${isHighlighted ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-black shadow-[0_0_24px_rgba(212,175,55,0.35)]" : ""}`}
      style={
        isTincture
          ? { maxHeight: tinctureCardMaxH, minHeight: "max(96px, min(172px, calc((100dvh - 200px) / 3)))" }
          : { minHeight: "max(120px, 24dvh)", maxHeight: "190px" }
      }
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col py-3 pl-4 pr-2">
        {isBonusItem && (
          <div className="mb-2 w-full shrink-0 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/12 to-transparent px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-400/95">
              Бесплатно по бонусу
            </p>
            <p className="mt-0.5 text-[10px] text-white/55">Покажи код бармену · {BONUS_VALIDITY_LABEL}</p>
          </div>
        )}

        <div className={`flex items-start justify-between gap-2 ${isBonusItem ? "mb-1" : "mb-2"}`}>
          <div className="min-h-[28px] min-w-0 flex-1">
            {!isBonusItem && item.badge === "hit" && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-black"
                style={{ backgroundColor: "#F59E0B", boxShadow: "0 0 12px rgba(245,158,11,0.5)" }}
                aria-hidden
              >
                <span className="leading-none">🔥</span>
                <span>Хит</span>
              </span>
            )}
          </div>
          <motion.button
            type="button"
            onClick={handleHeartClick}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
            style={{ color: liked ? "#D4AF37" : "white" }}
            aria-label={liked ? "Убрать из избранного" : "В избранное"}
            whileTap={{ scale: 1.2 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <HeartIcon filled={liked} />
          </motion.button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end gap-1 text-left">
          <h3
            className={`font-bold leading-tight text-white ${isTincture ? "line-clamp-2 text-xl" : "text-lg"}`}
          >
            {item.name}
          </h3>
          {item.abv && (
            <span className="inline-flex w-fit rounded-full border border-[#f8d66d]/35 bg-[#f8d66d]/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#fde68a]">
              {item.abv}
            </span>
          )}
          {item.category === "food" && item.pairing && item.pairing.length > 0 && (
            <p className="text-xs text-white/70">
              {item.pairing.map((p) => (p === "beer" ? "к пиву" : p === "cocktail" ? "к коктейлям" : "к вину")).join(", ")}
            </p>
          )}
          {item.taste && (
            <p className="line-clamp-2 text-xs text-white/55">{item.taste}</p>
          )}
          {strengthLbl && (
            <span
              className="mt-0.5 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                backgroundColor:
                  item.strength === "weak"
                    ? "rgba(34,197,94,0.25)"
                    : item.strength === "medium"
                      ? "rgba(245,158,11,0.25)"
                      : "rgba(239,68,68,0.25)",
                color:
                  item.strength === "weak"
                    ? "#86efac"
                    : item.strength === "medium"
                      ? "#fcd34d"
                      : "#fca5a5",
              }}
            >
              {strengthLbl}
            </span>
          )}
          <span
            className="mt-2 inline-flex w-fit max-w-full rounded-full px-3 py-1 text-sm font-medium text-white/90"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            {priceFormatted} VND
          </span>
        </div>
      </div>

      <div
        className={
          isTincture
            ? "relative aspect-square min-h-0 w-[min(40vw,152px)] max-w-[46%] shrink-0 overflow-hidden rounded-r-2xl bg-[#030303]"
            : "relative h-auto min-h-[120px] w-[42%] min-w-[90px] max-w-[160px] shrink-0 overflow-hidden rounded-r-2xl bg-[#030303]"
        }
      >
        <img
          src={listImage}
          alt=""
          className={
            isTincture
              ? "h-full w-full object-cover object-center"
              : "h-full min-h-[120px] w-full object-contain object-center"
          }
          style={
            isTincture
              ? undefined
              : {
                  maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 65%, transparent 100%)",
                  WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 65%, transparent 100%)",
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                }
          }
          loading="lazy"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white/70 backdrop-blur-sm transition-transform hover:scale-105 hover:text-white active:scale-95"
          style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
          aria-label="Перейти"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </button>
      </div>
    </article>
  );
}
