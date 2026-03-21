# Выкладка на GitHub и свой домен

Репозиторий: `https://github.com/1anyaponomareva-bit/gastrobar`

## 1. Залить код в GitHub (один раз)

В папке проекта (где лежит `package.json`):

```bash
git init
git add .
git commit -m "Initial commit: gastrobar site"
git branch -M main
git remote add origin https://github.com/1anyaponomareva-bit/gastrobar.git
git push -u origin main
```

Если репозиторий на GitHub уже создан **только с README** (как в инструкции GitHub), при первом `push` может понадобиться:

```bash
git pull origin main --rebase
git push -u origin main
```

Или форс (осторожно, перезапишет удалённую историю):

```bash
git push -u origin main --force
```

**Не коммить:** `.env`, `.env.local` — они в `.gitignore`. Секреты задавай в панели хостинга (Vercel → Environment Variables).

---

## 2. Хостинг: Vercel (рекомендуется для Next.js)

1. Зайди на [vercel.com](https://vercel.com) → войди через GitHub.
2. **Add New Project** → импортируй `1anyaponomareva-bit/gastrobar`.
3. Настройки по умолчанию:
   - **Framework Preset:** Next.js  
   - **Build Command:** `npm run build`  
   - **Output:** (оставь пустым — Vercel сам подхватит)  
4. Нажми **Deploy**.

После сборки сайт будет на адресе вида `gastrobar-xxx.vercel.app`.

---

## 3. Подключить свой домен

### В Vercel

1. Проект → **Settings** → **Domains**.
2. Добавь домен, например `gastrobar.ru` и при желании `www.gastrobar.ru`.
3. Vercel покажет, какие **DNS-записи** добавить.

### У регистратора домена (REG.RU, Timeweb, Cloudflare и т.д.)

Обычно один из вариантов:

**Вариант A — поддомен у Vercel (часто проще)**  
- Тип **CNAME**: имя `@` или `www` → значение `cname.vercel-dns.com` (точное значение смотри в Vercel).

**Вариант A — корень домена (apex)**  
- Записи **A** на IP, которые даёт Vercel (в интерфейсе указаны явно).

DNS может обновляться **от нескольких минут до 48 часов**.

SSL-сертификат (HTTPS) Vercel выдаст автоматически после того, как домен подтвердится.

---

## 4. Переменные окружения (если появятся)

Если позже понадобятся секреты (аналитика, ключи API):

**Vercel** → Project → **Settings** → **Environment Variables** → добавить пары `NAME=value` для Production (и при необходимости Preview).

Пересобери деплой (**Redeploy**).

---

## 5. Альтернативы

- **Netlify**, **Cloudflare Pages** — тоже умеют Next.js, настройки похожи (сборка `npm run build`, иногда нужен адаптер).
- **VPS** — `npm run build` + `npm run start` за reverse proxy (nginx), нужен Node на сервере.

Для большинства случаев **GitHub + Vercel + DNS** — самый простой путь.
