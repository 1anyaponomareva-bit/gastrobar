import type { MenuItem } from "@/data/menu";
import type { AppLang } from "./i18n";

const DESCS_EN: Record<string, string> = {
  "whisky-sour":
    "A balance of aged bourbon, lemon and a silky foam top.",
  boulevardier: "Bourbon, Campari and sweet vermouth. An elegant classic.",
  "long-island": "A serious mix of five base spirits in one long drink.",
  "whisky-cola": "A classic highball with deep woody character.",
  "gin-tonic": "Clean juniper and lime in a long, refreshing serve.",
  aperol: "Sparkling prosecco, Aperol bitter and a dash of soda.",
  negroni: "Gin, Campari and red vermouth. Bitter-sweet and iconic.",
  "white-wine": "A crisp pick with light fruit and a refreshing, mineral line.",
  "red-wine": "Full-bodied red with a rich dark-berry profile.",
  "beer-light": "Crisp, fresh Sapporo on tap—easy-drinking and bright.",
  "beer-dark": "Dark lager with caramel and malt notes on tap.",
  "pineapple-ginger-honey": "Sweet pineapple, spicy ginger and soft honey.",
  limoncello: "Zesty lemon and peel—like Italy, in a pour from our own batch.",
  "pineapple-vanilla": "Tropics and creamy vanilla—warm and easy-going.",
  "orange-cinnamon": "Orange and cinnamon—winter warmth without cloying syrup.",
  "grapefruit-rosemary": "Grapefruit bite with a piney rosemary lift.",
  cranberry: "Berry tartness that wakes the palate and refreshes.",
  "coffee-chocolate": "For those who like dessert in a glass.",
  "raspberry-rose": "Raspberry and a soft floral note—no perfume overkill.",
  "mango-passionfruit": "A tropical duet—bright, juicy, bold.",
  passionfruit: "Pure passion fruit—sour-sweet in one hit.",
  "apple-strudel": "Apple, cinnamon and pastry—baked, but sippable.",
  blueberry: "Forest berry with a deep, rounded sweetness.",
  "cherry-chocolate": "Cherry and cocoa in a rich, short pour.",
  "strawberry-cream": "Strawberry and cream in a truly dessert forward shot.",
  b52: "The classic layer shot: coffee liqueur, cream liqueur and orange triple-sec.",
  "gordons-gin": "Single 50 ml pour at the bar.",
  kahlua: "Single 50 ml pour at the bar.",
  "sambuca-vaccari": "Single 50 ml pour at the bar.",
  "havana-club-rum": "Single 50 ml pour at the bar.",
  jameson: "Single 50 ml pour at the bar.",
  "absolut-vodka": "Single 50 ml pour at the bar.",
  baileys: "Single 50 ml pour at the bar.",
  "jose-cuervo-tequila": "Single 50 ml pour at the bar.",
  jagermeister: "Single 50 ml pour at the bar.",
  "bombay-sapphire-gin": "Single 50 ml pour at the bar.",
  "hennessy-vs": "Single 50 ml pour at the bar.",
  "jim-beam-apple": "Single 50 ml pour at the bar.",
  "jim-beam": "Single 50 ml pour at the bar.",
  "jack-daniels": "Single 50 ml pour at the bar.",
  "coca-cola-can": "Chilled can from the fridge.",
  "sprite-can": "Chilled can from the fridge.",
  "fanta-can": "Chilled can from the fridge.",
  "schweppes-red": "Chilled can from the fridge.",
  "schweppes-tonic-yellow": "Indian tonic—crisp, bitter-sweet, chilled.",
  "schweppes-soda-grey": "Soda water—bubbles, no sugar.",
  "chicken-jerky": "Spicy air-dried chicken jerky—made for a cold beer.",
  "beef-jerky": "Cured beef with spices—hearty, meaty, beer-friendly.",
  pistachios: "Roasted salted pistachios for beer and mixed drinks.",
  peanuts: "Crunchy salty peanuts. The classic bar bite.",
  "dried-squid": "Dried seasoned squid. A go-to with beer in Asia and here.",
  "hookah-black-burn-brownie":
    "Vanilla, cinnamon and chocolate like a real brownie: a cakey, cocoa-forward profile. Sweet but not cloying; great solo, reads almost like hot chocolate or a cookie—without heaviness.",
  "hookah-black-burn-elka":
    "Deep forest resin and fir with a light fresh lift—like a walk through a pine wood after cold air. Balanced between warmth, spice and cool notes.",
  "hookah-black-burn-pomelo":
    "True pomelo: juicy, with tartness and a pleasant bitter finish—saturated Asian citrus, easy to read on its own.",
  "hookah-black-burn-shock-currant":
    "Sweet-sour red and black currant with a dense berry smoke—lively, not too tannic, like the Shock / Red Currant line.",
  "hookah-black-burn-strawberry-jam":
    "Bright, sweet wild strawberry jam with a little acidity—no artificial candy aftertaste.",
  "hookah-darkside-basil-blast":
    "Fresh basil: lightly herbal and spicy, opening up in the bowl. Great solo or in fruit mixes.",
  "hookah-darkside-cosmo-flower":
    "Sweet dark berry with a refined floral layer—a deep berry–flower profile that stays interesting to the end.",
  "hookah-darkside-dark-supra":
    "Japanese green sencha and a light jasmine note—calm, tea and herb, elegant and not loud.",
  "hookah-darkside-falling-star":
    "Sweet tropical mango and passion fruit, natural and full—versatile in solo or with berries and citrus.",
  "hookah-darkside-generis-raspberry":
    "Expressive garden raspberry with a little tartness—aromatic, summery, a good base for fruit blends.",
  "hookah-darkside-lemonblast":
    "Lemon marmalade: full lemon, acidity softened by sugar—great solo and in mixes.",
  "hookah-darkside-nordberry":
    "Refreshing sweet-tart berries with a cool cranberry-juice feel—crisp, “northern” clarity.",
  "hookah-darkside-red-rush":
    "Barberry hard candy: sweet first, then a snap of sour and a long finish. Pairs in almost any mix.",
  "hookah-darkside-tropic-ray":
    "Piña colada and tropical fruit—pineapple, coconut, a light rum feel; bold, full, holiday vibe.",
  "hookah-musthave-mandarin":
    "Sweet, juicy “dessert” mandarin: clear pulp and peel. Solid solo, works as a fruit base in mixes.",
  "hookah-musthave-nord-star":
    "Sour cherry with a bright, cold accent—very berry-forward from the first pull, North American cherry profile as intended by the brand.",
  "hookah-musthave-rocketman":
    "Strawberry, kiwi and grapefruit—sweet base, kiwi’s green bite and a citrus finish with a touch of bitterness. Juicy in solo, flexible in mixes.",
  "hookah-overdose-overcola":
    "Familiar cola: sweetness, citrus, light acidity and a “fizzy” aroma. Overdose line uses dark-fired Burley—generally a notch above average strength in the brand’s scale.",
  "hookah-overdose-peach-iced-tea":
    "Soft, cooling peach tea—mild, easy, not sticky-sweet. Dark-fired Burley in Overdose; strength is marked above average for the brand.",
};

