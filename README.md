# GASTROBAR — меню сайта

Next.js 15 · React 19

## Локально

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Деплой на свой домен

Кратко: репозиторий на GitHub → Vercel → DNS у регистратора домена.

**Полная пошаговая инструкция:** [docs/DEPLOY.md](./docs/DEPLOY.md)

## Полезное

- Ошибки кэша Next (`Cannot find module './xxx.js'`): `npm run clean` → снова `npm run dev`
- Туннель / пустая страница в dev: см. `docs/TROUBLESHOOTING.md` и `.env.example`
