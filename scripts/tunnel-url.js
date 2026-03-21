/**
 * Печатает публичную ссылку ngrok в консоль (удобно скопировать).
 * Запускайте, когда ngrok уже запущен в другом окне: npm run tunnel
 * Требует: ngrok запущен на порту 3000.
 */
const http = require("http");

const opts = { hostname: "127.0.0.1", port: 4040, path: "/api/tunnels", method: "GET" };

const req = http.request(opts, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    try {
      const j = JSON.parse(data);
      const tunnel = j.tunnels?.find((t) => t.public_url?.startsWith("https://"));
      const url = tunnel?.public_url || null;
      if (url) {
        console.log("");
        console.log("  Публичная ссылка (скопируйте и отправьте):");
        console.log("");
        console.log("  " + url);
        console.log("");
      } else {
        console.error("  ngrok не запущен или туннель не найден. Сначала в другом терминале: npm run tunnel");
        process.exit(1);
      }
    } catch (e) {
      console.error("  Не удалось получить URL. Запущен ли ngrok? (npm run tunnel)");
      process.exit(1);
    }
  });
});

req.on("error", () => {
  console.error("  ngrok не запущен. В другом терминале выполните: npm run tunnel");
  process.exit(1);
});
req.end();
