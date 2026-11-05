/**
 * Isolated receipt-form pack math (PGlite + Playwright headless Chrome).
 * Same layout as production DocumentEditor. Does not save/post. Not gastrotruck.org.
 *
 * Run: npx tsx scripts/erp/receipt-pack-ui-scenario.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, ".erp-receipt-ui-db");
const SHOT_DIR = path.join(ROOT, "docs", "erp-inventory-ui");
const SKIP_PORTS = new Set([3012]);

async function loadChromium() {
  const load = async () => {
    const mod = (await import("playwright")) as { chromium?: { launch: Function }; default?: { chromium?: { launch: Function } } };
    const chromium = mod.chromium ?? mod.default?.chromium;
    if (!chromium) throw new Error("playwright.chromium missing");
    return chromium;
  };
  try {
    return await load();
  } catch {
    const { execSync } = await import("node:child_process");
    execSync("npm install --no-save playwright", { stdio: "inherit", cwd: ROOT });
    return await load();
  }
}

function freePort(from = 3030): Promise<number> {
  const tryPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      if (SKIP_PORTS.has(port)) return void tryPort(port + 1).then(resolve, reject);
      const server = createServer();
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && port < from + 40) void tryPort(port + 1).then(resolve, reject);
        else reject(error);
      });
      server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
        server.close(() => resolve(port));
      });
    });
  return tryPort(from);
}

async function waitReady(child: ChildProcess, port: number) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("next dev did not start")), 120_000);
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      process.stdout.write(text);
      if (/ready|started server|local:/i.test(text)) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`next exited ${code}`));
    });
  });
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/api/erp/state`).catch(() => null);
    if (res?.ok || res?.status === 401) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("ERP state never answered");
}

async function api(base: string, url: string, init?: RequestInit) {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${response.status} ${String(data.error ?? "api")} ${url}`);
  return data;
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function main() {
  await rm(DB_DIR, { recursive: true, force: true });
  await mkdir(SHOT_DIR, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      ERP_LOCAL_DB: "pglite",
      ERP_LOCAL_DB_DIR: DB_DIR,
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitReady(child, port);
    const pack = await api(base, "/api/erp/action", {
      method: "POST",
      body: JSON.stringify({ action: "savePack", pack: { name: "1.284 KG", unit: "kg", qty_base: 1.284 } }),
    });
    const packId = String(pack.id);
    const product = await api(base, "/api/erp/action", {
      method: "POST",
      body: JSON.stringify({
        action: "saveProduct",
        product: {
          type: "ingredient",
          name_en: "Local flour 1284",
          name_vn: "Bột 1284",
          base_unit: "kg",
          packs: [{ pack_id: packId, label: "1.284 KG", qty_base: 1.284, is_default: true }],
        },
      }),
    });
    const productId = String(product.id);

    const chromium = await loadChromium();
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30_000);
    await page.goto(`${base}/erp/documents/new?type=receipt`);
    await page.getByRole("heading", { name: "Принять поставку" }).waitFor();
    await page.getByTestId("doc-add-line").click();
    await page.locator(".erpPickerSearch").fill("Local flour 1284");
    await page.locator(".erpPicker select").selectOption(productId);
    await page.getByTestId("doc-pack").selectOption(packId);
    await page.getByTestId("doc-pack-qty").locator("input").fill("3");
    await page.getByTestId("doc-pack-price").locator("input").fill("128400");
    await page.getByTestId("doc-pack-qty-base").waitFor();
    await page.getByTestId("doc-pack-price-hint").waitFor();
    const qty = (await page.getByTestId("doc-pack-qty-base").innerText()).replace(/\s/g, " ");
    const hint = (await page.getByTestId("doc-pack-price-hint").innerText()).replace(/\s/g, " ");
    const sum = (await page.getByTestId("doc-line-sum").innerText()).replace(/\s/g, " ");
    if (!/3[,.]852/.test(qty)) throw new Error(`qty display: ${qty}`);
    if (!/385.?200/.test(hint) && !/385200/.test(hint.replace(/\s/g, ""))) throw new Error(`sum hint: ${hint}`);
    if (!/100.?000/.test(hint) && !/100000/.test(hint.replace(/\s/g, ""))) throw new Error(`per-kg hint: ${hint}`);
    if (!/385.?200/.test(sum) && !/385200/.test(sum.replace(/\s/g, ""))) throw new Error(`line sum: ${sum}`);
    const shot = path.join(SHOT_DIR, "receipt-pack-1284.png");
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`screenshot ${shot}`);
    console.log(`qty=${qty} hint=${hint} sum=${sum}`);
    await browser.close();
    console.log("receipt pack UI scenario ok");
  } finally {
    killTree(child);
  }
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
