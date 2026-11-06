# Переезд ERP на gastrofood.vn

Один Vercel-проект `gastrobar`, та же база Supabase. Публичный ERP: **https://gastrofood.vn** (без www и без `/erp`). Staff, recipes, kitchen, check, poster-test, меню остаются на [www.gastrotruck.org](https://www.gastrotruck.org).

Откат этого переезда: SHA из `GASTROBAR-restore-checkpoints/pre-move-erp-gastrofood-vn-2026-11-07` плюс `ERP_REDIRECT_FROM_LEGACY` выключен. Снимок `restore-2026-11-07-0052` / `89bdcd` **не** автоматический откат. Базу не восстанавливать.

## Адреса

- `https://gastrofood.vn/` — главная ERP
- `https://gastrofood.vn/stock/receipts` — поставки (и остальные разделы без `/erp`)
- `https://www.gastrofood.vn/…` — 307 на тот же путь на gastrofood.vn
- Внутри Next страницы остаются `/erp/*`; middleware делает rewrite. В адресной строке `/erp` быть не должно.

## Флаги

| Флаг | Смысл |
| --- | --- |
| `ERP_HOSTS` | A: `gastrofood.vn,www.gastrofood.vn`. Пустое в коде всё равно подставляется это значение на Edge. |
| `ERP_REDIRECT_FROM_LEGACY` | B: `1` — временный **307** GET/HEAD со старого `/erp` на чистый URL. Выкл. = dual-run / откат. |
| `ERP_CLOSE_LEGACY_API` | C: закрыть старый `/api/erp` JSON. Только пока B включён. |

308 нет. Cookie `gf_recipes_admin` host-only. Supabase Auth / Google OAuth не трогаем.

## Откат

Vercel → `gastrobar` → Production: `ERP_REDIRECT_FROM_LEGACY=0`. Redeploy того же кода, если Edge заинлайнил флаг. Домен и DNS не удалять.
