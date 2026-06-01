const IMG = (file) => `/food/menu/${file}`;

const CATEGORIES = [
  { id: "all", label: "Все" },
  { id: "burgers", label: "Бургеры" },
  { id: "hot-dogs", label: "Хот-доги" },
  { id: "fries-snacks", label: "Фри и закуски" },
  { id: "snacks", label: "Закуски" },
  { id: "dumplings", label: "Пельмени и вареники" },
  { id: "kids", label: "Детское меню" },
];

const CATEGORY_ORDER = ["burgers", "hot-dogs", "fries-snacks", "snacks", "dumplings", "kids"];

const MENU_ITEMS = [
  {
    id: "burger-classic",
    name: "Классический бургер",
    description: "Говяжья котлета, свежие овощи и фирменный соус в мягкой булочке",
    price: 105000,
    category: "burgers",
    image: IMG("burger-classic.png"),
  },
  {
    id: "cheeseburger",
    name: "Чизбургер",
    description: "Сочная котлета, расплавленный сыр, свежие овощи и фирменный соус",
    price: 140000,
    category: "burgers",
    image: IMG("CHEESEBURGER.png"),
  },
  {
    id: "gastroburger",
    name: "Гастробургер",
    description: "Фирменный бургер Gastrofood — насыщенный вкус и авторская подача",
    price: 180000,
    category: "burgers",
    image: IMG("GASTROBURGER.png"),
    badge: "hit",
  },
  {
    id: "fishburger",
    name: "Фишбургер",
    description:
      "Булочка бриошь с кунжутом, рыбная котлета в хрустящей золотистой панировке, соус тартар, лист салата, свежий помидор, маринованные огурцы и красный лук.",
    price: null,
    category: "burgers",
    image: IMG("fishburger.png"),
    imageScale: 1.52,
  },
  {
    id: "classic-hot-dog",
    name: "Классический хот-дог",
    description: "Сочная сосиска, горячий багет и фирменные топпинги",
    price: 69000,
    category: "hot-dogs",
    image: IMG("CLASSIC-HOT-DOG.png"),
    badge: "hit",
  },
  {
    id: "french-fries",
    name: "Картофель фри",
    description: "Хрустящий картофель фри — идеальная закуска к бургеру или хот-догу",
    price: 45000,
    category: "fries-snacks",
    image: IMG("FRENCH-FRIES.png"),
  },
  {
    id: "potato-wedges",
    name: "Картофельные дольки",
    description: "Запечённые дольки картофеля с золотистой корочкой",
    price: 55000,
    category: "fries-snacks",
    image: IMG("POTATO-WEDGES.png"),
  },
  {
    id: "nuggets",
    name: "Наггетсы",
    description: "Куриные наггетсы — хрустящие снаружи, нежные внутри",
    price: 65000,
    category: "fries-snacks",
    image: IMG("NUGGETS.png"),
  },
  {
    id: "fish-bites",
    name: "Рыбные кусочки",
    description: "Кусочки рыбы в хрустящей панировке с соусом на выбор",
    price: 75000,
    category: "fries-snacks",
    image: IMG("FISH-BITES.png"),
    badge: "hit",
  },
  {
    id: "shrimp-tempura",
    name: "Креветки Темпура",
    description: "Хрустящие креветки в темпурном кляре — подаются с соусом",
    price: null,
    category: "snacks",
    image: IMG("shrimp-tempura.png"),
  },
  {
    id: "cheese-sticks",
    name: "Сырные Палочки",
    description: "Запечённые сырные палочки с хрустящей корочкой",
    price: null,
    category: "snacks",
    image: IMG("cheese-sticks.png"),
  },
  {
    id: "potato-dumplings",
    name: "Вареники с картофелем",
    description: "Домашние вареники с картофельной начинкой",
    price: 75000,
    category: "dumplings",
    image: IMG("POTATO-DUMPLINGS.png"),
    boxScale: 1.62,
  },
  {
    id: "potato-mushroom-dumplings",
    name: "Вареники с картофелем и грибами",
    description: "Нежные вареники с картофелем и ароматными грибами",
    price: 79000,
    category: "dumplings",
    image: IMG("POTATO-MUSHROOM-DUMPLINGS.png"),
    boxScale: 1.36,
  },
  {
    id: "pork-beef-dumplings",
    name: "Пельмени свинина и говядина",
    description: "Сочные пельмени с начинкой из свинины и говядины",
    price: 89000,
    category: "dumplings",
    image: IMG("PORK-BEEF-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "chicken-dumplings",
    name: "Пельмени с курицей",
    description: "Нежные пельмени с сочной куриной начинкой",
    price: 85000,
    category: "dumplings",
    image: IMG("CHICKEN-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "fried-pork-beef-dumplings",
    name: "Жареные пельмени свинина и говядина",
    description: "Обжаренные пельмени с мясной начинкой — хрустящая корочка",
    price: 95000,
    category: "dumplings",
    image: IMG("FRIED-PORK-BEEF-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "fried-chicken-dumplings",
    name: "Жареные пельмени с курицей",
    description: "Обжаренные пельмени с курицей — золотистые и ароматные",
    price: 92000,
    category: "dumplings",
    image: IMG("FRIED-CHICKEN-DUMPLINGS.png"),
    boxScale: 1.05,
  },
  {
    id: "kids-combo-sausage",
    name: "Детский сет с сосиской",
    description: "Сосиска, гарнир и напиток — порция для маленьких гостей",
    price: 79000,
    category: "kids",
    image: IMG("KIDS-COMBO-SAUSAGE.png"),
    badge: "hit",
  },
  {
    id: "kids-combo-nuggets",
    name: "Детский сет с наггетсами",
    description: "Наггетсы, гарнир и напиток — порция для маленьких гостей",
    price: 85000,
    category: "kids",
    image: IMG("KIDS-COMBO-NUGGETS.png"),
    badge: "hit",
  },
];

let activeCategory = "all";
let visibleItems = [];
let detailIndex = -1;

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
  if (activeCategory === "all") {
    return CATEGORY_ORDER.flatMap((catId) =>
      MENU_ITEMS.filter((item) => item.category === catId),
    );
  }
  return MENU_ITEMS.filter((item) => item.category === activeCategory);
}

function renderCategoryTabs() {
  const root = document.getElementById("category-tabs");
  if (!root) return;

  root.innerHTML = CATEGORIES.map(
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

function imageScaleStyle(item, context = "list") {
  if (item.imageScale == null) return "";
  const origin = context === "detail" ? "center center" : "top center";
  return ` style="transform: scale(${item.imageScale}); transform-origin: ${origin};"`;
}

function renderMenuCard(item, index) {
  const priceLabel = `${formatVnd(item.price)} VND`;
  const hitHtml = item.badge === "hit" ? hitBadgeHtml("Хит") : "";

  return `
    <button
      type="button"
      class="menu-card${item.badge === "hit" ? " menu-card--has-hit" : ""}"
      role="listitem"
      data-index="${index}"
      style="animation-delay: ${index * 0.03}s"
    >
      <div class="menu-card__body">
        ${item.badge === "hit" ? `<div class="menu-card__top">${hitHtml}</div>` : ""}
        <div class="menu-card__content">
          <h3 class="menu-card__name">${item.name}</h3>
          <p class="menu-card__desc">${item.description || ""}</p>
          <span class="menu-card__price">${priceLabel}</span>
        </div>
      </div>
      <div class="menu-card__media${isBoxItem(item) ? " menu-card__media--box" : ""}">
        ${
          isBoxItem(item)
            ? `<div class="menu-card__box-frame"><img src="${item.image}" alt="" loading="lazy"${boxImageStyle(item)} /></div>`
            : `<img src="${item.image}" alt="" loading="lazy"${imageScaleStyle(item)} />`
        }
        <span class="menu-card__open">${ARROW_ICON}</span>
      </div>
    </button>
  `;
}

function renderMenuList() {
  const list = document.getElementById("menu-list");
  const empty = document.getElementById("menu-empty");
  if (!list || !empty) return;

  visibleItems = getVisibleItems();

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

  list.querySelectorAll(".menu-card").forEach((card) => {
    card.addEventListener("click", () => {
      const index = Number(card.getAttribute("data-index"));
      openDetail(index);
    });
  });
}

function renderDetailContent(item) {
  const priceLabel = `${formatVnd(item.price)} VND`;
  const hitHtml =
    item.badge === "hit"
      ? `<div class="detail-info__hit">${hitBadgeHtml("Хит продаж")}</div>`
      : "";

  const imageHtml = isBoxItem(item)
    ? `<div class="detail-box-frame"><img src="${item.image}" alt="${item.name}"${boxImageStyle(item, "detail")} /></div>`
    : `<img src="${item.image}" alt="${item.name}"${imageScaleStyle(item, "detail")} />`;

  return `
    <div class="detail-image-wrap${isBoxItem(item) ? " detail-image-wrap--box" : ""}">
      ${imageHtml}
    </div>
    <div class="detail-gradient" aria-hidden="true"></div>
    <div class="detail-info">
      ${hitHtml}
      <h2 class="detail-info__title">${item.name}</h2>
      <p class="detail-info__desc">${item.description || ""}</p>
      <p class="detail-info__price">${priceLabel}</p>
    </div>
  `;
}

function openDetail(index) {
  const overlay = document.getElementById("detail-overlay");
  const stage = document.getElementById("detail-stage");
  const counter = document.getElementById("detail-counter");
  const item = visibleItems[index];
  if (!overlay || !stage || !item) return;

  detailIndex = index;
  stage.innerHTML = renderDetailContent(item);
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