const DESCS_VN: Record<string, string> = {
  "whisky-sour":
    "Cân bằng giữa bourbon, chanh và lớp bọt mỏng.",
  boulevardier: "Bourbon, Campari và vermouth ngọt. Classic thanh lịch.",
  "long-island": "Pha cả năm loại rượu mạnh trong một ly dài.",
  "whisky-cola": "Cặp đôi quen: whiskey và cola, hương gỗ sâu.",
  "gin-tonic": "Bạch đậu khấu, chanh tươi, ly dài, sảng khoái.",
  aperol: "Prosecco, Aperol và soda — như Aperol Spritz bản chuẩn.",
  negroni: "Gin, Campari, vermouth đỏ — đắng-ngọt, biểu tượng.",
  "white-wine": "Vang trắng: trái cây thanh, khoáng, dễ uống.",
  "red-wine": "Vang đỏ đậm, hương quả mọng tối.",
  "beer-light": "Bia tươi Sapporo nhạt — mát, dễ uống.",
  "beer-dark": "Bia tươi Sapporo đen — caramel, mạch nha.",
  "pineapple-ginger-honey": "Dứa ngọt, gừng, mật ong ấm.",
  limoncello: "Chanh, vỏ — chuẩn kiểu Ý, bản rót tại quán.",
  "pineapple-vanilla": "Nhiệt đới, vani kem — mềm, dễ chịu.",
  "orange-cinnamon": "Cam, quế — ấm mà không sệt si-rô.",
  "grapefruit-rosemary": "Bưởi chua, hương thảo — the và thơm.",
  cranberry: "Chua chát việt quất — tỉnh vị, mát.",
  "coffee-chocolate": "Như món tráng miệng trong ly.",
  "raspberry-rose": "Mâm xôi, hoa nhẹ — ngọt không hắc.",
  "mango-passionfruit": "Hai tầng nhiệt đới — mạnh, sảng.",
  passionfruit: "Chanh dây thuần — chua-cay một lần hút vị.",
  "apple-strudel": "Táo, quế, bánh nướng — ấm.",
  blueberry: "Việt tím, vị sâu, ngọt tròn.",
  "cherry-chocolate": "Anh đào và ca cao, đậm.",
  "strawberry-cream": "Dâu, kem, kiểu tráng miệng.",
  b52: "Lớp tách: cà phê, kem, cam — B-52 kinh điển.",
  "gordons-gin": "Một phần 50 ml tại quầy bar.",
  kahlua: "Một phần 50 ml tại quầy bar.",
  "sambuca-vaccari": "Một phần 50 ml tại quầy bar.",
  "havana-club-rum": "Một phần 50 ml tại quầy bar.",
  jameson: "Một phần 50 ml tại quầy bar.",
  "absolut-vodka": "Một phần 50 ml tại quầy bar.",
  baileys: "Một phần 50 ml tại quầy bar.",
  "jose-cuervo-tequila": "Một phần 50 ml tại quầy bar.",
  jagermeister: "Một phần 50 ml tại quầy bar.",
  "bombay-sapphire-gin": "Một phần 50 ml tại quầy bar.",
  "hennessy-vs": "Một phần 50 ml tại quầy bar.",
  "jim-beam-apple": "Một phần 50 ml tại quầy bar.",
  "jim-beam": "Một phần 50 ml tại quầy bar.",
  "jack-daniels": "Một phần 50 ml tại quầy bar.",
  "coca-cola-can": "Lon lạnh từ tủ.",
  "sprite-can": "Lon lạnh từ tủ.",
  "fanta-can": "Lon lạnh từ tủ.",
  "schweppes-red": "Lon lạnh từ tủ.",
  "schweppes-tonic-yellow": "Tonic Schweppes — lạnh, đắng dịu, sảng.",
  "schweppes-soda-grey": "Soda — bong bóng, không đường.",
  "chicken-jerky": "Jerky gà cay — ăn kèm bia.",
  "beef-jerky": "Thịt bò sấy thơm, đậm — hợp bia.",
  pistachios: "Hạt dẻ cười rang muối, kèm bia/cocktail.",
  peanuts: "Đậu phộng giòn — món quen ở bar.",
  "dried-squid": "Mực khô tẩm — ăn với bia rất hợp.",
  "hookah-black-burn-brownie":
    "Hương vani, quế, socola kiểu brownie — ngọt mà không gắt: hút một mình ổn, gợi ca cao, bánh quy.",
  "hookah-black-burn-elka":
    "Nhựa thông, mát, rừng hơi: ấm, gia vị, cân bằng bởi tầng tươi lạnh.",
  "hookah-black-burn-pomelo":
    "Đúng vị bưởi: nước, chua, đắng nhẹ ở hơi ra—chanh tây tươi, tự nhiên.",
  "hookah-black-burn-shock-currant":
    "Lý chua đen & đỏ, mùi mọng dày—tươi, không chát quá, giống dòng Shock/Red Currant.",
  "hookah-black-burn-strawberry-jam":
    "Mứt dâu tây rừng, ngọt rõ, chua nhẹ—không mùi kẹo hóa chất.",
  "hookah-darkside-basil-blast":
    "Húng quế tươi, thảo nhẹ, mở dần trong bát—hút solo hoặc pha trái cây.",
  "hookah-darkside-cosmo-flower":
    "Mâm xôi chua, hoa mảnh—mọng sâu, không chán tới hơi cuối.",
  "hookah-darkside-dark-supra":
    "Trà xanh sencha, hoa nhài thanh — tĩnh, dễ uống.",
  "hookah-darkside-falling-star":
    "Xoài ngọt, chanh dây — tự nhiên, dùng solo hoặc pha quả.",
  "hookah-darkside-generis-raspberry": "Mâm xôi vườn, hơi chua — dễ kết hợp trái.",
  "hookah-darkside-lemonblast": "Mứt chanh: chua, đủ ngọt — solo hoặc trộn.",
  "hookah-darkside-nordberry":
    "Mọng mát, gợi nước việt quất; trong, kiểu Bắc.",
  "hookah-darkside-red-rush": "Kẹo barberry: ngọt rồi chua, hồi lâu; hợp nhiều mix.",
  "hookah-darkside-tropic-ray":
    "Piña colada, trái nhiệt đới: dứa, dừa, gợi rum.",
  "hookah-musthave-mandarin": "Quýt mọng, rõ cùi, vỏ thanh.",
  "hookah-musthave-nord-star":
    "Anh đào chua, tươi, lạnh nhẹ; rõ từ hơi đầu.",
  "hookah-musthave-rocketman":
    "Dâu, kiwi, bưới: ngọt, chua xanh, cít-đắng cuối.",
  "hookah-overdose-overcola":
    "Cola gắn: ngọt, cam, hơi ga; Burley rang — nặng hơn trung bình theo bản.",
  "hookah-overdose-peach-iced-tea":
    "Trà đào mát, nhẹ, không sệt; Overdose — Burley, nặng hơn trung bình.",
};

