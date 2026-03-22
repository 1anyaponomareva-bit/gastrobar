const { networkInterfaces } = require("os");
const { spawn } = require("child_process");
const net = require("net");

/** Не даём запустить второй dev на том же порту — иначе старый процесс с битым .next даёт 500, а новый падает с EADDRINUSE. */
function isPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(false);
      else reject(err);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host: "0.0.0.0", exclusive: true });
  });
}

function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const ip = getLocalIp();
const startPort = Number(process.env.PORT) || 3000;
const PORT_RANGE = 25;

/**
 * Если порт занят (второй терминал, другой процесс) — берём следующий свободный,
 * чтобы `npm run dev` не падал с EADDRINUSE.
 */
async function pickFreePort() {
  const end = startPort + PORT_RANGE;
  for (let p = startPort; p <= end; p++) {
    if (await isPortFree(p)) {
      if (p !== startPort) {
        console.log("");
        console.log(
          "  ℹ Порт " + startPort + " занят — запуск на " + p + " (закройте лишний dev или задайте PORT)."
        );
        console.log("");
      }
      return p;
    }
  }
  console.error("");
  console.error(
    "  ✗ Нет свободного порта в диапазоне " + startPort + "–" + end + "."
  );
  console.error("    Остановите лишние процессы node (старый npm run dev) или задайте PORT.");
  console.error("");
  process.exit(1);
}

(async function main() {
  const port = await pickFreePort();

  console.log("");
  console.log("  ✓ Локально в браузере:");
  console.log("     http://localhost:" + port);
  console.log("");
  console.log("  ✓ С телефона/планшета (одна Wi‑Fi сеть с ПК):");
  console.log("     http://" + ip + ":" + port);
  console.log("");
  console.log("  Если страница пустая: брандмауэр Windows может блокировать порт " + port + ".");
  console.log('  PowerShell от администратора: New-NetFirewallRule -DisplayName "Next dev ' + port + '" -Direction Inbound -LocalPort ' + port + " -Protocol TCP -Action Allow");
  console.log("");
  console.log("  Cloudflare Tunnel (trycloudflare.com) — в другом терминале тот же порт:");
  console.log("    cloudflared tunnel --url http://127.0.0.1:" + port);
  console.log("  или:  $env:PORT=\"" + port + '\"; npm run tunnel:cf');
  console.log("");

  /**
   * По умолчанию без Turbopack: на Windows он часто даёт ENOENT / 500 при параллельных
   * запросах (телефон + ПК) и битые manifest в .next.
   * Включить Turbopack (быстрее холодный старт): NEXT_USE_TURBO=1
   * Старый флаг NEXT_NO_TURBO=1 по смыслу совпадает с режимом по умолчанию.
   */
  const useTurbo =
    process.env.NEXT_USE_TURBO === "1" && process.env.NEXT_NO_TURBO !== "1";
  const nextArgs = ["next", "dev", "--hostname", "0.0.0.0", "--port", String(port)];
  if (useTurbo) nextArgs.splice(2, 0, "--turbo");

  if (!useTurbo) {
    console.log("  ℹ Dev на Webpack (стабильнее). Turbopack: NEXT_USE_TURBO=1 npm run dev");
    console.log("");
  }

  const child = spawn("npx", nextArgs, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  child.on("exit", (code) => process.exit(code ?? 0));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
