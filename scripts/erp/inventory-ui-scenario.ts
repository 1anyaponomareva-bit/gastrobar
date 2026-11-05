/**
 * Isolated inventory UI scenario (PGlite + Playwright headless Chrome).
 * Never talks to gastrotruck.org. Does not post on production.
 *
 * Run: npx tsx scripts/erp/inventory-ui-scenario.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, ".erp-ui-scenario-db");
const SHOT_DIR = path.join(ROOT, "docs", "erp-inventory-ui");
const SKIP_PORTS = new Set([3012]);

type Json = Record<string, unknown>;

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

function freePort(from = 3020): Promise<number> {
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

async function api(base: string, url: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) throw new Error(`${response.status} ${String(data.error ?? "api")} ${url}`);
  return data;
}

async function act(base: string, body: Json): Promise<Json> {
  return api(base, "/api/erp/action", { method: "POST", body: JSON.stringify(body) });
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
  const shots: string[] = [];
  try {
    await waitReady(child, port);
    const state = await api(base, "/api/erp/state");
    const warehouses = (state.warehouses as { id: string; code: string; name: string }[]) ?? [];
    const prep = warehouses.find((w) => w.code === "prep-kitchen") ?? warehouses[0];
    if (!prep) throw new Error("no warehouse");

    const milk = String((await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: "UI Milk", name_vn: "Sữa UI", base_unit: "kg" } })).id);
    const oil = String((await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: "UI Idle Oil", name_vn: "Dầu UI", base_unit: "l" } })).id);
    const sugar = String((await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: "UI Sugar", name_vn: "Đường UI", base_unit: "kg" } })).id);

    const milkDoc = await act(base, {
      action: "saveDocument",
      document: { doc_type: "receipt", warehouse_id: prep.id, lines: [{ product_id: milk, qty: 10, unit_price: 20000 }] },
    });
    await act(base, { action: "postDocument", id: milkDoc.id });
    const sugarDoc = await act(base, {
      action: "saveDocument",
      document: { doc_type: "receipt", warehouse_id: prep.id, lines: [{ product_id: sugar, qty: 8, unit_price: 15000 }] },
    });
    await act(base, { action: "postDocument", id: sugarDoc.id });
    const oilOpen = await act(base, {
      action: "saveDocument",
      document: { doc_type: "opening", warehouse_id: prep.id, lines: [{ product_id: oil, qty: 3, unit_price: 10000 }] },
    });
    await act(base, { action: "postDocument", id: oilOpen.id });
    const oilCount = await act(base, {
      action: "saveDocument",
      document: {
        doc_type: "count",
        count_kind: "partial",
        warehouse_id: prep.id,
        count_scope: { product_ids: [oil] },
        lines: [{ product_id: oil, qty: 3, counted: true }],
      },
    });
    await act(base, { action: "postDocument", id: oilCount.id });

    const chromium = await loadChromium();
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30_000);

    const shot = async (name: string) => {
      const file = path.join(SHOT_DIR, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
      console.log(`screenshot ${file}`);
    };

    const fillFact = async (productId: string, value: string) => {
      const box = page.getByTestId(`inventory-fact-${productId}`).locator("input").first();
      await box.click();
      await box.fill(value);
    };

    const createAndPost = async (opts: {
      name: string;
      mode: "full" | "partial";
      productId?: string;
      fact: Record<string, string>;
      expectNames: string[];
      forbidNames: string[];
    }) => {
      await page.goto(`${base}/erp/stock/counts/new`);
      await page.getByTestId("inventory-warehouse").locator("select").selectOption(prep.id);
      if (opts.mode === "partial") {
        await page.getByRole("button", { name: "Задним числом" }).click();
        const at = new Date(Date.now() + 5 * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, "0");
        const local = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
        await page.locator('input[type="datetime-local"]').fill(local);
      }
      await page.waitForTimeout(800);
      if (opts.mode === "partial") {
        await page.getByTestId("inventory-mode-partial").click();
        await page.locator(".erpInvScope").waitFor();
        await shot(`${opts.name}-form`);
        if (opts.productId) {
          const box = page.getByTestId(`inventory-product-${opts.productId}`).locator("input");
          if (!(await box.count())) {
            const preview = await api(base, "/api/erp/counts", {
              method: "POST",
              body: JSON.stringify({ action: "preview", preview: { warehouse_id: prep.id, count_kind: "full" } }),
            });
            console.log("preview lines", JSON.stringify((preview.preview as Json)?.lines ?? preview.lines));
            throw new Error(`${opts.name}: product ${opts.productId} not in picker; page=${(await page.locator(".erpInvScope").innerText()).slice(0, 500)}`);
          }
          await box.check({ force: true });
        }
      } else {
        await page.getByTestId("inventory-mode-full").click();
        await shot(`${opts.name}-form`);
      }
      await page.getByTestId("inventory-create").click();
      await page.waitForURL(/\/erp\/stock\/counts\/[0-9a-f-]{36}/, { timeout: 30_000 });
      await page.waitForSelector('[data-testid="inventory-lines"]');
      const body = await page.locator('[data-testid="inventory-lines"]').innerText();
      for (const name of opts.expectNames) {
        if (!body.includes(name)) throw new Error(`${opts.name}: expected ${name} in lines`);
      }
      for (const name of opts.forbidNames) {
        if (body.includes(name)) throw new Error(`${opts.name}: idle ${name} should not be in the adjustment`);
      }
      for (const [productId, value] of Object.entries(opts.fact)) await fillFact(productId, value);
      await shot(`${opts.name}-fact`);
      await page.getByTestId("inventory-save-draft").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="inventory-save-state"]')?.textContent?.includes("Сохранено"));
      const url = page.url();
      const id = url.split("/").pop()!;
      await page.goto(`${base}/erp/stock/counts`);
      await shot(`${opts.name}-list`);
      await page.goto(url);
      await page.waitForSelector('[data-testid="inventory-lines"]');
      for (const [productId, value] of Object.entries(opts.fact)) {
        const shown = await page.getByTestId(`inventory-fact-${productId}`).locator("input").inputValue();
        if (shown !== value) throw new Error(`${opts.name}: fact ${productId} expected ${value}, got ${shown}`);
      }
      await shot(`${opts.name}-reopen`);
      await page.getByTestId("inventory-post").click();
      try {
        await page.waitForFunction(() => /Проведён|Posted|Đã ghi sổ/.test(document.body.innerText), null, { timeout: 20_000 });
      } catch (error) {
        await shot(`${opts.name}-post-failed`);
        throw new Error(`${opts.name}: post failed: ${(await page.locator(".erpNotice, .erpInvCount").innerText()).slice(0, 400)}`);
      }
      await shot(`${opts.name}-posted`);
      const posted = await api(base, `/api/erp/counts?id=${id}`);
      const count = posted.count as { status: string; lines: { product_id: string; qty: number }[] };
      if (count.status !== "posted") throw new Error(`${opts.name}: status ${count.status}`);
      return { id, count };
    };

    const full = await createAndPost({
      name: "full",
      mode: "full",
      fact: { [milk]: "9", [sugar]: "8" },
      expectNames: ["UI Milk", "UI Sugar"],
      forbidNames: ["UI Idle Oil"],
    });
    const stockAfterFull = ((await api(base, "/api/erp/state?parts=stock")).stock as { product_id: string; warehouse_id: string; qty: number }[]) ?? [];
    const qty = (productId: string) =>
      stockAfterFull.find((row) => row.product_id === productId && row.warehouse_id === prep.id)?.qty ?? 0;
    if (qty(milk) !== 9) throw new Error(`full milk stock ${qty(milk)}`);
    if (qty(oil) !== 3) throw new Error(`full idle oil should stay 3, got ${qty(oil)}`);
    if (qty(sugar) !== 8) throw new Error(`full sugar stock ${qty(sugar)}`);

    const extraSugar = await act(base, {
      action: "saveDocument",
      document: {
        doc_type: "receipt",
        warehouse_id: prep.id,
        occurred_at: new Date().toISOString(),
        lines: [{ product_id: sugar, qty: 2, unit_price: 15000 }],
      },
    });
    await act(base, { action: "postDocument", id: extraSugar.id });

    const partial = await createAndPost({
      name: "partial",
      mode: "partial",
      productId: sugar,
      fact: { [sugar]: "9" },
      expectNames: ["UI Sugar"],
      forbidNames: ["UI Milk", "UI Idle Oil"],
    });
    const stockAfterPartial = ((await api(base, "/api/erp/state?parts=stock")).stock as { product_id: string; warehouse_id: string; qty: number }[]) ?? [];
    const qty2 = (productId: string) =>
      stockAfterPartial.find((row) => row.product_id === productId && row.warehouse_id === prep.id)?.qty ?? 0;
    if (qty2(sugar) !== 9) throw new Error(`partial sugar stock ${qty2(sugar)}`);
    if (qty2(milk) !== 9) throw new Error(`partial must not change milk, got ${qty2(milk)}`);
    if (qty2(oil) !== 3) throw new Error(`partial must not change idle oil, got ${qty2(oil)}`);

    const raceProduct = String(
      (await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: "UI Race", base_unit: "kg" } })).id,
    );
    const raceReceipt = await act(base, {
      action: "saveDocument",
      document: { doc_type: "receipt", warehouse_id: prep.id, lines: [{ product_id: raceProduct, qty: 10, unit_price: 1000 }] },
    });
    await act(base, { action: "postDocument", id: raceReceipt.id });
    const raceDraft = await act(base, {
      action: "saveDocument",
      document: {
        doc_type: "count",
        count_kind: "partial",
        warehouse_id: prep.id,
        count_scope: { product_ids: [raceProduct] },
        lines: [{ product_id: raceProduct, qty: 7, counted: true }],
      },
    });
    const raceId = String(raceDraft.id);
    const [one, two] = await Promise.all([
      fetch(`${base}/api/erp/counts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "post", id: raceId }) }),
      fetch(`${base}/api/erp/counts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "post", id: raceId }) }),
    ]);
    const bodies = [await one.json(), await two.json()] as Json[];
    const statuses = [one.status, two.status];
    console.log("concurrent post statuses", statuses, bodies.map((b) => ({ error: b.error, idempotent: (b.result as Json | undefined)?.idempotent ?? (b as Json).idempotent })));
    if (statuses.filter((s) => s === 200).length < 1) throw new Error("concurrent post: no success");
    const stockRace = ((await api(base, "/api/erp/state?parts=stock")).stock as { product_id: string; warehouse_id: string; qty: number }[]) ?? [];
    const raceQty = stockRace.find((row) => row.product_id === raceProduct && row.warehouse_id === prep.id)?.qty ?? 0;
    if (raceQty !== 7) throw new Error(`concurrent post doubled consume: stock ${raceQty}`);

    await browser.close();
    await writeFile(
      path.join(SHOT_DIR, "README.md"),
      [
        "# Isolated inventory UI scenario",
        "",
        `PGlite + Playwright headless Chrome. Port ${port}. Not production.`,
        "",
        `- Full count ${full.id}: milk 9, sugar 8; idle oil stayed 3.`,
        `- Partial count ${partial.id}: sugar 9; milk 9; oil 3.`,
        `- Concurrent POST of one count: one consume, stock 7.`,
        "",
        ...shots.map((file) => `- \`${path.relative(ROOT, file).replace(/\\/g, "/")}\``),
        "",
      ].join("\n"),
    );
    console.log("inventory UI scenario ok");
  } finally {
    killTree(child);
  }
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
