# Журнал публикации ERP «Меню»

## Состояние на 2026-11-06 14:55 +07

Специалисты только создали worktree, коммитов сверх `origin/main` (`dd665dc`) нет.

| Ветка | Worktree | HEAD | Коммиты поверх main | Можно merge? |
|-------|----------|------|---------------------|--------------|
| `erp-menu-spec` | `GASTROBAR-menu-spec` | `dd665dc` + untracked `docs/erp-menu-poster/` (README, tovary.md, 1 скрин) | нет коммита | нет |
| `erp-menu-logic` | `GASTROBAR-menu-logic` | `8d2af42` на `main` (ещё не push) | котировки, история, тесты 77/77 | после build + SQL |
| `erp-menu-ui` | `GASTROBAR-menu-ui` | локальный `5a341a0` | оболочка вкладок | **не мержить** |

Publish worktree: `GASTROBAR-inventory` на `main`, на 1 коммит позади `origin/main` (`dd665dc` — сворачивание сайдбара склада). Перед первым merge: `git pull --ff-only origin main`.

## Порядок merge (когда появятся коммиты)

1. Спека (docs) — рано, не ломает сборку.
2. Логика (миграции + тесты + API).
3. UI. Если UI не компилируется без API — строго после шага 2.

Каждый шаг: merge **одной** ветки в `origin/main` → тесты → `tsc` → `npx next build` → push `main` → дождаться GitHub Deployment / Vercel API (таймаут минут, не `vercel ls` на 2 часа) → проверить URL.

Публиковать срез только если он реален.

## Бэкапы

JSON в `.erp-menu-backup/` (gitignore). Free-план без PITR — это восстановимая копия строк.

| Когда | Файл | Сводка | Миграция Меню? |
|-------|------|--------|----------------|
| 2026-11-06 14:56 +07 | `before-2026-11-06T07-56-49-960Z.json` | products 127/127 live; packs 120 (56 live); product_packs 119; suppliers 14; categories 9; warehouses 4; recipes 5 / 57 lines; dishes 0; lots 1; documents 1 posted; stock_qty 1; stock_value 10000 | нет, снимок до среза |

## Живые URL после среза

- https://www.gastrotruck.org/erp/menu
- https://www.gastrotruck.org/erp/products
- https://www.gastrotruck.org/erp/stock
- https://www.gastrotruck.org/erp/preps

Пока срез не выложен: на сайте текущее Меню (список блюд + карточка), без вкладок Poster.

## Черновики (не коммитили — merge нельзя)

**Логика** (`erp-menu-logic`, dirty): контракт `docs/erp-menu-api-contract.md` есть. `src/lib/erp/menu.ts`, `costing.ts` (три источника, default `reference`), миграция `20261106143000_erp_menu_cost_history.sql` (история + котировки + `erp_load_state` с `costSources`). Похоже additive. `GET /api/erp/history`.

**UI** локальный коммит `5a341a0`: вкладки под `/erp/menu/*`. `/erp/products` → ингредиенты (по умолчанию только `type=ingredient`), `/erp/preps` → полуфабрикаты. Из шапки убраны Продукты/Полуфабрикаты. Stubs цех/заведение — `ok: false`, не фейковый успех.

**Не публиковать `5a341a0`:** вкладка «Товары» = `erp_dishes`, а по спеке Poster товары — готовая перепродажа (в аккаунте 0 строк). Те же блюда ещё раз на «Тех. карты». Редирект `/erp/products` ломает общий список каталога, который хозяин только начал заполнять.

**Спека**: README + `tovary.md` на диске, без коммита. Тех. карты «в работе».

## Пробелы (на сейчас)

- **Блокер публикации UI:** «Товары» ≠ `erp_dishes`.
- Спека только Товары; остальные вкладки ждут Agent 1.
- Логика и спека без коммита — в `origin/main` нечего мержить, кроме будущего docs-only.
- Цех ≠ склад (имена разные). Не создавать `erp_workshops` до файла вкладки, не мапить склады.
- Staff↔ERP выключен **намеренно**.
- Печать черновика UI — текущая страница pager.
- `/erp/products` в UI-коммите редиректит в ингредиенты — риск для заполнения каталога.
- Карточки `/erp/products/[id]` должны остаться.
