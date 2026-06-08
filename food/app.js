const IMG = (file) => (file ? `/food/menu/${encodeURI(file)}` : null);

const NO_IMAGE_LABEL = "нет изображения";

const FAVORITES_STORAGE_KEY = "gastrofood-favorites";

const FOOD_CATEGORY_IDS = [
  "snacks",
  "dumplings",
  "hot-dogs",
  "burgers",
  "grill",
  "wraps",
];

const COMBO_CATEGORY_IDS = ["kids", "combos"];

const CATEGORY_LABELS = {
  snacks: "Закуски",
  dumplings: "Пельмени и вареники",
  "hot-dogs": "Хот-доги",
  burgers: "Бургеры",
  grill: "Гриль",
  wraps: "Сэндвичи и рапы",
  kids: "Детские комбо",
  combos: "Комбо наборы",
};

const FOOD_CATEGORIES = [
  { id: "all", label: "Все" },
  ...FOOD_CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
];

const COMBO_CATEGORIES = [
  { id: "all", label: "Все" },
  ...COMBO_CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
];

const BOTTOM_NAV = [
  { id: "food", label: "Еда", icon: "🍔" },
  { id: "bar", label: "Бар", icon: "🍸", href: "/" },
  { id: "combo", label: "Комбо", icon: "🎁" },
  { id: "favorites", label: "Любимое", icon: "❤️" },
  { id: "games", label: "Игры", icon: "🎯", href: "/games" },
];

const CATEGORY_ORDER = [
  "snacks",
  "dumplings",
  "hot-dogs",
  "burgers",
  "grill",
  "wraps",
  "kids",
  "combos",
];

const HOT_DOG_SAUSAGE_OPTIONS = [
  { id: "classic", label: "Стандартная сосиска" },
  { id: "craft", label: "Крафтовая колбаска собственного производства" },
];

