# Сайт не открывается / пустой экран / Internal Server Error

## 1. Очистить кэш Next.js

**Internal Server Error**, **500**, ошибки вида `Cannot find module './611.js'` / `./112.js`, `ENOENT ... framer-motion.js`, `fallback-build-manifest.json` — **битая папка `.next`** (часто после прерванной сборки, удаления файлов при работающем `dev`, антивируса, двух терминалов с `npm run dev`).

1. **Останови** dev-сервер (Ctrl+C).
2. Выполни:

```bash
npm run clean
npm run dev
```

**Сейчас** при каждом `npm run dev` автоматически запускается очистка `.next` (`predev`) — так реже ломается кэш на Windows.

Быстрый перезапуск **без** удаления `.next` (только если уверен, что кэш целый):

```bash
# PowerShell
$env:NEXT_DEV_SKIP_CLEAN="1"; npm run dev
```

**Не удаляй** папку `.next` **вручную во время** работы `npm run dev` — получится битый кэш.

## 2. Туннель (ngrok, cloudflared)

Next.js 15 блокирует загрузку `/_next/*` с «чужих» доменов в dev.

Уже настроены `*.ngrok-free.dev` и др. Если **всё равно пусто**:

1. Создай файл `.env.local` в корне проекта.
2. Добавь свой домен **без** `https://`:

```env
ALLOWED_DEV_ORIGINS=твой-поддомен.ngrok-free.dev
```

3. Перезапусти `npm run dev`.

## 3. Проверка локально

Открой `http://localhost:3000` — если здесь всё ок, проблема в туннеле/сети (п. 2).
