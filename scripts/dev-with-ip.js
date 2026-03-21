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
const port = Number(process.env.PORT) || 3000;

(async function main() {
  const free = await isPortFree(port);
  if (!free) {
    console.error("");
    console.error("  ✗ Порт " + port + " уже занят.");
    console.error("    Остановите старый npm run dev (Ctrl+C в том терминале) или задайте другой порт:");
    console.error('    $env:PORT="3001"; npm run dev');
    console.error("");
    process.exit(1);
  }

  console.log("");
  console.log("  ✓ Доступ с телефона/планшета:");
  console.log("     http://" + ip + ":" + port);
  console.log("");

  /** Turbopack в dev реже ломается на «Cannot find module ./xxx.js» в .next; отключить: NEXT_NO_TURBO=1 */
  const useTurbo = process.env.NEXT_NO_TURBO !== "1";
  const nextArgs = ["next", "dev", "--hostname", "0.0.0.0", "--port", String(port)];
  if (useTurbo) nextArgs.splice(2, 0, "--turbo");

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
