# ERP «Меню»: карта повторного использования и контракт API

Агент 2 (UI) читает этот файл. Источник истины по данным — существующий ERP-каталог на `origin/main`, не новый справочник.

Спека Poster читается из `GASTROBAR-menu-spec/docs/erp-menu-poster/` по мере появления файлов. Сейчас есть `README.md` (вкладки, заведения ≠ цехи, фудкост из KB). Файлы вкладок кроме README ещё не лежат (`tovary.md` обещан, на диске нет).

## Карта сущностей (не плодить вторые справочники)

| Смысл Poster / кухни | Уже есть в ERP | Тип / таблица | Не делать |
| --- | --- | --- | --- |
| Ингредиент | `erp_products` | `type = 'ingredient'` | Таблица `erp_ingredients` |
| Полуфабрикат / заготовка | `erp_products` + техкарта | `type = 'semi_finished'`, выход = `erp_recipes.product_id` | Отдельный каталог заготовок |
| Готовое блюдо как складской SKU | `erp_products` | `type = 'finished'` + рецепт | Не путать с позицией меню |
| Позиция меню / техкарта блюда | `erp_dishes` + `erp_dish_lines` | Состав ссылается на **id продукта**, не на имя | Не делать `erp_menu_items` параллельно `erp_dishes` |
| Упаковка / расходники | `erp_products` | `type = 'packaging' \| 'consumable'` | В food cost не входят |
| Категория | `erp_categories` | Общая для товаров **и** блюд (`category_id`) | Второй список категорий меню |
| Фасовка | `erp_packs` + `erp_product_packs` | Общий каталог фасовок, связи товар↔фасовка↔поставщик | Новые pack id при «меню» |
| Поставщик | `erp_suppliers` | Как в поставках | Дубль поставщиков |
| Заведение Poster | **не 1:1 с цехом** | Фильтр: GASTROBAR, FOODTRUCK, PREP KITCHEN, ONLINE KITCHEN (радио, одно заведение) | Не склеивать с цехами |
| Склад / точка ERP | `erp_warehouses` | `food_truck`, `prep_kitchen`, `online_kitchen`; `warehouse` ≠ «GASTROBAR» как имя | Не переименовывать склады под Poster |
| Цех | **нет таблицы** | Poster: «Без цеха», GASTROBAR, GASTROFOOD, GASTROTRUCK WORKSHOP — станции кухни/печати, не остатки | Не мапить цех на `erp_warehouses`. Таблица после `tsekhi.md` |
| Партия заготовки | `erp_documents` `doc_type='production'` + `erp_lots` | Выход на `target_warehouse_id` | Пересчёт партий при правке карточки |
| Канал продаж | `erp_sales_channels` + `erp_dish_channel_prices` | Комиссия канала, цена канала | Новый прайс-модуль |
| НДС | `erp_settings` + ставка на блюде/строке поставки | `input_vat_*`, `output_vat_*`, `erp_dishes.vat_rate` | Отдельный налоговый модуль |
| История рецепта | версии `erp_recipes` (`draft` / `active` / `archived`) | Одна active на продукт | Перезапись проведённого производства |
| История карточки | `erp_card_revisions` + `GET /api/erp/history` | Снимок после save/activate | Движения склада |

Идентификаторы товаров, фасовок, поставщиков, документов **не менять**. Состав блюда и рецепта — только `product_id` из `erp_products`.

Типов `prep` / `dish` у продукта **нет**. Prep = `semi_finished`. Блюдо меню = строка `erp_dishes`, а не `type='dish'`.

## Инварианты (уже в коде, UI не должен их ломать)

1. Списание со склада — только FIFO в `erp_consume` (партия `received_at`, затем `created_at` / `line_no`). Калькуляция меню **не** списывает.
2. Неизвестная себестоимость = `null`, никогда `0`. Неполная калькуляция: `complete=false`, итоги `null`.
3. Правка карточки товара / рецепта / блюда **не** двигает `erp_lots` / `erp_movements` и **не** переписывает проведённые документы. Новая версия рецепта — новый `erp_recipes.id`; старая active уходит в archived.
4. Staff↔ERP не включать (`ERP_CATALOG_SOURCE=db` не трогать).
5. Неизвестный вес потерь: нетто не подставлять нулём в стоимость. Стоимость = цена × **брутто** (то, что уйдёт со склада). Потери (`loss_*_pct`, `methods`, `net_qty`) — для выхода порции, не для списания в карточке.

