export type PromoItem = {
  id: string;
  title: string;
  price: string;
  image: string;
  /** "contain" — картинка целиком в рамке (для горизонтальных фото); "cover" — заполнить кадр 9:16 */
  imageFit?: "cover" | "contain";
  description: string;
};

export const PROMOS: PromoItem[] = [
  {
    id: "happy-hours",
    title: "Happy Hours",
    price: "—",
    image: "/menu/promo_happy_hour_ultra.png",
    description: "Ежедневно с 19:00 до 20:00 специальная цена на коктейльную карту.",
  },
  {
    id: "combo-whisky-jerky",
    title: "Combo: Whisky Sour + Jerky",
    price: "230.000 VND",
    image: "/menu/promo-combo-whisky-jerky.png",
    imageFit: "contain",
    description: "Бокал Виски Сауэр с пеной и цедрой в паре с крафтовой тарелкой мясных джерки. Идеальное сочетание для вечера.",
  },
];
