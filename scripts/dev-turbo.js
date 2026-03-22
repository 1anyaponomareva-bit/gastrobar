/** Запуск dev с Turbopack (быстрее; на Windows при ENOENT используйте обычный npm run dev). */
process.env.NEXT_USE_TURBO = "1";
require("./dev-with-ip.js");