## Формулы (VND)

Источник цены техкарты — одно из трёх, явно:

| `priceSource` | Смысл | Когда `null` |
| --- | --- | --- |
| `reference` (**по умолчанию**) | `erp_products.est_unit_cost` (последняя проведённая поставка нетто или ручная цена карточки) | цены нет |
| `last_lot` | `unit_cost` самой новой **проведённой** партии (остаток может быть 0) | у этой партии cost unknown |
| `fifo_remaining` | Σ(`qty_left` × `unit_cost`) / Σ(`qty_left`) | нет остатка **или** есть остаток без цены |

Не подмешивать источники на одной строке. Нет котировок в стейте → `last_lot` / `fifo_remaining` = нет цены (не падать тихо в `reference`).

Разбор заготовки:

- `explodeRecipes: true` (техкарта): активный рецепт с `yield_qty` раскрывается. Партии самой заготовки **не** прибавляются (иначе двойной счёт ингредиентов и выпуска).
- `explodeRecipes: false`: заготовка как один SKU по выбранному источнику (оценка остатка выпуска, не техкарта).

Масштаб рецепта: `childQty = line.qty × (requestedQty / yield_qty)`.

Продажа / food cost / наценка (`src/lib/erp/costing.ts`, `channelResult`):

```
vatRate       = output VAT off → 0; иначе dish.vat_rate ?? settings.default_output_vat_rate
netRevenue    = price / (1 + vatRate/100)
vat           = price − netRevenue
commission    = price × commission_pct / 100
foodCost      = Σ строк еды; null если хоть одна неизвестна
packagingCost = Σ packaging|consumable; null если неизвестна
totalCost     = foodCost + packagingCost
foodCostPct   = foodCost / netRevenue × 100          // уже в экране меню (с учётом НДС)
foodCostOnPricePct = foodCost / price × 100          // Poster KB: себестоимость / цена
totalCostPct  = totalCost / netRevenue × 100
markupPct     = (netRevenue − totalCost) / totalCost × 100     // null при totalCost 0 или null
foodMarkupPct = (netRevenue − foodCost) / foodCost × 100
grossProfit   = netRevenue − commission − totalCost
grossMarginPct= grossProfit / netRevenue × 100
```

`price` — цена как на меню (с выходным НДС, если выходной НДС включён). НДС — только `erp_settings` + `dish.vat_rate`.

Poster KB считает фудкост от **цены продажи** (`foodCostOnPricePct`). Экран ERP уже показывает фудкост от выручки без НДС (`foodCostPct`). UI может показать оба; не подменять одно другим без спеки вкладки «Контроль фудкоста».

Poster считает себестоимость ингредиента **средневзвешенной по поставкам**. В ERP списание остаётся FIFO (`erp_consume`). Для техкарты по умолчанию `reference`; ближайший явный аналог средней по **остатку** — `fifo_remaining` (не среднее по всем историческим поставкам).

## API для UI

База без изменений:

- `GET /api/erp/state` — каталог. Новая часть: `costSources` (в полном стейте). Можно `?parts=dishes,products,recipes,categories,channels,settings,costSources`.
- `POST /api/erp/action` — те же действия:

| action | тело | patch |
| --- | --- | --- |
| `saveDish` | `{ dish: { id?, name_en, name_vn, category_id, sale_price, vat_rate, note, lines[{ product_id, qty, methods, net_qty, note }], channel_prices[{ channel_id, sale_price }] } }` | `dishes` |
| `saveRecipe` | `{ recipe: { id?, product_id, yield_qty, yield_pieces, instructions, shelf_life_days, storage_conditions, note, lines[{ product_id, qty, methods, net_qty, note, raw_* }] } }` | `recipes` |
| `activateRecipe` | `{ id }` | `recipes` |
| `saveProduct` | существующая карточка товара (тип, единица, потери, `est_unit_cost`, фасовки) | `products`, `packs`, `productPacks` |
| `saveRef` | `entity: "category"` | `categories` |
| `setArchived` | `entity: "dish" \| "product" \| "category"` | соответствующая часть |

