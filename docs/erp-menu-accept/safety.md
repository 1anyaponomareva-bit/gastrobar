# Каталог, склад, тайминги

## Запрещено

- Truncate `erp_products`, `erp_packs`, `erp_lots`, документов.
- Reset каталога, импорт «с нуля».
- Включать `ERP_CATALOG_SOURCE=db` / Staff↔ERP.
- Сценарии списания/проведения на рабочей базе.
- Force-push `main`.
- `npm run build` как проверка (prebuild переписывает `public/menu`). Нужен `npx next build`.

## Бэкап до миграции prod

Free Supabase: нет PITR. Перед SQL — JSON-копия строк, которые трогаем.

```text
npx tsx scripts/erp/backup-menu.ts
```

Пишет `.erp-menu-backup/` (gitignore). В git не класть.

Перед `apply`: миграция только additive (новые таблицы/колонки/индексы/функции, без DROP существующих каталожных данных). Проверить SQL глазами.

После apply: сравнить summary бэкапа со SELECT: число продуктов, фасовок, связей, поставщиков, документов, сумма `qty_left` и `qty_left * unit_cost`.

## Регресс склада (PGlite)

Обязательный прогон после merge логики/UI, до push:

```text
npx tsx scripts/erp/test-erp.ts
npx tsc --noEmit -p .
npx next build
```

Минимум из уже существующих тестов, которые Меню не имеет права сломать:

- `dish save is pure calculation data (no stock change)`
- `unknown cost stays unknown, never zero`
- `semi-finished recipe with versions and no cycles`
- `insufficient stock blocks posting and changes nothing`
- `posted batch keeps its cost after new prices`
- same-time FIFO (дорогая первая линия при одном `received_at`)
- production post guards (нулевой выход / партия без ингредиентов не двигает склад)

На сайте после деплоя (без проведения):

- https://www.gastrotruck.org/erp/menu
- https://www.gastrotruck.org/erp/products
- https://www.gastrotruck.org/erp/stock
- https://www.gastrotruck.org/erp/preps

Открыть остатки: количества на месте, средняя в UI не выдаётся за FIFO. Не проводить документы «для проверки».

## F6 Staff

`/api` каталога Staff на production должен остаться `"source":"file"`. Если в ответе `db` — стоп, не публиковать дальше.

## Тайминги G1–G2

Замер на живом домене после деплоя (Network: документ + XHR state/action):

| Страница | Открытие (мс) | Сохранение карточки (мс) | Дата | Примечание |
|----------|---------------|---------------------------|------|------------|
| `/erp/menu` | | — | | |
| `/erp/products` | | | | |
| `/erp/stock` | | — | | |
| карточка блюда | | | | |

Пустые ячейки — ещё не мерили.

## Снимок каталога до среза (2026-11-06)

Из бэкапа, не с UI: 127 продуктов, 56 живых фасовок (120 с архивом слияния), 119 связей, 14 поставщиков, 9 категорий, 4 склада, 5 рецептов, 0 блюд, 1 партия qty=1 value=10000, 1 проведённый документ. UUID лежат в JSON-бэкапе.