const MENU_ITEMS = [
  // ——— ЗАКУСКИ ———
  {
    id: "mozzarella-sticks",
    name: "Сырные палочки",
    description:
      "Обжаренные до золотистой корочки палочки из моцареллы с томатным соусом.",
    price: null,
    category: "snacks",
    image: IMG("cheese-sticks.png"),
    imageScale: 1.74,
  },
  {
    id: "shrimp-tempura",
    name: "Креветки темпура",
    description: "Хрустящие креветки в темпуре с соусом сладкий чили.",
    price: null,
    category: "snacks",
    image: IMG("shrimp-tempura.png"),
    imageScale: 1.74,
  },
  {
    id: "chicken-nuggets",
    name: "Наггетсы",
    description: "Хрустящие наггетсы из куриного бедра.",
    price: null,
    category: "snacks",
    image: IMG("NUGGETS.png"),
  },
  {
    id: "crispy-fish-bites",
    name: "Хрустящие рыбные кусочки",
    description:
      "Хрустящие кусочки рыбы Баса в панировке, подаются с соусом тартар.",
    price: null,
    category: "snacks",
    image: IMG("FISH-BITES.png"),
  },
  {
    id: "french-fries",
    name: "Картофель фри",
    description: "Хрустящий картофель фри.",
    price: null,
    category: "snacks",
    image: IMG("FRENCH-FRIES.png"),
  },
  {
    id: "creamy-chicken-soup",
    name: "Куриный суп",
    description:
      "Нежный куриный суп с вермишелью и бархатистым бульоном на основе йогурта.",
    price: null,
    category: "snacks",
    image: IMG("Creamy Chicken Soup.png"),
  },

  // ——— ПЕЛЬМЕНИ И ВАРЕНИКИ ———
  {
    id: "potato-onion-pierogi",
    name: "Вареники с картофелем и луком",
    description: "Традиционные вареники с картофелем и жареным луком.",
    price: null,
    category: "dumplings",
    image: IMG("POTATO-DUMPLINGS.png"),
    boxScale: 1.62,
  },
  {
    id: "potato-mushroom-pierogi",
    name: "Вареники с картофелем и грибами",
    description: "Вареники с картофелем и грибами.",
    price: null,
    category: "dumplings",
    image: IMG("POTATO-MUSHROOM-DUMPLINGS.png"),
    boxScale: 1.36,
  },
  {
    id: "chicken-dumplings",
    name: "Куриные пельмени",
    description: "Сочные куриные пельмени.",
    price: null,
    category: "dumplings",
    image: IMG("CHICKEN-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "pork-beef-dumplings",
    name: "Пельмени со свининой и говядиной",
    description: "Традиционные пельмени со свининой и говядиной.",
    price: null,
    category: "dumplings",
    image: IMG("PORK-BEEF-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "pan-fried-dumplings",
    name: "Жареные пельмени",
    description:
      "Хрустящие жареные пельмени с начинкой на выбор: курица или свинина с говядиной.",
    price: null,
    category: "dumplings",
    image: IMG("FRIED-PORK-BEEF-DUMPLINGS.png"),
    boxScale: 1.05,
  },

  // ——— ХОТ-ДОГИ ———
  {
    id: "classic-hot-dog",
    name: "Классик",
    description:
      "Горчица, кетчуп, майонез, маринованные огурцы и жареный лук.",
    price: null,
    category: "hot-dogs",
    image: IMG("CLASSIC-HOT-DOG.png"),
    edgeFade: false,
  },
  {
    id: "cheddar-bacon-dog",
    name: "Чеддер Бекон",
    description: "Сырный соус, бекон и жареный лук.",
    price: null,
    category: "hot-dogs",
    image: IMG("HOT-DOG_becon.png"),
    edgeFade: false,
  },
  {
    id: "jalapeno-cheddar-dog",
    name: "Халапеньо Чеддер",
    description: "Сырный соус, перец халапеньо и жареный лук.",
    price: null,
    category: "hot-dogs",
    image: IMG("HOT-DOG_halapen.png"),
    edgeFade: false,
  },
  {
    id: "bavarian-dog",
    name: "Баварский",
    description: "Тушеная квашеная капуста, горчица и жареный лук.",
    price: null,
    category: "hot-dogs",
    image: IMG("HOT-DOG_bov.png"),
    edgeFade: false,
  },
  {
    id: "bbq-bacon-dog",
    name: "BBQ Бекон",
    description:
      "Соус BBQ, маринованные огурцы, бекон и жареный лук.",
    price: null,
    category: "hot-dogs",
    image: IMG("HOT-DOG_bbq.png"),
    edgeFade: false,
  },

  // ——— БУРГЕРЫ ———
  {
    id: "classic-burger",
    name: "Классик Бургер",
    description:
      "Говяжья котлета, салат, томат, лук, маринованные огурцы и фирменный соус.",
    price: null,
    category: "burgers",
    image: IMG("burger-classic.png"),
  },
  {
    id: "cheeseburger",
    name: "Чизбургер",
    description:
      "Говяжья котлета, сыр чеддер, салат, томат, лук, маринованные огурцы и фирменный соус.",
    price: null,
    category: "burgers",
    image: IMG("CHEESEBURGER.png"),
  },
  {
    id: "signature-burger",
    name: "Гастро Бургер",
    description:
      "Говяжья котлета, сырный соус, соус BBQ, маринованные огурцы, хрустящий бекон, жареный лук и грибы.",
    price: null,
    category: "burgers",
    image: IMG("GASTROBURGER.png"),
  },
  {
    id: "fish-burger",
    name: "Фишбургер",
    description: "Хрустящее рыбное филе, салат, томат, лук и соус тартар.",
    price: null,
    category: "burgers",
    image: IMG("fishburger.png"),
  },

  // ——— ГРИЛЬ ———
  {
    id: "chicken-kebab",
    name: "Куриный шашлык",
    description: "Маринованный куриный шашлык на гриле с томатным соусом.",
    price: null,
    category: "grill",
    image: IMG("Chicken_kebab.png"),
  },
  {
    id: "pork-kebab",
    name: "Свиной шашлык",
    description: "Сочный маринованный шашлык из свинины с томатным соусом.",
    price: null,
    category: "grill",
    image: IMG("pork_kebab.png"),
  },
  {
    id: "original-wings",
    name: "Куриные крылья, классические",
    description:
      "Куриные крылья, маринованные в пиве и обжаренные до золотистой корочки.",
    price: null,
    category: "grill",
    image: IMG("Original Wings .png"),
  },
  {
    id: "bbq-wings",
    name: "Куриные крылья, барбекю",
    description: "Куриные крылья, маринованные в пиве и покрытые соусом BBQ.",
    price: null,
    category: "grill",
    image: IMG("BBQ Wings.png"),
  },
  {
    id: "spicy-wings",
    name: "Куриные крылья, острые",
    description: "Куриные крылья в пивном маринаде с острой глазурью чили.",
    price: null,
    category: "grill",
    image: IMG("Spicy Wings.png"),
  },
  {
    id: "bavarian-sausage",
    name: "Баварская колбаска",
    description:
      "Свиная колбаска на гриле с картофелем фри, тушеной квашеной капустой и томатным соусом.",
    price: null,
    category: "grill",
    image: IMG("Bavarian Sausage.png"),
  },
  {
    id: "cheddar-jalapeno-sausage",
    name: "Колбаска Чеддер и Халапеньо",
    description:
      "Свиная колбаска с сыром чеддер и халапеньо, подается с картофелем фри, тушеной квашеной капустой и томатным соусом.",
    price: null,
    category: "grill",
    image: IMG("Cheddar Jalapeño Sausage.png"),
  },
  {
    id: "grilled-chicken-sausage",
    name: "Куриная гриль-колбаска",
    description:
      "Куриная колбаска на гриле с картофелем фри, тушёной квашеной капустой и томатным соусом.",
    price: null,
    category: "grill",
    image: IMG("Grilled Chicken Sausage.png"),
  },

  // ——— СЭНДВИЧИ И РАПЫ ———
  {
    id: "philly-cheesesteak",
    name: "Фили Чизстейк",
    description:
      "Тонко нарезанный говяжий стейк, расплавленный сыр, жареный лук и болгарский перец.",
    price: null,
    category: "wraps",
    image: IMG("phillycheesesteak.png"),
  },
  {
    id: "classic-wrap",
    name: "Классический рап",
    description: "Курица на гриле, свежие овощи и фирменный соус в тортилье.",
    price: null,
    category: "wraps",
    image: IMG("wrap_kur_classic.png"),
  },
  {
    id: "chicken-caesar-wrap",
    name: "Цезарь-рап",
    description: "Курица на гриле, салат, пармезан и соус Цезарь.",
    price: null,
    category: "wraps",
    image: IMG("wrap_kur.png"),
  },
  {
    id: "crispy-fish-wrap",
    name: "Рап с хрустящей рыбой",
    description: "Хрустящая рыба Баса, свежие овощи и соус тартар.",
    price: null,
    category: "wraps",
    image: IMG("wrap.png"),
  },

  // ——— ДЕТСКИЕ КОМБО ———
  {
    id: "kids-nuggets-combo",
    name: "Детский комбо с наггетсами",
    description:
      "Наггетсы, картофель фри, сок или напиток и игрушка-сюрприз.",
    price: null,
    category: "kids",
    image: IMG("KIDS-COMBO-NUGGETS.png"),
  },
  {
    id: "kids-sausage-combo",
    name: "Детский комбо с сосиской",
    description:
      "Стандартная сосиска, картофель фри, сок или напиток и игрушка-сюрприз.",
    price: null,
    category: "kids",
    image: IMG("KIDS-COMBO-SAUSAGE.png"),
  },

  // ——— КОМБО НАБОРЫ ———
  {
    id: "burger-combo",
    name: "Бургер Комбо",
    description: "Классический бургер или чизбургер, картофель фри и напиток.",
    price: null,
    category: "combos",
    image: IMG("combo_burger.png"),
  },
  {
    id: "hot-dog-combo",
    name: "Хот-Дог Комбо",
    description: "Любой классический хот-дог, картофель фри и напиток.",
    price: null,
    category: "combos",
    image: IMG("hot-dog_combo.png"),
  },
  {
    id: "wings-combo",
    name: "Комбо с крыльями",
    description: "Куриные крылья, картофель фри и напиток.",
    price: null,
    category: "combos",
    image: IMG("wings_combo.png"),
  },
  {
    id: "sausage-plate-combo",
    name: "Комбо с колбасками",
    description:
      "Любая крафтовая колбаска, картофель фри, тушёная квашеная капуста и напиток.",
    price: null,
    category: "combos",
    image: IMG("combo_sos.png"),
  },
];

let activeSection = "food";
let activeCategory = "all";
let favoriteIds = [];
let visibleItems = [];
let detailIndex = -1;

const HEART_OUTLINE = `
  <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
`;

const HEART_FILLED = `
  <svg fill="currentColor" viewBox="0 0 24 24" stroke="none" aria-hidden="true">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
`;

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

function isFavorite(id) {
  return favoriteIds.includes(id);
}

function toggleFavorite(id) {
  favoriteIds = isFavorite(id)
    ? favoriteIds.filter((itemId) => itemId !== id)
    : [...favoriteIds, id];
  saveFavorites(favoriteIds);
}

function favoriteButtonHtml(id, liked = isFavorite(id)) {
  return `
    <button
      type="button"
      class="menu-card__fav${liked ? " is-liked" : ""}"
      data-favorite="${id}"
      aria-label="${liked ? "Убрать из избранного" : "Добавить в избранное"}"
    >
      ${liked ? HEART_FILLED : HEART_OUTLINE}
    </button>
  `;
}

function updateDetailFavoriteButton(item) {
  const btn = document.getElementById("detail-favorite");
  if (!btn || !item) return;

  const liked = isFavorite(item.id);
  btn.classList.toggle("is-liked", liked);
  btn.setAttribute(
    "aria-label",
    liked ? "Убрать из избранного" : "Добавить в избранное",
  );
  btn.innerHTML = liked ? HEART_FILLED : HEART_OUTLINE;
}

function bindDetailFavorite(item) {
  const btn = document.getElementById("detail-favorite");
  if (!btn || !item) return;

  updateDetailFavoriteButton(item);

  btn.onclick = (event) => {
    event.stopPropagation();
    toggleFavorite(item.id);
    updateDetailFavoriteButton(item);

    if (activeSection === "favorites" && !isFavorite(item.id)) {
      visibleItems = getVisibleItems();
      if (visibleItems.length === 0) {
        closeDetail();
        renderMenuList();
        return;
      }
      if (detailIndex >= visibleItems.length) {
        detailIndex = visibleItems.length - 1;
      }
      openDetail(detailIndex);
      return;
    }

    renderMenuList();
  };
}

function getSectionCategories() {
  if (activeSection === "combo") return COMBO_CATEGORIES;
  return FOOD_CATEGORIES;
}

function getSectionCategoryOrder() {
  if (activeSection === "combo") return COMBO_CATEGORY_IDS;
  return FOOD_CATEGORY_IDS;
}

const ARROW_ICON = `
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H7M17 7v10" />
  </svg>
`;

function formatVnd(price) {
  if (price == null || price === "") return "—";
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

function hitBadgeHtml(label) {
  return `
    <span class="hit-badge" aria-hidden="true">
      <span class="hit-badge__icon">🔥</span>
      <span>${label}</span>
    </span>
  `;
}

function getVisibleItems() {
  if (activeSection === "favorites") {
    return MENU_ITEMS.filter((item) => favoriteIds.includes(item.id));
  }

  const sectionOrder = getSectionCategoryOrder();

  if (activeCategory === "all") {
    return sectionOrder.flatMap((catId) =>
      MENU_ITEMS.filter((item) => item.category === catId),
    );
  }

  return MENU_ITEMS.filter((item) => item.category === activeCategory);
}

function updateCategoryTabsVisibility() {
  const wrap = document.querySelector(".category-tabs-wrap");
  if (!wrap) return;
  wrap.classList.toggle("is-hidden", activeSection === "favorites");
}

function getEmptyStateCopy() {
  if (activeSection === "favorites") {
    return {
      text: "Пока ничего в избранном",
      sub: "Нажмите на сердечко у блюда, чтобы сохранить его здесь",
    };
  }
  return {
    text: "Скоро здесь появятся блюда",
    sub: "Следите за обновлениями в Telegram",
  };
}

function renderBottomNav() {
  const root = document.getElementById("bottom-nav-pill");
  if (!root) return;

  root.innerHTML = BOTTOM_NAV.map((tab) => {
    const active = !tab.href && tab.id === activeSection;
    const classes = `bottom-nav__btn${tab.id === "games" ? " bottom-nav__btn--games" : ""}${
      active ? " is-active" : ""
    }`;
    const inner = `
      <span class="bottom-nav__icon" aria-hidden="true">${tab.icon}</span>
      <span class="bottom-nav__label">${tab.label}</span>
    `;

    if (tab.href) {
      return `<a href="${tab.href}" class="${classes}">${inner}</a>`;
    }

    return `
      <button type="button" class="${classes}" data-section="${tab.id}">
        ${inner}
      </button>
    `;
  }).join("");

  root.querySelectorAll("[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.getAttribute("data-section");
      if (!section || section === activeSection) return;
      activeSection = section;
      activeCategory = "all";
      renderBottomNav();
      updateCategoryTabsVisibility();
      renderCategoryTabs();
      renderMenuList();
      document.getElementById("menu-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderCategoryTabs() {
  const root = document.getElementById("category-tabs");
  if (!root) return;

  if (activeSection === "favorites") {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = getSectionCategories().map(
    (cat) => `
      <button
        type="button"
        class="category-tab${cat.id === activeCategory ? " is-active" : ""}"
        role="tab"
        aria-selected="${cat.id === activeCategory}"
        data-category="${cat.id}"
      >
        ${cat.label}
      </button>
    `,
  ).join("");

  root.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.getAttribute("data-category") || "all";
      renderCategoryTabs();
      renderMenuList();
      document.getElementById("menu-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function isBoxItem(item) {
  return item.category === "dumplings";
}

function boxImageStyle(item, context = "list") {
  if (!isBoxItem(item) || item.boxScale == null) return "";
  const origin = context === "detail" ? "center center" : "top center";
  return ` style="transform: scale(${item.boxScale}); transform-origin: ${origin};"`;
}

function imageScaleFrameStyle(item) {
  if (item.imageScale == null) return "";
  return ` style="--item-scale: ${item.imageScale}"`;
}

function hasEdgeFade(item) {
  return item.edgeFade !== false;
}

function menuMediaClass(item) {
  let cls = "menu-card__media";
  if (!item.image) cls += " menu-card__media--no-photo";
  if (isBoxItem(item)) cls += " menu-card__media--box";
  if (!hasEdgeFade(item)) cls += " menu-card__media--sharp";
  return cls;
}

function detailImageWrapClass(item) {
  let cls = "detail-image-wrap";
  if (!item.image) cls += " detail-image-wrap--no-photo";
  if (isBoxItem(item)) cls += " detail-image-wrap--box";
  if (!hasEdgeFade(item)) cls += " detail-image-wrap--sharp";
  return cls;
}

function renderNoImage(label = NO_IMAGE_LABEL) {
  return `<div class="menu-card__no-image" aria-hidden="true">${label}</div>`;
}

function renderListImage(item) {
  if (!item.image) return renderNoImage();
  const imgAttrs = `src="${item.image}" alt="" loading="lazy"`;
  if (isBoxItem(item)) {
    return `<div class="menu-card__box-frame"><img ${imgAttrs}${boxImageStyle(item)} /></div>`;
  }
  if (item.imageScale != null) {
    return `<div class="menu-card__scale-frame"${imageScaleFrameStyle(item)}><img ${imgAttrs} /></div>`;
  }
  return `<img ${imgAttrs} />`;
}

function renderDetailImage(item) {
  if (!item.image) {
    return `<div class="detail-no-image">${NO_IMAGE_LABEL}</div>`;
  }
  if (isBoxItem(item)) {
    return `<div class="detail-box-frame"><img src="${item.image}" alt="${item.name}"${boxImageStyle(item, "detail")} /></div>`;
  }
  if (item.imageScale != null) {
    return `<div class="detail-scale-frame"${imageScaleFrameStyle(item)}><img src="${item.image}" alt="${item.name}" /></div>`;
  }
  return `<img src="${item.image}" alt="${item.name}" />`;
}

function renderHotDogSausageListNote() {
  return `
    <div class="menu-card__sausage" aria-label="Сосиска на выбор">
      <span class="menu-card__sausage-label">Сосиска на выбор</span>
      <span class="menu-card__sausage-options">
        ${HOT_DOG_SAUSAGE_OPTIONS.map(
          (o) => `<span class="menu-card__sausage-chip">${o.label}</span>`,
        ).join("")}
      </span>
    </div>
  `;
}

function renderMenuCard(item, index) {
  const priceLabel = `${formatVnd(item.price)} VND`;
  const hitHtml = item.badge === "hit" ? hitBadgeHtml("Хит") : "";
  const sausageNoteHtml =
    item.category === "hot-dogs" ? renderHotDogSausageListNote() : "";
  const badgeSlot =
    item.badge === "hit"
      ? `<div class="menu-card__header-badge">${hitHtml}</div>`
      : `<div class="menu-card__header-badge" aria-hidden="true"></div>`;
  const headerHtml = `
    <div class="menu-card__header">
      ${badgeSlot}
      ${favoriteButtonHtml(item.id)}
    </div>
  `;

  return `
    <article
      class="menu-card${item.badge === "hit" ? " menu-card--has-hit" : ""}${
        item.category === "hot-dogs" ? " menu-card--hot-dog" : ""
      }"
      role="listitem button"
      tabindex="0"
      data-index="${index}"
      style="animation-delay: ${index * 0.03}s"
    >
      <div class="menu-card__body">
        ${headerHtml}
        <div class="menu-card__content">
          <h3 class="menu-card__name">${item.name}</h3>
          <p class="menu-card__desc">${item.description || ""}</p>
          ${sausageNoteHtml}
          <span class="menu-card__price">${priceLabel}</span>
        </div>
      </div>
      <div class="${menuMediaClass(item)}">
        ${renderListImage(item)}
        <span class="menu-card__open">${ARROW_ICON}</span>
      </div>
    </article>
  `;
}

function renderMenuList() {
  const list = document.getElementById("menu-list");
  const empty = document.getElementById("menu-empty");
  if (!list || !empty) return;

  visibleItems = getVisibleItems();
  const emptyCopy = getEmptyStateCopy();
  const emptyText = empty.querySelector(".menu-empty__text");
  const emptySub = empty.querySelector(".menu-empty__sub");
  if (emptyText) emptyText.textContent = emptyCopy.text;
  if (emptySub) emptySub.textContent = emptyCopy.sub;

  if (visibleItems.length === 0) {
    list.innerHTML = '<div class="menu-list__spacer" aria-hidden="true"></div>';
    list.classList.add("is-hidden");
    empty.classList.remove("is-hidden");
    return;
  }

  empty.classList.add("is-hidden");
  list.classList.remove("is-hidden");
  list.innerHTML =
    '<div class="menu-list__spacer" aria-hidden="true"></div>' +
    visibleItems.map(renderMenuCard).join("");

  list.querySelectorAll("[data-favorite]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = btn.getAttribute("data-favorite");
      if (!id) return;
      toggleFavorite(id);
      renderMenuList();
    });
  });

  list.querySelectorAll(".menu-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-favorite]")) return;
      const index = Number(card.getAttribute("data-index"));
      openDetail(index);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const index = Number(card.getAttribute("data-index"));
        openDetail(index);
      }
    });
  });
}