`qty` в строках — в **базовой единице продукта** (`kg` / `l` / `pcs`). UI не угадывает коэффициент из названия фасовки.

Новое:

- `GET /api/erp/history?entity=product|recipe|dish&id=<uuid>&limit=50` → `{ entity, id, revisions: [{ id, saved_at, saved_by, action, snapshot }] }`. Только чтение. Склад не трогает.

Калькуляцию на клиенте считать из стейта:

```ts
import { menuCostContext, dishCost } from "@/lib/erp/menu";
import { DEFAULT_MENU_PRICE_SOURCE } from "@/lib/erp/costing";

const ctx = menuCostContext(state, DEFAULT_MENU_PRICE_SOURCE); // или last_lot / fifo_remaining
const { summary, channels, main } = dishCost(ctx, dish, state.settings, state.channels);
```

Поля для экрана: `summary.foodCost`, `summary.packagingCost`, `summary.totalCost`, `summary.complete`, `summary.missing`, `main.foodCostPct`, `main.foodCostOnPricePct` (Poster), `main.markupPct`, `main.foodMarkupPct`, `main.grossProfit`, `main.grossMarginPct`, `line.source`, `line.children`, `line.issue`.

Котировки: `state.costSources[]` → `{ product_id, last_lot, fifo_remaining, reference }`. Числа из JSON могут прийти строкой — `asMoney()` / `Number`, **0 не превращать в null**.

Циклы: сервер режет `ERP_RECIPE_CYCLE` при сохранении строки рецепта. Клиентский `costLine` ставит `issue: "cycle"`. Заготовки в заготовках разрешены, пока нет цикла.

## Состав стейта, который UI уже получает

- `products[]` — ингредиенты, заготовки, готовые, упаковка. Поля потерь `loss_clean_pct` …
- `recipes[]` + `lines[]` (включая неразрешённые импорты: `product_id` null, `raw_name`)
- `dishes[]` + `lines[]` + `channel_prices[]`
- `categories[]`, `warehouses[]`, `channels[]`, `settings`
- `packs[]`, `productPacks[]`, `suppliers[]` — для карточки товара, не для второго меню
- `stock[]` — остатки; для техкарты не подмешивать к раскрытому рецепту

## Что ждёт спецификацию Poster (`docs/erp-menu-poster/`)

Из `README.md` уже ясно: **заведения и цехи — разные имена**. Цех не склад. Заведение в Poster — фильтр списка (GASTROBAR / FOODTRUCK / PREP KITCHEN / ONLINE KITCHEN).

Ещё нет файлов вкладок. Не выдумывать, пока нет `tovary.md` / `tsekhi.md` / `tech-karty.md`:

- Таблица цехов и `workshop_id` на карточке (есть только список имён в README).
- Доступность позиции по заведению (списки товаров во всех 4 заведениях пусты; форма «Добавить» была открыта, файл вкладки не записан).
- Отдельные категории ингредиентов vs категории товаров/техкарт (в ERP одна `erp_categories` на товары и блюда — не рвать, пока нет `kategorii-*.md`).
- Модификаторы, фото, выход в другой единице.
- Синхронизация публичного меню / Poster `menu.getProducts` с `erp_dishes`.
- Списание блюда при продаже (не карточка; Staff↔ERP не включать).
- Разруб (`erp_split_profiles` — схема есть, UI и проведение не здесь).
- Средневзвешенная «по всем поставкам» как четвёртый источник цены.

Когда файлы вкладок появятся: только **аддитивные** колонки/связи, без второго каталога ингредиентов и без мапинга цеха на склад.

## Навигация / CSS

Маршруты уже есть: `/erp/menu`, `/erp/menu/[id]`, `/erp/preps`, `/erp/preps/recipe/[id]`. Стили и навигация — зона Агента 2 (`erp.css`, nav). Логика не требует новых URL, кроме опциональной истории на карточке через `GET /api/erp/history`.
