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
    id: "combo-nastoiki-5",
    title: "Комбо: 5 настоек",
    price: "250.000 VND",
    image: "/menu/promo_nastoika.png",
    imageFit: "contain",
    description:
      "Набор из пяти настоек по специальной цене. Покажите офер бармену.",
  },
];