function renderDetailContent(item) {
  const priceLabel = `${formatVnd(item.price)} VND`;
  const hitHtml =
    item.badge === "hit"
      ? `<div class="detail-info__hit">${hitBadgeHtml("Хит продаж")}</div>`
      : "";

  const imageHtml = renderDetailImage(item);
  const isHotDog = item.category === "hot-dogs";
  const defaultSausageId = HOT_DOG_SAUSAGE_OPTIONS[0]?.id ?? "classic";
  const defaultSausageLabel =
    HOT_DOG_SAUSAGE_OPTIONS.find((o) => o.id === defaultSausageId)?.label ??
    HOT_DOG_SAUSAGE_OPTIONS[0]?.label ??
    "";
  const sausagePickerHtml = isHotDog
    ? `
      <div class="detail-sausage-picker" id="detail-sausage-picker" aria-label="Выберите сосиску">
        <p class="detail-sausage-picker__title">Выберите сосиску</p>
        <div class="detail-sausage-picker__options">
          ${HOT_DOG_SAUSAGE_OPTIONS.map((o, idx) => {
            const active = idx === 0;
            return `<button type="button" class="detail-sausage-option${
              active ? " is-active" : ""
            }" data-sausage="${o.id}">${o.label}</button>`;
          }).join("")}
        </div>
      </div>
    `
    : "";

  return `
    <div class="${detailImageWrapClass(item)}">
      ${imageHtml}
    </div>
    <div class="detail-gradient" aria-hidden="true"></div>
    <div class="detail-info">
      ${hitHtml}
      <h2 class="detail-info__title">${item.name}</h2>
      ${
        isHotDog
          ? `<p class="detail-info__sausage" id="detail-hotdog-sausage-label">${defaultSausageLabel}</p>`
          : ""
      }
      <p class="detail-info__desc">${item.description || ""}</p>
      ${sausagePickerHtml}
      <p class="detail-info__price">${priceLabel}</p>
    </div>
  `;
}

function bindHotDogSausagePicker() {
  const picker = document.getElementById("detail-sausage-picker");
  const labelEl = document.getElementById("detail-hotdog-sausage-label");
  if (!picker || !labelEl) return;

  const buttons = Array.from(
    picker.querySelectorAll("[data-sausage]"),
  );
  if (buttons.length === 0) return;

  const setSelected = (id) => {
    buttons.forEach((btn) => {
      const btnId = btn.getAttribute("data-sausage") || "";
      btn.classList.toggle("is-active", btnId === id);
    });
    const opt = HOT_DOG_SAUSAGE_OPTIONS.find((o) => o.id === id);
    if (opt) labelEl.textContent = opt.label;
  };

  // Стартовая опция (первое значение в PDF/списке).
  setSelected(HOT_DOG_SAUSAGE_OPTIONS[0]?.id ?? "classic");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-sausage") || "classic";
      setSelected(id);
    });
  });
}

function openDetail(index) {
  const overlay = document.getElementById("detail-overlay");
  const stage = document.getElementById("detail-stage");
  const counter = document.getElementById("detail-counter");
  const item = visibleItems[index];
  if (!overlay || !stage || !item) return;

  detailIndex = index;
  stage.innerHTML = renderDetailContent(item);
  bindHotDogSausagePicker();
  bindDetailFavorite(item);
  overlay.classList.remove("is-hidden", "is-closing");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (visibleItems.length > 1 && counter) {
    counter.textContent = `${index + 1} / ${visibleItems.length}`;
    counter.classList.remove("is-hidden");
  } else if (counter) {
    counter.classList.add("is-hidden");
  }
}

function closeDetail() {
  const overlay = document.getElementById("detail-overlay");
  if (!overlay || overlay.classList.contains("is-hidden")) return;

  overlay.classList.add("is-closing");
  window.setTimeout(() => {
    overlay.classList.add("is-hidden");
    overlay.classList.remove("is-closing");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    detailIndex = -1;
  }, 280);
}

function bindDetailControls() {
  document.getElementById("detail-back")?.addEventListener("click", closeDetail);

  document.getElementById("detail-overlay")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDetail();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
  });
}

const FLAG_SRC = {
  ru: "/flags/ru.svg",
  en: "/flags/gb.svg",
  vn: "/flags/vn.svg",
};

function bindLangMenu() {
  const root = document.getElementById("lang-menu");
  const trigger = document.getElementById("lang-menu-trigger");
  const dropdown = document.getElementById("lang-menu-list");
  if (!root || !trigger || !dropdown) return;

  const triggerFlag = trigger.querySelector(".lang-menu__flag");
  const options = dropdown.querySelectorAll(".lang-menu__option");

  const setOpen = (open) => {
    root.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    dropdown.classList.toggle("is-hidden", !open);
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!root.classList.contains("is-open"));
  });

  options.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      const lang = option.getAttribute("data-lang");
      if (!lang || !FLAG_SRC[lang]) return;

      options.forEach((item) => {
        const active = item === option;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });

      if (triggerFlag) {
        triggerFlag.src = FLAG_SRC[lang];
      }

      setOpen(false);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) setOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function init() {
  favoriteIds = loadFavorites();
  renderBottomNav();
  updateCategoryTabsVisibility();
  renderCategoryTabs();
  renderMenuList();
  bindDetailControls();
  bindLangMenu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