const TASTE_EN: Record<string, string> = {
  "whisky-sour": "Sour-sweet, whisky, lemon, honey",
  boulevardier: "Bitter edge, bourbon, Campari, vermouth",
  "long-island": "Boozy, lemon, cola, tequila, gin, rum, vodka",
  "whisky-cola": "Whisky, cola, light sweetness",
  "gin-tonic": "Fresh, gin, tonic, lime, juniper",
  aperol: "Bitter-sweet, Aperol, prosecco, orange",
  negroni: "Bitter, gin, Campari, vermouth",
  "white-wine": "Light, fruity, mineral",
  "red-wine": "Full, berry, astringent",
  "beer-light": "Light, easy, hoppy",
  "beer-dark": "Dark, caramel, malt",
  "pineapple-ginger-honey": "Tropical, spice, honey",
  limoncello: "Lemon, peel, sweetness",
  "pineapple-vanilla": "Pineapple, vanilla",
  "orange-cinnamon": "Citrus, spice",
  "grapefruit-rosemary": "Citrus, herbs",
  cranberry: "Sweet-sour berry",
  "coffee-chocolate": "Coffee, cocoa",
  "raspberry-rose": "Raspberry, flowers",
  "mango-passionfruit": "Tropics, acidity",
  passionfruit: "Passion fruit, tropics",
  "apple-strudel": "Apple, bake, spice",
  blueberry: "Blueberry, berry",
  "cherry-chocolate": "Cherry, cocoa",
  "strawberry-cream": "Strawberry, cream",
  b52: "Sweet, coffee, cream, orange",
};

