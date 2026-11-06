# Журнал публикации ERP «Меню»

## Состояние на 2026-11-06 16:40 +07

Publish worktree: `GASTROBAR-inventory` `main` = `5cc4740` = `origin/main`. Нового среза UI/логики **нет** (спека и CardHistory без коммита).

### Живой прод

| | |
|--|--|
| Код Меню | `490d1dd` / merge UI `d6c5269` + логика `8d2af42` |
| Журнал SQL | `5cc4740` (16:28): additive SQL на production, каталог 127 |
| Vercel | `dpl_AzBCTXdhzVw4aGniP9Xuq2HUmng8` **Ready** production, created 15:49 +07 |
| Алиасы | https://www.gastrotruck.org |

`/erp/menu` → `MenuGoodsPage`; `/erp/products` → полный `ProductsPage`.

### Merge в этой сессии Agent 4

| Ветка | HEAD | Действие |
|-------|------|----------|
| `erp-menu-logic` | `8d2af42` уже в main | не мержить |
| `erp-menu-ui` | `cc6d30d` уже в main | не мержить |
| UI untracked | `CardHistory.tsx` | нет коммита — не срез |
| `erp-menu-spec` | untracked `docs/erp-menu-poster/` (все 8 вкладок) | нет коммита — не мержить; сценарии обновлены по файлам на диске |

### Проверки этой сессии

| Проверка | Результат |
|----------|-----------|
| Probe из inventory `.env.local` | нет `SUPABASE_SERVICE_ROLE_KEY` — скрипт не ходил в PostgREST |
| SQL Editor | вкладка PRODUCTION открыта; новый SQL **не** вставляли |
| GET `/erp/menu` | оболочка ERP, не 404 |
| Залогиненный UI | Cursor-браузер — вход; Chrome владельца занят Poster |
| Тесты/tsc/next build | не гоняли: нет нового кода продукта |

### Бэкапы

Free-план без PITR.

| Где | Статус |
|-----|--------|
| `.erp-menu-backup/` в inventory | **каталога нет** (gitignore) |
| `.erp-pack-merge-backup/` | есть, это фасовки |
| Живой каталог | **127** продуктов по `5cc4740` (`erp_load_state(products)`) |

Перед следующим live SQL: заново `backup-menu.ts` и убедиться, что JSON на диске.

### Пробелы vs Poster (спека всех 8 вкладок на диске)

- Печать — pager, не все filtered (**E2**).
- Цех/заведение stub; на п/ф фильтр Цех лишний.
- Тех. карты: нет Выход/Цена/Наценка по умолчанию; нет панели Состав/история (API history в main, CardHistory не закоммичен).
- Два дерева категорий Poster → один `erp_categories`.
- Цехи stub. Postie не клонируем. Модификаторы/импорт/авто-30 дней — нет.
- unknown = `null`, не Poster 0. «Food cost / цена» = формула Poster.
- G1 тайминги не сняты. Staff↔ERP выключен.

### Живые URL

- https://www.gastrotruck.org/erp/menu
- https://www.gastrotruck.org/erp/products — каталог 127
- https://www.gastrotruck.org/erp/stock
- https://www.gastrotruck.org/erp/menu/recipes
- https://www.gastrotruck.org/erp/menu/preps

---

## Состояние на 2026-11-06 16:26 +07 (`5cc4740`)

`erp-menu-ui` не пушили.

Порядок merge: логика `8d2af42` → UI `cc6d30d` через `d6c5269` → документы `e85a003` / `490d1dd`.

| Проверка | Результат |
|----------|-----------|
| `npx tsc --noEmit -p .` | ok |
| `npx tsx scripts/erp/test-erp.ts` | **77/77** |
| `npx next build` | ok, `/erp/products` и `/erp/menu` раздельно |
| `git push origin main` | already up to date, без force |
| Prod SQL `20261106143000` | **applied** в SQL Editor, `main (PRODUCTION)`. Start `-- Menu / tech-card: planned cost quotes…`, end `grant execute on function %s to service_role`. Success. Без truncate. |
| PostgREST probe | view ok; `erp_card_revisions` ok; `erp_card_history` ok; `erp_load_state(products)` = **127** |
| Live `/erp/products` | RSC `ProductsPage`, каталог 127/127 live |
| Live `/erp/menu` | RSC `MenuGoodsPage` |
| Staff catalog | не трогали |

Pooler ENOTFOUND не повторяли. Cursor-browser для Supabase не использовали.

---

## Состояние на 2026-11-06 15:50 +07

Тогда `d6c5269` ещё не был запушен; SQL помечался как не applied. Историческая запись, не текущий статус.
