# Переезд ERP на отдельный хост

Один Vercel-проект `gastrobar`, та же база Supabase. На новый хост уходит только ERP. Staff, recipes, kitchen, check, poster-test, меню остаются на [www.gastrotruck.org](https://www.gastrotruck.org).

Точка отката **этого** переезда: `GASTROBAR-restore-checkpoints/pre-move-erp-domain-2026-11-07` (SHA продакшена на момент пина). Снимок `restore-2026-11-07-0052` **не** автоматический откат домена. Базу для отката домена не восстанавливать.

Новый домен в этом документе не назван — в код его не подставлять, пока владелец не даст точный hostname (с www или без).

## Флаги (имена, без секретов)

| Флаг | Смысл |
| --- | --- |
| `ERP_HOSTS` | A: новые hostname ERP через запятую, без `https://`. Пусто = ворота нового хоста выключены. |
| `ERP_REDIRECT_FROM_LEGACY` | B: `1`/`true`/`on` — временный **307** только GET/HEAD `/erp` с `www.gastrotruck.org` и `gastrotruck.org`. Выключен независимо от A. |
| `ERP_CLOSE_LEGACY_API` | C: закрыть старый `/api/erp` JSON-ответом. Действует **только пока B включён**. |

308 в код не ставили. Cookie `gf_recipes_admin` остаётся host-only (без `Domain=`). Supabase Site URL / Redirect URLs / Google OAuth не менять: ERP на них не сидит.

## Allowlist нового хоста

- страницы `/erp`, `/erp/*`
- API `/api/erp`, `/api/erp/*`
- `/api/recipes-admin/login`, `/logout`, `/register`, `/session`
- `/_next/*`, favicon/icon и картинки/шрифты
- остальные **страницы** → 307 на тот же путь на `https://www.gastrotruck.org`
- остальные **API** → JSON 404/403, без HTML-редиректа

## Как вернуть старый ERP

1. На Vercel → проект `gastrobar` → Production: `ERP_REDIRECT_FROM_LEGACY=0` (или удалить переменную).
2. Если Edge уже заинлайнил флаг — Redeploy **того же** кода. Домен в Vercel и DNS не удалять.
3. Старый ERP снова на https://www.gastrotruck.org/erp ; старая cookie на этом хосте снова подходит.

Пока домен не назван: dual-run / редирект / закрытие API **не включать**.
