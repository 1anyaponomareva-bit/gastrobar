# Журнал публикации ERP «Меню»

## Состояние на 2026-11-06 15:50 +07

Publish worktree: `GASTROBAR-inventory` `main` = `d6c5269`, **на 7 коммитов впереди** `origin/main` (`dd665dc`). Не запушено.

### Порядок merge (факт)

1. **Логика** `8d2af42` — котировки, история, `erp_load_state` + `costSources`, тесты 77/77.
2. **Документы приёмки** `e85a003` + typefix `237b725`.
3. **UI** `5a341a0` → `a5f52a1` → `cc6d30d`, merge `d6c5269`.
4. **Спека** — файлы на диске (`tovary.md`, `tech-karty.md`), **коммита нет**, в `origin/main` не мержили.

Спеку рано не мержили, потому что Agent 1 ещё не закоммитил. Логику раньше UI. UI после `cc6d30d`: Товары = `type=finished`. Конфликт `/erp/products` разрешён **в пользу полного каталога** (не редирект в ингредиенты).

`erp-menu-accept` в `GASTROBAR-menu-publish` содержит более ранний merge UI без `cc6d30d` — **не пушить**.

### Проверки перед push

| Проверка | Результат |
|----------|-----------|
| `npx tsx scripts/erp/test-erp.ts` | **77/77** (FIFO, dish save без склада, quotes, history, циклы) |
| `npx tsc --noEmit -p .` | ok на `d6c5269` |
| `npx next build` | ok (маршруты `/erp/menu/*`, `/erp/products`, `/erp/stock`) |
| Prod SQL `20261106143000_erp_menu_cost_history.sql` | **ещё не applied**. Additive: новые table/view/functions, без truncate каталога. `stateLoader` при отсутствии view отдаёт `[]`, склад не падает. |
| Postgres apply script | верный pooler `aws-1-ap-southeast-1`; пароль из `.env.supabase.local` отвергнут. SQL Editor Chrome перебит сессией Poster Agent 1. |

### Бэкапы

JSON в `.erp-menu-backup/` (gitignore). Free-план без PITR.

| Когда | Файл | Сводка | Миграция Меню? |
|-------|------|--------|----------------|
| 2026-11-06 14:56 +07 | `before-2026-11-06T07-56-49-960Z.json` | products 127/127 live; packs 120 (56 live); product_packs 119; suppliers 14; categories 9; warehouses 4; recipes 5 / 57 lines; dishes 0; lots 1; documents 1 posted; stock_qty 1; stock_value 10000 | нет, снимок до среза |

### Живые URL

- https://www.gastrotruck.org/erp/menu
- https://www.gastrotruck.org/erp/products — полный каталог, не только ингредиенты
- https://www.gastrotruck.org/erp/stock
- https://www.gastrotruck.org/erp/menu/recipes
- https://www.gastrotruck.org/erp/preps → `/erp/menu/preps`

### Почему UI больше не блокер

Раньше `5a341a0` клал в Товары `erp_dishes` и редиректил `/erp/products` в ингредиенты. Сейчас: Товары = finished; `/erp/products` жив; stubs цех/заведение `ok: false`.

### Пробелы после среза

- Prod-SQL котировок/истории не applied (пароль pooler не подошёл; Chrome SQL занят Poster).
- Печать списков — текущая страница pager, не все filtered.
- Цех/заведение не фильтруют (честный stub).
- Спека полуфабрикатов и остальных вкладок ещё без файлов.
- Модификаторы Poster, импорт, 30 дней корзины — нет.
- Staff↔ERP выключен **намеренно**.
- Формулы: unknown = `null` (не Poster 0); фудкост от netRevenue, не от итоговой цены.
