/**
 * Публичная ссылка через Cloudflare (trycloudflare.com).
 * Требует установленный cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
 *
 * Важно: порт должен совпадать с тем, где запущен `npm run dev`
 * (смотрите в консоли dev после «Локально в браузере: http://localhost:XXXX»).
 *
 * Пример, если dev на 3001:
 *   $env:PORT="3001"; npm run tunnel:cf
 */
const { spawn } = require("child_process");

const port = process.env.PORT || "3000";
const url = `http://127.0.0.1:${port}`;

console.log("");
console.log("  Cloudflare Tunnel → " + url);
console.log("  Должен быть запущен Next.js на этом же порту (npm run dev).");
console.log("");

const child = spawn("cloudflared", ["tunnel", "--url", url], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("");
    console.error("  ✗ cloudflared не найден в PATH.");
    console.error("    Установка: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/");
    console.error("    Windows (winget): winget install Cloudflare.cloudflared");
    console.error("");
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
