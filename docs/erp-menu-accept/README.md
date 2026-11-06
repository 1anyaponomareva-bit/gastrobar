# Приёмка ERP «Меню»

Единственный издатель: Agent 4. Код Poster-спеки, UI и расчётов пишут другие ветки. Здесь — сценарии проверки, порядок слияния и журнал публикации.

Спека Agent 1 (читать по абсолютному пути, не копировать код):

`C:\Users\Nikita Ponomarev\Downloads\BAR FOOD\GASTROBAR-menu-spec\docs\erp-menu-poster\`

Контракт API Agent 3:

`C:\Users\Nikita Ponomarev\Downloads\BAR FOOD\GASTROBAR-menu-logic\docs\erp-menu-api-contract.md`

Кратко: ингредиенты = `erp_products`; блюдо = `erp_dishes`; цех не создавать до спеки; default цены техкарты = `reference`; FIFO склада не менять.

## Правила

- Сценарии по вкладкам заполняются **по мере появления** файлов спеки. Поведение Poster не угадываем.
- Меняющие остатки сценарии — **только** изолированный PGlite (`.erp-menu-accept-db/`, не в git).
- Не включаем Staff↔ERP. Каталог не truncate / не reset.
- Публикуем срез только если кнопки делают заявленное действие (нет фиктивного «Сохранено») и склад по-прежнему проводит FIFO.
- Миграции рабочей базы — только после additive-проверки и JSON-бэкапа затронутых таблиц. Free-план без PITR.

## Документы

| Файл | Содержание |
|------|------------|
| [scenarios.md](scenarios.md) | Полный список сценариев и статусы |
| [calculations.md](calculations.md) | Заранее посчитанные примеры (текущие формулы ERP) |
| [safety.md](safety.md) | Каталог, FIFO, тайминги |
| [publish-log.md](publish-log.md) | Очередь merge, бэкапы, живые URL, пробелы |
| [tabs/](tabs/) | Чек-листы по вкладкам Poster, по файлам спеки |

## Ветки (ждать коммит, затем merge по одной в `origin/main`)

1. `GASTROBAR-menu-spec` / `erp-menu-spec` — docs+скриншоты, можно рано.
2. `GASTROBAR-menu-logic` / `erp-menu-logic` — API/миграции/тесты; **раньше UI**, если UI без API не собирается.
3. `GASTROBAR-menu-ui` / `erp-menu-ui` — экраны.

Слияние только из `GASTROBAR-inventory` или чистого publish-worktree. Чужие worktree не `git checkout` на другие ветки. Без force-push.

Не мержить незакоммиченные файлы (сейчас: `CardHistory.tsx` + `app/api/erp/history/` в UI-ветке поверх уже существующего history API в main; спека `docs/erp-menu-poster/` без коммита).

## Текущее ERP на `origin/main` (`5cc4740`, код Меню с `490d1dd`)

| Poster-вкладка | ERP сейчас | Маршрут |
|----------------|------------|---------|
| Товары | `erp_products` `type=finished` | `/erp/menu` (`MenuGoodsPage`) |
| Тех. карты | `erp_dishes` | `/erp/menu/recipes`, `/erp/menu/[id]` |
| Полуфабрикаты | `semi_finished` + рецепты | `/erp/menu/preps` (`/erp/preps` → сюда) |
| Ингредиенты | те же `erp_products` (ingredient + фильтр типов) | `/erp/menu/ingredients` |
| Контроль фудкоста | список блюд + формулы Poster/ERP | `/erp/menu/foodcost` |
| Категории товаров и тех. карт | один `erp_categories` | `/erp/menu/categories` |
| Категории ингредиентов | тот же справочник | `/erp/menu/ingredient-categories` |
| Цехи | нет сущности; stub | `/erp/menu/workshops` |
| Полный каталог (не вкладка Poster) | все типы продуктов | `/erp/products` |

Склад: `/erp/stock`. Сохранение блюда не двигает `erp_movements` (тест `dish save is pure calculation data`).