const TASTE_VN: Record<string, string> = {
  "whisky-sour": "Chua-ngọt, whiskey, chanh, mật ong",
  boulevardier: "Hơi đắng, bourbon, campari, vermouth",
  "long-island": "Mạnh, chanh, cola, tequila, gin, rượu rum, vodka",
  "whisky-cola": "Whisky, cola, ngọt vừa",
  "gin-tonic": "Tươi, gin, tonic, chanh, bạch đậu khấu",
  aperol: "Ngọt-đắng, Aperol, prosecco, cam",
  negroni: "Đắng, gin, campari, vermouth",
  "white-wine": "Nhẹ, trái cây, khoáng",
  "red-wine": "Đậm, mọng, chát",
  "beer-light": "Nhạt, mát, mùa hoa bia",
  "beer-dark": "Đen, caramel, mạch nha",
  "pineapple-ginger-honey": "Dứa, gừng, mật ong",
  limoncello: "Chanh, vỏ, ngọt",
  "pineapple-vanilla": "Dứa, vani",
  "orange-cinnamon": "Quế, quả",
  "grapefruit-rosemary": "Bưởi, thảo",
  cranberry: "Chua-ngọt, mọng việt quất",
  "coffee-chocolate": "Cà phê, ca cao",
  "raspberry-rose": "Mâm xôi, hoa",
  "mango-passionfruit": "Nhiệt đới, chua",
  passionfruit: "Chanh dây, mát",
  "apple-strudel": "Táo, bánh, quế",
  blueberry: "Việt, mọng",
  "cherry-chocolate": "Anh đào, sô cô la",
  "strawberry-cream": "Dâu, kem",
  b52: "Ngọt, cà phê, kem, cam",
};

export function menuItemDisplayDescription(item: MenuItem, lang: AppLang): string {
  if (lang === "ru") return item.description;
  if (lang === "en") return DESCS_EN[item.id] ?? item.description;
  if (lang === "vn") return DESCS_VN[item.id] ?? DESCS_EN[item.id] ?? item.description;
  return item.description;
}

export function menuItemDisplayTaste(item: MenuItem, lang: AppLang): string | undefined {
  if (!item.taste) return undefined;
  if (lang === "ru") return item.taste;
  if (lang === "en") return TASTE_EN[item.id] ?? item.taste;
  if (lang === "vn") return TASTE_VN[item.id] ?? TASTE_EN[item.id] ?? item.taste;
  return item.taste;
}

