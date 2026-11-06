# Приёмка ERP «Меню»

Единственный издатель: Agent 4. Код Poster-спеки, UI и расчётов пишут другие ветки. Здесь — сценарии проверки, порядок слияния и журнал публикации.

Спека Agent 1 (читать по абсолютному пути, не копировать код):

`C:\Users\Nikita Ponomarev\Downloads\BAR FOOD\GASTROBAR-menu-spec\docs\erp-menu-poster\`

Контракт API Agent 3 (черновик, файл появился, коммита нет):

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

## Текущее ERP на `origin/main` (до среза Меню)

Не спецификация Poster, а что уже есть и что нельзя сломать:

| Poster-вкладка | Сейчас в ERP | Маршрут |
|----------------|--------------|---------|
| Товары | Блюда (не публичное меню сайта) | `/erp/menu`, `/erp/menu/[id]` |
| Тех. карты | Состав блюда + рецептура полуфабриката | `/erp/menu/[id]`, `/erp/preps/recipe/[id]` |
| Полуфабрикаты | Продукты `semi_finished`/`finished` + партии | `/erp/preps`, `/erp/preps/batches` |
| Ингредиенты | Те же `erp_products` (тип `ingredient`) | `/erp/products` |
| Контроль фудкоста | Колонки Food Cost / маржа в списке блюд | `/erp/menu` |
| Категории товаров и тех. карт | Один справочник категорий | `/erp/products/categories` |
| Категории ингредиентов | Тот же справочник, отдельной вкладки нет | — |
| Цехи | Отдельной сущности нет; есть склады | `/erp/stock/warehouses` |

Склад: `/erp/stock`. Сохранение блюда не двигает `erp_movements` (тест `dish save is pure calculation data`).
